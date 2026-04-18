import {
	type HyperIdleDb,
	agents,
	bets,
	createTestDb,
	products,
	tasks,
	teams,
} from "@hyperidle/db";
import { type DomainEvent, EventBus } from "@hyperidle/shared";
import type { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestApp } from "../test-utils.js";

const TEST_API_KEY = "test-key-sessions";

function authHeaders(extra?: Record<string, string>): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json", ...extra };
}

describe("Session Endpoints (E6)", () => {
	let db: HyperIdleDb;
	let eventBus: EventBus;
	let app: Hono;

	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		db = createTestDb();
		eventBus = new EventBus();
		app = createTestApp({ db, eventBus });

		// Seed required data
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
		db.insert(agents)
			.values({
				id: "agent-1",
				name: "Builder Bot",
				role: "builder",
				status: "idle",
				teamId: "team-1",
				createdAt: new Date().toISOString(),
			})
			.run();
		db.insert(bets)
			.values({
				id: "bet-1",
				productId: "prod-1",
				teamId: "team-1",
				pitch: "Test",
				appetite: "small",
				status: "committed",
				createdAt: new Date().toISOString(),
			})
			.run();
		db.insert(tasks)
			.values({
				id: "task-1",
				betId: "bet-1",
				productId: "prod-1",
				teamId: "team-1",
				title: "Test Task",
				state: "in_progress",
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			})
			.run();
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	// AC10: POST /api/sessions — create session
	describe("AC10: POST /api/sessions — create session", () => {
		it("creates a session and emits event", async () => {
			const emitted: DomainEvent[] = [];
			eventBus.on("session_started", (e) => emitted.push(e));

			const res = await app.request("/api/sessions", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					agentId: "agent-1",
					taskId: "task-1",
					modelTier: "workhorse",
				}),
			});
			expect(res.status).toBe(201);

			const body = (await res.json()) as Record<string, unknown>;
			expect(body.agentId).toBe("agent-1");
			expect(body.taskId).toBe("task-1");
			expect(body.modelTier).toBe("workhorse");
			expect(body.state).toBe("active");
			expect(body.startedAt).toBeTruthy();

			// Verify event
			expect(emitted).toHaveLength(1);
			expect(emitted[0].type).toBe("session_started");
		});

		it("returns 400 for invalid modelTier", async () => {
			const res = await app.request("/api/sessions", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					agentId: "agent-1",
					taskId: "task-1",
					modelTier: "invalid",
				}),
			});
			expect(res.status).toBe(400);
		});

		it("returns 400 for missing required fields", async () => {
			const res = await app.request("/api/sessions", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({ agentId: "agent-1" }),
			});
			expect(res.status).toBe(400);
		});
	});

	// AC11: PATCH /api/sessions/:id — update state (end, crash)
	describe("AC11: PATCH /api/sessions/:id — update session state", () => {
		async function createSession(): Promise<string> {
			const res = await app.request("/api/sessions", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					agentId: "agent-1",
					taskId: "task-1",
					modelTier: "workhorse",
				}),
			});
			const body = (await res.json()) as Record<string, unknown>;
			return body.id as string;
		}

		it("ends a session with state=done", async () => {
			const sessionId = await createSession();

			const emitted: DomainEvent[] = [];
			eventBus.on("session_ended", (e) => emitted.push(e));

			const res = await app.request(`/api/sessions/${sessionId}`, {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({ state: "done", outcome: "success", notes: "All good" }),
			});
			expect(res.status).toBe(200);

			const body = (await res.json()) as Record<string, unknown>;
			expect(body.state).toBe("done");
			expect(body.endedAt).toBeTruthy();
			expect(body.outcome).toBe("success");
			expect(body.notes).toBe("All good");

			expect(emitted).toHaveLength(1);
			expect(emitted[0].type).toBe("session_ended");
		});

		it("crashes a session with state=crashed", async () => {
			const sessionId = await createSession();

			const res = await app.request(`/api/sessions/${sessionId}`, {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({ state: "crashed" }),
			});
			expect(res.status).toBe(200);

			const body = (await res.json()) as Record<string, unknown>;
			expect(body.state).toBe("crashed");
			expect(body.endedAt).toBeTruthy();
		});

		it("returns 404 for unknown session", async () => {
			const res = await app.request("/api/sessions/nonexistent", {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({ state: "done" }),
			});
			expect(res.status).toBe(404);
		});

		it("returns 400 for invalid state", async () => {
			const sessionId = await createSession();

			const res = await app.request(`/api/sessions/${sessionId}`, {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({ state: "invalid" }),
			});
			expect(res.status).toBe(400);
		});
	});
});
