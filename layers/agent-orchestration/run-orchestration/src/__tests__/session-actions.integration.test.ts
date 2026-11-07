/**
 * `stopSessionRun` against the REAL `sessionRunRegistry` and a real
 * `provisioner.run` for the live-entry half — the only way to prove the
 * teardown fix that makes a stopped session's row read state "stopped", not
 * "done", so the task-moving `outcome==='completed'` path never sees it.
 */
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { type HyperIdleDb, users } from "@hyperidle/db";
import type { SessionEndedEvent } from "@hyperidle/event-bus";
import { EventBus } from "@hyperidle/event-bus";
import { type RunnerDb, sessions } from "@hyperidle/runner-db";
import { sessionRunRegistry } from "@hyperidle/session-requests";
import { eq } from "drizzle-orm";
import {
	afterEach,
	buildNeverCalledPorts,
	describe,
	expect,
	neverCalled,
	type ProvisionSessionDeps,
	type ProvisionSessionParams,
	test,
	vi,
} from "../__testing__/test-fixtures.js";
import { createProvisioner } from "../provisioner.js";
import { stopSessionRun } from "../session-store.js";

const NOW = "2026-09-01T00:00:00.000Z";

async function seedAgent(db: HyperIdleDb, id: string): Promise<void> {
	await db
		.insert(users)
		.values({ id, kind: "ai", name: "Agent", role: "builder", status: "active", createdAt: NOW });
}

async function seedSession(
	runnerDb: RunnerDb,
	options: {
		readonly id: string;
		readonly agentId: string;
		readonly state: string;
		readonly startedAt?: string;
		readonly outcome?: string;
	},
): Promise<void> {
	await runnerDb.insert(sessions).values({
		id: options.id,
		agentId: options.agentId,
		modelTier: "workhorse",
		startedAt: options.startedAt ?? NOW,
		state: options.state,
		outcome: options.outcome ?? null,
	});
}

describe("stopSessionRun — no live runtime entry", () => {
	test("CAS-marks stopped/stopped and emits session_ended once", async ({ db, runnerDb }) => {
		await seedAgent(db, "agent-cas");
		await seedSession(runnerDb, { id: "s-cas", agentId: "agent-cas", state: "active" });
		const eventBus = new EventBus();
		const emitted: SessionEndedEvent[] = [];
		eventBus.on("session_ended", (event) => emitted.push(event));
		const neverLive = async (): Promise<boolean> => false;

		const result = await stopSessionRun(runnerDb, eventBus, "s-cas", neverLive);

		expect(result).toBe("marked");
		const [row] = await runnerDb.select().from(sessions).where(eq(sessions.id, "s-cas"));
		expect(row?.state).toBe("stopped");
		expect(row?.outcome).toBe("stopped");
		expect(emitted).toHaveLength(1);
		expect(emitted[0]).toMatchObject({ sessionId: "s-cas", outcome: "stopped" });
	});

	test("a terminal row answers already_ended, no write, no emit", async ({ db, runnerDb }) => {
		await seedAgent(db, "agent-cas-2");
		await seedSession(runnerDb, {
			id: "s-cas-2",
			agentId: "agent-cas-2",
			state: "done",
			outcome: "completed",
		});
		const eventBus = new EventBus();
		const emitted: SessionEndedEvent[] = [];
		eventBus.on("session_ended", (event) => emitted.push(event));

		const result = await stopSessionRun(runnerDb, eventBus, "s-cas-2", async () => false);

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
			// Called twice on the abort path — once by `sessionRunRegistry.abort`
			// (the real kill), once by the provisioner's own post-drain teardown.
			// Idempotent, never throws on the second call.
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

function buildLivePorts() {
	return buildNeverCalledPorts({
		sessionRequests: {
			findSessionRequest: neverCalled("sessionRequests.findSessionRequest"),
			listSessionRequests: neverCalled("sessionRequests.listSessionRequests"),
			transitionSessionRequest: neverCalled("sessionRequests.transitionSessionRequest"),
			// The real registry — the same wiring `run-orchestration-composition.ts`
			// binds in production (`sessionRequestsPort`), so `stopSessionRun`'s
			// injected `abort` and this run's own `signalAbort` rendezvous through
			// one singleton, exactly as they do in production.
			abortSessionRun: (sessionId: string, reason: "stop" | "return") =>
				sessionRunRegistry.abort(sessionId, reason),
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
			assembleSubscriptionPrompt: neverCalled("contextAssembly.assembleSubscriptionPrompt"),
			writeSandboxAgentsMd: vi.fn(),
		},
	});
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
		runnerDb,
	}) => {
		const sandboxPath = fs.mkdtempSync(path.join(os.tmpdir(), "session-actions-live-"));
		sandboxDirs.push(sandboxPath);
		await seedAgent(db, "agent-live");

		const stopSessionCalls: number[] = [];
		const eventBus = new EventBus();
		const emitted: SessionEndedEvent[] = [];
		eventBus.on("session_ended", (event) => emitted.push(event));

		const provisioner = createProvisioner(buildLivePorts());
		const params = {
			taskId: null,
			agentId: "agent-live",
			productId: "task-free",
			callingThreadId: "thread-live-action-1",
			agentConfig: { kind: "ai", status: "active", role: "builder", teamId: null },
		} as ProvisionSessionParams;
		const deps = {
			db: runnerDb,
			eventBus,
			adapterPool: {
				select: () => ({
					id: "fake-adapter",
					adapter: buildLiveHarnessAdapter(() => stopSessionCalls.push(Date.now())),
					meta: {
						name: "Fake",
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
		const stopResult = await stopSessionRun(runnerDb, eventBus, admitted.sessionId, (sessionId) =>
			sessionRunRegistry.abort(sessionId, "stop"),
		);
		expect(stopResult).toBe("aborted");

		// `stopSessionRun` on the abort path writes nothing and emits nothing —
		// the row is still whatever `admitSession` wrote (active), and no
		// `session_ended` exists yet.
		const [duringRow] = await runnerDb
			.select()
			.from(sessions)
			.where(eq(sessions.id, admitted.sessionId));
		expect(duringRow?.state).toBe("active");
		expect(emitted).toHaveLength(0);

		await runPromise;

		// The adapter tolerated a second `stopSession` call (registry, then
		// the provisioner's own post-drain teardown).
		expect(stopSessionCalls.length).toBe(2);

		const [finalRow] = await runnerDb
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
	 * draining — the same flag a registry abort flips — then schedules a
	 * defensive `abortSessionRun(sessionId, "return")` in case the process is
	 * still running. That deferred call reaches the SAME registered session,
	 * through the SAME registry, while the entry is still live — so
	 * `signalAbort` has to tell "return" apart from "stop" itself, at the
	 * reason each caller passes, not by "was signalAbort even called".
	 *
	 * The return tool call fires from inside `streamEvents`' first pull, not
	 * from `openMcpBridge` itself: `registerSessionRun` runs synchronously
	 * right before `streamEvents` is first pulled, so this is the earliest
	 * point provably AFTER registration — firing any earlier (e.g. from
	 * `openMcpBridge`, which resolves before `startSession` even runs) means
	 * the deferred abort finds no live entry and `signalAbort` never gets
	 * called at all, a false green that passes whether or not the reason
	 * split works.
	 */
	test("an opencode adapter's own return action ends the row done/completed, not stopped", async ({
		db,
		runnerDb,
	}) => {
		const sandboxPath = fs.mkdtempSync(path.join(os.tmpdir(), "session-actions-opencode-"));
		sandboxDirs.push(sandboxPath);
		await seedAgent(db, "agent-opencode");

		const eventBus = new EventBus();
		const emitted: SessionEndedEvent[] = [];
		eventBus.on("session_ended", (event) => emitted.push(event));

		let triggerReturn: (() => void) | undefined;
		const sessionIdBox: { current?: string } = {};

		const basePorts = buildLivePorts();
		const provisioner = createProvisioner({
			...basePorts,
			harnessRuntime: {
				...basePorts.harnessRuntime,
				// Captures the callback — does NOT fire it. Firing happens from
				// `streamEvents` below, once the session is actually registered.
				openMcpBridge: async ({
					onToolCall,
				}: {
					onToolCall?: (c: { toolName: string; args: unknown }) => void;
				}) => {
					triggerReturn = () =>
						onToolCall?.({ toolName: "mcp__hyperidle__send_message", args: {} });
					return { token: "tok", url: "http://127.0.0.1:0/mcp" };
				},
				closeMcpBridge: async () => undefined,
			},
		});
		const params = {
			taskId: null,
			agentId: "agent-opencode",
			productId: "task-free",
			callingThreadId: "thread-opencode-1",
			agentConfig: { kind: "ai", status: "active", role: "builder", teamId: null },
		} as ProvisionSessionParams;
		const deps = {
			db: runnerDb,
			eventBus,
			adapterPool: {
				select: () => ({
					id: "fake-adapter",
					adapter: {
						startSession: async (config: { readonly sessionId: string }) => ({
							sessionId: config.sessionId,
						}),
						// A plain iterator, not a generator: this stream never yields an
						// event, it only fires the return call once pulled — a
						// generator with no `yield` is a lint error, and there is
						// nothing here for the provisioner's own drain loop to observe.
						streamEvents: () => ({
							[Symbol.asyncIterator]() {
								let pulled = false;
								return {
									async next() {
										if (pulled) return { done: true as const, value: undefined };
										pulled = true;
										const sessionId = sessionIdBox.current;
										if (!sessionId) {
											throw new Error("sessionIdBox not set before streamEvents ran");
										}
										// The assertion that closes the false-green gap: the
										// return call is about to fire, and the registry must
										// already know about this session for that to mean
										// anything.
										expect(sessionRunRegistry.has(sessionId)).toBe(true);
										triggerReturn?.();
										return { done: true as const, value: undefined };
									},
								};
							},
						}),
						stopSession: async () => {
							// A real, short delay: the onToolCall handler's own deferred
							// `abortSessionRun(sessionId, "return")` — a genuine
							// `setTimeout(0)` — must run to completion BEFORE this
							// resolves, or phase 11 teardown deregisters the session
							// first and the deferred call finds nothing to abort. A
							// 0ms timer always fires before a later-scheduled one with a
							// real delay, so this ordering is deterministic, not a race.
							await new Promise((resolve) => setTimeout(resolve, 10));
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
					},
					meta: {
						name: "Opencode",
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
		sessionIdBox.current = admitted.sessionId;
		await provisioner.run(deps, params, admitted);

		const [row] = await runnerDb.select().from(sessions).where(eq(sessions.id, admitted.sessionId));
		expect(row?.state).toBe("done");
		expect(row?.outcome).toBe("completed");
		expect(emitted).toHaveLength(1);
		expect(emitted[0]).toMatchObject({ sessionId: admitted.sessionId, outcome: "completed" });
	});
});
