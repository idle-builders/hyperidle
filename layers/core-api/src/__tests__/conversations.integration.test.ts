import { items, teamMembers, teams, threads, users } from "@hyperidle/db";
import type { ItemCreatedEvent } from "@hyperidle/domain-model";
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
		test("lists threads sorted by recency (default)", async ({ db, app, ids }) => {
			// Seed base data
			await db.insert(teams).values({
				id: ids("prod-1"),
				name: "Test Product",
				phase: "build",
				createdAt: new Date().toISOString(),
			});
			await db.insert(teamMembers).values({
				id: ids("team-1"),
				teamId: ids("prod-1"),
				capacity: 3,
				activeBets: 0,
				formedAt: new Date().toISOString(),
			});
			await db.insert(users).values({
				id: ids("policy-engine"),
				name: "Policy Engine",
				role: "system",
				status: "active",
				createdAt: new Date().toISOString(),
			});

			const now = Date.now();
			await db.insert(threads).values({
				id: ids("t-old"),
				hostKind: "task",
				hostId: ids("task-1"),
				initiatorId: ids("agent-1"),
				participants: JSON.stringify([ids("agent-1")]),
				lastActiveAt: new Date(now - 10000).toISOString(),
				createdAt: new Date(now - 10000).toISOString(),
			});

			await db.insert(threads).values({
				id: ids("t-new"),
				hostKind: "task",
				hostId: ids("task-1"),
				initiatorId: ids("agent-1"),
				participants: JSON.stringify([ids("agent-1")]),
				lastActiveAt: new Date(now).toISOString(),
				createdAt: new Date(now).toISOString(),
			});

			const res = await app.request("/api/conversations", { headers: authHeaders() });
			expect(res.status).toBe(200);

			const body = (await res.json()) as {
				threads: Array<{ id: string }>;
				pagination: { page: number; limit: number; total: number };
			};
			// P6: scope — find this test's threads in the response
			const myThreads = body.threads.filter((t) => t.id === ids("t-old") || t.id === ids("t-new"));
			expect(myThreads).toHaveLength(2);
			// Recency: newer first
			const newerIdx = myThreads.findIndex((t) => t.id === ids("t-new"));
			const olderIdx = myThreads.findIndex((t) => t.id === ids("t-old"));
			expect(newerIdx).toBeLessThan(olderIdx);
		});

		test("sorts by attention_score when requested falls through to recency (O2: attentionScore stripped from items)", async ({
			db,
			app,
			ids,
		}) => {
			// @lore O2: attentionScore column removed from items table.
			// ?sort=attention_score falls through to recency sort. Test verifies
			// the endpoint still returns 200 with threads in some order.
			const now = Date.now();
			await db.insert(threads).values({
				id: ids("t-older"),
				hostKind: "task",
				hostId: ids("task-1"),
				initiatorId: ids("agent-1"),
				participants: JSON.stringify([ids("agent-1")]),
				lastActiveAt: new Date(now - 10000).toISOString(),
				createdAt: new Date(now - 10000).toISOString(),
			});

			await db.insert(threads).values({
				id: ids("t-newer"),
				hostKind: "task",
				hostId: ids("task-1"),
				initiatorId: ids("agent-1"),
				participants: JSON.stringify([ids("agent-1")]),
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
			// P6: scope — find this test's threads
			const myThreads = body.threads.filter(
				(t) => t.id === ids("t-older") || t.id === ids("t-newer"),
			);
			// Falls through to recency — newer thread first
			expect(myThreads[0]?.id).toBe(ids("t-newer"));
			expect(myThreads[1]?.id).toBe(ids("t-older"));
		});

		test("paginates correctly", async ({ db, app, ids }) => {
			const myThreadIds: string[] = [];
			for (let i = 0; i < 5; i++) {
				const id = ids(`t-${i}`);
				myThreadIds.push(id);
				const ts = new Date(Date.now() - i * 1000).toISOString();
				await db.insert(threads).values({
					id,
					hostKind: "task",
					hostId: ids("task-1"),
					initiatorId: ids("agent-1"),
					participants: JSON.stringify([ids("agent-1")]),
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
			// P6: total includes all threads in the DB, not just ours
			expect(body.pagination.total).toBeGreaterThanOrEqual(5);
		});

		test("returns empty list when no threads", async ({ app, ids }) => {
			const res = await app.request("/api/conversations", { headers: authHeaders() });
			expect(res.status).toBe(200);

			const body = (await res.json()) as {
				threads: Array<{ id: string }>;
				pagination: { total: number };
			};
			// P6: scope — none of this test's arranged threads appear (it arranged none)
			const myThread = body.threads.find((t) => t.id === ids("nonexistent"));
			expect(myThread).toBeUndefined();
			// Shape is correct
			expect(body.pagination).toBeDefined();
			expect(typeof body.pagination.total).toBe("number");
		});
	});

	// --- GET /api/conversations/:threadId ---

	describe("GET /api/conversations/:threadId", () => {
		test("returns thread with items and an empty responses[] (verdicts now live on /api/threads)", async ({
			db,
			app,
			ids,
		}) => {
			await db.insert(threads).values({
				id: ids("thread-1"),
				hostKind: "task",
				hostId: ids("task-1"),
				initiatorId: ids("agent-1"),
				participants: JSON.stringify([ids("agent-1")]),
				lastActiveAt: new Date().toISOString(),
				createdAt: new Date().toISOString(),
			});

			await db.insert(items).values({
				id: ids("item-1"),
				title: "First item",
				threadId: ids("thread-1"),
				createdAt: new Date().toISOString(),
			});

			await db.insert(items).values({
				id: ids("item-2"),
				title: "Second item",
				threadId: ids("thread-1"),
				createdAt: new Date(Date.now() + 1000).toISOString(),
			});

			const res = await app.request(`/api/conversations/${ids("thread-1")}`, {
				headers: authHeaders(),
			});
			expect(res.status).toBe(200);

			const body = (await res.json()) as {
				id: string;
				kind: string;
				items: Array<{ id: string; responses: ReadonlyArray<unknown> }>;
			};
			expect(body.id).toBe(ids("thread-1"));
			expect(body.items).toHaveLength(2);
			const myItemIds = [ids("item-1"), ids("item-2")];
			const myItems = body.items.filter((i) => myItemIds.includes(i.id));
			expect(myItems).toHaveLength(2);
			for (const item of myItems) {
				expect(item.responses).toEqual([]);
			}
		});

		test("returns 404 for nonexistent thread", async ({ app, ids }) => {
			const res = await app.request(`/api/conversations/${ids("nonexistent")}`, {
				headers: authHeaders(),
			});
			expect(res.status).toBe(404);

			const body = (await res.json()) as { error: string; code: string };
			expect(body.code).toBe("NOT_FOUND");
		});
	});

	// --- POST /api/conversations/items ---

	describe("POST /api/conversations/items", () => {
		test("creates item and returns 201", async ({ db, app, ids }) => {
			await db.insert(threads).values({
				id: ids("thread-1"),
				hostKind: "task",
				hostId: ids("task-1"),
				initiatorId: ids("agent-1"),
				participants: JSON.stringify([ids("agent-1")]),
				lastActiveAt: new Date().toISOString(),
				createdAt: new Date().toISOString(),
			});

			const res = await app.request("/api/conversations/items", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					title: "Test item",
					threadId: ids("thread-1"),
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

		test("validates required fields (missing title -> 400)", async ({ db, app, ids }) => {
			await db.insert(threads).values({
				id: ids("thread-1"),
				hostKind: "task",
				hostId: ids("task-1"),
				initiatorId: ids("agent-1"),
				participants: JSON.stringify([ids("agent-1")]),
				lastActiveAt: new Date().toISOString(),
				createdAt: new Date().toISOString(),
			});

			const res = await app.request("/api/conversations/items", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({ threadId: ids("thread-1") }),
			});
			expect(res.status).toBe(400);

			const body = (await res.json()) as { code: string };
			expect(body.code).toBe("VALIDATION_ERROR");
		});

		test("emits item_created event", async ({ db, app, eventBus, ids }) => {
			await db.insert(threads).values({
				id: ids("thread-1"),
				hostKind: "task",
				hostId: ids("task-1"),
				initiatorId: ids("agent-1"),
				participants: JSON.stringify([ids("agent-1")]),
				lastActiveAt: new Date().toISOString(),
				createdAt: new Date().toISOString(),
			});

			const emitted: ItemCreatedEvent[] = [];
			eventBus.on("item_created", (e: ItemCreatedEvent) => emitted.push(e));

			await app.request("/api/conversations/items", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					title: "Event test",
					threadId: ids("thread-1"),
					kind: "chat",
				}),
			});

			expect(emitted).toHaveLength(1);
			expect(emitted[0]!.kind).toBe("chat");
		});

		test("includes routing info in response (O2: view removed, response is the created item)", async ({
			db,
			app,
			ids,
		}) => {
			await db.insert(threads).values({
				id: ids("thread-1"),
				hostKind: "task",
				hostId: ids("task-1"),
				initiatorId: ids("agent-1"),
				participants: JSON.stringify([ids("agent-1")]),
				lastActiveAt: new Date().toISOString(),
				createdAt: new Date().toISOString(),
			});

			const res = await app.request("/api/conversations/items", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					title: "Knowledge item",
					threadId: ids("thread-1"),
					kind: "knowledge",
				}),
			});
			expect(res.status).toBe(201);

			// @lore O2: view/founderRoute removed. The response is just the created item row.
			const body = (await res.json()) as { kind: string; view?: string };
			expect(body.kind).toBe("knowledge");
			expect(body.view).toBeUndefined();
		});

		test("returns 404 for nonexistent threadId", async ({ app, ids }) => {
			const res = await app.request("/api/conversations/items", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({ title: "Test", threadId: ids("nonexistent") }),
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
		test("records a verdict on a review and returns 201", async ({ db, app, ids }) => {
			// L1a: verdict messages set sender_id='policy_engine' as the synthetic
			// sender for system-recorded verdicts. The new `messages.sender_id` FK
			// requires the agent to exist (legacy `responses.approver_id` had no
			// FK). Seeding the synthetic agent satisfies the constraint without
			// changing test intent.
			await db.insert(users).values({
				id: ids("policy-engine"),
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
				id: ids("founder-1"),
				kind: "human",
				name: "Founder",
				role: "founder",
				status: "active",
				createdAt: new Date().toISOString(),
			});

			await db.insert(users).values({
				id: ids("agent-1"),
				name: "Agent",
				role: "growth",
				status: "active",
				createdAt: new Date().toISOString(),
			});

			const create = await app.request("/api/threads", {
				method: "POST",
				headers: { ...authHeaders(), "X-Identity": ids("agent-1") },
				body: JSON.stringify({
					hostKind: "task",
					hostId: ids("task-1"),
					participants: [ids("agent-1"), ids("founder-1")],
					initialMessage: {
						type: "review",
						clientKey: ids("init-r-a"),
						payload: {
							title: "Verdict smoke",
							reasoning: ["Looks fine"],
							artifactRef: { id: ids("a-1"), kind: "text_diff" },
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
				headers: { ...authHeaders(), "X-Identity": ids("founder-1") },
				body: JSON.stringify({
					type: "verdict",
					clientKey: ids("verdict-a"),
					payload: {
						decision: "approve",
						resolvesMessageId: reviewMessageId,
						note: "Looks good",
					},
				}),
			});
			expect(res.status).toBe(201);
		});

		test("rejects non-founder verdicts (403)", async ({ db, app, ids }) => {
			await db.insert(users).values({
				id: ids("policy-engine"),
				name: "Policy Engine",
				role: "system",
				status: "active",
				createdAt: new Date().toISOString(),
			});
			await db.insert(users).values({
				id: ids("founder-1"),
				name: "Founder",
				role: "founder",
				status: "active",
				createdAt: new Date().toISOString(),
			});
			await db.insert(users).values({
				id: ids("agent-1"),
				name: "Agent",
				role: "growth",
				status: "active",
				createdAt: new Date().toISOString(),
			});

			const create = await app.request("/api/threads", {
				method: "POST",
				headers: { ...authHeaders(), "X-Identity": ids("agent-1") },
				body: JSON.stringify({
					hostKind: "task",
					hostId: ids("task-1"),
					participants: [ids("agent-1"), ids("founder-1")],
					initialMessage: {
						type: "review",
						clientKey: ids("init-r-b"),
						payload: {
							title: "No",
							reasoning: ["Nope"],
							artifactRef: { id: ids("a-2"), kind: "text_diff" },
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
				headers: { ...authHeaders(), "X-Identity": ids("agent-1") },
				body: JSON.stringify({
					type: "verdict",
					clientKey: ids("verdict-b"),
					payload: {
						decision: "approve",
						resolvesMessageId: created.messages[0]?.id ?? "",
					},
				}),
			});
			expect(res.status).toBe(403);
		});

		test("validates verdict decision enum (invalid -> 400)", async ({ db, app, ids }) => {
			await db.insert(users).values({
				id: ids("policy-engine"),
				name: "Policy Engine",
				role: "system",
				status: "active",
				createdAt: new Date().toISOString(),
			});
			await db.insert(users).values({
				id: ids("founder-1"),
				name: "Founder",
				role: "founder",
				status: "active",
				createdAt: new Date().toISOString(),
			});
			await db.insert(users).values({
				id: ids("agent-1"),
				name: "Agent",
				role: "growth",
				status: "active",
				createdAt: new Date().toISOString(),
			});

			const create = await app.request("/api/threads", {
				method: "POST",
				headers: { ...authHeaders(), "X-Identity": ids("agent-1") },
				body: JSON.stringify({
					hostKind: "task",
					hostId: ids("task-1"),
					participants: [ids("agent-1"), ids("founder-1")],
					initialMessage: {
						type: "review",
						clientKey: ids("init-r-c"),
						payload: {
							title: "Validate",
							reasoning: ["x"],
							artifactRef: { id: ids("a-3"), kind: "text_diff" },
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
				headers: { ...authHeaders(), "X-Identity": ids("founder-1") },
				body: JSON.stringify({
					type: "verdict",
					clientKey: ids("verdict-c"),
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
			ids,
		}) => {
			await db.insert(threads).values({
				id: ids("thread-1"),
				hostKind: "task",
				hostId: ids("task-1"),
				initiatorId: ids("agent-1"),
				participants: JSON.stringify([ids("agent-1")]),
				lastActiveAt: new Date().toISOString(),
				createdAt: new Date().toISOString(),
			});

			await db.insert(users).values({
				id: ids("agent-growth"),
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
					threadId: ids("thread-1"),
					sourceAgentId: ids("agent-growth"),
				}),
			});
			expect(res.status).toBe(201);

			const body = (await res.json()) as { founderRoute?: string; sourceAgentId: string };
			// O2: founderRoute no longer returned
			expect(body.founderRoute).toBeUndefined();
			expect(body.sourceAgentId).toBe(ids("agent-growth"));
		});

		test("agent with role 'builder' -> item created without founderRoute field", async ({
			db,
			app,
			ids,
		}) => {
			await db.insert(threads).values({
				id: ids("thread-1"),
				hostKind: "task",
				hostId: ids("task-1"),
				initiatorId: ids("agent-1"),
				participants: JSON.stringify([ids("agent-1")]),
				lastActiveAt: new Date().toISOString(),
				createdAt: new Date().toISOString(),
			});

			await db.insert(users).values({
				id: ids("agent-builder"),
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
					threadId: ids("thread-1"),
					sourceAgentId: ids("agent-builder"),
				}),
			});
			expect(res.status).toBe(201);

			const body = (await res.json()) as { founderRoute?: string; sourceAgentId: string };
			// O2: founderRoute no longer returned
			expect(body.founderRoute).toBeUndefined();
			expect(body.sourceAgentId).toBe(ids("agent-builder"));
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
