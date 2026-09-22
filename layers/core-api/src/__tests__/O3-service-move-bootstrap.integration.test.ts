import { EVENT_TYPES } from "@hyperidle/event-bus";
import { describe } from "vitest";
import { expect, test, vi } from "../__testing__/test-fixtures.js";
import { createTestApp } from "../__testing__/test-utils.js";
import { buildCoreActions } from "../actions/compose.js";
import type { AppOptions } from "../app.js";
import { registerAgentLayerServices, registerCoreDomainServices } from "../service-bootstrap.js";

/**
 * AU11: former app-runtime `bootstrapAppRuntime` split into two owner-scoped
 * registration functions (server-factory.ts) — `registerCoreDomainServices`
 * (document/notifications/policy/routine-scheduler) and
 * `registerAgentLayerServices` (builtin-routine handlers/dispatcher/reapers —
 * AU21 Increment 14a: cost-cap sentinel HARD-DELETED, no replacement).
 * Composing them replicates the exact same disposer set bootstrapAppRuntime
 * returned; only the grouping is new.
 *
 * `editTask`/`sendMessage` are derived from the SAME composed action list
 * `app.ts` builds, off the ctx's own `agentOrchestration`.
 */
function fullServiceBootstrap(
	ctx: Omit<
		Parameters<typeof registerCoreDomainServices>[0],
		"editTask" | "sendMessage" | "adjustThread"
	>,
): Array<() => void> {
	const actions = buildCoreActions({
		agentOrchestration: ctx.agentOrchestration,
		agentWorkIntentRecorder: async () => ({ id: "noop", idempotencyKey: "noop" }),
		reviewVerdictRecorder: async () => ({ status: "not_a_review_session" }),
	});
	const editTaskAction = actions.find((a) => a.declaration.name === "edit_task");
	if (!editTaskAction) throw new Error("edit_task action not found");
	const sendMessageAction = actions.find((a) => a.declaration.name === "send_message");
	if (!sendMessageAction) throw new Error("send_message action not found");
	const adjustThreadAction = actions.find((a) => a.declaration.name === "adjust_thread");
	if (!adjustThreadAction) throw new Error("adjust_thread action not found");
	const fullCtx = {
		...ctx,
		editTask: editTaskAction.run as Parameters<typeof registerCoreDomainServices>[0]["editTask"],
		sendMessage: sendMessageAction.run as Parameters<
			typeof registerCoreDomainServices
		>[0]["sendMessage"],
		adjustThread: adjustThreadAction.run as Parameters<
			typeof registerCoreDomainServices
		>[0]["adjustThread"],
	};
	return [...registerCoreDomainServices(fullCtx), ...registerAgentLayerServices(fullCtx)];
}

describe("O3 AC-5: registerCoreDomainServices + registerAgentLayerServices", () => {
	test("both are exported as functions", () => {
		expect(typeof registerCoreDomainServices).toBe("function");
		expect(typeof registerAgentLayerServices).toBe("function");
	});

	test("returns an array of disposer functions when called with db and eventBus", async ({
		db,
		eventBus,
		agentOrchestration,
	}) => {
		const disposers = fullServiceBootstrap({ db, eventBus, agentOrchestration });

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
		agentOrchestration,
	}) => {
		type OwnedDisposer = (() => void) & {
			readonly owner: string;
			readonly cleanupEffect: string;
			readonly constituents: readonly string[];
		};
		const expectedOwnership = [
			// @lore AU31 B2 (§5, §12 lifecycle-drain cluster): "lifecycle-projection
			// drain" relocated into `bootAgentOrchestration`
			// (`layers/agent-orchestration/src/boot.ts`) — it is no longer one of
			// `registerCoreDomainServices`'s named owners. See
			// `agent-orchestration/src/__tests__/boot-lifecycle-drain.integration.test.ts`
			// for its new home's coverage.
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
			// @lore Thread module step 4 (8ca3e03f6): "assistant thread pin
			// reaction" and "assistant-turn B‴ coherence trigger" are
			// HARD-DELETED with `assistant-thread-pin-reaction.ts`/
			// `assistant-turn-coherence-trigger.ts` — the wake rule
			// (`agentsToWake`) replaces the structural `ast-` recognition both
			// depended on; no coherence re-bake replaces them.
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
			// @lore AU20 row 38/40: the "relevance listener" (knowledge_accessed
			// subscriber that called recomputeRelevance) is HARD-DELETED — the
			// whole relevance engine goes. The knowledge_accessed event itself
			// was later retired outright — the knowledge read route no longer
			// emits it.
			// @lore BC3 architecture.md §5 R2: `register-policy.ts`/`registerPolicy`
			// (which collapsed `registerPolicyEngine` + `registerLifecyclePropagation`
			// into one "policy registration" owner) is DELETED with the policy
			// engine — one registration is no longer worth collapsing, so the owner
			// is renamed to what it now is, `registerLifecyclePropagation` alone.
			{
				owner: "lifecycle propagation registration",
				cleanupEffect: "unsubscribe",
				// @lore AU44 batch6: "retry interval" removed — 30s heartbeat deleted with propagation_log.
				constituents: ["lifecycle propagation"],
			},
			// @lore BC3 architecture.md §5 B7: the "notifications installation"
			// owner (`installNotifications`'s inbox-enqueue listener) is
			// HARD-DELETED — its only production trigger was the policy engine's
			// "attention" event, deleted with the `items` table (R2). No
			// replacement registration.
			{
				owner: "retention reaper",
				cleanupEffect: "interval cleared",
				constituents: ["retention interval"],
			},
			// `registerAgentLayerServices` boots one lifecycle — the assistant
			// runs through the SAME durable poller (`startRuntime`) as every
			// other kind.
			// @lore BA9d wave 3: "builtin routine reactions" (bet_state_changed
			// subscription) was deleted in commit aa260893c — no owner entry here.
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
			agentOrchestration,
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
		// off is private — cast through any to observe cleanup without making the method public.
		// biome-ignore lint/suspicious/noExplicitAny: test-only spy on a private method; keeping it public is worse
		const off = vi.spyOn(eventBus as any, "off") as unknown as {
			mock: { calls: [string, unknown][] };
			mockRestore(): void;
		};
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
				// @lore AU31 B2: the "lifecycle-projection drain" entry (previously
				// first, `clearedIntervals: 1`) relocated into
				// `bootAgentOrchestration` — see this file's `expectedOwnership`
				// note above.
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
				// @lore Thread module step 4 (8ca3e03f6): the two no-op disposer
				// entries for `registerAssistantThreadPinReaction`/
				// `registerAssistantTurnCoherenceTrigger` are removed — both
				// registrations are HARD-DELETED, no replacement.
				// @lore AU27 Increment 5: `registerSessionNotReturnedNotice`'s first,
				// real registration on this eventBus instance — its one
				// `session_not_returned` subscription unsubscribes for real.
				{ unsubscribedEvents: ["session_not_returned"], clearedIntervals: 0 },
				// @lore AU21 Increment 14a: `registerSessionCostRecorder`'s owned
				// disposer (previously here, "session_ended" only) is HARD-DELETED
				// along with the rest of the cost feature — no replacement.
				// @lore AU20 row 38/40: the "relevance listener" disposer
				// ({ unsubscribedEvents: ["knowledge_accessed"], clearedIntervals: 0 })
				// is removed here — the listener itself was deleted with the
				// whole relevance engine.
				{
					// @lore AU44 batch6: clearedIntervals 1→0 — the 30s retry
					// heartbeat (retryFailedPropagations) is deleted with propagation_log.
					// @lore BB1: bet_state_changed subscription removed with the bet entity.
					// @lore BC3 architecture.md §5: "item_created" removed —
					// lifecycle-propagation never subscribed to it; the event type
					// itself is deleted with the `items` table.
					unsubscribedEvents: ["session_ended", "task_state_changed"],
					clearedIntervals: 0,
				},
				// @lore AU26 C1: the "git-export handler" owner (its one
				// `knowledge_updated` subscription) is HARD-DELETED along with the
				// exporter — no replacement.
				// @lore AU21 Increment 14a: "cost_cap_breached"/"cost_cap_warning"
				// removed from this owner's unsubscribe list — both events are
				// HARD-DELETED along with the rest of the cost feature, no
				// replacement subscription.
				// @lore AU44 batch 4: notifications simplified — dispatcher, drain,
				// alert-routing (item_created), daily-digest worker (routine_fired),
				// and adapter abstraction all removed per FULL-AUDIT.md rows 5452-5453.
				// @lore BC3 architecture.md §5 B7: the "notification" subscription
				// entry (installNotifications' inbox-enqueue listener) is removed —
				// the listener itself is HARD-DELETED, no replacement registration.
				{ unsubscribedEvents: [], clearedIntervals: 1 },
				// @lore BA9d wave 3: "builtin routine reactions" bet_state_changed
				// subscription deleted in commit aa260893c — no entry here.
				// @lore BA1 D2: `registerRoutineEventMatcher` replaces
				// `registerEventTriggers` — one `eventBus.on` per EVENT_TYPES
				// member (34, always, regardless of what is in `routines`), not
				// one per seeded routine (zero, on this fresh test DB, under the
				// old code — hence the previously-empty list here). `unwind()`
				// unsubscribes in REVERSE registration order, so this is
				// `EVENT_TYPES` reversed.
				{
					unsubscribedEvents: [...EVENT_TYPES].reverse(),
					clearedIntervals: 1,
				},
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
