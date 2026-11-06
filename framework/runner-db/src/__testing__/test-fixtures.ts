import { test as base } from "vitest";
import type { RunnerDb } from "../connection.js";
import { checkin, checkout } from "./test-pool.js";

export { checkin, checkout } from "./test-pool.js";

export interface RunnerDbFixtures {
	db: RunnerDb;
}

export const test = base.extend<RunnerDbFixtures>({
	db: async ({}, use) => {
		const instance = await checkout();
		try {
			await use(instance.db);
		} finally {
			checkin(instance);
		}
	},
});

export { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
