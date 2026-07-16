/**
 * `@hyperidle/agent-selection` — public barrel.
 *
 * Table ACL (Mechanism A): this Service owns zero tables (architecture §4's
 * `agent-selection` roster row: `⛁` — none) — no raw table re-export here at
 * all, function exports only.
 *
 * @lore AU19 Increment 3e: migrated from `packages/server/src/services/{agent-selection,select-agent,roster,agent-utils,agent-defaults/resolvers}.ts`.
 * `createAgentSelectionOps` is the sanctioned way callers reach the
 * DB-touching surface (`isAgentAtWipLimit`/`selectAgentByAppDefaults`/
 * `enumerateTeamCandidates`/`selectOwner`) — see `service.ts`'s top `@lore`
 * for why the bound-ops factory shape exists (both downstream consumer
 * ports, `work`'s and `session-requests`', expect deps-free signatures).
 */

export {
	resolveAgentScaffoldSpecs,
	resolveAssistantFormation,
	resolveDecompositionPlan,
} from "./agent-defaults/resolvers.js";
export { deriveInitials } from "./agent-utils.js";
export type {
	AgentScaffoldSpec,
	AssistantFormation,
	AssistantFormationRequest,
	DecomposeBetRequest,
	DecompositionPlan,
	ScaffoldRequest,
	SelectAgentOutcome,
	SelectAgentRequest,
	SelectionCandidate,
} from "./contracts.js";
export type {
	AgentSelectionDeps,
	AgentSelectionTeamReader,
	AgentSelectionUserReader,
} from "./ports.js";
export {
	type AgentSelectionOps,
	type AgentSelectionSelectOwnerOccasion,
	createAgentSelectionOps,
} from "./service.js";
