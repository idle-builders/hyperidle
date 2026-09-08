/** Consolidated private capture/writeback stage. */
import * as fs from "node:fs";
import * as path from "node:path";
import { type HyperIdleDb, sessions } from "@hyperidle/db";
import type { EventBus } from "@hyperidle/event-bus";
import { eq } from "drizzle-orm";

// ---- capture-writeback-ports ----
// ---------------------------------------------------------------------------
// knowledge — CaptureWritebackKnowledgeWriter (ordinary downward edge, real target)
// ---------------------------------------------------------------------------

type CaptureWritebackKnowledgeLayer = "L1" | "L2" | "L3";
type CaptureWritebackKnowledgeKind = "pattern" | "decision" | "failure" | "reflection";

interface CaptureWritebackCreateKnowledgeItemInput {
	readonly layer: CaptureWritebackKnowledgeLayer;
	readonly kind: CaptureWritebackKnowledgeKind;
	readonly title: string;
	readonly body: string;
	readonly format: string;
	/**
	 * `draft`, not `captured`. This path sent `captured` for its whole life and
	 * the route has never accepted that value — it validates status against its
	 * own four-value list — so every writeback create was rejected before it
	 * reached the database. `draft` is the same state under the name the route
	 * knows.
	 */
	readonly status: "draft";
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

	for (const change of changes) {
		const relativePath = change.relativePath;

		// Handle session notes specially
		if (isSessionNotesPath(relativePath) && change.type !== "delete") {
			await handleSessionNotes(config, change);
			result.processed++;
			result.updated++;
			continue;
		}

		// Only knowledge/ files create/update knowledge_items
		if (!isKnowledgePath(relativePath)) {
			result.processed++;
			continue;
		}

		switch (change.type) {
			case "create":
				await handleCreate(config, change, manifest);
				result.created++;
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

/** Handle a new file in knowledge/. */
async function handleCreate(
	config: WritebackConfig,
	change: WritebackChange,
	manifest: Manifest,
): Promise<void> {
	const body = fs.readFileSync(change.fullPath, "utf-8");
	const title = titleFromFilename(change.relativePath);

	// Determine kind from subdirectory
	const parts = change.relativePath.split("/");
	let kind: "pattern" | "decision" | "failure" | "reflection" = "pattern";
	if (parts.length > 1) {
		const subdir = parts[1];
		if (subdir === "decisions") kind = "decision";
		else if (subdir === "failures") kind = "failure";
		else if (subdir === "practices") kind = "pattern";
	}

	const item = await config.knowledge.create(config.db, {
		layer: "L1",
		kind,
		title,
		body,
		format: "markdown",
		status: "draft",
		updatedBy: `session:${config.sessionId}`,
		...(config.parent ? { parent: config.parent } : {}),
	});

	// Add to manifest
	manifest.items[item.id] = {
		version: item.version,
		source_path: change.relativePath,
		format: item.format,
	};
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
		return false; // Not tracked, nothing to do
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
