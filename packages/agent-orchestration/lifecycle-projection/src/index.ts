/**
 * Barrel for @hyperidle/lifecycle-projection (agent-orchestration Layer).
 *
 * Typed functions only. This barrel MUST NOT re-export a raw pgTable object —
 * that would let a consumer obtain `agent_lifecycle_inbox` transitively and
 * defeat Table ACL (Mechanism A).
 *
 * @lore AU19 Increment 3d: real cut-over — `agent-lifecycle-projectors.ts`
 * moved here from `packages/server/src/services/` (behavior-preserving,
 * aside from the DI-port signature additions in `ports.ts`). Three real
 * outbound edges (`routine`, `work`, `session-requests`) became injected DI
 * ports (Mechanism C). `agent-lifecycle-inbox.ts` is this Service's owned-
 * table accessor surface for `session-requests`' foreign
 * writer/reaper — resolves that Service's Increment-3b interim port.
 */

export {
	type AgentLifecycleInboxFact,
	deleteLifecycleInboxByRequestIds,
	insertLifecycleInboxFactIfAbsent,
	listProjectedLifecycleInboxBefore,
} from "./agent-lifecycle-inbox.js";
export {
	AGENT_LIFECYCLE_PROJECTORS,
	AGENT_LIFECYCLE_SOURCE_KINDS,
	AGENT_LIFECYCLE_TERMINAL_STATES,
	type AgentLifecycleFact,
	drainAgentLifecycleInbox,
	startAgentLifecycleProjectionDrain,
} from "./agent-lifecycle-projectors.js";
export type {
	AgentLifecycleProjectionDeps,
	LifecycleProjectionExplicitSessionStartWriter,
	LifecycleProjectionRoutineWriter,
	LifecycleProjectionWorkWriter,
} from "./ports.js";
