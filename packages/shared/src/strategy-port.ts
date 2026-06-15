/**
 * The Strategy Port — the Kernel's dispatch-time contract with any Strategy.
 *
 * Lives in @hyperidle/shared because both the Kernel (packages/server) and every
 * Strategy implementation (packages/fabric, packages/strategy-minimal, third-party)
 * already depend on shared. shared must stay db-agnostic — no @hyperidle/db dep
 * allowed here.
 *
 * @lore AK2: TDb is a generic type parameter (NOT an import of HyperIdleDb) so
 * @hyperidle/shared stays db-agnostic. Importing HyperIdleDb into shared would
 * invert the verified db→shared dependency direction (packages/db/package.json
 * depends on shared; shared must NOT depend on db). The Kernel binds TDb=HyperIdleDb
 * at every getActiveStrategy() call site. Strategy implementations annotate
 * themselves as Strategy<HyperIdleDb> and import HyperIdleDb from @hyperidle/db
 * (they already depend on db).
 */

import type { UserRole } from "./types.js";

/**
 * What the Kernel hands a Strategy to assemble context into a session's sandbox.
 *
 * The Kernel calls assembleContext at P6 (admission phase) with this request.
 * The Strategy is responsible for populating the sandbox's context/knowledge/work
 * directories and writing a .fabric/manifest.json (or an inert scaffold for
 * the minimal Strategy). The Kernel does not read the assembled content — the
 * agent reads it from disk inside the sandbox.
 */
export interface ContextAssemblyRequest<TDb> {
	readonly db: TDb;
	readonly sandboxPath: string;
	readonly sessionId: string;
	readonly taskId: string;
	readonly agentId: string;
	readonly agentRole: UserRole;
	/**
	 * @lore U1: a teams.id (field name kept for back-compat with productId in
	 * the Fabric adapter mapping: productId → teamId).
	 */
	readonly teamId: string;
	/**
	 * True for routine sessions: Strategy MUST NOT read task/bet context.
	 * Informational for the Fabric (which already handles this via stub taskId);
	 * load-bearing for a future Strategy that branches on session type.
	 */
	readonly isRoutine: boolean;
}

/**
 * Observable result of context assembly.
 *
 * @lore AK2: NARROWS the Fabric's ContextAssemblyResult { itemCount, manifest,
 * durationMs } — intentionally DROPS `manifest`. Both production call sites
 * (session-provisioning.ts ~L424, session-lifecycle.ts ~L176) call
 * `await assembleContext(...)` and DISCARD the return value entirely. The Kernel
 * never reads the manifest off the result (it reads .fabric/manifest.json off
 * disk when it needs it). This is a narrowing, NOT a mirror. If a future WP
 * (e.g. AK2b prompt-relocation) needs the manifest on the return value, widen
 * this type then — do not assume parity with ContextAssemblyResult.
 */
export interface ContextAssemblyOutcome {
	readonly itemCount: number;
	readonly durationMs: number;
}

/**
 * What the Kernel hands a Strategy to ingest a finished session's sandbox writes.
 *
 * The Kernel calls beginLearningIngestion at P7 (admission phase, after context
 * assembly) to start a live ingestion subscription. The Strategy watches the
 * sandbox for knowledge writes and persists them to the knowledge base.
 */
export interface IngestionRequest<TDb> {
	readonly db: TDb;
	readonly sandboxPath: string;
	readonly sessionId: string;
	readonly manifestPath: string;
}

/**
 * A live ingestion subscription. The Kernel owns its lifecycle and MUST dispose
 * it on EVERY teardown path (complete / crash / budget_exhausted). Mirrors
 * today's FileWatcher interface.
 *
 * Contract:
 * - dispose() MUST flush any pending captures.
 * - dispose() MUST NOT throw (best-effort; swallow ENOENT — the sandbox may
 *   already be gone on crash paths).
 */
export interface IngestionHandle {
	dispose(): void;
}

/**
 * The Strategy Port. Exactly one Strategy is active per process.
 *
 * The Kernel calls this surface and NEVER imports a concrete Strategy
 * (that is the AC4 static contract, enforced by the ESLint no-restricted-imports
 * guard in packages/server/src/** except the composition root server-factory.ts).
 *
 * A reader can state the full contract from this one interface: on session admit,
 * the Kernel asks the active Strategy to (1) assemble context into the sandbox
 * and (2) begin watching the sandbox for learning ingestion. On teardown the
 * Kernel disposes the returned IngestionHandle.
 *
 * Error semantics:
 * - assembleContext may throw; the Kernel's Phase-6 try/catch reverts the task
 *   to `accepted` and rethrows (existing behaviour preserved).
 * - beginLearningIngestion MUST NOT throw synchronously; the returned handle's
 *   dispose() MUST NOT throw (best-effort flush).
 */
export interface Strategy<TDb> {
	assembleContext(req: ContextAssemblyRequest<TDb>): Promise<ContextAssemblyOutcome>;
	beginLearningIngestion(req: IngestionRequest<TDb>): IngestionHandle;
}
