/**
 * @lore AU19 Increment 3e: moved verbatim from
 * `packages/server/src/services/agent-defaults/resolvers.ts` into
 * `@hyperidle/agent-selection`. `resolveAgentSelection` now threads an
 * explicit `AgentSelectionDeps` first parameter (Mechanism C) since
 * `selectAgentByAppDefaults` needs the injected `users` port for its
 * `routine_delegate` branch. `resolveAgentScaffoldSpecs`,
 * `resolveAssistantFormation`, and `resolveDecompositionPlan` need no DB
 * access at all (`composeRoster` only touches `@hyperidle/db`/`@hyperidle/shared`
 * leaves directly) — unchanged signatures.
 */

import { selectAgentByAppDefaults } from "../agent-selection.js";
import type {
	AgentScaffoldSpec,
	AssistantFormation,
	AssistantFormationRequest,
	DecomposeBetRequest,
	DecompositionPlan,
	ScaffoldRequest,
	SelectAgentOutcome,
	SelectAgentRequest,
} from "../contracts.js";
import type { AgentSelectionDeps } from "../ports.js";
import { composeRoster } from "../roster.js";

export type ResolveAgentScaffoldSpecsInput = ScaffoldRequest;
export type ResolveAgentSelectionInput = SelectAgentRequest;
export type ResolveAssistantFormationInput = AssistantFormationRequest;
export type ResolveDecompositionPlanInput = DecomposeBetRequest;

export async function resolveAgentScaffoldSpecs(
	input: ResolveAgentScaffoldSpecsInput,
): Promise<readonly AgentScaffoldSpec[]> {
	return composeRoster(input.db, input);
}

export async function resolveAgentSelection(
	deps: AgentSelectionDeps,
	input: ResolveAgentSelectionInput,
): Promise<SelectAgentOutcome> {
	return selectAgentByAppDefaults(deps, input);
}

export async function resolveAssistantFormation(
	_input: ResolveAssistantFormationInput,
): Promise<AssistantFormation> {
	return { persona: null, assistantDraftSurface: "standard" };
}

export async function resolveDecompositionPlan(
	input: ResolveDecompositionPlanInput,
): Promise<DecompositionPlan> {
	const pm =
		input.candidates.find((candidate) => candidate.role === "product_manager") ??
		input.candidates[0];
	return { decomposerAgentId: pm?.agentId ?? null, tasks: [] };
}
