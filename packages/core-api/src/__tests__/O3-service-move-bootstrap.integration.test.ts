import { describe } from "vitest";
import type { AppOptions } from "../app.js";
import { createApp } from "../app.js";
import { registerAgentLayerServices, registerCoreDomainServices } from "../server-factory.js";
import { expect, test, vi } from "../test-fixtures.js";

/**
 * AU11: former app-runtime `bootstrapAppRuntime` split into two owner-scoped
 * registration functions (server-factory.ts) — `registerCoreDomainServices`
 * (knowledge/notifications/policy/routine-scheduler) and
 * `registerAgentLayerServices` (builtin-routine handlers/cost-cap/
 * dispatcher/reapers). Composing them replicates the exact same disposer
 * set bootstrapAppRuntime returned; only the grouping is new.
 */
function fullServiceBootstrap(
	ctx: Parameters<typeof registerCoreDomainServices>[0],
): Array<() => void> {
	return [...registerCoreDomainServices(ctx), ...registerAgentLayerServices(ctx)];
}

describe("O3 AC-5: registerCoreDomainServices + registerAgentLayerServices", () => {
	test("both are exported as functions", () => {
		expect(typeof registerCoreDomainServices).toBe("function");
		expect(typeof registerAgentLayerServices).toBe("function");
	});

	test("returns an array of disposer functions when called with db and eventBus", async ({
		db,
		eventBus,
	}) => {
		const disposers = fullServiceBootstrap({ db, eventBus });

		expect(Array.isArray(disposers)).toBe(true);
		expect(disposers.length).toBeGreaterThan(0);
		for (const d of disposers) {
			expect(typeof d).toBe("function");
		}

		for (const d of disposers) {
			d();
		}
	});

	test("returns the exact named owners and invokes every distinct cleanup effect", async ({
		db,
		eventBus,
	}) => {
		type OwnedDisposer = (() => void) & {
			readonly owner: string;
			readonly cleanupEffect: string;
			readonly constituents: readonly string[];
		};
		const expectedOwnership = [
			{
				owner: "lifecycle-projection drain",
				cleanupEffect: "stops drain",
				constituents: ["drain interval"],
			},
			{
				owner: "agent-run-admission reactions",
				cleanupEffect: "unsubscribe",
				constituents: ["agent_run_admission_failed subscription"],
			},
			// @lore AU21 §9 Increment 4 (Decision B″ item 3): the POST-SESSION
			// routine-run finalize reaction — a DIFFERENT mechanism from the
			// PRE-HANDOFF `agent-run-admission reactions` owner above.
			{
				owner: "routine-run session-end reactions",
				cleanupEffect: "unsubscribe",
				constituents: ["session_ended subscription", "agent_run_lifecycle_changed subscription"],
			},
			// @lore AU21 §9 Increment 6 (Decision D): agent-orchestration's OWN
			// per-session-cost write reaction — a DIFFERENT mechanism/owner from
			// the routine-run finalize reaction above (this one is
			// `session-requests`'s own subscriber, not core-api's).
			{
				owner: "session-cost recorder",
				cleanupEffect: "unsubscribe",
				constituents: ["session_ended subscription"],
			},
			{
				owner: "relevance listener",
				cleanupEffect: "unsubscribes",
				constituents: ["knowledge-access subscription"],
			},
			{
				owner: "review subscriptions",
				cleanupEffect: "unsubscribe",
				constituents: ["review creation subscription", "review liveness subscription"],
			},
			{
				owner: "policy registration",
				cleanupEffect: "unsubscribe",
				constituents: ["policy engine", "lifecycle propagation", "retry interval"],
			},
			{
				owner: "git-export handler",
				cleanupEffect: "unsubscribe",
				constituents: ["knowledge-update subscription"],
			},
			{
				owner: "notifications installation",
				cleanupEffect: "dispatcher/listener/drain all stop",
				constituents: ["dispatcher", "listener", "drain"],
			},
			{
				owner: "retention reaper",
				cleanupEffect: "interval cleared",
				constituents: ["retention interval"],
			},
			{
				owner: "dispatch lifecycle",
				cleanupEffect: "assistant stop",
				constituents: ["assistant"],
			},
			// @lore AU21 §9 Increment 4: the routine scheduler (builtin-routine
			// event reaction + the cron/due-eval tick loop) relocated out of
			// `dispatchOps` into two SEPARATE core-api-side lifecycles — dispatch
			// no longer knows about routines at all.
			{
				owner: "builtin routine reactions",
				cleanupEffect: "bet_state_changed subscription stop",
				constituents: ["builtin routine reactions"],
			},
			{
				owner: "routine scheduler",
				cleanupEffect: "cron/due-eval tick stop",
				constituents: ["routine scheduler"],
			},
			{
				owner: "cost sentinel",
				cleanupEffect: "sentinel plus dedup subscription stop",
				constituents: ["sentinel", "dedup subscription"],
			},
		] as const;
		const disposers = fullServiceBootstrap({
			db,
			eventBus,
			dispatcherDeps: {
				adapterPool: {},
				workspace: {},
				sandboxBasePath: "/tmp/au20-bootstrap-ownership",
			},
		}) as OwnedDisposer[];
		// Dispatch startup is asynchronous. Let all four constituents install
		// before measuring any owner so later registrations cannot bleed into an
		// earlier owner's cleanup observation.
		await new Promise<void>((resolve) => setImmediate(resolve));
		await new Promise<void>((resolve) => setImmediate(resolve));
		const off = vi.spyOn(eventBus, "off");
		const clear = vi.spyOn(globalThis, "clearInterval");
		const observedEffects: Array<{
			unsubscribedEvents: string[];
			clearedIntervals: number;
		}> = [];

		try {
			for (const dispose of disposers) {
				const offCalls = off.mock.calls.length;
				const clearCalls = clear.mock.calls.length;
				dispose();
				await new Promise<void>((resolve) => setImmediate(resolve));
				observedEffects.push({
					unsubscribedEvents: off.mock.calls.slice(offCalls).map(([type]) => type),
					clearedIntervals: clear.mock.calls.length - clearCalls,
				});
			}

			expect(observedEffects).toEqual([
				{ unsubscribedEvents: [], clearedIntervals: 1 },
				// @lore AU21 Increment 3 Wave 0: `registerAgentRunAdmissionReactions`
				// is idempotent PER eventBus instance — the `eventBus` test fixture
				// already registered it before this test's own
				// `fullServiceBootstrap` call reaches it here, so THIS registration
				// is a no-op disposer (no `off()` call, no interval).
				{ unsubscribedEvents: [], clearedIntervals: 0 },
				// @lore AU21 §9 Increment 4: `registerRoutineRunSessionEndReactions`
				// is NOT pre-registered on the `eventBus` test fixture (unlike
				// `registerAgentRunAdmissionReactions` above) — this is its first,
				// real registration on this eventBus instance, so both its
				// subscriptions unsubscribe for real.
				{
					unsubscribedEvents: ["session_ended", "agent_run_lifecycle_changed"],
					clearedIntervals: 0,
				},
				// @lore AU21 §9 Increment 6: `registerSessionCostRecorder` is NOT
				// pre-registered on the `eventBus` test fixture either — its own
				// first, real registration on this eventBus instance.
				{ unsubscribedEvents: ["session_ended"], clearedIntervals: 0 },
				{ unsubscribedEvents: ["knowledge_accessed"], clearedIntervals: 0 },
				{ unsubscribedEvents: ["session_ended", "session_ended"], clearedIntervals: 0 },
				{
					unsubscribedEvents: [
						"item_created",
						"session_ended",
						"task_state_changed",
						"bet_state_changed",
					],
					clearedIntervals: 1,
				},
				{ unsubscribedEvents: ["knowledge_updated"], clearedIntervals: 0 },
				{
					unsubscribedEvents: [
						"notification",
						"item_created",
						"cost_cap_breached",
						"cost_cap_warning",
						"routine_fired",
					],
					clearedIntervals: 1,
				},
				{ unsubscribedEvents: [], clearedIntervals: 1 },
				// @lore AU21 §9 Increment 9 (forensic-triage wave, second pass):
				// `task_state_changed`/`session_ended` are gone — the task-queue
				// trigger they belonged to was genuinely dead code (see
				// `@hyperidle/dispatch`'s own `@lore`), deleted, not migrated.
				// `dispatch lifecycle` now subscribes to exactly one event.
				{
					unsubscribedEvents: ["thread_message_appended"],
					clearedIntervals: 0,
				},
				// @lore AU21 §9 Increment 4: split from the single "dispatch
				// lifecycle" disposer above — `bet_state_changed` (builtin routine
				// reaction) and the scheduler interval now dispose separately.
				{ unsubscribedEvents: ["bet_state_changed"], clearedIntervals: 0 },
				{ unsubscribedEvents: [], clearedIntervals: 1 },
				{
					unsubscribedEvents: ["session_ended", "session_handoff_completed"],
					clearedIntervals: 1,
				},
			]);
			expect(
				disposers.map(({ owner, cleanupEffect, constituents }) => ({
					owner,
					cleanupEffect,
					constituents,
				})),
			).toEqual(expectedOwnership);
		} finally {
			off.mockRestore();
			clear.mockRestore();
		}
	});
});

describe("O3 AC-6: AppOptions.serviceBootstrap type field", () => {
	test("AppOptions accepts serviceBootstrap as a function", async ({ db, eventBus }) => {
		const options: AppOptions = {
			db,
			eventBus,
			serviceBootstrap: ({ db: d, eventBus: eb }) => {
				void d;
				void eb;
				return [() => {}];
			},
		};
		expect(typeof options.serviceBootstrap).toBe("function");
	});

	test("AppOptions accepts serviceBootstrap: undefined (kernel-only mode)", () => {
		const options: AppOptions = {
			serviceBootstrap: undefined,
		};
		expect(options.serviceBootstrap).toBeUndefined();
	});
});

describe("O3 AC-8: kernel-only boot (no serviceBootstrap)", () => {
	test("createApp() without any options boots without throwing", async () => {
		await expect(createApp()).resolves.not.toThrow();
	}, 120_000);

	test("createApp({ serviceBootstrap: undefined }) boots without throwing", async () => {
		await expect(createApp({ serviceBootstrap: undefined })).resolves.not.toThrow();
	}, 120_000);

	test("GET /api/health returns 200 in kernel-only mode", async () => {
		const app = await createApp({ serviceBootstrap: undefined });
		const res = await app.request("/api/health");
		expect(res.status).toBe(200);
	}, 120_000);
});

describe("O3 AC-9: full boot with registerCoreDomainServices + registerAgentLayerServices", () => {
	test("createApp({ db, eventBus, serviceBootstrap: fullServiceBootstrap }) boots without throwing", async ({
		db,
		eventBus,
	}) => {
		const app = await createApp({ db, eventBus, serviceBootstrap: fullServiceBootstrap });

		void app?.request("/api/health");
	}, 120_000);

	test("GET /api/health returns 200 with full app boot (core + agent-layer services)", async ({
		db,
		eventBus,
	}) => {
		const app = await createApp({ db, eventBus, serviceBootstrap: fullServiceBootstrap });
		const res = await app.request("/api/health");
		expect(res.status).toBe(200);
	}, 120_000);
});
