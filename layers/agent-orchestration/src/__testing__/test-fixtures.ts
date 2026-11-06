/**
 * `agent-orchestration`'s own vitest fixtures.
 *
 */

import { test as dbTest } from "@hyperidle/db/test-fixtures";
import { EventBus } from "@hyperidle/event-bus";
import type { RunnerDb } from "@hyperidle/runner-db";
import { checkin, checkout } from "@hyperidle/runner-db/test-fixtures";

export interface OrchestrationFixtures {
	eventBus: EventBus;
	runnerDb: RunnerDb;
}

export const test = dbTest.extend<OrchestrationFixtures>({
	eventBus: async ({}, use) => {
		await use(new EventBus());
	},
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
