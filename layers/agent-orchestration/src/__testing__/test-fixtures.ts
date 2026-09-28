/**
 * `agent-orchestration`'s own vitest fixtures.
 *
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
