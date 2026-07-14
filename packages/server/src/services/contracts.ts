/**
 * @lore AU19 Increment 3e: `ScaffoldRequest`/`AgentScaffoldSpec`/
 * `SelectionCandidate`/`SelectAgentRequest`/`SelectAgentOutcome`/
 * `DecomposeBetRequest`/`DecompositionPlan`/`AssistantFormationRequest`/
 * `AssistantFormation` moved to `@hyperidle/agent-selection`'s own
 * `contracts.ts` (that Service's seed-file scope, architecture §4). Only
 * `IngestionHandle` — owned by the not-yet-migrated `session-lifecycle`/
 * `context-assembly`/`tool-handlers` domains — stays here until its own
 * owning Service migrates.
 */

export interface IngestionHandle {
	dispose(): void;
}
