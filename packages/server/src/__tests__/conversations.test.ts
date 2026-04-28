import {
	agents,
	createTestDb,
	type HyperIdleDb,
	items,
	products,
	teams,
	threads,
} from "@hyperidle/db";
import type { ItemCreatedEvent } from "@hyperidle/shared";
import { EventBus } from "@hyperidle/shared";
import type { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestApp } from "../test-utils.js";

const TEST_API_KEY = "test-key-conversations";

function authHeaders(): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json" };
}

describe("Conversations Endpoints (E2)", () => {
	let db: HyperIdleDb;
	let eventBus: EventBus;
	let app: Hono;

	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		db = createTestDb();
		eventBus = new EventBus();
		app = createTestApp({ db, eventBus });

		// Seed base data
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
		// L1a: verdict messages set sender_id='policy_engine' as the synthetic
		// sender for system-recorded verdicts. The new `messages.sender_id` FK
		// requires the agent to exist (legacy `responses.approver_id` had no
		// FK). Seeding the synthetic agent satisfies the constraint without
		// changing test intent.
		db.insert(agents)
			.values({
				id: "policy_engine",
				name: "Policy Engine",
				role: "system",
				status: "active",
				createdAt: new Date().toISOString(),
			})
			.run();
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	// --- GET /api/conversations ---

	describe("GET /api/conversations", () => {
		it("lists threads sorted by recency (default)", async () => {
			const now = Date.now();
			db.insert(threads)
				.values({
					id: "t-old",
					hostKind: "task",
					hostId: "task-1",
					initiatorId: "agent-1",
					participants: JSON.stringify(["agent-1"]),
					lastActiveAt: new Date(now - 10000).toISOString(),
					createdAt: new Date(now - 10000).toISOString(),
				})
				.run();
			db.insert(threads)
				.values({
					id: "t-new",
					hostKind: "task",
					hostId: "task-1",
					initiatorId: "agent-1",
					participants: JSON.stringify(["agent-1"]),
					lastActiveAt: new Date(now).toISOString(),
					createdAt: new Date(now).toISOString(),
				})
				.run();

			const res = await app.request("/api/conversations", { headers: authHeaders() });
			expect(res.status).toBe(200);

			const body = (await res.json()) as {
				threads: Array<{ id: string }>;
				pagination: { page: number; limit: number; total: number };
			};
			expect(body.threads).toHaveLength(2);
			expect(body.threads[0].id).toBe("t-new");
			expect(body.threads[1].id).toBe("t-old");
			expect(body.pagination.total).toBe(2);
		});

		it("sorts by attention_score when requested", async () => {
			db.insert(threads)
				.values({
					id: "t-low",
					hostKind: "task",
					hostId: "task-1",
					initiatorId: "agent-1",
					participants: JSON.stringify(["agent-1"]),
					lastActiveAt: new Date().toISOString(),
					createdAt: new Date().toISOString(),
				})
				.run();
			db.insert(threads)
				.values({
					id: "t-high",
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
					id: "item-low",
					title: "Low",
					threadId: "t-low",
					attentionScore: 10,
					createdAt: new Date().toISOString(),
				})
				.run();
			db.insert(items)
				.values({
					id: "item-high",
					title: "High",
					threadId: "t-high",
					attentionScore: 90,
					createdAt: new Date().toISOString(),
				})
				.run();

			const res = await app.request("/api/conversations?sort=attention_score", {
				headers: authHeaders(),
			});
			expect(res.status).toBe(200);

			const body = (await res.json()) as {
				threads: Array<{ id: string; maxAttentionScore: number }>;
			};
			expect(body.threads[0].id).toBe("t-high");
			expect(body.threads[0].maxAttentionScore).toBe(90);
			expect(body.threads[1].id).toBe("t-low");
		});

		it("paginates correctly", async () => {
			for (let i = 0; i < 5; i++) {
				const ts = new Date(Date.now() - i * 1000).toISOString();
				db.insert(threads)
					.values({
						id: `t-${i}`,
						hostKind: "task",
						hostId: "task-1",
						initiatorId: "agent-1",
						participants: JSON.stringify(["agent-1"]),
						lastActiveAt: ts,
						createdAt: ts,
					})
					.run();
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

		it("returns empty list when no threads", async () => {
			const res = await app.request("/api/conversations", { headers: authHeaders() });
			expect(res.status).toBe(200);

			const body = (await res.json()) as { threads: unknown[]; pagination: { total: number } };
			expect(body.threads).toEqual([]);
			expect(body.pagination.total).toBe(0);
		});
	});

	// --- GET /api/conversations/:threadId ---

	describe("GET /api/conversations/:threadId", () => {
		it("returns thread with items and an empty responses[] (verdicts now live on /api/threads)", async () => {
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
					title: "First item",
					threadId: "thread-1",
					createdAt: new Date().toISOString(),
				})
				.run();
			db.insert(items)
				.values({
					id: "item-2",
					title: "Second item",
					threadId: "thread-1",
					createdAt: new Date(Date.now() + 1000).toISOString(),
				})
				.run();

			const res = await app.request("/api/conversations/thread-1", { headers: authHeaders() });
			expect(res.status).toBe(200);

			const body = (await res.json()) as {
				id: string;
				kind: string;
				items: Array<{ id: string; responses: ReadonlyArray<unknown> }>;
			};
			expect(body.id).toBe("thread-1");
			expect(body.items).toHaveLength(2);
			expect(body.items[0].id).toBe("item-1");
			expect(body.items[0].responses).toEqual([]);
			expect(body.items[1].id).toBe("item-2");
			expect(body.items[1].responses).toEqual([]);
		});

		it("returns 404 for nonexistent thread", async () => {
			const res = await app.request("/api/conversations/nonexistent", { headers: authHeaders() });
			expect(res.status).toBe(404);

			const body = (await res.json()) as { error: string; code: string };
			expect(body.code).toBe("NOT_FOUND");
		});
	});

	// --- POST /api/conversations/items ---

	describe("POST /api/conversations/items", () => {
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
		});

		it("creates item and returns 201", async () => {
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

			const body = (await res.json()) as { id: string; title: string; view: string };
			expect(body.title).toBe("Test item");
			expect(body.id).toBeDefined();
			expect(body.view).toBe("conversations");
		});

		it("validates required fields (missing title -> 400)", async () => {
			const res = await app.request("/api/conversations/items", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({ threadId: "thread-1" }),
			});
			expect(res.status).toBe(400);

			const body = (await res.json()) as { code: string };
			expect(body.code).toBe("VALIDATION_ERROR");
		});

		it("emits item_created event", async () => {
			const emitted: ItemCreatedEvent[] = [];
			eventBus.on("item_created", (e) => emitted.push(e));

			await app.request("/api/conversations/items", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({ title: "Event test", threadId: "thread-1", kind: "chat" }),
			});

			expect(emitted).toHaveLength(1);
			expect(emitted[0].kind).toBe("chat");
		});

		it("includes routing info in response", async () => {
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

			const body = (await res.json()) as { view: string };
			expect(body.view).toBe("knowledge");
		});

		it("returns 404 for nonexistent threadId", async () => {
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
		beforeEach(() => {
			// Seed a founder approver and a non-founder review author so the
			// canonical route's authz check (founder + not-self) passes.
			db.insert(agents)
				.values({
					id: "founder-1",
					name: "Founder",
					role: "founder",
					status: "active",
					createdAt: new Date().toISOString(),
				})
				.run();
			db.insert(agents)
				.values({
					id: "agent-1",
					name: "Agent",
					role: "growth",
					status: "active",
					createdAt: new Date().toISOString(),
				})
				.run();
		});

		it("records a verdict on a review and returns 201", async () => {
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
			const reviewMessageId = created.messages[0].id;

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

		it("rejects non-founder verdicts (403)", async () => {
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
						resolvesMessageId: created.messages[0].id,
					},
				}),
			});
			expect(res.status).toBe(403);
		});

		it("validates verdict decision enum (invalid -> 400)", async () => {
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
						resolvesMessageId: created.messages[0].id,
					},
				}),
			});
			expect(res.status).toBe(400);
		});
	});

	// --- Founder routing integration ---

	describe("Founder routing integration", () => {
		it("agent with role 'growth' -> item tagged CEO", async () => {
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
			db.insert(agents)
				.values({
					id: "agent-growth",
					name: "Growth Agent",
					role: "growth",
					status: "active",
					createdAt: new Date().toISOString(),
				})
				.run();

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

			const body = (await res.json()) as { founderRoute: string };
			expect(body.founderRoute).toBe("ceo");
		});

		it("agent with role 'builder' -> item tagged CPO", async () => {
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
			db.insert(agents)
				.values({
					id: "agent-builder",
					name: "Builder Agent",
					role: "builder",
					status: "active",
					createdAt: new Date().toISOString(),
				})
				.run();

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

			const body = (await res.json()) as { founderRoute: string };
			expect(body.founderRoute).toBe("cpo");
		});
	});

	// --- Auth ---

	describe("Auth required", () => {
		it("returns 401 without API key", async () => {
			const res = await app.request("/api/conversations");
			expect(res.status).toBe(401);
		});
	});
});
