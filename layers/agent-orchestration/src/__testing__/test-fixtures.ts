/**
 * `agent-orchestration`'s own vitest fixtures.
 *
 * @lore agent-orchestration→core-api import forbidden by anti-regrowth guard; only EventBus fixture needed here; DB tests use @hyperidle/db/test-fixtures directly
 */

import { EventBus } from "@hyperidle/event-bus";
import { test as base } from "vitest";

export interface OrchestrationFixtures {
	eventBus: EventBus;
}

export const test = base.extend<OrchestrationFixtures>({
	eventBus: async ({}, use) => {
		await use(new EventBus());
	},
});

export { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
