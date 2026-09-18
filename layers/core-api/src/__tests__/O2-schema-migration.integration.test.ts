/**
 * O2 — Schema Migration & Route Rewrite — Red Phase Tests
 *
 * These tests encode the O2 acceptance criteria. They WILL fail until
 * the O2 implementation is complete. That is the point — red phase.
 *
 * Acceptance Criteria covered:
 * 1. Extension tables (knowledge_app_projection, task_planning_signals) created
 * 2. Kernel table columns stripped (knowledgeItems, tasks, sessions, items, artifacts)
 * 3. Knowledge route URL shape changed (/:layer/... → /:id or /)
 * 4. Route purity: no routeToFounder/routeItem/createRelevanceService inline calls
 * 5. Knowledge events emitted correctly (knowledge_created, knowledge_updated, etc.)
 * 6. FK cascade delete on extension tables
 * 7. Status simplified to draft | active | archived
 */

import type { DomainEvent } from "@hyperidle/event-bus";
import { sql } from "drizzle-orm";
import { describe, expect, vi } from "vitest";
import { test } from "../__testing__/test-fixtures.js";

// biome-ignore lint/style/useNamingConvention: SQL information_schema returns snake_case column_name
type SqlColumnRow = { column_name: string };

const TEST_API_KEY = "test-key-O2-migration";

function authHeaders(extra?: Record<string, string>): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json", ...extra };
}

describe("O2 — Schema Migration & Route Rewrite", () => {
	// ---------------------------------------------------------------------------
	// 1. Extension tables — schema structure
	// ---------------------------------------------------------------------------

	describe("1. Extension tables exist with correct structure", () => {
		test("knowledge_app_projection table exists in the database", async ({ db }) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
			// If the table doesn't exist this will throw
			await expect(
				db.execute(sql.raw("SELECT id FROM knowledge_app_projection LIMIT 1")),
			).resolves.toBeDefined();
			vi.unstubAllEnvs();
		});

		test("knowledge_app_projection has FK to knowledge_items with cascade delete", async ({
			db,
		}) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
			const result = await db.execute(
				sql`SELECT column_name FROM information_schema.columns WHERE table_name = ${"knowledge_app_projection"}`,
			);
			const colNames = (result as { rows: Array<SqlColumnRow> }).rows.map((r) => r.column_name);
			expect(colNames).toContain("id");
			expect(colNames).toContain("knowledge_item_id");
			vi.unstubAllEnvs();
		});

		test("knowledge_app_projection does NOT have a strategy discriminator column", async ({
			db,
		}) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
			const result = await db.execute(
				sql`SELECT column_name FROM information_schema.columns WHERE table_name = ${"knowledge_app_projection"}`,
			);
			const colNames = (result as { rows: Array<SqlColumnRow> }).rows.map((r) => r.column_name);
			expect(colNames).not.toContain("strategy");
			vi.unstubAllEnvs();
		});
	});

	// ---------------------------------------------------------------------------
	// 2. Kernel table stripping — knowledgeItems
	// ---------------------------------------------------------------------------

	describe("2. knowledgeItems kernel table columns stripped", () => {
		test("knowledgeItems no longer has 'layer' column", async ({ db }) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
			const result = await db.execute(
				sql`SELECT column_name FROM information_schema.columns WHERE table_name = ${"knowledge_items"}`,
			);
			const colNames = (result as { rows: Array<SqlColumnRow> }).rows.map((r) => r.column_name);
			expect(colNames).not.toContain("layer");
			vi.unstubAllEnvs();
		});

		test("knowledgeItems no longer has 'scopeId' / 'scope_id' column from the old strategy layer", async ({
			db,
		}) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
			// @lore Q2: scope_id WAS stripped in O2 (from the strategy layer).
			// Q2 re-adds scope_kind + scope_id to the KERNEL table so each item
			// knows its scope. The O2 assertion that scope_id was absent is
			// superseded by Q2. This test now asserts that scope_kind IS present
			// (replacing the column that O2 removed with a new kernel-level one).
			const result = await db.execute(
				sql`SELECT column_name FROM information_schema.columns WHERE table_name = ${"knowledge_items"}`,
			);
			const colNames = (result as { rows: Array<SqlColumnRow> }).rows.map((r) => r.column_name);
			// Q2: scope_kind is a kernel column — should exist.
			expect(colNames).toContain("scope_kind");
			// scope_id from the strategy layer was removed in O2;
			// Q2 re-adds a kernel-level scope_id (nullable) for scoped items.
			expect(colNames).toContain("scope_id");
			vi.unstubAllEnvs();
		});

		test("knowledgeItems no longer has 'kind' column", async ({ db }) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
			const result = await db.execute(
				sql`SELECT column_name FROM information_schema.columns WHERE table_name = ${"knowledge_items"}`,
			);
			const colNames = (result as { rows: Array<SqlColumnRow> }).rows.map((r) => r.column_name);
			expect(colNames).not.toContain("kind");
			vi.unstubAllEnvs();
		});

		test("knowledgeItems no longer has 'attentionScore' / 'attention_score' column", async ({
			db,
		}) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
			const result = await db.execute(
				sql`SELECT column_name FROM information_schema.columns WHERE table_name = ${"knowledge_items"}`,
			);
			const colNames = (result as { rows: Array<SqlColumnRow> }).rows.map((r) => r.column_name);
			expect(colNames).not.toContain("attention_score");
			vi.unstubAllEnvs();
		});

		test("knowledgeItems no longer has 'relevanceScore' / 'relevance_score' column", async ({
			db,
		}) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
			const result = await db.execute(
				sql`SELECT column_name FROM information_schema.columns WHERE table_name = ${"knowledge_items"}`,
			);
			const colNames = (result as { rows: Array<SqlColumnRow> }).rows.map((r) => r.column_name);
			expect(colNames).not.toContain("relevance_score");
			vi.unstubAllEnvs();
		});

		test("knowledgeItems no longer has 'citationCount' / 'citation_count' column", async ({
			db,
		}) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
			const result = await db.execute(
				sql`SELECT column_name FROM information_schema.columns WHERE table_name = ${"knowledge_items"}`,
			);
			const colNames = (result as { rows: Array<SqlColumnRow> }).rows.map((r) => r.column_name);
			expect(colNames).not.toContain("citation_count");
			vi.unstubAllEnvs();
		});

		test("knowledgeItems no longer has 'lastCitedAt' / 'last_cited_at' column", async ({ db }) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
			const result = await db.execute(
				sql`SELECT column_name FROM information_schema.columns WHERE table_name = ${"knowledge_items"}`,
			);
			const colNames = (result as { rows: Array<SqlColumnRow> }).rows.map((r) => r.column_name);
			expect(colNames).not.toContain("last_cited_at");
			vi.unstubAllEnvs();
		});

		test("knowledgeItems no longer has 'confidence' column", async ({ db }) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
			const result = await db.execute(
				sql`SELECT column_name FROM information_schema.columns WHERE table_name = ${"knowledge_items"}`,
			);
			const colNames = (result as { rows: Array<SqlColumnRow> }).rows.map((r) => r.column_name);
			expect(colNames).not.toContain("confidence");
			vi.unstubAllEnvs();
		});

		test("knowledgeItems no longer has 'meta' column", async ({ db }) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
			const result = await db.execute(
				sql`SELECT column_name FROM information_schema.columns WHERE table_name = ${"knowledge_items"}`,
			);
			const colNames = (result as { rows: Array<SqlColumnRow> }).rows.map((r) => r.column_name);
			expect(colNames).not.toContain("meta");
			vi.unstubAllEnvs();
		});

		// @lore nested-knowledge-items: migration 0078 drops `topic` — a knowledge
		// item's place in the tree says what it is about now, not a free-text
		// field. Was "knowledgeItems still has 'topic' column"; inverted rather
		// than deleted, since the column's absence is exactly as worth locking
		// down as its O2-era presence was.
		test("knowledgeItems no longer has a 'topic' column", async ({ db }) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
			const result = await db.execute(
				sql`SELECT column_name FROM information_schema.columns WHERE table_name = ${"knowledge_items"}`,
			);
			const colNames = (result as { rows: Array<SqlColumnRow> }).rows.map((r) => r.column_name);
			expect(colNames).not.toContain("topic");
			vi.unstubAllEnvs();
		});
	});

	// ---------------------------------------------------------------------------
	// 3. Kernel table stripping — tasks
	// ---------------------------------------------------------------------------

	describe("3. tasks kernel table columns stripped", () => {
		test("tasks no longer has 'risk_tier' column", async ({ db }) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
			const result = await db.execute(
				sql`SELECT column_name FROM information_schema.columns WHERE table_name = ${"tasks"}`,
			);
			const colNames = (result as { rows: Array<SqlColumnRow> }).rows.map((r) => r.column_name);
			expect(colNames).not.toContain("risk_tier");
			vi.unstubAllEnvs();
		});

		test("tasks no longer has 'attention_score' column", async ({ db }) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
			const result = await db.execute(
				sql`SELECT column_name FROM information_schema.columns WHERE table_name = ${"tasks"}`,
			);
			const colNames = (result as { rows: Array<SqlColumnRow> }).rows.map((r) => r.column_name);
			expect(colNames).not.toContain("attention_score");
			vi.unstubAllEnvs();
		});

		test("tasks no longer has 'durability' column", async ({ db }) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
			const result = await db.execute(
				sql`SELECT column_name FROM information_schema.columns WHERE table_name = ${"tasks"}`,
			);
			const colNames = (result as { rows: Array<SqlColumnRow> }).rows.map((r) => r.column_name);
			expect(colNames).not.toContain("durability");
			vi.unstubAllEnvs();
		});

		test("tasks no longer has 'cross_team' column", async ({ db }) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
			const result = await db.execute(
				sql`SELECT column_name FROM information_schema.columns WHERE table_name = ${"tasks"}`,
			);
			const colNames = (result as { rows: Array<SqlColumnRow> }).rows.map((r) => r.column_name);
			expect(colNames).not.toContain("cross_team");
			vi.unstubAllEnvs();
		});
	});

	// ---------------------------------------------------------------------------
	// 4. Kernel table stripping — sessions
	// ---------------------------------------------------------------------------

	describe("4. sessions kernel table columns stripped", () => {
		test("sessions no longer has 'cost' column", async ({ db }) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
			const result = await db.execute(
				sql`SELECT column_name FROM information_schema.columns WHERE table_name = ${"sessions"}`,
			);
			const colNames = (result as { rows: Array<SqlColumnRow> }).rows.map((r) => r.column_name);
			expect(colNames).not.toContain("cost");
			vi.unstubAllEnvs();
		});

		test("sessions no longer has 'cost_minor' column", async ({ db }) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
			const result = await db.execute(
				sql`SELECT column_name FROM information_schema.columns WHERE table_name = ${"sessions"}`,
			);
			const colNames = (result as { rows: Array<SqlColumnRow> }).rows.map((r) => r.column_name);
			expect(colNames).not.toContain("cost_minor");
			vi.unstubAllEnvs();
		});

		test("sessions no longer has 'cost_currency' column", async ({ db }) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
			const result = await db.execute(
				sql`SELECT column_name FROM information_schema.columns WHERE table_name = ${"sessions"}`,
			);
			const colNames = (result as { rows: Array<SqlColumnRow> }).rows.map((r) => r.column_name);
			expect(colNames).not.toContain("cost_currency");
			vi.unstubAllEnvs();
		});

		test("sessions no longer has 'tokens_json' column", async ({ db }) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
			const result = await db.execute(
				sql`SELECT column_name FROM information_schema.columns WHERE table_name = ${"sessions"}`,
			);
			const colNames = (result as { rows: Array<SqlColumnRow> }).rows.map((r) => r.column_name);
			expect(colNames).not.toContain("tokens_json");
			vi.unstubAllEnvs();
		});

		test("sessions no longer has 'tokens_input' column", async ({ db }) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
			const result = await db.execute(
				sql`SELECT column_name FROM information_schema.columns WHERE table_name = ${"sessions"}`,
			);
			const colNames = (result as { rows: Array<SqlColumnRow> }).rows.map((r) => r.column_name);
			expect(colNames).not.toContain("tokens_input");
			vi.unstubAllEnvs();
		});

		test("sessions no longer has 'tokens_output' column", async ({ db }) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
			const result = await db.execute(
				sql`SELECT column_name FROM information_schema.columns WHERE table_name = ${"sessions"}`,
			);
			const colNames = (result as { rows: Array<SqlColumnRow> }).rows.map((r) => r.column_name);
			expect(colNames).not.toContain("tokens_output");
			vi.unstubAllEnvs();
		});

		test("sessions no longer has 'trace_id' column", async ({ db }) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
			const result = await db.execute(
				sql`SELECT column_name FROM information_schema.columns WHERE table_name = ${"sessions"}`,
			);
			const colNames = (result as { rows: Array<SqlColumnRow> }).rows.map((r) => r.column_name);
			expect(colNames).not.toContain("trace_id");
			vi.unstubAllEnvs();
		});

		test("sessions no longer has 'harness_url' column", async ({ db }) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
			const result = await db.execute(
				sql`SELECT column_name FROM information_schema.columns WHERE table_name = ${"sessions"}`,
			);
			const colNames = (result as { rows: Array<SqlColumnRow> }).rows.map((r) => r.column_name);
			expect(colNames).not.toContain("harness_url");
			vi.unstubAllEnvs();
		});
	});

	// ---------------------------------------------------------------------------
	// 5. Kernel table stripping — items
	// ---------------------------------------------------------------------------

	describe("5. items kernel table columns stripped", () => {
		test("items no longer has 'attention_score' column", async ({ db }) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
			const result = await db.execute(
				sql`SELECT column_name FROM information_schema.columns WHERE table_name = ${"items"}`,
			);
			const colNames = (result as { rows: Array<SqlColumnRow> }).rows.map((r) => r.column_name);
			expect(colNames).not.toContain("attention_score");
			vi.unstubAllEnvs();
		});

		test("items no longer has 'reversibility' column", async ({ db }) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
			const result = await db.execute(
				sql`SELECT column_name FROM information_schema.columns WHERE table_name = ${"items"}`,
			);
			const colNames = (result as { rows: Array<SqlColumnRow> }).rows.map((r) => r.column_name);
			expect(colNames).not.toContain("reversibility");
			vi.unstubAllEnvs();
		});

		test("items no longer has 'sandbox_result' column", async ({ db }) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
			const result = await db.execute(
				sql`SELECT column_name FROM information_schema.columns WHERE table_name = ${"items"}`,
			);
			const colNames = (result as { rows: Array<SqlColumnRow> }).rows.map((r) => r.column_name);
			expect(colNames).not.toContain("sandbox_result");
			vi.unstubAllEnvs();
		});

		test("items no longer has 'cost_estimate' column", async ({ db }) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
			const result = await db.execute(
				sql`SELECT column_name FROM information_schema.columns WHERE table_name = ${"items"}`,
			);
			const colNames = (result as { rows: Array<SqlColumnRow> }).rows.map((r) => r.column_name);
			expect(colNames).not.toContain("cost_estimate");
			vi.unstubAllEnvs();
		});

		// @lore nested-knowledge-items cleanup: `layer` was write-only dead code
		// (sourced from knowledgeAppProjection.layer, dropped in 0080 — every
		// writer could only ever pass null). Migration 0081 drops the column.
		test("items no longer has 'layer' column", async ({ db }) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
			const result = await db.execute(
				sql`SELECT column_name FROM information_schema.columns WHERE table_name = ${"items"}`,
			);
			const colNames = (result as { rows: Array<SqlColumnRow> }).rows.map((r) => r.column_name);
			expect(colNames).not.toContain("layer");
			vi.unstubAllEnvs();
		});
	});

	// ---------------------------------------------------------------------------
	// 6. Kernel table stripping — artifacts
	// ---------------------------------------------------------------------------

	describe("6. artifacts kernel table columns stripped", () => {
		test("artifacts no longer has 'cost_money_micros' column", async ({ db }) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
			const result = await db.execute(
				sql`SELECT column_name FROM information_schema.columns WHERE table_name = ${"artifacts"}`,
			);
			const colNames = (result as { rows: Array<SqlColumnRow> }).rows.map((r) => r.column_name);
			expect(colNames).not.toContain("cost_money_micros");
			vi.unstubAllEnvs();
		});

		test("artifacts no longer has 'cost_tokens_input' column", async ({ db }) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
			const result = await db.execute(
				sql`SELECT column_name FROM information_schema.columns WHERE table_name = ${"artifacts"}`,
			);
			const colNames = (result as { rows: Array<SqlColumnRow> }).rows.map((r) => r.column_name);
			expect(colNames).not.toContain("cost_tokens_input");
			vi.unstubAllEnvs();
		});

		test("artifacts no longer has 'cost_tokens_output' column", async ({ db }) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
			const result = await db.execute(
				sql`SELECT column_name FROM information_schema.columns WHERE table_name = ${"artifacts"}`,
			);
			const colNames = (result as { rows: Array<SqlColumnRow> }).rows.map((r) => r.column_name);
			expect(colNames).not.toContain("cost_tokens_output");
			vi.unstubAllEnvs();
		});

		test("artifacts no longer has 'cost_settled_at' column", async ({ db }) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
			const result = await db.execute(
				sql`SELECT column_name FROM information_schema.columns WHERE table_name = ${"artifacts"}`,
			);
			const colNames = (result as { rows: Array<SqlColumnRow> }).rows.map((r) => r.column_name);
			expect(colNames).not.toContain("cost_settled_at");
			vi.unstubAllEnvs();
		});
	});

	// ---------------------------------------------------------------------------
	// 7. Knowledge route URL shape
	// ---------------------------------------------------------------------------

	describe("7. Knowledge route URL shape changed", () => {
		test("POST /api/knowledge (no layer prefix) creates item and returns 201", async ({ app }) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
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
			vi.unstubAllEnvs();
		});

		test("GET /api/knowledge/:id (no layer prefix) retrieves item by id", async ({ app }) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
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
			vi.unstubAllEnvs();
		});

		test("GET /api/knowledge/:layer/:id (old URL) returns 404", async ({ app }) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
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
			vi.unstubAllEnvs();
		});

		test("GET /api/knowledge (list all) returns 200", async ({ app }) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
			const res = await app.request("/api/knowledge", {
				headers: authHeaders(),
			});
			expect(res.status).toBe(200);
			vi.unstubAllEnvs();
		});

		test("PATCH /api/knowledge/:id (no layer prefix) updates item", async ({ app }) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
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
			vi.unstubAllEnvs();
		});

		test("POST /api/knowledge/:id/archive (no layer prefix) archives item", async ({ app }) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
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
			vi.unstubAllEnvs();
		});
	});

	// ---------------------------------------------------------------------------
	// 8. Knowledge route events
	// ---------------------------------------------------------------------------

	describe("8. Knowledge route emits correct events", () => {
		test("POST /api/knowledge emits 'knowledge_created' event", async ({ app, eventBus }) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
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
			vi.unstubAllEnvs();
		});

		test("PATCH /api/knowledge/:id emits 'knowledge_updated' event", async ({ app, eventBus }) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
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
			vi.unstubAllEnvs();
		});

		test("POST /api/knowledge/:id/archive emits 'knowledge_archived' event", async ({
			app,
			eventBus,
		}) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
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
			vi.unstubAllEnvs();
		});

		// flag event coverage moved to plugin — ritual routes left core under AU20 founder ruling; recover from git when the plugin lands.
	});

	// ---------------------------------------------------------------------------
	// 9. Knowledge status: draft | active | archived only
	// ---------------------------------------------------------------------------

	describe("9. Knowledge item status simplified to draft | active | archived", () => {
		// @lore nested-knowledge-items: the status ladder collapsed further —
		// draft/captured/provisional all fold into `proposed` now.
		test("POST /api/knowledge creates item with status 'proposed' (not 'captured')", async ({
			app,
		}) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
			const res = await app.request("/api/knowledge", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					title: "Status Test",
					body: "Body.",
					format: "markdown",
					scopeKind: "factory",
					updatedBy: "human",
				}),
			});
			expect(res.status).toBe(201);
			const body = (await res.json()) as Record<string, unknown>;
			expect(body.status).toBe("proposed");
			vi.unstubAllEnvs();
		});

		test("POST /api/knowledge/:id/archive sets status to 'archived'", async ({ app }) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
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
			vi.unstubAllEnvs();
		});

		test("PATCH /api/knowledge/:id rejects status 'provisional' (invalid status)", async ({
			app,
		}) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
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
			vi.unstubAllEnvs();
		});

		test("PATCH /api/knowledge/:id accepts status 'active'", async ({ app }) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
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
			vi.unstubAllEnvs();
		});
	});

	// ---------------------------------------------------------------------------
	// 10. FK cascade delete — extension tables
	// ---------------------------------------------------------------------------

	describe("10. Extension table FK cascade delete", () => {
		test("deleting a knowledge item cascades to knowledge_app_projection rows", async ({ db }) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
			const itemId = crypto.randomUUID();
			const now = new Date().toISOString();

			// After O2: knowledge_items has no layer/kind columns.
			// `topic` is dropped too (architecture.md §2); status collapses
			// to the 4-value ladder (proposed | active | stale | archived).
			// Insert using the stripped schema columns only.
			await db.execute(
				sql.raw(`INSERT INTO knowledge_items (id, title, body, format, status, version, updated_by, created_at, updated_at)
				 VALUES ('${itemId}', 'Test', 'Body', 'markdown', 'proposed', 1, 'human', '${now}', '${now}')`),
			);

			// Insert a strategy extension row — table must exist with FK cascade
			const extId = crypto.randomUUID();
			await db.execute(
				sql.raw(
					`INSERT INTO knowledge_app_projection (id, knowledge_item_id) VALUES ('${extId}', '${itemId}')`,
				),
			);

			// Verify extension row exists
			const beforeResult = await db.execute(
				sql.raw(`SELECT id FROM knowledge_app_projection WHERE knowledge_item_id = '${itemId}'`),
			);
			const before = (beforeResult as { rows: Array<{ id: string }> }).rows;
			expect(before).toHaveLength(1);

			// Delete the knowledge item — cascade should remove extension rows
			await db.execute(sql.raw(`DELETE FROM knowledge_items WHERE id = '${itemId}'`));

			// Extension row should be gone (CASCADE DELETE)
			const afterResult = await db.execute(
				sql.raw(`SELECT id FROM knowledge_app_projection WHERE knowledge_item_id = '${itemId}'`),
			);
			const after = (afterResult as { rows: Array<{ id: string }> }).rows;
			expect(after).toHaveLength(0);
			vi.unstubAllEnvs();
		});
	});

	// ---------------------------------------------------------------------------
	// 11. Route purity — no inline routing calls
	// ---------------------------------------------------------------------------

	// Describe 11 removed: `/api/conversations/items` and its `item_created`
	// event are gone with the `items` table (BC3 architecture.md §5).

	// POST /api/sessions (door #114) and PATCH /api/sessions/:id (door #144) deleted.
	// Describe 12 removed with the routes.

	// ---------------------------------------------------------------------------
	// 13. Knowledge list uses LEFT JOIN for pre-computed scores
	// ---------------------------------------------------------------------------

	describe("13. Knowledge list route uses LEFT JOIN (no computeSignals inline call)", () => {
		test("GET /api/knowledge returns 200 with items array", async ({ app }) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
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
			vi.unstubAllEnvs();
		});
	});
});
