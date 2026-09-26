import { EventBus } from "@hyperidle/event-bus";
import { test as base } from "@hyperidle/db/test-fixtures";
import { createThreadActions } from "../thread-actions.js";
import type { Action } from "../action-types.js";
import { fakeThreadActionsDeps } from "./fake-thread-actions-deps.js";

export interface ThreadFixtures {
	eventBus: EventBus;
	actions: readonly Action[];
}

/**
 * `actions` composes `createThreadActions` over `fakeThreadActionsDeps()` -
 * every test in this module shares the same fake wiring; a test that needs a
 * different fake behavior (e.g. a controllable `reviewVerdictRecorder`)
 * builds its own list with `createThreadActions(fakeThreadActionsDeps({...}))`
 * instead of using this fixture.
 */
export const test = base.extend<ThreadFixtures>({
	eventBus: async ({}, use) => {
		await use(new EventBus());
	},
	actions: async ({}, use) => {
		await use(createThreadActions(fakeThreadActionsDeps()) as readonly Action[]);
	},
});

export { describe, expect, vi } from "vitest";
