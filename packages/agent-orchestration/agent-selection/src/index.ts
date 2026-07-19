/**
 * `@hyperidle/agent-selection` — public barrel.
 *
 * Table ACL (Mechanism A): this Service owns zero tables — no raw table
 * re-export here, function exports only.
 *
 * @lore AU19 Increment 3e: migrated from `packages/server/src/services/`.
 * `createAgentSelectionOps` was the sanctioned factory; AU20 Ab4 renames it
 * to `createAgentSelectionService` and collapses 19 → 9 exports (2 runtime +
 * 7 types).
 *
 * @lore AU20 Ab4: surface collapse. Three per-surface selection methods
 * (`selectOwner`, `selectAgentByAppDefaults`, `resolveDecompositionPlan`) →
 * one `selectAgent(occasion)`. Three per-surface request types →
 * `SelectionOccasion`. `deriveInitials` dissolves to `@hyperidle/shared`.
 * `DecompositionPlan`, `SelectAgentOutcome`, `DecomposeBetRequest`,
 * `SelectAgentRequest`, `AgentSelectionSelectOwnerOccasion`,
 * `AgentSelectionTeamReader`, `AgentSelectionUserReader`, `AgentSelectionOps`
 * are no longer public (internal or inlined at the composition root).
 * `resolveAgentScaffoldSpecs` (formerly re-exported as `resolveScaffoldSpecs`)
 * is removed from the barrel — callers now use
 * `agentSelectionService.resolveScaffoldSpecs(...)` (the method on the
 * composition-root singleton from `core-api/services/agent-selection-bindings.ts`).
 *
 * @lore AU20 Ab4 DEFERRED: `resolveAssistantFormation` — spec §2 Key Collapses
 * #3 requires dissolving this degenerate constant stub by folding it into
 * `resolveScaffoldSpecs({trigger:"user_assistant"})` and having dispatch read
 * the spec's `systemPrompt` directly. Doing so requires migrating
 * `DispatchAgentSelectionAccessor` in `@hyperidle/dispatch`'s `ports.ts`
 * (removing `resolveAssistantFormation`, adding `resolveScaffoldSpecs`) and
 * updating `agent-work-assistant.ts` and the AR4b formation-seam test. This
 * dispatch-port migration is out of scope for Ab4; `resolveAssistantFormation`
 * remains exported until a follow-up increment completes the dissolution.
 */

// ---------------------------------------------------------------------------
// Runtime exports (2)
// ---------------------------------------------------------------------------

export { createAgentSelectionService } from "./service.js";

// ---------------------------------------------------------------------------
// Type exports (7)
// ---------------------------------------------------------------------------

export type {
	AgentScaffoldSpec,
	CandidateFilter,
	ScaffoldRequest,
	SelectionCandidate,
	SelectionOccasion,
} from "./contracts.js";
export type { AgentSelectionDeps } from "./ports.js";
export type { AgentSelectionService } from "./service.js";
