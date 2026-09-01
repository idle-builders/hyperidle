/**
 * knowledge-attachment-slot — brownfield migration test for 0077 (one
 * attachment slot).
 *
 * A database seeded before this carries `routines.prompt_knowledge_id` (an FK
 * pointer) and agent identities bound by `scope_kind='user' AND scope_id=<id>
 * AND role='agent_file'` (a reverse lookup). The migration replaces both with
 * one slot on `knowledge_items`: `parent_kind` + `parent_id`. This applies the
 * REAL migrations 0..76 against a populated database, applies 0077, and
 * asserts the awkward rows survive — an archived prompt, a plugin-installed
 * prompt, a team-scoped identity that cannot be repaired, and the one case
 * that must abort the upgrade rather than guess.
 *
 * @lore knowledge-attachment-slot: same trap `migration-0076-brownfield` names
 * — a hand-rolled pre-migration schema can pass while every real upgrade
 * aborts. The pre-state here is produced by running the REAL migrations
 * 0..76, never hand-rolled DDL.
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

function makeTempMigrationsFolder(upToIdx: number): string {
	const tmpDir = mkdtempSync(join(tmpdir(), "drizzle-brownfield-0077-"));
	cpSync(DRIZZLE_FOLDER, tmpDir, { recursive: true });
	const journal = JSON.parse(readFileSync(join(DRIZZLE_FOLDER, "meta/_journal.json"), "utf-8")) as {
		entries: Array<{ idx: number }>;
	};
	journal.entries = journal.entries.filter((e) => e.idx <= upToIdx);
	writeFileSync(join(tmpDir, "meta/_journal.json"), JSON.stringify(journal, null, 2));
	return tmpDir;
}

const NOW = "2026-01-01T00:00:00.000Z";

async function insertKnowledgeItem(
	client: PGlite,
	row: {
		id: string;
		scopeKind: string;
		scopeId: string | null;
		title: string;
		body: string;
		status: string;
		role: string;
		updatedBy: string;
	},
): Promise<void> {
	const db = drizzle(client);
	await db.execute(sql`
			INSERT INTO knowledge_items
				(id, scope_kind, scope_id, topic, title, body, format, status, version, role, updated_by, created_at, updated_at)
			VALUES (${row.id}, ${row.scopeKind}, ${row.scopeId}, NULL, ${row.title}, ${row.body},
				'markdown', ${row.status}, 1, ${row.role}, ${row.updatedBy}, ${NOW}, ${NOW})
		`);
}

describe("migration 0077: one attachment slot — brownfield", () => {
	const clients: PGlite[] = [];
	const tempDirs: string[] = [];

	afterAll(async () => {
		await Promise.allSettled(clients.map((c) => c.close()));
		for (const d of tempDirs) rmSync(d, { recursive: true, force: true });
	});

	it(
		"backfills a routine prompt, an archived prompt, a plugin prompt, and agent identities — preserving reach",
		{ timeout: 180_000 },
		async () => {
			const client = new PGlite();
			clients.push(client);
			await client.waitReady;
			const db = drizzle(client);

			const folder76 = makeTempMigrationsFolder(76);
			tempDirs.push(folder76);
			await migrate(db, { migrationsFolder: folder76 });

			await db.execute(sql`
					INSERT INTO teams (id, name, phase, capacity, created_at)
					VALUES ('team-1', 'Team One', 'build', 5, ${NOW})
				`);
			await db.execute(sql`
					INSERT INTO users (id, name, role, kind, status, team_id, created_at)
					VALUES
						('agent-1', 'Agent One', 'builder', 'ai', 'active', NULL, ${NOW}),
						('agent-archived', 'Agent Archived', 'builder', 'ai', 'active', NULL, ${NOW}),
						('agent-plugin', 'Agent Plugin', 'builder', 'ai', 'active', NULL, ${NOW}),
						('agent-team-scoped', 'Agent Team', 'builder', 'ai', 'active', 'team-1', ${NOW}),
						('agent-shared-a', 'Agent Shared A', 'builder', 'ai', 'active', NULL, ${NOW}),
						('agent-shared-b', 'Agent Shared B', 'builder', 'ai', 'active', NULL, ${NOW}),
						('human-founder', 'Founder', 'founder', 'human', 'active', NULL, ${NOW})
				`);

			// A routine with an ordinary prompt document.
			await insertKnowledgeItem(client, {
				id: "ki-prompt-1",
				scopeKind: "factory",
				scopeId: null,
				title: "Routine One — prompt",
				body: "Do the thing.",
				status: "active",
				role: "ordinary",
				updatedBy: "u-founder",
			});
			await db.execute(sql`
					INSERT INTO routines (id, name, owner_agent_id, trigger_type, active, state, created_at, prompt_knowledge_id)
					VALUES ('routine-1', 'Routine One', 'agent-1', 'manual', true, 'active', ${NOW}, 'ki-prompt-1')
				`);

			// An already-archived prompt document.
			await insertKnowledgeItem(client, {
				id: "ki-prompt-archived",
				scopeKind: "factory",
				scopeId: null,
				title: "Routine Archived — prompt",
				body: "Old instruction.",
				status: "archived",
				role: "ordinary",
				updatedBy: "u-founder",
			});
			await db.execute(sql`
					INSERT INTO routines (id, name, owner_agent_id, trigger_type, active, state, created_at, prompt_knowledge_id)
					VALUES ('routine-archived', 'Routine Archived', 'agent-archived', 'manual', true, 'active', ${NOW}, 'ki-prompt-archived')
				`);

			// A plugin-installed prompt with a deterministic id, plus its
			// contribution row — must be untouched by the migration.
			await insertKnowledgeItem(client, {
				id: "ki_rp_routine-plugin",
				scopeKind: "factory",
				scopeId: null,
				title: "Routine Plugin — prompt",
				body: "Plugin instruction.",
				status: "active",
				role: "ordinary",
				updatedBy: "plugin",
			});
			await db.execute(sql`
					INSERT INTO routines (id, name, owner_agent_id, trigger_type, active, state, created_at, prompt_knowledge_id)
					VALUES ('routine-plugin', 'Routine Plugin', 'agent-plugin', 'manual', true, 'active', ${NOW}, 'ki_rp_routine-plugin')
				`);
			await db.execute(sql`
					INSERT INTO plugins (id, name, version, state, scope_kind, installed_at, updated_at)
					VALUES ('acme-pack', 'Acme Pack', '1.0.0', 'enabled', 'factory', ${NOW}, ${NOW})
				`);
			await db.execute(sql`
					INSERT INTO plugin_contributions (id, plugin_id, kind, entity_id, created_at)
					VALUES ('pc-1', 'acme-pack', 'knowledge', 'ki_rp_routine-plugin', ${NOW})
				`);

			// A user-scoped agent identity — the mechanism being retired.
			await insertKnowledgeItem(client, {
				id: "ki_af_agent-1",
				scopeKind: "user",
				scopeId: "agent-1",
				title: "Agent One — identity",
				body: "I am Agent One.",
				status: "active",
				role: "agent_file",
				updatedBy: "u-founder",
			});

			// A team-scoped agent_file — unreachable in production, but pin the
			// migration's honest behaviour: it names no agent, so it gets no
			// parent.
			await insertKnowledgeItem(client, {
				id: "ki_af_team-scoped",
				scopeKind: "team",
				scopeId: "team-1",
				title: "Team-scoped identity",
				body: "Applies to a whole team.",
				status: "active",
				role: "agent_file",
				updatedBy: "u-founder",
			});

			// A human user's agent_file — cosmetic edge case (Concern 5): the
			// migration cannot distinguish an agent from a person from inside
			// knowledge's own vocabulary, so it gets parent_kind='agent' too.
			await insertKnowledgeItem(client, {
				id: "ki_af_human-founder",
				scopeKind: "user",
				scopeId: "human-founder",
				title: "Founder — identity",
				body: "A human's identity document.",
				status: "active",
				role: "agent_file",
				updatedBy: "u-founder",
			});

			// --- apply 0077 ---
			const folder77 = makeTempMigrationsFolder(77);
			tempDirs.push(folder77);
			await migrate(db, { migrationsFolder: folder77 });

			// The routine prompt: parented, role flipped to 'prompt'.
			const prompt1 = await db.execute(sql`
					SELECT parent_kind, parent_id, role, status FROM knowledge_items WHERE id = 'ki-prompt-1'
				`);
			expect(prompt1.rows[0]).toEqual({
				parent_kind: "routine",
				parent_id: "routine-1",
				role: "prompt",
				status: "active",
			});

			// The archived prompt: same parent + role, status untouched.
			const promptArchived = await db.execute(sql`
					SELECT parent_kind, parent_id, role, status FROM knowledge_items WHERE id = 'ki-prompt-archived'
				`);
			expect(promptArchived.rows[0]).toEqual({
				parent_kind: "routine",
				parent_id: "routine-archived",
				role: "prompt",
				status: "archived",
			});

			// The plugin prompt: same parent + role, contribution row untouched.
			const promptPlugin = await db.execute(sql`
					SELECT parent_kind, parent_id, role FROM knowledge_items WHERE id = 'ki_rp_routine-plugin'
				`);
			expect(promptPlugin.rows[0]).toEqual({
				parent_kind: "routine",
				parent_id: "routine-plugin",
				role: "prompt",
			});
			const contribution = await db.execute(sql`
					SELECT plugin_id, kind, entity_id FROM plugin_contributions WHERE id = 'pc-1'
				`);
			expect(contribution.rows[0]).toEqual({
				plugin_id: "acme-pack",
				kind: "knowledge",
				entity_id: "ki_rp_routine-plugin",
			});

			// The agent identity: parented, scope unchanged (identical reach).
			const identity = await db.execute(sql`
					SELECT parent_kind, parent_id, role, scope_kind, scope_id FROM knowledge_items WHERE id = 'ki_af_agent-1'
				`);
			expect(identity.rows[0]).toEqual({
				parent_kind: "agent",
				parent_id: "agent-1",
				role: "agent_file",
				scope_kind: "user",
				scope_id: "agent-1",
			});

			// The team-scoped agent_file: no parent — the backfill cannot fix
			// this, and the population this reaches is empty in production.
			const teamScoped = await db.execute(sql`
					SELECT parent_kind, parent_id FROM knowledge_items WHERE id = 'ki_af_team-scoped'
				`);
			expect(teamScoped.rows[0]).toEqual({ parent_kind: null, parent_id: null });

			// The human's agent_file: parented as 'agent' too — knowledge cannot
			// tell an agent from a person, and nothing reads this today.
			const humanIdentity = await db.execute(sql`
					SELECT parent_kind, parent_id FROM knowledge_items WHERE id = 'ki_af_human-founder'
				`);
			expect(humanIdentity.rows[0]).toEqual({ parent_kind: "agent", parent_id: "human-founder" });

			// The old shape is gone.
			const promptCol = await db.execute(sql`
					SELECT column_name FROM information_schema.columns
					WHERE table_name = 'routines' AND column_name = 'prompt_knowledge_id'
				`);
			expect(promptCol.rows).toHaveLength(0);

			// The full parent vocabulary is accepted, even the three unused values.
			for (const kind of ["knowledge_item", "task", "thread"]) {
				await db.execute(sql`
						INSERT INTO knowledge_items
							(id, scope_kind, title, body, format, status, version, role, parent_kind, parent_id, updated_by, created_at, updated_at)
						VALUES (${`ki-parent-${kind}`}, 'factory', 'Parent probe', 'body', 'markdown', 'active', 1, 'ordinary', ${kind}, 'some-id', 'u-founder', ${NOW}, ${NOW})
					`);
			}
			const probes = await db.execute(sql`
					SELECT parent_kind FROM knowledge_items WHERE id LIKE 'ki-parent-%' ORDER BY parent_kind
				`);
			expect(probes.rows.map((r) => (r as { parent_kind: string }).parent_kind)).toEqual([
				"knowledge_item",
				"task",
				"thread",
			]);

			// `role='prompt'` is a legal role.
			await db.execute(sql`
					INSERT INTO knowledge_items
						(id, scope_kind, title, body, format, status, version, role, updated_by, created_at, updated_at)
					VALUES ('ki-role-prompt-probe', 'factory', 'Prompt probe', 'body', 'markdown', 'active', 1, 'prompt', 'u-founder', ${NOW}, ${NOW})
				`);
			const promptRole = await db.execute(sql`
					SELECT role FROM knowledge_items WHERE id = 'ki-role-prompt-probe'
				`);
			expect(promptRole.rows[0]).toEqual({ role: "prompt" });

			// An unrecognised parent kind is rejected.
			await expect(
				db.execute(sql`
						INSERT INTO knowledge_items
							(id, scope_kind, title, body, format, status, version, role, parent_kind, parent_id, updated_by, created_at, updated_at)
						VALUES ('ki-bad-parent', 'factory', 'Bad parent', 'body', 'markdown', 'active', 1, 'ordinary', 'bet', 'x', 'u-founder', ${NOW}, ${NOW})
					`),
			).rejects.toThrow();

			// A parent kind with no parent id is rejected.
			await expect(
				db.execute(sql`
						INSERT INTO knowledge_items
							(id, scope_kind, title, body, format, status, version, role, parent_kind, parent_id, updated_by, created_at, updated_at)
						VALUES ('ki-half-parent', 'factory', 'Half parent', 'body', 'markdown', 'active', 1, 'ordinary', 'routine', NULL, 'u-founder', ${NOW}, ${NOW})
					`),
			).rejects.toThrow();

			// A second role='prompt' row under the same routine is rejected...
			await expect(
				db.execute(sql`
						INSERT INTO knowledge_items
							(id, scope_kind, title, body, format, status, version, role, parent_kind, parent_id, updated_by, created_at, updated_at)
						VALUES ('ki-second-prompt', 'factory', 'Second prompt', 'body', 'markdown', 'active', 1, 'prompt', 'routine', 'routine-1', 'u-founder', ${NOW}, ${NOW})
					`),
			).rejects.toThrow();

			// ...but two parentless ordinary skills are not.
			await db.execute(sql`
					INSERT INTO knowledge_items
						(id, scope_kind, title, body, format, status, version, role, updated_by, created_at, updated_at)
					VALUES
						('ki-skill-a', 'factory', 'Skill A', 'body', 'markdown', 'active', 1, 'skill', 'u-founder', ${NOW}, ${NOW}),
						('ki-skill-b', 'factory', 'Skill B', 'body', 'markdown', 'active', 1, 'skill', 'u-founder', ${NOW}, ${NOW})
				`);
			const skills = await db.execute(sql`
					SELECT count(*) AS n FROM knowledge_items WHERE id IN ('ki-skill-a', 'ki-skill-b')
				`);
			expect(skills.rows[0]).toEqual({ n: 2 });
		},
	);

	it(
		"refuses to run when two routines share one prompt document",
		{ timeout: 180_000 },
		async () => {
			const client = new PGlite();
			clients.push(client);
			await client.waitReady;
			const db = drizzle(client);

			const folder76 = makeTempMigrationsFolder(76);
			tempDirs.push(folder76);
			await migrate(db, { migrationsFolder: folder76 });

			await db.execute(sql`
					INSERT INTO users (id, name, role, kind, status, created_at)
					VALUES
						('agent-shared-a', 'Agent Shared A', 'builder', 'ai', 'active', ${NOW}),
						('agent-shared-b', 'Agent Shared B', 'builder', 'ai', 'active', ${NOW})
				`);
			await insertKnowledgeItem(client, {
				id: "ki-shared-prompt",
				scopeKind: "factory",
				scopeId: null,
				title: "Shared — prompt",
				body: "One instruction, two routines.",
				status: "active",
				role: "ordinary",
				updatedBy: "u-founder",
			});
			await db.execute(sql`
					INSERT INTO routines (id, name, owner_agent_id, trigger_type, active, state, created_at, prompt_knowledge_id)
					VALUES
						('routine-shared-a', 'Routine Shared A', 'agent-shared-a', 'manual', true, 'active', ${NOW}, 'ki-shared-prompt'),
						('routine-shared-b', 'Routine Shared B', 'agent-shared-b', 'manual', true, 'active', ${NOW}, 'ki-shared-prompt')
				`);

			const folder77 = makeTempMigrationsFolder(77);
			tempDirs.push(folder77);
			await expect(migrate(db, { migrationsFolder: folder77 })).rejects.toThrow(/shared by more than one routine/);
		},
	);
});
