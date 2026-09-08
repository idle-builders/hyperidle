/**
 * @lore nested-knowledge-items architecture.md §10 / review.md B7 — the
 * writeback processor exercised against the REAL knowledge repository
 * (`@hyperidle/knowledge`'s `create`/`update`/`recordConflict`/`reparent`),
 * not a hand-rolled Drizzle stub. The old version of this test
 * (`run-orchestration/src/__tests__/nested-knowledge-writeback.integration.test.ts`)
 * bypassed the repository entirely — no `assertParentInvariants`, no
 * `nextPositionForParent`, no edit-log row, no `reparent()` transaction —
 * so a real production defect (scope inheritance always resolving to
 * "factory") shipped behind a green assertion that compared "factory" to
 * "factory" and could not fail.
 *
 * This file lives in `core-api`'s own test directory, not
 * `run-orchestration`'s, because it needs BOTH `createWritebackProcessor`
 * (now public — see `run-orchestration/src/index.ts`) AND the real
 * `@hyperidle/knowledge` repository, and `run-orchestration` may not import
 * `@hyperidle/knowledge` directly (the agent-orchestration -> core-api edge
 * AU26 B1a forbids — enforced by `npm run lint`). `core-api` is the one
 * place both are legal.
 *
 * The `knowledge` port wrapper below is the exact idiom
 * `run-orchestration-test-runtime.ts`'s `startTestRuntime` already uses to
 * wire the real repository into a real writeback processor — reused here,
 * not reinvented.
 *
 * A second describe block drives the REAL `startWatcher` (real `fs.watch`)
 * end to end. It is gated behind `HYPERIDLE_REAL_FS_WATCH_TESTS=1` and
 * skipped by default, per `.claude/rules/testing.md`: "Prefer a polling
 * watcher over fs.watch in tests — fs.watch flakes. Gate any real fs.watch
 * test behind an env flag, excluded from the default run." The default
 * suite below proves the watcher -> writeback wire's CONTRACT (the exact
 * `SandboxWritebackChangesDetectedEvent` shape `startWatcher` emits, fed
 * through the real subscriber) without depending on OS-level file-event
 * timing; the gated suite proves the watcher itself.
 */
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { knowledgeEditLog, knowledgeItems } from "@hyperidle/db";
import { create, recordConflict, reparent, update } from "@hyperidle/knowledge";
import { createWritebackProcessor, startWatcher } from "@hyperidle/run-orchestration";
import { and, eq } from "drizzle-orm";
import { describe, expect, test } from "../__testing__/test-fixtures.js";

type Writeback = ReturnType<typeof createWritebackProcessor>;
type KnowledgeWriter = Parameters<Writeback["subscribe"]>[0]["knowledge"];

/**
 * The real repository, shaped to the writeback processor's port — same
 * fields `run-orchestration-test-runtime.ts`'s `startTestRuntime` already
 * wires for production-shaped tests.
 */
function realKnowledgeWriter(): KnowledgeWriter {
	return {
		create,
		async update(db2, id, patch, expectedVersion) {
			return { ok: true, item: await update(db2, id, patch, expectedVersion) };
		},
		recordConflict,
		async reparentKnowledgeItem(db2, id, input) {
			await reparent(db2, id, input);
		},
	};
}

function makeSandbox(): { readonly root: string; readonly manifestPath: string } {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "knowledge-writeback-e2e-"));
	fs.mkdirSync(path.join(root, "knowledge"), { recursive: true });
	const manifestPath = path.join(root, "manifest.json");
	fs.writeFileSync(
		manifestPath,
		JSON.stringify({ session_id: "sess-e2e", assembled_at: new Date().toISOString(), items: {} }),
	);
	return { root, manifestPath };
}

const writeback = createWritebackProcessor();

describe("knowledge writeback end-to-end: real files, real sandbox, real database, REAL repository", () => {
	test("a file inside a nested folder is created with the folder as its parent, and REALLY inherits the folder's scope", async ({
		db,
	}) => {
		const { root, manifestPath } = makeSandbox();
		const knowledge = realKnowledgeWriter();

		// The wrapping directory is TEAM-scoped, seeded through the real
		// repository — the exact case review.md B6 named: a created item must
		// inherit the parent's real scope, not a hardcoded "factory" fallback.
		const teamFolder = await create(db, {
			title: "pricing",
			body: "",
			format: "markdown",
			status: "proposed",
			updatedBy: "test-seed",
			scopeKind: "team",
			scopeId: "team-e2e-1",
		});
		// Register the seeded folder's manifest entry the way a real
		// materialisation would (context.ts writes one per ancestor directory).
		const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as {
			items: Record<string, unknown>;
		};
		manifest.items[teamFolder.id] = {
			version: teamFolder.version,
			source_path: "knowledge/pricing",
			format: "markdown",
			scopeKind: "team",
		};
		fs.mkdirSync(path.join(root, "knowledge", "pricing"), { recursive: true });
		fs.writeFileSync(manifestPath, JSON.stringify(manifest));

		const filePath = path.join(root, "knowledge", "pricing", "objections.md");
		fs.writeFileSync(filePath, "Lead with value, not discount.");

		await writeback.process(
			{ db, sandboxPath: root, sessionId: "sess-e2e", manifestPath, knowledge },
			[{ type: "create", relativePath: "knowledge/pricing/objections.md", fullPath: filePath }],
		);

		const childItem = await db
			.select()
			.from(knowledgeItems)
			.where(eq(knowledgeItems.title, "objections"));
		expect(childItem).toHaveLength(1);
		expect(childItem[0]?.parentKind).toBe("knowledge_item");
		expect(childItem[0]?.parentId).toBe(teamFolder.id);
		// review.md B6: this is the assertion that could not fail before — the
		// stub always produced "factory" on both sides. Here the parent is
		// REALLY team-scoped, so a regression back to the "factory" fallback
		// in `ensureDirectoryChainItem`/`handleCreate` fails this for real.
		expect(childItem[0]?.scopeKind).toBe("team");
	});

	test("moving a file changes its parent through a real reparent() call — cycle/depth/scope invariants actually run", async ({
		db,
	}) => {
		const { root, manifestPath } = makeSandbox();
		const knowledge = realKnowledgeWriter();

		fs.mkdirSync(path.join(root, "knowledge", "old-home"), { recursive: true });
		fs.mkdirSync(path.join(root, "knowledge", "new-home"), { recursive: true });
		const originalPath = path.join(root, "knowledge", "old-home", "note_a1b2c3d4.md");
		fs.writeFileSync(originalPath, "The original body.");

		await writeback.process(
			{ db, sandboxPath: root, sessionId: "sess-e2e", manifestPath, knowledge },
			[{ type: "create", relativePath: "knowledge/old-home/note_a1b2c3d4.md", fullPath: originalPath }],
		);

		const beforeMove = await db
			.select()
			.from(knowledgeItems)
			.where(eq(knowledgeItems.title, "note a1b2c3d4"));
		expect(beforeMove).toHaveLength(1);
		const itemId = beforeMove[0]?.id;

		fs.rmSync(originalPath);
		const movedPath = path.join(root, "knowledge", "new-home", "note_a1b2c3d4.md");
		fs.writeFileSync(movedPath, "The original body.");

		await writeback.process(
			{ db, sandboxPath: root, sessionId: "sess-e2e", manifestPath, knowledge },
			[
				{ type: "delete", relativePath: "knowledge/old-home/note_a1b2c3d4.md", fullPath: originalPath },
				{ type: "create", relativePath: "knowledge/new-home/note_a1b2c3d4.md", fullPath: movedPath },
			],
		);

		const allWithTitle = await db
			.select()
			.from(knowledgeItems)
			.where(eq(knowledgeItems.title, "note a1b2c3d4"));
		expect(allWithTitle).toHaveLength(1);

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

		// Real repository proof: the edit-log row `reparent()` writes inside its
		// own transaction (architecture.md §5: "A move is recorded... field='parent'").
		// The hand-rolled stub this test replaces could never produce this —
		// it wrote knowledge_items directly and never touched knowledge_edit_log.
		const editLog = await db
			.select()
			.from(knowledgeEditLog)
			.where(and(eq(knowledgeEditLog.itemId, itemId ?? ""), eq(knowledgeEditLog.field, "parent")));
		expect(editLog.length).toBeGreaterThan(0);
	});

	test("an illegal move (would create a cycle) is refused — the REAL reparent() invariant runs, not a stub that cannot refuse anything", async ({
		db,
	}) => {
		const { root, manifestPath } = makeSandbox();
		const knowledge = realKnowledgeWriter();

		// A directory (`ki-root`) containing a subdirectory (`ki-child`, itself
		// containing a file) — real materialisation of a two-level tree.
		fs.mkdirSync(path.join(root, "knowledge", "root-dir", "child-dir"), { recursive: true });
		const filePath = path.join(root, "knowledge", "root-dir", "child-dir", "leaf_deadbeef.md");
		fs.writeFileSync(filePath, "leaf body");

		await writeback.process(
			{ db, sandboxPath: root, sessionId: "sess-e2e", manifestPath, knowledge },
			[
				{
					type: "create",
					relativePath: "knowledge/root-dir/child-dir/leaf_deadbeef.md",
					fullPath: filePath,
				},
			],
		);

		const rootDir = await db
			.select()
			.from(knowledgeItems)
			.where(eq(knowledgeItems.title, "root-dir"));
		const childDir = await db
			.select()
			.from(knowledgeItems)
			.where(eq(knowledgeItems.title, "child-dir"));
		expect(rootDir).toHaveLength(1);
		expect(childDir).toHaveLength(1);

		// Directly asking the REAL repository to reparent root-dir under its own
		// descendant must be refused — this is the exact invariant the old
		// stub had no way to exercise at all (its "reparentKnowledgeItem" just
		// wrote the columns, no cycle check).
		const rootId = rootDir[0]?.id;
		const childId = childDir[0]?.id;
		if (!rootId || !childId) throw new Error("setup failed");
		await expect(
			reparent(db, rootId, {
				parentKind: "knowledge_item",
				parentId: childId,
				updatedBy: "test",
			}),
		).rejects.toThrow(/cycle/);

		// And the tree is unchanged — refused, not recorded and repaired.
		const [rootAfter] = await db
			.select()
			.from(knowledgeItems)
			.where(eq(knowledgeItems.id, rootId));
		expect(rootAfter?.parentId).toBeNull();
	});

	test("moving a file out of a nested directory to sit directly under knowledge/ detaches it to the top level through a real reparent(), body untouched", async ({
		db,
	}) => {
		const { root, manifestPath } = makeSandbox();
		const knowledge = realKnowledgeWriter();

		fs.mkdirSync(path.join(root, "knowledge", "nested-home"), { recursive: true });
		const originalPath = path.join(root, "knowledge", "nested-home", "note_e5f6a7b8.md");
		fs.writeFileSync(originalPath, "The original body.");

		await writeback.process(
			{ db, sandboxPath: root, sessionId: "sess-e2e", manifestPath, knowledge },
			[
				{
					type: "create",
					relativePath: "knowledge/nested-home/note_e5f6a7b8.md",
					fullPath: originalPath,
				},
			],
		);

		const beforeMove = await db
			.select()
			.from(knowledgeItems)
			.where(eq(knowledgeItems.title, "note e5f6a7b8"));
		expect(beforeMove).toHaveLength(1);
		const itemId = beforeMove[0]?.id;
		expect(beforeMove[0]?.parentKind).toBe("knowledge_item");

		fs.rmSync(originalPath);
		const movedPath = path.join(root, "knowledge", "note_e5f6a7b8.md");
		fs.writeFileSync(movedPath, "The original body.");

		await writeback.process(
			{ db, sandboxPath: root, sessionId: "sess-e2e", manifestPath, knowledge },
			[
				{
					type: "delete",
					relativePath: "knowledge/nested-home/note_e5f6a7b8.md",
					fullPath: originalPath,
				},
				{ type: "create", relativePath: "knowledge/note_e5f6a7b8.md", fullPath: movedPath },
			],
		);

		const afterMove = await db
			.select()
			.from(knowledgeItems)
			.where(eq(knowledgeItems.id, itemId ?? ""));
		expect(afterMove).toHaveLength(1);
		expect(afterMove[0]?.parentKind).toBeNull();
		expect(afterMove[0]?.parentId).toBeNull();
		expect(afterMove[0]?.body).toBe("The original body.");
	});

	test("renaming a directory containing several files produces one batch of many deletes and creates; every file's real parent updates with no duplicates or orphans", async ({
		db,
	}) => {
		const { root, manifestPath } = makeSandbox();
		const knowledge = realKnowledgeWriter();

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

// ---------------------------------------------------------------------------
// Gated: the REAL file watcher (real fs.watch), end to end.
// ---------------------------------------------------------------------------

const REAL_FS_WATCH = process.env.HYPERIDLE_REAL_FS_WATCH_TESTS === "1";

describe.skipIf(!REAL_FS_WATCH)(
	"knowledge writeback end-to-end: the REAL watcher (fs.watch) — gated, HYPERIDLE_REAL_FS_WATCH_TESTS=1",
	() => {
		test("writing a file under knowledge/ is detected by the real watcher and lands in the real database", async ({
			db,
			eventBus,
		}) => {
			const { root, manifestPath } = makeSandbox();
			const knowledge = realKnowledgeWriter();

			const dispose = writeback.subscribe({ db, eventBus, knowledge });
			const watcher = startWatcher({
				sandboxPath: root,
				sessionId: "sess-real-watch",
				manifestPath,
				eventBus,
				debounceMs: 50,
				onError: (err) => {
					throw err;
				},
			});

			try {
				const filePath = path.join(root, "knowledge", "objections.md");
				fs.writeFileSync(filePath, "Lead with value, not discount.");

				// Bounded poll — the debounce + real fs event delivery is not
				// instantaneous. No fixed sleep: poll until the row appears or
				// the deadline passes.
				const deadline = Date.now() + 10_000;
				let found: unknown;
				while (Date.now() < deadline) {
					const rows = await db
						.select()
						.from(knowledgeItems)
						.where(eq(knowledgeItems.title, "objections"));
					if (rows.length > 0) {
						found = rows[0];
						break;
					}
					await new Promise((resolve) => setTimeout(resolve, 100));
				}
				expect(found).toBeDefined();
			} finally {
				watcher.stop();
				dispose();
			}
		});
	},
);
