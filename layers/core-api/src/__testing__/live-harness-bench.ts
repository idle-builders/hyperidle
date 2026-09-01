/**
 * The app-and-harness bench: a real HyperIdle server, a real MCP bridge, and a
 * real agent-execution boot, so a test can drive a real harness binary through a
 * whole loop instead of half of one.
 *
 * **Why this exists.** The harness lane has always had two tiers. A thin one —
 * real binary, no app — proves harness mechanics: does the hook fire, does a
 * resume carry prior context, does the adapter report a session id. A live one
 * proves *loops*: an agent calls a HyperIdle tool, rows change, a message lands
 * in a thread. Only the live tier can see the failure that matters most here — a
 * session running against a closed bridge, whose 401s a deny-by-default gate
 * reads as "block everything", with its stream undrained and its output reaching
 * nobody. That failure is invisible to a mini HTTP server standing in for the app.
 *
 * Entering the live tier used to cost about 150 lines of wiring per test, which
 * is why tests that needed it took the thin path anyway and proved less than they
 * meant to. This is that wiring, once.
 *
 * **Fidelity.** The runtime comes from the production `bootAgentExecution`, not a
 * hand-rolled adapter — so the adapter pool, the sandbox, the MCP bridge, the
 * return enforcement and the action gate are the same objects the desktop app
 * builds. A test that wants a gate supplies `actionRulesPort`; one that does not
 * gets an ungated session, because with no rules the gate installs nothing.
 *
 * @lore BA2: `bootAgentExecution` needs the server's own origin before the server
 * exists, so the port is reserved first and then listened on. The alternative was
 * to keep hand-rolling a runtime adapter per test, which is how two existing
 * tests drifted from production and from each other.
 */

import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as net from "node:net";
import * as os from "node:os";
import * as path from "node:path";
import { serve } from "@hono/node-server";
import { type AgentExecutionBoot, bootAgentExecution } from "@hyperidle/agent-execution";
import {
	buildRunOrchestrationComposition,
	createInProcessCoreApiTransport,
} from "@hyperidle/agent-orchestration";
import { registerSessionNotReturnedNotice } from "@hyperidle/conversation";
import {
	type AgentSessionRequest,
	agentSessionRequests,
	agentWorkIntents,
	type HyperIdleDb,
} from "@hyperidle/db";
import { EventBus } from "@hyperidle/event-bus";
import { drainIntents } from "@hyperidle/session-requests";
import { eq } from "drizzle-orm";
import type { Hono } from "hono";
import { queueDeps } from "./durable-agent-queue-test-deps.js";
import { createTestApp } from "./test-utils.js";

/** Test-vocabulary harness name -> the exact `agent_run_config.harness_type` the pool registers under. */
export const HARNESS_TYPE: Record<string, string> = {
	claude: "claude-code",
	codex: "codex",
	opencode: "opencode",
	"cursor-agent": "cursor-agent",
};

/** The action rules a gated session resolves at provisioning. */
export interface BenchActionRule {
	readonly id: string;
	readonly pattern: string;
	readonly description: string;
}

export interface LiveHarnessBenchOptions {
	/**
	 * Rules the gate resolves for every session this bench runs. Omit for an
	 * ungated session — with no rules the gate installs no hook at all, which is
	 * the same "empty on a fresh install" state a real system starts in.
	 */
	readonly actionRules?: readonly BenchActionRule[];
	/** API key the bench's HTTP calls authenticate with. */
	readonly apiKey?: string;
}

export interface LiveHarnessBench {
	readonly url: string;
	readonly db: HyperIdleDb;
	readonly eventBus: EventBus;
	readonly apiKey: string;
	/**
	 * A git-initialised temp directory. Codex's `--sandbox workspace-write`
	 * refuses a cwd outside a git repo; the other three never look.
	 */
	readonly sandboxBasePath: string;
	/** The production execution boot this bench runs on — pool, sandbox, bridge, gate. */
	readonly boot: AgentExecutionBoot;
	/**
	 * Post a message to a thread over real HTTP, then drain the intent it bakes
	 * into the real `agent_session_requests` row a run needs. This is the same
	 * drain `startRuntime`'s poller calls on a timer, invoked once.
	 */
	postAndDrain(opts: {
		readonly threadId: string;
		readonly text: string;
	}): Promise<AgentSessionRequest>;
	/**
	 * Accept a task over real HTTP, which is how production dispatches work to its
	 * owner agent, then drain the `task_run` intent into the request a run needs.
	 *
	 * @lore BA2: A task-backed session is the only kind where `ctx.taskId` is
	 * populated, and `submit_review` errors without it. An assistant turn cannot
	 * file a review, so any loop that ends in one has to start from a task.
	 */
	acceptTaskAndDrain(taskId: string): Promise<AgentSessionRequest>;
	/** Drain pending intents without posting anything — for a verdict already recorded. */
	drain(): Promise<void>;
	/** Find the request a drain produced for a given source id. */
	requestForSource(sourceId: string): Promise<AgentSessionRequest | undefined>;
	/** Run one claimed request through the real provisioning path. */
	run(request: AgentSessionRequest): Promise<{ readonly mode: string; readonly outcome?: string }>;
	close(): Promise<void>;
}

/** Reserve a free port so the execution boot can be told the origin before the server listens. */
function reservePort(): Promise<number> {
	return new Promise((resolve, reject) => {
		const probe = net.createServer();
		probe.once("error", reject);
		probe.listen(0, "127.0.0.1", () => {
			const address = probe.address();
			if (typeof address === "string" || address === null) {
				probe.close();
				reject(new Error("could not reserve a port"));
				return;
			}
			const { port } = address;
			probe.close(() => resolve(port));
		});
	});
}

/** A git-initialised temp dir — codex refuses to write in a cwd that is not a repo. */
export function makeGitSandbox(prefix: string): string {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
	execFileSync("git", ["init"], { cwd: dir, stdio: "ignore" });
	execFileSync("git", ["commit", "--allow-empty", "-m", "init"], {
		cwd: dir,
		stdio: "ignore",
		env: {
			...process.env,
			GIT_AUTHOR_NAME: "bench",
			GIT_AUTHOR_EMAIL: "bench@test",
			GIT_COMMITTER_NAME: "bench",
			GIT_COMMITTER_EMAIL: "bench@test",
		},
	});
	return dir;
}

export async function startLiveHarnessBench(
	db: HyperIdleDb,
	options: LiveHarnessBenchOptions = {},
): Promise<LiveHarnessBench> {
	const apiKey = options.apiKey ?? "live-harness-bench-key";
	process.env.HYPERIDLE_API_KEY = apiKey;

	const port = await reservePort();
	const url = `http://127.0.0.1:${port}`;
	const eventBus = new EventBus();

	// The production boot: real pool, real sandbox, real MCP bridge, real return
	// enforcement, real action gate store. Nothing here is a bench-only object.
	const boot = await bootAgentExecution({ topology: "local", mcpBaseUrl: url });

	const app: Hono = await createTestApp({
		db,
		eventBus,
		// Mounted exactly where production mounts it: after both layers' pre-auth
		// routes and before auth, because an MCP client authenticates by the
		// session token in its URL, not by API key.
		registerPreAuthRoutes: (apiRouter) => {
			boot.mountMcpRouter(apiRouter);
		},
	});
	const coreApiTransport = createInProcessCoreApiTransport(app);

	// Production wires this; `createTestApp` alone does not. Without it a turn
	// that ends without returning is silently absent rather than noticed, which
	// would make any "the human was told" assertion meaningless.
	registerSessionNotReturnedNotice(db, eventBus);

	const httpServer = serve({ fetch: app.fetch, port });
	const sandboxBasePath = makeGitSandbox("live-harness-bench-");

	const composition = buildRunOrchestrationComposition({
		harnessRuntime: boot.adapters.harnessRuntime,
		returnStatusTool: boot.adapters.returnStatusTool,
		coreApiTransport,
	});

	const deps = {
		db,
		eventBus,
		adapterPool: boot.adapters.pool,
		workspace: boot.adapters.sandbox,
		mcpBaseUrl: url,
		...(options.actionRules
			? {
					actionRulesPort: {
						resolveFor: async () => options.actionRules ?? [],
					},
				}
			: {}),
	};

	return {
		url,
		db,
		eventBus,
		apiKey,
		sandboxBasePath,
		boot,

		async postAndDrain(opts) {
			const res = await fetch(`${url}/api/threads/${opts.threadId}/messages`, {
				method: "POST",
				headers: { "Content-Type": "application/json", "X-API-Key": apiKey },
				body: JSON.stringify({
					type: "plain",
					payload: { text: opts.text },
					clientKey: `bench-${Math.random().toString(36).slice(2)}`,
				}),
			});
			if (res.status !== 201 && res.status !== 200) {
				throw new Error(`POST /threads/:id/messages failed: ${res.status} ${await res.text()}`);
			}
			const body = (await res.json()) as { message: { id: string } };
			const messageId = body.message.id;

			const [intent] = await db
				.select()
				.from(agentWorkIntents)
				.where(eq(agentWorkIntents.sourceId, messageId));
			if (!intent) throw new Error(`no agent_work_intents row recorded for message ${messageId}`);

			await drainIntents({ ...queueDeps(db), eventBus });

			const [request] = await db
				.select()
				.from(agentSessionRequests)
				.where(eq(agentSessionRequests.sourceId, messageId));
			if (!request) {
				throw new Error(`drainIntents produced no agent_session_requests row for ${messageId}`);
			}
			return request;
		},

		async acceptTaskAndDrain(taskId) {
			const res = await fetch(`${url}/api/tasks/${taskId}`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json", "X-API-Key": apiKey },
				body: JSON.stringify({ state: "accepted" }),
			});
			if (res.status !== 200) {
				throw new Error(`PATCH /tasks/${taskId} failed: ${res.status} ${await res.text()}`);
			}
			const [intent] = await db
				.select()
				.from(agentWorkIntents)
				.where(eq(agentWorkIntents.kind, "task_run"));
			if (!intent) {
				throw new Error(
					`accepting task ${taskId} baked no task_run intent — check it has an ownerAgentId and was in a state that dispatches`,
				);
			}
			await drainIntents({ ...queueDeps(db), eventBus });
			// The handed-off intent names its own request. Looking it up by source id
			// would be wrong: a task_run intent's source is the dispatch attempt,
			// while the request it produces is sourced on the task.
			const [drained] = await db
				.select()
				.from(agentWorkIntents)
				.where(eq(agentWorkIntents.id, intent.id));
			const [request] = drained?.requestId
				? await db
						.select()
						.from(agentSessionRequests)
						.where(eq(agentSessionRequests.id, drained.requestId))
				: [];
			if (!request) {
				// The drain marks an intent it could not admit rather than throwing, so
				// say WHY here — otherwise every admission failure reads as the same
				// blank "no row" and the real cause stays buried in a column.
				throw new Error(
					`drainIntents produced no agent_session_requests row for task ${taskId} — ` +
						`intent status=${drained?.status} code=${drained?.lastErrorCode} error=${drained?.lastError}`,
				);
			}
			return request;
		},

		async drain() {
			await drainIntents({ ...queueDeps(db), eventBus });
		},

		async requestForSource(sourceId) {
			const [request] = await db
				.select()
				.from(agentSessionRequests)
				.where(eq(agentSessionRequests.sourceId, sourceId));
			return request;
		},

		async run(request) {
			const result = await composition.runSession(deps, {
				mode: "durable",
				request,
				sandboxBasePath,
				completion: "await",
			});
			return result as { mode: string; outcome?: string };
		},

		close: () =>
			new Promise<void>((resolve, reject) => {
				fs.rmSync(sandboxBasePath, { recursive: true, force: true });
				boot.dispose();
				httpServer.close((err) => (err ? reject(err) : resolve()));
			}),
	};
}
