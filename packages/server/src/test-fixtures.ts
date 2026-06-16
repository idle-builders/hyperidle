import { type DbFixtures, test as dbTest } from "@hyperidle/db/test-fixtures";
import { EventBus } from "@hyperidle/shared";
import { minimalStrategy } from "@hyperidle/strategy-minimal";
import type { Hono } from "hono";
import { createApp, disposeApp } from "./app.js";
import {
	clearActiveStrategy,
	getActiveStrategyOrNull,
	setActiveStrategy,
} from "./services/strategy-registry.js";

export interface IntegrationFixtures extends DbFixtures {
	app: Hono;
	eventBus: EventBus;
}

export const test = dbTest.extend<Omit<IntegrationFixtures, keyof DbFixtures>>({
	eventBus: async ({}, use) => {
		await use(new EventBus());
	},
	app: async ({ db, eventBus }, use) => {
		// AK6 T8: POST /api/teams and POST /api/users route through the Strategy port.
		// Register Minimal as the default ONLY when no strategy is already registered.
		// Tests that register their own strategy in beforeEach run BEFORE fixture setup
		// in Vitest's execution model; the null-check respects those prior registrations.
		// @lore AK6: Vitest execution order: describe beforeEach → fixture setup → test body
		// → fixture teardown → afterEach. The fixture must not overwrite a strategy already
		// set by a describe-level beforeEach.
		const alreadyRegistered = getActiveStrategyOrNull() !== null;
		if (!alreadyRegistered) {
			setActiveStrategy(minimalStrategy);
		}
		const registeredByFixture = !alreadyRegistered;
		const app = await createApp({ db, eventBus });
		await use(app);
		disposeApp(app);
		// Only clear the strategy if WE registered it (to not interfere with afterEach cleanup)
		if (registeredByFixture) {
			clearActiveStrategy();
		}
	},
});

export { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
