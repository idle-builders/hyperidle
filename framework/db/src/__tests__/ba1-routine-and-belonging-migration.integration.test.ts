/**
 * BA1 §9 "The migration's data steps, proved against a database that has
 * rows" + §4's `0059_BA1_agent_belonging.sql` / `0060_BA1_one_routine_primitive.sql`.
 *
 * Following the EXACT precedent named in architecture.md §9:
 * `run-config-relocation-migration.integration.test.ts` replays the REAL
 * migration SQL file against a real PGlite instance holding real
 * pre-migration rows — it does not re-declare the SQL, and neither does this
 * file.
 *
 * @lore BA1 review B1: the pre-migration shape is now obtained by migrating
 * a REAL PGlite instance through every real journalled migration file up to
 * (but not including) `0059_BA1_agent_belonging`, then replaying the real
 * `0059`/`0060` files forward from there. The earlier version of this file
 * hand-reconstructed the pre-migration shape with a literal `ALTER TABLE`
 * script (`PRE_BA1_SHAPE`) that declared `routines.team_id` nullable — the
 * real column, added in `0023_AA1_routine_visibility.sql`, is `NOT NULL`.
 * Every other column the hand-written script restored happened to match; the
 * one that didn't was the one `0060` depends on, and the mismatch hid a real
 * NOT-NULL violation in `0060`'s step-3 builtin-dedupe INSERT (only found by
 * code review, not by this test). A hand-written stand-in for the schema
 * under test can always drift from it again; migrating through the real
 * files cannot, because it IS the schema those files produce.
 * `buildMigrationsFolderUpTo` builds a throwaway migrations folder (a
 * filtered `meta/_journal.json` plus the `.sql` files it still references)
 * so `drizzle-orm/pglite/migrator`'s `migrate()` — the same runtime function
 * every real deployment calls — is what produces the pre-BA1 database, not a
 * second, hand-maintained copy of what BA1 changes.
 *
 * @lore BA1 §9: this file allocates its own PGlite instance instead of the
 * `@hyperidle/db/test-fixtures` pool, for the same reason the precedent
 * does — it performs DDL (`RENAME COLUMN`, `DROP COLUMN`, `ADD COLUMN`), and
 * the pooled instances are reused across tests via `TRUNCATE`, so a DDL
 * mutation here would poison every later test sharing the same instance.
 */

import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
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

interface JournalEntry {
	readonly idx: number;
	readonly version: string;
	readonly when: number;
	readonly tag: string;
	readonly breakpoints: boolean;
}

interface Journal {
	readonly version: string;
	readonly dialect: string;
	readonly entries: readonly JournalEntry[];
}

/** Locate a migration file by its numeric prefix — throws if BA1 hasn't written it yet. */
function readMigrationByPrefix(prefix: string): string {
	const file = readdirSync(DRIZZLE_DIR).find((name) => name.startsWith(prefix));
	if (!file) {
		throw new Error(
			`migration ${prefix}* not found in framework/db/drizzle — BA1 §4 has not been implemented yet`,
		);
	}
	return readFileSync(resolve(DRIZZLE_DIR, file), "utf8");
}

/**
 * Build a throwaway migrations folder holding only the real journal entries
 * BEFORE the first one whose tag starts with `beforeTagPrefix`, plus the
 * `.sql` files those entries reference. `drizzle-orm/pglite/migrator`'s
 * `migrate()` only ever reads `meta/_journal.json` + the `.sql` files it
 * names (never the `*_snapshot.json` files, which are a `drizzle-kit
 * generate`-time artifact) — see `readMigrationFiles` — so this is enough to
 * get the exact real pre-BA1 shape, not a hand-reconstruction of it.
 */
function buildMigrationsFolderUpTo(beforeTagPrefix: string): string {
	const journal = JSON.parse(
		readFileSync(resolve(DRIZZLE_DIR, "meta/_journal.json"), "utf8"),
	) as Journal;
	const cutIdx = journal.entries.findIndex((entry) => entry.tag.startsWith(beforeTagPrefix));
	if (cutIdx === -1) {
		throw new Error(`no journal entry tagged ${beforeTagPrefix}* found in meta/_journal.json`);
	}
	const priorEntries = journal.entries.slice(0, cutIdx);

	const dir = mkdtempSync(resolve(tmpdir(), "ba1-pre-migrate-"));
	const metaDir = resolve(dir, "meta");
	mkdirSync(metaDir, { recursive: true });
	writeFileSync(
		resolve(metaDir, "_journal.json"),
		JSON.stringify({ ...journal, entries: priorEntries }),
	);
	for (const entry of priorEntries) {
		writeFileSync(
			resolve(dir, `${entry.tag}.sql`),
			readFileSync(resolve(DRIZZLE_DIR, `${entry.tag}.sql`), "utf8"),
		);
	}
	return dir;
}

interface Harness {
	readonly client: PGlite;
	readonly db: HyperIdleDb;
}

let harness: Harness | undefined;
let preBA1MigrationsFolder: string | undefined;

async function query(client: PGlite, text: string): Promise<readonly Record<string, unknown>[]> {
	const result = await client.query<Record<string, unknown>>(text);
	return result.rows;
}

/**
 * Split ONLY on the literal `--> statement-breakpoint` marker — the same
 * boundary `drizzle-orm`'s own migrator splits on (`readMigrationFiles`,
 * `migrator.js`: `query.split("--> statement-breakpoint")`). The marker
 * itself is not valid SQL, so it has to go; a chunk between two markers may
 * legitimately contain more than one real statement (e.g. a `DO $$ ... $$`
 * block with a semicolon inside it), and PGlite's `exec` runs a
 * multi-statement string in one call, so there is nothing left to split
 * further.
 */
async function exec(client: PGlite, script: string): Promise<void> {
	for (const statement of script.split("--> statement-breakpoint")) {
		const trimmed = statement.trim();
		if (trimmed.length === 0) continue;
		await client.exec(trimmed);
	}
}

beforeEach(async () => {
	preBA1MigrationsFolder = buildMigrationsFolderUpTo("0059_BA1_");
	const client = new PGlite();
	const db = drizzle(client, { schema }) as unknown as HyperIdleDb;
	await migrate(db as never, { migrationsFolder: preBA1MigrationsFolder });
	harness = { client, db };
});

afterEach(async () => {
	await harness?.client.close();
	harness = undefined;
	if (preBA1MigrationsFolder) {
		rmSync(preBA1MigrationsFolder, { recursive: true, force: true });
		preBA1MigrationsFolder = undefined;
	}
});

function requireHarness(): Harness {
	if (!harness) throw new Error("harness not initialised");
	return harness;
}

const NOW = "2026-08-24T00:00:00.000Z";

describe("0060_BA1_one_routine_primitive — replayed against pre-migration rows", () => {
	it("backfills event_type from trigger_config, and leaves it NULL for a malformed row instead of aborting", {
		timeout: 120_000,
	}, async () => {
		const { client } = requireHarness();
		await exec(client, readMigrationByPrefix("0059_BA1_"));
		await client.exec(`
				INSERT INTO "teams" (id, name, phase, created_at)
				VALUES ('ba1-mig-team', 'BA1 mig team', 'build', '${NOW}');
				INSERT INTO "users" (id, kind, name, role, status, created_at, team_id)
				VALUES ('ba1-mig-owner', 'ai', 'Owner', 'builder', 'active', '${NOW}', 'ba1-mig-team');
				INSERT INTO "routines" (id, name, team_id, state, owner_agent_id, trigger_type, trigger_config, active)
				VALUES
					('ba1-mig-good', 'Good event routine', 'ba1-mig-team', 'active', 'ba1-mig-owner', 'event', '{"eventType":"bet_state_changed"}', true),
					('ba1-mig-bad', 'Malformed trigger_config routine', 'ba1-mig-team', 'active', 'ba1-mig-owner', 'event', 'not json at all', true);
			`);

		await exec(client, readMigrationByPrefix("0060_"));

		const rows = await query(client, `SELECT id, event_type FROM routines ORDER BY id`);
		expect(rows).toEqual([
			{ id: "ba1-mig-bad", event_type: null },
			{ id: "ba1-mig-good", event_type: "bet_state_changed" },
		]);
	});

	it("collapses a global builtin's per-team rows to exactly one, re-pointing every run first — with real, NOT-NULL team_id rows", {
		timeout: 120_000,
	}, async () => {
		const { client } = requireHarness();
		await exec(client, readMigrationByPrefix("0059_BA1_"));
		await client.exec(`
				INSERT INTO "teams" (id, name, phase, created_at) VALUES
					('ba1-mig-t1', 'Team 1', 'build', '${NOW}'), ('ba1-mig-t2', 'Team 2', 'build', '${NOW}');
				INSERT INTO "users" (id, kind, name, role, status, created_at, team_id) VALUES
					('ba1-mig-owner1', 'ai', 'Owner 1', 'facilitator', 'active', '${NOW}', 'ba1-mig-t1'),
					('ba1-mig-owner2', 'ai', 'Owner 2', 'facilitator', 'active', '${NOW}', 'ba1-mig-t2');
				INSERT INTO "routines" (id, name, team_id, state, owner_agent_id, trigger_type, trigger_config, active) VALUES
					('builtin:knowledge-decay:ba1-mig-t1', 'Knowledge decay', 'ba1-mig-t1', 'active', 'ba1-mig-owner1', 'calendar', '{"cron":"0 2 * * *"}', true),
					('builtin:knowledge-decay:ba1-mig-t2', 'Knowledge decay', 'ba1-mig-t2', 'active', 'ba1-mig-owner2', 'calendar', '{"cron":"0 2 * * *"}', true);
				INSERT INTO "routine_runs" (id, routine_id, started_at, outcome) VALUES
					('ba1-mig-run-t1-a', 'builtin:knowledge-decay:ba1-mig-t1', '${NOW}', 'success'),
					('ba1-mig-run-t1-b', 'builtin:knowledge-decay:ba1-mig-t1', '${NOW}', 'success'),
					('ba1-mig-run-t2-a', 'builtin:knowledge-decay:ba1-mig-t2', '${NOW}', 'success'),
					('ba1-mig-run-t2-b', 'builtin:knowledge-decay:ba1-mig-t2', '${NOW}', 'success');
			`);

		// This is the exact scenario B1 flagged: routines.team_id is NOT NULL
		// on the real pre-BA1 schema (unlike the deleted hand-written stand-in),
		// and step 3's builtin-dedupe INSERT must survive it.
		await exec(client, readMigrationByPrefix("0060_"));

		const survivors = await query(
			client,
			`SELECT id FROM routines WHERE id LIKE 'builtin:knowledge-decay%' ORDER BY id`,
		);
		expect(survivors).toEqual([{ id: "builtin:knowledge-decay" }]);

		const runs = await query(
			client,
			`SELECT routine_id FROM routine_runs WHERE id LIKE 'ba1-mig-run-%' ORDER BY id`,
		);
		expect(runs).toHaveLength(4);
		expect(runs.every((r) => r.routine_id === "builtin:knowledge-decay")).toBe(true);
	});

	it("renames description to prompt, carrying existing text verbatim, and drops team_id", {
		timeout: 120_000,
	}, async () => {
		const { client } = requireHarness();
		await exec(client, readMigrationByPrefix("0059_BA1_"));
		await client.exec(`
				INSERT INTO "teams" (id, name, phase, created_at) VALUES ('ba1-mig-rename-team', 'Rename team', 'build', '${NOW}');
				INSERT INTO "users" (id, kind, name, role, status, created_at, team_id)
				VALUES ('ba1-mig-rename-owner', 'ai', 'Owner', 'builder', 'active', '${NOW}', 'ba1-mig-rename-team');
				INSERT INTO "routines" (id, name, description, team_id, state, owner_agent_id, trigger_type, trigger_config, active)
				VALUES ('ba1-mig-rename', 'Prompt carrier', 'Reply with a haiku about bets.', 'ba1-mig-rename-team', 'active', 'ba1-mig-rename-owner', 'calendar', '{"cron":"0 9 * * *"}', true);
			`);

		await exec(client, readMigrationByPrefix("0060_"));

		const [row] = await query(client, `SELECT prompt FROM routines WHERE id = 'ba1-mig-rename'`);
		expect(row).toEqual({ prompt: "Reply with a haiku about bets." });

		const teamIdColumn = await query(
			client,
			`SELECT column_name FROM information_schema.columns
				 WHERE table_schema = 'public' AND table_name = 'routines' AND column_name = 'team_id'`,
		);
		expect(teamIdColumn).toEqual([]);
	});

	it("deletes trigger-kind configuration_overrides rows and leaves routine-kind rows untouched", {
		timeout: 120_000,
	}, async () => {
		const { client } = requireHarness();
		await exec(client, readMigrationByPrefix("0059_BA1_"));
		await client.exec(`
				INSERT INTO "configuration_overrides" (id, kind, key, user_value_json, state, created_at, updated_at) VALUES
					('ba1-mig-cfg-trigger', 'trigger', 'ba1-trigger-key', '{}', 'active', '${NOW}', '${NOW}'),
					('ba1-mig-cfg-routine', 'routine', 'ba1-routine-key', '{}', 'active', '${NOW}', '${NOW}');
			`);

		await exec(client, readMigrationByPrefix("0060_"));

		const remaining = await query(
			client,
			`SELECT id, kind FROM configuration_overrides WHERE id LIKE 'ba1-mig-cfg-%' ORDER BY id`,
		);
		expect(remaining).toEqual([{ id: "ba1-mig-cfg-routine", kind: "routine" }]);
	});
});

describe("0059_BA1_agent_belonging — replayed against pre-migration rows", () => {
	it("backfills owner_user_id for an ast-<userId> assistant with a matching human, leaves an orphan NULL", {
		timeout: 120_000,
	}, async () => {
		const { client } = requireHarness();
		await client.exec(`
				INSERT INTO "users" (id, kind, name, role, status, created_at) VALUES
					('ba1-mig-founder', 'human', 'Founder', 'founder', 'active', '${NOW}'),
					('ast-ba1-mig-founder', 'ai', 'Founder''s assistant', 'assistant', 'active', '${NOW}'),
					('ast-ba1-mig-orphan', 'ai', 'Orphan assistant', 'assistant', 'active', '${NOW}');
			`);

		await exec(client, readMigrationByPrefix("0059_BA1_"));

		const rows = await query(
			client,
			`SELECT id, owner_user_id FROM users WHERE id LIKE 'ast-ba1-mig-%' ORDER BY id`,
		);
		expect(rows).toEqual([
			{ id: "ast-ba1-mig-founder", owner_user_id: "ba1-mig-founder" },
			{ id: "ast-ba1-mig-orphan", owner_user_id: null },
		]);
	});
});
