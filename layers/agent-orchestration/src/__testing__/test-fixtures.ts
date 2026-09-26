/**
 * `agent-orchestration`'s own vitest fixtures.
 *
 * @lore This Layer's tests cannot use `layers/core-api`'s `test-fixtures.ts`
 * — that would be an `agent-orchestration -> core-api` import, an edge the
 * anti-regrowth guard forbids. The only fixture anything here needs so far
 * is a fresh `EventBus` per test; a test that needs a real DB uses
 * `@hyperidle/db/test-fixtures` directly.
 */

import { EventBus } from "@hyperidle/event-bus";
import { test as base } from "vitest";

export interface OrchestrationFixtures {
	eventBus: EventBus;
}

export const test = base.extend<OrchestrationFixtures>({
	// biome-ignore lint/correctness/noEmptyPattern: vitest's fixture signature requires the destructured first arg
	eventBus: async ({}, use) => {
		await use(new EventBus());
	},
});

export { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
