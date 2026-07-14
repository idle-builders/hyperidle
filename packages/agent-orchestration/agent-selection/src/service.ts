/**
 * `agent-selection` Service — the bound-ops factory.
 *
 * @lore AU19 Increment 3e: `isAgentAtWipLimit`/`selectAgentByAppDefaults`/
 * `enumerateTeamCandidates`/`selectOwner` all now take an explicit
 * `AgentSelectionDeps` first parameter (Mechanism C DI). But this Service's
 * TWO real downstream consumers expect the ORIGINAL, deps-free call
 * signatures, unchanged:
 *
 *  - `work`'s `AgentSelectionDefaults` port (`packages/core-api/work/src/ports.ts`,
 *    a §10.3 against-grain interim port, NOT touched by this migration —
 *    `enumerateTeamCandidates(db, teamId)` / `selectOwner(deps: {db,eventBus}, occasion)` /
 *    `resolveDecompositionPlan(input)`).
 *  - `session-requests`' `SessionRequestsAgentSelector` port
 *    (`packages/agent-orchestration/session-requests/src/ports.ts` —
 *    `isAgentAtWipLimit(db, agentId)` / `selectAgentByAppDefaults(req)`).
 *
 * Same idiom as `@hyperidle/knowledge`'s `AttentionServiceDeps`/
 * `buildAttentionService(deps)` (cited by `work`'s own `ports.ts` top `@lore`
 * as the precedent this Service's ports follow): `createAgentSelectionOps`
 * closes over the `users`/`teams` ports ONCE, at the composition root
 * (`packages/server`), and returns bound functions whose signatures exactly
 * match what both downstream ports already expect — a mechanical wiring
 * swap, zero behavior change, no port-interface edits needed in `work` or
 * `session-requests`.
 */

import type { HyperIdleDb } from "@hyperidle/db";
import type { EventBus, UserRole } from "@hyperidle/shared";
import { isAgentAtWipLimit, selectAgentByAppDefaults } from "./agent-selection.js";
import type { SelectAgentOutcome, SelectAgentRequest, SelectionCandidate } from "./contracts.js";
import type { AgentSelectionDeps } from "./ports.js";
import { enumerateTeamCandidates, selectOwner } from "./select-agent.js";

export interface AgentSelectionSelectOwnerOccasion {
	readonly surface: "bet_task" | "bet_decomposer";
	readonly teamId: string;
	readonly workKey: string;
	readonly roleHint: UserRole | null;
	readonly spreadIndex?: number | null;
}

/** The deps-free surface this Service's downstream ports (`work`, `session-requests`) expect. */
export interface AgentSelectionOps {
	isAgentAtWipLimit(db: HyperIdleDb, agentId: string): Promise<boolean>;
	selectAgentByAppDefaults(req: SelectAgentRequest): Promise<SelectAgentOutcome>;
	enumerateTeamCandidates(db: HyperIdleDb, teamId: string): Promise<SelectionCandidate[]>;
	selectOwner(
		deps: { readonly db: HyperIdleDb; readonly eventBus: EventBus },
		occasion: AgentSelectionSelectOwnerOccasion,
	): Promise<string | null>;
}

/** Bind this Service's DB-touching functions to a single `AgentSelectionDeps` instance. */
export function createAgentSelectionOps(deps: AgentSelectionDeps): AgentSelectionOps {
	return {
		isAgentAtWipLimit: (db, agentId) => isAgentAtWipLimit(deps, db, agentId),
		selectAgentByAppDefaults: (req) => selectAgentByAppDefaults(deps, req),
		enumerateTeamCandidates: (db, teamId) => enumerateTeamCandidates(deps, db, teamId),
		selectOwner: (occDeps, occasion) => selectOwner({ ...occDeps, ...deps }, occasion),
	};
}
