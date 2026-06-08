import { type DbFixtures, test as dbTest } from "@hyperidle/db/test-fixtures";
import { EventBus } from "@hyperidle/shared";
import type { Hono } from "hono";
import { createApp, disposeApp } from "./app.js";

export interface IntegrationFixtures extends DbFixtures {
	app: Hono;
	eventBus: EventBus;
}

export const test = dbTest.extend<Omit<IntegrationFixtures, keyof DbFixtures>>({
	eventBus: async ({}, use) => {
		await use(new EventBus());
	},
	app: async ({ db, eventBus }, use) => {
		const app = await createApp({ db, eventBus });
		await use(app);
		disposeApp(app);
	},
});

export { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
