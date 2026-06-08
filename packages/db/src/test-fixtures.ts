import { test as base } from "vitest";
import type { HyperIdleDb } from "./connection.js";
import { checkin, checkout } from "./test-pool.js";

export interface DbFixtures {
	db: HyperIdleDb;
}

export const test = base.extend<DbFixtures>({
	// biome-ignore lint/correctness/noEmptyPattern: vitest fixture API requires destructuring
	db: async ({}, use) => {
		const instance = await checkout();
		await use(instance.db);
		checkin(instance);
	},
});

export { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
