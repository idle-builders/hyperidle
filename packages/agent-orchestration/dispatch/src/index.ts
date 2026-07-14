/**
 * Barrel for @hyperidle/dispatch (agent-orchestration Layer Service).
 *
 * Typed functions only — this Service owns zero tables (§4 roster confirms
 * the original "—"/"—" entry), so there is no raw table object to guard
 * against re-exporting.
 *
 * @lore AU19 Increment 3h: this is the real cut-over — `task-dispatcher.ts`/
 * `assistant-dispatcher.ts`/`routine-scheduler.ts`/`builtin-routine-handlers.ts`/
 * `agent-work-assistant.ts` moved here from `packages/server/src/services/`
 * (behavior-preserving move — dead commented-out code in `routine-scheduler.ts`
 * dropped, no functional change) alongside `config/builtin-routines.ts`
 * (renamed `builtin-routines-config.ts` — pure config, tightly coupled to
 * this Service's routine logic, no cross-Service imports). Every raw
 * cross-Service call became an injected DI port (Mechanism C, `ports.ts`):
 * `work`/`routine`/`conversation`/`users`/`settings`/`model-gateway`, all
 * ordinary downward edges (agent-orchestration reaching down into
 * core-api); `agent-selection`/`run-orchestration`/`session-requests`/`cost`,
 * ordinary same-layer edges (still ports per Mechanism C, see `ports.ts`
 * top `@lore`); `review`/`knowledge`, ordinary downward edges with two
 * collapsed call shapes (see `ports.ts` top `@lore`); `tool-handlers`/
 * `harness-registry`'s workspace factory, INTERIM forward-references (not
 * yet migrated, Increment 4). `createDispatchOps` (`service.ts`) binds a
 * single `DispatchPorts` instance once, at the composition root
 * (`packages/server`'s new `dispatch-bindings.ts`), and every real call
 * site imports the bound singleton — same idiom as `cost`/`agent-selection`.
 *
 * No §10.3 against-grain edge targets `dispatch` (confirmed — `dispatch`
 * only appears as a SOURCE in the census, never a target of a `⚠` row).
 */

// -- agent-work-assistant (AR4a: harness-agnostic conversational turn) --
export type { AssistantTurnDeps } from "./agent-work-assistant.js";
export { mapErrorToNotice } from "./agent-work-assistant.js";

// -- assistant-dispatcher (AD8b: pin-on-first-response) --
export type { ThreadLike } from "./assistant-dispatcher.js";
export { isAssistantThread } from "./assistant-dispatcher.js";
// -- builtin-routine-handlers (5 built-in routines) --
export type { PostBetRetroArgs, RunBuiltinResult } from "./builtin-routine-handlers.js";
// -- builtin-routines-config (stable ids + specs, editable config) --
export type { BuiltinRoutineId, BuiltinSpec } from "./builtin-routines-config.js";
export {
	BUILTIN_ROUTINE_IDS,
	BUILTIN_SPECS,
	extractBuiltinKind,
	isBuiltinRoutineId,
} from "./builtin-routines-config.js";
// -- ports (Mechanism C — DI-injected outbound edges) --
export type {
	DispatchAgentModelParams,
	DispatchAgentSelectionAccessor,
	DispatchAgentWorkIntentInput,
	DispatchAgentWorkIntentRecord,
	DispatchAssistantFormation,
	DispatchAssistantFormationRequest,
	DispatchAttentionRecomputeOutcome,
	DispatchAutoPromotionSweepResult,
	DispatchConsumeOptions,
	DispatchConversationAccessor,
	DispatchConversationalOptions,
	DispatchCostAccessor,
	DispatchCreatePracticeMeetingInput,
	DispatchCreatePracticeMeetingResult,
	DispatchCredentialResolver,
	DispatchKnowledgeAccessor,
	DispatchModelGatewayAccessor,
	DispatchPorts,
	DispatchProvisionDeps,
	DispatchProvisionResult,
	DispatchRecentLayeredKnowledgeItem,
	DispatchReviewAccessor,
	DispatchRoutineAccessor,
	DispatchRoutinePatch,
	DispatchRunOrchestrationAccessor,
	DispatchServerConfigSnapshot,
	DispatchSessionRequestsAccessor,
	DispatchSettingsAccessor,
	DispatchStaleSweepResult,
	DispatchToolContext,
	DispatchToolHandlersAccessor,
	DispatchUserAccessor,
	DispatchWorkAccessor,
	DispatchWorkspaceFactory,
} from "./ports.js";
// -- routine-scheduler (cron parsing + generic-routine firing) --
export type {
	FireResult,
	ReapStaleSessions,
	RoutineScheduler,
	RoutineSchedulerConfig,
} from "./routine-scheduler.js";
export { computeNextRunAt, nextCronMatch, parseCron } from "./routine-scheduler.js";
// -- service (the bound-ops factory, same idiom as `cost`/`agent-selection`) --
export type { DispatchOps } from "./service.js";
export { createDispatchOps } from "./service.js";
// -- task-dispatcher (AD2: task-to-session dispatcher) --
export type {
	DispatchQueueEntry,
	DispatchQueueSnapshot,
	TaskDispatcherDeps,
} from "./task-dispatcher.js";
export { getDispatchQueueSnapshot } from "./task-dispatcher.js";
