import { describe } from "vitest";
import type { AppOptions } from "../app.js";
import { registerAgentLayerServices, registerCoreDomainServices } from "../service-bootstrap.js";
import { expect, test, vi } from "../test-fixtures.js";
import { createTestApp } from "../test-utils.js";

/**
 * AU11: former app-runtime `bootstrapAppRuntime` split into two owner-scoped
 * registration functions (server-factory.ts) — `registerCoreDomainServices`
 * (knowledge/notifications/policy/routine-scheduler) and
 * `registerAgentLayerServices` (builtin-routine handlers/dispatcher/reapers —
 * AU21 Increment 14a: cost-cap sentinel HARD-DELETED, no replacement).
 * Composing them replicates the exact same disposer set bootstrapAppRuntime
 * returned; only the grouping is new.
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
			// @lore AU26: the POST-SESSION agent-health reaction — the event-driven
			// degraded-agent notification that replaced `routes/teams-routes.ts`'s
			// `maybeNotifyAgentError`, closing core-api's last `sessions` read.
			{
				owner: "agent-health session-end reactions",
				cleanupEffect: "unsubscribe",
				constituents: ["session_ended subscription"],
			},
			// @lore AU21 §9 Increment 10 (Decision H1)/Increment 12 (Decision H3)
			// Wave D: the POST-SESSION `task` dispatch-attempt finalize reaction
			// PLUS the bet per-tier token-writeback reaction (Wave D's additive
			// `session_ended` subscription) — a DIFFERENT mechanism/owner from the
			// routine-run finalize reaction above, replacing `session-requests`'s/
			// `run-orchestration`'s own former direct cross-layer writes.
			{
				owner: "work session-end reactions",
				cleanupEffect: "unsubscribe",
				constituents: ["agent_run_lifecycle_changed subscription", "session_ended subscription"],
			},
			// @lore AU21 §9 Increment 12 (Decision H3) Wave D: the POST-SESSION-START
			// task `in_progress` transition reaction — replaces
			// `run-orchestration/provisioner.ts`'s deleted direct
			// `ports.work.transitionTask` write.
			{
				owner: "work session-started reactions",
				cleanupEffect: "unsubscribe",
				constituents: ["session_started subscription"],
			},
			// @lore AU21 §9 Increment 11 (Decision H2/F4, Wave B): the pin decision
			// moved ENTIRELY core-side from `dispatch`'s deleted
			// `registerAssistantTriggerInternal` into this `@hyperidle/conversation`-
			// owned reaction.
			{
				owner: "assistant thread pin reaction",
				cleanupEffect: "unsubscribe",
				constituents: ["thread_message_appended subscription"],
			},
			// @lore AU21 §9 Increment 11 (Decision H2 "Coherence — reconciled via
			// Decision B‴"): the NEW B‴ supersede trigger — a DIFFERENT
			// mechanism/owner from the pin reaction above (both react to
			// `thread_message_appended`, for unrelated reasons).
			{
				owner: "assistant-turn B‴ coherence trigger",
				cleanupEffect: "unsubscribe",
				constituents: ["thread_message_appended subscription"],
			},
			// @lore AU27 Increment 5 (Decision 5): the never-silent net — a
			// `@hyperidle/conversation`-owned reaction to the EXISTING
			// `session_not_returned` event (previously observed only by the
			// observability dispatcher's own internal logging subscription,
			// which is not part of this disposer list).
			{
				owner: "session-not-returned notice",
				cleanupEffect: "unsubscribe",
				constituents: ["session_not_returned subscription"],
			},
			// @lore AU21 Increment 14a: the "session-cost recorder" owner
			// (agent-orchestration's own per-session-cost write reaction,
			// `session-requests`'s subscriber) is HARD-DELETED along with the
			// rest of the cost feature — no replacement.
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
				owner: "notifications installation",
				cleanupEffect: "dispatcher/listener/drain all stop",
				constituents: ["dispatcher", "listener", "drain"],
			},
			{
				owner: "retention reaper",
				cleanupEffect: "interval cleared",
				constituents: ["retention interval"],
			},
			// `registerAgentLayerServices` boots one lifecycle — the assistant
			// runs through the SAME durable poller (`startRuntime`) as every
			// other kind.
			// @lore AU21 §9 Increment 4: the routine scheduler (builtin-routine
			// event reaction + the cron/due-eval tick loop) is its own
			// core-api-side lifecycle, separate from the builtin routine
			// reactions below.
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
			// @lore AU21 Increment 14a: the "cost sentinel" owner (15-minute
			// scheduled job + its dedup subscription) is HARD-DELETED along with
			// the rest of the cost feature — no replacement.
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
				// @lore AU26: `registerAgentHealthSessionEndReactions` — the
				// event-driven degraded-agent notification that replaced
				// `routes/teams-routes.ts`'s `maybeNotifyAgentError` (and with it
				// core-api's last `sessions` read). Not pre-registered on the
				// `eventBus` test fixture, so its single subscription unsubscribes
				// for real.
				{
					unsubscribedEvents: ["session_ended"],
					clearedIntervals: 0,
				},
				// @lore AU21 §9 Increment 10 (Decision H1)/Increment 12 (Decision H3)
				// Wave D: `registerWorkSessionEndReactions` is NOT pre-registered on the
				// `eventBus` test fixture either — this is its first, real registration
				// on this eventBus instance. Wave D added a second subscription
				// (`session_ended`, the bet token-writeback reaction) onto the SAME
				// owner — both unsubscribe here, in registration order.
				{
					unsubscribedEvents: ["agent_run_lifecycle_changed", "session_ended"],
					clearedIntervals: 0,
				},
				// @lore AU21 §9 Increment 12 (Decision H3) Wave D:
				// `registerWorkSessionStartedReactions` is NOT pre-registered on the
				// `eventBus` test fixture either — its own first, real registration on
				// this eventBus instance.
				{
					unsubscribedEvents: ["session_started"],
					clearedIntervals: 0,
				},
				// @lore AU21 §9 Increment 11 (Wave B): `registerAssistantThreadPinReaction`
				// and `registerAssistantTurnCoherenceTrigger` are BOTH idempotent PER
				// eventBus instance (same shape as `registerAgentRunAdmissionReactions`
				// above) — the `eventBus` test fixture already registered both before
				// this test's own `fullServiceBootstrap` call reaches them here, so
				// both registrations are no-op disposers (no `off()` call, no interval).
				{ unsubscribedEvents: [], clearedIntervals: 0 },
				{ unsubscribedEvents: [], clearedIntervals: 0 },
				// @lore AU27 Increment 5: `registerSessionNotReturnedNotice`'s first,
				// real registration on this eventBus instance — its one
				// `session_not_returned` subscription unsubscribes for real.
				{ unsubscribedEvents: ["session_not_returned"], clearedIntervals: 0 },
				// @lore AU21 Increment 14a: `registerSessionCostRecorder`'s owned
				// disposer (previously here, "session_ended" only) is HARD-DELETED
				// along with the rest of the cost feature — no replacement.
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
				// @lore AU26 C1: the "git-export handler" owner (its one
				// `knowledge_updated` subscription) is HARD-DELETED along with the
				// exporter — no replacement.
				// @lore AU21 Increment 14a: "cost_cap_breached"/"cost_cap_warning"
				// removed from this owner's unsubscribe list — both events are
				// HARD-DELETED along with the rest of the cost feature, no
				// replacement subscription.
				{
					unsubscribedEvents: ["notification", "item_created", "routine_fired"],
					clearedIntervals: 1,
				},
				{ unsubscribedEvents: [], clearedIntervals: 1 },
				// @lore AU21 §9 Increment 4: `bet_state_changed` (builtin routine
				// reaction) and the scheduler interval dispose separately.
				{ unsubscribedEvents: ["bet_state_changed"], clearedIntervals: 0 },
				{ unsubscribedEvents: [], clearedIntervals: 1 },
				// @lore AU21 Increment 14a: the "cost sentinel" owner (previously
				// here, ["session_ended", "session_handoff_completed"] unsubscribe +
				// 1 cleared interval) is HARD-DELETED along with the rest of the
				// cost feature — no replacement.
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
	test("createTestApp() without any options boots without throwing", async () => {
		await expect(createTestApp()).resolves.not.toThrow();
	}, 120_000);

	test("createTestApp({ serviceBootstrap: undefined }) boots without throwing", async () => {
		await expect(createTestApp({ serviceBootstrap: undefined })).resolves.not.toThrow();
	}, 120_000);

	test("GET /api/health returns 200 in kernel-only mode", async () => {
		const app = await createTestApp({ serviceBootstrap: undefined });
		const res = await app.request("/api/health");
		expect(res.status).toBe(200);
	}, 120_000);
});

describe("O3 AC-9: full boot with registerCoreDomainServices + registerAgentLayerServices", () => {
	test("createTestApp({ db, eventBus, serviceBootstrap: fullServiceBootstrap }) boots without throwing", async ({
		db,
		eventBus,
	}) => {
		const app = await createTestApp({ db, eventBus, serviceBootstrap: fullServiceBootstrap });

		void app?.request("/api/health");
	}, 120_000);

	test("GET /api/health returns 200 with full app boot (core + agent-layer services)", async ({
		db,
		eventBus,
	}) => {
		const app = await createTestApp({ db, eventBus, serviceBootstrap: fullServiceBootstrap });
		const res = await app.request("/api/health");
		expect(res.status).toBe(200);
	}, 120_000);
});
