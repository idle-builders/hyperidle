/**
 * AK6 — Factory roster injection: RED phase
 *
 * T9 / AC4 (boot): FactoryRosterSpec injection into applyFactoryBootstrap.
 *
 * Scenarios:
 *   - applyFactoryBootstrap(db) [default arg] → same rows as AF17 golden (Fabric roster)
 *   - applyFactoryBootstrap(db, minimalFactoryRoster) → no facilitators, no seed-agent-cos,
 *     but system:propagation + factorySettings infra rows still present
 *   - A roster-driven facilitator's systemPrompt is NON-EMPTY (proves template-before-backfill
 *     ordering invariant — T9 critique WARNING)
 *   - Re-call with either arg → no double-insert (idempotency preserved — AF17 AC2 guard)
 *
 * Tests FAIL until:
 *   - FactoryRosterSpec + defaultFactoryRoster + minimalFactoryRoster exported from @hyperidle/shared
 *   - applyFactoryBootstrap(db, roster?) signature updated to accept FactoryRosterSpec
 *
 * NOTE: The AF17 protected tests (applyFactoryBootstrap(db) no-arg assertions) MUST stay green.
 * These tests ADD to AF17 — they do not replace it.
 */

import { describe, expect, test } from "@hyperidle/db/test-fixtures";
import type { FactoryRosterSpec } from "@hyperidle/shared";
import { defaultFactoryRoster, minimalFactoryRoster } from "@hyperidle/shared";
import { sql } from "drizzle-orm";
import type { HyperIdleDb } from "../connection.js";
import { applyFactoryBootstrap } from "../factory-bootstrap.js";

async function queryRows<T extends Record<string, unknown>>(
	db: HyperIdleDb,
	query: string,
): Promise<T[]> {
	const result = await db.execute(sql.raw(query));
	return (result as { rows: T[] }).rows;
}

// ─────────────────────────────────────────────────────────────────────────────
// T9a: defaultFactoryRoster value shape
// ─────────────────────────────────────────────────────────────────────────────

describe("AK6 T9: defaultFactoryRoster value shape", () => {
	test("defaultFactoryRoster is a FactoryRosterSpec with facilitators array", () => {
		const roster: FactoryRosterSpec = defaultFactoryRoster;
		expect(Array.isArray(roster.facilitators)).toBe(true);
		expect(roster.facilitators.length).toBeGreaterThanOrEqual(5);
	});

	test("defaultFactoryRoster.systemAssistant is non-null with idHint 'seed-agent-cos'", () => {
		expect(defaultFactoryRoster.systemAssistant).not.toBeNull();
		expect(defaultFactoryRoster.systemAssistant?.idHint).toBe("seed-agent-cos");
	});

	test("defaultFactoryRoster facilitator entries have community, role, idHint, templateRole", () => {
		for (const f of defaultFactoryRoster.facilitators) {
			expect(typeof f.community).toBe("string");
			expect(f.role).toBe("facilitator");
			expect(f.idHint).toMatch(/^seed-agent-pf-/);
			expect(typeof f.templateRole).toBe("string");
		}
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// T9b: minimalFactoryRoster value shape (empty facilitators, no system-assistant)
// ─────────────────────────────────────────────────────────────────────────────

describe("AK6 T9: minimalFactoryRoster value shape", () => {
	test("minimalFactoryRoster.facilitators is empty", () => {
		expect(minimalFactoryRoster.facilitators).toHaveLength(0);
	});

	test("minimalFactoryRoster.systemAssistant is null", () => {
		expect(minimalFactoryRoster.systemAssistant).toBeNull();
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// T9c: applyFactoryBootstrap(db) default arg — same rows as AF17 golden
// ─────────────────────────────────────────────────────────────────────────────

describe("AK6 T9: applyFactoryBootstrap with default roster (Fabric) — AF17 golden preserved", () => {
	test("default roster: seed-agent-cos present after bootstrap", async ({ db }) => {
		await applyFactoryBootstrap(db);

		const rows = await queryRows<{ id: string }>(
			db,
			"SELECT id FROM users WHERE id = 'seed-agent-cos'",
		);
		expect(rows).toHaveLength(1);
	});

	test("default roster: ≥5 facilitator agents (seed-agent-pf-*) present after bootstrap", async ({
		db,
	}) => {
		await applyFactoryBootstrap(db);

		const rows = await queryRows<{ id: string }>(
			db,
			"SELECT id FROM users WHERE id LIKE 'seed-agent-pf-%'",
		);
		expect(rows.length).toBeGreaterThanOrEqual(5);
	});

	test("default roster: system:propagation still present (db infra row, always written)", async ({
		db,
	}) => {
		await applyFactoryBootstrap(db);

		const rows = await queryRows<{ id: string }>(
			db,
			"SELECT id FROM users WHERE id = 'system:propagation'",
		);
		expect(rows).toHaveLength(1);
	});

	test("default roster: facilitator's persisted systemPrompt is NON-EMPTY (template-before-backfill ordering)", async ({
		db,
	}) => {
		// This asserts the seed-before-read invariant: system_template rows must be
		// seeded BEFORE the facilitator systemPrompt backfill reads them.
		await applyFactoryBootstrap(db);

		// @lore AU26 G1: `system_prompt` relocated to `agent_run_config`; the
		// ordering invariant this test guards is unchanged.
		const rows = await queryRows<{ id: string; system_prompt: string | null }>(
			db,
			`SELECT u.id, c.system_prompt FROM users u
			   JOIN agent_run_config c ON c.agent_user_id = u.id
			  WHERE u.id LIKE 'seed-agent-pf-%' LIMIT 1`,
		);
		expect(rows.length).toBeGreaterThanOrEqual(1);
		const prompt = rows[0]?.system_prompt;
		expect(prompt).not.toBeNull();
		expect(typeof prompt).toBe("string");
		expect((prompt ?? "").length).toBeGreaterThan(50);
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// T9d: applyFactoryBootstrap(db, defaultFactoryRoster) — explicit arg matches no-arg
// ─────────────────────────────────────────────────────────────────────────────

describe("AK6 T9: applyFactoryBootstrap with explicit defaultFactoryRoster", () => {
	test("explicit defaultFactoryRoster: seed-agent-cos present", async ({ db }) => {
		await applyFactoryBootstrap(db, defaultFactoryRoster);

		const rows = await queryRows<{ id: string }>(
			db,
			"SELECT id FROM users WHERE id = 'seed-agent-cos'",
		);
		expect(rows).toHaveLength(1);
	});

	test("explicit defaultFactoryRoster: ≥5 facilitators present", async ({ db }) => {
		await applyFactoryBootstrap(db, defaultFactoryRoster);

		const rows = await queryRows<{ id: string }>(
			db,
			"SELECT id FROM users WHERE id LIKE 'seed-agent-pf-%'",
		);
		expect(rows.length).toBeGreaterThanOrEqual(5);
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// T9e: applyFactoryBootstrap(db, minimalFactoryRoster) — no facilitators, no cos
// ─────────────────────────────────────────────────────────────────────────────

describe("AK6 T9: applyFactoryBootstrap with minimalFactoryRoster — empty agent roster", () => {
	test("minimal roster: no seed-agent-cos row created", async ({ db }) => {
		await applyFactoryBootstrap(db, minimalFactoryRoster);

		const rows = await queryRows<{ id: string }>(
			db,
			"SELECT id FROM users WHERE id = 'seed-agent-cos'",
		);
		expect(rows).toHaveLength(0);
	});

	test("minimal roster: no seed-agent-pf-* rows created", async ({ db }) => {
		await applyFactoryBootstrap(db, minimalFactoryRoster);

		const rows = await queryRows<{ id: string }>(
			db,
			"SELECT id FROM users WHERE id LIKE 'seed-agent-pf-%'",
		);
		expect(rows).toHaveLength(0);
	});

	test("minimal roster: system:propagation still present (db infra, not roster-driven)", async ({
		db,
	}) => {
		await applyFactoryBootstrap(db, minimalFactoryRoster);

		const rows = await queryRows<{ id: string }>(
			db,
			"SELECT id FROM users WHERE id = 'system:propagation'",
		);
		expect(rows).toHaveLength(1);
	});

	// @lore AU18: factory_settings (and its cost_cap/cost_cycle KV rows) is
	// retired. cost_cap now lives as server_config.cost.capMinor with a
	// server-owned schema default (20000, applied by @hyperidle/server's
	// readServerConfig — framework/db must not depend on packages/server).
	// Bootstrap no longer writes ANY row into server_config: the default
	// applies purely at read time in the owning package. This test proves
	// that seed was intentionally removed, not silently dropped.
	test("minimal roster: bootstrap writes no server_config row (cost_cap default now lives server-side)", async ({
		db,
	}) => {
		await applyFactoryBootstrap(db, minimalFactoryRoster);

		const rows = await queryRows<{ id: string }>(db, "SELECT id FROM server_config");
		expect(rows).toHaveLength(0);
	});

	test("minimal roster: knowledge principle (seed-ki-1) still present", async ({ db }) => {
		await applyFactoryBootstrap(db, minimalFactoryRoster);

		const rows = await queryRows<{ id: string }>(
			db,
			"SELECT id FROM knowledge_items WHERE id = 'seed-ki-1'",
		);
		expect(rows).toHaveLength(1);
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// T9f: Idempotency under minimal roster (AF17 AC2 guard — extended)
// ─────────────────────────────────────────────────────────────────────────────

describe("AK6 T9: applyFactoryBootstrap idempotency with minimalFactoryRoster", () => {
	test("calling twice with minimalFactoryRoster does not throw", async ({ db }) => {
		await applyFactoryBootstrap(db, minimalFactoryRoster);
		await expect(applyFactoryBootstrap(db, minimalFactoryRoster)).resolves.not.toThrow();
	});

	test("calling twice with minimalFactoryRoster produces same users count", async ({ db }) => {
		await applyFactoryBootstrap(db, minimalFactoryRoster);
		const rows1 = await queryRows<{ count: string }>(db, "SELECT COUNT(*) AS count FROM users");
		const count1 = Number(rows1[0]?.count);

		await applyFactoryBootstrap(db, minimalFactoryRoster);
		const rows2 = await queryRows<{ count: string }>(db, "SELECT COUNT(*) AS count FROM users");
		const count2 = Number(rows2[0]?.count);

		expect(count2).toBe(count1);
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// T9g: Custom FactoryRosterSpec (one-community override)
// ─────────────────────────────────────────────────────────────────────────────

describe("AK6 T9: custom FactoryRosterSpec — one facilitator only", () => {
	test("custom roster with one facilitator creates exactly that one seed-agent-pf-* row", async ({
		db,
	}) => {
		const customRoster: FactoryRosterSpec = {
			facilitators: [
				{
					community: "build",
					role: "facilitator",
					idHint: "seed-agent-pf-build",
					templateRole: "facilitator",
				},
			],
			systemAssistant: null,
		};

		await applyFactoryBootstrap(db, customRoster);

		const rows = await queryRows<{ id: string }>(
			db,
			"SELECT id FROM users WHERE id LIKE 'seed-agent-pf-%'",
		);
		expect(rows).toHaveLength(1);
		expect(rows[0]?.id).toBe("seed-agent-pf-build");
	});

	test("custom roster: system:propagation still present with custom roster", async ({ db }) => {
		const customRoster: FactoryRosterSpec = {
			facilitators: [],
			systemAssistant: {
				role: "assistant",
				idHint: "seed-agent-cos",
			},
		};

		await applyFactoryBootstrap(db, customRoster);

		const rows = await queryRows<{ id: string }>(
			db,
			"SELECT id FROM users WHERE id = 'system:propagation'",
		);
		expect(rows).toHaveLength(1);
	});
});
