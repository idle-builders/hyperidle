/**
 * `filesystems` Service (core-api) — outbound composition-boundary (Mechanism C)
 * DI ports, per architecture §10.2's census: `filesystems`' four real outbound
 * edges (`git-export`, `work`, `connections`, plus the §10.3 against-grain
 * `capture-writeback` edge) become injected ports here, wired at each real
 * call site — `git-export`/`capture-writeback` are NOT real packages yet
 * (both scheduled later in Increment 2/3), so those two are wired as interim
 * forward-references to their still-in-`packages/server` concrete
 * implementations for THIS increment; `work`/`connections` are already real
 * migrated packages, wired directly to their real exported functions (same
 * idiom as `policy`'s `PolicyWorkStore`/`PolicyOrgTeamReader`, Increment 2a).
 *
 * Structural ports, same idiom as `@hyperidle/policy`'s `ports.ts`: each
 * mirrors the real target function's signature so the concrete caller (still
 * `packages/server`, the not-yet-split composition root) can pass its
 * existing function reference unchanged — zero behavior change. Types are
 * declared locally (structural mirrors of the target Service's own types, or
 * typed directly off `@hyperidle/db` row types per §7.3 W4) rather than
 * imported from the target package — a Service NEVER imports another
 * Service, even for a type-only reference.
 *
 * @lore AU19 Increment 2b — table ownership (§14 `⛁*` marker) resolves to
 * THREE owned tables, not zero (contrast `policy`'s Increment 2a, which
 * resolved to zero): `filesystemCaptures` (already the sole concern of the
 * seed file `capture-store.ts`) PLUS `filesystems`/`filesystemInjections`,
 * whose real CRUD lived inline in `packages/server/src/routes/filesystems.ts`
 * (never factored into a `*-service.ts`/`*-store.ts` seed file the way every
 * other Service's owned-table CRUD was — an architecture §4 seed-file gap,
 * not a new edge). Grepping confirmed exactly three foreign-package
 * consumers of the two tables — `routes/filesystems.ts` (registry CRUD),
 * `routes/knowledge.ts` (filesystem display-name lookup), and
 * `services/session-provisioning.ts` (per-agent mount resolution) — all
 * three now call `@hyperidle/filesystems`' real exported registry functions
 * (`filesystem-registry.ts`) instead of querying the tables raw, matching the
 * zero-exceptions Table ACL precedent already established for every prior
 * migrated Service (e.g. `routine`'s `routines`/`routineRuns`,
 * `notifications`' `notificationQueue`). See `filesystem-registry.ts`'s own
 * header and `scripts/table-ownership-guard.ts`'s `TABLE_OWNER` map.
 *
 * @lore AU19 Increment 2b — `git-export` forward-reference: `filesystems`'
 * git adapters (`git-clone-adapter.ts`, `git-worktree-adapter.ts`,
 * `filesystem-reachability.ts`, `inspect-local-path.ts`) call a NARROWER
 * subset of `git-export-runner.ts`'s full `GitRunner` interface (12 of its
 * ~19 verbs — everything except `init`/`rm`/`push`/`configSet`/`remoteAdd`/
 * `statusPorcelain`/`fetch`/`checkout`, which are `git-export`'s own
 * push/landing concerns). `FilesystemsGitRunner` mirrors exactly that
 * narrower surface. `git-export` is the VERY NEXT Increment-2 item — when it
 * migrates, its closing commit repoints every real call site's
 * `gitRunnerFactory` wiring from `packages/server`'s `createGitRunner` to
 * `@hyperidle/git-export`'s real export (same "closing" idiom as `work`'s
 * `UserStoreReader` → `users`, Increment 1d). No Increment-3 EventBus rewrite
 * is needed — this is an ordinary downward core-api→core-api edge (`git-export`
 * just hasn't migrated yet), not a §10.3 against-grain edge.
 *
 * @lore AU19 Increment 2b — `capture-writeback` (§10.3 against-grain, ×2:
 * `file-watcher.ts` → `writeback.ts`'s `processWriteback`). Wired as an
 * interim DI port for THIS increment (same precedent as `work`'s
 * `AgentWorkIntentRecorder`/`AgentSelectionDefaults`/`CostCapChecker`,
 * Increment 1b) — Increment 3 rewires it to the EventBus subscription
 * pattern per §10.3's own resolution note ("`file-watcher` already fires on
 * sandbox change — emit that as an event; `capture-writeback` subscribes.
 * Pure inversion, no reclassification"). `writeback.ts`'s other two exports
 * historically imported by `file-watcher.ts` (`getRelativePath`/
 * `isWatchedPath`) are NOT cross-Service calls at all — both are pure,
 * stateless path/string helpers with zero dependency on `capture-writeback`'s
 * DB/knowledge state — so they are inlined directly into the moved
 * `file-watcher.ts` instead of ported (a §10.3-style "dissolution", same
 * lever `policy`'s Increment 2a used for the `PropagationLevel` type-only
 * edge). `writeback.ts` in `packages/server` had its now-dead
 * `getRelativePath`/`isWatchedPath` exports removed as part of this move
 * (their sole consumer left the file) — `processWriteback` itself is
 * unchanged and still owns its own `knowledge`/`sessions` concerns
 * (§10.2's `capture-writeback → knowledge` edge, not this Service's concern).
 */

import type { Task, WriteExecutor } from "@hyperidle/db";
import type { EventBus, TaskState } from "@hyperidle/shared";

// ---------------------------------------------------------------------------
// git-export — FilesystemsGitRunner (ordinary downward edge, forward-ref —
// git-export hasn't migrated yet; closed when it does, Increment 2)
// ---------------------------------------------------------------------------

/**
 * Structural mirror of `git-export-runner.ts`'s `GitConfigInjection`. Token
 * config for git's `GIT_CONFIG_COUNT`/`KEY_n`/`VALUE_n` env-injection path —
 * never argv/URL.
 */
export interface FilesystemsGitConfigInjection {
	readonly key: string;
	readonly value: string;
}

/**
 * Narrower structural mirror of `git-export-runner.ts`'s `GitRunner` —
 * exactly the 12 verbs `filesystems`' adapters/probes call today. See this
 * file's top `@lore` for the excluded (`git-export`-only) verbs.
 */
export interface FilesystemsGitRunner {
	add(paths: readonly string[]): Promise<void>;
	commit(message: string, authorName: string, authorEmail: string): Promise<string>;
	diffCached(): Promise<boolean>;
	revParseIsInsideWorkTree(): Promise<boolean>;
	lsFiles(): Promise<readonly string[]>;
	lsRemote(
		url: string,
		opts?: { tokenConfig?: FilesystemsGitConfigInjection },
	): Promise<{ reachable: boolean; reason?: string }>;
	clone(
		url: string,
		branch: string,
		opts?: { depth?: number; tokenConfig?: FilesystemsGitConfigInjection },
	): Promise<void>;
	bundle(bundlePath: string, ref: string): Promise<void>;
	worktreeAdd(
		worktreePath: string,
		branch: string,
		opts?: { createBranch?: boolean },
	): Promise<void>;
	worktreeRemove(worktreePath: string, opts?: { force?: boolean }): Promise<void>;
	restoreStaged(paths: readonly string[]): Promise<void>;
	currentBranch(): Promise<string | null>;
}

/** Factory for a `FilesystemsGitRunner` bound to a specific cwd (Mechanism C). */
export type FilesystemsGitRunnerFactory = (cwd: string) => FilesystemsGitRunner;

// ---------------------------------------------------------------------------
// work — FilesystemsWorkStore (ordinary downward edge, `work` is a REAL
// migrated package — same idiom as `policy`'s `PolicyWorkStore`)
// ---------------------------------------------------------------------------

/**
 * The one `agent_work_intents` kind `filesystems` records today
 * (`dependency-watcher.ts`'s auto-unblock dispatch, forwarded into
 * `@hyperidle/work`'s own `transitionTask` as ITS `workIntents` port).
 */
export type FilesystemsAgentWorkIntentKind = "task_run";

export interface FilesystemsAgentWorkIntentInput {
	readonly kind: FilesystemsAgentWorkIntentKind;
	readonly sourceKind: string;
	readonly sourceId: string;
	readonly requestedBy?: string;
	readonly idempotencyKey: string;
}

export interface FilesystemsAgentWorkIntentRecord {
	readonly id: string;
	readonly idempotencyKey: string;
}

/**
 * Port for `session-requests`' durable `agent_work_intents` writer — this is
 * NOT a `filesystems → session-requests` edge in its own right; it is the
 * concrete recorder `dependency-watcher.ts` forwards into `@hyperidle/work`'s
 * own `TaskStateMachineDeps.workIntents` port (`work` already owns that
 * against-grain classification, Increment 1b) when it calls `transitionTask`.
 */
export interface FilesystemsAgentWorkIntentRecorder {
	record(
		tx: WriteExecutor,
		input: FilesystemsAgentWorkIntentInput,
	): Promise<FilesystemsAgentWorkIntentRecord>;
}

/**
 * Port for `work`'s task read/transition surface `dependency-watcher.ts`
 * calls directly today (`listHoldTasksWithDependencyPattern`/`getTaskById`
 * from `work-service.ts`, `transitionTask` from `task-state-machine.ts`).
 * Typed off `@hyperidle/db`'s `Task` row directly (§7.3 W4).
 */
export interface FilesystemsWorkStore {
	listHoldTasksWithDependencyPattern(
		db: WriteExecutor,
		likePattern: string,
	): Promise<readonly Task[]>;
	getTaskById(db: WriteExecutor, id: string): Promise<Task | undefined>;
	transitionTask(
		db: WriteExecutor,
		eventBus: EventBus,
		taskId: string,
		toState: TaskState,
		deps: { readonly workIntents: FilesystemsAgentWorkIntentRecorder },
		dispatchOccasion?: "accepted" | "retry",
	): Promise<void>;
}

// ---------------------------------------------------------------------------
// connections — FilesystemsServiceConnectionResolver (ordinary downward
// edge, `connections` is a REAL migrated package)
// ---------------------------------------------------------------------------

/**
 * Port for `connections`' per-user held-token resolver
 * (`ServiceConnectionResolver.resolve`) `filesystem-reachability.ts`'s
 * `ServiceConnectionResolverAdapter` calls directly today. Narrowed to the
 * one method the adapter uses.
 */
export interface FilesystemsServiceConnectionResolver {
	resolve(userId: string, connectionId: string): Promise<string | null>;
}

// ---------------------------------------------------------------------------
// capture-writeback — FilesystemsWritebackProcessor (§10.3 against-grain —
// Inc 3 rewires to an EventBus subscription per §10.3's own resolution note)
// ---------------------------------------------------------------------------

export interface FilesystemsWritebackConfig {
	readonly db: WriteExecutor;
	readonly sandboxPath: string;
	readonly sessionId: string;
	readonly manifestPath: string;
}

export interface FilesystemsWritebackChange {
	readonly type: "create" | "modify" | "delete";
	readonly relativePath: string;
	readonly fullPath: string;
}

export interface FilesystemsWritebackResult {
	readonly processed: number;
	readonly created: number;
	readonly updated: number;
	readonly deleted: number;
	readonly conflicts: number;
}

/** Port for `capture-writeback`'s batch writeback processor `file-watcher.ts` calls directly today. */
export interface FilesystemsWritebackProcessor {
	process(
		config: FilesystemsWritebackConfig,
		changes: readonly FilesystemsWritebackChange[],
	): Promise<FilesystemsWritebackResult>;
}

// Re-exported for call sites that need the plain EventBus/TaskState types alongside these ports.
export type { EventBus, TaskState };
