import { test as dbTest } from "@hyperidle/db/test-fixtures";
import type { RunnerDb } from "@hyperidle/runner-db";
import { checkin, checkout } from "@hyperidle/runner-db/test-fixtures";

export const test = dbTest.extend<{ runnerDb: RunnerDb }>({
	runnerDb: async ({}, use) => {
		const instance = await checkout();
		try {
			await use(instance.db);
		} finally {
			checkin(instance);
		}
	},
});

export { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
