/**
 * Q1 — AC2: GET /api/recipients — recipient picker aggregation endpoint.
 *
 * Architecture plan §3.3: aggregates users + agents into a single list
 * for the recipient picker. Supports ?q=<search> and ?kind=agent|user filters.
 */

import {
	bets,
	createTestDb,
	type HyperIdleDb,
	products,
	sessions,
	tasks,
	teams,
	users,
} from "@hyperidle/db";
import { EventBus } from "@hyperidle/shared";
import type { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestApp } from "../../test-utils.js";

const TEST_API_KEY = "test-key-recipients";

function authHeaders(): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY };
}

describe("GET /api/recipients (Q1 §3.3)", () => {
	let db: HyperIdleDb;
	let eventBus: EventBus;
	let app: Hono;

	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		db = createTestDb();
		eventBus = new EventBus();
		app = createTestApp({ db, eventBus });

		const NOW = new Date().toISOString();

		// Seed required FK chain for sessions
		db.insert(products)
			.values({ id: "prod-1", name: "Test Product", phase: "build", createdAt: NOW })
			.run();
		db.insert(teams)
			.values({ id: "team-1", productId: "prod-1", capacity: 3, activeBets: 0, formedAt: NOW })
			.run();
		db.insert(bets)
			.values({
				id: "bet-1",
				productId: "prod-1",
				teamId: "team-1",
				pitch: "Test",
				appetite: "small",
				status: "committed",
				createdAt: NOW,
			})
			.run();
		db.insert(tasks)
			.values({
				id: "task-1",
				betId: "bet-1",
				productId: "prod-1",
				teamId: "team-1",
				title: "Task 1",
				state: "in_progress",
				createdAt: NOW,
				updatedAt: NOW,
			})
			.run();

		// Seed users (P2: agents → users table; kind:"ai" for AI agents)
		db.insert(users)
			.values({
				id: "agent-builder",
				name: "Builder Bot",
				role: "builder",
				status: "active",
				kind: "ai",
				teamId: "team-1",
				createdAt: NOW,
			})
			.run();
		db.insert(users)
			.values({
				id: "agent-growth",
				name: "Growth Engine",
				role: "growth",
				status: "idle",
				kind: "ai",
				createdAt: NOW,
			})
			.run();
		db.insert(users)
			.values({
				id: "agent-founder",
				name: "Founder Self",
				role: "founder",
				status: "active",
				kind: "human",
				createdAt: NOW,
			})
			.run();
		db.insert(users)
			.values({
				id: "agent-retired",
				name: "Retired Bot",
				role: "builder",
				status: "retired",
				kind: "ai",
				createdAt: NOW,
			})
			.run();

		// Give agent-builder an active session
		db.insert(sessions)
			.values({
				id: "sess-active",
				agentId: "agent-builder",
				taskId: "task-1",
				modelTier: "workhorse",
				state: "active",
				startedAt: NOW,
			})
			.run();
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	// AC2: endpoint returns all agents
	it("returns all agents as recipients", async () => {
		const res = await app.request("/api/recipients", { headers: authHeaders() });
		expect(res.status).toBe(200);
		const body = (await res.json()) as { recipients: Array<{ id: string }> };
		expect(Array.isArray(body.recipients)).toBe(true);
		expect(body.recipients.length).toBeGreaterThanOrEqual(4);
	});

	// AC2: each recipient has the required fields
	it("returns recipients with id, kind, name, role, status, hasActiveSession, avatarUrl", async () => {
		const res = await app.request("/api/recipients", { headers: authHeaders() });
		const body = (await res.json()) as {
			recipients: Array<{
				id: string;
				kind: string;
				name: string;
				role: string;
				status: string;
				hasActiveSession: boolean;
				avatarUrl: string | null;
			}>;
		};

		const builder = body.recipients.find((r) => r.id === "agent-builder");
		expect(builder).toBeDefined();
		expect(builder?.kind).toBe("agent");
		expect(builder?.name).toBe("Builder Bot");
		expect(builder?.role).toBe("builder");
		expect(builder?.status).toBe("active");
		expect(builder?.hasActiveSession).toBe(true);
		expect(builder?.avatarUrl).toBeNull();
	});

	// AC2: hasActiveSession is false for agents without active sessions
	it("marks hasActiveSession=false for agents without an active session", async () => {
		const res = await app.request("/api/recipients", { headers: authHeaders() });
		const body = (await res.json()) as {
			recipients: Array<{ id: string; hasActiveSession: boolean }>;
		};

		const growth = body.recipients.find((r) => r.id === "agent-growth");
		expect(growth?.hasActiveSession).toBe(false);
	});

	// AC2: ?q=<search> filters by name (case-insensitive)
	it("?q=builder filters by name (case-insensitive)", async () => {
		const res = await app.request("/api/recipients?q=builder", { headers: authHeaders() });
		const body = (await res.json()) as { recipients: Array<{ id: string; name: string }> };
		expect(body.recipients.every((r) => r.name.toLowerCase().includes("builder"))).toBe(true);
		expect(body.recipients.find((r) => r.id === "agent-growth")).toBeUndefined();
	});

	// AC2: ?q= empty string returns all
	it("?q= (empty) returns all recipients", async () => {
		const res = await app.request("/api/recipients?q=", { headers: authHeaders() });
		const body = (await res.json()) as { recipients: Array<{ id: string }> };
		expect(body.recipients.length).toBeGreaterThanOrEqual(4);
	});

	// AC2: ?kind=agent returns only agents
	it("?kind=agent returns only agents", async () => {
		const res = await app.request("/api/recipients?kind=agent", { headers: authHeaders() });
		const body = (await res.json()) as { recipients: Array<{ kind: string }> };
		expect(body.recipients.every((r) => r.kind === "agent")).toBe(true);
	});

	// Auth: requires API key
	it("returns 401 without API key", async () => {
		const res = await app.request("/api/recipients");
		expect(res.status).toBe(401);
	});

	// No match: search with no results returns empty array
	it("returns empty array when ?q= matches nothing", async () => {
		const res = await app.request("/api/recipients?q=zzz-no-match-xxx", {
			headers: authHeaders(),
		});
		const body = (await res.json()) as { recipients: Array<unknown> };
		expect(body.recipients).toEqual([]);
	});
});
