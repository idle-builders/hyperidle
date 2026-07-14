/**
 * Barrel for @hyperidle/policy (core-api Layer, non-SQL orchestration Service).
 *
 * Typed functions only. `policy` owns ZERO tables (confirmed this
 * increment — the first task per the architecture's `⛁*` marker): every
 * `pgTable` this Service's four files touch (`agentSessionRequests`,
 * `teamMembers`) is owned by another Service and is now reached through an
 * injected DI port (`ports.ts`); `sessions`/`propagationLog`/
 * `taskDispatchAttempts` stay direct `@hyperidle/db` reads/writes because
 * all three are `table-ownership-guard.ts`'s `UNOWNED_SHARED_TABLES`
 * exemption (genuinely multi-owner-touched, confirmed unchanged). No
 * `TABLE_OWNER` row is added for `policy` — there is nothing to own.
 *
 * @lore AU19 Increment 2a: this is the real cut-over — the four policy seed
 * files (`policy-engine.ts`, `approval-rate.ts`, `handoff-protocol.ts`,
 * `lifecycle-propagation.ts`) moved here from `packages/server/src/services/`
 * (behavior-preserving move; every raw cross-Service table/function access
 * became an injected DI port, `ports.ts`). This closes the `policy` slice of
 * Increment 2 (core-api non-SQL Services).
 *
 * `handoff-protocol.ts`'s reclassification question (architecture §10.3,
 * line 488 — "reclassify `handoff-protocol` into an orchestration Service…
 * or invert via event; decide at Increment 2/3") is resolved as: DEFER. The
 * three against-grain edges it drives (`session-requests`, `cost`,
 * `session-lifecycle`) are wired as interim DI ports this increment,
 * matching the precedent already established twice in this WP (`work`'s
 * Increment 1b `AgentWorkIntentRecorder`/`AgentSelectionDefaults`/
 * `CostCapChecker`, `review`'s Increment 1j `ReviewAgentWorkIntentRecorder`)
 * — none of the three target Services (`session-requests`, `cost`,
 * `session-lifecycle`) are real packages yet (all scheduled for Increment
 * 3), so reclassifying `handoff-protocol` into an orchestration Service now
 * would require standing up an `agent-orchestration` Service package ahead
 * of its own scheduled increment. Increment 3 rewires all three interim
 * ports to the EventBus subscription pattern once their target Services are
 * real packages — flagged inline in `ports.ts`.
 */

// -- approval rate (AD4) --
export type { ApprovalRateResult } from "./approval-rate.js";
export { computeApprovalRate } from "./approval-rate.js";
// -- handoff protocol --
export type { HandoffMetadata, HandoffParams, HandoffResult } from "./handoff-protocol.js";
export { buildHandoff } from "./handoff-protocol.js";
// -- lifecycle propagation (L20) --
export { registerLifecyclePropagation, retryFailedPropagations } from "./lifecycle-propagation.js";
// -- policy engine (AD4/E7) --
export { registerPolicyEngine } from "./policy-engine.js";
// -- ports (Mechanism C — DI-injected outbound edges) --
export type {
	ApprovalRateDeps,
	HandoffDeps,
	LifecyclePropagationDeps,
	NewMessagePayload,
	PolicyAgentSessionRequestReader,
	PolicyAgentWorkIntentInput,
	PolicyAgentWorkIntentKind,
	PolicyAgentWorkIntentRecord,
	PolicyAgentWorkIntentRecorder,
	PolicyConversationStore,
	PolicyCostDedupReleaser,
	PolicyEngineDeps,
	PolicyMessageListOpts,
	PolicyNewNotificationRow,
	PolicyNotificationQueue,
	PolicyOrgTeamReader,
	PolicySessionContext,
	PolicySessionRunRegistry,
	PolicySessionTerminationRequester,
	PolicySilenceChecker,
	PolicySilenceItem,
	PolicyTerminationReason,
	PolicyTerminationRequest,
	PolicyUserDirectory,
	PolicyVerdictMessageRow,
	PolicyWorkStore,
} from "./ports.js";
// -- task transitions (local mirror of @hyperidle/work's task-state-machine) --
export { InvalidTransitionError, VALID_TRANSITIONS } from "./task-transitions.js";
