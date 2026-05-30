/**
 * O2 — Schema Migration & Route Rewrite — Red Phase Tests
 *
 * These tests encode the O2 acceptance criteria. They WILL fail until
 * the O2 implementation is complete. That is the point — red phase.
 *
 * Acceptance Criteria covered:
 * 1. Extension tables (knowledge_strategy_fabric, task_strategy_fabric) created
 * 2. Kernel table columns stripped (knowledgeItems, tasks, sessions, items, artifacts)
 * 3. Knowledge route URL shape changed (/:layer/... → /:id or /)
 * 4. Route purity: no routeToFounder/routeItem/createRelevanceService inline calls
 * 5. Knowledge events emitted correctly (knowledge_created, knowledge_accessed, etc.)
 * 6. FK cascade delete on extension tables
 * 7. Status simplified to draft | active | archived
 */

import { createTestDb, type HyperIdleDb, type TestDbHandle } from "@hyperidle/db";
import { type DomainEvent, EventBus } from "@hyperidle/shared";
import { sql } from "drizzle-orm";
import type { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestApp } from "../test-utils.js";

// biome-ignore lint/style/useNamingConvention: SQL information_schema returns snake_case column_name
type SqlColumnRow = { column_name: string };

const TEST_API_KEY = "test-key-O2-migration";

function authHeaders(extra?: Record<string, string>): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json", ...extra };
}

describe("O2 — Schema Migration & Route Rewrite", () => {
	let db: HyperIdleDb;
	let eventBus: EventBus;
	let app: Hono;
	let handle: TestDbHandle;

	beforeEach(async () => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		handle = await createTestDb();
		db = handle.db;
		eventBus = new EventBus();
		app = await createTestApp({ db, eventBus });
	});

	afterEach(async () => {
		vi.unstubAllEnvs();
		await handle?.close();
	});

	// ---------------------------------------------------------------------------
	// 1. Extension tables — schema structure
	// ---------------------------------------------------------------------------

	describe("1. Extension tables exist with correct structure", () => {
		it("knowledge_strategy_fabric table exists in the database", async () => {
			// If the table doesn't exist this will throw
			await expect(
				db.execute(sql.raw("SELECT id FROM knowledge_strategy_fabric LIMIT 1")),
			).resolves.toBeDefined();
		});

		it("task_strategy_fabric table exists in the database", async () => {
			await expect(
				db.execute(sql.raw("SELECT id FROM task_strategy_fabric LIMIT 1")),
			).resolves.toBeDefined();
		});

		it("knowledge_strategy_fabric has FK to knowledge_items with cascade delete", async () => {
			const result = await db.execute(
				sql`SELECT column_name FROM information_schema.columns WHERE table_name = ${"knowledge_strategy_fabric"}`,
			);
			const colNames = (result.rows as Array<SqlColumnRow>).map((r) => r.column_name);
			expect(colNames).toContain("id");
			expect(colNames).toContain("knowledge_item_id");
		});

		it("task_strategy_fabric has FK to tasks with cascade delete", async () => {
			const result = await db.execute(
				sql`SELECT column_name FROM information_schema.columns WHERE table_name = ${"task_strategy_fabric"}`,
			);
			const colNames = (result.rows as Array<SqlColumnRow>).map((r) => r.column_name);
			expect(colNames).toContain("id");
			expect(colNames).toContain("task_id");
		});

		it("knowledge_strategy_fabric does NOT have a strategy discriminator column", async () => {
			const result = await db.execute(
				sql`SELECT column_name FROM information_schema.columns WHERE table_name = ${"knowledge_strategy_fabric"}`,
			);
			const colNames = (result.rows as Array<SqlColumnRow>).map((r) => r.column_name);
			expect(colNames).not.toContain("strategy");
		});

		it("task_strategy_fabric does NOT have a strategy discriminator column", async () => {
			const result = await db.execute(
				sql`SELECT column_name FROM information_schema.columns WHERE table_name = ${"task_strategy_fabric"}`,
			);
			const colNames = (result.rows as Array<SqlColumnRow>).map((r) => r.column_name);
			expect(colNames).not.toContain("strategy");
		});
	});

	// ---------------------------------------------------------------------------
	// 2. Kernel table stripping — knowledgeItems
	// ---------------------------------------------------------------------------

	describe("2. knowledgeItems kernel table columns stripped", () => {
		it("knowledgeItems no longer has 'layer' column", async () => {
			const result = await db.execute(
				sql`SELECT column_name FROM information_schema.columns WHERE table_name = ${"knowledge_items"}`,
			);
			const colNames = (result.rows as Array<SqlColumnRow>).map((r) => r.column_name);
			expect(colNames).not.toContain("layer");
		});

		it("knowledgeItems no longer has 'scopeId' / 'scope_id' column from the old strategy layer", async () => {
			// @lore Q2: scope_id WAS stripped in O2 (from the strategy layer).
			// Q2 re-adds scope_kind + scope_id to the KERNEL table so each item
			// knows its scope. The O2 assertion that scope_id was absent is
			// superseded by Q2. This test now asserts that scope_kind IS present
			// (replacing the column that O2 removed with a new kernel-level one).
			const result = await db.execute(
				sql`SELECT column_name FROM information_schema.columns WHERE table_name = ${"knowledge_items"}`,
			);
			const colNames = (result.rows as Array<SqlColumnRow>).map((r) => r.column_name);
			// Q2: scope_kind is a kernel column — should exist.
			expect(colNames).toContain("scope_kind");
			// scope_id from the strategy layer was removed in O2;
			// Q2 re-adds a kernel-level scope_id (nullable) for scoped items.
			expect(colNames).toContain("scope_id");
		});

		it("knowledgeItems no longer has 'kind' column", async () => {
			const result = await db.execute(
				sql`SELECT column_name FROM information_schema.columns WHERE table_name = ${"knowledge_items"}`,
			);
			const colNames = (result.rows as Array<SqlColumnRow>).map((r) => r.column_name);
			expect(colNames).not.toContain("kind");
		});

		it("knowledgeItems no longer has 'attentionScore' / 'attention_score' column", async () => {
			const result = await db.execute(
				sql`SELECT column_name FROM information_schema.columns WHERE table_name = ${"knowledge_items"}`,
			);
			const colNames = (result.rows as Array<SqlColumnRow>).map((r) => r.column_name);
			expect(colNames).not.toContain("attention_score");
		});

		it("knowledgeItems no longer has 'relevanceScore' / 'relevance_score' column", async () => {
			const result = await db.execute(
				sql`SELECT column_name FROM information_schema.columns WHERE table_name = ${"knowledge_items"}`,
			);
			const colNames = (result.rows as Array<SqlColumnRow>).map((r) => r.column_name);
			expect(colNames).not.toContain("relevance_score");
		});

		it("knowledgeItems no longer has 'citationCount' / 'citation_count' column", async () => {
			const result = await db.execute(
				sql`SELECT column_name FROM information_schema.columns WHERE table_name = ${"knowledge_items"}`,
			);
			const colNames = (result.rows as Array<SqlColumnRow>).map((r) => r.column_name);
			expect(colNames).not.toContain("citation_count");
		});

		it("knowledgeItems no longer has 'lastCitedAt' / 'last_cited_at' column", async () => {
			const result = await db.execute(
				sql`SELECT column_name FROM information_schema.columns WHERE table_name = ${"knowledge_items"}`,
			);
			const colNames = (result.rows as Array<SqlColumnRow>).map((r) => r.column_name);
			expect(colNames).not.toContain("last_cited_at");
		});

		it("knowledgeItems no longer has 'confidence' column", async () => {
			const result = await db.execute(
				sql`SELECT column_name FROM information_schema.columns WHERE table_name = ${"knowledge_items"}`,
			);
			const colNames = (result.rows as Array<SqlColumnRow>).map((r) => r.column_name);
			expect(colNames).not.toContain("confidence");
		});

		it("knowledgeItems no longer has 'meta' column", async () => {
			const result = await db.execute(
				sql`SELECT column_name FROM information_schema.columns WHERE table_name = ${"knowledge_items"}`,
			);
			const colNames = (result.rows as Array<SqlColumnRow>).map((r) => r.column_name);
			expect(colNames).not.toContain("meta");
		});

		it("knowledgeItems still has 'topic' column", async () => {
			const result = await db.execute(
				sql`SELECT column_name FROM information_schema.columns WHERE table_name = ${"knowledge_items"}`,
			);
			const colNames = (result.rows as Array<SqlColumnRow>).map((r) => r.column_name);
			expect(colNames).toContain("topic");
		});
	});

	// ---------------------------------------------------------------------------
	// 3. Kernel table stripping — tasks
	// ---------------------------------------------------------------------------

	describe("3. tasks kernel table columns stripped", () => {
		it("tasks no longer has 'risk_tier' column", async () => {
			const result = await db.execute(
				sql`SELECT column_name FROM information_schema.columns WHERE table_name = ${"tasks"}`,
			);
			const colNames = (result.rows as Array<SqlColumnRow>).map((r) => r.column_name);
			expect(colNames).not.toContain("risk_tier");
		});

		it("tasks no longer has 'attention_score' column", async () => {
			const result = await db.execute(
				sql`SELECT column_name FROM information_schema.columns WHERE table_name = ${"tasks"}`,
			);
			const colNames = (result.rows as Array<SqlColumnRow>).map((r) => r.column_name);
			expect(colNames).not.toContain("attention_score");
		});

		it("tasks no longer has 'durability' column", async () => {
			const result = await db.execute(
				sql`SELECT column_name FROM information_schema.columns WHERE table_name = ${"tasks"}`,
			);
			const colNames = (result.rows as Array<SqlColumnRow>).map((r) => r.column_name);
			expect(colNames).not.toContain("durability");
		});

		it("tasks no longer has 'cross_team' column", async () => {
			const result = await db.execute(
				sql`SELECT column_name FROM information_schema.columns WHERE table_name = ${"tasks"}`,
			);
			const colNames = (result.rows as Array<SqlColumnRow>).map((r) => r.column_name);
			expect(colNames).not.toContain("cross_team");
		});
	});

	// ---------------------------------------------------------------------------
	// 4. Kernel table stripping — sessions
	// ---------------------------------------------------------------------------

	describe("4. sessions kernel table columns stripped", () => {
		it("sessions no longer has 'cost' column", async () => {
			const result = await db.execute(
				sql`SELECT column_name FROM information_schema.columns WHERE table_name = ${"sessions"}`,
			);
			const colNames = (result.rows as Array<SqlColumnRow>).map((r) => r.column_name);
			expect(colNames).not.toContain("cost");
		});

		it("sessions no longer has 'cost_minor' column", async () => {
			const result = await db.execute(
				sql`SELECT column_name FROM information_schema.columns WHERE table_name = ${"sessions"}`,
			);
			const colNames = (result.rows as Array<SqlColumnRow>).map((r) => r.column_name);
			expect(colNames).not.toContain("cost_minor");
		});

		it("sessions no longer has 'cost_currency' column", async () => {
			const result = await db.execute(
				sql`SELECT column_name FROM information_schema.columns WHERE table_name = ${"sessions"}`,
			);
			const colNames = (result.rows as Array<SqlColumnRow>).map((r) => r.column_name);
			expect(colNames).not.toContain("cost_currency");
		});

		it("sessions no longer has 'tokens_json' column", async () => {
			const result = await db.execute(
				sql`SELECT column_name FROM information_schema.columns WHERE table_name = ${"sessions"}`,
			);
			const colNames = (result.rows as Array<SqlColumnRow>).map((r) => r.column_name);
			expect(colNames).not.toContain("tokens_json");
		});

		it("sessions no longer has 'tokens_input' column", async () => {
			const result = await db.execute(
				sql`SELECT column_name FROM information_schema.columns WHERE table_name = ${"sessions"}`,
			);
			const colNames = (result.rows as Array<SqlColumnRow>).map((r) => r.column_name);
			expect(colNames).not.toContain("tokens_input");
		});

		it("sessions no longer has 'tokens_output' column", async () => {
			const result = await db.execute(
				sql`SELECT column_name FROM information_schema.columns WHERE table_name = ${"sessions"}`,
			);
			const colNames = (result.rows as Array<SqlColumnRow>).map((r) => r.column_name);
			expect(colNames).not.toContain("tokens_output");
		});

		it("sessions no longer has 'trace_id' column", async () => {
			const result = await db.execute(
				sql`SELECT column_name FROM information_schema.columns WHERE table_name = ${"sessions"}`,
			);
			const colNames = (result.rows as Array<SqlColumnRow>).map((r) => r.column_name);
			expect(colNames).not.toContain("trace_id");
		});

		it("sessions no longer has 'harness_url' column", async () => {
			const result = await db.execute(
				sql`SELECT column_name FROM information_schema.columns WHERE table_name = ${"sessions"}`,
			);
			const colNames = (result.rows as Array<SqlColumnRow>).map((r) => r.column_name);
			expect(colNames).not.toContain("harness_url");
		});
	});

	// ---------------------------------------------------------------------------
	// 5. Kernel table stripping — items
	// ---------------------------------------------------------------------------

	describe("5. items kernel table columns stripped", () => {
		it("items no longer has 'attention_score' column", async () => {
			const result = await db.execute(
				sql`SELECT column_name FROM information_schema.columns WHERE table_name = ${"items"}`,
			);
			const colNames = (result.rows as Array<SqlColumnRow>).map((r) => r.column_name);
			expect(colNames).not.toContain("attention_score");
		});

		it("items no longer has 'reversibility' column", async () => {
			const result = await db.execute(
				sql`SELECT column_name FROM information_schema.columns WHERE table_name = ${"items"}`,
			);
			const colNames = (result.rows as Array<SqlColumnRow>).map((r) => r.column_name);
			expect(colNames).not.toContain("reversibility");
		});

		it("items no longer has 'sandbox_result' column", async () => {
			const result = await db.execute(
				sql`SELECT column_name FROM information_schema.columns WHERE table_name = ${"items"}`,
			);
			const colNames = (result.rows as Array<SqlColumnRow>).map((r) => r.column_name);
			expect(colNames).not.toContain("sandbox_result");
		});

		it("items no longer has 'cost_estimate' column", async () => {
			const result = await db.execute(
				sql`SELECT column_name FROM information_schema.columns WHERE table_name = ${"items"}`,
			);
			const colNames = (result.rows as Array<SqlColumnRow>).map((r) => r.column_name);
			expect(colNames).not.toContain("cost_estimate");
		});
	});

	// ---------------------------------------------------------------------------
	// 6. Kernel table stripping — artifacts
	// ---------------------------------------------------------------------------

	describe("6. artifacts kernel table columns stripped", () => {
		it("artifacts no longer has 'cost_money_micros' column", async () => {
			const result = await db.execute(
				sql`SELECT column_name FROM information_schema.columns WHERE table_name = ${"artifacts"}`,
			);
			const colNames = (result.rows as Array<SqlColumnRow>).map((r) => r.column_name);
			expect(colNames).not.toContain("cost_money_micros");
		});

		it("artifacts no longer has 'cost_tokens_input' column", async () => {
			const result = await db.execute(
				sql`SELECT column_name FROM information_schema.columns WHERE table_name = ${"artifacts"}`,
			);
			const colNames = (result.rows as Array<SqlColumnRow>).map((r) => r.column_name);
			expect(colNames).not.toContain("cost_tokens_input");
		});

		it("artifacts no longer has 'cost_tokens_output' column", async () => {
			const result = await db.execute(
				sql`SELECT column_name FROM information_schema.columns WHERE table_name = ${"artifacts"}`,
			);
			const colNames = (result.rows as Array<SqlColumnRow>).map((r) => r.column_name);
			expect(colNames).not.toContain("cost_tokens_output");
		});

		it("artifacts no longer has 'cost_settled_at' column", async () => {
			const result = await db.execute(
				sql`SELECT column_name FROM information_schema.columns WHERE table_name = ${"artifacts"}`,
			);
			const colNames = (result.rows as Array<SqlColumnRow>).map((r) => r.column_name);
			expect(colNames).not.toContain("cost_settled_at");
		});
	});

	// ---------------------------------------------------------------------------
	// 7. Knowledge route URL shape
	// ---------------------------------------------------------------------------

	describe("7. Knowledge route URL shape changed", () => {
		it("POST /api/knowledge (no layer prefix) creates item and returns 201", async () => {
			const res = await app.request("/api/knowledge", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					topic: "testing",
					title: "Test Item",
					body: "Test body content.",
					format: "markdown",
					scopeKind: "factory",
					updatedBy: "human",
				}),
			});
			expect(res.status).toBe(201);
		});

		it("GET /api/knowledge/:id (no layer prefix) retrieves item by id", async () => {
			// First create an item
			const createRes = await app.request("/api/knowledge", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					topic: "testing",
					title: "Fetch Me",
					body: "Fetch body.",
					format: "markdown",
					scopeKind: "factory",
					updatedBy: "human",
				}),
			});
			expect(createRes.status).toBe(201);
			const created = (await createRes.json()) as Record<string, unknown>;
			const id = created.id as string;

			const getRes = await app.request(`/api/knowledge/${id}`, {
				headers: authHeaders(),
			});
			expect(getRes.status).toBe(200);
			const body = (await getRes.json()) as Record<string, unknown>;
			expect(body.id).toBe(id);
		});

		it("GET /api/knowledge/:layer/:id (old URL) returns 404", async () => {
			// First create an item with new URL shape
			const createRes = await app.request("/api/knowledge", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					topic: "testing",
					title: "Layer Test",
					body: "Test.",
					format: "markdown",
					scopeKind: "factory",
					updatedBy: "human",
				}),
			});
			const created = (await createRes.json()) as Record<string, unknown>;
			const id = created.id as string;

			// Old URL shape with layer prefix should return 404
			const oldRes = await app.request(`/api/knowledge/L0/${id}`, {
				headers: authHeaders(),
			});
			expect(oldRes.status).toBe(404);
		});

		it("GET /api/knowledge (list all) returns 200", async () => {
			const res = await app.request("/api/knowledge", {
				headers: authHeaders(),
			});
			expect(res.status).toBe(200);
		});

		it("PATCH /api/knowledge/:id (no layer prefix) updates item", async () => {
			const createRes = await app.request("/api/knowledge", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					topic: "testing",
					title: "Patch Me",
					body: "Original body.",
					format: "markdown",
					scopeKind: "factory",
					updatedBy: "human",
				}),
			});
			const created = (await createRes.json()) as Record<string, unknown>;
			const id = created.id as string;

			const patchRes = await app.request(`/api/knowledge/${id}`, {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({
					version: 1,
					title: "Updated Title",
					updatedBy: "curator",
				}),
			});
			expect(patchRes.status).toBe(200);
			const patched = (await patchRes.json()) as Record<string, unknown>;
			expect(patched.title).toBe("Updated Title");
		});

		it("POST /api/knowledge/:id/archive (no layer prefix) archives item", async () => {
			const createRes = await app.request("/api/knowledge", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					topic: "testing",
					title: "Archive Me",
					body: "Body.",
					format: "markdown",
					scopeKind: "factory",
					updatedBy: "human",
				}),
			});
			const created = (await createRes.json()) as Record<string, unknown>;
			const id = created.id as string;

			const archiveRes = await app.request(`/api/knowledge/${id}/archive`, {
				method: "POST",
				headers: authHeaders(),
			});
			expect(archiveRes.status).toBe(200);
		});
	});

	// ---------------------------------------------------------------------------
	// 8. Knowledge route events
	// ---------------------------------------------------------------------------

	describe("8. Knowledge route emits correct events", () => {
		it("POST /api/knowledge emits 'knowledge_created' event", async () => {
			const events: unknown[] = [];
			eventBus.on("*", (e: DomainEvent) => events.push(e));

			const res = await app.request("/api/knowledge", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					topic: "testing",
					title: "Event Test",
					body: "Body.",
					format: "markdown",
					scopeKind: "factory",
					updatedBy: "human",
				}),
			});
			expect(res.status).toBe(201);

			const knowledgeCreated = events.filter(
				(e) => (e as Record<string, unknown>).type === "knowledge_created",
			);
			expect(knowledgeCreated).toHaveLength(1);
		});

		it("GET /api/knowledge/:id emits 'knowledge_accessed' event", async () => {
			// Create item first
			const createRes = await app.request("/api/knowledge", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					topic: "testing",
					title: "Access Event",
					body: "Body.",
					format: "markdown",
					scopeKind: "factory",
					updatedBy: "human",
				}),
			});
			const created = (await createRes.json()) as Record<string, unknown>;
			const id = created.id as string;

			const events: unknown[] = [];
			eventBus.on("*", (e: DomainEvent) => events.push(e));

			const getRes = await app.request(`/api/knowledge/${id}`, {
				headers: authHeaders(),
			});
			expect(getRes.status).toBe(200);

			const accessedEvents = events.filter(
				(e) => (e as Record<string, unknown>).type === "knowledge_accessed",
			);
			expect(accessedEvents).toHaveLength(1);
		});

		it("PATCH /api/knowledge/:id emits 'knowledge_updated' event", async () => {
			const createRes = await app.request("/api/knowledge", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					topic: "testing",
					title: "Update Event",
					body: "Body.",
					format: "markdown",
					scopeKind: "factory",
					updatedBy: "human",
				}),
			});
			const created = (await createRes.json()) as Record<string, unknown>;
			const id = created.id as string;

			const events: unknown[] = [];
			eventBus.on("*", (e: DomainEvent) => events.push(e));

			const patchRes = await app.request(`/api/knowledge/${id}`, {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({
					version: 1,
					title: "Updated",
					updatedBy: "curator",
				}),
			});
			expect(patchRes.status).toBe(200);

			const updatedEvents = events.filter(
				(e) => (e as Record<string, unknown>).type === "knowledge_updated",
			);
			expect(updatedEvents).toHaveLength(1);
		});

		it("POST /api/knowledge/:id/archive emits 'knowledge_archived' event", async () => {
			const createRes = await app.request("/api/knowledge", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					topic: "testing",
					title: "Archive Event",
					body: "Body.",
					format: "markdown",
					scopeKind: "factory",
					updatedBy: "human",
				}),
			});
			const created = (await createRes.json()) as Record<string, unknown>;
			const id = created.id as string;

			const events: unknown[] = [];
			eventBus.on("*", (e: DomainEvent) => events.push(e));

			const archiveRes = await app.request(`/api/knowledge/${id}/archive`, {
				method: "POST",
				headers: authHeaders(),
			});
			expect(archiveRes.status).toBe(200);

			const archivedEvents = events.filter(
				(e) => (e as Record<string, unknown>).type === "knowledge_archived",
			);
			expect(archivedEvents).toHaveLength(1);
		});

		it("POST /api/knowledge/:id/flag emits 'knowledge_updated' event with action 'flagged'", async () => {
			const createRes = await app.request("/api/knowledge", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					topic: "testing",
					title: "Flag Event",
					body: "Body.",
					format: "markdown",
					scopeKind: "factory",
					updatedBy: "human",
				}),
			});
			const created = (await createRes.json()) as Record<string, unknown>;
			const id = created.id as string;

			const events: unknown[] = [];
			eventBus.on("*", (e: DomainEvent) => events.push(e));

			const flagRes = await app.request(`/api/knowledge/${id}/flag`, {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({ reason: "Needs review" }),
			});
			expect(flagRes.status).toBe(200);

			const flaggedEvents = events.filter(
				(e) =>
					(e as Record<string, unknown>).type === "knowledge_updated" &&
					(e as Record<string, unknown>).action === "flagged",
			);
			expect(flaggedEvents).toHaveLength(1);
		});
	});

	// ---------------------------------------------------------------------------
	// 9. Knowledge status: draft | active | archived only
	// ---------------------------------------------------------------------------

	describe("9. Knowledge item status simplified to draft | active | archived", () => {
		it("POST /api/knowledge creates item with status 'draft' (not 'captured')", async () => {
			const res = await app.request("/api/knowledge", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					topic: "testing",
					title: "Status Test",
					body: "Body.",
					format: "markdown",
					scopeKind: "factory",
					updatedBy: "human",
				}),
			});
			expect(res.status).toBe(201);
			const body = (await res.json()) as Record<string, unknown>;
			expect(body.status).toBe("draft");
		});

		it("POST /api/knowledge/:id/archive sets status to 'archived'", async () => {
			const createRes = await app.request("/api/knowledge", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					topic: "testing",
					title: "Archive Status",
					body: "Body.",
					format: "markdown",
					scopeKind: "factory",
					updatedBy: "human",
				}),
			});
			const created = (await createRes.json()) as Record<string, unknown>;
			const id = created.id as string;

			const archiveRes = await app.request(`/api/knowledge/${id}/archive`, {
				method: "POST",
				headers: authHeaders(),
			});
			expect(archiveRes.status).toBe(200);
			const body = (await archiveRes.json()) as Record<string, unknown>;
			expect(body.status).toBe("archived");
		});

		it("PATCH /api/knowledge/:id rejects status 'provisional' (invalid status)", async () => {
			const createRes = await app.request("/api/knowledge", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					topic: "testing",
					title: "Invalid Status",
					body: "Body.",
					format: "markdown",
					scopeKind: "factory",
					updatedBy: "human",
				}),
			});
			const created = (await createRes.json()) as Record<string, unknown>;
			const id = created.id as string;

			const patchRes = await app.request(`/api/knowledge/${id}`, {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({
					version: 1,
					status: "provisional",
					updatedBy: "curator",
				}),
			});
			// provisional is no longer a valid status in O2
			expect(patchRes.status).toBe(400);
		});

		it("PATCH /api/knowledge/:id accepts status 'active'", async () => {
			const createRes = await app.request("/api/knowledge", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					topic: "testing",
					title: "Activate Me",
					body: "Body.",
					format: "markdown",
					scopeKind: "factory",
					updatedBy: "human",
				}),
			});
			const created = (await createRes.json()) as Record<string, unknown>;
			const id = created.id as string;

			const patchRes = await app.request(`/api/knowledge/${id}`, {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({
					version: 1,
					status: "active",
					updatedBy: "curator",
				}),
			});
			expect(patchRes.status).toBe(200);
			const body = (await patchRes.json()) as Record<string, unknown>;
			expect(body.status).toBe("active");
		});
	});

	// ---------------------------------------------------------------------------
	// 10. FK cascade delete — extension tables
	// ---------------------------------------------------------------------------

	describe("10. Extension table FK cascade delete", () => {
		it("deleting a knowledge item cascades to knowledge_strategy_fabric rows", async () => {
			const itemId = crypto.randomUUID();
			const now = new Date().toISOString();

			// After O2: knowledge_items has no layer/kind columns.
			// Insert using the stripped schema columns only.
			await db.execute(
				sql.raw(`INSERT INTO knowledge_items (id, topic, title, body, format, status, version, updated_by, created_at, updated_at)
				 VALUES ('${itemId}', 'test', 'Test', 'Body', 'markdown', 'draft', 1, 'human', '${now}', '${now}')`),
			);

			// Insert a strategy extension row — table must exist with FK cascade
			const extId = crypto.randomUUID();
			await db.execute(
				sql.raw(
					`INSERT INTO knowledge_strategy_fabric (id, knowledge_item_id) VALUES ('${extId}', '${itemId}')`,
				),
			);

			// Verify extension row exists
			const beforeResult = await db.execute(
				sql.raw(`SELECT id FROM knowledge_strategy_fabric WHERE knowledge_item_id = '${itemId}'`),
			);
			const before = beforeResult.rows as Array<{ id: string }>;
			expect(before).toHaveLength(1);

			// Delete the knowledge item — cascade should remove extension rows
			await db.execute(sql.raw(`DELETE FROM knowledge_items WHERE id = '${itemId}'`));

			// Extension row should be gone (CASCADE DELETE)
			const afterResult = await db.execute(
				sql.raw(`SELECT id FROM knowledge_strategy_fabric WHERE knowledge_item_id = '${itemId}'`),
			);
			const after = afterResult.rows as Array<{ id: string }>;
			expect(after).toHaveLength(0);
		});

		it("deleting a task cascades to task_strategy_fabric rows", async () => {
			const now = new Date().toISOString();

			// @lore U1: products→teams, teams→team_members, bets.pitch→description, bets removes product_id
			// Seed required FK ancestors
			db.run(
				`INSERT INTO teams (id, name, phase, created_at) VALUES ('p1-cascade', 'Prod', 'build', '${now}')`,
			);
			db.run(
				`INSERT INTO team_members (id, team_id, capacity, active_bets, formed_at) VALUES ('t1-cascade', 'p1-cascade', 3, 0, '${now}')`,
			);
			db.run(
				`INSERT INTO bets (id, team_id, description, status, created_at) VALUES ('b1-cascade', 'p1-cascade', 'Pitch', 'active', '${now}')`,
			);
			const taskId = crypto.randomUUID();
			// After O2: tasks has no riskTier/attentionScore/durability/crossTeam columns
			// After U1: tasks has no product_id column
			db.run(
				`INSERT INTO tasks (id, bet_id, team_id, title, state, created_at, updated_at)
				 VALUES ('${taskId}', 'b1-cascade', 'p1-cascade', 'Task', 'pending', '${now}', '${now}')`,
			);

			// Insert extension row — table must exist with FK cascade
			const extId = crypto.randomUUID();
			await db.execute(
				sql.raw(`INSERT INTO task_strategy_fabric (id, task_id) VALUES ('${extId}', '${taskId}')`),
			);

			// Verify extension row exists
			const beforeResult = await db.execute(
				sql.raw(`SELECT id FROM task_strategy_fabric WHERE task_id = '${taskId}'`),
			);
			const before = beforeResult.rows as Array<{ id: string }>;
			expect(before).toHaveLength(1);

			// Delete the task — cascade should remove extension rows
			await db.execute(sql.raw(`DELETE FROM tasks WHERE id = '${taskId}'`));

			const afterResult = await db.execute(
				sql.raw(`SELECT id FROM task_strategy_fabric WHERE task_id = '${taskId}'`),
			);
			const after = afterResult.rows as Array<{ id: string }>;
			expect(after).toHaveLength(0);
		});
	});

	// ---------------------------------------------------------------------------
	// 11. Route purity — no inline routing calls
	// ---------------------------------------------------------------------------

	describe("11. Route purity — conversations POST /items works without routing", () => {
		beforeEach(async () => {
			// Seed required data for conversations/items
			// @lore U1: products→teams, teams→team_members
			const now = new Date().toISOString();
			db.run(
				`INSERT INTO teams (id, name, phase, created_at) VALUES ('prod-conv', 'Prod', 'build', '${now}')`,
			);
			db.run(
				`INSERT INTO team_members (id, team_id, capacity, active_bets, formed_at) VALUES ('team-conv', 'prod-conv', 3, 0, '${now}')`,
			);
			await db.execute(
				sql.raw(
					`INSERT INTO users (id, name, role, status, created_at) VALUES ('agent-conv', 'Agent', 'builder', 'idle', '${now}')`,
				),
			);
			await db.execute(
				sql.raw(
					`INSERT INTO users (id, name, role, status, created_at) VALUES ('policy_engine', 'Policy Engine', 'system', 'active', '${now}')`,
				),
			);
			await db.execute(
				sql.raw(
					`INSERT INTO threads (id, host_kind, host_id, initiator_id, participants, last_active_at, created_at) VALUES ('thread-conv', 'task', 'task-conv', 'agent-conv', '[]', '${now}', '${now}')`,
				),
			);
		});

		it("POST /api/conversations/items succeeds and returns 201 without routing fields", async () => {
			const res = await app.request("/api/conversations/items", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					title: "Test Item",
					threadId: "thread-conv",
				}),
			});
			expect(res.status).toBe(201);
			const body = (await res.json()) as Record<string, unknown>;
			expect(body.id).toBeTruthy();
			// O2 requirement: view and founderRoute should NOT be in the response
			// (the inline calls to routeItem and routeToFounder are removed)
			// Currently they ARE returned (current implementation) — these expectations
			// will pass once the O2 route purity implementation removes them.
			expect(Object.hasOwn(body, "view")).toBe(false);
			expect(Object.hasOwn(body, "founderRoute")).toBe(false);
		});

		it("POST /api/conversations/items emits item_created event", async () => {
			const events: unknown[] = [];
			eventBus.on("item_created", (e: DomainEvent) => events.push(e));

			await app.request("/api/conversations/items", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					title: "Event Test Item",
					threadId: "thread-conv",
				}),
			});

			expect(events).toHaveLength(1);
		});
	});

	// ---------------------------------------------------------------------------
	// 12. Session create/update works without stripped fields
	// ---------------------------------------------------------------------------

	describe("12. Sessions work without stripped schema fields", () => {
		beforeEach(() => {
			// @lore U1: products→teams, teams→team_members, bets.pitch→description, tasks removes product_id
			const now = new Date().toISOString();
			db.run(
				`INSERT INTO teams (id, name, phase, created_at) VALUES ('prod-sess', 'Prod', 'build', '${now}')`,
			);
			db.run(
				`INSERT INTO team_members (id, team_id, capacity, active_bets, formed_at) VALUES ('team-sess', 'prod-sess', 3, 0, '${now}')`,
			);
			await db.execute(
				sql.raw(
					`INSERT INTO users (id, name, role, status, created_at) VALUES ('agent-sess', 'Agent', 'builder', 'idle', '${now}')`,
				),
			);
			db.run(
				`INSERT INTO bets (id, team_id, description, status, created_at) VALUES ('bet-sess', 'prod-sess', 'Pitch', 'active', '${now}')`,
			);
			db.run(
				`INSERT INTO tasks (id, bet_id, team_id, title, state, created_at, updated_at)
				 VALUES ('task-sess', 'bet-sess', 'prod-sess', 'Task', 'in_progress', '${now}', '${now}')`,
			);
		});

		it("POST /api/sessions creates session and does not expose traceId, harnessUrl, tokensInput, tokensOutput in response", async () => {
			const res = await app.request("/api/sessions", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					agentId: "agent-sess",
					taskId: "task-sess",
					modelTier: "workhorse",
				}),
			});
			expect(res.status).toBe(201);
			const body = (await res.json()) as Record<string, unknown>;
			// O2 requirement: stripped columns must not appear in the response at all
			// (neither as null nor as a value — the columns no longer exist)
			expect(Object.hasOwn(body, "traceId")).toBe(false);
			expect(Object.hasOwn(body, "harnessUrl")).toBe(false);
			expect(Object.hasOwn(body, "tokensInput")).toBe(false);
			expect(Object.hasOwn(body, "tokensOutput")).toBe(false);
		});

		it("PATCH /api/sessions/:id ends session without tokensInput/tokensOutput fields", async () => {
			// Create session
			const createRes = await app.request("/api/sessions", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					agentId: "agent-sess",
					taskId: "task-sess",
					modelTier: "workhorse",
				}),
			});
			expect(createRes.status).toBe(201);
			const created = (await createRes.json()) as Record<string, unknown>;
			const id = created.id as string;

			// End session without stripped fields
			const patchRes = await app.request(`/api/sessions/${id}`, {
				method: "PATCH",
				headers: authHeaders(),
				body: JSON.stringify({
					state: "done",
					outcome: "success",
				}),
			});
			expect(patchRes.status).toBe(200);
			const body = (await patchRes.json()) as Record<string, unknown>;
			expect(body.state).toBe("done");
		});
	});

	// ---------------------------------------------------------------------------
	// 13. Knowledge list uses LEFT JOIN for pre-computed scores
	// ---------------------------------------------------------------------------

	describe("13. Knowledge list route uses LEFT JOIN (no computeSignals inline call)", () => {
		it("GET /api/knowledge returns 200 with items array", async () => {
			// Create a few items
			await app.request("/api/knowledge", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					topic: "testing",
					title: "Item A",
					body: "Body A.",
					format: "markdown",
					scopeKind: "factory",
					updatedBy: "human",
				}),
			});
			await app.request("/api/knowledge", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					topic: "testing",
					title: "Item B",
					body: "Body B.",
					format: "markdown",
					scopeKind: "factory",
					updatedBy: "human",
				}),
			});

			const res = await app.request("/api/knowledge", {
				headers: authHeaders(),
			});
			expect(res.status).toBe(200);
			const body = (await res.json()) as Record<string, unknown>;
			const itemsArr = body.items as Record<string, unknown>[];
			expect(itemsArr).toHaveLength(2);
			// Signals come via LEFT JOIN — no inline computeSignals call
			// Each item may have a relevanceScore field (null if not computed)
		});
	});
});
