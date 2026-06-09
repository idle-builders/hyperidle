import { bootstrapFabric } from "@hyperidle/fabric";
import { describe } from "vitest";
import type { AppOptions } from "../app.js";
import { createApp } from "../app.js";
import { expect, test } from "../test-fixtures.js";

describe("O3 AC-5: bootstrapFabric", () => {
	test("is exported from @hyperidle/fabric", () => {
		expect(typeof bootstrapFabric).toBe("function");
	});

	test("returns an array of disposer functions when called with db and eventBus", async ({
		db,
		eventBus,
	}) => {
		const disposers = bootstrapFabric({ db, eventBus });

		expect(Array.isArray(disposers)).toBe(true);
		expect(disposers.length).toBeGreaterThan(0);
		for (const d of disposers) {
			expect(typeof d).toBe("function");
		}

		for (const d of disposers) {
			d();
		}
	});

	// @lore AD8c: cost-sentinel startCostSentinel added as a disposer in bootstrapFabric.
	// Count went from 7 to 8.
	test("returns exactly 8 disposers (one per disposer-registered service)", async ({
		db,
		eventBus,
	}) => {
		const disposers = bootstrapFabric({ db, eventBus });

		expect(disposers).toHaveLength(8);

		for (const d of disposers) {
			d();
		}
	});
});

describe("O3 AC-6: AppOptions.strategyBootstrap type field", () => {
	test("AppOptions accepts strategyBootstrap as a function", async ({ db, eventBus }) => {
		const options: AppOptions = {
			db,
			eventBus,
			strategyBootstrap: ({ db: d, eventBus: eb }) => {
				void d;
				void eb;
				return [() => {}];
			},
		};
		expect(typeof options.strategyBootstrap).toBe("function");
	});

	test("AppOptions accepts strategyBootstrap: undefined (kernel-only mode)", () => {
		const options: AppOptions = {
			strategyBootstrap: undefined,
		};
		expect(options.strategyBootstrap).toBeUndefined();
	});
});

describe("O3 AC-8: kernel-only boot (no strategyBootstrap)", () => {
	test("createApp() without any options boots without throwing", async () => {
		await expect(createApp()).resolves.not.toThrow();
	}, 120_000);

	test("createApp({ strategyBootstrap: undefined }) boots without throwing", async () => {
		await expect(createApp({ strategyBootstrap: undefined })).resolves.not.toThrow();
	}, 120_000);

	test("GET /api/health returns 200 in kernel-only mode", async () => {
		const app = await createApp({ strategyBootstrap: undefined });
		const res = await app.request("/api/health");
		expect(res.status).toBe(200);
	}, 120_000);
});

describe("O3 AC-9: full boot with bootstrapFabric", () => {
	test("createApp({ db, eventBus, strategyBootstrap: bootstrapFabric }) boots without throwing", async ({
		db,
		eventBus,
	}) => {
		const app = await createApp({ db, eventBus, strategyBootstrap: bootstrapFabric });

		void app?.request("/api/health");
	}, 120_000);

	test("GET /api/health returns 200 with full strategy bootstrap", async ({ db, eventBus }) => {
		const app = await createApp({ db, eventBus, strategyBootstrap: bootstrapFabric });
		const res = await app.request("/api/health");
		expect(res.status).toBe(200);
	}, 120_000);
});
