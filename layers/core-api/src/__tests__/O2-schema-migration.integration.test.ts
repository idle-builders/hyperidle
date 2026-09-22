/**
 * O2 — Schema Migration — Red Phase Tests
 *
 * These tests encode the O2 acceptance criteria. They WILL fail until
 * the O2 implementation is complete. That is the point — red phase.
 *
 * Acceptance Criteria covered:
 * 2. Kernel table columns stripped (knowledgeItems — now `documents`, tasks, sessions, items, artifacts)
 *
 * @lore document-module 0086: section 1 ("Extension tables ... created") and
 * section 10 ("FK cascade delete on extension tables") are DELETED — both
 * were entirely about `knowledge_app_projection`, a table migration 0086
 * dropped (its two live columns, `confidence`/`meta`, folded onto `documents`
 * itself; architecture.md §6.2). Nothing replaces the cascade-delete claim:
 * a document has no extension table left to cascade into.
 *
 * @lore document-module B20: sections 3 (route URL shape), 4 (route purity),
 * 5 (knowledge_* events), 7 (status ladder), and 13 (list route LEFT JOIN)
 * were entirely about `routes/knowledge.ts`, deleted with the route. Their
 * real behaviour survives: create-defaults-to-"proposed" and the archive
 * transition are pinned in `document-actions.integration.test.ts`; the
 * per-edit change record (what `knowledge_created`/`knowledge_updated`
 * emission stood in for) is `listChanges(db, { object: "document", ... })`
 * in the same file.
 */

import { sql } from "drizzle-orm";
import { describe, expect, vi } from "vitest";
import { test } from "../__testing__/test-fixtures.js";

// biome-ignore lint/style/useNamingConvention: SQL information_schema returns snake_case column_name
type SqlColumnRow = { column_name: string };

const TEST_API_KEY = "test-key-O2-migration";

describe("O2 — Schema Migration & Route Rewrite", () => {
	// ---------------------------------------------------------------------------
	// 2. Kernel table stripping — documents
	// ---------------------------------------------------------------------------

	describe("2. documents kernel table columns stripped", () => {
		test("documents no longer has 'layer' column", async ({ db }) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
			const result = await db.execute(
				sql`SELECT column_name FROM information_schema.columns WHERE table_name = ${"documents"}`,
			);
			const colNames = (result as { rows: Array<SqlColumnRow> }).rows.map((r) => r.column_name);
			expect(colNames).not.toContain("layer");
			vi.unstubAllEnvs();
		});

		test("documents no longer has 'scopeId' / 'scope_id' column from the old strategy layer", async ({
			db,
		}) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
			// @lore Q2: scope_id WAS stripped in O2 (from the strategy layer).
			// Q2 re-adds scope_kind + scope_id to the KERNEL table so each item
			// knows its scope. The O2 assertion that scope_id was absent is
			// superseded by Q2. This test now asserts that scope_kind IS present
			// (replacing the column that O2 removed with a new kernel-level one).
			const result = await db.execute(
				sql`SELECT column_name FROM information_schema.columns WHERE table_name = ${"documents"}`,
			);
			const colNames = (result as { rows: Array<SqlColumnRow> }).rows.map((r) => r.column_name);
			// Q2: scope_kind is a kernel column — should exist.
			expect(colNames).toContain("scope_kind");
			// scope_id from the strategy layer was removed in O2;
			// Q2 re-adds a kernel-level scope_id (nullable) for scoped items.
			expect(colNames).toContain("scope_id");
			vi.unstubAllEnvs();
		});

		test("documents no longer has 'kind' column", async ({ db }) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
			const result = await db.execute(
				sql`SELECT column_name FROM information_schema.columns WHERE table_name = ${"documents"}`,
			);
			const colNames = (result as { rows: Array<SqlColumnRow> }).rows.map((r) => r.column_name);
			expect(colNames).not.toContain("kind");
			vi.unstubAllEnvs();
		});

		test("documents no longer has 'attentionScore' / 'attention_score' column", async ({ db }) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
			const result = await db.execute(
				sql`SELECT column_name FROM information_schema.columns WHERE table_name = ${"documents"}`,
			);
			const colNames = (result as { rows: Array<SqlColumnRow> }).rows.map((r) => r.column_name);
			expect(colNames).not.toContain("attention_score");
			vi.unstubAllEnvs();
		});

		test("documents no longer has 'relevanceScore' / 'relevance_score' column", async ({ db }) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
			const result = await db.execute(
				sql`SELECT column_name FROM information_schema.columns WHERE table_name = ${"documents"}`,
			);
			const colNames = (result as { rows: Array<SqlColumnRow> }).rows.map((r) => r.column_name);
			expect(colNames).not.toContain("relevance_score");
			vi.unstubAllEnvs();
		});

		test("documents no longer has 'citationCount' / 'citation_count' column", async ({ db }) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
			const result = await db.execute(
				sql`SELECT column_name FROM information_schema.columns WHERE table_name = ${"documents"}`,
			);
			const colNames = (result as { rows: Array<SqlColumnRow> }).rows.map((r) => r.column_name);
			expect(colNames).not.toContain("citation_count");
			vi.unstubAllEnvs();
		});

		test("documents no longer has 'lastCitedAt' / 'last_cited_at' column", async ({ db }) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
			const result = await db.execute(
				sql`SELECT column_name FROM information_schema.columns WHERE table_name = ${"documents"}`,
			);
			const colNames = (result as { rows: Array<SqlColumnRow> }).rows.map((r) => r.column_name);
			expect(colNames).not.toContain("last_cited_at");
			vi.unstubAllEnvs();
		});

		// @lore document-module 0086: the "no longer has 'confidence'/'meta'" pair
		// is DELETED, not repointed — migration 0086 folds both columns back onto
		// this table (architecture.md §6.2, `knowledge_app_projection`'s only two
		// live columns), so the O2-era absence claim is now the opposite of
		// reality by design.

		// @lore nested-knowledge-items: migration 0078 drops `topic` — a document's
		// place in the tree says what it is about now, not a free-text
		// field. Was "knowledgeItems still has 'topic' column"; inverted rather
		// than deleted, since the column's absence is exactly as worth locking
		// down as its O2-era presence was.
		test("documents no longer has a 'topic' column", async ({ db }) => {
			vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
			const result = await db.execute(
				sql`SELECT column_name FROM information_schema.columns WHERE table_name = ${"documents"}`,
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
});
