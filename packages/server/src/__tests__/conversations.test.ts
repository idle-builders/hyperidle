import {
	type HyperIdleDb,
	agents,
	createTestDb,
	items,
	products,
	responses,
	teams,
	threads,
} from "@hyperidle/db";
import { EventBus } from "@hyperidle/shared";
import type { ItemCreatedEvent, ResponseRecordedEvent } from "@hyperidle/shared";
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
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	// --- GET /api/conversations ---

	describe("GET /api/conversations", () => {
		it("lists threads sorted by recency (default)", async () => {
			const now = Date.now();
			db.insert(threads)
				.values({ id: "t-old", kind: "chat", createdAt: new Date(now - 10000).toISOString() })
				.run();
			db.insert(threads)
				.values({ id: "t-new", kind: "review", createdAt: new Date(now).toISOString() })
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
				.values({ id: "t-low", kind: "chat", createdAt: new Date().toISOString() })
				.run();
			db.insert(threads)
				.values({ id: "t-high", kind: "review", createdAt: new Date().toISOString() })
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
				db.insert(threads)
					.values({
						id: `t-${i}`,
						kind: "chat",
						createdAt: new Date(Date.now() - i * 1000).toISOString(),
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
		it("returns thread with items and responses", async () => {
			db.insert(threads)
				.values({ id: "thread-1", kind: "review", createdAt: new Date().toISOString() })
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
			db.insert(responses)
				.values({
					id: "resp-1",
					itemId: "item-1",
					decision: "approve",
					respondedAt: new Date().toISOString(),
				})
				.run();

			const res = await app.request("/api/conversations/thread-1", { headers: authHeaders() });
			expect(res.status).toBe(200);

			const body = (await res.json()) as {
				id: string;
				kind: string;
				items: Array<{ id: string; responses: Array<{ id: string; decision: string }> }>;
			};
			expect(body.id).toBe("thread-1");
			expect(body.items).toHaveLength(2);
			expect(body.items[0].id).toBe("item-1");
			expect(body.items[0].responses).toHaveLength(1);
			expect(body.items[0].responses[0].decision).toBe("approve");
			expect(body.items[1].id).toBe("item-2");
			expect(body.items[1].responses).toHaveLength(0);
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
				.values({ id: "thread-1", kind: "review", createdAt: new Date().toISOString() })
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

	// --- POST /api/conversations/responses ---

	describe("POST /api/conversations/responses", () => {
		beforeEach(() => {
			db.insert(threads)
				.values({ id: "thread-1", kind: "review", createdAt: new Date().toISOString() })
				.run();
			db.insert(items)
				.values({
					id: "item-1",
					title: "Review item",
					threadId: "thread-1",
					createdAt: new Date().toISOString(),
				})
				.run();
		});

		it("records verdict and returns 201", async () => {
			const res = await app.request("/api/conversations/responses", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					itemId: "item-1",
					decision: "approve",
					feedback: "Looks good",
				}),
			});
			expect(res.status).toBe(201);

			const body = (await res.json()) as { id: string; decision: string; feedback: string };
			expect(body.decision).toBe("approve");
			expect(body.feedback).toBe("Looks good");
		});

		it("validates decision enum (invalid -> 400)", async () => {
			const res = await app.request("/api/conversations/responses", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					itemId: "item-1",
					decision: "invalid-decision",
				}),
			});
			expect(res.status).toBe(400);
		});

		it("returns 404 for nonexistent itemId", async () => {
			const res = await app.request("/api/conversations/responses", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					itemId: "nonexistent",
					decision: "approve",
				}),
			});
			expect(res.status).toBe(404);
		});

		it("emits response_recorded event", async () => {
			const emitted: ResponseRecordedEvent[] = [];
			eventBus.on("response_recorded", (e) => emitted.push(e));

			await app.request("/api/conversations/responses", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					itemId: "item-1",
					decision: "reject",
				}),
			});

			expect(emitted).toHaveLength(1);
			expect(emitted[0].decision).toBe("reject");
			expect(emitted[0].itemId).toBe("item-1");
		});

		it("accepts all 10 verdict actions", async () => {
			const actions = [
				"approve",
				"approve-with-comments",
				"comment",
				"inline-comment",
				"request-changes",
				"edit",
				"reject",
				"reply",
				"snooze",
				"escalate",
			];

			for (const action of actions) {
				const itemId = `item-${action}`;
				db.insert(items)
					.values({
						id: itemId,
						title: `Item for ${action}`,
						threadId: "thread-1",
						createdAt: new Date().toISOString(),
					})
					.run();

				const res = await app.request("/api/conversations/responses", {
					method: "POST",
					headers: authHeaders(),
					body: JSON.stringify({ itemId, decision: action }),
				});
				expect(res.status).toBe(201);
			}
		});
	});

	// --- Founder routing integration ---

	describe("Founder routing integration", () => {
		it("agent with role 'growth' -> item tagged CEO", async () => {
			db.insert(threads)
				.values({ id: "thread-1", kind: "review", createdAt: new Date().toISOString() })
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
				.values({ id: "thread-1", kind: "review", createdAt: new Date().toISOString() })
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
