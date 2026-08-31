/**
 * AU27 Increment 8 — the live proof.
 *
 * A real-harness test that an assistant turn's reply reaches the calling
 * thread through the agent's OWN `reply` tool call — not an orchestration-
 * side write. Per harness (claude-code / codex / opencode / cursor-agent),
 * `requireHarness(...)`, zero stubs, hard-fail if absent — never `skipIf` to
 * green (CLAUDE.md, testing.md).
 *
 * @lore The model each lane runs is seeded onto the agent's own run config, the
 * same place production puts it, and reaches the harness as
 * `SessionConfig.selectedModel`. There is no override to supply and no seam to
 * go through: `runSession` used to take a `resolvedModel`, and this file passed
 * one from `harnessTestResolvedModel` specifically to avoid handing a harness a
 * credential it did not want — codex's config forwarded `resolvedModel.apiKey`
 * as `OPENAI_API_KEY`, which would shadow the ChatGPT login it actually uses.
 * No key travels to a harness at all now, so the hazard and the seam that
 * dodged it are both gone.
 *
 * The rest of the path is 100% production: `POST /threads/:id/messages`
 * bakes the real `assistant_turn` intent (`resolveAssistantTurnRequest`),
 * `drainIntents` produces the real `agentSessionRequests` row (the same
 * durable-queue drain `startRuntime`'s poller calls every second — invoked
 * once here instead of on a timer), and `runSession(...)` is the exact
 * `admitSession`/`runSession` pair the poller calls — real adapter, real
 * sandbox, real MCP bridge, real `reply` tool call reaching the real
 * `CoreApiPort` seam.
 */

import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { serve } from "@hono/node-server";
import {
	buildRunOrchestrationComposition,
	createInProcessCoreApiTransport,
	type RunOrchestrationHarnessRuntimeAdapter,
} from "@hyperidle/agent-orchestration";
import {
	registerSessionNotReturnedNotice,
	SESSION_NOT_RETURNED_NOTICE_TEXT,
} from "@hyperidle/conversation";
import {
	type AgentSessionRequest,
	agentRunConfig,
	agentSessionRequests,
	agentWorkIntents,
	type HyperIdleDb,
	messages,
	threads,
	users,
} from "@hyperidle/db";
import { test as dbTest } from "@hyperidle/db/test-fixtures";
import { EventBus } from "@hyperidle/event-bus";
import {
	createLocalAdapterPool,
	createReturnEnforcement,
	createSandboxAdapter,
	provisionHarnessEnvironment,
	writePluginStdioMcpEntries,
} from "@hyperidle/harness-registry";
import {
	createMcpToolBridge,
	type McpToolBridge,
	returnStatusTool,
} from "@hyperidle/harness-registry/mcp";
import {
	HARNESS_TEST_MODELS,
	requireHarness,
	type SupportedHarnessName,
} from "@hyperidle/harness-registry/test-utils";
import { drainIntents } from "@hyperidle/session-requests";
import { eq } from "drizzle-orm";
import type { Hono } from "hono";
import { afterEach, beforeEach, describe, expect } from "vitest";
import { queueDeps } from "../__testing__/durable-agent-queue-test-deps.js";
import { createTestApp } from "../__testing__/test-utils.js";

/**
 * @lore AU31 §2.1(b)/§3.2/§5: `runSession`/`registerCoreApiTransport` are no
 * longer module-level singletons. This harness-lane test dials a REAL,
 * mounted MCP bridge (unlike the throwaway-adapter test compositions
 * elsewhere), so it builds its OWN `harnessRuntime` adapter wired to the
 * SAME `mcpBridgeRegistry`/server URL `startLiveServer` mounts — the exact
 * `openMcpBridgeSession`/`bridge.close` pieces `bootAgentExecution`
 * wires production-side, aimed at this test's own bridge instance.
 */
function buildLiveHarnessRuntimeAdapter(
	mcpBridgeRegistry: McpToolBridge,
	mcpBaseUrl: string,
): RunOrchestrationHarnessRuntimeAdapter {
	const enforcementRegistry = createReturnEnforcement();
	return {
		enforcementRegistry,
		createReturnGate: (requiredReturnActions) =>
			enforcementRegistry.createGate(requiredReturnActions),
		evaluateReturn: (gate, endReason) => enforcementRegistry.evaluate(gate, endReason),
		provisionReturnHook: async (options) => {
			await provisionHarnessEnvironment({ ...options, token: options.bridgeToken });
		},
		provisionActionGate: async () => {
			// Live harness test: no action gate — sessions run ungated.
		},
		writeCliMcpConfig: (options) => provisionHarnessEnvironment(options),
		writePluginStdioMcpEntries: (params) => writePluginStdioMcpEntries(params),
		openMcpBridge: async (session) => {
			// This bridge was created before the server URL was known, so the
			// URL is constructed here rather than at bridge-creation time.
			const { token } = await mcpBridgeRegistry.open({
				sessionId: session.sessionId,
				registry: session.toolRegistry,
				onToolCall: session.onToolCall,
			});
			return { token, url: `${mcpBaseUrl}/api/mcp/${token}` };
		},
		closeMcpBridge: (token) => mcpBridgeRegistry.close(token),
		releaseActionGate: () => undefined,
	};
}

const NOW = "2026-08-04T00:00:00.000Z";
const TEST_API_KEY = "au27-inc8-live-harness-key";

/** Test-vocabulary harness name -> the exact `users.harness_type` the adapter pool registers under. */
const HARNESS_TYPE: Partial<Record<SupportedHarnessName, string>> = {
	claude: "claude-code",
	codex: "codex",
	opencode: "opencode",
	"cursor-agent": "cursor-agent",
};

interface LiveServer {
	readonly url: string;
	readonly db: HyperIdleDb;
	readonly eventBus: EventBus;
	/** The SAME bridge instance mounted on this server's MCP route — `runSession`'s
	 * deps must reuse this exact instance so the session token it registers is the
	 * one the mounted route can resolve. */
	readonly mcpBridgeRegistry: McpToolBridge;
	/** The seam's transport, bound to this server's own composed app (§3.2) — the `reply` tool call's real door to `POST /threads/:id/messages`. */
	readonly coreApiTransport: ReturnType<typeof createInProcessCoreApiTransport>;
	readonly close: () => Promise<void>;
}

/**
 * A bare `createTestApp` (real DB + real routes + real MCP route) with NO
 * `startRuntime` poller wired — this test drains the intent and calls
 * `runSession` itself, exactly once, with a test-controlled `resolvedModel`.
 * Started as a REAL listening HTTP server (not `app.fetch` in-process) because
 * the spawned CLI harness subprocess makes real HTTP calls to the MCP bridge.
 */
async function startLiveServer(db: HyperIdleDb): Promise<LiveServer> {
	const eventBus = new EventBus();
	const mcpBridgeRegistry = createMcpToolBridge({ enforcement: createReturnEnforcement() });
	// @lore AU26 B1b: the Layer no longer takes a `registerMcpRoute` option —
	// mounting is an Application decision. `createTestApp` IS the test harness
	// Application, and its `registerPreAuthRoutes` hook mounts the bridge at the
	// same point production does: after both Layers' pre-auth routes, before
	// auth (an MCP client authenticates by session token in the URL).
	const app: Hono = await createTestApp({
		db,
		eventBus,
		registerPreAuthRoutes: (apiRouter) => {
			apiRouter.route("/", mcpBridgeRegistry.router);
		},
	});
	const coreApiTransport = createInProcessCoreApiTransport(app);

	let resolvePort!: (port: number) => void;
	const portPromise = new Promise<number>((resolve) => {
		resolvePort = resolve;
	});
	const httpServer = serve({ fetch: app.fetch, port: 0 }, (info) => resolvePort(info.port));
	const port = await portPromise;

	// Mirrors production composition (`server-factory.ts`'s registration
	// list) — the never-silent net (Increment 5) posts a fixed notice
	// message, authored as the SAME assistant agent, when a turn ends
	// without returning. `createTestApp` alone (unlike `createServer`) does not
	// wire this reaction; wiring it here so the sanity-break below is
	// against the real subscriber, not an absent one that would make the
	// break meaningless.
	registerSessionNotReturnedNotice(db, eventBus);

	return {
		url: `http://127.0.0.1:${port}`,
		db,
		eventBus,
		mcpBridgeRegistry,
		coreApiTransport,
		close: () =>
			new Promise<void>((resolve, reject) => {
				httpServer.close((err) => (err ? reject(err) : resolve()));
			}),
	};
}

async function seedFounderAndAssistant(
	db: HyperIdleDb,
	opts: {
		readonly founderId: string;
		readonly threadId: string;
		readonly harnessType: string;
		readonly modelId: string;
	},
): Promise<{ readonly assistantId: string }> {
	const assistantId = `ast-${opts.founderId}`;
	await db.insert(users).values({
		id: opts.founderId,
		kind: "human",
		name: "Live Harness Founder",
		role: "founder",
		status: "active",
		createdAt: NOW,
	});
	await db.insert(users).values({
		id: assistantId,
		kind: "ai",
		name: "Assistant",
		role: "assistant",
		agentCategory: "individual",
		status: "active",
		createdAt: NOW,
	});
	// @lore AU26 G1: `harnessType` is the adapter-pool selector and is
	// LOAD-BEARING for this test's per-harness lanes. It lives in
	// `agent_run_config` now — an agent-orchestration-owned table the drain
	// reads live — not on the `users` identity row.
	await db.insert(agentRunConfig).values({
		agentUserId: assistantId,
		harnessType: opts.harnessType,
		modelId: opts.modelId,
		maxConcurrentSessions: 1,
	});
	await db.insert(threads).values({
		id: opts.threadId,
		hostKind: "user",
		hostId: opts.founderId,
		initiatorId: opts.founderId,
		participants: JSON.stringify([opts.founderId, assistantId]),
		pinned: false,
		lastActiveAt: NOW,
		createdAt: NOW,
	});
	return { assistantId };
}

/**
 * Posts the trigger message (real HTTP, real route, real bake), drains the
 * real intent into a real `agentSessionRequests` row (the same drain
 * `startRuntime`'s poller calls on a timer — invoked once here), and returns
 * that claimable row.
 */
async function postAndDrainAssistantRequest(
	server: LiveServer,
	opts: { readonly threadId: string; readonly text: string },
): Promise<AgentSessionRequest> {
	const res = await fetch(`${server.url}/api/threads/${opts.threadId}/messages`, {
		method: "POST",
		headers: { "Content-Type": "application/json", "X-API-Key": TEST_API_KEY },
		body: JSON.stringify({
			type: "plain",
			payload: { text: opts.text },
			clientKey: `live-harness-${Math.random().toString(36).slice(2)}`,
		}),
	});
	if (res.status !== 201 && res.status !== 200) {
		throw new Error(`POST /threads/:id/messages failed: ${res.status} ${await res.text()}`);
	}
	const body = (await res.json()) as { message: { id: string } };
	const messageId = body.message.id;

	const [intent] = await server.db
		.select()
		.from(agentWorkIntents)
		.where(eq(agentWorkIntents.sourceId, messageId));
	if (!intent) {
		throw new Error(`No agent_work_intents row recorded for message ${messageId}`);
	}

	await drainIntents({ ...queueDeps(server.db), eventBus: server.eventBus });

	const [request] = await server.db
		.select()
		.from(agentSessionRequests)
		.where(eq(agentSessionRequests.sourceId, messageId));
	if (!request) {
		throw new Error(`drainIntents did not produce an agent_session_requests row for ${messageId}`);
	}
	return request;
}

describe("the assistant reply reaches the calling thread via a real harness's own reply tool call", () => {
	let sandboxBasePath: string;

	beforeEach(() => {
		process.env.HYPERIDLE_API_KEY = TEST_API_KEY;
		sandboxBasePath = fs.mkdtempSync(path.join(os.tmpdir(), "au27-inc8-"));
		// Codex's `--sandbox workspace-write` requires the cwd to be inside a git
		// repo. Harmless for the other three harnesses (they never inspect it).
		execFileSync("git", ["init"], { cwd: sandboxBasePath, stdio: "ignore" });
		execFileSync("git", ["commit", "--allow-empty", "-m", "init"], {
			cwd: sandboxBasePath,
			stdio: "ignore",
			env: {
				...process.env,
				GIT_AUTHOR_NAME: "au27",
				GIT_AUTHOR_EMAIL: "au27@test",
				GIT_COMMITTER_NAME: "au27",
				GIT_COMMITTER_EMAIL: "au27@test",
			},
		});
	});

	afterEach(() => {
		fs.rmSync(sandboxBasePath, { recursive: true, force: true });
		delete process.env.HYPERIDLE_API_KEY;
	});

	const PROMPT = "Reply with exactly: HARNESS_REPLY_OK";

	/**
	 * Shared proof body — every harness runs the identical real path. Each
	 * caller below wraps this in its OWN `describe` with a LITERAL
	 * `requireHarness("<name>")` call, one per harness.
	 *
	 * @lore AU28: the literal-argument convention was originally forced by
	 * `scripts/honest-harness-guard.ts`, whose static scan could only read a
	 * string literal. Ruling 10 deleted that guard, so nothing enforces the
	 * convention any more — keep it anyway. It is what makes the per-harness
	 * lanes greppable, which matters more now than it did: the attestation floor
	 * that counted executions per harness is also gone, so reading the file is
	 * the only way to see the breadth. Do not collapse these into a loop.
	 */
	async function runReplyProof(harness: SupportedHarnessName, db: HyperIdleDb): Promise<void> {
		const founderId = `founder-inc8-${harness}`;
		const threadId = `thread-inc8-${harness}`;
		const harnessType = HARNESS_TYPE[harness];
		if (!harnessType) throw new Error(`no harnessType mapping for ${harness}`);

		const { assistantId } = await seedFounderAndAssistant(db, {
			founderId,
			threadId,
			harnessType,
			// The locked test model, seeded where production puts it — on the
			// agent's own run config. It reaches the harness as `selectedModel`.
			modelId: HARNESS_TEST_MODELS[harness].model,
		});

		const server = await startLiveServer(db);
		try {
			const request = await postAndDrainAssistantRequest(server, {
				threadId,
				text: PROMPT,
			});

			const adapterPool = await createLocalAdapterPool();
			const workspace = createSandboxAdapter("local");
			// Reuses the SAME mcpBridgeRegistry instance mounted on the live
			// server's MCP route (`startLiveServer`) — a fresh, disconnected
			// instance here would register the session token nowhere the
			// mounted route could ever resolve it.
			const deps = {
				db: server.db,
				eventBus: server.eventBus,
				adapterPool,
				workspace,
				mcpBridgeRegistry: server.mcpBridgeRegistry,
				mcpBaseUrl: server.url,
			};

			const composition = buildRunOrchestrationComposition({
				harnessRuntime: buildLiveHarnessRuntimeAdapter(server.mcpBridgeRegistry, server.url),
				returnStatusTool: { forRegistry: (registry) => returnStatusTool.forRegistry(registry) },
				coreApiTransport: server.coreApiTransport,
			});
			const result = await composition.runSession(deps, {
				mode: "durable",
				request,
				sandboxBasePath,
				completion: "await",
			});

			expect(result.mode).toBe("completed");
			if (result.mode !== "completed") return;
			expect(result.outcome).toBe("completed");

			const replies = await server.db
				.select()
				.from(messages)
				.where(eq(messages.threadId, threadId));
			const assistantReply = replies.find((m) => m.senderId === assistantId);
			expect(assistantReply, `no reply message from ${assistantId} on ${harness}`).toBeDefined();

			// AU27 Increment 8 (BLOCKER fix): a message merely EXISTING from
			// assistantId is not proof of a real reply — Increment 5's
			// never-silent notice ("I couldn't finish that turn...") is ALSO
			// authored as `event.agentId` (the assistant), so a session that
			// FAILED to reply and instead got caught by the never-silent net
			// satisfies the old, weaker assertion. Assert the actual reply
			// TEXT, and explicitly rule out the notice.
			const payload = JSON.parse(assistantReply?.payload ?? "{}") as { text?: string };
			expect(
				payload.text,
				`assistant reply on ${harness} had no text payload: ${JSON.stringify(assistantReply)}`,
			).toBeDefined();
			expect(
				payload.text,
				`assistant reply on ${harness} was the never-silent notice, not a real reply — the agent never called reply()`,
			).not.toBe(SESSION_NOT_RETURNED_NOTICE_TEXT);
			expect(
				payload.text,
				`assistant reply on ${harness} did not contain the required text: ${payload.text}`,
			).toContain("HARNESS_REPLY_OK");
		} finally {
			await server.close();
		}
	}

	// @lore The `[harness:builtin]` lane is gone with the harness it drove. The
	// property it proved — an assistant turn ends with a real `reply()` landing in
	// the calling thread — is proven on every harness that remains.

	describe("[harness:claude]", () => {
		requireHarness("claude");
		dbTest(
			"an assistant turn on claude-code ends with a real reply() call landing in the calling thread",
			async ({ db }) => runReplyProof("claude", db),
			180_000,
		);
	});

	describe("[harness:codex]", () => {
		requireHarness("codex");
		dbTest(
			"an assistant turn on codex ends with a real reply() call landing in the calling thread",
			async ({ db }) => runReplyProof("codex", db),
			180_000,
		);
	});

	describe("[harness:opencode]", () => {
		requireHarness("opencode");
		dbTest(
			"an assistant turn on opencode ends with a real reply() call landing in the calling thread",
			async ({ db }) => runReplyProof("opencode", db),
			180_000,
		);
	});

	describe("[harness:cursor-agent]", () => {
		requireHarness("cursor-agent");
		dbTest(
			"an assistant turn on cursor-agent ends with a real reply() call landing in the calling thread",
			async ({ db }) => runReplyProof("cursor-agent", db),
			180_000,
		);
	});
});
