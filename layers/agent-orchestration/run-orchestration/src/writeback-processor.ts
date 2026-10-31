/** Consolidated private capture/writeback stage. */
import * as fs from "node:fs";
import * as path from "node:path";
import { type HyperIdleDb, sessions } from "@hyperidle/db";
import { createLogger } from "@hyperidle/diagnostics";
import {
	type ActionResult,
	type DocumentRow,
	type DocumentView,
	type EditDocumentInput,
	SCOPE_KINDS,
	type ScopeKind,
	type SearchDocumentsInput,
} from "@hyperidle/domain-model";
import type { EventBus } from "@hyperidle/event-bus";
import { eq } from "drizzle-orm";
import type { Manifest, ManifestEntry } from "./manifest-types.js";

const logger = createLogger({ pkg: "run-orchestration.writeback" });

// ---- capture-writeback-ports ----
// ---------------------------------------------------------------------------
// document — CaptureWritebackDocumentPort, bound to core's composed
// `edit_document`/`search_documents` actions.
// ---------------------------------------------------------------------------

/** Identity for writeback attribution. `actor` is the session's real agent id (a `users.id` FK — nothing else satisfies it). */
interface CaptureWritebackCaller {
	readonly actor: string;
	readonly sessionId: string;
	readonly taskId: string | null;
	readonly threadId: string | null;
}

/**
 * Port for the document surface: `{ editDocument, searchDocuments }` bound from core, never `open_document`
 * (writeback re-read is not a person reading — gives miscount). Stale writes are refused (code "stale") and discarded;
 * a document has no conflict object, so discard is the only path. `run-orchestration` may not import `core-api`.
 */
interface CaptureWritebackDocumentPort {
	editDocument(
		caller: CaptureWritebackCaller,
		input: EditDocumentInput,
	): Promise<ActionResult<DocumentView>>;
	searchDocuments(
		caller: { readonly actor: string },
		input: SearchDocumentsInput,
	): Promise<ActionResult<readonly DocumentRow[]>>;
}

// ---------------------------------------------------------------------------
// context-assembly — Manifest/ManifestEntry
// ---------------------------------------------------------------------------

// ---- writeback ----
interface WritebackConfig {
	db: HyperIdleDb;
	sandboxPath: string;
	sessionId: string;
	manifestPath: string;
	document: CaptureWritebackDocumentPort;
	/**
	 * The session's real agent id — a real `users.id`, since it becomes
	 * `ctx.actor` for every `edit_document` call this batch makes, and
	 * `changes.actor` is an FK to `users.id`. A direct `process()` call
	 * (tests, the pre-resolved event path) supplies it; nothing here
	 * fabricates one.
	 */
	actor: string;
	/**
	 * What this session is working on, if anything — the parent every item it
	 * writes back hangs off. A task session parents to its task; a conversation
	 * session parents to its thread. A session with neither (a subscription, a
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

function readManifest(manifestPath: string): Manifest {
	const raw = fs.readFileSync(manifestPath, "utf-8");
	return JSON.parse(raw) as Manifest;
}

function writeManifest(manifestPath: string, manifest: Manifest): void {
	fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
}

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

function isKnowledgePath(relativePath: string): boolean {
	return relativePath.startsWith("knowledge/");
}

function isSessionNotesPath(relativePath: string): boolean {
	return relativePath === "work/session-notes.md" || relativePath === "work/task-notes.md";
}

function titleFromFilename(filename: string): string {
	const base = path.basename(filename, path.extname(filename));
	return base.replace(/[_-]/g, " ");
}

/**
 * The `_${id.slice(0,8)}` suffix `toFilename` (context.ts) puts on every
 * materialised path — the one thing making a path unique, and what
 * makes a move self-identifying. Matched against the FILENAME two paths
 * carry, not against any real database id: the suffix is a stable token a
 * rename preserves, decoupled from whichever id a fresh `create()` call
 * happens to assign.
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
 * A manifest-cached `scopeKind` is always a real `ScopeKind` — every value in
 * the manifest came from a `documents.scope_kind` row `edit_document` itself
 * wrote (`SCOPE_KINDS`-constrained at the schema). `ManifestEntry`
 * declares it `string` (an untyped JSON cache), so this is a boundary
 * assertion, not a real fallback — a mismatch means the manifest was hand-
 * edited or corrupted, and that is worth throwing over, not silently
 * defaulting to "factory".
 */
function asScopeKind(value: string): ScopeKind {
	const found = (SCOPE_KINDS as readonly string[]).find((k) => k === value);
	if (!found) throw new Error(`writeback: manifest scopeKind "${value}" is not a real ScopeKind`);
	return found as ScopeKind;
}

/** A failed `editDocument` call whose refusal the caller did not expect — never silently swallowed. */
function refusalError(
	action: string,
	relativePath: string,
	result: { problems: readonly { message: string }[] },
): Error {
	return new Error(
		`writeback: ${action} "${relativePath}" refused: ${result.problems.map((p) => p.message).join("; ")}`,
	);
}

/** A parent document's identity plus its REAL current scope — id, scopeKind and scopeId travel together, because a "team"/"user" scopeKind is meaningless without the id beside it. */
interface DirectoryParent {
	readonly id: string;
	readonly scopeKind: string;
	readonly scopeId: string | null;
}

/**
 * Ensure every directory from `knowledge/` down to `dirRelativePath` has a
 * document (a folder is a document), creating any that are
 * missing, and return the immediate parent's document id + its REAL stored
 * scope (`null` at the `knowledge/` root itself).
 *
 * @lore: scope resolution — re-read REAL row (searchDocuments, not open_document); ManifestEntry caches only scopeKind, not scopeId; id required for scope
 */
async function ensureDirectoryChainItem(
	config: WritebackConfig,
	caller: CaptureWritebackCaller,
	dirRelativePath: string,
	manifest: Manifest,
): Promise<DirectoryParent | null> {
	if (dirRelativePath === "knowledge" || dirRelativePath === "." || dirRelativePath === "") {
		return null;
	}

	const existing = findItemByPath(manifest, dirRelativePath);
	if (existing) {
		const reread = await config.document.searchDocuments(
			{ actor: caller.actor },
			{ ids: [existing.itemId] },
		);
		const row = reread.ok ? reread.data[0] : undefined;
		if (!row) {
			throw new Error(
				`writeback: directory item for "${dirRelativePath}" (${existing.itemId}) no longer exists`,
			);
		}
		return { id: existing.itemId, scopeKind: row.scopeKind, scopeId: row.scopeId };
	}

	const parentDir = path.dirname(dirRelativePath);
	const parent = await ensureDirectoryChainItem(config, caller, parentDir, manifest);

	const result = await config.document.editDocument(caller, {
		// A directory's title is its plain name, unlike a file's — a folder
		// called "team-rituals" is still called "team-rituals" (no
		// underscore/hyphen-to-space normalization; that only makes sense for
		// a filename that also carries an extension and an id suffix).
		title: path.basename(dirRelativePath),
		body: "",
		format: "markdown",
		status: "proposed",
		as: "document",
		...(parent
			? {
					scopeKind: asScopeKind(parent.scopeKind),
					scopeId: parent.scopeId,
					parent: { kind: "document" as const, id: parent.id },
				}
			: {}),
	});
	if (!result.ok) throw refusalError("create directory", dirRelativePath, result);

	const created = result.data.document;
	manifest.items[created.id] = {
		version: created.version,
		source_path: dirRelativePath,
		format: created.format,
		scopeKind: created.scopeKind,
	};
	return { id: created.id, scopeKind: created.scopeKind, scopeId: created.scopeId };
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
	const caller: CaptureWritebackCaller = {
		actor: config.actor,
		sessionId: config.sessionId,
		taskId: config.parent?.kind === "task" ? config.parent.id : null,
		threadId: config.parent?.kind === "thread" ? config.parent.id : null,
	};

	// @lore: create-before-delete ordering — a rename creates a new entry before deleting the old; processing creates first prevents double-removing the entry
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

		// Only knowledge/ files/directories create/update documents
		if (!isKnowledgePath(relativePath)) {
			result.processed++;
			continue;
		}

		switch (change.type) {
			case "create":
				{
					const outcome = await handleCreate(config, caller, change, manifest);
					if (outcome === "moved") {
						result.updated++;
					} else {
						result.created++;
					}
				}
				break;
			case "modify":
				{
					const modifyResult = await handleModify(config, caller, change, manifest);
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
					const deleted = handleDelete(config, change, manifest);
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
 * Handle a new path in knowledge/ — a directory (materialises its own item)
 * or a file (a move, if its filename suffix matches an already-tracked
 * path, or a genuinely new item otherwise).
 */
async function handleCreate(
	config: WritebackConfig,
	caller: CaptureWritebackCaller,
	change: WritebackChange,
	manifest: Manifest,
): Promise<"created" | "moved"> {
	const relativePath = change.relativePath;

	if (fs.existsSync(change.fullPath) && fs.statSync(change.fullPath).isDirectory()) {
		await ensureDirectoryChainItem(config, caller, relativePath, manifest);
		return "created";
	}

	// Move detection: a creation whose filename carries the
	// same id suffix as an already-tracked path IS that item, moved.
	const suffixMatch = findManifestEntryBySuffix(manifest, relativePath);
	if (suffixMatch) {
		const parentDir = path.dirname(relativePath);
		const parent = await ensureDirectoryChainItem(config, caller, parentDir, manifest);
		// A move to the bare knowledge/ root (parent === null) is valid — null moves to tree top.
		const result = await config.document.editDocument(caller, {
			id: suffixMatch.itemId,
			parent: parent ? { kind: "document", id: parent.id } : null,
		});
		if (!result.ok) throw refusalError("move", relativePath, result);
		const moved = result.data.document;
		manifest.items[suffixMatch.itemId] = {
			...suffixMatch.entry,
			source_path: relativePath,
			version: moved.version,
			scopeKind: moved.scopeKind,
		};
		return "moved";
	}

	const body = fs.readFileSync(change.fullPath, "utf-8");
	const title = titleFromFilename(change.relativePath);
	const parentDir = path.dirname(relativePath);
	const parent = await ensureDirectoryChainItem(config, caller, parentDir, manifest);

	const result = await config.document.editDocument(caller, {
		title,
		body,
		format: path.extname(relativePath) === ".html" ? "html" : "markdown",
		status: "proposed",
		as: "document",
		// Directory placement wins when a wrapping directory exists — its
		// own real scope rides along, never a hardcoded default. `config.parent`
		// (session task/thread) is the fallback for a leaf sitting directly at
		// the `knowledge/` root; the two never both apply. Neither present
		// means no `scopeKind`/`parent` at all — the harness decides,
		// exactly as it would for any other agent-authored create.
		...(parent
			? {
					scopeKind: asScopeKind(parent.scopeKind),
					scopeId: parent.scopeId,
					parent: { kind: "document" as const, id: parent.id },
				}
			: config.parent
				? { parent: config.parent }
				: {}),
	});
	if (!result.ok) throw refusalError("create", relativePath, result);

	const item = result.data.document;
	manifest.items[item.id] = {
		version: item.version,
		source_path: change.relativePath,
		format: item.format,
		scopeKind: item.scopeKind,
	};
	return "created";
}

async function handleModify(
	config: WritebackConfig,
	caller: CaptureWritebackCaller,
	change: WritebackChange,
	manifest: Manifest,
): Promise<"updated" | "created" | "stale"> {
	const existing = findItemByPath(manifest, change.relativePath);

	if (!existing) {
		// File exists on disk but not in manifest — treat as create
		await handleCreate(config, caller, change, manifest);
		return "created";
	}

	const body = fs.readFileSync(change.fullPath, "utf-8");
	const manifestVersion = existing.entry.version;

	const result = await config.document.editDocument(caller, {
		id: existing.itemId,
		body,
		version: manifestVersion,
	});

	if (result.ok) {
		const manifestEntry = manifest.items[existing.itemId];
		if (manifestEntry !== undefined) {
			manifestEntry.version = result.data.document.version;
		}
		return "updated";
	}

	if (result.problems[0]?.code !== "stale")
		throw refusalError("update", change.relativePath, result);

	// Stale version — discard the agent's edit (never applied) and advance the
	// manifest to the durable version so the next save from this session wins.
	const reread = await config.document.searchDocuments(
		{ actor: caller.actor },
		{ ids: [existing.itemId] },
	);
	const durableVersion = reread.ok ? reread.data[0]?.version : undefined;
	const staleEntry = manifest.items[existing.itemId];
	if (staleEntry !== undefined && durableVersion !== undefined) {
		staleEntry.version = durableVersion;
	}
	logger.warn("writeback: stale edit discarded, manifest advanced to the durable version", {
		sessionId: config.sessionId,
		documentId: existing.itemId,
		manifestVersion,
		durableVersion,
	});

	return "stale";
}

/**
 * Handle a deleted file. A file removed from a sandbox is not a document
 * deletion — the manifest simply stops tracking it, and nothing is written
 * to the document itself. Returns true if a tracked entry was dropped.
 */
function handleDelete(
	_config: WritebackConfig,
	change: WritebackChange,
	manifest: Manifest,
): boolean {
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

async function handleSessionNotes(config: WritebackConfig, change: WritebackChange): Promise<void> {
	const body = fs.readFileSync(change.fullPath, "utf-8");

	await config.db.update(sessions).set({ notes: body }).where(eq(sessions.id, config.sessionId));
}

// ---- writeback-subscriber ----
interface CaptureWritebackSubscriberDeps {
	readonly db: WritebackConfig["db"];
	readonly eventBus: EventBus;
	readonly document: WritebackConfig["document"];
}

/**
 * Resolve the session's context for writeback: the parent (task/thread) and actor (agentId).
 * @lore: missing actor — no fallback string satisfies the users.id FK; whole batch is skipped; missing parent alone is not fatal
 */
async function resolveSessionContext(
	db: WritebackConfig["db"],
	sessionId: string,
): Promise<{ readonly actor: string; readonly parent: WritebackConfig["parent"] } | undefined> {
	try {
		const [row] = await db
			.select({
				agentId: sessions.agentId,
				taskId: sessions.taskId,
				correlation: sessions.sourceCorrelationJson,
			})
			.from(sessions)
			.where(eq(sessions.id, sessionId))
			.limit(1);
		if (row === undefined) return undefined;
		let parent: WritebackConfig["parent"];
		if (row.taskId !== null && row.taskId !== "") {
			parent = { kind: "task", id: row.taskId };
		} else if (row.correlation !== null) {
			const parsed = JSON.parse(row.correlation) as { readonly threadId?: unknown };
			if (typeof parsed.threadId === "string" && parsed.threadId.length > 0) {
				parent = { kind: "thread", id: parsed.threadId };
			}
		}
		return { actor: row.agentId, parent };
	} catch {
		return undefined;
	}
}

function registerCaptureWriteback(deps: CaptureWritebackSubscriberDeps): () => void {
	const { db, eventBus, document } = deps;

	const dispose = eventBus.on("sandbox_writeback_changes_detected", (event) => {
		// Fire-and-forget (flush() is never awaited by its caller).
		void resolveSessionContext(db, event.sessionId)
			.then((context) => {
				if (!context) {
					logger.warn("writeback: no resolvable session actor — skipping batch", {
						sessionId: event.sessionId,
					});
					return undefined;
				}
				return processWriteback(
					{
						db,
						sandboxPath: event.sandboxPath,
						sessionId: event.sessionId,
						manifestPath: event.manifestPath,
						document,
						actor: context.actor,
						...(context.parent ? { parent: context.parent } : {}),
					},
					[...event.changes],
				);
			})
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
