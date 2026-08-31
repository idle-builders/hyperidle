/**
 * Migration 0065 — agents that ran on the built-in harness move to codex.
 *
 * The built-in harness is deleted. An `agent_run_config` row still naming it
 * points at an adapter that is not in the pool, so admission finds nothing to
 * select and every session that agent is asked for fails.
 *
 * The invariant under test:
 *
 *   Every row with `harness_type = 'builtin'` becomes `harness_type = 'codex'`
 *   with `model_id`, `model_provider` and `model_options_json` all NULL. No row
 *   naming any other harness is touched.
 *
 * The model is cleared on purpose, not overlooked. A built-in agent's model id
 * is a gateway id — "deepseek/deepseek-v4-flash", "claude-haiku-4-5" — that
 * codex cannot serve; passing it as `--model` would fail every run. NULL means
 * "the harness's own default", which is the honest answer: the person who
 * configured that agent chose a model for a different harness, and only they
 * can choose the replacement.
 *
 * This replays the REAL `drizzle/0065_*.sql` against a real PGlite instance
 * holding real pre-migration rows. It does not re-declare the UPDATE: a test
 * that inlined its own copy would prove only that the copy is correct.
 *
 * @lore Forward-only, like every migration here. `desktop` ships versioned
 * releases against a local PGlite directory, so a user on the new release
 * cannot roll back onto the old schema — and there is no built-in harness left
 * to roll back to.
 */

import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { HyperIdleDb } from "../connection.js";
import * as schema from "../schema.js";

const DIRNAME = fileURLToPath(new URL(".", import.meta.url));
const DRIZZLE_DIR = resolve(DIRNAME, "../../drizzle");

/** The 0065 migration, located by prefix so a rename of its suffix cannot silently skip the test. */
function readMigration0065(): string {
	const file = readdirSync(DRIZZLE_DIR).find((name) => name.startsWith("0065_"));
	if (!file) throw new Error("migration 0065_* not found in framework/db/drizzle");
	return readFileSync(resolve(DRIZZLE_DIR, file), "utf8");
}

interface Harness {
	readonly client: PGlite;
	readonly db: HyperIdleDb;
}

let harness: Harness | undefined;

async function query(client: PGlite, text: string): Promise<readonly Record<string, unknown>[]> {
	const result = await client.query<Record<string, unknown>>(text);
	return result.rows;
}

async function exec(client: PGlite, script: string): Promise<void> {
	for (const statement of script.split(/;\s*\n|--> statement-breakpoint/)) {
		const trimmed = statement.trim().replace(/;$/, "");
		if (trimmed.length === 0) continue;
		await client.exec(trimmed);
	}
}

/**
 * Migrate to head, then undo 0065's own effect so the fixture can plant
 * `builtin` rows the migration has not seen yet. Only rows this test inserts
 * exist, so nothing else is disturbed.
 */
beforeEach(async () => {
	const client = new PGlite();
	const db = drizzle(client, { schema }) as unknown as HyperIdleDb;
	await migrate(db as never, { migrationsFolder: DRIZZLE_DIR });
	harness = { client, db };
});

afterEach(async () => {
	await harness?.client.close();
	harness = undefined;
});

function requireHarness(): Harness {
	if (!harness) throw new Error("harness not initialised");
	return harness;
}

const NOW = "2026-08-04T00:00:00.000Z";

async function seedAgents(client: PGlite): Promise<void> {
	await client.exec(`
		INSERT INTO "users" (id, kind, name, role, status, created_at, agent_category)
		VALUES
			('a-builtin', 'ai', 'Builtin Agent', 'builder', 'active', '${NOW}', 'team'),
			('a-builtin-2', 'ai', 'Builtin Agent 2', 'builder', 'idle', '${NOW}', 'team'),
			('a-claude', 'ai', 'Claude Agent', 'builder', 'active', '${NOW}', 'team'),
			('a-none', 'ai', 'Unset Agent', 'builder', 'active', '${NOW}', 'team');
		INSERT INTO "agent_run_config"
			(agent_user_id, system_prompt, harness_type,
			 model_id, model_provider, max_concurrent_sessions, model_options_json)
		VALUES
			('a-builtin', 'p1', 'builtin',
			 'deepseek/deepseek-v4-flash', 'openrouter', 3, '{"reasoning_effort":"high"}'),
			('a-builtin-2', NULL, 'builtin',
			 'claude-haiku-4-5', 'anthropic', 1, NULL),
			('a-claude', 'p3', 'claude-code',
			 'claude-opus-4-8', 'anthropic', 7, '{"effort":"max"}'),
			('a-none', NULL, NULL, NULL, NULL, 1, NULL);
	`);
}

describe("migration 0065 retires the built-in harness, forward-only", () => {
	it("moves every builtin agent to codex and clears the model it cannot serve", {
		timeout: 120_000,
	}, async () => {
		const { client } = requireHarness();
		await seedAgents(client);
		// Undo 0065 for the rows just planted — `migrate` already ran it against an
		// empty table, so this restores the pre-migration state it would have found.
		await client.exec(`
			UPDATE "agent_run_config" SET harness_type = 'builtin'
			WHERE agent_user_id IN ('a-builtin', 'a-builtin-2');
		`);

		await exec(client, readMigration0065());

		const rows = await query(
			client,
			`SELECT agent_user_id, harness_type, model_id, model_provider, model_options_json,
			        system_prompt, max_concurrent_sessions
			 FROM agent_run_config ORDER BY agent_user_id`,
		);

		const byId = new Map(rows.map((r) => [r.agent_user_id as string, r]));

		for (const id of ["a-builtin", "a-builtin-2"]) {
			const row = byId.get(id);
			expect(row, `${id} should still exist`).toBeDefined();
			expect(row?.harness_type, `${id} moves to codex`).toBe("codex");
			expect(row?.model_id, `${id} keeps no gateway model id`).toBeNull();
			expect(row?.model_provider, `${id} keeps no gateway provider`).toBeNull();
			expect(row?.model_options_json, `${id} keeps no options from the old model`).toBeNull();
		}

		// Everything the migration has no business touching is untouched.
		expect(byId.get("a-builtin")?.system_prompt).toBe("p1");
		expect(byId.get("a-builtin")?.max_concurrent_sessions).toBe(3);
	});

	it("leaves an agent on another harness completely alone", {
		timeout: 120_000,
	}, async () => {
		const { client } = requireHarness();
		await seedAgents(client);

		await exec(client, readMigration0065());

		const [claude] = await query(
			client,
			`SELECT harness_type, model_id, model_provider, model_options_json
			 FROM agent_run_config WHERE agent_user_id = 'a-claude'`,
		);
		expect(claude?.harness_type).toBe("claude-code");
		expect(claude?.model_id).toBe("claude-opus-4-8");
		expect(claude?.model_provider).toBe("anthropic");
		expect(claude?.model_options_json).toBe('{"effort":"max"}');
	});

	it("leaves an agent that stored no harness alone — NULL is not 'builtin'", {
		timeout: 120_000,
	}, async () => {
		const { client } = requireHarness();
		await seedAgents(client);

		await exec(client, readMigration0065());

		const [unset] = await query(
			client,
			`SELECT harness_type, model_id FROM agent_run_config WHERE agent_user_id = 'a-none'`,
		);
		// An agent with no harness is not a built-in agent — it never chose one, and
		// the pool selects for it at admission. Sweeping it onto codex would be
		// making a choice on the user's behalf that nobody asked for.
		expect(unset?.harness_type).toBeNull();
		expect(unset?.model_id).toBeNull();
	});

	it("no row anywhere still names the built-in harness after the migration", {
		timeout: 120_000,
	}, async () => {
		const { client } = requireHarness();
		await seedAgents(client);
		await client.exec(`
			UPDATE "agent_run_config" SET harness_type = 'builtin'
			WHERE agent_user_id IN ('a-builtin', 'a-builtin-2');
		`);

		await exec(client, readMigration0065());

		const [{ count }] = (await query(
			client,
			`SELECT count(*)::int AS count FROM agent_run_config WHERE harness_type = 'builtin'`,
		)) as [{ count: number }];
		expect(count).toBe(0);
	});
});
