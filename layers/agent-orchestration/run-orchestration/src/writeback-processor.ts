/** Consolidated private capture/writeback stage. */
import * as fs from "node:fs";
import * as path from "node:path";
import { type HyperIdleDb, sessions } from "@hyperidle/db";
import type { EventBus } from "@hyperidle/event-bus";
import { eq } from "drizzle-orm";
import type { Manifest, ManifestEntry } from "./manifest-types.js";

// ---- capture-writeback-ports ----
// ---------------------------------------------------------------------------
// knowledge — CaptureWritebackKnowledgeWriter (ordinary downward edge, real target)
// ---------------------------------------------------------------------------

/**
 * @lore nested-knowledge-items: `layer`/`kind` are DELETED — a knowledge item
 * a session writes back is a node in the tree now, not a flat-vocabulary
 * document. `status` collapses to the four-value ladder's starting point:
 * "proposed" (draft/captured/provisional all folded into it).
 */
interface CaptureWritebackCreateKnowledgeItemInput {
	readonly title: string;
	readonly body: string;
	readonly format: string;
	/**
	 * @lore nested-knowledge-items / rebase-onto-#547: a parallel strand found
	 * this path sent `captured` for its whole life and the route never accepted
	 * that value — every writeback create was rejected before it reached the
	 * database — and fixed it forward to `draft`. `draft` no longer exists:
	 * this WP's status collapse (`KNOWLEDGE_STATUSES`,
	 * `framework/domain-model/src/knowledge.ts`) deletes the whole
	 * draft/captured/provisional ladder and replaces it with a single triage
	 * starting state, `proposed`. `proposed` is what actually reaches the
	 * route now.
	 */
	readonly status: "proposed";
	readonly updatedBy: string;
	/**
	 * @lore nested-knowledge-items §8/D4: a directory-chain or new-leaf create
	 * places the item under its parent (and inherits the parent's scope) at
	 * creation time — no separate reparent call for a brand-new id.
	 */
	readonly scopeKind?: string;
	/**
	 * @lore rebase-onto-#547: a parallel strand's `resolveSessionParent`
	 * fallback — the session's task, or the conversation it is answering in —
	 * for a leaf created directly at the `knowledge/` root, with no wrapping
	 * directory to derive a `document` parent from. Directory placement
	 * always wins when both are available (see `handleCreate`); the two never
	 * both apply to the same create.
	 */
	readonly parent?: { readonly kind: "task" | "thread"; readonly id: string };
	readonly parentKind?: "document";
	readonly parentId?: string;
}

/** Narrowed to the three fields `writeback.ts` actually reads off a created/updated item. */
interface CaptureWritebackKnowledgeItem {
	readonly id: string;
	readonly version: number;
	readonly format: string;
}

type CaptureWritebackUpdateResult =
	| { readonly ok: true; readonly item: CaptureWritebackKnowledgeItem }
	| { readonly ok: false; readonly currentVersion: number };

/**
 * Port for `knowledge`'s create/update surface `writeback.ts` calls directly
 * today.
 *
 * @lore document-module B0c: `recordConflict` and
 * `CaptureWritebackRecordConflictInput` are DELETED — a document has no
 * conflict object (founder ruling). A stale write is refused
 * (`update`'s `{ok:false, currentVersion}`) and discarded; see
 * `handleModify`.
 */
interface CaptureWritebackKnowledgeWriter {
	create(
		db: HyperIdleDb,
		input: CaptureWritebackCreateKnowledgeItemInput,
	): Promise<CaptureWritebackKnowledgeItem>;
	update(
		db: HyperIdleDb,
		id: string,
		patch: { readonly body: string; readonly updatedBy: string },
		expectedVersion: number,
	): Promise<CaptureWritebackUpdateResult>;
	/**
	 * @lore nested-knowledge-items: replaces this file's own former
	 * `getItemLink`/`setItemLink` direct-`knowledgeItems`/`knowledgeEditLog`
	 * reads/writes for the move case (architecture.md §5's "a creation whose
	 * filename carries a known id IS a move") — `knowledge` owns that table,
	 * and this crossing must go through its seam like every other write here.
	 *
	 * @lore nested-knowledge-items defect 2: `parentKind`/`parentId` both null
	 * together is a move to the top level — a file that lands directly under
	 * `knowledge/` (no wrapping directory) detaches to root instead of the
	 * move silently not happening.
	 */
	reparentKnowledgeItem(
		db: HyperIdleDb,
		id: string,
		input: {
			readonly parentKind: "document" | null;
			readonly parentId: string | null;
			readonly updatedBy: string;
		},
	): Promise<void>;
}

// ---------------------------------------------------------------------------
// context-assembly — Manifest/ManifestEntry
//
// @lore nested-knowledge-items (review.md B5): this used to be a second,
// independently-declared copy of the writer's (context.ts) shape — same
// fields, two interfaces, so TypeScript never compared them and the writer's
// missing `scopeKind` went uncaught. Both files now import the one shared
// declaration in manifest-types.ts.
// ---------------------------------------------------------------------------

// ---- writeback ----
interface WritebackConfig {
	db: HyperIdleDb;
	/**
	 * @lore AK1: Renamed per harness-vocab plan (AK1).
	 */
	sandboxPath: string;
	sessionId: string;
	manifestPath: string;
	knowledge: CaptureWritebackKnowledgeWriter;
	/**
	 * What this session is working on, if anything — the parent every item it
	 * writes back hangs off. A task session parents to its task; a conversation
	 * session parents to its thread. A session with neither (a routine, a
	 * knowledge run) writes parentless items, as before.
	 */
	parent?: { readonly kind: "task" | "thread"; readonly id: string };
}

interface WritebackChange {
	type: "create" | "modify" | "delete";
	relativePath: string;
	fullPath: string;
}

interface WritebackResult {
	processed: number;
	created: number;
	updated: number;
	deleted: number;
}

/** Read the manifest from disk. */
function readManifest(manifestPath: string): Manifest {
	const raw = fs.readFileSync(manifestPath, "utf-8");
	return JSON.parse(raw) as Manifest;
}

/** Write the manifest back to disk. */
function writeManifest(manifestPath: string, manifest: Manifest): void {
	fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
}

/** Find the item ID for a given relative path in the manifest. */
function findItemByPath(
	manifest: Manifest,
	relativePath: string,
): { itemId: string; entry: ManifestEntry } | null {
	for (const [itemId, entry] of Object.entries(manifest.items)) {
		if (entry.source_path === relativePath) {
			return { itemId, entry };
		}
	}
	return null;
}

/** Check if a path is in the knowledge/ zone. */
function isKnowledgePath(relativePath: string): boolean {
	return relativePath.startsWith("knowledge/");
}

/** Check if a path is the session notes file. */
function isSessionNotesPath(relativePath: string): boolean {
	return relativePath === "work/session-notes.md" || relativePath === "work/task-notes.md";
}

/** Extract a title from a filename. */
function titleFromFilename(filename: string): string {
	const base = path.basename(filename, path.extname(filename));
	return base.replace(/[_-]/g, " ");
}

/**
 * The `_${id.slice(0,8)}` suffix `toFilename` (context.ts) puts on every
 * materialised path (D3) — the one thing making a path unique, and what
 * makes a move self-identifying. Matched against the FILENAME two paths
 * carry, not against any real database id: the suffix is a stable token a
 * rename preserves, decoupled from whichever id a fresh `create()` call
 * happens to assign (architecture.md §5).
 */
function filenameIdSuffix(relativePath: string): string | null {
	const base = path.basename(relativePath, path.extname(relativePath));
	const match = /_([A-Za-z0-9]{8})$/.exec(base);
	return match?.[1] ?? null;
}

/**
 * A manifest entry whose OWN tracked path carries the same id suffix as
 * `relativePath` — the move-detection match. Excludes an entry already
 * sitting at `relativePath` (that is not a move, it is the same path).
 */
function findManifestEntryBySuffix(
	manifest: Manifest,
	relativePath: string,
): { itemId: string; entry: ManifestEntry } | null {
	const suffix = filenameIdSuffix(relativePath);
	if (!suffix) return null;
	for (const [itemId, entry] of Object.entries(manifest.items)) {
		if (entry.source_path === relativePath) continue;
		if (filenameIdSuffix(entry.source_path) === suffix) {
			return { itemId, entry };
		}
	}
	return null;
}

/**
 * Ensure every directory from `knowledge/` down to `dirRelativePath` has a
 * knowledge item (plan.md D4: "a folder is a knowledge item"), creating any
 * that are missing, and return the immediate parent's item id + scope
 * (`null` at the `knowledge/` root itself).
 *
 * @lore nested-knowledge-items §5 D4: a created directory item inherits its
 * own parent's scope. Manifest entries double as the directory→item index —
 * a directory's `source_path` is its own relative path, so `findItemByPath`
 * already tells this function which directories already have an item — and
 * now also carries that item's `scopeKind`, so a parent's scope is read from
 * the manifest this function already holds, never a fresh `knowledgeItems`
 * read (that table belongs to `knowledge`; this function stays inside the
 * `knowledge` port's `create()`, which accepts `parentKind`/`parentId`/
 * `scopeKind` directly instead of a separate post-create link step).
 */
async function ensureDirectoryChainItem(
	config: WritebackConfig,
	dirRelativePath: string,
	manifest: Manifest,
): Promise<{ readonly id: string; readonly scopeKind: string } | null> {
	if (dirRelativePath === "knowledge" || dirRelativePath === "." || dirRelativePath === "") {
		return null;
	}

	const existing = findItemByPath(manifest, dirRelativePath);
	if (existing) return { id: existing.itemId, scopeKind: existing.entry.scopeKind };

	const parentDir = path.dirname(dirRelativePath);
	const parent = await ensureDirectoryChainItem(config, parentDir, manifest);
	const parentScopeKind = parent?.scopeKind ?? "factory";

	const created = await config.knowledge.create(config.db, {
		// A directory's title is its plain name, unlike a file's — a folder
		// called "team-rituals" is still called "team-rituals" (no
		// underscore/hyphen-to-space normalization; that only makes sense for
		// a filename that also carries an extension and an id suffix).
		title: path.basename(dirRelativePath),
		body: "",
		format: "markdown",
		status: "proposed",
		updatedBy: `session:${config.sessionId}`,
		scopeKind: parentScopeKind,
		...(parent ? { parentKind: "document" as const, parentId: parent.id } : {}),
	});

	manifest.items[created.id] = {
		version: created.version,
		source_path: dirRelativePath,
		format: created.format,
		scopeKind: parentScopeKind,
	};
	return { id: created.id, scopeKind: parentScopeKind };
}

/** Process a batch of writeback changes. */
async function processWriteback(
	config: WritebackConfig,
	changes: WritebackChange[],
): Promise<WritebackResult> {
	const result: WritebackResult = {
		processed: 0,
		created: 0,
		updated: 0,
		deleted: 0,
	};

	const manifest = readManifest(config.manifestPath);

	// @lore nested-knowledge-items §5: creates are processed before deletes so
	// a move (a create whose filename suffix matches a path this batch is also
	// deleting) retargets the manifest FIRST — the paired delete for the old
	// path then finds nothing tracked there and safely no-ops. Batch pairing
	// itself was rejected (a directory rename is N deletes + N creates that
	// never line up 1:1); ordering the two PASSES, not pairing entries, is
	// what makes this safe.
	const creates = changes.filter((c) => c.type === "create");
	const modifies = changes.filter((c) => c.type === "modify");
	const deletes = changes.filter((c) => c.type === "delete");

	for (const change of [...creates, ...modifies, ...deletes]) {
		const relativePath = change.relativePath;

		// Handle session notes specially
		if (isSessionNotesPath(relativePath) && change.type !== "delete") {
			await handleSessionNotes(config, change);
			result.processed++;
			result.updated++;
			continue;
		}

		// Only knowledge/ files/directories create/update knowledge_items
		if (!isKnowledgePath(relativePath)) {
			result.processed++;
			continue;
		}

		switch (change.type) {
			case "create":
				{
					const outcome = await handleCreate(config, change, manifest);
					if (outcome === "moved") {
						result.updated++;
					} else {
						result.created++;
					}
				}
				break;
			case "modify":
				{
					const modifyResult = await handleModify(config, change, manifest);
					if (modifyResult === "created") {
						result.created++;
					} else {
						// "updated" and "stale" both leave the manifest carrying a real
						// version — the agent's own edit for "updated", the durable
						// version for "stale" (its text was discarded, not stored).
						result.updated++;
					}
				}
				break;
			case "delete":
				{
					const deleted = await handleDelete(config, change, manifest);
					if (deleted) {
						result.deleted++;
					}
				}
				break;
		}
		result.processed++;
	}

	// Write manifest back
	writeManifest(config.manifestPath, manifest);

	return result;
}

/**
 * Handle a new path in knowledge/ — a directory (materialises its own item,
 * D4) or a file (a move, if its filename suffix matches an already-tracked
 * path, or a genuinely new item otherwise).
 */
async function handleCreate(
	config: WritebackConfig,
	change: WritebackChange,
	manifest: Manifest,
): Promise<"created" | "moved"> {
	const relativePath = change.relativePath;

	if (fs.existsSync(change.fullPath) && fs.statSync(change.fullPath).isDirectory()) {
		await ensureDirectoryChainItem(config, relativePath, manifest);
		return "created";
	}

	// Move detection (architecture §5): a creation whose filename carries the
	// same id suffix as an already-tracked path IS that item, moved.
	const suffixMatch = findManifestEntryBySuffix(manifest, relativePath);
	if (suffixMatch) {
		const parentDir = path.dirname(relativePath);
		const parent = await ensureDirectoryChainItem(config, parentDir, manifest);
		// @lore nested-knowledge-items defect 2: a move to the bare `knowledge/`
		// root (no wrapping directory, `parent === null`) reparents to
		// `null, null` — a detach to the top level — instead of the move
		// silently not happening.
		await config.knowledge.reparentKnowledgeItem(config.db, suffixMatch.itemId, {
			parentKind: parent ? "document" : null,
			parentId: parent ? parent.id : null,
			updatedBy: `session:${config.sessionId}`,
		});
		manifest.items[suffixMatch.itemId] = {
			...suffixMatch.entry,
			source_path: relativePath,
			scopeKind: parent?.scopeKind ?? suffixMatch.entry.scopeKind,
		};
		return "moved";
	}

	const body = fs.readFileSync(change.fullPath, "utf-8");
	const title = titleFromFilename(change.relativePath);
	const parentDir = path.dirname(relativePath);
	const parent = await ensureDirectoryChainItem(config, parentDir, manifest);
	const scopeKind = parent?.scopeKind ?? "factory";

	const item = await config.knowledge.create(config.db, {
		title,
		body,
		format: "markdown",
		status: "proposed",
		updatedBy: `session:${config.sessionId}`,
		// Directory placement (D4) wins when a wrapping directory exists;
		// `config.parent` (session task/thread) is the fallback for a leaf
		// sitting directly at the `knowledge/` root — the two never both apply.
		...(parent
			? { scopeKind, parentKind: "document" as const, parentId: parent.id }
			: config.parent
				? { parent: config.parent }
				: {}),
	});

	// Add to manifest
	manifest.items[item.id] = {
		version: item.version,
		source_path: change.relativePath,
		format: item.format,
		scopeKind,
	};
	return "created";
}

/**
 * Handle a modified file in knowledge/. Returns outcome type.
 *
 * @lore document-module B0c: a stale write (the manifest's version no longer
 * matches the document's) is refused, not recorded as a conflict — a
 * document has no conflict object (founder ruling). The agent's text is
 * discarded, and the manifest advances to the server's `currentVersion` (the
 * value `update()` already returns on a clash) so the next save from this
 * session carries the fresh version instead of clashing again.
 */
async function handleModify(
	config: WritebackConfig,
	change: WritebackChange,
	manifest: Manifest,
): Promise<"updated" | "created" | "stale"> {
	const existing = findItemByPath(manifest, change.relativePath);

	if (!existing) {
		// File exists on disk but not in manifest — treat as create
		await handleCreate(config, change, manifest);
		return "created";
	}

	const body = fs.readFileSync(change.fullPath, "utf-8");

	const updateResult = await config.knowledge.update(
		config.db,
		existing.itemId,
		{
			body,
			updatedBy: `session:${config.sessionId}`,
		},
		existing.entry.version,
	);

	if (updateResult.ok) {
		// Update manifest version
		// @lore AF3 C3: existing.itemId was resolved from this manifest so the entry
		// is guaranteed present; use a local ref to avoid repeated index access.
		const manifestEntry = manifest.items[existing.itemId];
		if (manifestEntry !== undefined) {
			manifestEntry.version = updateResult.item.version;
		}
		return "updated";
	}

	// Stale version — discard the agent's edit (never applied) and advance the
	// manifest to the durable version so the next save from this session wins.
	const staleEntry = manifest.items[existing.itemId];
	if (staleEntry !== undefined) {
		staleEntry.version = updateResult.currentVersion;
	}

	return "stale";
}

/**
 * Handle a deleted file. A file removed from a sandbox is not a document
 * deletion — the manifest simply stops tracking it, and nothing is written
 * to the document itself. Returns true if a tracked entry was dropped.
 */
async function handleDelete(
	_config: WritebackConfig,
	change: WritebackChange,
	manifest: Manifest,
): Promise<boolean> {
	const existing = findItemByPath(manifest, change.relativePath);

	if (!existing) {
		// Not tracked (or already retargeted elsewhere by a move processed
		// earlier in this same batch) — nothing to do.
		return false;
	}

	// Remove from manifest (file is gone); the document row is untouched.
	delete manifest.items[existing.itemId];

	return true;
}

/** Handle session notes update. */
async function handleSessionNotes(config: WritebackConfig, change: WritebackChange): Promise<void> {
	const body = fs.readFileSync(change.fullPath, "utf-8");

	await config.db.update(sessions).set({ notes: body }).where(eq(sessions.id, config.sessionId));
}

// ---- writeback-subscriber ----
interface CaptureWritebackSubscriberDeps {
	readonly db: WritebackConfig["db"];
	readonly eventBus: EventBus;
	readonly knowledge: WritebackConfig["knowledge"];
}

/**
 * Register the capture-writeback subscriber on the event bus.
 *
 * Listens for `sandbox_writeback_changes_detected` and fires
 * `processWriteback` for the batch. Returns a dispose function to
 * unsubscribe (for server shutdown).
 */
/**
 * What a session is working on, which is what everything it writes back hangs
 * off. A task session parents to its task; a conversation session parents to
 * the thread it is answering in. A routine or knowledge run has neither and
 * writes parentless items.
 *
 * Read from the session row rather than threaded through the watcher event:
 * this is not an inference about where a file happened to land, it is the
 * session's own identity, and `sessions` is this package's own table.
 */
async function resolveSessionParent(
	db: WritebackConfig["db"],
	sessionId: string,
): Promise<WritebackConfig["parent"]> {
	// Total by construction: not knowing where a session sits must never stop
	// the writeback itself. An unresolvable parent writes a parentless item —
	// the content is what matters, and a parentless item can be reparented
	// later. Throwing here would discard the agent's work instead.
	try {
		const [row] = await db
			.select({ taskId: sessions.taskId, correlation: sessions.sourceCorrelationJson })
			.from(sessions)
			.where(eq(sessions.id, sessionId))
			.limit(1);
		if (row === undefined) return undefined;
		if (row.taskId !== null && row.taskId !== "") return { kind: "task", id: row.taskId };
		if (row.correlation === null) return undefined;
		const parsed = JSON.parse(row.correlation) as { readonly threadId?: unknown };
		return typeof parsed.threadId === "string" && parsed.threadId.length > 0
			? { kind: "thread", id: parsed.threadId }
			: undefined;
	} catch {
		return undefined;
	}
}

function registerCaptureWriteback(deps: CaptureWritebackSubscriberDeps): () => void {
	const { db, eventBus, knowledge } = deps;

	const dispose = eventBus.on("sandbox_writeback_changes_detected", (event) => {
		// Fire-and-forget, matching file-watcher.ts's pre-inversion behavior
		// (that flush() was never awaited by its own caller either).
		void resolveSessionParent(db, event.sessionId)
			.then((parent) =>
				processWriteback(
					{
						db,
						sandboxPath: event.sandboxPath,
						sessionId: event.sessionId,
						manifestPath: event.manifestPath,
						knowledge,
						...(parent ? { parent } : {}),
					},
					[...event.changes],
				),
			)
			.catch((err: unknown) => {
				if (err !== null && typeof err === "object" && "code" in err && err.code === "ENOENT") {
					// Sandbox removed before processing (test cleanup, session end with
					// sandbox reaper) — no-op, matches prior file-watcher suppression.
					return;
				}
				// Re-throw non-ENOENT errors as unhandled rejections, matching prior behavior.
				throw err;
			});
	});

	return dispose;
}

interface WritebackProcessor {
	process(config: WritebackConfig, changes: WritebackChange[]): Promise<WritebackResult>;
	subscribe(deps: CaptureWritebackSubscriberDeps): () => void;
}

export function createWritebackProcessor(): WritebackProcessor {
	return { process: processWriteback, subscribe: registerCaptureWriteback };
}
