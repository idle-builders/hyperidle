import { threads, users } from "@hyperidle/db";
import type { ItemCreatedEvent } from "@hyperidle/event-bus";
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

	// GET /api/conversations (door #72) and GET /api/conversations/:threadId (door #76) deleted.
	// Tests removed with the routes.

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
							artifactRef: { id: "a-1", kind: "code" },
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
							artifactRef: { id: "a-2", kind: "code" },
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
							artifactRef: { id: "a-3", kind: "code" },
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
		test("returns 401 without API key", async ({ requestWithoutAuth }) => {
			const res = await requestWithoutAuth("/api/conversations");
			expect(res.status).toBe(401);
		});
	});
});
