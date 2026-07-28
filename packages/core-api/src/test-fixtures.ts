import { type DbFixtures, test as dbTest } from "@hyperidle/db/test-fixtures";
import { EventBus } from "@hyperidle/shared";
import type { Hono } from "hono";
import { createApp, disposeApp } from "./app.js";
import { registerAgentRunAdmissionReactions } from "./services/agent-run-admission-reactions.js";

export interface IntegrationFixtures extends DbFixtures {
	app: Hono;
	eventBus: EventBus;
}

export const test = dbTest.extend<Omit<IntegrationFixtures, keyof DbFixtures>>({
	// @lore AU21 Increment 3 Wave 0: core-api's `agent_run_admission_failed`
	// reactions are wired here. Production wires the SAME registration inside
	// `registerCoreDomainServices` (`server-factory.ts`), reached only via
	// `createServer`'s `serviceBootstrap` — the plain `createApp` this
	// fixture's `app` below builds does NOT invoke that bootstrap, so wiring
	// it here (rather than requiring every test to call
	// `registerAgentRunAdmissionReactions` by hand, the way
	// `registerPolicy`/`registerReviewSubscriptions` are called explicitly per
	// test today) is what lets a bare `{ db, eventBus }` test observe the real
	// reaction without booting the whole app. `registerAgentRunAdmissionReactions`'s
	// per-eventBus-instance idempotency guard means this is still safe even if
	// a future change makes `createServer`'s boot path reachable from a test
	// sharing the same eventBus instance.
	eventBus: async ({ db }, use) => {
		const eventBus = new EventBus();
		const unregister = registerAgentRunAdmissionReactions(db, eventBus);
		await use(eventBus);
		unregister();
	},
	app: async ({ db, eventBus }, use) => {
		const app = await createApp({ db, eventBus });
		await use(app);
		disposeApp(app);
	},
});

export { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
