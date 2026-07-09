import { describe } from "vitest";
import type { AppOptions } from "../app.js";
import { createApp } from "../app.js";
import { bootstrapAppRuntime } from "../app-runtime/bootstrap.js";
import { expect, test } from "../test-fixtures.js";

describe("O3 AC-5: bootstrapAppRuntime", () => {
	test("is exported from app-runtime", () => {
		expect(typeof bootstrapAppRuntime).toBe("function");
	});

	test("returns an array of disposer functions when called with db and eventBus", async ({
		db,
		eventBus,
	}) => {
		const disposers = bootstrapAppRuntime({ db, eventBus });

		expect(Array.isArray(disposers)).toBe(true);
		expect(disposers.length).toBeGreaterThan(0);
		for (const d of disposers) {
			expect(typeof d).toBe("function");
		}

		for (const d of disposers) {
			d();
		}
	});

	// @lore AD8c: cost-sentinel startCostSentinel added as a disposer in app runtime. Count went from 7 to 8.
	// @lore AF6: routine-scheduler deferred disposer (Option A) added. Count 8 → 9.
	// @lore AF8: registerNotificationListener + startNotificationDrain added. Count went from 9 to 11.
	// Note: AF8 builder lore said 9→10 but AF6's scheduler disposer was already in place, so actual: 9→11.
	// @lore AF9: registerRelevanceListener added. Count 11 → 12.
	// @lore AF16 T17: startRetentionReaper added (in-process 6h TTL sweep). Count 12 → 13.
	test("returns exactly 13 disposers (one per disposer-registered service)", async ({
		db,
		eventBus,
	}) => {
		const disposers = bootstrapAppRuntime({ db, eventBus });

		expect(disposers).toHaveLength(13);

		for (const d of disposers) {
			d();
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

describe("O3 AC-9: full boot with bootstrapAppRuntime", () => {
	test("createApp({ db, eventBus, serviceBootstrap: bootstrapAppRuntime }) boots without throwing", async ({
		db,
		eventBus,
	}) => {
		const app = await createApp({ db, eventBus, serviceBootstrap: bootstrapAppRuntime });

		void app?.request("/api/health");
	}, 120_000);

	test("GET /api/health returns 200 with full app-runtime bootstrap", async ({ db, eventBus }) => {
		const app = await createApp({ db, eventBus, serviceBootstrap: bootstrapAppRuntime });
		const res = await app.request("/api/health");
		expect(res.status).toBe(200);
	}, 120_000);
});
