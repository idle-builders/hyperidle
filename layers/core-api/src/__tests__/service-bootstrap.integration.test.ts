import { describe } from "vitest";
import { expect, test, vi } from "../__testing__/test-fixtures.js";
import { createTestApp } from "../__testing__/test-utils.js";
import { buildCoreActions } from "../actions/compose.js";
import type { AppOptions } from "../app.js";
import { registerAgentLayerServices, registerCoreDomainServices } from "../service-bootstrap.js";

/**
 * Two owner-scoped registration functions compose the app's full service
 * set: `registerCoreDomainServices` (document/policy/review routing/
 * lifecycle propagation/retention) and `registerAgentLayerServices`
 * (dispatcher/reapers — currently registers no disposers of its own).
 *
 * `editTask`/`sendMessage` are derived from the SAME composed action list
 * `app.ts` builds, off the ctx's own `agentOrchestration`.
 */
function fullServiceBootstrap(
	ctx: Omit<
		Parameters<typeof registerCoreDomainServices>[0],
		"editTask" | "sendMessage" | "editUser"
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
	const editUserAction = actions.find((a) => a.declaration.name === "edit_user");
	if (!editUserAction) throw new Error("edit_user action not found");
	const fullCtx = {
		...ctx,
		editTask: editTaskAction.run as Parameters<typeof registerCoreDomainServices>[0]["editTask"],
		sendMessage: sendMessageAction.run as Parameters<
			typeof registerCoreDomainServices
		>[0]["sendMessage"],
		editUser: editUserAction.run as Parameters<typeof registerCoreDomainServices>[0]["editUser"],
	};
	return [...registerCoreDomainServices(fullCtx), ...registerAgentLayerServices(fullCtx)];
}

describe("registerCoreDomainServices + registerAgentLayerServices", () => {
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
		// The lifecycle-projection drain lives in `bootAgentOrchestration`
		// (`layers/agent-orchestration/src/boot.ts`) — see
		// `agent-orchestration/src/__tests__/boot-lifecycle-drain.integration.test.ts`
		// for its coverage; it is not one of `registerCoreDomainServices`'s owners.
		const expectedOwnership = [
			{
				owner: "agent-run-admission reactions",
				cleanupEffect: "unsubscribe",
				constituents: ["agent_run_admission_failed subscription"],
			},
			// There is no routine-run session-end reactions owner — a
			// subscription's wake carries no run row to finalize.
			{
				owner: "agent-health session-end reactions",
				cleanupEffect: "unsubscribe",
				constituents: ["session_ended subscription"],
			},
			{
				owner: "work session-end reactions",
				cleanupEffect: "unsubscribe",
				constituents: ["agent_run_lifecycle_changed subscription", "session_ended subscription"],
			},
			{
				owner: "work session-started reactions",
				cleanupEffect: "unsubscribe",
				constituents: ["session_started subscription"],
			},
			{
				owner: "session-not-returned notice",
				cleanupEffect: "unsubscribe",
				constituents: ["session_not_returned subscription"],
			},
			{
				owner: "lifecycle propagation registration",
				cleanupEffect: "unsubscribe",
				constituents: ["lifecycle propagation"],
			},
			{
				owner: "retention reaper",
				cleanupEffect: "interval cleared",
				constituents: ["retention interval"],
			},
			// `registerAgentLayerServices` returns no disposers at all — no
			// scheduler lives here; the assistant runs through the SAME durable
			// poller (`startRuntime`) as every other kind, wired elsewhere.
		] as const;
		const disposers = fullServiceBootstrap({
			db,
			eventBus,
			agentOrchestration,
			dispatcherDeps: {
				adapterPool: {},
				workspace: {},
				sandboxBasePath: "/tmp/bootstrap-ownership",
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
				// `registerAgentRunAdmissionReactions` is idempotent PER eventBus
				// instance — the `eventBus` test fixture already registered it
				// before this test's own `fullServiceBootstrap` call reaches it
				// here, so THIS registration is a no-op disposer (no `off()`
				// call, no interval).
				{ unsubscribedEvents: [], clearedIntervals: 0 },
				{
					unsubscribedEvents: ["session_ended"],
					clearedIntervals: 0,
				},
				{
					unsubscribedEvents: ["agent_run_lifecycle_changed", "session_ended"],
					clearedIntervals: 0,
				},
				{
					unsubscribedEvents: ["session_started"],
					clearedIntervals: 0,
				},
				{ unsubscribedEvents: ["session_not_returned"], clearedIntervals: 0 },
				{
					unsubscribedEvents: ["session_ended", "task.changed"],
					clearedIntervals: 0,
				},
				// The notification dispatcher, drain, alert-routing, daily-digest
				// worker and adapter abstraction don't exist — nothing left to
				// unsubscribe or clear.
				{ unsubscribedEvents: [], clearedIntervals: 1 },
				// `registerAgentLayerServices` registers nothing now, so there is no
				// trailing entry here.
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

describe("AppOptions.serviceBootstrap type field", () => {
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

describe("kernel-only boot (no serviceBootstrap)", () => {
	test("createTestApp() without any options boots without throwing", async () => {
		const app = await createTestApp();
		const res = await app.request("/api/health");
		expect(res.status).toBe(200);
	}, 120_000);

	test("GET /api/health returns 200 in kernel-only mode", async () => {
		const app = await createTestApp({ serviceBootstrap: undefined });
		const res = await app.request("/api/health");
		expect(res.status).toBe(200);
	}, 120_000);
});

describe("full boot with registerCoreDomainServices + registerAgentLayerServices", () => {
	test("GET /api/health returns 200 with full app boot (core + agent-layer services)", async ({
		db,
		eventBus,
	}) => {
		const app = await createTestApp({ db, eventBus, serviceBootstrap: fullServiceBootstrap });
		const res = await app.request("/api/health");
		expect(res.status).toBe(200);
	}, 120_000);
});
