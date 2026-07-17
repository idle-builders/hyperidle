/**
 * `agent-selection` Service — the bound-ops factory.
 *
 * @lore AU20 Ab4: collapsed from the over-fragmented AU19 surface
 * (`createAgentSelectionOps` + loose functions) to a single coherent
 * `AgentSelectionService` with four composable methods:
 *   - `selectAgent(occasion)`  — the one selection authority, parameterised by
 *     `SelectionOccasion`; new surface = new union arm + one `case` here.
 *   - `listCandidates(filter)` — parameterised candidate read.
 *   - `isAtCapacity(db, agentId)` — WIP capacity gate.
 *   - `resolveScaffoldSpecs(request)` — creation-spec resolution by trigger.
 *
 * Composition root adapts the service methods to the downstream structural-
 * mirror port interfaces (`AgentSelectionDefaults` in `work`, `SessionRequestsAgentSelector`
 * in `session-requests`) — those interfaces are unchanged; only the wiring in
 * `server-factory.ts` and `*-bindings.ts` updates.
 *
 * @lore AU19 Increment 3e: `isAgentAtWipLimit`/`selectAgentByAppDefaults`/
 * `enumerateTeamCandidates`/`selectOwner` all took an explicit `AgentSelectionDeps`
 * first parameter (Mechanism C DI) with the TWO real downstream consumers
 * expecting deps-free call signatures via bound-ops. That shape is now folded
 * into the service's closed-over deps — the composition root wraps each method
 * to satisfy the downstream port signatures.
 */

import type { HyperIdleDb } from "@hyperidle/db";
import { isAgentAtWipLimit, selectAgentByAppDefaults } from "./agent-selection.js";
import type {
	AgentScaffoldSpec,
	CandidateFilter,
	ScaffoldRequest,
	SelectionCandidate,
	SelectionOccasion,
} from "./contracts.js";
import type { AgentSelectionDeps } from "./ports.js";
import { composeRoster } from "./roster.js";
import { enumerateTeamCandidates, selectOwner } from "./select-agent.js";

// ---------------------------------------------------------------------------
// Service interface
// ---------------------------------------------------------------------------

/**
 * The single coherent agent-selection product object.
 *
 * @lore AU20 Ab4: renamed from `AgentSelectionOps`; method names follow the
 * general-composable pattern (verb + noun-filter) instead of the per-surface
 * names (`selectOwner`, `selectAgentByAppDefaults`, `enumerateTeamCandidates`).
 */
export interface AgentSelectionService {
	/** Unified selection: enumerate (when teamId-driven) → emit event → resolve → validate. */
	selectAgent(occasion: SelectionOccasion): Promise<{ agentId: string | null }>;
	/** Parameterised candidate read — `teamId`-scoped, optionally narrowed by `category`. */
	listCandidates(filter: CandidateFilter): Promise<SelectionCandidate[]>;
	/** WIP capacity gate — true when the agent is at or beyond `maxConcurrentSessions`. */
	isAtCapacity(db: HyperIdleDb, agentId: string): Promise<boolean>;
	/** Creation-spec resolution, parameterised by `trigger`. */
	resolveScaffoldSpecs(request: ScaffoldRequest): Promise<readonly AgentScaffoldSpec[]>;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Bind agent-selection policy to its DI ports (`users` + `teams`) and return
 * the service object. Called ONCE at the composition root.
 *
 * @lore AU20 Ab4: renamed from `createAgentSelectionOps`.
 */
export function createAgentSelectionService(deps: AgentSelectionDeps): AgentSelectionService {
	return {
		async selectAgent(occasion) {
			switch (occasion.surface) {
				case "bet_task":
				case "bet_decomposer": {
					// Full flow: enumerate candidates → emit occasion event → resolve → validate.
					// Mirrors the pre-collapse `selectOwner` path exactly.
					const agentId = await selectOwner(
						{ db: occasion.db, eventBus: occasion.eventBus, ...deps },
						{
							surface: occasion.surface,
							teamId: occasion.teamId,
							workKey: occasion.workKey,
							roleHint: occasion.roleHint,
							spreadIndex: occasion.spreadIndex,
						},
					);
					return { agentId };
				}
				case "routine_delegate": {
					// Delegate query path: userSkills-scoped, no enumeration, no event.
					// Mirrors the pre-collapse `selectAgentByAppDefaults` routine_delegate branch.
					return selectAgentByAppDefaults(deps, {
						db: occasion.db,
						surface: "routine_delegate",
						teamId: occasion.teamId,
						workKey: occasion.workKey,
						candidates: [],
						roleHint: null,
						spreadIndex: null,
						excludeAgentId: occasion.excludeAgentId,
						skillId: occasion.skillId,
					});
				}
			}
		},

		listCandidates(filter) {
			// @lore AU20 Ab4: `category` field reserved for future narrowing; ignored now.
			return enumerateTeamCandidates(deps, filter.db, filter.teamId);
		},

		isAtCapacity(db, agentId) {
			return isAgentAtWipLimit(deps, db, agentId);
		},

		resolveScaffoldSpecs(request) {
			return composeRoster(request.db, request);
		},
	};
}
