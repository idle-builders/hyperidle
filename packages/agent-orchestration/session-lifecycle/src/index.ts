/**
 * Barrel for @hyperidle/session-lifecycle (agent-orchestration Layer).
 *
 * Typed functions only. This barrel MUST NOT re-export a raw pgTable object —
 * `session-lifecycle` owns ZERO tables (architecture §4 roster: `—`/`—`), so
 * there is no Table ACL concern here, but the barrel still never re-exports
 * another Service's table transitively via a re-export chain.
 *
 * @lore AU19 Increment 3i: real cut-over — `session-lifecycle.ts`/
 * `session-provisioning.ts`/`routine-session-reaper.ts`/`sandbox-reaper.ts`/
 * `contracts.ts` moved here from `packages/server/src/services/`
 * (behavior-preserving move). Every real outbound edge (`routine`, `work`,
 * `users`, `settings`, `observability`, `filesystems`, `connections`,
 * `session-requests`, `cost`) became an injected `ports: SessionLifecyclePorts`
 * parameter (Mechanism C, see `ports.ts`). `harness-registry`/`mcp-provider`/
 * `tool-provider`-shaped touches (Increment 4) and `context-assembly`
 * (this WP's own next item) stay INTERIM forward-reference ports.
 */

export type { IngestionHandle } from "./contracts.js";
export * from "./ports.js";
export {
	type ReapStaleRoutineSessionsOpts,
	reapStaleRoutineSessions,
} from "./routine-session-reaper.js";
export {
	reapSandboxesOnce,
	SANDBOX_REAPER_INTERVAL_MS,
	type SandboxReaperOptions,
	startSandboxReaper,
} from "./sandbox-reaper.js";
export {
	type AgentTerminationReason,
	crashSession,
	endSession,
	recoverRequestedTerminations,
	requestAgentTermination,
	type SessionContext,
	TERMINATION_DISPOSITIONS,
	TERMINATION_REASONS,
	transitionAgentRunLifecycle,
} from "./session-lifecycle.js";
export {
	type AdmittedSession,
	admitSession,
	type BeforeHarnessStartContext,
	type BeforeTeardownContext,
	captureMountedFilesystems,
	EMITTED_ROOTS_MCP_JSON,
	mountFilesystemsForAgent,
	type ProvisionSessionDeps,
	type ProvisionSessionParams,
	type ProvisionSessionResult,
	provisionSession,
	runSession,
	startSessionProvision,
} from "./session-provisioning.js";
