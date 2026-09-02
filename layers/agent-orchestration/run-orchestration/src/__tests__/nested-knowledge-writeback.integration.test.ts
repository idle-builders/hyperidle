/**
 * nested-knowledge-items — end-to-end evidence (architecture.md §10, plan.md
 * "Agents and humans are equal here" / "A move is an edit").
 *
 * Drives REAL FILES into a REAL SANDBOX (a real temp directory) against a
 * REAL DATABASE (`@hyperidle/db/test-fixtures`'s PGlite fixture), through the
 * real `createWritebackProcessor()` this package already ships. This is a
 * service-integration test, not the harness lane: no LLM, no CLI binary —
 * exactly the boundary architecture.md §10 draws ("does not belong in the
 * harness lane, which has no CI job at all and would make an agent's
 * nondeterministic choice part of the assertion").
 *
 * @lore RED phase (nested-knowledge-items): `run-orchestration` may depend on
 * `@hyperidle/db` (already a package dependency; `writeback-processor.ts`
 * itself imports `sessions` from it) but may NOT depend on `@hyperidle/knowledge`
 * — that is the exact "agent-orchestration -> core-api" edge AU26 B1a's
 * `__testing__/test-fixtures.ts` lore names as forbidden. So the `knowledge`
 * port this file hands to the real writeback processor is a small adapter
 * written here, writing straight to the `knowledge_items` kernel table with
 * Drizzle — the same shape `buildKnowledgeWritebackPort`
 * (`layers/agent-orchestration/src/services/run-orchestration-composition.ts`)
 * builds over an HTTP transport in production, minus the transport hop. This
 * is a deliberate, discretionary test-only seam (see this item's builder
 * report for why no other legal seam exists today): it proves the writeback
 * processor's OWN behaviour against real rows in a real table, not core-api's
 * business rules, which is exactly what this test is about.
 *
 * `createWritebackProcessor` is not part of `@hyperidle/run-orchestration`'s
 * package export map — it is imported here by relative path, from within its
 * own package, exactly as `writeback-subscriber.test.ts` (this same
 * directory) already does.
 */
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { HyperIdleDb } from "@hyperidle/db";
import { knowledgeAppProjection, knowledgeItems } from "@hyperidle/db";
import { describe, expect, test } from "@hyperidle/db/test-fixtures";
import { eq } from "drizzle-orm";
import { createWritebackProcessor } from "../writeback-processor.js";

const writeback = createWritebackProcessor();
type KnowledgeWriter = Parameters<typeof writeback.subscribe>[0]["knowledge"];

/**
 * A real-DB-backed stand-in for the production HTTP-transport knowledge
 * port. Every `create` inserts a real `knowledge_items` row and returns its
 * real id — so a "move" (a delete immediately followed by a create at the
 * same known id) can be told apart from a genuinely new item by querying the
 * real table afterwards.
 *
 * @lore nested-knowledge-items: `create` now writes `input.parentKind`/
 * `parentId`/`scopeKind` (the production port's `POST /knowledge` already
 * accepts them; the writeback processor folds a directory/leaf's parent link
 * into its create call instead of a separate post-create write), and
 * `reparentKnowledgeItem` writes the move directly — same "real table,
 * discretionary test-only seam" style this stub already documents.
 */
function makeRealDbKnowledgeWriter(
	db: HyperIdleDb,
): KnowledgeWriter & { readonly createCount: { value: number } } {
	const createCount = { value: 0 };
	return {
		createCount,
		async create(_db, input) {
			createCount.value++;
			const id = `ki-e2e-${createCount.value}-${Date.now()}`;
			const now = new Date().toISOString();
			await db.insert(knowledgeItems).values({
				id,
				scopeKind: input.scopeKind ?? "factory",
				scopeId: null,
				parentKind: input.parentKind ?? null,
				parentId: input.parentId ?? null,
				title: input.title,
				body: input.body,
				format: input.format,
				status: "active",
				version: 1,
				updatedBy: input.updatedBy,
				createdAt: now,
				updatedAt: now,
			});
			// Kernel row and projection travel together, as knowledge always writes them.
			await db.insert(knowledgeAppProjection).values({ id: `${id}-projection`, knowledgeItemId: id });
			return { id, version: 1, format: input.format };
		},
		async update(_db, id, patch, _expectedVersion) {
			await db
				.update(knowledgeItems)
				.set({ body: patch.body, updatedBy: patch.updatedBy, updatedAt: new Date().toISOString() })
				.where(eq(knowledgeItems.id, id));
			const [row] = await db
				.select()
				.from(knowledgeItems)
				.where(eq(knowledgeItems.id, id))
				.limit(1);
			if (!row) throw new Error(`row ${id} vanished`);
			return { ok: true, item: { id: row.id, version: row.version, format: row.format } };
		},
		async recordConflict() {
			// Not exercised by these cases.
		},
		async reparentKnowledgeItem(_db, id, input) {
			await db
				.update(knowledgeItems)
				.set({
					parentKind: input.parentKind,
					parentId: input.parentId,
					updatedBy: input.updatedBy,
					updatedAt: new Date().toISOString(),
				})
				.where(eq(knowledgeItems.id, id));
		},
	};
}

function makeSandbox(): { readonly root: string; readonly manifestPath: string } {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "nested-knowledge-e2e-"));
	fs.mkdirSync(path.join(root, "knowledge"), { recursive: true });
	const manifestPath = path.join(root, "manifest.json");
	fs.writeFileSync(
		manifestPath,
		JSON.stringify({ session_id: "sess-e2e", assembled_at: new Date().toISOString(), items: {} }),
	);
	return { root, manifestPath };
}

describe("nested-knowledge-items: writeback end-to-end (real files, real sandbox, real database)", () => {
	test("a file inside a nested folder is created with the folder as its parent, and inherits the folder's scope", async ({
		db,
	}) => {
		const { root, manifestPath } = makeSandbox();
		const knowledge = makeRealDbKnowledgeWriter(db);

		fs.mkdirSync(path.join(root, "knowledge", "pricing"), { recursive: true });
		const filePath = path.join(root, "knowledge", "pricing", "objections.md");
		fs.writeFileSync(filePath, "Lead with value, not discount.");

		await writeback.process(
			{ db, sandboxPath: root, sessionId: "sess-e2e", manifestPath, knowledge },
			[{ type: "create", relativePath: "knowledge/pricing/objections.md", fullPath: filePath }],
		);

		// The "pricing" directory itself must have become a knowledge item
		// (plan.md D4: "a folder is a knowledge item").
		const pricingFolderItem = await db
			.select()
			.from(knowledgeItems)
			.where(eq(knowledgeItems.title, "pricing"));
		expect(pricingFolderItem.length).toBeGreaterThan(0);

		// The file's item must be parented to that folder item, and inherit its
		// scope (D4: "a created item inherits its parent's scope").
		const childItem = await db
			.select()
			.from(knowledgeItems)
			.where(eq(knowledgeItems.title, "objections"));
		expect(childItem.length).toBeGreaterThan(0);
		expect(childItem[0]?.parentKind).toBe("knowledge_item");
		expect(childItem[0]?.parentId).toBe(pricingFolderItem[0]?.id);
		expect(childItem[0]?.scopeKind).toBe(pricingFolderItem[0]?.scopeKind);
	});

	test("moving a file changes its parent but leaves its body untouched — no duplicate item is created", async ({
		db,
	}) => {
		const { root, manifestPath } = makeSandbox();
		const knowledge = makeRealDbKnowledgeWriter(db);

		fs.mkdirSync(path.join(root, "knowledge", "old-home"), { recursive: true });
		fs.mkdirSync(path.join(root, "knowledge", "new-home"), { recursive: true });
		const originalPath = path.join(root, "knowledge", "old-home", "note_a1b2c3d4.md");
		fs.writeFileSync(originalPath, "The original body.");

		await writeback.process(
			{ db, sandboxPath: root, sessionId: "sess-e2e", manifestPath, knowledge },
			[
				{
					type: "create",
					relativePath: "knowledge/old-home/note_a1b2c3d4.md",
					fullPath: originalPath,
				},
			],
		);

		const beforeMove = await db
			.select()
			.from(knowledgeItems)
			.where(eq(knowledgeItems.title, "note a1b2c3d4"));
		expect(beforeMove).toHaveLength(1);
		const itemId = beforeMove[0]?.id;

		// Physically move the file — same filename (same id suffix, D3), new
		// directory. The watcher reports this as a delete + a create in one
		// batch (the debounce is trailing — architecture §5).
		fs.rmSync(originalPath);
		const movedPath = path.join(root, "knowledge", "new-home", "note_a1b2c3d4.md");
		fs.writeFileSync(movedPath, "The original body.");

		await writeback.process(
			{ db, sandboxPath: root, sessionId: "sess-e2e", manifestPath, knowledge },
			[
				{
					type: "delete",
					relativePath: "knowledge/old-home/note_a1b2c3d4.md",
					fullPath: originalPath,
				},
				{
					type: "create",
					relativePath: "knowledge/new-home/note_a1b2c3d4.md",
					fullPath: movedPath,
				},
			],
		);

		// No duplicate: still exactly ONE row with this title across the whole
		// table (a naive delete+create would leave the original row orphaned
		// and insert a second, new-id row alongside it).
		const allWithTitle = await db
			.select()
			.from(knowledgeItems)
			.where(eq(knowledgeItems.title, "note a1b2c3d4"));
		expect(allWithTitle).toHaveLength(1);

		// It is the SAME item (identity preserved via the id suffix, D3), its
		// body is untouched, and its parent now points at the new folder.
		const afterMove = await db
			.select()
			.from(knowledgeItems)
			.where(eq(knowledgeItems.id, itemId ?? ""));
		expect(afterMove).toHaveLength(1);
		expect(afterMove[0]?.body).toBe("The original body.");

		const newHomeFolder = await db
			.select()
			.from(knowledgeItems)
			.where(eq(knowledgeItems.title, "new-home"));
		expect(newHomeFolder.length).toBeGreaterThan(0);
		expect(afterMove[0]?.parentId).toBe(newHomeFolder[0]?.id);
	});

	test("renaming a directory containing several files produces one batch of many deletes and creates, and every file's parent updates with no duplicates or orphans", async ({
		db,
	}) => {
		const { root, manifestPath } = makeSandbox();
		const knowledge = makeRealDbKnowledgeWriter(db);

		fs.mkdirSync(path.join(root, "knowledge", "practices"), { recursive: true });
		const fileAPath = path.join(root, "knowledge", "practices", "onboarding_11112222.md");
		const fileBPath = path.join(root, "knowledge", "practices", "offboarding_33334444.md");
		fs.writeFileSync(fileAPath, "Onboarding body.");
		fs.writeFileSync(fileBPath, "Offboarding body.");

		await writeback.process(
			{ db, sandboxPath: root, sessionId: "sess-e2e", manifestPath, knowledge },
			[
				{
					type: "create",
					relativePath: "knowledge/practices/onboarding_11112222.md",
					fullPath: fileAPath,
				},
				{
					type: "create",
					relativePath: "knowledge/practices/offboarding_33334444.md",
					fullPath: fileBPath,
				},
			],
		);

		const beforeRename = await db
			.select()
			.from(knowledgeItems)
			.where(eq(knowledgeItems.title, "onboarding 11112222"));
		const idA = beforeRename[0]?.id;

		// Rename the directory: on disk, this is N deletes + N creates in one
		// batch (architecture §5: "a directory rename emitting N deletions and
		// N creations" — the case batch pairing was rejected for).
		fs.mkdirSync(path.join(root, "knowledge", "team-rituals"), { recursive: true });
		fs.rmSync(fileAPath);
		fs.rmSync(fileBPath);
		const movedAPath = path.join(root, "knowledge", "team-rituals", "onboarding_11112222.md");
		const movedBPath = path.join(root, "knowledge", "team-rituals", "offboarding_33334444.md");
		fs.writeFileSync(movedAPath, "Onboarding body.");
		fs.writeFileSync(movedBPath, "Offboarding body.");

		await writeback.process(
			{ db, sandboxPath: root, sessionId: "sess-e2e", manifestPath, knowledge },
			[
				{
					type: "delete",
					relativePath: "knowledge/practices/onboarding_11112222.md",
					fullPath: fileAPath,
				},
				{
					type: "delete",
					relativePath: "knowledge/practices/offboarding_33334444.md",
					fullPath: fileBPath,
				},
				{
					type: "create",
					relativePath: "knowledge/team-rituals/onboarding_11112222.md",
					fullPath: movedAPath,
				},
				{
					type: "create",
					relativePath: "knowledge/team-rituals/offboarding_33334444.md",
					fullPath: movedBPath,
				},
			],
		);

		const rows = await db
			.select()
			.from(knowledgeItems)
			.where(eq(knowledgeItems.id, idA ?? ""));
		expect(rows).toHaveLength(1);

		const teamRitualsFolder = await db
			.select()
			.from(knowledgeItems)
			.where(eq(knowledgeItems.title, "team-rituals"));
		expect(teamRitualsFolder.length).toBeGreaterThan(0);

		const afterRenameA = await db
			.select()
			.from(knowledgeItems)
			.where(eq(knowledgeItems.title, "onboarding 11112222"));
		const afterRenameB = await db
			.select()
			.from(knowledgeItems)
			.where(eq(knowledgeItems.title, "offboarding 33334444"));
		expect(afterRenameA).toHaveLength(1);
		expect(afterRenameB).toHaveLength(1);
		expect(afterRenameA[0]?.parentId).toBe(teamRitualsFolder[0]?.id);
		expect(afterRenameB[0]?.parentId).toBe(teamRitualsFolder[0]?.id);
		expect(afterRenameA[0]?.body).toBe("Onboarding body.");
		expect(afterRenameB[0]?.body).toBe("Offboarding body.");
	});
});
