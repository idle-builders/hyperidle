import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { HyperIdleDb } from "@hyperidle/db";
import { type DbFixtures, test as dbTest } from "@hyperidle/db/test-fixtures";
import { EventBus } from "@hyperidle/event-bus";
import { findUserByKey, giveUserKey, newUserKey } from "@hyperidle/user";
import type { Hono } from "hono";
import { disposeApp } from "../app.js";
import { registerTestRoutes } from "./test-routes.js";
import { createTestApp } from "./test-utils.js";

let nextFixtureAppId = 0;
/** Each fixture app's default key, so `asPerson` can make it someone's own key. */
const appKeys = new WeakMap<Hono, string>();

export interface IntegrationFixtures extends DbFixtures {
	app: Hono;
	/** Send a request without the fixture's default API key for auth rejection tests. */
	requestWithoutAuth: Hono["request"];
	/**
	 * Make `userId` the one every request through `app` (or the app given) speaks as — the
	 * fixture's default key becomes their own key. Without it the key is nobody yet.
	 */
	asPerson: (userId: string, through?: Hono) => Promise<void>;
	eventBus: EventBus;
	/**
	 * BA9d D12: a per-test app instance with a temp `pluginsBaseDir` set,
	 * so `installPlugin` persists files to disk and skills can be restored.
	 * Use instead of `app` in tests that need to exercise the restore route.
	 */
	pluginsApp: Hono;
}

export function withoutServiceTestAuth(
	transport: (request: Request) => Response | Promise<Response>,
): (request: Request) => Promise<Response> {
	return (request) => {
		const headers = new Headers(request.headers);
		headers.set("X-HyperIdle-Test-Without-Auth", "true");
		return Promise.resolve(transport(new Request(request, { headers })));
	};
}

export async function createServiceTestApp(
	db: HyperIdleDb,
	eventBus: EventBus,
	pluginsBaseDir?: string,
): Promise<{ app: Hono; authApiKey: string }> {
	const authApiKey = `hyperidle-service-test-${++nextFixtureAppId}`;
	const app = await createTestApp({
		db,
		eventBus,
		authApiKey,
		registerExtraRoutes: registerTestRoutes,
		pluginsBaseDir,
	});
	const rawFetch = app.fetch.bind(app);
	app.fetch = (request, env, executionCtx) => {
		const headers = new Headers(request.headers);
		const omitDefaultAuth = headers.has("X-HyperIdle-Test-Without-Auth");
		headers.delete("X-HyperIdle-Test-Without-Auth");
		if (!omitDefaultAuth) headers.set("X-API-Key", authApiKey);
		return rawFetch(new Request(request, { headers }), env, executionCtx);
	};
	appKeys.set(app, authApiKey);
	return { app, authApiKey };
}

export const test = dbTest.extend<Omit<IntegrationFixtures, keyof DbFixtures>>({
	eventBus: async ({}, use) => {
		const eventBus = new EventBus();
		await use(eventBus);
	},
	app: async ({ db, eventBus }, use) => {
		const { app } = await createServiceTestApp(db, eventBus);
		await use(app);
		disposeApp(app);
	},
	requestWithoutAuth: async ({ app }, use) => {
		await use((input, requestInit, env, executionCtx) => {
			const headers = new Headers(requestInit?.headers);
			headers.set("X-HyperIdle-Test-Without-Auth", "true");
			return app.request(input, { ...requestInit, headers }, env, executionCtx);
		});
	},
	asPerson: async ({ app, db }, use) => {
		await use(async (userId, through = app) => {
			const key = appKeys.get(through);
			if (!key) throw new Error("asPerson: not a fixture app");
			// One key is one person: whoever held it gets a fresh one.
			const holder = await findUserByKey(db, key);
			if (holder && holder.id !== userId) await giveUserKey(db, holder.id, newUserKey());
			await giveUserKey(db, userId, key);
		});
	},
	pluginsApp: async ({ db, eventBus }, use) => {
		const pluginsBaseDir = join(
			tmpdir(),
			`plugins-fixture-${Date.now()}-${Math.random().toString(36).slice(2)}`,
		);
		mkdirSync(pluginsBaseDir, { recursive: true });
		const { app } = await createServiceTestApp(db, eventBus, pluginsBaseDir);
		await use(app);
		disposeApp(app);
		try {
			rmSync(pluginsBaseDir, { recursive: true, force: true });
		} catch {}
	},
});

export { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
