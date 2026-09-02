/** Consolidated private capture/writeback stage. */
import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { type HyperIdleDb, knowledgeEditLog, knowledgeItems, sessions } from "@hyperidle/db";
import type { EventBus } from "@hyperidle/event-bus";
import { eq } from "drizzle-orm";

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
	 * Where the produced item hangs: the session's task, or the conversation
	 * the agent is answering in. Set explicitly at creation — never inferred
	 * afterwards from where the file happened to sit.
	 */
	readonly parent?: { readonly kind: "task" | "thread"; readonly id: string };
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

interface CaptureWritebackRecordConflictInput {
	readonly itemId: string;
	readonly versionBase: number;
	readonly versionCurrent: number;
	readonly proposedBody: string;
	readonly proposedBy: string;
}

/** Port for `knowledge`'s create/update/conflict-record surface `writeback.ts` calls directly today. */
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
	recordConflict(db: HyperIdleDb, input: CaptureWritebackRecordConflictInput): Promise<void>;
}

// ---------------------------------------------------------------------------
// context-assembly — Manifest/ManifestEntry (pure-type structural mirror;
// see this file's top `@lore` for why this isn't a port method)
// ---------------------------------------------------------------------------

interface ManifestEntry {
	version: number;
	// biome-ignore lint/style/useNamingConvention: manifest JSON schema uses snake_case keys
	source_path: string;
	format: string;
}

interface Manifest {
	// biome-ignore lint/style/useNamingConvention: manifest JSON schema uses snake_case keys
	session_id: string;
	// biome-ignore lint/style/useNamingConvention: manifest JSON schema uses snake_case keys
	assembled_at: string;
	items: Record<string, ManifestEntry>;
}

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
	conflicts: number;
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
 * Read a knowledge item's current `parentKind`/`parentId`/`scopeKind` — the
 * three fields a move or a directory-scoped create needs, and which the
 * knowledge port's `create()`/`update()` surface (deliberately narrowed to
 * `{body, updatedBy}` — see this file's top `@lore`) does not carry.
 *
 * @lore nested-knowledge-items §5: this reads/writes `knowledgeItems`
 * directly via `config.db` rather than through the `knowledge` port. That is
 * a deliberate, narrow crossing of the "knowledge owns knowledge_items"
 * table boundary — the same one the real production port crosses over HTTP
 * (a request the writeback processor cannot originate on its own without
 * that hop) — recorded here rather than silently, since it is a discretionary
 * call, not an obligation the architecture spelled out by name.
 */
async function getItemLink(
	db: HyperIdleDb,
	itemId: string,
): Promise<{ readonly parentKind: string | null; readonly parentId: string | null; readonly scopeKind: string }> {
	const [row] = await db
		.select({
			parentKind: knowledgeItems.parentKind,
			parentId: knowledgeItems.parentId,
			scopeKind: knowledgeItems.scopeKind,
		})
		.from(knowledgeItems)
		.where(eq(knowledgeItems.id, itemId))
		.limit(1);
	return row ?? { parentKind: null, parentId: null, scopeKind: "factory" };
}

/** Set a knowledge item's parent link (+ scope, for a fresh directory/leaf create) and log the move. */
async function setItemLink(
	db: HyperIdleDb,
	sessionId: string,
	itemId: string,
	link: { readonly parentKind: "knowledge_item" | null; readonly parentId: string | null; readonly scopeKind?: string },
): Promise<void> {
	const before = await getItemLink(db, itemId);
	await db
		.update(knowledgeItems)
		.set({
			parentKind: link.parentKind,
			parentId: link.parentId,
			...(link.scopeKind ? { scopeKind: link.scopeKind } : {}),
			updatedAt: new Date().toISOString(),
		})
		.where(eq(knowledgeItems.id, itemId));

	if (before.parentId !== link.parentId || before.parentKind !== link.parentKind) {
		await db.insert(knowledgeEditLog).values({
			id: randomUUID(),
			itemId,
			editor: `session:${sessionId}`,
			field: "parent",
			oldValue: before.parentId ? `${before.parentKind}:${before.parentId}` : null,
			newValue: link.parentId ? `${link.parentKind}:${link.parentId}` : null,
			editType: "update",
			createdAt: new Date().toISOString(),
		});
	}
}

/**
 * Ensure every directory from `knowledge/` down to `dirRelativePath` has a
 * knowledge item (plan.md D4: "a folder is a knowledge item"), creating any
 * that are missing, and return the immediate parent's item id (`null` at the
 * `knowledge/` root itself).
 *
 * @lore nested-knowledge-items §5 D4: a created directory item inherits its
 * own parent's scope. Manifest entries double as the directory→item index —
 * a directory's `source_path` is its own relative path, so `findItemByPath`
 * already tells this function which directories already have an item.
 */
async function ensureDirectoryChainItem(
	config: WritebackConfig,
	dirRelativePath: string,
	manifest: Manifest,
): Promise<string | null> {
	if (dirRelativePath === "knowledge" || dirRelativePath === "." || dirRelativePath === "") {
		return null;
	}

	const existing = findItemByPath(manifest, dirRelativePath);
	if (existing) return existing.itemId;

	const parentDir = path.dirname(dirRelativePath);
	const parentItemId = await ensureDirectoryChainItem(config, parentDir, manifest);
	const parentScopeKind = parentItemId
		? (await getItemLink(config.db, parentItemId)).scopeKind
		: "factory";

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
	});
	await setItemLink(config.db, config.sessionId, created.id, {
		parentKind: parentItemId ? "knowledge_item" : null,
		parentId: parentItemId,
		scopeKind: parentScopeKind,
	});

	manifest.items[created.id] = {
		version: created.version,
		source_path: dirRelativePath,
		format: created.format,
	};
	return created.id;
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
		conflicts: 0,
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
					if (modifyResult === "conflict") {
						result.conflicts++;
						result.updated++;
					} else if (modifyResult === "created") {
						result.created++;
					} else {
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
		const parentItemId = await ensureDirectoryChainItem(config, parentDir, manifest);
		await setItemLink(config.db, config.sessionId, suffixMatch.itemId, {
			parentKind: parentItemId ? "knowledge_item" : null,
			parentId: parentItemId,
		});
		manifest.items[suffixMatch.itemId] = { ...suffixMatch.entry, source_path: relativePath };
		return "moved";
	}

	const body = fs.readFileSync(change.fullPath, "utf-8");
	const title = titleFromFilename(change.relativePath);
	const parentDir = path.dirname(relativePath);
	const parentItemId = await ensureDirectoryChainItem(config, parentDir, manifest);

	const item = await config.knowledge.create(config.db, {
		title,
		body,
		format: "markdown",
		status: "proposed",
		updatedBy: `session:${config.sessionId}`,
		...(config.parent ? { parent: config.parent } : {}),
	});

	if (parentItemId) {
		const parentScopeKind = (await getItemLink(config.db, parentItemId)).scopeKind;
		await setItemLink(config.db, config.sessionId, item.id, {
			parentKind: "knowledge_item",
			parentId: parentItemId,
			scopeKind: parentScopeKind,
		});
	}

	// Add to manifest
	manifest.items[item.id] = {
		version: item.version,
		source_path: change.relativePath,
		format: item.format,
	};
	return "created";
}

/** Handle a modified file in knowledge/. Returns outcome type. */
async function handleModify(
	config: WritebackConfig,
	change: WritebackChange,
	manifest: Manifest,
): Promise<"updated" | "created" | "conflict"> {
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

	// Version conflict — create a conflict record instead of overwriting.
	await config.knowledge.recordConflict(config.db, {
		itemId: existing.itemId,
		versionBase: existing.entry.version,
		versionCurrent: updateResult.currentVersion,
		proposedBody: body,
		proposedBy: `session:${config.sessionId}`,
	});

	// Update manifest to current version so subsequent writes don't keep conflicting
	const conflictEntry = manifest.items[existing.itemId];
	if (conflictEntry !== undefined) {
		conflictEntry.version = updateResult.currentVersion;
	}

	return "conflict";
}

/** Handle a deleted file — flag for facilitator review, don't auto-delete. Returns true if flagged. */
async function handleDelete(
	config: WritebackConfig,
	change: WritebackChange,
	manifest: Manifest,
): Promise<boolean> {
	const existing = findItemByPath(manifest, change.relativePath);

	if (!existing) {
		// Not tracked (or already retargeted elsewhere by a move processed
		// earlier in this same batch) — nothing to do.
		return false;
	}

	// Create a review item flagging the deletion for facilitator
	await config.knowledge.recordConflict(config.db, {
		itemId: existing.itemId,
		versionBase: existing.entry.version,
		versionCurrent: existing.entry.version,
		proposedBody: "[DELETED]",
		proposedBy: `session:${config.sessionId}`,
	});

	// Remove from manifest (file is gone)
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
