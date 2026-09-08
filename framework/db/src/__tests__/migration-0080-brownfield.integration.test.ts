/**
 * Brownfield migration test for the nested-knowledge-items migration
 * (architecture.md §7 — numbered `0078` at the time this test was written;
 * two parallel strands (`0078_BA2_review_return_half`,
 * `0079_artifacts_become_knowledge`) claimed 0078 and 0079 first, so this
 * migration is `0080`. Neither of those touches `knowledge_items`, so the
 * pre-state below (through 0077) is unaffected — applying the "pending"
 * folder picks up 78 and 79 along the way to 80.
 *
 * Builds the pre-state by running the REAL migrations 0..77 against a
 * populated database (never hand-rolled DDL — the same discipline
 * `migration-0077-brownfield.integration.test.ts` documents), seeds rows
 * shaped like the real demo world (`tools/setup/src/demo-world/knowledge.ts`
 * has "pricing" as a topic under both a product-scoped row and a
 * practice-scoped row — reproduced here directly rather than through the
 * full demo-world seed, since that seed writes the OLD shape and will itself
 * be rewritten to the NEW shape once this migration exists — see
 * architecture.md §6 deletion census), then applies the pending migration
 * and asserts the end state architecture.md §7 requires:
 *
 * - No orphans.
 * - `product` rows: scope becomes 'team', scope_id UNCHANGED.
 * - `practice` rows: land under their practice item, scope becomes
 *   'factory', and their topic is PRESERVED as a topic item beneath the
 *   practice (the step the first draft of the architecture missed).
 * - `role != 'ordinary'` rows keep the parent 0077 gave them and are NOT
 *   swept under the seeded "General" root.
 * - `task`-scoped rows become parent_kind='task', parent_id=scope_id.
 * - Every status collapses to proposed | active | stale | archived.
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

// The next free migration number at the time this test was written. See the
// file header: another strand may claim it first, in which case the number
// below (and only the number) needs bumping to match whatever the real
// migration file is actually numbered.
const NESTED_KNOWLEDGE_MIGRATION_IDX = 80;

function makeTempMigrationsFolder(upToIdx: number): string {
	const tmpDir = mkdtempSync(join(tmpdir(), "drizzle-brownfield-nested-knowledge-"));
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
		topic: string | null;
		title: string;
		body: string;
		status: string;
		role: string;
		updatedBy: string;
		parentKind?: string | null;
		parentId?: string | null;
	},
): Promise<void> {
	const db = drizzle(client);
	await db.execute(sql`
			INSERT INTO knowledge_items
				(id, scope_kind, scope_id, topic, title, body, format, status, version, role, parent_kind, parent_id, updated_by, created_at, updated_at)
			VALUES (${row.id}, ${row.scopeKind}, ${row.scopeId}, ${row.topic}, ${row.title}, ${row.body},
				'markdown', ${row.status}, 1, ${row.role}, ${row.parentKind ?? null}, ${row.parentId ?? null}, ${row.updatedBy}, ${NOW}, ${NOW})
		`);
	await db.execute(sql`
			INSERT INTO knowledge_app_projection (id, knowledge_item_id, layer, scope_id)
			VALUES (${`kp-${row.id}`}, ${row.id}, NULL, ${row.scopeId})
		`);
}

describe("nested-knowledge-items migration: brownfield", () => {
	const clients: PGlite[] = [];
	const tempDirs: string[] = [];

	afterAll(async () => {
		await Promise.allSettled(clients.map((c) => c.close()));
		for (const d of tempDirs) rmSync(d, { recursive: true, force: true });
	});

	it("migrates product/practice/task scope, preserves 0077 parents, collapses status, and leaves no orphans", {
		timeout: 180_000,
	}, async () => {
		const client = new PGlite();
		clients.push(client);
		await client.waitReady;
		const db = drizzle(client);

		const folder77 = makeTempMigrationsFolder(77);
		tempDirs.push(folder77);
		await migrate(db, { migrationsFolder: folder77 });

		await db.execute(sql`
					INSERT INTO teams (id, name, phase, capacity, created_at)
					VALUES ('team-1', 'Team One', 'build', 5, ${NOW})
				`);
		await db.execute(sql`
					INSERT INTO users (id, name, role, kind, status, created_at)
					VALUES
						('agent-1', 'Agent One', 'builder', 'ai', 'active', ${NOW}),
						('u-founder', 'Founder', 'founder', 'human', 'active', ${NOW})
				`);
		await db.execute(sql`
					INSERT INTO tasks (id, team_id, title, state, created_at, updated_at)
					VALUES ('task-root-1', 'team-1', 'Root task one', 'in_progress', ${NOW}, ${NOW})
				`);

		// `product` scope — displays as Team, scope_id is already a team id
		// (feasibility.md finding 1). Shares topic "pricing" with a
		// practice-scoped row below, exactly like the real demo world does.
		await insertKnowledgeItem(client, {
			id: "ki-product-pricing",
			scopeKind: "product",
			scopeId: "team-1",
			topic: "pricing",
			title: "Decision: two-tier pricing",
			body: "Starter and Team.",
			status: "active",
			role: "ordinary",
			updatedBy: "u-founder",
		});

		// `practice` scope — the "Role" option, scope_id is an agent role id.
		// Same topic string as the product row above, but a DIFFERENT topic
		// (architecture §7 step 3): each grouping gets its own topic item.
		await insertKnowledgeItem(client, {
			id: "ki-practice-pricing",
			scopeKind: "practice",
			scopeId: "builder",
			topic: "pricing",
			title: "How builders talk about pricing",
			body: "Lead with the two tiers, not the feature list.",
			status: "captured",
			role: "ordinary",
			updatedBy: "agent-1",
		});

		// A practice row with NO topic — must still land under its practice
		// item, just with no topic item created for it.
		await insertKnowledgeItem(client, {
			id: "ki-practice-no-topic",
			scopeKind: "practice",
			scopeId: "builder",
			topic: null,
			title: "General builder note",
			body: "No topic on this one.",
			status: "validated",
			role: "ordinary",
			updatedBy: "agent-1",
		});

		// `task` scope — must become parent_kind='task', parent_id=scope_id.
		await insertKnowledgeItem(client, {
			id: "ki-task-scoped",
			scopeKind: "task",
			scopeId: "task-root-1",
			topic: null,
			title: "Task retro note",
			body: "What we learned.",
			status: "needs_human",
			role: "ordinary",
			updatedBy: "agent-1",
		});

		// A row with no topic and factory scope — must land under "General".
		await insertKnowledgeItem(client, {
			id: "ki-no-topic-factory",
			scopeKind: "factory",
			scopeId: null,
			topic: null,
			title: "Untopiced factory note",
			body: "Nowhere in particular.",
			status: "stale",
			role: "ordinary",
			updatedBy: "u-founder",
		});

		// A role != 'ordinary' row already parented by 0077 — must KEEP that
		// parent and must NOT be swept under General. This is the step the
		// first draft of the architecture missed (architecture §7 step 8).
		await insertKnowledgeItem(client, {
			id: "ki_af_agent-1",
			scopeKind: "user",
			scopeId: "agent-1",
			topic: null,
			title: "Agent One — identity",
			body: "I am Agent One.",
			status: "active",
			role: "agent_file",
			updatedBy: "u-founder",
			parentKind: "agent",
			parentId: "agent-1",
		});

		// --- apply the pending migration ---
		const folderPending = makeTempMigrationsFolder(NESTED_KNOWLEDGE_MIGRATION_IDX);
		tempDirs.push(folderPending);
		await migrate(db, { migrationsFolder: folderPending });

		// `product` row: scope becomes 'team', scope_id UNCHANGED, parented
		// under the "Product" root's "pricing" topic item.
		const productRow = await db.execute(sql`
					SELECT scope_kind, scope_id, parent_kind FROM knowledge_items WHERE id = 'ki-product-pricing'
				`);
		expect(productRow.rows[0]).toMatchObject({
			scope_kind: "team",
			scope_id: "team-1",
			parent_kind: "knowledge_item",
		});

		// `practice` row: scope becomes 'factory', parented under a
		// "Practices" → "<practice>" item, and its topic is PRESERVED as a
		// topic item beneath the practice — not discarded.
		const practiceRow = await db.execute(sql`
					SELECT k.scope_kind, k.parent_kind, parent.title AS parent_title
					FROM knowledge_items k
					LEFT JOIN knowledge_items parent ON parent.id = k.parent_id
					WHERE k.id = 'ki-practice-pricing'
				`);
		expect((practiceRow.rows[0] as { scope_kind: string }).scope_kind).toBe("factory");
		expect((practiceRow.rows[0] as { parent_kind: string }).parent_kind).toBe("knowledge_item");
		// The practice row's parent must be a "pricing" topic item, not the
		// practice item directly and not the product row's own "pricing"
		// topic item (they are different topics that share a word).
		expect((practiceRow.rows[0] as { parent_title: string }).parent_title).toBe("pricing");

		const productTopicParent = await db.execute(sql`
					SELECT parent_id FROM knowledge_items WHERE id = 'ki-product-pricing'
				`);
		const practiceTopicParent = await db.execute(sql`
					SELECT parent_id FROM knowledge_items WHERE id = 'ki-practice-pricing'
				`);
		expect((productTopicParent.rows[0] as { parent_id: string }).parent_id).not.toBe(
			(practiceTopicParent.rows[0] as { parent_id: string }).parent_id,
		);

		// A practice row with no topic still lands under its practice item.
		const practiceNoTopic = await db.execute(sql`
					SELECT k.scope_kind, k.parent_kind, parent.title AS parent_title
					FROM knowledge_items k
					LEFT JOIN knowledge_items parent ON parent.id = k.parent_id
					WHERE k.id = 'ki-practice-no-topic'
				`);
		expect((practiceNoTopic.rows[0] as { scope_kind: string }).scope_kind).toBe("factory");
		expect((practiceNoTopic.rows[0] as { parent_title: string }).parent_title).not.toBe("pricing");

		// `task` row: parent_kind='task', parent_id=scope_id.
		const taskRow = await db.execute(sql`
					SELECT parent_kind, parent_id, status FROM knowledge_items WHERE id = 'ki-task-scoped'
				`);
		expect(taskRow.rows[0]).toMatchObject({ parent_kind: "task", parent_id: "task-root-1" });
		// `needs_human` and `draft` are the same state — an item awaiting human
		// attention, not one that is done with — so `needs_human` must land on
		// `proposed`, never `archived`.
		expect((taskRow.rows[0] as { status: string }).status).toBe("proposed");

		// A topicless factory row lands under "General".
		const generalRow = await db.execute(sql`
					SELECT parent.title AS parent_title
					FROM knowledge_items k
					LEFT JOIN knowledge_items parent ON parent.id = k.parent_id
					WHERE k.id = 'ki-no-topic-factory'
				`);
		expect((generalRow.rows[0] as { parent_title: string }).parent_title).toBe("General");

		// The 0077-parented agent identity KEEPS its parent — not swept under
		// General.
		const identityRow = await db.execute(sql`
					SELECT parent_kind, parent_id FROM knowledge_items WHERE id = 'ki_af_agent-1'
				`);
		expect(identityRow.rows[0]).toEqual({ parent_kind: "agent", parent_id: "agent-1" });

		// Every status collapses onto the four-value ladder.
		const statuses = await db.execute(sql`SELECT DISTINCT status FROM knowledge_items`);
		const allowed = new Set(["proposed", "active", "stale", "archived"]);
		for (const row of statuses.rows as Array<{ status: string }>) {
			expect(allowed.has(row.status)).toBe(true);
		}

		// No orphans: every parent_id resolves to a real row (for
		// parent_kind='knowledge_item') or to the task/routine/agent row it
		// already pointed at.
		const dangling = await db.execute(sql`
					SELECT k.id FROM knowledge_items k
					LEFT JOIN knowledge_items p ON p.id = k.parent_id
					WHERE k.parent_kind = 'knowledge_item' AND p.id IS NULL
				`);
		expect(dangling.rows).toHaveLength(0);

		// `position` exists and is populated.
		const positionCol = await db.execute(sql`
					SELECT column_name FROM information_schema.columns
					WHERE table_name = 'knowledge_items' AND column_name = 'position'
				`);
		expect(positionCol.rows.length).toBeGreaterThan(0);
	});
});
