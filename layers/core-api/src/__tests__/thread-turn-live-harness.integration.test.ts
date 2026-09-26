/**
 * @lore The live-harness proof for the thread turn: a human `send_message`
 * into a two-member direct thread with an agent wakes that agent for real,
 * and the agent's own real `send_message` tool call is the only way its
 * turn ends.
 *
 * Restores the AU27 Increment 8 proof that a prior commit (576d3f28d) deleted
 * without a replacement — `assistant-reply-live-harness.integration.test.ts`,
 * whose subject (the assistant's reply reaching its calling thread through
 * its own `reply` tool call) survives under the thread module's shape: there
 * is no assistant thread, no `reply` tool — a human's `send_message` with
 * `recipients:[agentId]` opens a direct thread and enqueues a `thread_turn`
 * work intent (`thread-actions.ts`'s wake block); the real
 * harness runs; the agent answers by calling `send_message` itself (the only
 * return action a task-free, thread-calling session may satisfy —
 * `provisioner.ts`'s `requiredReturnActions`, `framework/harness-protocol/
 * src/harness/return-actions.ts`).
 *
 * Per harness (claude / codex / opencode / cursor-agent), `requireHarness(...)`,
 * zero stubs, hard-fail if absent — never `skipIf` to green (CLAUDE.md,
 * testing.md).
 *
 * @lore This file builds its own minimal composition rather than reusing
 * `createTestApp`: `layers/core-api` may not import `@hyperidle/agent-
 * execution` (not a declared dependency — that boot is an Application's
 * job), and `bootCoreApi`'s own composed `actionTools` are "read exactly
 * once" (`app.ts`'s `takeAppActionTools`), so a caller that already went
 * through `createTestApp` cannot recover them afterwards. Building the
 * action list directly with `buildCoreActions` (the same real recorders
 * `thread-actions.integration.test.ts`'s `buildRealActions` wires) sidesteps
 * both: one call gets a real, runnable action list AND its MCP tool
 * projection (`actionsAsTools`), fed straight into
 * `buildRunOrchestrationComposition({ actionTools })`. The human's
 * `send_message` and the read-back `open_thread` call `action.run()`
 * directly (the exact door `actionsAsTools`'s MCP loop calls in-process,
 * architecture.md §3.2's "no `caller`" HTTP-equivalent shape) — the brief's
 * two doors, `POST /api/actions/send_message` or `action.run`, are
 * interchangeable, and this is the smaller one. Only the MCP bridge the real
 * spawned CLI binary curls over the network needs an actual listening
 * server.
 */

import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as net from "node:net";
import * as os from "node:os";
import * as path from "node:path";
import { serve } from "@hono/node-server";
import {
	bootAgentOrchestration,
	buildRunOrchestrationComposition,
	type RunOrchestrationHarnessRuntimeAdapter,
} from "@hyperidle/agent-orchestration";
import type { AgentOrchestrationTransport } from "@hyperidle/api-contract";
import {
	type AgentSessionRequest,
	agentRunConfig,
	agentSessionRequests,
	agentWorkIntents,
	type HyperIdleDb,
	users,
} from "@hyperidle/db";
import { test as dbTest } from "@hyperidle/db/test-fixtures";
import type {
	ActionResult,
	OpenThreadInput,
	SendMessageInput,
	SendMessageOutput,
	ThreadView,
} from "@hyperidle/domain-model";
import type { HyperIdleEnv } from "@hyperidle/domain-model/http";
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
	stopAllLiveHarnessSessions,
} from "@hyperidle/harness-registry/test-utils";
import { findSessionById } from "@hyperidle/run-orchestration";
import { drainIntents } from "@hyperidle/session-requests";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { afterEach, describe, expect } from "vitest";
import { queueDeps } from "../__testing__/durable-agent-queue-test-deps.js";
import type { Action, ActionContext } from "../actions/action.js";
import { actionsAsTools } from "../actions/actions-as-tools.js";
import { buildCoreActions } from "../actions/compose.js";
import {
	buildAgentOrchestrationPort,
	buildSeamBackedReviewVerdictRecorder,
	buildSeamBackedWorkIntentRecorder,
} from "../services/agent-orchestration-port-composition.js";
import { SESSION_NOT_RETURNED_NOTICE_TEXT } from "../services/session-not-returned-notice.js";

const NOW = "2026-09-18T00:00:00.000Z";

// @lore B1: `runThreadTurnProof`'s own `finally` block (dispose + close +
// rmSync) is skipped by a vitest test timeout — the async function keeps
// running in the background, but `afterEach` still fires on the timeout
// outcome. `dispose()` alone does not stop a harness session that composition
// already started, so this is the actual backstop: sweep every live
// CliHarnessAdapter session's process group, in this file's own afterEach,
// same as the harness-registry package's own real-harness tests.
afterEach(() => {
	stopAllLiveHarnessSessions();
});
const PROMPT = "Reply with exactly: THREAD_TURN_OK";

/** Test-vocabulary harness name -> the exact `agent_run_config.harness_type` `createLocalAdapterPool` registers under (`AdapterMeta.type`, matched by `SelectRequirements.harnessType`). */
const HARNESS_TYPE: Partial<Record<SupportedHarnessName, string>> = {
	claude: "claude-code",
	codex: "codex",
	opencode: "opencode",
	"cursor-agent": "cursor-agent",
};

/**
 * Deliberately skips the middleware stack (auth, fail-closed) — this proves
 * the seam route's effect, not the door's authentication. Same shape as
 * `test-fixtures.ts`'s own `createFixtureAgentOrchestrationTransport`
 * (file-local per that file's own idiom; no shared export exists).
 */
function fixtureAgentOrchestrationTransport(app: Hono<HyperIdleEnv>): AgentOrchestrationTransport {
	return async (req: Request) => {
		const url = new URL(req.url);
		const strippedPath = url.pathname.replace(/^\/api/, "");
		const target = new URL(`${strippedPath}${url.search}`, url.origin);
		const hasBody = req.method !== "GET" && req.method !== "HEAD";
		const body = hasBody ? await req.text() : undefined;
		return app.fetch(new Request(target, { method: req.method, headers: req.headers, body }));
	};
}

function runnerFor<I, O>(actions: readonly Action[], name: string) {
	const found = actions.find((a) => a.declaration.name === name);
	if (!found) throw new Error(`no "${name}" action`);
	return found.run as (ctx: ActionContext, input: I) => Promise<ActionResult<O>>;
}

/** An OS-assigned free port, reserved just long enough to read it back — `createMcpToolBridge({baseUrl})` must know the origin before the first `open()` call, so the port has to be chosen before the bridge exists. */
async function getFreePort(): Promise<number> {
	return new Promise((resolve, reject) => {
		const probe = net.createServer();
		probe.once("error", reject);
		probe.listen(0, "127.0.0.1", () => {
			const addr = probe.address();
			if (addr === null || typeof addr === "string") {
				probe.close(() => reject(new Error("could not determine a free port")));
				return;
			}
			const { port } = addr;
			probe.close(() => resolve(port));
		});
	});
}

/** The concrete registry `createReturnEnforcement()` builds — never exported by name from `@hyperidle/harness-registry` (mirrors `bootAgentExecution`'s own derivation), so derived from the factory's own return type instead of duplicating its shape by hand. */
type EnforcementRegistry = ReturnType<typeof createReturnEnforcement>;

/**
 * The session-scoped harness-runtime port `run-orchestration`'s provisioner
 * consumes, built directly over `@hyperidle/harness-registry` — the same real
 * pieces `bootAgentExecution` wires production-side (`layers/agent-execution/
 * src/boot.ts`), hand-assembled here because `layers/core-api` does not
 * depend on `@hyperidle/agent-execution` (that boot is an Application's job).
 */
function buildLiveHarnessRuntimeAdapter(
	mcpBridgeRegistry: McpToolBridge,
	enforcementRegistry: EnforcementRegistry,
): RunOrchestrationHarnessRuntimeAdapter {
	return {
		enforcementRegistry,
		createReturnGate: (requiredReturnActions, taskId) =>
			enforcementRegistry.createGate(requiredReturnActions, taskId),
		evaluateReturn: (gate, endReason) => enforcementRegistry.evaluate(gate, endReason),
		provisionReturnHook: async (options) => {
			await provisionHarnessEnvironment({ ...options, token: options.bridgeToken });
		},
		writeCliMcpConfig: (options) => provisionHarnessEnvironment(options),
		writePluginStdioMcpEntries: (params) => writePluginStdioMcpEntries(params),
		// `bridge.open()` already returns the fully-spelled `/api/mcp/<token>`
		// URL (`baseUrl` was given to `createMcpToolBridge` at construction) —
		// no per-call URL assembly needed here.
		openMcpBridge: (session) =>
			mcpBridgeRegistry.open({
				sessionId: session.sessionId,
				registry: session.toolRegistry,
				onToolCall: session.onToolCall,
			}),
		closeMcpBridge: (token) => mcpBridgeRegistry.close(token),
	};
}

async function seedFounderAndAgent(
	db: HyperIdleDb,
	opts: {
		readonly founderId: string;
		readonly agentId: string;
		readonly harnessType: string;
		readonly modelId: string;
	},
): Promise<void> {
	await db.insert(users).values({
		id: opts.founderId,
		kind: "human",
		name: "Live Harness Founder",
		role: "founder",
		status: "active",
		createdAt: NOW,
	});
	await db.insert(users).values({
		id: opts.agentId,
		kind: "ai",
		name: "Live Harness Agent",
		role: "builder",
		status: "active",
		createdAt: NOW,
	});
	// @lore AU26 G1: the run-config selector (`harnessType`) lives in
	// `agent_run_config`, an agent-orchestration-owned table the drain reads
	// live — not on the `users` identity row.
	await db.insert(agentRunConfig).values({
		agentUserId: opts.agentId,
		harnessType: opts.harnessType,
		modelId: opts.modelId,
		maxConcurrentSessions: 1,
	});
}

/**
 * The human's door: a direct `send_message` with `recipients:[agentId]`
 * (no existing thread) — opens the thread, bakes the real `thread_turn` work
 * intent (`sendMessageRun`'s wake step, `thread-actions.ts`), drains it into a
 * real `agent_session_requests` row (the same drain the poller calls on a
 * timer — invoked once here), and returns that claimable row plus the
 * thread it opened.
 */
async function postAndDrainThreadTurnRequest(
	db: HyperIdleDb,
	eventBus: EventBus,
	actions: readonly Action[],
	opts: { readonly founderId: string; readonly agentId: string; readonly text: string },
): Promise<{ readonly request: AgentSessionRequest; readonly threadId: string }> {
	const sendMessage = runnerFor<SendMessageInput, SendMessageOutput>(actions, "send_message");
	const result = await sendMessage(
		{ actor: opts.founderId, db, eventBus, now: new Date().toISOString() },
		{
			recipients: [opts.agentId],
			text: opts.text,
			clientKey: `live-harness-${randomUUID()}`,
		},
	);
	if (!result.ok) {
		throw new Error(`send_message failed: ${JSON.stringify(result.problems)}`);
	}
	const messageId = result.data.message.id;
	const threadId = result.data.thread.id;

	// The intent's own `sourceId` is `${messageId}:${agentId}` — one intent
	// per woken agent (`thread-actions.ts`'s wake loop), not the bare
	// message id.
	const [intent] = await db
		.select()
		.from(agentWorkIntents)
		.where(eq(agentWorkIntents.sourceId, `${messageId}:${opts.agentId}`));
	if (!intent) {
		throw new Error(
			`No agent_work_intents row recorded for message ${messageId}, agent ${opts.agentId}`,
		);
	}
	expect(intent.kind).toBe("thread_turn");

	await drainIntents({ ...queueDeps(db), eventBus });

	// The drained `agent_session_requests` row keeps the BAKED `sourceId`
	// (`BakedThreadTurnRequest.sourceId` = the bare message id), unlike the
	// intent row above.
	const [request] = await db
		.select()
		.from(agentSessionRequests)
		.where(eq(agentSessionRequests.sourceId, messageId));
	if (!request) {
		throw new Error(`drainIntents did not produce an agent_session_requests row for ${messageId}`);
	}
	return { request, threadId };
}

describe("a human's send_message wakes an agent, whose own send_message ends the turn (real harness)", () => {
	/**
	 * Shared proof body — every harness runs the identical real path. Each
	 * caller below wraps this in its OWN `describe` with a LITERAL
	 * `requireHarness("<name>")` call, one per harness — kept ungreppable-proof
	 * by not collapsing these into a loop (AU28 lore on `RETURN_ACTION_NAMES`'s
	 * sibling convention, `assistant-reply-live-harness`'s own precedent).
	 */
	async function runThreadTurnProof(harness: SupportedHarnessName, db: HyperIdleDb): Promise<void> {
		const founderId = `founder-thread-turn-${harness}`;
		const agentId = `agent-thread-turn-${harness}`;
		const harnessType = HARNESS_TYPE[harness];
		if (!harnessType) throw new Error(`no harnessType mapping for ${harness}`);

		await seedFounderAndAgent(db, {
			founderId,
			agentId,
			harnessType,
			// The locked test model, seeded where production puts it — on the
			// agent's own run config. It reaches the harness as `selectedModel`.
			modelId: HARNESS_TEST_MODELS[harness].model,
		});

		const eventBus = new EventBus();
		const orchestrationBoot = await bootAgentOrchestration({ db, eventBus });
		const agentOrchestration = buildAgentOrchestrationPort(
			fixtureAgentOrchestrationTransport(orchestrationBoot.app),
		);
		const actions = buildCoreActions({
			agentOrchestration,
			agentWorkIntentRecorder: buildSeamBackedWorkIntentRecorder(agentOrchestration),
			reviewVerdictRecorder: buildSeamBackedReviewVerdictRecorder(agentOrchestration),
		});
		const actionTools = actionsAsTools(actions);

		const port = await getFreePort();
		const mcpBaseUrl = `http://127.0.0.1:${port}`;
		const enforcementRegistry = createReturnEnforcement();
		const mcpBridgeRegistry = createMcpToolBridge({
			enforcement: enforcementRegistry,
			baseUrl: mcpBaseUrl,
		});
		const bridgeApp = new Hono();
		const bridgeApi = new Hono();
		bridgeApi.route("/", mcpBridgeRegistry.router);
		bridgeApp.route("/api", bridgeApi);
		const httpServer = await new Promise<ReturnType<typeof serve>>((resolve) => {
			const server = serve({ fetch: bridgeApp.fetch, port }, () => resolve(server));
		});

		const sandboxBasePath = fs.mkdtempSync(path.join(os.tmpdir(), `thread-turn-${harness}-`));

		try {
			const { request, threadId } = await postAndDrainThreadTurnRequest(db, eventBus, actions, {
				founderId,
				agentId,
				text: PROMPT,
			});

			const adapterPool = await createLocalAdapterPool({ enforcement: enforcementRegistry });
			const workspace = createSandboxAdapter("local");
			const composition = buildRunOrchestrationComposition({
				harnessRuntime: buildLiveHarnessRuntimeAdapter(mcpBridgeRegistry, enforcementRegistry),
				returnStatusTool: { forRegistry: (registry) => returnStatusTool.forRegistry(registry) },
				// `actionTools` is a thunk now — this test's list never
				// changes mid-run, so a constant-returning closure is enough.
				actionTools: () => actionTools,
			});

			const result = await composition.runSession(
				{ db, eventBus, adapterPool, workspace },
				{ mode: "durable", request, sandboxBasePath, completion: "await" },
			);

			expect(result.mode).toBe("completed");
			if (result.mode !== "completed") return;
			if (result.outcome !== "completed") {
				// Diagnostic only — surfaces the real failure reason
				// (`agent_session_requests.error_code`/`error_message`, written by
				// `transitionAgentRunLifecycle`) instead of a bare outcome mismatch.
				const [failedRequest] = await db
					.select()
					.from(agentSessionRequests)
					.where(eq(agentSessionRequests.id, request.id));
				throw new Error(
					`session on ${harness} did not complete: outcome=${result.outcome} ` +
						`errorCode=${failedRequest?.errorCode ?? "none"} errorMessage=${failedRequest?.errorMessage ?? "none"}`,
				);
			}

			const openThread = runnerFor<OpenThreadInput, ThreadView>(actions, "open_thread");
			const view = await openThread(
				{ actor: founderId, db, eventBus, now: new Date().toISOString() },
				{ id: threadId },
			);
			if (!view.ok) {
				throw new Error(`open_thread failed: ${JSON.stringify(view.problems)}`);
			}

			const agentReply = view.data.messages.find((m) => m.senderId === agentId);
			expect(agentReply, `no reply message from ${agentId} on ${harness}`).toBeDefined();

			// A message merely EXISTING from `agentId` is not proof of a real
			// reply — assert the actual reply TEXT, and explicitly rule out the
			// never-silent net's fixed notice (unwired in this fixture, so this
			// guards against a coincidental match rather than that specific
			// reaction, same defensive shape the deleted AU27 test used).
			const payload = agentReply?.payload as { text?: string } | undefined;
			expect(
				payload?.text,
				`agent reply on ${harness} had no text payload: ${JSON.stringify(agentReply)}`,
			).toBeDefined();
			expect(
				payload?.text,
				`agent reply on ${harness} was the never-silent notice, not a real reply — the agent never called send_message`,
			).not.toBe(SESSION_NOT_RETURNED_NOTICE_TEXT);
			expect(
				payload?.text,
				`agent reply on ${harness} did not contain the required text: ${payload?.text}`,
			).toContain("THREAD_TURN_OK");

			// The in-memory result above proves the provisioner's own view of the
			// run; the persisted row is the independent proof that teardown wrote
			// the same verdict — the bug this test guards against (opencode's own
			// return persisted as state/outcome "stopped" while the in-memory
			// result said "completed") passed on the in-memory assertions alone.
			const sessionRow = await findSessionById(db, result.sessionId);
			expect(
				sessionRow?.state,
				`session row for ${harness} (session ${result.sessionId}) was not marked done`,
			).toBe("done");
			expect(
				sessionRow?.outcome,
				`session row for ${harness} (session ${result.sessionId}) was not marked completed`,
			).toBe("completed");
		} finally {
			orchestrationBoot.dispose();
			await new Promise<void>((resolve, reject) => {
				httpServer.close((err: Error | undefined) => (err ? reject(err) : resolve()));
			});
			fs.rmSync(sandboxBasePath, { recursive: true, force: true });
		}
	}

	describe("[harness:claude]", () => {
		requireHarness("claude");
		dbTest(
			"a thread turn on claude-code ends with a real send_message() call landing in the calling thread",
			async ({ db }) => runThreadTurnProof("claude", db),
			180_000,
		);
	});

	describe("[harness:codex]", () => {
		requireHarness("codex");
		dbTest(
			"a thread turn on codex ends with a real send_message() call landing in the calling thread",
			async ({ db }) => runThreadTurnProof("codex", db),
			180_000,
		);
	});

	describe("[harness:opencode]", () => {
		requireHarness("opencode");
		dbTest(
			"a thread turn on opencode ends with a real send_message() call landing in the calling thread",
			async ({ db }) => runThreadTurnProof("opencode", db),
			180_000,
		);
	});

	describe("[harness:cursor-agent]", () => {
		requireHarness("cursor-agent");
		dbTest(
			"a thread turn on cursor-agent ends with a real send_message() call landing in the calling thread",
			async ({ db }) => runThreadTurnProof("cursor-agent", db),
			180_000,
		);
	});
});
