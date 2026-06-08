import { test as base } from "vitest";
import { checkout, checkin } from "./test-pool.js";
import type { HyperIdleDb } from "./connection.js";

export interface DbFixtures {
	db: HyperIdleDb;
}

export const test = base.extend<DbFixtures>({
	db: async ({}, use) => {
		const instance = await checkout();
		await use(instance.db);
		checkin(instance);
	},
});

export { describe, expect, it, vi, beforeEach, afterEach, beforeAll, afterAll } from "vitest";
