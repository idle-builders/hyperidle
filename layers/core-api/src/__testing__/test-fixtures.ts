import { registerAssistantThreadPinReaction } from "@hyperidle/conversation";
import type { HyperIdleDb } from "@hyperidle/db";
import { type DbFixtures, test as dbTest } from "@hyperidle/db/test-fixtures";
import { EventBus } from "@hyperidle/shared";
import { findUser } from "@hyperidle/users";
import type { Hono } from "hono";
import { disposeApp } from "../app.js";
import { registerAgentRunAdmissionReactions } from "../services/agent-run-admission-reactions.js";
import { registerAssistantTurnCoherenceTrigger } from "../services/assistant-turn-coherence-trigger.js";
import { registerTestRoutes } from "./test-routes.js";
import { createTestApp } from "./test-utils.js";

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
	//
	// @lore AU21 §9 Increment 11 (Decision H2/F4, Wave B): the assistant-thread
	// pin reaction (`@hyperidle/conversation`'s `registerAssistantThreadPinReaction`)
	// and the B‴ coherence re-bake trigger (`assistant-turn-coherence-trigger.ts`)
	// are wired here for the SAME reason — production wires the SAME two
	// registrations inside `registerCoreDomainServices` (`server-factory.ts`).
	eventBus: async ({ db }, use) => {
		const eventBus = new EventBus();
		const unregister = registerAgentRunAdmissionReactions(db, eventBus);
		const unregisterPin = registerAssistantThreadPinReaction(db, eventBus, {
			findUserById: (execDb: HyperIdleDb, id: string) => findUser(execDb, { id }),
		});
		const unregisterCoherence = registerAssistantTurnCoherenceTrigger(db, eventBus);
		await use(eventBus);
		unregisterCoherence();
		unregisterPin();
		unregister();
	},
	// @lore AU26 B1b: the fixture is an Application — it delegates to
	// `createTestApp`, the single test-harness composition site, which boots BOTH
	// Layers, applies the middleware stack and mounts both apps on one `/api`
	// router exactly as `remote-server`'s `createServer` does. Without the second
	// Layer the four `/api/sessions` routes that moved onto agent-orchestration's
	// app would 404 for every fixture-based test. Both Layers' teardown rides
	// `disposeApp`'s bag.
	app: async ({ db, eventBus }, use) => {
		// @lore AU28: the middleware-exercising routes (/protected-test, /test-validate,
		// /test-error) are mounted from here — the development world registering into
		// production. `app.ts` no longer imports them.
		const app = await createTestApp({ db, eventBus, registerExtraRoutes: registerTestRoutes });
		await use(app);
		disposeApp(app);
	},
});

export { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
