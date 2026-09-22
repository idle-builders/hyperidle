/**
 * The session action list — architecture.md §1-§3. `createSessionActions`'s
 * three runs against a hand-built `SessionActionsDeps` for `search_sessions`/
 * `watch_session`/the no-live-entry and terminal-row halves of `stop_session`;
 * `stopSessionRun` against the REAL `sessionRunRegistry` and a real
 * `provisioner.run` for the live-entry half — the only way to prove the
 * teardown fix that makes a stopped session's row read state "stopped", not
 * "done", so the task-moving `outcome==='completed'` path never sees it.
 */
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { type HyperIdleDb, sessions, users } from "@hyperidle/db";
import { afterEach, describe, expect, test, vi } from "@hyperidle/db/test-fixtures";
import type {
	ActivityEntry,
	SearchSessionsInput,
	SessionRow,
	StopSessionInput,
	StopSessionOutput,
	WatchSessionInput,
	WatchSessionOutput,
} from "@hyperidle/domain-model";
import type { SessionEndedEvent } from "@hyperidle/event-bus";
import { EventBus } from "@hyperidle/event-bus";
import { sessionRunRegistry } from "@hyperidle/session-requests";
import { eq } from "drizzle-orm";
import { createProvisioner } from "../provisioner.js";
import { type Action, createSessionActions, type SessionActionsDeps } from "../session-actions.js";
import { findSessionById, listSessions, stopSessionRun } from "../session-store.js";

const NOW = "2026-09-01T00:00:00.000Z";

async function seedAgent(db: HyperIdleDb, id: string): Promise<void> {
	await db
		.insert(users)
		.values({ id, kind: "ai", name: "Agent", role: "builder", status: "active", createdAt: NOW });
}

async function seedSession(
	db: HyperIdleDb,
	options: {
		readonly id: string;
		readonly agentId: string;
		readonly state: string;
		readonly startedAt?: string;
		readonly outcome?: string;
	},
): Promise<void> {
	await db.insert(sessions).values({
		id: options.id,
		agentId: options.agentId,
		modelTier: "workhorse",
		startedAt: options.startedAt ?? NOW,
		state: options.state,
		outcome: options.outcome ?? null,
	});
}

/** A deps bag with `stop`/`activity` stubbed — `sessions.list`/`getById` are the real store accessors. */
function buildDeps(overrides: Partial<SessionActionsDeps> = {}): SessionActionsDeps {
	return {
		sessions: { list: listSessions, getById: findSessionById },
		stop: vi.fn(async () => "already_ended" as const),
		activity: () => [],
		...overrides,
	};
}

/** The three declared actions, typed against their real input/output shapes — `createSessionActions` returns the structural `unknown`-generic `Action[]` every consumer casts on lookup (`runnerFor`'s own idiom), never a labeled record. */
function typedActions(deps: SessionActionsDeps): {
	readonly search: Action<SearchSessionsInput, SessionRow[]>;
	readonly watch: Action<WatchSessionInput, WatchSessionOutput>;
	readonly stop: Action<StopSessionInput, StopSessionOutput>;
} {
	const [search, watch, stop] = createSessionActions(deps);
	if (!(search && watch && stop)) throw new Error("createSessionActions: expected three actions");
	return {
		search: search as Action<SearchSessionsInput, SessionRow[]>,
		watch: watch as Action<WatchSessionInput, WatchSessionOutput>,
		stop: stop as Action<StopSessionInput, StopSessionOutput>,
	};
}

describe("createSessionActions", () => {
	describe("search_sessions", () => {
		test("no filter lists every session, newest first, capped at 100", async ({ db }) => {
			await seedAgent(db, "agent-search");
			await seedSession(db, {
				id: "s-old",
				agentId: "agent-search",
				state: "done",
				startedAt: "2026-01-01T00:00:00.000Z",
			});
			await seedSession(db, {
				id: "s-new",
				agentId: "agent-search",
				state: "active",
				startedAt: "2026-06-01T00:00:00.000Z",
			});
			const { search } = typedActions(buildDeps());

			const result = await search.run({ actor: "u1", db, eventBus: new EventBus(), now: NOW }, {});

			if (!result.ok) throw new Error("expected ok");
			expect(result.data.map((r) => r.id)).toEqual(["s-new", "s-old"]);
		});

		test("filters by state", async ({ db }) => {
			await seedAgent(db, "agent-search-2");
			await seedSession(db, { id: "s-active", agentId: "agent-search-2", state: "active" });
			await seedSession(db, { id: "s-done", agentId: "agent-search-2", state: "done" });
			const { search } = typedActions(buildDeps());

			const result = await search.run(
				{ actor: "u1", db, eventBus: new EventBus(), now: NOW },
				{ state: "active" },
			);

			if (!result.ok) throw new Error("expected ok");
			expect(result.data.map((r) => r.id)).toEqual(["s-active"]);
		});
	});

	describe("watch_session", () => {
		test("returns the row and the activity buffer", async ({ db }) => {
			await seedAgent(db, "agent-watch");
			await seedSession(db, { id: "s-watch", agentId: "agent-watch", state: "active" });
			const entry: ActivityEntry = {
				type: "tool_call",
				timestamp: 1,
				data: { toolName: "edit_task", argsSummary: "x" },
			};
			const { watch } = typedActions(buildDeps({ activity: () => [entry] }));

			const result = await watch.run(
				{ actor: "u1", db, eventBus: new EventBus(), now: NOW },
				{ id: "s-watch" },
			);

			if (!result.ok) throw new Error("expected ok");
			expect(result.data.session.id).toBe("s-watch");
			expect(result.data.activity).toEqual([entry]);
		});

		test("an unknown id is not_found", async ({ db }) => {
			const { watch } = typedActions(buildDeps());

			const result = await watch.run(
				{ actor: "u1", db, eventBus: new EventBus(), now: NOW },
				{ id: "nope" },
			);

			expect(result.ok).toBe(false);
			if (result.ok) throw new Error("expected refusal");
			expect(result.problems[0]?.code).toBe("not_found");
		});
	});

	describe("stop_session", () => {
		test("no live entry: stopped true, the row the answer carries is the pre-stop row", async ({
			db,
		}) => {
			await seedAgent(db, "agent-stop-marked");
			await seedSession(db, { id: "s-marked", agentId: "agent-stop-marked", state: "active" });
			const { stop } = typedActions(buildDeps({ stop: async () => "marked" }));

			const result = await stop.run(
				{ actor: "u1", db, eventBus: new EventBus(), now: NOW },
				{ id: "s-marked" },
			);

			if (!result.ok) throw new Error("expected ok");
			expect(result.data.stopped).toBe(true);
			// The action reads the row BEFORE calling stop — this is the pre-stop
			// answer (architecture.md §12 F1), not a second re-read after the CAS.
			expect(result.data.session.state).toBe("active");
		});

		test("a terminal row answers stopped: false", async ({ db }) => {
			await seedAgent(db, "agent-stop-terminal");
			await seedSession(db, {
				id: "s-terminal",
				agentId: "agent-stop-terminal",
				state: "done",
				outcome: "completed",
			});
			const { stop } = typedActions(buildDeps({ stop: async () => "already_ended" }));

			const result = await stop.run(
				{ actor: "u1", db, eventBus: new EventBus(), now: NOW },
				{ id: "s-terminal" },
			);

			if (!result.ok) throw new Error("expected ok");
			expect(result.data.stopped).toBe(false);
		});

		test("an unknown id is not_found", async ({ db }) => {
			const { stop } = typedActions(buildDeps());

			const result = await stop.run(
				{ actor: "u1", db, eventBus: new EventBus(), now: NOW },
				{ id: "nope" },
			);

			expect(result.ok).toBe(false);
			if (result.ok) throw new Error("expected refusal");
			expect(result.problems[0]?.code).toBe("not_found");
		});
	});
});

describe("stopSessionRun — no live runtime entry", () => {
	test("CAS-marks stopped/stopped and emits session_ended once", async ({ db }) => {
		await seedAgent(db, "agent-cas");
		await seedSession(db, { id: "s-cas", agentId: "agent-cas", state: "active" });
		const eventBus = new EventBus();
		const emitted: SessionEndedEvent[] = [];
		eventBus.on("session_ended", (event) => emitted.push(event));
		const neverLive = async (): Promise<boolean> => false;

		const result = await stopSessionRun(db, eventBus, "s-cas", neverLive);

		expect(result).toBe("marked");
		const [row] = await db.select().from(sessions).where(eq(sessions.id, "s-cas"));
		expect(row?.state).toBe("stopped");
		expect(row?.outcome).toBe("stopped");
		expect(emitted).toHaveLength(1);
		expect(emitted[0]).toMatchObject({ sessionId: "s-cas", outcome: "stopped" });
	});

	test("a terminal row answers already_ended, no write, no emit", async ({ db }) => {
		await seedAgent(db, "agent-cas-2");
		await seedSession(db, {
			id: "s-cas-2",
			agentId: "agent-cas-2",
			state: "done",
			outcome: "completed",
		});
		const eventBus = new EventBus();
		const emitted: SessionEndedEvent[] = [];
		eventBus.on("session_ended", (event) => emitted.push(event));

		const result = await stopSessionRun(db, eventBus, "s-cas-2", async () => false);

		expect(result).toBe("already_ended");
		expect(emitted).toHaveLength(0);
	});
});

// ---------------------------------------------------------------------------
// stopSessionRun — a live runtime entry. Drives the REAL `sessionRunRegistry`
// and a REAL `provisioner.run` so the teardown fix is proven end to end: the
// row the abort path leaves behind is written by `transition-run.ts`'s
// `endSession`, not by `stopSessionRun` itself.
// ---------------------------------------------------------------------------

type CreateProvisioner = typeof createProvisioner;
type SessionLifecyclePorts = Parameters<CreateProvisioner>[0];
type Provisioner = ReturnType<CreateProvisioner>;
type AdmitArgs = Parameters<Provisioner["admit"]>;
type ProvisionSessionDeps = AdmitArgs[0];
type ProvisionSessionParams = AdmitArgs[1];

/** Streams `token_usage` events on a short interval until `stopSession` fires — long enough for the test to call abort mid-run, short enough to bound the test. */
function buildLiveHarnessAdapter(onStopSession: () => void) {
	let stopped = false;
	return {
		startSession: async (config: { readonly sessionId: string }) => ({
			sessionId: config.sessionId,
		}),
		streamEvents: () => ({
			async *[Symbol.asyncIterator]() {
				for (let i = 0; i < 200 && !stopped; i++) {
					yield {
						type: "token_usage" as const,
						tier: "workhorse" as const,
						inputTokens: 1,
						outputTokens: 1,
					};
					await new Promise((resolve) => setTimeout(resolve, 5));
				}
			},
		}),
		stopSession: async () => {
			// F2 (architecture.md §12): called twice on the abort path — once by
			// `sessionRunRegistry.abort` (the real kill), once by the provisioner's
			// own post-drain teardown. Idempotent, never throws on the second call.
			stopped = true;
			onStopSession();
			return { outcome: "completed" as const, tokenUsage: { byTier: {} } };
		},
		getCapabilities: () => ({
			preCompactionTrigger: false,
			subAgents: false,
			modelProviders: [],
			mcpSupport: false,
			returnEnforcement: "none" as const,
		}),
		getNativeSessionId: () => undefined,
	};
}

function buildLivePorts(): SessionLifecyclePorts {
	const neverCalled = (label: string) =>
		vi.fn(() => {
			throw new Error(`${label}: must not be called in this test scenario`);
		});
	return {
		sessionRequests: {
			findSessionRequest: neverCalled("sessionRequests.findSessionRequest"),
			listSessionRequests: neverCalled("sessionRequests.listSessionRequests"),
			transitionSessionRequest: neverCalled("sessionRequests.transitionSessionRequest"),
			// The real registry — the same wiring `run-orchestration-composition.ts`
			// binds in production (`sessionRequestsPort`), so `stopSessionRun`'s
			// injected `abort` and this run's own `signalAbort` rendezvous through
			// one singleton, exactly as they do in production.
			abortSessionRun: (sessionId: string) => sessionRunRegistry.abort(sessionId),
			registerSessionRun: (
				sessionId: string,
				control: Parameters<typeof sessionRunRegistry.register>[1],
			) => sessionRunRegistry.register(sessionId, control),
			deregisterSessionRun: (sessionId: string) => sessionRunRegistry.deregister(sessionId),
		},
		observability: { summarizeToolArgs: () => "" },
		harnessRuntime: {
			enforcementRegistry: {
				register: vi.fn(),
				get: vi.fn(() => undefined),
				incrementForce: vi.fn(),
				unregister: vi.fn(),
			},
			createReturnGate: () => ({ observe: () => undefined, returned: false }),
			evaluateReturn: () => "returned" as const,
			provisionReturnHook: async () => undefined,
			writeCliMcpConfig: neverCalled("harnessRuntime.writeCliMcpConfig"),
			writePluginStdioMcpEntries: neverCalled("harnessRuntime.writePluginStdioMcpEntries"),
			openMcpBridge: async () => {
				throw new Error("no MCP bridge in this test — the fake adapter reports no cliMcpDialect");
			},
			closeMcpBridge: neverCalled("harnessRuntime.closeMcpBridge"),
		},
		toolProvider: {
			buildToolRegistry: () => ({ invoke: async () => ({ success: true, data: undefined }) }),
			toolsForRole: () => [],
			returnStatusToolForRegistry: () => ({ name: "return_status" }),
		},
		contextAssembly: {
			assembleAgentContext: neverCalled("contextAssembly.assembleAgentContext"),
			beginAgentWriteback: () => ({ dispose: () => undefined }),
			assemblePrompt: neverCalled("contextAssembly.assemblePrompt"),
			assembleRoutinePrompt: neverCalled("contextAssembly.assembleRoutinePrompt"),
			writeSandboxAgentsMd: vi.fn(),
		},
	} as SessionLifecyclePorts;
}

describe("stopSessionRun — a live runtime entry (the abort path)", () => {
	const sandboxDirs: string[] = [];
	afterEach(() => {
		for (const dir of sandboxDirs.splice(0)) {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});

	test("abort reaches adapter.stopSession, stopSessionRun writes nothing, teardown leaves stopped/stopped and emits session_ended once", async ({
		db,
	}) => {
		const sandboxPath = fs.mkdtempSync(path.join(os.tmpdir(), "session-actions-live-"));
		sandboxDirs.push(sandboxPath);
		await seedAgent(db as HyperIdleDb, "agent-live");

		const stopSessionCalls: number[] = [];
		const eventBus = new EventBus();
		const emitted: SessionEndedEvent[] = [];
		eventBus.on("session_ended", (event) => emitted.push(event));

		const provisioner = createProvisioner(buildLivePorts());
		const params = {
			taskId: null,
			agentId: "agent-live",
			productId: "task-free",
			sandboxBasePath: sandboxPath,
			agentConfig: { kind: "ai", status: "active", role: "builder", teamId: null },
			harnessDisabled: [],
		} as ProvisionSessionParams;
		const deps = {
			db: db as HyperIdleDb,
			eventBus,
			adapterPool: {
				select: () => ({
					id: "fake-adapter",
					adapter: buildLiveHarnessAdapter(() => stopSessionCalls.push(Date.now())),
					meta: {
						name: "Fake",
						kind: "local" as const,
						type: undefined,
						modelProviders: [],
						maxConcurrent: 5,
					},
				}),
				release: () => undefined,
				describeSelectFailure: () => "test pool selected nothing",
			},
			workspace: {
				spawn: async () => ({ sandboxId: "sbx-1", path: sandboxPath }),
				exec: async () => ({ stdout: "", stderr: "", exitCode: 0 }),
				adopt: (p: string) => Promise.resolve({ sandboxId: "sb-adopted", path: p }),
				destroy: async () => undefined,
			},
		} as ProvisionSessionDeps;

		const admitted = await provisioner.admit(deps, params);

		let harnessStarted!: () => void;
		const started = new Promise<void>((resolve) => {
			harnessStarted = resolve;
		});
		const runPromise = provisioner.run(deps, params, admitted, harnessStarted);

		// The registry entry exists the instant `startSession` resolves (before
		// `onHarnessStarted` fires) — safe to stop now.
		await started;
		const stopResult = await stopSessionRun(
			db as HyperIdleDb,
			eventBus,
			admitted.sessionId,
			(sessionId) => sessionRunRegistry.abort(sessionId),
		);
		expect(stopResult).toBe("aborted");

		// `stopSessionRun` on the abort path writes nothing and emits nothing —
		// the row is still whatever `admitSession` wrote (active), and no
		// `session_ended` exists yet.
		const [duringRow] = await (db as HyperIdleDb)
			.select()
			.from(sessions)
			.where(eq(sessions.id, admitted.sessionId));
		expect(duringRow?.state).toBe("active");
		expect(emitted).toHaveLength(0);

		await runPromise;

		// F2: the adapter tolerated a second `stopSession` call (registry, then
		// the provisioner's own post-drain teardown).
		expect(stopSessionCalls.length).toBe(2);

		const [finalRow] = await (db as HyperIdleDb)
			.select()
			.from(sessions)
			.where(eq(sessions.id, admitted.sessionId));
		expect(finalRow?.state).toBe("stopped");
		expect(finalRow?.outcome).toBe("stopped");
		expect(emitted).toHaveLength(1);
		expect(emitted[0]).toMatchObject({ sessionId: admitted.sessionId, outcome: "stopped" });
	});
});

describe("provisioner — an adapter's own return action is not a user stop", () => {
	const sandboxDirs: string[] = [];
	afterEach(() => {
		for (const dir of sandboxDirs.splice(0)) {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});

	/**
	 * opencode calls its return tool through the MCP bridge, and the
	 * provisioner flips its cooperative `aborted` flag so the event loop stops
	 * draining — the same flag a registry abort flips. Without a second flag
	 * for "someone actually asked to stop", this ordinary return was written
	 * to the row exactly like a stop: state "stopped" / outcome "stopped",
	 * which `lifecycle-propagation.ts` never reads as a finish, so the task
	 * never moved for a session that had, in fact, completed cleanly.
	 */
	test("an opencode adapter's own return action ends the row done/completed, not stopped", async ({
		db,
	}) => {
		const sandboxPath = fs.mkdtempSync(path.join(os.tmpdir(), "session-actions-opencode-"));
		sandboxDirs.push(sandboxPath);
		await seedAgent(db as HyperIdleDb, "agent-opencode");

		const eventBus = new EventBus();
		const emitted: SessionEndedEvent[] = [];
		eventBus.on("session_ended", (event) => emitted.push(event));

		const basePorts = buildLivePorts();
		const provisioner = createProvisioner({
			...basePorts,
			harnessRuntime: {
				...basePorts.harnessRuntime,
				// The bridge fires the return action the instant it opens — before
				// `startSession` runs — mirroring how a real MCP tool call arrives
				// through `onToolCall` and never appears in `streamEvents` at all
				// (see review-sandbox-lifetime.integration.test.ts).
				openMcpBridge: async ({
					onToolCall,
				}: {
					onToolCall: (c: { toolName: string; args: unknown }) => void;
				}) => {
					onToolCall({ toolName: "mcp__hyperidle__send_message", args: {} });
					return { token: "tok", url: "http://127.0.0.1:0/mcp" };
				},
				closeMcpBridge: async () => undefined,
			},
		});
		const params = {
			taskId: null,
			agentId: "agent-opencode",
			productId: "task-free",
			sandboxBasePath: sandboxPath,
			agentConfig: { kind: "ai", status: "active", role: "builder", teamId: null },
			harnessDisabled: [],
		} as ProvisionSessionParams;
		const deps = {
			db: db as HyperIdleDb,
			eventBus,
			adapterPool: {
				select: () => ({
					id: "fake-adapter",
					adapter: buildLiveHarnessAdapter(() => undefined),
					meta: {
						name: "Opencode",
						kind: "local" as const,
						type: "opencode" as const,
						modelProviders: [],
						maxConcurrent: 5,
					},
				}),
				release: () => undefined,
				describeSelectFailure: () => "test pool selected nothing",
			},
			workspace: {
				spawn: async () => ({ sandboxId: "sbx-1", path: sandboxPath }),
				exec: async () => ({ stdout: "", stderr: "", exitCode: 0 }),
				adopt: (p: string) => Promise.resolve({ sandboxId: "sb-adopted", path: p }),
				destroy: async () => undefined,
			},
		} as ProvisionSessionDeps;

		const admitted = await provisioner.admit(deps, params);
		await provisioner.run(deps, params, admitted);

		const [row] = await (db as HyperIdleDb)
			.select()
			.from(sessions)
			.where(eq(sessions.id, admitted.sessionId));
		expect(row?.state).toBe("done");
		expect(row?.outcome).toBe("completed");
		expect(emitted).toHaveLength(1);
		expect(emitted[0]).toMatchObject({ sessionId: admitted.sessionId, outcome: "completed" });
	});
});
