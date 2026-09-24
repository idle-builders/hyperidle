/**
 * Brownfield migration test for 0089 (routines become subscriptions).
 *
 * Seeds a live calendar routine, a paused (inactive) calendar routine (the
 * demo seed's own `demo-routine-daily_digest` shape), a live event routine
 * on `task_state_changed`, a soft-deleted routine, and each routine's prompt
 * document (`parent_kind='routine'`). Asserts the subscription rows the
 * migration produces, the paused/schedule/event mapping, the prompt
 * documents' re-parent (and the soft-deleted routine's prompt being
 * deleted, having nowhere to land), the plugin_contributions kind respell,
 * and that routines/routine_runs/notification_queue are gone.
 *
 * Asserts with raw `sql` only — no `@hyperidle/db` schema import — the same
 * reason 0086's own brownfield test gives: it must run while `npm run check`
 * is red for the whole cut-over window (the `routines`/`notificationQueue`
 * schema exports are gone from `@hyperidle/db` by the time this test file
 * itself is typechecked).
 */
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, describe, expect, it } from "vitest";

const DIRNAME = fileURLToPath(new URL(".", import.meta.url));
const DRIZZLE_FOLDER = resolve(DIRNAME, "../../drizzle");
const PRE_MIGRATION_IDX = 88;
const MIGRATION_IDX = 89;

function makeTempMigrationsFolder(upToIdx: number): string {
	const tmpDir = mkdtempSync(join(tmpdir(), "drizzle-brownfield-0089-"));
	cpSync(DRIZZLE_FOLDER, tmpDir, { recursive: true });
	const journal = JSON.parse(readFileSync(join(DRIZZLE_FOLDER, "meta/_journal.json"), "utf-8")) as {
		entries: Array<{ idx: number }>;
	};
	journal.entries = journal.entries.filter((e) => e.idx <= upToIdx);
	writeFileSync(join(tmpDir, "meta/_journal.json"), JSON.stringify(journal, null, 2));
	return tmpDir;
}

const NOW = "2026-01-01T00:00:00.000Z";

describe("migration 0089: routines become subscriptions — brownfield", () => {
	const clients: PGlite[] = [];
	const tempDirs: string[] = [];

	afterAll(async () => {
		await Promise.allSettled(clients.map((c) => c.close()));
		for (const d of tempDirs) rmSync(d, { recursive: true, force: true });
	});

	async function seedAndMigrate(): Promise<ReturnType<typeof drizzle>> {
		const client = new PGlite();
		clients.push(client);
		await client.waitReady;
		const db = drizzle(client);

		const folderBefore = makeTempMigrationsFolder(PRE_MIGRATION_IDX);
		tempDirs.push(folderBefore);
		await migrate(db, { migrationsFolder: folderBefore });

		await db.execute(sql`
			INSERT INTO teams (id, name, phase, created_at) VALUES ('team-1', 'Team One', 'build', ${NOW})
		`);
		await db.execute(sql`
			INSERT INTO users (id, name, kind, role, status, team_id, created_at) VALUES
				('agent-cal', 'Calendar Agent', 'ai', 'builder', 'active', 'team-1', ${NOW}),
				('agent-evt', 'Event Agent', 'ai', 'builder', 'active', 'team-1', ${NOW})
		`);

		// A live, active calendar routine.
		await db.execute(sql`
			INSERT INTO routines (id, name, state, owner_agent_id, trigger_type, trigger_config, active, next_run_at, created_at)
			VALUES ('routine-live-cal', 'Weekly sweep', 'active', 'agent-cal', 'calendar', '{"cron":"0 3 * * 0"}', true, '2026-01-08T03:00:00.000Z', ${NOW})
		`);
		// The demo seed's own shape: inactive calendar routine — ends up paused.
		await db.execute(sql`
			INSERT INTO routines (id, name, state, owner_agent_id, trigger_type, trigger_config, active, created_at)
			VALUES ('demo-routine-daily_digest', 'Daily digest', 'active', 'agent-cal', 'calendar', '{"cron":"0 8 * * *"}', false, ${NOW})
		`);
		// A live event routine on the pre-action event name.
		await db.execute(sql`
			INSERT INTO routines (id, name, state, owner_agent_id, trigger_type, event_type, created_at)
			VALUES ('routine-live-evt', 'Post-task retro', 'active', 'agent-evt', 'event', 'task_state_changed', ${NOW})
		`);
		// A soft-deleted routine — must not convert.
		await db.execute(sql`
			INSERT INTO routines (id, name, state, owner_agent_id, trigger_type, trigger_config, active, deleted_at, created_at)
			VALUES ('routine-deleted', 'Retired sweep', 'paused', 'agent-cal', 'calendar', '{"cron":"0 3 * * 0"}', false, ${NOW}, ${NOW})
		`);

		// Prompt documents — one per routine, `parent_kind='routine'`.
		await db.execute(sql`
			INSERT INTO documents (id, scope_kind, title, body, format, status, version, slot, parent_kind, parent_id, updated_by, created_at, updated_at)
			VALUES
				('doc-prompt-live-cal', 'factory', 'Weekly sweep — prompt', 'Sweep now.', 'markdown', 'active', 1, 'prompt', 'routine', 'routine-live-cal', 'seed', ${NOW}, ${NOW}),
				('doc-prompt-live-evt', 'factory', 'Post-task retro — prompt', 'Retro now.', 'markdown', 'active', 1, 'prompt', 'routine', 'routine-live-evt', 'seed', ${NOW}, ${NOW}),
				('doc-prompt-deleted', 'factory', 'Retired sweep — prompt', 'Stale.', 'markdown', 'active', 1, 'prompt', 'routine', 'routine-deleted', 'seed', ${NOW}, ${NOW})
		`);

		// A plugin-contributed routine's registry row, to prove the kind respell.
		await db.execute(sql`
			INSERT INTO plugins (id, name, version, state, scope_kind, installed_at, updated_at)
			VALUES ('plugin-1', 'Plugin One', '1.0.0', 'enabled', 'factory', ${NOW}, ${NOW})
		`);
		await db.execute(sql`
			INSERT INTO plugin_contributions (id, plugin_id, kind, entity_id, created_at)
			VALUES ('contrib-1', 'plugin-1', 'routine', 'routine-live-cal', ${NOW})
		`);

		const folderAfter = makeTempMigrationsFolder(MIGRATION_IDX);
		tempDirs.push(folderAfter);
		await migrate(db, { migrationsFolder: folderAfter });

		return db;
	}

	it("converts a live calendar routine to a schedule subscription, unpaused", async () => {
		const db = await seedAndMigrate();
		const [row] = (
			await db.execute(
				sql`SELECT user_id, event, schedule, paused, next_run_at FROM subscriptions WHERE id = 'routine-live-cal'`,
			)
		).rows as Array<{
			user_id: string;
			event: string | null;
			schedule: string | null;
			paused: boolean;
			next_run_at: string | null;
		}>;
		expect(row?.user_id).toBe("agent-cal");
		expect(row?.event).toBeNull();
		expect(row?.schedule).toBe("0 3 * * 0");
		expect(row?.paused).toBe(false);
		expect(row?.next_run_at).toBe("2026-01-08T03:00:00.000Z");
	});

	it("converts an inactive (demo-seed shaped) routine to a PAUSED subscription", async () => {
		const db = await seedAndMigrate();
		const [row] = (
			await db.execute(
				sql`SELECT paused, schedule FROM subscriptions WHERE id = 'demo-routine-daily_digest'`,
			)
		).rows as Array<{ paused: boolean; schedule: string | null }>;
		expect(row?.paused).toBe(true);
		expect(row?.schedule).toBe("0 8 * * *");
	});

	it("maps task_state_changed to task.changed on an event routine", async () => {
		const db = await seedAndMigrate();
		const [row] = (
			await db.execute(
				sql`SELECT user_id, event, schedule FROM subscriptions WHERE id = 'routine-live-evt'`,
			)
		).rows as Array<{ user_id: string; event: string | null; schedule: string | null }>;
		expect(row?.user_id).toBe("agent-evt");
		expect(row?.event).toBe("task.changed");
		expect(row?.schedule).toBeNull();
	});

	it("does not convert a soft-deleted routine", async () => {
		const db = await seedAndMigrate();
		const rows = (await db.execute(sql`SELECT id FROM subscriptions WHERE id = 'routine-deleted'`))
			.rows as Array<{ id: string }>;
		expect(rows).toHaveLength(0);
	});

	it("re-parents a migrated routine's prompt document to the subscription", async () => {
		const db = await seedAndMigrate();
		const [row] = (
			await db.execute(
				sql`SELECT parent_kind, parent_id FROM documents WHERE id = 'doc-prompt-live-cal'`,
			)
		).rows as Array<{ parent_kind: string; parent_id: string }>;
		expect(row?.parent_kind).toBe("subscription");
		expect(row?.parent_id).toBe("routine-live-cal");
	});

	it("deletes an unmigrated routine's prompt document (nowhere to land)", async () => {
		const db = await seedAndMigrate();
		const rows = (await db.execute(sql`SELECT id FROM documents WHERE id = 'doc-prompt-deleted'`))
			.rows as Array<{ id: string }>;
		expect(rows).toHaveLength(0);
	});

	it("respells plugin_contributions.kind from routine to subscription", async () => {
		const db = await seedAndMigrate();
		const [row] = (
			await db.execute(sql`SELECT kind FROM plugin_contributions WHERE id = 'contrib-1'`)
		).rows as Array<{ kind: string }>;
		expect(row?.kind).toBe("subscription");
	});

	it("drops routines, routine_runs and notification_queue", async () => {
		const db = await seedAndMigrate();
		const result = await db.execute(
			sql`SELECT tablename AS name FROM pg_tables WHERE schemaname = 'public'`,
		);
		const tableNames = (result.rows as Array<{ name: string }>).map((r) => r.name);
		expect(tableNames).not.toContain("routines");
		expect(tableNames).not.toContain("routine_runs");
		expect(tableNames).not.toContain("notification_queue");
	});

	it("refuses to migrate a live event routine with an unmappable event_type", async () => {
		const client = new PGlite();
		clients.push(client);
		await client.waitReady;
		const db = drizzle(client);

		const folderBefore = makeTempMigrationsFolder(PRE_MIGRATION_IDX);
		tempDirs.push(folderBefore);
		await migrate(db, { migrationsFolder: folderBefore });

		await db.execute(sql`
			INSERT INTO teams (id, name, phase, created_at) VALUES ('team-2', 'Team Two', 'build', ${NOW})
		`);
		await db.execute(sql`
			INSERT INTO users (id, name, kind, role, status, team_id, created_at)
			VALUES ('agent-bad', 'Bad Agent', 'ai', 'builder', 'active', 'team-2', ${NOW})
		`);
		await db.execute(sql`
			INSERT INTO routines (id, name, state, owner_agent_id, trigger_type, event_type, created_at)
			VALUES ('routine-unmappable', 'Unmappable', 'active', 'agent-bad', 'event', 'work_selection_requested', ${NOW})
		`);

		const folderAfter = makeTempMigrationsFolder(MIGRATION_IDX);
		tempDirs.push(folderAfter);
		await expect(migrate(db, { migrationsFolder: folderAfter })).rejects.toThrow();
	});
});
