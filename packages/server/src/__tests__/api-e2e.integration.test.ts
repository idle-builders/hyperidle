import {
	agents,
	bets,
	createTestDb,
	type HyperIdleDb,
	items,
	products,
	routines,
	tasks,
	teams,
	threads,
} from "@hyperidle/db";
import { EventBus } from "@hyperidle/shared";
import type { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestApp } from "../test-utils.js";

const TEST_API_KEY = "test-key-e2e";

function auth(extra?: Record<string, string>): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json", ...extra };
}

describe("E2E API Integration (I5)", () => {
	let db: HyperIdleDb;
	let eventBus: EventBus;
	let app: Hono;

	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		db = createTestDb();
		eventBus = new EventBus();
		app = createTestApp({ db, eventBus });

		// Seed base entities
		db.insert(products)
			.values({
				id: "prod-1",
				name: "E2E Product",
				phase: "build",
				createdAt: new Date().toISOString(),
			})
			.run();
		db.insert(teams)
			.values({
				id: "team-1",
				productId: "prod-1",
				capacity: 5,
				activeBets: 0,
				formedAt: new Date().toISOString(),
			})
			.run();
		db.insert(agents)
			.values([
				{
					id: "agent-1",
					name: "Test Agent",
					role: "builder",
					status: "active",
					teamId: "team-1",
					createdAt: new Date().toISOString(),
				},
				// L1a: synthetic sender for verdict-typed messages emitted by
				// the legacy `POST /responses` route (plan §6.4 wraps the new
				// repo path). The new `messages.sender_id` FK requires the
				// row to exist.
				{
					id: "policy_engine",
					name: "Policy Engine",
					role: "system",
					status: "active",
					createdAt: new Date().toISOString(),
				},
			])
			.run();
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	// -------------------------------------------------------
	// 1. Auth enforcement
	// -------------------------------------------------------
	describe("Auth enforcement", () => {
		it("returns 401 when X-API-Key header is missing", async () => {
			const res = await app.request("/api/bets");
			expect(res.status).toBe(401);
			const body = (await res.json()) as { code: string };
			expect(body.code).toBe("UNAUTHORIZED");
		});

		it("returns 401 when X-API-Key header is wrong", async () => {
			const res = await app.request("/api/bets", {
				headers: { "X-API-Key": "wrong-key" },
			});
			expect(res.status).toBe(401);
			const body = (await res.json()) as { code: string };
			expect(body.code).toBe("UNAUTHORIZED");
		});

		it("allows access with correct API key", async () => {
			const res = await app.request("/api/bets", { headers: auth() });
			expect(res.status).toBe(200);
		});
	});

	// -------------------------------------------------------
	// 2. Health
	// -------------------------------------------------------
	describe("Health", () => {
		it("GET /health returns ok without auth (backward compat)", async () => {
			const res = await app.request("/health");
			expect(res.status).toBe(200);
			const body = (await res.json()) as { status: string };
			expect(body.status).toBe("ok");
		});

		it("GET /api/health returns ok without auth", async () => {
			const res = await app.request("/api/health");
			expect(res.status).toBe(200);
			const body = (await res.json()) as { status: string };
			expect(body.status).toBe("ok");
		});
	});

	// -------------------------------------------------------
	// 3. Bets
	// -------------------------------------------------------
	describe("Bets", () => {
		it("POST /api/bets creates a shaped bet and GET /api/bets lists it", async () => {
			const createRes = await app.request("/api/bets", {
				method: "POST",
				headers: auth(),
				body: JSON.stringify({
					productId: "prod-1",
					teamId: "team-1",
					pitch: "E2E integration bet",
					appetite: "2 weeks",
				}),
			});
			expect(createRes.status).toBe(201);
			const created = (await createRes.json()) as { id: string; status: string };
			expect(created.status).toBe("shaped");

			const listRes = await app.request("/api/bets", { headers: auth() });
			expect(listRes.status).toBe(200);
			const list = (await listRes.json()) as { shaped: Array<{ id: string }> };
			expect(list.shaped.some((b) => b.id === created.id)).toBe(true);
		});

		it("POST /api/bets returns 400 for missing required fields", async () => {
			const res = await app.request("/api/bets", {
				method: "POST",
				headers: auth(),
				body: JSON.stringify({ productId: "prod-1" }),
			});
			expect(res.status).toBe(400);
			const body = (await res.json()) as { code: string };
			expect(body.code).toBe("VALIDATION_ERROR");
		});

		it("GET /api/bets/:id returns 404 for nonexistent bet", async () => {
			const res = await app.request("/api/bets/nonexistent", { headers: auth() });
			expect(res.status).toBe(404);
			const body = (await res.json()) as { code: string };
			expect(body.code).toBe("NOT_FOUND");
		});

		it("GET /api/bets/canvas returns canvas data", async () => {
			const res = await app.request("/api/bets/canvas", { headers: auth() });
			expect(res.status).toBe(200);
			const body = (await res.json()) as {
				shaped: unknown[];
				committed: unknown[];
				capacity: { used: number; max: number };
			};
			expect(body.capacity.max).toBe(5);
		});

		it("POST /api/bets/:id/commit transitions a shaped bet to committed", async () => {
			// Create a shaped bet first
			const createRes = await app.request("/api/bets", {
				method: "POST",
				headers: auth(),
				body: JSON.stringify({
					productId: "prod-1",
					teamId: "team-1",
					pitch: "Bet to commit",
					appetite: "2 weeks",
				}),
			});
			expect(createRes.status).toBe(201);
			const created = (await createRes.json()) as { id: string; status: string };
			expect(created.status).toBe("shaped");

			// Commit the bet
			const commitRes = await app.request(`/api/bets/${created.id}/commit`, {
				method: "POST",
				headers: auth(),
			});
			expect(commitRes.status).toBe(200);
			const committed = (await commitRes.json()) as { id: string; status: string };
			expect(committed.id).toBe(created.id);
			expect(committed.status).toBe("committed");
		});
	});

	// -------------------------------------------------------
	// 4. Tasks
	// -------------------------------------------------------
	describe("Tasks", () => {
		beforeEach(() => {
			db.insert(bets)
				.values({
					id: "bet-1",
					productId: "prod-1",
					teamId: "team-1",
					pitch: "Test bet",
					appetite: "2 weeks",
					status: "in_progress",
					createdAt: new Date().toISOString(),
				})
				.run();
			db.insert(tasks)
				.values({
					id: "task-1",
					betId: "bet-1",
					productId: "prod-1",
					teamId: "team-1",
					title: "Task A",
					state: "proposed",
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
				})
				.run();
		});

		it("GET /api/tasks lists all tasks", async () => {
			const res = await app.request("/api/tasks", { headers: auth() });
			expect(res.status).toBe(200);
			const body = (await res.json()) as Array<{ id: string }>;
			expect(body.length).toBeGreaterThanOrEqual(1);
		});

		it("GET /api/tasks?bet_id=bet-1 filters by bet", async () => {
			const res = await app.request("/api/tasks?bet_id=bet-1", { headers: auth() });
			expect(res.status).toBe(200);
			const body = (await res.json()) as Array<{ betId: string }>;
			expect(body.every((t) => t.betId === "bet-1")).toBe(true);
		});

		it("PATCH /api/tasks/:id updates task fields", async () => {
			const res = await app.request("/api/tasks/task-1", {
				method: "PATCH",
				headers: auth(),
				body: JSON.stringify({ title: "Updated Title" }),
			});
			expect(res.status).toBe(200);
			const body = (await res.json()) as { title: string };
			expect(body.title).toBe("Updated Title");
		});

		it("PATCH /api/tasks/:id returns 404 for nonexistent task", async () => {
			const res = await app.request("/api/tasks/nonexistent", {
				method: "PATCH",
				headers: auth(),
				body: JSON.stringify({ title: "X" }),
			});
			expect(res.status).toBe(404);
			const body = (await res.json()) as { code: string };
			expect(body.code).toBe("NOT_FOUND");
		});

		it("POST /api/tasks/:id/transition transitions task state", async () => {
			// proposed -> accepted is a valid transition
			const res = await app.request("/api/tasks/task-1/transition", {
				method: "POST",
				headers: auth(),
				body: JSON.stringify({ state: "accepted" }),
			});
			expect(res.status).toBe(200);
			const body = (await res.json()) as { state: string };
			expect(body.state).toBe("accepted");
		});

		it("POST /api/tasks/:id/transition returns 400 for invalid state", async () => {
			const res = await app.request("/api/tasks/task-1/transition", {
				method: "POST",
				headers: auth(),
				body: JSON.stringify({ state: "invalid_state" }),
			});
			expect(res.status).toBe(400);
			const body = (await res.json()) as { code: string };
			expect(body.code).toBe("VALIDATION_ERROR");
		});
	});

	// -------------------------------------------------------
	// 5. Conversations
	// -------------------------------------------------------
	describe("Conversations", () => {
		beforeEach(() => {
			db.insert(threads)
				.values({
					id: "thread-1",
					hostKind: "task",
					hostId: "task-1",
					initiatorId: "agent-1",
					participants: JSON.stringify(["agent-1"]),
					lastActiveAt: new Date().toISOString(),
					createdAt: new Date().toISOString(),
				})
				.run();
			db.insert(items)
				.values({
					id: "item-1",
					title: "E2E item",
					threadId: "thread-1",
					createdAt: new Date().toISOString(),
				})
				.run();
		});

		it("GET /api/conversations lists threads", async () => {
			const res = await app.request("/api/conversations", { headers: auth() });
			expect(res.status).toBe(200);
			const body = (await res.json()) as { threads: unknown[]; pagination: { total: number } };
			expect(body.pagination.total).toBeGreaterThanOrEqual(1);
		});

		it("GET /api/conversations/:threadId returns thread with items", async () => {
			const res = await app.request("/api/conversations/thread-1", { headers: auth() });
			expect(res.status).toBe(200);
			const body = (await res.json()) as { id: string; items: unknown[] };
			expect(body.id).toBe("thread-1");
			expect(body.items.length).toBeGreaterThanOrEqual(1);
		});

		it("POST /api/conversations/items creates an item", async () => {
			const res = await app.request("/api/conversations/items", {
				method: "POST",
				headers: auth(),
				body: JSON.stringify({ title: "New item", threadId: "thread-1" }),
			});
			expect(res.status).toBe(201);
		});

		it("POST /api/threads/:id/messages records a verdict (canonical L1 surface)", async () => {
			// L1 step5 (S-C2): legacy `POST /api/conversations/responses` was
			// removed; verdicts go through the canonical `/api/threads` surface.
			// `agent-1` is already seeded by the outer `beforeEach`; we just
			// add a founder so the verdict authz check (founder + not-self)
			// has a sender to claim.
			db.insert(agents)
				.values({
					id: "founder-1",
					name: "Founder",
					role: "founder",
					status: "active",
					createdAt: new Date().toISOString(),
				})
				.run();

			const create = await app.request("/api/threads", {
				method: "POST",
				headers: auth({ "X-Identity": "agent-1" }),
				body: JSON.stringify({
					hostKind: "task",
					hostId: "task-1",
					participants: ["agent-1", "founder-1"],
					initialMessage: {
						type: "review",
						clientKey: "init-r-e2e",
						payload: {
							title: "E2E review",
							reasoning: ["needs verdict"],
							artifactRef: { id: "a-e2e", kind: "text_diff" },
						},
					},
				}),
			});
			expect(create.status).toBe(201);
			const created = (await create.json()) as {
				thread: { id: string };
				messages: Array<{ id: string }>;
			};

			const res = await app.request(`/api/threads/${created.thread.id}/messages`, {
				method: "POST",
				headers: auth({ "X-Identity": "founder-1" }),
				body: JSON.stringify({
					type: "verdict",
					clientKey: "verdict-e2e",
					payload: {
						decision: "approve",
						resolvesMessageId: created.messages[0].id,
					},
				}),
			});
			expect(res.status).toBe(201);
		});
	});

	// -------------------------------------------------------
	// 6. Knowledge
	// -------------------------------------------------------
	describe("Knowledge", () => {
		it("GET /api/knowledge returns resource descriptor", async () => {
			const res = await app.request("/api/knowledge", { headers: auth() });
			expect(res.status).toBe(200);
			const body = (await res.json()) as { ok: boolean; resource: string };
			expect(body.ok).toBe(true);
			expect(body.resource).toBe("knowledge");
		});

		it("POST /api/knowledge/L0 creates a knowledge item", async () => {
			const res = await app.request("/api/knowledge/L0", {
				method: "POST",
				headers: auth(),
				body: JSON.stringify({
					kind: "decision",
					title: "Test decision",
					body: "We decided X",
					format: "markdown",
					updatedBy: "agent-1",
				}),
			});
			expect(res.status).toBe(201);
			const body = (await res.json()) as { id: string; layer: string; version: number };
			expect(body.layer).toBe("L0");
			expect(body.version).toBe(1);
		});

		it("GET /api/knowledge/L2 returns items grouped by topic and kind", async () => {
			const res = await app.request("/api/knowledge/L2", { headers: auth() });
			expect(res.status).toBe(200);
			const body = (await res.json()) as { layer: string; groups: Record<string, unknown> };
			expect(body.layer).toBe("L2");
			expect(body.groups).toBeDefined();
		});

		it("GET /api/knowledge/invalid_layer returns 400", async () => {
			const res = await app.request("/api/knowledge/invalid_layer", { headers: auth() });
			expect(res.status).toBe(400);
			const body = (await res.json()) as { code: string };
			expect(body.code).toBe("VALIDATION_ERROR");
		});

		it("GET /api/knowledge/search?q=test returns search results", async () => {
			// First create a knowledge item so search has something to find
			await app.request("/api/knowledge/L0", {
				method: "POST",
				headers: auth(),
				body: JSON.stringify({
					kind: "decision",
					title: "Searchable decision",
					body: "This is a test item for search",
					format: "markdown",
					updatedBy: "agent-1",
				}),
			});

			const res = await app.request("/api/knowledge/search?q=Searchable", { headers: auth() });
			expect(res.status).toBe(200);
			const body = (await res.json()) as { results: Array<{ title: string }> };
			expect(Array.isArray(body.results)).toBe(true);
			expect(body.results.length).toBeGreaterThanOrEqual(1);
			expect(body.results.some((r) => r.title === "Searchable decision")).toBe(true);
		});

		it("GET /api/knowledge/search requires query param q", async () => {
			const res = await app.request("/api/knowledge/search", { headers: auth() });
			expect(res.status).toBe(400);
			const body = (await res.json()) as { code: string };
			expect(body.code).toBe("VALIDATION_ERROR");
		});
	});

	// -------------------------------------------------------
	// 7. Agents
	// -------------------------------------------------------
	describe("Agents", () => {
		it("GET /api/agents lists agents with active session counts", async () => {
			const res = await app.request("/api/agents", { headers: auth() });
			expect(res.status).toBe(200);
			const body = (await res.json()) as Array<{ id: string; activeSessions: number }>;
			expect(body.length).toBeGreaterThanOrEqual(1);
			expect(body[0].activeSessions).toBe(0);
		});

		it("GET /api/agents/:id returns agent detail", async () => {
			const res = await app.request("/api/agents/agent-1", { headers: auth() });
			expect(res.status).toBe(200);
			const body = (await res.json()) as { id: string; skills: unknown[] };
			expect(body.id).toBe("agent-1");
			expect(Array.isArray(body.skills)).toBe(true);
		});

		it("GET /api/agents/:id returns 404 for unknown agent", async () => {
			const res = await app.request("/api/agents/nonexistent", { headers: auth() });
			expect(res.status).toBe(404);
			const body = (await res.json()) as { code: string };
			expect(body.code).toBe("NOT_FOUND");
		});

		it("GET /api/agents/:id/inbox returns empty inbox", async () => {
			const res = await app.request("/api/agents/agent-1/inbox", { headers: auth() });
			expect(res.status).toBe(200);
			const body = (await res.json()) as unknown[];
			expect(body).toEqual([]);
		});

		it("POST /api/agents/:id/inbox sends message and returns 201", async () => {
			// L1 step9 (Adv-C2): sender is derived from X-Identity, not the body.
			const res = await app.request("/api/agents/agent-1/inbox", {
				method: "POST",
				headers: auth({ "X-Identity": "agent-1" }),
				body: JSON.stringify({ body: "Hello agent!" }),
			});
			expect(res.status).toBe(201);
			// L1a: messages now carry payload (JSON), not body/recipientId.
			// Recipient is derived from the thread.host_id (plan §5.3).
			const body = (await res.json()) as { senderId: string; payload: string };
			expect(body.senderId).toBe("agent-1");
			const payload = JSON.parse(body.payload) as { text?: string };
			expect(payload.text).toBe("Hello agent!");
		});
	});

	// -------------------------------------------------------
	// 8. Sessions
	// -------------------------------------------------------
	describe("Sessions", () => {
		beforeEach(() => {
			db.insert(bets)
				.values({
					id: "bet-s",
					productId: "prod-1",
					teamId: "team-1",
					pitch: "Session bet",
					appetite: "2 weeks",
					status: "in_progress",
					createdAt: new Date().toISOString(),
				})
				.run();
			db.insert(tasks)
				.values({
					id: "task-s",
					betId: "bet-s",
					productId: "prod-1",
					teamId: "team-1",
					title: "Session task",
					state: "in_progress",
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
				})
				.run();
		});

		it("GET /api/sessions returns session list", async () => {
			const res = await app.request("/api/sessions", { headers: auth() });
			expect(res.status).toBe(200);
			const body = (await res.json()) as unknown[];
			expect(Array.isArray(body)).toBe(true);
		});

		it("POST /api/sessions creates a session and emits event", async () => {
			const events: unknown[] = [];
			eventBus.on("session_started", (e) => events.push(e));

			const res = await app.request("/api/sessions", {
				method: "POST",
				headers: auth(),
				body: JSON.stringify({
					agentId: "agent-1",
					taskId: "task-s",
					modelTier: "workhorse",
				}),
			});
			expect(res.status).toBe(201);
			const body = (await res.json()) as { id: string; state: string };
			expect(body.state).toBe("active");
			expect(events.length).toBe(1);
		});

		it("PATCH /api/sessions/:id ends a session", async () => {
			// Create a session first
			const createRes = await app.request("/api/sessions", {
				method: "POST",
				headers: auth(),
				body: JSON.stringify({
					agentId: "agent-1",
					taskId: "task-s",
					modelTier: "fast",
				}),
			});
			const created = (await createRes.json()) as { id: string };

			const res = await app.request(`/api/sessions/${created.id}`, {
				method: "PATCH",
				headers: auth(),
				body: JSON.stringify({ state: "done" }),
			});
			expect(res.status).toBe(200);
			const body = (await res.json()) as { state: string; endedAt: string };
			expect(body.state).toBe("done");
			expect(body.endedAt).toBeTruthy();
		});

		it("PATCH /api/sessions/:id returns 404 for nonexistent session", async () => {
			const res = await app.request("/api/sessions/nonexistent", {
				method: "PATCH",
				headers: auth(),
				body: JSON.stringify({ state: "done" }),
			});
			expect(res.status).toBe(404);
			const body = (await res.json()) as { code: string };
			expect(body.code).toBe("NOT_FOUND");
		});
	});

	// -------------------------------------------------------
	// 9. Rail
	// -------------------------------------------------------
	describe("Rail", () => {
		it("GET /api/rail returns dashboard data", async () => {
			const res = await app.request("/api/rail", { headers: auth() });
			expect(res.status).toBe(200);
			const body = (await res.json()) as {
				bets: unknown[];
				blockers: unknown[];
				awaitingOrdering: unknown[];
				costBurnRate: { cap: number; actual: number; percentage: number };
			};
			expect(Array.isArray(body.bets)).toBe(true);
			expect(Array.isArray(body.blockers)).toBe(true);
			expect(Array.isArray(body.awaitingOrdering)).toBe(true);
			expect(body.costBurnRate).toHaveProperty("cap");
		});
	});

	// -------------------------------------------------------
	// 10. Status
	// -------------------------------------------------------
	describe("Status", () => {
		it("GET /api/status returns factory-wide status", async () => {
			const res = await app.request("/api/status", { headers: auth() });
			expect(res.status).toBe(200);
			const body = (await res.json()) as { activeSessions: number; totalCost: number };
			expect(body.activeSessions).toBe(0);
		});

		it("GET /api/status/health returns authenticated health", async () => {
			const res = await app.request("/api/status/health", { headers: auth() });
			expect(res.status).toBe(200);
			const body = (await res.json()) as { status: string };
			expect(body.status).toBe("ok");
		});

		it("GET /api/status/settings returns settings list", async () => {
			const res = await app.request("/api/status/settings", { headers: auth() });
			expect(res.status).toBe(200);
			const body = (await res.json()) as Array<{ key: string; value: string | null }>;
			expect(Array.isArray(body)).toBe(true);
		});

		it("PATCH /api/status/settings updates a setting", async () => {
			const res = await app.request("/api/status/settings", {
				method: "PATCH",
				headers: auth(),
				body: JSON.stringify({ key: "test_key", value: "test_value" }),
			});
			expect(res.status).toBe(200);
			const body = (await res.json()) as { key: string; value: string };
			expect(body.key).toBe("test_key");
			expect(body.value).toBe("test_value");
		});

		it("PATCH /api/status/settings blocks reserved namespace keys", async () => {
			const res = await app.request("/api/status/settings", {
				method: "PATCH",
				headers: auth(),
				body: JSON.stringify({ key: "notifications.smtp_password", value: "secret" }),
			});
			expect(res.status).toBe(400);
			const body = (await res.json()) as { code: string };
			expect(body.code).toBe("VALIDATION_ERROR");
		});

		it("GET /api/status/digest returns digest data", async () => {
			const res = await app.request("/api/status/digest", { headers: auth() });
			expect(res.status).toBe(200);
			const body = (await res.json()) as { items: unknown[]; generatedAt: string };
			expect(Array.isArray(body.items)).toBe(true);
			expect(typeof body.generatedAt).toBe("string");
		});
	});

	// -------------------------------------------------------
	// 11. Routines
	// -------------------------------------------------------
	describe("Routines", () => {
		beforeEach(() => {
			db.insert(routines)
				.values({
					id: "routine-1",
					ownerAgentId: "agent-1",
					triggerType: "heartbeat",
					triggerConfig: JSON.stringify({ intervalMs: 60000 }),
					autonomyLevel: 2,
					active: 1,
				})
				.run();
		});

		it("GET /api/routines lists routines", async () => {
			const res = await app.request("/api/routines", { headers: auth() });
			expect(res.status).toBe(200);
			const body = (await res.json()) as Array<{ id: string }>;
			expect(body.length).toBeGreaterThanOrEqual(1);
		});

		it("PATCH /api/routines/:id updates routine", async () => {
			const res = await app.request("/api/routines/routine-1", {
				method: "PATCH",
				headers: auth(),
				body: JSON.stringify({ active: false }),
			});
			expect(res.status).toBe(200);
			const body = (await res.json()) as { active: number };
			expect(body.active).toBe(0);
		});

		it("POST /api/routines/:id/retire retires routine", async () => {
			const res = await app.request("/api/routines/routine-1/retire", {
				method: "POST",
				headers: auth(),
			});
			expect(res.status).toBe(200);
			const body = (await res.json()) as { active: number };
			expect(body.active).toBe(0);
		});

		it("POST /api/routines/:id/retire returns 404 for unknown routine", async () => {
			const res = await app.request("/api/routines/nonexistent/retire", {
				method: "POST",
				headers: auth(),
			});
			expect(res.status).toBe(404);
			const body = (await res.json()) as { code: string };
			expect(body.code).toBe("NOT_FOUND");
		});
	});

	// -------------------------------------------------------
	// 12. Notifications
	// -------------------------------------------------------
	describe("Notifications", () => {
		it("GET /api/notifications returns resource descriptor", async () => {
			const res = await app.request("/api/notifications", { headers: auth() });
			expect(res.status).toBe(200);
			const body = (await res.json()) as { ok: boolean; resource: string };
			expect(body.ok).toBe(true);
			expect(body.resource).toBe("notifications");
		});

		it("GET /api/notifications/config returns notification config", async () => {
			const res = await app.request("/api/notifications/config", { headers: auth() });
			expect(res.status).toBe(200);
			const body = (await res.json()) as { enabled: boolean; primaryChannel: string };
			expect(typeof body.enabled).toBe("boolean");
			expect(typeof body.primaryChannel).toBe("string");
		});

		it("GET /api/notifications/queue returns queued notifications", async () => {
			const res = await app.request("/api/notifications/queue", { headers: auth() });
			expect(res.status).toBe(200);
			const body = (await res.json()) as { status: string; count: number; rows: unknown[] };
			expect(body.status).toBe("pending");
			expect(Array.isArray(body.rows)).toBe(true);
		});

		it("GET /api/notifications/queue?status=invalid returns 400", async () => {
			const res = await app.request("/api/notifications/queue?status=invalid", { headers: auth() });
			expect(res.status).toBe(400);
			const body = (await res.json()) as { code: string };
			expect(body.code).toBe("VALIDATION_ERROR");
		});

		it("POST /api/notifications/test sends a test notification via console adapter", async () => {
			const res = await app.request("/api/notifications/test", {
				method: "POST",
				headers: auth(),
				body: JSON.stringify({}),
			});
			expect(res.status).toBe(200);
			const body = (await res.json()) as { ok: boolean; channel: string };
			expect(body.ok).toBe(true);
			expect(body.channel).toBe("console");
		});
	});

	// -------------------------------------------------------
	// 13. Observability
	// -------------------------------------------------------
	describe("Observability", () => {
		it("GET /api/observability returns resource descriptor", async () => {
			const res = await app.request("/api/observability", { headers: auth() });
			expect(res.status).toBe(200);
			const body = (await res.json()) as { ok: boolean; resource: string };
			expect(body.ok).toBe(true);
			expect(body.resource).toBe("observability");
		});

		it("GET /api/observability/config returns observability config", async () => {
			const res = await app.request("/api/observability/config", { headers: auth() });
			expect(res.status).toBe(200);
			const body = (await res.json()) as { enabled: boolean; adapter: string };
			expect(typeof body.enabled).toBe("boolean");
			expect(typeof body.adapter).toBe("string");
		});

		it("GET /api/observability/status returns status info", async () => {
			const res = await app.request("/api/observability/status", { headers: auth() });
			expect(res.status).toBe(200);
			const body = (await res.json()) as { enabled: boolean };
			expect(typeof body.enabled).toBe("boolean");
		});
	});

	// -------------------------------------------------------
	// 14. 404 handling
	// -------------------------------------------------------
	describe("404 handling", () => {
		it("returns 404 JSON for unknown /api routes", async () => {
			const res = await app.request("/api/nonexistent", { headers: auth() });
			expect(res.status).toBe(404);
			const body = (await res.json()) as { code: string };
			expect(body.code).toBe("NOT_FOUND");
		});

		it("returns 404 text for unknown non-/api routes", async () => {
			const res = await app.request("/nonexistent");
			expect(res.status).toBe(404);
		});
	});

	// -------------------------------------------------------
	// 15. Validation
	// -------------------------------------------------------
	describe("Request validation", () => {
		it("POST /api/sessions returns 400 for invalid modelTier", async () => {
			const res = await app.request("/api/sessions", {
				method: "POST",
				headers: auth(),
				body: JSON.stringify({
					agentId: "agent-1",
					taskId: "task-1",
					modelTier: "invalid",
				}),
			});
			expect(res.status).toBe(400);
			const body = (await res.json()) as { code: string };
			expect(body.code).toBe("VALIDATION_ERROR");
		});

		it("PATCH /api/routines/:id returns 404 for nonexistent routine", async () => {
			const res = await app.request("/api/routines/nonexistent", {
				method: "PATCH",
				headers: auth(),
				body: JSON.stringify({ active: true }),
			});
			expect(res.status).toBe(404);
			const body = (await res.json()) as { code: string };
			expect(body.code).toBe("NOT_FOUND");
		});
	});
});
