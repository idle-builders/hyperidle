import { items, teamMembers, teams, threads, users } from "@hyperidle/db";
import type { ItemCreatedEvent } from "@hyperidle/shared";
import { afterEach, beforeEach, describe, expect, test, vi } from "../__testing__/test-fixtures.js";

const TEST_API_KEY = "test-key-conversations";

function authHeaders(): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json" };
}

describe("Conversations Endpoints (E2)", () => {
	beforeEach(async () => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	// --- GET /api/conversations ---

	describe("GET /api/conversations", () => {
		test("lists threads sorted by recency (default)", async ({ db, app }) => {
			// Seed base data
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
				id: "policy_engine",
				name: "Policy Engine",
				role: "system",
				status: "active",
				createdAt: new Date().toISOString(),
			});

			const now = Date.now();
			await db.insert(threads).values({
				id: "t-old",
				hostKind: "task",
				hostId: "task-1",
				initiatorId: "agent-1",
				participants: JSON.stringify(["agent-1"]),
				lastActiveAt: new Date(now - 10000).toISOString(),
				createdAt: new Date(now - 10000).toISOString(),
			});

			await db.insert(threads).values({
				id: "t-new",
				hostKind: "task",
				hostId: "task-1",
				initiatorId: "agent-1",
				participants: JSON.stringify(["agent-1"]),
				lastActiveAt: new Date(now).toISOString(),
				createdAt: new Date(now).toISOString(),
			});

			const res = await app.request("/api/conversations", { headers: authHeaders() });
			expect(res.status).toBe(200);

			const body = (await res.json()) as {
				threads: Array<{ id: string }>;
				pagination: { page: number; limit: number; total: number };
			};
			expect(body.threads).toHaveLength(2);
			expect(body.threads[0]?.id).toBe("t-new");
			expect(body.threads[1]?.id).toBe("t-old");
			expect(body.pagination.total).toBe(2);
		});

		test("sorts by attention_score when requested falls through to recency (O2: attentionScore stripped from items)", async ({
			db,
			app,
		}) => {
			// @lore O2: attentionScore column removed from items table.
			// ?sort=attention_score falls through to recency sort. Test verifies
			// the endpoint still returns 200 with threads in some order.
			const now = Date.now();
			await db.insert(threads).values({
				id: "t-older",
				hostKind: "task",
				hostId: "task-1",
				initiatorId: "agent-1",
				participants: JSON.stringify(["agent-1"]),
				lastActiveAt: new Date(now - 10000).toISOString(),
				createdAt: new Date(now - 10000).toISOString(),
			});

			await db.insert(threads).values({
				id: "t-newer",
				hostKind: "task",
				hostId: "task-1",
				initiatorId: "agent-1",
				participants: JSON.stringify(["agent-1"]),
				lastActiveAt: new Date(now).toISOString(),
				createdAt: new Date(now).toISOString(),
			});

			const res = await app.request("/api/conversations?sort=attention_score", {
				headers: authHeaders(),
			});
			expect(res.status).toBe(200);

			const body = (await res.json()) as {
				threads: Array<{ id: string }>;
			};
			// Falls through to recency — newer thread first
			expect(body.threads[0]?.id).toBe("t-newer");
			expect(body.threads[1]?.id).toBe("t-older");
		});

		test("paginates correctly", async ({ db, app }) => {
			for (let i = 0; i < 5; i++) {
				const ts = new Date(Date.now() - i * 1000).toISOString();
				await db.insert(threads).values({
					id: `t-${i}`,
					hostKind: "task",
					hostId: "task-1",
					initiatorId: "agent-1",
					participants: JSON.stringify(["agent-1"]),
					lastActiveAt: ts,
					createdAt: ts,
				});
			}

			const res = await app.request("/api/conversations?page=2&limit=2", {
				headers: authHeaders(),
			});
			expect(res.status).toBe(200);

			const body = (await res.json()) as {
				threads: Array<{ id: string }>;
				pagination: { page: number; limit: number; total: number };
			};
			expect(body.threads).toHaveLength(2);
			expect(body.pagination.page).toBe(2);
			expect(body.pagination.limit).toBe(2);
			expect(body.pagination.total).toBe(5);
		});

		test("returns empty list when no threads", async ({ app }) => {
			const res = await app.request("/api/conversations", { headers: authHeaders() });
			expect(res.status).toBe(200);

			const body = (await res.json()) as { threads: unknown[]; pagination: { total: number } };
			expect(body.threads).toEqual([]);
			expect(body.pagination.total).toBe(0);
		});
	});

	// --- GET /api/conversations/:threadId ---

	describe("GET /api/conversations/:threadId", () => {
		test("returns thread with items and an empty responses[] (verdicts now live on /api/threads)", async ({
			db,
			app,
		}) => {
			await db.insert(threads).values({
				id: "thread-1",
				hostKind: "task",
				hostId: "task-1",
				initiatorId: "agent-1",
				participants: JSON.stringify(["agent-1"]),
				lastActiveAt: new Date().toISOString(),
				createdAt: new Date().toISOString(),
			});

			await db.insert(items).values({
				id: "item-1",
				title: "First item",
				threadId: "thread-1",
				createdAt: new Date().toISOString(),
			});

			await db.insert(items).values({
				id: "item-2",
				title: "Second item",
				threadId: "thread-1",
				createdAt: new Date(Date.now() + 1000).toISOString(),
			});

			const res = await app.request("/api/conversations/thread-1", { headers: authHeaders() });
			expect(res.status).toBe(200);

			const body = (await res.json()) as {
				id: string;
				kind: string;
				items: Array<{ id: string; responses: ReadonlyArray<unknown> }>;
			};
			expect(body.id).toBe("thread-1");
			expect(body.items).toHaveLength(2);
			expect(body.items[0]?.id).toBe("item-1");
			expect(body.items[0]?.responses).toEqual([]);
			expect(body.items[1]?.id).toBe("item-2");
			expect(body.items[1]?.responses).toEqual([]);
		});

		test("returns 404 for nonexistent thread", async ({ app }) => {
			const res = await app.request("/api/conversations/nonexistent", { headers: authHeaders() });
			expect(res.status).toBe(404);

			const body = (await res.json()) as { error: string; code: string };
			expect(body.code).toBe("NOT_FOUND");
		});
	});

	// --- POST /api/conversations/items ---

	describe("POST /api/conversations/items", () => {
		test("creates item and returns 201", async ({ db, app }) => {
			await db.insert(threads).values({
				id: "thread-1",
				hostKind: "task",
				hostId: "task-1",
				initiatorId: "agent-1",
				participants: JSON.stringify(["agent-1"]),
				lastActiveAt: new Date().toISOString(),
				createdAt: new Date().toISOString(),
			});

			const res = await app.request("/api/conversations/items", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					title: "Test item",
					threadId: "thread-1",
					kind: "review",
					riskTier: "high",
				}),
			});
			expect(res.status).toBe(201);

			// @lore O2: view and founderRoute fields removed from response (routing is
			// a strategy concern, not a kernel concern).
			const body = (await res.json()) as { id: string; title: string; view?: string };
			expect(body.title).toBe("Test item");
			expect(body.id).toBeDefined();
			expect(body.view).toBeUndefined();
		});

		test("validates required fields (missing title -> 400)", async ({ db, app }) => {
			await db.insert(threads).values({
				id: "thread-1",
				hostKind: "task",
				hostId: "task-1",
				initiatorId: "agent-1",
				participants: JSON.stringify(["agent-1"]),
				lastActiveAt: new Date().toISOString(),
				createdAt: new Date().toISOString(),
			});

			const res = await app.request("/api/conversations/items", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({ threadId: "thread-1" }),
			});
			expect(res.status).toBe(400);

			const body = (await res.json()) as { code: string };
			expect(body.code).toBe("VALIDATION_ERROR");
		});

		test("emits item_created event", async ({ db, app, eventBus }) => {
			await db.insert(threads).values({
				id: "thread-1",
				hostKind: "task",
				hostId: "task-1",
				initiatorId: "agent-1",
				participants: JSON.stringify(["agent-1"]),
				lastActiveAt: new Date().toISOString(),
				createdAt: new Date().toISOString(),
			});

			const emitted: ItemCreatedEvent[] = [];
			eventBus.on("item_created", (e: ItemCreatedEvent) => emitted.push(e));

			await app.request("/api/conversations/items", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({ title: "Event test", threadId: "thread-1", kind: "chat" }),
			});

			expect(emitted).toHaveLength(1);
			expect(emitted[0]!.kind).toBe("chat");
		});

		test("includes routing info in response (O2: view removed, response is the created item)", async ({
			db,
			app,
		}) => {
			await db.insert(threads).values({
				id: "thread-1",
				hostKind: "task",
				hostId: "task-1",
				initiatorId: "agent-1",
				participants: JSON.stringify(["agent-1"]),
				lastActiveAt: new Date().toISOString(),
				createdAt: new Date().toISOString(),
			});

			const res = await app.request("/api/conversations/items", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					title: "Knowledge item",
					threadId: "thread-1",
					kind: "knowledge",
				}),
			});
			expect(res.status).toBe(201);

			// @lore O2: view/founderRoute removed. The response is just the created item row.
			const body = (await res.json()) as { kind: string; view?: string };
			expect(body.kind).toBe("knowledge");
			expect(body.view).toBeUndefined();
		});

		test("returns 404 for nonexistent threadId", async ({ app }) => {
			const res = await app.request("/api/conversations/items", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({ title: "Test", threadId: "nonexistent" }),
			});
			expect(res.status).toBe(404);
		});
	});

	// L1 step5 (S-C2): the legacy `POST /api/conversations/responses` was
	// removed — its replacement is `POST /api/threads/:id/messages` with
	// `type: "verdict"`. The smoke checks below confirm a verdict written
	// through the canonical surface lands on the same thread/item the legacy
	// route used to target. The full verdict-authz / idempotency / re-open
	// matrix lives in `routes/__tests__/threads.routes.test.ts`.
	describe("verdict via canonical /api/threads surface", () => {
		test("records a verdict on a review and returns 201", async ({ db, app }) => {
			// L1a: verdict messages set sender_id='policy_engine' as the synthetic
			// sender for system-recorded verdicts. The new `messages.sender_id` FK
			// requires the agent to exist (legacy `responses.approver_id` had no
			// FK). Seeding the synthetic agent satisfies the constraint without
			// changing test intent.
			await db.insert(users).values({
				id: "policy_engine",
				name: "Policy Engine",
				role: "system",
				status: "active",
				createdAt: new Date().toISOString(),
			});

			// Seed a founder approver and a non-founder review author so the
			// canonical route's authz check (founder + not-self) passes.
			// @lore AF11-IDOR: kind="human" added to founder-1 so auth middleware
			// resolves it as the authenticated principal (not the "u-founder" fallback).
			await db.insert(users).values({
				id: "founder-1",
				kind: "human",
				name: "Founder",
				role: "founder",
				status: "active",
				createdAt: new Date().toISOString(),
			});

			await db.insert(users).values({
				id: "agent-1",
				name: "Agent",
				role: "growth",
				status: "active",
				createdAt: new Date().toISOString(),
			});

			const create = await app.request("/api/threads", {
				method: "POST",
				headers: { ...authHeaders(), "X-Identity": "agent-1" },
				body: JSON.stringify({
					hostKind: "task",
					hostId: "task-1",
					participants: ["agent-1", "founder-1"],
					initialMessage: {
						type: "review",
						clientKey: "init-r-a",
						payload: {
							title: "Verdict smoke",
							reasoning: ["Looks fine"],
							artifactRef: { id: "a-1", kind: "text_diff" },
						},
					},
				}),
			});
			expect(create.status).toBe(201);
			const created = (await create.json()) as {
				thread: { id: string };
				messages: Array<{ id: string }>;
			};
			const reviewMessageId = created.messages[0]?.id ?? "";

			const res = await app.request(`/api/threads/${created.thread.id}/messages`, {
				method: "POST",
				headers: { ...authHeaders(), "X-Identity": "founder-1" },
				body: JSON.stringify({
					type: "verdict",
					clientKey: "verdict-a",
					payload: {
						decision: "approve",
						resolvesMessageId: reviewMessageId,
						note: "Looks good",
					},
				}),
			});
			expect(res.status).toBe(201);
		});

		test("rejects non-founder verdicts (403)", async ({ db, app }) => {
			await db.insert(users).values({
				id: "policy_engine",
				name: "Policy Engine",
				role: "system",
				status: "active",
				createdAt: new Date().toISOString(),
			});
			await db.insert(users).values({
				id: "founder-1",
				name: "Founder",
				role: "founder",
				status: "active",
				createdAt: new Date().toISOString(),
			});
			await db.insert(users).values({
				id: "agent-1",
				name: "Agent",
				role: "growth",
				status: "active",
				createdAt: new Date().toISOString(),
			});

			const create = await app.request("/api/threads", {
				method: "POST",
				headers: { ...authHeaders(), "X-Identity": "agent-1" },
				body: JSON.stringify({
					hostKind: "task",
					hostId: "task-1",
					participants: ["agent-1", "founder-1"],
					initialMessage: {
						type: "review",
						clientKey: "init-r-b",
						payload: {
							title: "No",
							reasoning: ["Nope"],
							artifactRef: { id: "a-2", kind: "text_diff" },
						},
					},
				}),
			});
			const created = (await create.json()) as {
				thread: { id: string };
				messages: Array<{ id: string }>;
			};

			// Send the verdict as the (non-founder) review author. Should 403.
			const res = await app.request(`/api/threads/${created.thread.id}/messages`, {
				method: "POST",
				headers: { ...authHeaders(), "X-Identity": "agent-1" },
				body: JSON.stringify({
					type: "verdict",
					clientKey: "verdict-b",
					payload: {
						decision: "approve",
						resolvesMessageId: created.messages[0]?.id ?? "",
					},
				}),
			});
			expect(res.status).toBe(403);
		});

		test("validates verdict decision enum (invalid -> 400)", async ({ db, app }) => {
			await db.insert(users).values({
				id: "policy_engine",
				name: "Policy Engine",
				role: "system",
				status: "active",
				createdAt: new Date().toISOString(),
			});
			await db.insert(users).values({
				id: "founder-1",
				name: "Founder",
				role: "founder",
				status: "active",
				createdAt: new Date().toISOString(),
			});
			await db.insert(users).values({
				id: "agent-1",
				name: "Agent",
				role: "growth",
				status: "active",
				createdAt: new Date().toISOString(),
			});

			const create = await app.request("/api/threads", {
				method: "POST",
				headers: { ...authHeaders(), "X-Identity": "agent-1" },
				body: JSON.stringify({
					hostKind: "task",
					hostId: "task-1",
					participants: ["agent-1", "founder-1"],
					initialMessage: {
						type: "review",
						clientKey: "init-r-c",
						payload: {
							title: "Validate",
							reasoning: ["x"],
							artifactRef: { id: "a-3", kind: "text_diff" },
						},
					},
				}),
			});
			const created = (await create.json()) as {
				thread: { id: string };
				messages: Array<{ id: string }>;
			};

			const res = await app.request(`/api/threads/${created.thread.id}/messages`, {
				method: "POST",
				headers: { ...authHeaders(), "X-Identity": "founder-1" },
				body: JSON.stringify({
					type: "verdict",
					clientKey: "verdict-c",
					payload: {
						decision: "invalid-decision",
						resolvesMessageId: created.messages[0]?.id ?? "",
					},
				}),
			});
			expect(res.status).toBe(400);
		});
	});

	// --- Founder routing integration ---

	// @lore O2: routeToFounder removed from POST /items handler. The founderRoute
	// field is no longer returned in the response — routing is a strategy concern,
	// not a kernel concern. Tests updated to verify items are created without routing.
	describe("Founder routing integration (O2: founderRoute removed)", () => {
		test("agent with role 'growth' -> item created without founderRoute field", async ({
			db,
			app,
		}) => {
			await db.insert(threads).values({
				id: "thread-1",
				hostKind: "task",
				hostId: "task-1",
				initiatorId: "agent-1",
				participants: JSON.stringify(["agent-1"]),
				lastActiveAt: new Date().toISOString(),
				createdAt: new Date().toISOString(),
			});

			await db.insert(users).values({
				id: "agent-growth",
				name: "Growth Agent",
				role: "growth",
				status: "active",
				createdAt: new Date().toISOString(),
			});

			const res = await app.request("/api/conversations/items", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					title: "Growth item",
					threadId: "thread-1",
					sourceAgentId: "agent-growth",
				}),
			});
			expect(res.status).toBe(201);

			const body = (await res.json()) as { founderRoute?: string; sourceAgentId: string };
			// O2: founderRoute no longer returned
			expect(body.founderRoute).toBeUndefined();
			expect(body.sourceAgentId).toBe("agent-growth");
		});

		test("agent with role 'builder' -> item created without founderRoute field", async ({
			db,
			app,
		}) => {
			await db.insert(threads).values({
				id: "thread-1",
				hostKind: "task",
				hostId: "task-1",
				initiatorId: "agent-1",
				participants: JSON.stringify(["agent-1"]),
				lastActiveAt: new Date().toISOString(),
				createdAt: new Date().toISOString(),
			});

			await db.insert(users).values({
				id: "agent-builder",
				name: "Builder Agent",
				role: "builder",
				status: "active",
				createdAt: new Date().toISOString(),
			});

			const res = await app.request("/api/conversations/items", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					title: "Builder item",
					threadId: "thread-1",
					sourceAgentId: "agent-builder",
				}),
			});
			expect(res.status).toBe(201);

			const body = (await res.json()) as { founderRoute?: string; sourceAgentId: string };
			// O2: founderRoute no longer returned
			expect(body.founderRoute).toBeUndefined();
			expect(body.sourceAgentId).toBe("agent-builder");
		});
	});

	// --- Auth ---

	describe("Auth required", () => {
		test("returns 401 without API key", async ({ app }) => {
			const res = await app.request("/api/conversations");
			expect(res.status).toBe(401);
		});
	});
});
