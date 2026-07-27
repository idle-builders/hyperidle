import { randomUUID } from "node:crypto";
import * as nodeFs from "node:fs";
import * as path from "node:path";
import type { HyperIdleDb } from "@hyperidle/db";
import {
	createLogger,
	type EventBus,
	type KnowledgeUpdatedEvent,
	type Logger,
} from "@hyperidle/shared";
import {
	type GitExportConfig,
	loadGitExportConfig,
	sanitizePathSegment,
	writeExportMeta,
} from "./git-export-config.js";
import type { GitRunner } from "./git-export-runner.js";
import type {
	GitExportDeps,
	GitExportKnowledgeItemRow,
	GitExportKnowledgeReader,
} from "./ports.js";

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

export interface RunGitExportDeps extends GitExportDeps {
	runner: GitRunner;
	/** Filesystem adapter. Defaults to the Node `fs` adapter when omitted. */
	fs?: {
		existsSync(p: string): boolean;
		readFileSync(p: string): string;
		writeFileSync(p: string, data: string): void;
		mkdirSync(p: string): void;
		unlinkSync(p: string): void;
		realpathSync?(p: string): string;
		renameSync?(from: string, to: string): void;
	};
	now?: () => Date;
	logger?: Logger;
	trigger?: "event" | "manual" | "scheduled";
	/**
	 * When true, `runGitExport` proceeds even if the config is disabled — it
	 * falls back to the raw config read so `POST /run {force:true}` can be
	 * used during initial setup.
	 */
	force?: boolean;
}

/** Build the commit message per plan §3.7. Pure — no I/O. */
export function buildCommitMessage(
	entries: Array<{
		layer: "L2" | "L4";
		kind: string;
		scopeId: string | null;
		version: number;
		title: string;
	}>,
	trigger: "event" | "manual" | "scheduled",
): string {
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
 * Map a knowledge-item row to a plan entry. Returns `null` when the row
 * should be skipped silently (wrong layer/kind). Returns a rejection object
 * when the row tried to do something unsafe (path traversal via
 * scopeId/topic) so the caller can surface the rejection in the result + log.
 */
function mapRowToEntry(row: GitExportKnowledgeItemRow) {
	const layer = row.layer;
	if (!isExportedLayer(layer ?? "")) return null;
	const exportLayer = layer as "L2" | "L4";
	const rawKind = row.kind;
	if (!rawKind) return null;
	const kind = rawKind.toUpperCase();
	if (!EXPORTED_KINDS.has(kind)) return null;

	const scopeId = row.scopeId;

	let relPath: string;
	if (exportLayer === "L4") {
		if (kind === "REFLECTION") {
			const rawTopic = row.topic && row.topic.length > 0 ? row.topic : row.id;
			const topic = sanitizePathSegment(rawTopic);
			if (topic === null) {
				return {
					rejected: true as const,
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
				rejected: true as const,
				reason: `scopeId '${scopeId}' is not a safe path segment`,
			};
		}
		relPath = `products/${scope}/${kind}.md`;
	}

	return {
		relPath,
		body: row.body,
		knowledgeItemId: row.id,
		layer: exportLayer,
		kind,
		scopeId: exportLayer === "L4" ? (scopeId ?? "factory") : scopeId,
		version: row.version,
		title: row.title,
	};
}

function compareEntries(a: { relPath: string }, b: { relPath: string }): number {
	return a.relPath.localeCompare(b.relPath);
}

/**
 * Compute the full export plan from the DB. Filters at the SQL layer (inside
 * `knowledge`'s `listExportableItems`): only L2/L4 rows with non-archived/
 * non-draft status reach `mapRowToEntry`.
 *
 * @lore AU19 Increment 2c: `knowledgeItems`/`knowledgeAppProjection` are
 * `knowledge`-owned tables — reached through the injected
 * `GitExportKnowledgeReader` port (`ports.ts`), not a direct query (Table ACL).
 */
export async function computeExportPlan(
	db: HyperIdleDb,
	deps: { readonly knowledge: GitExportKnowledgeReader },
) {
	const rows = await deps.knowledge.listExportableItems(db, {
		layers: ["L2", "L4"],
		statuses: EXPORTED_STATUSES,
	});
	const entries: Array<Exclude<NonNullable<ReturnType<typeof mapRowToEntry>>, { rejected: true }>> =
		[];
	const rejected: Array<{ itemId: string; reason: string }> = [];
	for (const row of rows) {
		const mapped = mapRowToEntry(row);
		if (mapped === null) continue;
		if (mapped.rejected === true) {
			rejected.push({ itemId: row.id, reason: mapped.reason });
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
export function createNodeFsAdapter(): NonNullable<RunGitExportDeps["fs"]> {
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
		realpathSync: (p: string): string => nodeFs.realpathSync.native(p),
		renameSync: (from: string, to: string): void => nodeFs.renameSync(from, to),
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
	const key = nodeFs.existsSync(repoPath)
		? nodeFs.realpathSync.native(repoPath)
		: path.resolve(repoPath);
	const prev = exportMutexes.get(key) ?? Promise.resolve();
	const next = prev.then(fn, fn);
	const tail = next.catch(() => undefined);
	exportMutexes.set(key, tail);
	// Garbage-collect after settle so a long-lived server doesn't leak keys.
	next
		.finally(() => {
			if (exportMutexes.get(key) === tail) exportMutexes.delete(key);
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
	fs: NonNullable<RunGitExportDeps["fs"]>,
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

function isInside(root: string, candidate: string): boolean {
	return candidate === root || candidate.startsWith(`${root}${path.sep}`);
}

function safeParent(
	repoPath: string,
	absPath: string,
	fs: NonNullable<RunGitExportDeps["fs"]>,
): boolean {
	const root = fs.realpathSync?.(repoPath) ?? path.resolve(repoPath);
	const parent = fs.realpathSync?.(path.dirname(absPath)) ?? path.resolve(path.dirname(absPath));
	return isInside(root, parent);
}

function writePlanToDisk(
	plan: Awaited<ReturnType<typeof computeExportPlan>>,
	repoPath: string,
	fs: NonNullable<RunGitExportDeps["fs"]>,
): { filesChanged: string[] } {
	const filesChanged: string[] = [];
	for (const entry of plan.entries) {
		const absPath = absolutePath(repoPath, entry.relPath);
		// Defense-in-depth: ensure the resolved path stays inside repoPath.
		const resolved = path.resolve(absPath);
		const resolvedRoot = path.resolve(repoPath);
		if (!isInside(resolvedRoot, resolved)) {
			// sanitizePathSegment should have caught this earlier; skip defensively.
			continue;
		}
		const prior = fs.existsSync(absPath) ? fs.readFileSync(absPath) : null;
		if (prior === entry.body) continue;
		const dir = path.dirname(absPath);
		fs.mkdirSync(dir);
		if (!safeParent(repoPath, absPath, fs)) continue;
		if (fs.renameSync) {
			const temp = path.join(dir, `.${path.basename(absPath)}.${randomUUID()}.tmp`);
			fs.writeFileSync(temp, entry.body);
			fs.renameSync(temp, absPath);
		} else {
			fs.writeFileSync(absPath, entry.body);
		}
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
	plan: Awaited<ReturnType<typeof computeExportPlan>>,
	repoPath: string,
	fs: NonNullable<RunGitExportDeps["fs"]>,
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
		if (!(isInside(resolvedRoot, resolved) && safeParent(repoPath, absPath, fs))) continue;
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
	// Use the raw (un-redacted) config so git operations receive the real URL.
	const cfg = await loadGitExportConfig(db, deps, { allowDisabled: deps.force });
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
	const trigger = deps.trigger ?? "manual";
	const nowFn = deps.now ?? ((): Date => new Date());
	// Default to the Node fs adapter so callers don't have to pass it.
	const fs = deps.fs ?? createNodeFsAdapter();

	try {
		await ensureRepo(deps.runner, fs, cfg, logger);
	} catch (err) {
		logger.error("git-export: init failed", { error: String(err) });
		return { status: "error", error: String(err), phase: "init" };
	}

	let plan: Awaited<ReturnType<typeof computeExportPlan>>;
	try {
		plan = await computeExportPlan(db, deps);
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
		const result = writePlanToDisk(plan, cfg.repoPath, fs);
		filesChanged = result.filesChanged;
	} catch (err) {
		logger.error("git-export: write failed", { error: String(err) });
		return { status: "error", error: String(err), phase: "write" };
	}

	try {
		const del = await applyDeletions(plan, cfg.repoPath, fs, deps.runner);
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
	await writeExportMeta(db, { commit: { sha, at: committedAt } }, deps);

	if (cfg.remoteUrl) {
		try {
			await deps.runner.push("origin", cfg.branch);
		} catch (err) {
			logger.error("git-export: push failed", { error: String(err) });
			return { status: "error", error: String(err), phase: "push" };
		}
		await writeExportMeta(db, { pushedAt: committedAt }, deps);
		return { status: "pushed", commitSha: sha, filesChanged, filesDeleted, message };
	}

	return { status: "committed", commitSha: sha, filesChanged, filesDeleted, message };
}

export interface RegisterGitExportHandlerOptions extends GitExportDeps {
	debounceMs?: number;
	runner?: GitRunner;
	fs?: RunGitExportDeps["fs"];
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
	opts: RegisterGitExportHandlerOptions,
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
			const cfg = await loadGitExportConfig(db, opts);
			if (!cfg) return;
			const runner = opts.runnerFactory ? opts.runnerFactory(cfg.repoPath) : opts.runner;
			if (!runner) {
				logger.warn("git-export: no runner available for event-triggered export");
				return;
			}
			await runGitExport(db, {
				runner,
				fs: opts.fs, // undefined → defaults to createNodeFsAdapter() inside runGitExport
				logger,
				trigger: "event",
				serverConfig: opts.serverConfig,
				knowledge: opts.knowledge,
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
		// @lore AU19 Increment 2c: `knowledge`-owned tables, reached through the
		// injected `GitExportKnowledgeReader` port — not a direct query (Table ACL).
		void (async () => {
			const projection = await opts.knowledge.getProjectionByItemId(db, event.itemId);
			if (!projection) return;
			const projectionLayer = projection.layer;
			const projectionKind = projection.kind;
			if (!isExportedLayer(projectionLayer ?? "")) return;
			if (!(projectionKind && EXPORTED_KINDS.has(projectionKind.toUpperCase()))) return;

			const cfg = await loadGitExportConfig(db, opts);
			if (!cfg) return;
			const debounceMs = opts.debounceMs ?? cfg.debounceMs;
			clearPending();
			pending = setTimeout(() => {
				void fire();
			}, debounceMs);
		})().catch((err) => {
			logger.error("git-export: event prefilter failed", { error: String(err) });
		});
	};

	const unsubscribe = eventBus.on("knowledge_updated", handler);
	return (): void => {
		disposed = true;
		clearPending();
		unsubscribe();
	};
}
