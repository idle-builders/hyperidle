/**
 * L8 — System Stability endpoint.
 *
 * Acceptance:
 * - GET /api/system/stability returns `{ crashed_sessions, cap_reached, api_degraded }`.
 * - All three counts are non-negative integers.
 * - Empty/zero state returns zeros (no fixture seeded).
 * - Crashed sessions count comes from sessions.state === 'crashed'.
 * - cap_reached comes from factory_settings key `system_stability.cap_reached_products`
 *   (count of products at cap).
 * - api_degraded comes from factory_settings key `system_stability.api_degraded`
 *   (1 = degraded, 0 = healthy).
 */

import {
	agents,
	bets,
	createTestDb,
	factorySettings,
	type HyperIdleDb,
	products,
	sessions,
	tasks,
	teams,
} from "@hyperidle/db";
import { EventBus } from "@hyperidle/shared";
import type { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestApp } from "../test-utils.js";

const TEST_API_KEY = "test-key-stability";

function authHeaders(): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json" };
}

describe("System Stability Endpoint (L8)", () => {
	let db: HyperIdleDb;
	let eventBus: EventBus;
	let app: Hono;

	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		db = createTestDb();
		eventBus = new EventBus();
		app = createTestApp({ db, eventBus });

		db.insert(products)
			.values({
				id: "prod-1",
				name: "Test Product",
				phase: "build",
				createdAt: new Date().toISOString(),
			})
			.run();
		db.insert(teams)
			.values({
				id: "team-1",
				productId: "prod-1",
				capacity: 3,
				activeBets: 0,
				formedAt: new Date().toISOString(),
			})
			.run();
		db.insert(bets)
			.values({
				id: "bet-1",
				productId: "prod-1",
				teamId: "team-1",
				pitch: "X",
				appetite: "small",
				status: "in_progress",
				createdAt: new Date().toISOString(),
			})
			.run();
		db.insert(agents)
			.values({
				id: "agent-1",
				name: "A",
				role: "builder",
				status: "active",
				createdAt: new Date().toISOString(),
			})
			.run();
		db.insert(tasks)
			.values({
				id: "task-1",
				betId: "bet-1",
				productId: "prod-1",
				teamId: "team-1",
				ownerAgentId: "agent-1",
				title: "T",
				state: "in_progress",
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			})
			.run();
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("returns zeros when no instability", async () => {
		const res = await app.request("/api/system/stability", { headers: authHeaders() });
		expect(res.status).toBe(200);
		const body = (await res.json()) as Record<string, unknown>;
		expect(body.crashed_sessions).toBe(0);
		expect(body.cap_reached).toBe(0);
		expect(body.api_degraded).toBe(0);
	});

	it("counts sessions in state 'crashed' as crashed_sessions", async () => {
		db.insert(sessions)
			.values({
				id: "sess-1",
				taskId: "task-1",
				agentId: "agent-1",
				modelTier: "small",
				startedAt: new Date().toISOString(),
				state: "crashed",
			})
			.run();
		db.insert(sessions)
			.values({
				id: "sess-2",
				taskId: "task-1",
				agentId: "agent-1",
				modelTier: "small",
				startedAt: new Date().toISOString(),
				state: "crashed",
			})
			.run();
		db.insert(sessions)
			.values({
				id: "sess-3",
				taskId: "task-1",
				agentId: "agent-1",
				modelTier: "small",
				startedAt: new Date().toISOString(),
				state: "completed",
			})
			.run();

		const res = await app.request("/api/system/stability", { headers: authHeaders() });
		const body = (await res.json()) as Record<string, unknown>;
		expect(body.crashed_sessions).toBe(2);
	});

	it("reads cap_reached from factorySettings key system_stability.cap_reached_products", async () => {
		db.insert(factorySettings)
			.values({
				key: "system_stability.cap_reached_products",
				value: "3",
				updatedAt: new Date().toISOString(),
			})
			.run();
		const res = await app.request("/api/system/stability", { headers: authHeaders() });
		const body = (await res.json()) as Record<string, unknown>;
		expect(body.cap_reached).toBe(3);
	});

	it("reads api_degraded from factorySettings key system_stability.api_degraded", async () => {
		db.insert(factorySettings)
			.values({
				key: "system_stability.api_degraded",
				value: "1",
				updatedAt: new Date().toISOString(),
			})
			.run();
		const res = await app.request("/api/system/stability", { headers: authHeaders() });
		const body = (await res.json()) as Record<string, unknown>;
		expect(body.api_degraded).toBe(1);
	});

	it("returns non-negative integers for malformed settings", async () => {
		db.insert(factorySettings)
			.values({
				key: "system_stability.cap_reached_products",
				value: "not-a-number",
				updatedAt: new Date().toISOString(),
			})
			.run();
		const res = await app.request("/api/system/stability", { headers: authHeaders() });
		const body = (await res.json()) as Record<string, unknown>;
		expect(body.cap_reached).toBe(0);
	});
});
