/**
 * Barrel for @hyperidle/trigger-resolution (agent-orchestration Layer).
 *
 * Typed functions only. This barrel MUST NOT re-export a raw pgTable object —
 * that would let a consumer obtain a table transitively and defeat Table ACL
 * (Mechanism A). Consumers get typed functions; `triggerResolutionHistory`
 * stays private to this Service.
 *
 * @lore AU19 Increment 3a: real cut-over — `trigger-resolution.ts` moved here
 * from `packages/server/src/services/` unchanged (behavior-preserving move,
 * aside from the DI-port signature additions documented in `ports.ts`). Three
 * real outbound edges (`session-requests`, `settings`, `users`) plus one
 * census-correction edge (`org`, `teamMembers` membership lookup) became
 * injected DI ports (Mechanism C, see `ports.ts`).
 */

export type {
	TriggerResolutionConfigReader,
	TriggerResolutionDeps,
	TriggerResolutionSessionRequestPort,
	TriggerResolutionTeamReader,
	TriggerResolutionUserReader,
} from "./ports.js";
export {
	createTriggeredAgentSessionRequest,
	resolveTriggerForSessionRequest,
	type TriggeredSessionRequestInput,
} from "./trigger-resolution.js";
