/**
 * DI ports for `@hyperidle/context-assembly` (Mechanism C — the Service depends
 * on NO other Service; every domain read arrives as an injected port typed here).
 *
 * @lore AU19 Increment 3 (finalize): supersedes the Increment-0 proof shape
 * (`KnowledgeReader.list`/`WorkReader.openBets`/`UsersReader.displayName`/
 * `RoutineReader.activeRoutines`/`FilesystemsReader.mountedPaths` — a minimal
 * illustrative `assemble()` that proved the mechanism on one real edge,
 * `context-assembly ← knowledge`). This is the REAL port surface the actual
 * `assembleContext`/`assemblePrompt`/`buildSessionContext`/`assembleAgentContext`
 * logic (moved here unchanged from `packages/server/src/services/`) needs.
 *
 * All port methods take `db`/`exec` explicitly (never bound into the port
 * object itself) — the established idiom across every AU19 Service
 * (`dispatch`'s `DispatchKnowledgeAccessor`, `session-lifecycle`'s
 * `SessionLifecyclePorts`, etc.).
 *
 * Row/executor types (`KnowledgeItem`, `Task`, `Bet`, `User`, `Routine`,
 * `HyperIdleDb`, `WriteExecutor`) are imported directly from `@hyperidle/db`
 * — legal, `@hyperidle/db` is an allowed leaf (Mechanism C only forbids
 * cross-*Service* imports). `EventBus` is imported from `@hyperidle/shared`,
 * also an allowed leaf.
 */
import type {
	Bet,
	HyperIdleDb,
	KnowledgeItem,
	Routine,
	Task,
	Team,
	User,
	WriteExecutor,
} from "@hyperidle/db";
import type { EventBus, KnowledgeLayer } from "@hyperidle/shared";

// ---------------------------------------------------------------------------
// knowledge — KnowledgeReader (real, Increment 1a; port surface finalized
// Increment 3 to match `assembleContext`'s/`assemblePrompt`'s actual reads).
// ---------------------------------------------------------------------------

/**
 * `KnowledgeLayer` (`"L0"|"L1"|"L2"|"L3"|"L4"`) is `@hyperidle/shared`'s own
 * type (`@hyperidle/knowledge`'s `list()` filter re-uses it too) — an
 * allowed-leaf import, not a cross-Service edge.
 */
export interface ContextAssemblyKnowledgeListFilters {
	readonly layer: KnowledgeLayer;
	readonly scopeId?: string;
	readonly limit: number;
	readonly offset: number;
}

/**
 * Structural mirror of `@hyperidle/knowledge`'s `ScoringContext` — every
 * field `assembleContext` builds and passes through.
 */
export interface ContextAssemblyScoringContext {
	readonly taskDescription: string;
	readonly taskTags: readonly string[];
	readonly agentRole: string;
	readonly productId: string;
}

export interface KnowledgeReader {
	list(
		db: HyperIdleDb,
		filters: ContextAssemblyKnowledgeListFilters,
	): Promise<readonly KnowledgeItem[]>;
	/**
	 * Collapses `@hyperidle/knowledge`'s `loadScoringWeights(db)` +
	 * `rankAndBudget(items, scoringContext, weights, DEFAULT_KNOWLEDGE_BUDGET)`
	 * into one port method — same "collapsed call shape" idiom
	 * `dispatch`'s `recomputeAttentionForCandidates` established (this file's
	 * top `@lore`). `DEFAULT_KNOWLEDGE_BUDGET` stays knowledge's own constant,
	 * applied at the composition root (`context-assembly-bindings.ts`).
	 */
	rankAndBudget(
		db: HyperIdleDb,
		items: readonly KnowledgeItem[],
		scoringContext: ContextAssemblyScoringContext,
	): Promise<readonly KnowledgeItem[]>;
	/**
	 * `@hyperidle/knowledge`'s `countTokens` — a genuinely stateful-free, pure
	 * text estimator, but still routed through the port (not duplicated)
	 * since it is knowledge's own budget-estimation primitive and
	 * `assemblePrompt`/`assembleRoutinePrompt` need it to stay in lockstep
	 * with `assembleContext`'s own token accounting.
	 */
	countTokens(text: string): number;
}

// ---------------------------------------------------------------------------
// work — WorkReader (real, Increment 1b).
// ---------------------------------------------------------------------------

export interface WorkReader {
	getTaskById(db: WriteExecutor, taskId: string): Promise<Task | undefined>;
	getBetById(db: WriteExecutor, betId: string): Promise<Bet | undefined>;
}

// ---------------------------------------------------------------------------
// users — UsersReader (real, Increment 1d).
// ---------------------------------------------------------------------------

export interface UsersReader {
	getUserById(db: HyperIdleDb, userId: string): Promise<User | undefined>;
}

// ---------------------------------------------------------------------------
// routine — RoutineReader (real, Increment 1i).
// ---------------------------------------------------------------------------

export interface RoutineReader {
	getRoutineById(db: WriteExecutor, routineId: string): Promise<Routine | undefined>;
}

// ---------------------------------------------------------------------------
// filesystems — FilesystemsReader (real, Increment 2b). `startWatcher`'s
// config/return types are structural mirrors of `@hyperidle/filesystems`'
// `FileWatcherConfig`/`FileWatcher` — Mechanism C forbids importing even a
// real target's types cross-Service, same idiom as `capture-writeback`'s
// dissolved `Manifest`/`ManifestEntry` mirror (§10.2).
// ---------------------------------------------------------------------------

export interface ContextAssemblyFileWatcherConfig {
	readonly sandboxPath: string;
	readonly sessionId: string;
	readonly manifestPath: string;
	readonly eventBus: EventBus;
}

export interface ContextAssemblyFileWatcher {
	stop(): void;
}

export interface FilesystemsReader {
	startWatcher(config: ContextAssemblyFileWatcherConfig): ContextAssemblyFileWatcher;
}

// ---------------------------------------------------------------------------
// org — TeamReader (real, Increment 3 teams table-ownership remediation,
// 2026-07-15 founder ruling).
//
// @lore AU19 Increment 3: `session-context.ts` used to read `teams` via a
// direct `@hyperidle/db` query, citing `teams` as `UNOWNED_SHARED_TABLES` —
// WRONG, `teams` is `org`-owned per architecture.md §4 line 69. `TeamReader`
// is the concrete port `@hyperidle/org`'s new `getTeamById` wires to, same
// idiom as `WorkReader`/`UsersReader`/`RoutineReader` above.
// ---------------------------------------------------------------------------

export interface TeamReader {
	getTeamById(db: HyperIdleDb, teamId: string): Promise<Team | undefined>;
}

/** The full port set `context-assembly`'s real logic needs. Wired at the composition root. */
export interface ContextAssemblyPorts {
	readonly knowledge: KnowledgeReader;
	readonly work: WorkReader;
	readonly users: UsersReader;
	readonly routine: RoutineReader;
	readonly filesystems: FilesystemsReader;
	readonly org: TeamReader;
}
