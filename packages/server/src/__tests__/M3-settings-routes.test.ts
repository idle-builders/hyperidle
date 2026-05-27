/**
 * M3 RED — Settings routes: GET /api/settings + PATCH /api/settings (Cluster B).
 *
 * These tests FAIL until:
 *  - createSettingsRoutes(db) is implemented in packages/server/src/routes/settings.ts
 *  - The route is mounted in app.ts at /api/settings
 *  - factorySettings are seeded with founder profile keys
 */

import { createTestDb, type HyperIdleDb, products, users ,
	type TestDbHandle
} from "@hyperidle/db";
import { EventBus } from "@hyperidle/shared";
import type { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestApp } from "../test-utils.js";

const TEST_API_KEY = "test-key-m3-settings";

function authHeaders(): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json" };
}

/**
 * @lore P2: Profile now comes from `users WHERE kind='human'` instead of
 * factorySettings founder_name/email keys. Seed a human user for profile tests.
 */
async function seedFounderProfile(db: HyperIdleDb): Promise<void> {
	const now = new Date().toISOString();
	await db.insert(users)
		.values({
			id: "test-founder-1",
			kind: "human",
			name: "Test Founder",
			email: "test@hyperidle.dev",
			role: "founder",
			status: "active",
			maxConcurrentSessions: 0,
			createdAt: now,
		})
		.onConflictDoNothing()

}

describe("M3 — GET /api/settings (B1)", () => {
	let handle: TestDbHandle;
	let db: HyperIdleDb;
	let eventBus: EventBus;
	let app: Hono;

	beforeEach(async () => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		handle = await createTestDb();
		db = handle.db;
		eventBus = new EventBus();
		app = await createTestApp({ db, eventBus });

		const now = new Date().toISOString();
		await seedFounderProfile(db);

		// Seed 2 products
		await db.insert(products)
			.values({ id: "prod-1", name: "Product Alpha", phase: "build", createdAt: now })

		await db.insert(products)
			.values({ id: "prod-2", name: "Product Beta", phase: "archived", createdAt: now })

		// Seed 2 AI users (formerly agents)
		await db.insert(users)
			.values({
				id: "agent-1",
				kind: "ai",
				name: "Builder Bot",
				role: "builder",
				status: "idle",
				createdAt: now,
			})

		await db.insert(users)
			.values({
				id: "agent-2",
				kind: "ai",
				name: "Reviewer Bot",
				role: "reviewer",
				status: "paused",
				createdAt: now,
			})

	});

	afterEach(async () => {
		vi.unstubAllEnvs();
		await handle?.close();
	});

	it("returns 200 with profile, products, users, notifications", async () => {
		const res = await app.request("/api/settings", { headers: authHeaders() });
		expect(res.status).toBe(200);

		const body = (await res.json()) as {
			profile: { name: string; email: string; avatarUrl: string | null };
			products: Array<{ id: string; name: string; active: boolean }>;
			/** @lore P2: renamed from agents. Contains AI users only. */
			users: Array<{
				id: string;
				name: string;
				autonomyLevel: string;
				paused: boolean;
			}>;
			notifications: {
				reviewAlerts: boolean;
				costAlerts: boolean;
				blockerAlerts: boolean;
			};
		};

		expect(body.profile.name).toBe("Test Founder");
		expect(body.profile.email).toBe("test@hyperidle.dev");
		expect(body.profile.avatarUrl).toBeNull();
		expect(body.products).toHaveLength(2);
		expect(body.users).toHaveLength(2);
		expect(body.notifications).toBeDefined();
	});

	it("products include active flag derived from phase (archived=inactive)", async () => {
		const res = await app.request("/api/settings", { headers: authHeaders() });
		const body = (await res.json()) as {
			products: Array<{ id: string; active: boolean }>;
		};

		const prod1 = body.products.find((p) => p.id === "prod-1");
		const prod2 = body.products.find((p) => p.id === "prod-2");
		expect(prod1?.active).toBe(true); // phase "build" → active
		expect(prod2?.active).toBe(false); // phase "archived" → inactive
	});

	it("users include paused flag derived from status", async () => {
		const res = await app.request("/api/settings", { headers: authHeaders() });
		const body = (await res.json()) as {
			users: Array<{ id: string; paused: boolean }>;
		};

		const agent1 = body.users.find((a) => a.id === "agent-1");
		const agent2 = body.users.find((a) => a.id === "agent-2");
		expect(agent1?.paused).toBe(false); // status "idle"
		expect(agent2?.paused).toBe(true); // status "paused"
	});

	it("returns 401 without API key", async () => {
		const res = await app.request("/api/settings");
		expect(res.status).toBe(401);
	});
});

describe("M3 — PATCH /api/settings persists notification preferences (B1)", () => {
	let handle: TestDbHandle;
	let db: HyperIdleDb;
	let eventBus: EventBus;
	let app: Hono;

	beforeEach(async () => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		handle = await createTestDb();
		db = handle.db;
		eventBus = new EventBus();
		app = await createTestApp({ db, eventBus });
		await seedFounderProfile(db);
	});

	afterEach(async () => {
		vi.unstubAllEnvs();
		await handle?.close();
	});

	it("PATCH with notifications.reviewAlerts=false persists and re-GET reflects change", async () => {
		// First PATCH
		const patchRes = await app.request("/api/settings", {
			method: "PATCH",
			headers: authHeaders(),
			body: JSON.stringify({
				notifications: { reviewAlerts: false },
			}),
		});
		expect(patchRes.status).toBe(200);

		// Re-GET to verify persistence
		const getRes = await app.request("/api/settings", { headers: authHeaders() });
		const body = (await getRes.json()) as {
			notifications: { reviewAlerts: boolean };
		};
		expect(body.notifications.reviewAlerts).toBe(false);
	});
});
