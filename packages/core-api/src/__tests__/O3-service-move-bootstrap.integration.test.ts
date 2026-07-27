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

	test("returns the exact nine named owners and invokes every distinct cleanup effect", async ({
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
				cleanupEffect: "builtin/assistant/task/scheduler stop",
				constituents: ["builtin", "assistant", "task", "scheduler"],
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
				{
					unsubscribedEvents: [
						"task_state_changed",
						"session_ended",
						"thread_message_appended",
						"bet_state_changed",
					],
					clearedIntervals: 1,
				},
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
