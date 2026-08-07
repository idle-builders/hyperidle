import { bets, tasks, teamMembers, teams, users } from "@hyperidle/db";
import type { DomainEvent } from "@hyperidle/shared";
import { afterEach, beforeEach, describe, vi } from "vitest";
import { expect, test } from "../__testing__/test-fixtures.js";
import { createTestApp } from "../__testing__/test-utils.js";
import { disposeApp } from "../app.js";
import { registerAgentLayerServices, registerCoreDomainServices } from "../service-bootstrap.js";

const TEST_API_KEY = "test-key-sessions";

/**
 * AU11: former app-runtime `bootstrapAppRuntime` split into two owner-scoped
 * registration functions (server-factory.ts). Compose them for tests that
 * need the full boot wire, replicating the exact prior disposer set.
 */
function testServiceBootstrap(
	ctx: Parameters<typeof registerCoreDomainServices>[0],
): Array<() => void> {
	return [...registerCoreDomainServices(ctx), ...registerAgentLayerServices(ctx)];
}

function authHeaders(extra?: Record<string, string>): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json", ...extra };
}

describe("Session Endpoints (E6)", () => {
	beforeEach(async () => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});

	afterEach(async () => {
		vi.unstubAllEnvs();
	});

	// AC10: POST /api/sessions — create session
	describe("AC10: POST /api/sessions — create session", () => {
		test("creates a session and emits event", async ({ db, eventBus }) => {
			const app = await createTestApp({ db, eventBus, serviceBootstrap: testServiceBootstrap });
			try {
				// Seed required data
				await db.insert(teams).values({
					id: "prod-1",
					name: "Test Product",
					phase: "build",
					createdAt: new Date().toISOString(),
				});
				await db.insert(teamMembers).values({
					id: "team-1",
					teamId: "prod-1",
					capacity: 3,
					activeBets: 0,
					formedAt: new Date().toISOString(),
				});
				await db.insert(users).values({
					id: "agent-1",
					name: "Builder Bot",
					role: "builder",
					status: "idle",
					teamId: "team-1",
					createdAt: new Date().toISOString(),
				});
				await db.insert(bets).values({
					id: "bet-1",
					teamId: "prod-1",
					description: "Test",
					appetite: "small",
					status: "active",
					createdAt: new Date().toISOString(),
				});
				await db.insert(tasks).values({
					id: "task-1",
					betId: "bet-1",
					teamId: "prod-1",
					title: "Test Task",
					state: "in_progress",
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
				});

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
				expect(emitted[0]!.type).toBe("session_started");
			} finally {
				disposeApp(app);
			}
		});

		test("returns 400 for invalid modelTier", async ({ db, eventBus }) => {
			const app = await createTestApp({ db, eventBus, serviceBootstrap: testServiceBootstrap });
			try {
				await db.insert(teams).values({
					id: "prod-1",
					name: "Test Product",
					phase: "build",
					createdAt: new Date().toISOString(),
				});
				await db.insert(teamMembers).values({
					id: "team-1",
					teamId: "prod-1",
					capacity: 3,
					activeBets: 0,
					formedAt: new Date().toISOString(),
				});
				await db.insert(users).values({
					id: "agent-1",
					name: "Builder Bot",
					role: "builder",
					status: "idle",
					teamId: "team-1",
					createdAt: new Date().toISOString(),
				});
				await db.insert(bets).values({
					id: "bet-1",
					teamId: "prod-1",
					description: "Test",
					appetite: "small",
					status: "active",
					createdAt: new Date().toISOString(),
				});
				await db.insert(tasks).values({
					id: "task-1",
					betId: "bet-1",
					teamId: "prod-1",
					title: "Test Task",
					state: "in_progress",
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
				});

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
			} finally {
				disposeApp(app);
			}
		});

		test("returns 400 for missing required fields", async ({ db, eventBus }) => {
			const app = await createTestApp({ db, eventBus, serviceBootstrap: testServiceBootstrap });
			try {
				const res = await app.request("/api/sessions", {
					method: "POST",
					headers: authHeaders(),
					body: JSON.stringify({ agentId: "agent-1" }),
				});
				expect(res.status).toBe(400);
			} finally {
				disposeApp(app);
			}
		});
	});

	// AC11: PATCH /api/sessions/:id — update state (end, crash)
	describe("AC11: PATCH /api/sessions/:id — update session state", () => {
		async function seedData(db: import("@hyperidle/db").HyperIdleDb): Promise<void> {
			await db.insert(teams).values({
				id: "prod-1",
				name: "Test Product",
				phase: "build",
				createdAt: new Date().toISOString(),
			});
			await db.insert(teamMembers).values({
				id: "team-1",
				teamId: "prod-1",
				capacity: 3,
				activeBets: 0,
				formedAt: new Date().toISOString(),
			});
			await db.insert(users).values({
				id: "agent-1",
				name: "Builder Bot",
				role: "builder",
				status: "idle",
				teamId: "team-1",
				createdAt: new Date().toISOString(),
			});
			await db.insert(bets).values({
				id: "bet-1",
				teamId: "prod-1",
				description: "Test",
				appetite: "small",
				status: "active",
				createdAt: new Date().toISOString(),
			});
			await db.insert(tasks).values({
				id: "task-1",
				betId: "bet-1",
				teamId: "prod-1",
				title: "Test Task",
				state: "in_progress",
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			});
		}

		test("ends a session with state=done", async ({ db, eventBus }) => {
			const app = await createTestApp({ db, eventBus, serviceBootstrap: testServiceBootstrap });
			try {
				await seedData(db);

				const createRes = await app.request("/api/sessions", {
					method: "POST",
					headers: authHeaders(),
					body: JSON.stringify({
						agentId: "agent-1",
						taskId: "task-1",
						modelTier: "workhorse",
					}),
				});
				const createBody = (await createRes.json()) as Record<string, unknown>;
				const sessionId = createBody.id as string;

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
				expect(emitted[0]!.type).toBe("session_ended");
			} finally {
				disposeApp(app);
			}
		});

		test("crashes a session with state=crashed", async ({ db, eventBus }) => {
			const app = await createTestApp({ db, eventBus, serviceBootstrap: testServiceBootstrap });
			try {
				await seedData(db);

				const createRes = await app.request("/api/sessions", {
					method: "POST",
					headers: authHeaders(),
					body: JSON.stringify({
						agentId: "agent-1",
						taskId: "task-1",
						modelTier: "workhorse",
					}),
				});
				const createBody = (await createRes.json()) as Record<string, unknown>;
				const sessionId = createBody.id as string;

				const res = await app.request(`/api/sessions/${sessionId}`, {
					method: "PATCH",
					headers: authHeaders(),
					body: JSON.stringify({ state: "crashed" }),
				});
				expect(res.status).toBe(200);

				const body = (await res.json()) as Record<string, unknown>;
				expect(body.state).toBe("crashed");
				expect(body.endedAt).toBeTruthy();
			} finally {
				disposeApp(app);
			}
		});

		test("returns 404 for unknown session", async ({ db, eventBus }) => {
			const app = await createTestApp({ db, eventBus, serviceBootstrap: testServiceBootstrap });
			try {
				const res = await app.request("/api/sessions/nonexistent", {
					method: "PATCH",
					headers: authHeaders(),
					body: JSON.stringify({ state: "done" }),
				});
				expect(res.status).toBe(404);
			} finally {
				disposeApp(app);
			}
		});

		// @lore AU21 Increment 14a: "PATCH state=done/crashed releases the
		// cost-cap dedup entry" tests are HARD-DELETED — costOps and its dedup
		// map no longer exist, no replacement.

		test("returns 400 for invalid state", async ({ db, eventBus }) => {
			const app = await createTestApp({ db, eventBus, serviceBootstrap: testServiceBootstrap });
			try {
				await seedData(db);

				const createRes = await app.request("/api/sessions", {
					method: "POST",
					headers: authHeaders(),
					body: JSON.stringify({
						agentId: "agent-1",
						taskId: "task-1",
						modelTier: "workhorse",
					}),
				});
				const createBody = (await createRes.json()) as Record<string, unknown>;
				const sessionId = createBody.id as string;

				const res = await app.request(`/api/sessions/${sessionId}`, {
					method: "PATCH",
					headers: authHeaders(),
					body: JSON.stringify({ state: "invalid" }),
				});
				expect(res.status).toBe(400);
			} finally {
				disposeApp(app);
			}
		});
	});
});
