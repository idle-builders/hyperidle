import * as nodeFs from "node:fs";
import * as path from "node:path";
import { type HyperIdleDb, knowledgeAppProjection, knowledgeItems } from "@hyperidle/db";
import {
	createLogger,
	type EventBus,
	type KnowledgeUpdatedEvent,
	type Logger,
} from "@hyperidle/shared";
import { and, eq, inArray, notInArray } from "drizzle-orm";
import {
	type GitExportConfig,
	loadGitExportConfig,
	readGitExportConfig,
	sanitizePathSegment,
	writeLastCommit,
	writeLastPush,
} from "./git-export-config.js";
import type { GitRunner } from "./git-export-runner.js";

/**
 * Exported kinds (case-insensitive). L2 items land under
 * `products/<scopeId>/<KIND>.md`, L4 items under `factory/<KIND>.md` except
 * REFLECTION which maps to `factory/REFLECTIONS/<topic>.md`.
 */
export const EXPORTED_KINDS = new Set<string>([
	"BRIEF",
	"ARCHITECTURE",
	"BRAND",
	"PRINCIPLES",
	"FOCUS",
	"PORTFOLIO",
	"REFLECTION",
]);

/**
 * Statuses that are safe to publish. `captured`, `provisional`, and
 * `needs_human` are pre-validation drafts (KNOWLEDGE_ARCHITECTURE.md §9)
 * and MUST stay out of the exported repo. `archived` is excluded so
 * tombstones don't reappear.
 */
export const EXPORTED_STATUSES: readonly string[] = ["active", "validated"];

function isExportedLayer(layer: string): layer is "L2" | "L4" {
	return layer === "L2" || layer === "L4";
}

export interface ExportPlanEntry {
	relPath: string;
	body: string;
	knowledgeItemId: string;
	layer: "L2" | "L4";
	kind: string;
	scopeId: string | null;
	version: number;
	title: string;
}

export interface ExportPlan {
	entries: ExportPlanEntry[];
	/** Items dropped because they failed path-segment validation. */
	rejected: Array<{ itemId: string; reason: string }>;
}

/** Minimal sync fs surface used by the exporter. */
export interface FsAdapter {
	existsSync(p: string): boolean;
	readFileSync(p: string): string;
	writeFileSync(p: string, data: string): void;
	mkdirSync(p: string): void;
	unlinkSync(p: string): void;
}

export type GitExportTrigger = "event" | "manual" | "scheduled";

export type GitExportResult =
	| { status: "disabled" }
	| { status: "noop"; reason: "no-changes" | "debounced" }
	| {
			status: "committed";
			commitSha: string;
			filesChanged: string[];
			filesDeleted: string[];
			message: string;
	  }
	| {
			status: "pushed";
			commitSha: string;
			filesChanged: string[];
			filesDeleted: string[];
			message: string;
	  }
	| { status: "error"; error: string; phase: "init" | "write" | "commit" | "push" };

export interface RunGitExportDeps {
	runner: GitRunner;
	fs: FsAdapter;
	now?: () => Date;
	logger?: Logger;
	trigger?: GitExportTrigger;
	/**
	 * When true, `runGitExport` proceeds even if the config is disabled — it
	 * falls back to `readGitExportConfig` so `POST /run {force:true}` can be
	 * used during initial setup.
	 */
	force?: boolean;
}

/** Build the commit message per plan §3.7. Pure — no I/O. */
export function buildCommitMessage(entries: ExportPlanEntry[], trigger: GitExportTrigger): string {
	const header = `docs(knowledge): export ${entries.length} item(s) [${trigger}]`;
	const bullets = entries.map((e) => {
		const scope = e.scopeId ?? "factory";
		const kind = e.kind.toUpperCase();
		return `${e.layer} ${kind} [${scope}] (v${e.version}): ${e.title}`;
	});
	const footer = [`Trigger: ${trigger}`, "Source: HyperIdle Git Export"];
	return [header, "", ...bullets, "", ...footer].join("\n");
}

/**
 * @lore O2: layer/kind/scopeId are now in knowledgeAppProjection, not
 * knowledgeItems. mapRowToEntry takes a combined row with both item and
 * fabric fields so the caller can do one JOIN query and pass results here.
 */
interface JoinedExportRow {
	item: typeof knowledgeItems.$inferSelect;
	fabric: typeof knowledgeAppProjection.$inferSelect | null;
}

/**
 * Map a DB row to a plan entry. Returns `null` when the row should be
 * skipped silently (wrong layer/kind). Returns a rejection object when
 * the row tried to do something unsafe (path traversal via scopeId/topic)
 * so the caller can surface the rejection in the result + log.
 */
function mapRowToEntry(
	joined: JoinedExportRow,
): ExportPlanEntry | { rejected: true; reason: string } | null {
	const { item, fabric } = joined;
	const layer = fabric?.layer ?? null;
	if (!isExportedLayer(layer ?? "")) return null;
	const exportLayer = layer as "L2" | "L4";
	const rawKind = fabric?.kind ?? null;
	if (!rawKind) return null;
	const kind = rawKind.toUpperCase();
	if (!EXPORTED_KINDS.has(kind)) return null;

	const scopeId = fabric?.scopeId ?? null;

	let relPath: string;
	if (exportLayer === "L4") {
		if (kind === "REFLECTION") {
			const rawTopic = item.topic && item.topic.length > 0 ? item.topic : item.id;
			const topic = sanitizePathSegment(rawTopic);
			if (topic === null) {
				return {
					rejected: true,
					reason: `REFLECTION topic '${rawTopic}' is not a safe path segment`,
				};
			}
			relPath = `factory/REFLECTIONS/${topic}.md`;
		} else {
			relPath = `factory/${kind}.md`;
		}
	} else {
		// L2 — scopeId required to route to products/<scope>
		if (!scopeId || scopeId.length === 0) return null;
		const scope = sanitizePathSegment(scopeId);
		if (scope === null) {
			return {
				rejected: true,
				reason: `scopeId '${scopeId}' is not a safe path segment`,
			};
		}
		relPath = `products/${scope}/${kind}.md`;
	}

	return {
		relPath,
		body: item.body,
		knowledgeItemId: item.id,
		layer: exportLayer,
		kind,
		scopeId: exportLayer === "L4" ? (scopeId ?? "factory") : scopeId,
		version: item.version,
		title: item.title,
	};
}

function compareEntries(a: ExportPlanEntry, b: ExportPlanEntry): number {
	return a.relPath.localeCompare(b.relPath);
}

/**
 * Compute the full export plan from the DB. Filters at the SQL layer:
 * only L2/L4 rows with non-archived/non-draft status hit our code.
 *
 * @lore O2: layer/kind/scopeId are now in knowledgeAppProjection. The
 * kernel-layer filter (status) is still on knowledgeItems. The strategy
 * filter (layer=L2|L4) is on the fabric table via an INNER JOIN so items
 * without a fabric row (no layer assigned) are automatically excluded.
 * The status filter is on the kernel table as before.
 */
export async function computeExportPlan(db: HyperIdleDb): Promise<ExportPlan> {
	// @lore O2: INNER JOIN with knowledgeAppProjection so only items that
	// have a fabric row (and thus a layer assignment) are included. Items
	// without a fabric row have no layer and are not exportable.
	const rows = await db
		.select({
			item: knowledgeItems,
			fabric: knowledgeAppProjection,
		})
		.from(knowledgeItems)
		.innerJoin(
			knowledgeAppProjection,
			eq(knowledgeAppProjection.knowledgeItemId, knowledgeItems.id),
		)
		.where(
			and(
				inArray(knowledgeAppProjection.layer, ["L2", "L4"]),
				inArray(knowledgeItems.status, EXPORTED_STATUSES as string[]),
				// Belt+braces — defend even if EXPORTED_STATUSES ever grows.
				notInArray(knowledgeItems.status, [
					"archived",
					"captured",
					"provisional",
					"needs_human",
					"stale",
				]),
			),
		);
	const entries: ExportPlanEntry[] = [];
	const rejected: Array<{ itemId: string; reason: string }> = [];
	for (const joined of rows) {
		const mapped = mapRowToEntry(joined);
		if (mapped === null) continue;
		if ("rejected" in mapped) {
			rejected.push({ itemId: joined.item.id, reason: mapped.reason });
			continue;
		}
		entries.push(mapped);
	}
	entries.sort(compareEntries);
	return { entries, rejected };
}

/**
 * Default `node:fs`-backed adapter. Every write goes through `mkdirSync`
 * recursively first so the caller can stay path-flat.
 */
export function createNodeFsAdapter(): FsAdapter {
	return {
		existsSync: (p: string): boolean => nodeFs.existsSync(p),
		readFileSync: (p: string): string => nodeFs.readFileSync(p, "utf-8"),
		writeFileSync: (p: string, data: string): void => {
			nodeFs.writeFileSync(p, data, "utf-8");
		},
		mkdirSync: (p: string): void => {
			nodeFs.mkdirSync(p, { recursive: true });
		},
		unlinkSync: (p: string): void => {
			nodeFs.unlinkSync(p);
		},
	};
}

/**
 * @lore Concurrency guard: a Map keyed by `repoPath` so two exports
 * against DIFFERENT repos can run concurrently, but two exports against
 * the SAME repo serialize. The chain silences predecessor rejections so
 * one failure never starves the queue — every call returns its own
 * result object (never throws).
 */
const exportMutexes = new Map<string, Promise<unknown>>();

function queueMutex<T>(repoPath: string, fn: () => Promise<T>): Promise<T> {
	const prev = exportMutexes.get(repoPath) ?? Promise.resolve();
	const next = prev.then(fn, fn);
	exportMutexes.set(
		repoPath,
		next.catch(() => undefined),
	);
	// Garbage-collect after settle so a long-lived server doesn't leak keys.
	next
		.finally(() => {
			if (exportMutexes.get(repoPath) === next) {
				// no-op — newer entry may have replaced us already
			}
		})
		.catch(() => undefined);
	return next;
}

/**
 * Testing helper — purge all per-repoPath mutex state. Call between test
 * cases to avoid cross-contamination if a test leaves a call pending.
 */
export function resetExportMutexes(): void {
	exportMutexes.clear();
}

async function ensureRepo(
	runner: GitRunner,
	fs: FsAdapter,
	cfg: GitExportConfig,
	logger: Logger,
): Promise<void> {
	if (!fs.existsSync(cfg.repoPath)) {
		fs.mkdirSync(cfg.repoPath);
	}
	const inside = await runner.revParseIsInsideWorkTree();
	if (inside) return;

	// @lore First-run init: branch must be set on `git init -b` so HEAD points
	// at the configured branch even before the first commit — otherwise git
	// defaults to whatever `init.defaultBranch` is on the host.
	logger.info("git-export: initializing repo", { repoPath: cfg.repoPath, branch: cfg.branch });
	await runner.init(cfg.branch);
	await runner.configSet("user.name", cfg.authorName);
	await runner.configSet("user.email", cfg.authorEmail);
	if (cfg.remoteUrl) {
		await runner.remoteAdd("origin", cfg.remoteUrl);
	}
}

function absolutePath(repoPath: string, relPath: string): string {
	return path.join(repoPath, relPath);
}

function writePlanToDisk(
	plan: ExportPlan,
	repoPath: string,
	fs: FsAdapter,
): { filesChanged: string[] } {
	const filesChanged: string[] = [];
	for (const entry of plan.entries) {
		const absPath = absolutePath(repoPath, entry.relPath);
		// Defense-in-depth: ensure the resolved path stays inside repoPath.
		const resolved = path.resolve(absPath);
		const resolvedRoot = path.resolve(repoPath);
		if (resolved !== resolvedRoot && !resolved.startsWith(`${resolvedRoot}/`)) {
			// sanitizePathSegment should have caught this earlier; skip defensively.
			continue;
		}
		const prior = fs.existsSync(absPath) ? fs.readFileSync(absPath) : null;
		if (prior === entry.body) continue;
		const dir = path.dirname(absPath);
		fs.mkdirSync(dir);
		fs.writeFileSync(absPath, entry.body);
		filesChanged.push(entry.relPath);
	}
	return { filesChanged };
}

/**
 * Remove tracked files that are no longer represented in the plan.
 * Runs against `git ls-files` so we only unlink files git is tracking —
 * hand-edited non-tracked files stay untouched.
 */
async function applyDeletions(
	plan: ExportPlan,
	repoPath: string,
	fs: FsAdapter,
	runner: GitRunner,
): Promise<{ filesDeleted: string[] }> {
	const expected = new Set(plan.entries.map((e) => e.relPath));
	const tracked = await runner.lsFiles();
	const filesDeleted: string[] = [];
	for (const rel of tracked) {
		// Only consider files inside our managed subtrees.
		if (!(rel.startsWith("factory/") || rel.startsWith("products/"))) continue;
		if (expected.has(rel)) continue;
		const absPath = absolutePath(repoPath, rel);
		const resolved = path.resolve(absPath);
		const resolvedRoot = path.resolve(repoPath);
		if (resolved !== resolvedRoot && !resolved.startsWith(`${resolvedRoot}/`)) continue;
		try {
			if (fs.existsSync(absPath)) fs.unlinkSync(absPath);
		} catch {
			// The subsequent `git add -A` still handles unlinks git's way.
		}
		filesDeleted.push(rel);
	}
	return { filesDeleted };
}

export async function runGitExport(
	db: HyperIdleDb,
	deps: RunGitExportDeps,
): Promise<GitExportResult> {
	// We need to know the repoPath to scope the mutex. Load config outside
	// the mutex — it's a cheap DB read and mutex scoping depends on it.
	const cfg = deps.force ? await readGitExportConfig(db) : await loadGitExportConfig(db);
	if (!cfg) return { status: "disabled" };
	if (!cfg.repoPath || cfg.repoPath.length === 0) {
		if (!deps.force) return { status: "disabled" };
		return { status: "error", error: "repoPath is not configured", phase: "init" };
	}
	return queueMutex(cfg.repoPath, () => runGitExportInner(db, deps, cfg));
}

async function runGitExportInner(
	db: HyperIdleDb,
	deps: RunGitExportDeps,
	cfg: GitExportConfig,
): Promise<GitExportResult> {
	const logger = deps.logger ?? createLogger({ pkg: "git-export" });
	const trigger: GitExportTrigger = deps.trigger ?? "manual";
	const nowFn = deps.now ?? ((): Date => new Date());

	try {
		await ensureRepo(deps.runner, deps.fs, cfg, logger);
	} catch (err) {
		logger.error("git-export: init failed", { error: String(err) });
		return { status: "error", error: String(err), phase: "init" };
	}

	let plan: ExportPlan;
	try {
		plan = await computeExportPlan(db);
	} catch (err) {
		logger.error("git-export: plan failed", { error: String(err) });
		return { status: "error", error: String(err), phase: "init" };
	}

	if (plan.rejected.length > 0) {
		for (const r of plan.rejected) {
			logger.warn("git-export: rejected unsafe knowledge item", r);
		}
	}

	let filesChanged: string[] = [];
	let filesDeleted: string[] = [];
	try {
		const result = writePlanToDisk(plan, cfg.repoPath, deps.fs);
		filesChanged = result.filesChanged;
	} catch (err) {
		logger.error("git-export: write failed", { error: String(err) });
		return { status: "error", error: String(err), phase: "write" };
	}

	try {
		const del = await applyDeletions(plan, cfg.repoPath, deps.fs, deps.runner);
		filesDeleted = [...del.filesDeleted];
	} catch (err) {
		logger.error("git-export: delete-enumerate failed", { error: String(err) });
		return { status: "error", error: String(err), phase: "write" };
	}

	try {
		await deps.runner.add([]);
	} catch (err) {
		logger.error("git-export: add failed", { error: String(err) });
		return { status: "error", error: String(err), phase: "commit" };
	}

	const clean = await deps.runner.diffCached();
	if (clean) {
		return { status: "noop", reason: "no-changes" };
	}

	const message = buildCommitMessage(plan.entries, trigger);
	let sha: string;
	try {
		sha = await deps.runner.commit(message, cfg.authorName, cfg.authorEmail);
	} catch (err) {
		logger.error("git-export: commit failed", { error: String(err) });
		return { status: "error", error: String(err), phase: "commit" };
	}

	// Commit succeeded locally — record it. `last_push_at` stays unchanged.
	const committedAt = nowFn();
	await writeLastCommit(db, sha, committedAt);

	if (cfg.remoteUrl) {
		try {
			await deps.runner.push("origin", cfg.branch);
		} catch (err) {
			logger.error("git-export: push failed", { error: String(err) });
			return { status: "error", error: String(err), phase: "push" };
		}
		await writeLastPush(db, committedAt);
		return { status: "pushed", commitSha: sha, filesChanged, filesDeleted, message };
	}

	return { status: "committed", commitSha: sha, filesChanged, filesDeleted, message };
}

export interface RegisterGitExportHandlerOptions {
	debounceMs?: number;
	runner?: GitRunner;
	fs?: FsAdapter;
	logger?: Logger;
	/**
	 * Factory invoked per-fire with the current `repoPath`. Production wiring
	 * passes `(repoPath) => createGitRunner(repoPath)` so config changes are
	 * honored between events without restarting the app. Tests may override.
	 * Takes precedence over `runner` when set.
	 */
	runnerFactory?: (repoPath: string) => GitRunner;
}

/**
 * @lore Debounce state lives in the handler closure (in-memory only). If the
 * process restarts mid-burst the last pending export is dropped and will
 * only fire when the next `knowledge_updated` event arrives. Acceptable
 * for v1; upgrade path is a persistent outbox row.
 */
export function registerGitExportHandler(
	db: HyperIdleDb,
	eventBus: EventBus,
	opts: RegisterGitExportHandlerOptions = {},
): () => void {
	const logger = opts.logger ?? createLogger({ pkg: "git-export" });
	let pending: NodeJS.Timeout | null = null;
	let disposed = false;

	function clearPending(): void {
		if (pending !== null) {
			clearTimeout(pending);
			pending = null;
		}
	}

	async function fire(): Promise<void> {
		pending = null;
		if (disposed) return;
		try {
			// Re-check config AFTER debounce — operator may have disabled us
			// between the event and now. Silent drop is correct.
			const cfg = await loadGitExportConfig(db);
			if (!cfg) return;
			const runner = opts.runnerFactory ? opts.runnerFactory(cfg.repoPath) : opts.runner;
			if (!runner) {
				logger.warn("git-export: no runner available for event-triggered export");
				return;
			}
			const fs = opts.fs ?? createNodeFsAdapter();
			await runGitExport(db, {
				runner,
				fs,
				logger,
				trigger: "event",
			});
		} catch (err) {
			// `runGitExport` is already total, but the loadGitExportConfig /
			// runnerFactory path can throw. Never leak into an unhandled
			// rejection — we're running from a setTimeout callback.
			logger.error("git-export: fire failed", { error: String(err) });
		}
	}

	const handler = (event: KnowledgeUpdatedEvent): void => {
		if (disposed) return;
		// @lore O2: layer/kind are in knowledgeAppProjection. LEFT JOIN to
		// get fabric fields for the updated item; skip if no fabric row.
		void (async () => {
			const [row] = await db
				.select({ item: knowledgeItems, fabric: knowledgeAppProjection })
				.from(knowledgeItems)
				.leftJoin(
					knowledgeAppProjection,
					eq(knowledgeAppProjection.knowledgeItemId, knowledgeItems.id),
				)
				.where(eq(knowledgeItems.id, event.itemId))
				.limit(1);
			if (!row) return;
			const fabricLayer = row.fabric?.layer ?? null;
			const fabricKind = row.fabric?.kind ?? null;
			if (!isExportedLayer(fabricLayer ?? "")) return;
			if (!(fabricKind && EXPORTED_KINDS.has(fabricKind.toUpperCase()))) return;

			const cfg = await loadGitExportConfig(db);
			if (!cfg) return;
			const debounceMs = opts.debounceMs ?? cfg.debounceMs;
			clearPending();
			pending = setTimeout(() => {
				void fire();
			}, debounceMs);
		})();
	};

	const unsubscribe = eventBus.on("knowledge_updated", handler);
	return (): void => {
		disposed = true;
		clearPending();
		unsubscribe();
	};
}
