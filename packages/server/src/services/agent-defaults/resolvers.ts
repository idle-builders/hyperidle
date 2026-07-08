import type { HyperIdleDb } from "@hyperidle/db";
import type {
	AgentScaffoldSpec,
	AssistantFormation,
	AssistantFormationRequest,
	DecomposeBetRequest,
	DecompositionPlan,
	ScaffoldRequest,
	SelectAgentOutcome,
	SelectAgentRequest,
} from "@hyperidle/shared";
import { composeRoster } from "../../app-runtime/roster.js";
import { selectAgentFabric } from "../../app-runtime/services/agent-selection.js";

export type ResolveAgentScaffoldSpecsInput = ScaffoldRequest<HyperIdleDb>;
export type ResolveAgentSelectionInput = SelectAgentRequest<HyperIdleDb>;
export type ResolveAssistantFormationInput = AssistantFormationRequest<HyperIdleDb>;
export type ResolveDecompositionPlanInput = DecomposeBetRequest<HyperIdleDb>;

export async function resolveAgentScaffoldSpecs(
	input: ResolveAgentScaffoldSpecsInput,
): Promise<readonly AgentScaffoldSpec[]> {
	return composeRoster(input.db, input);
}

export async function resolveAgentSelection(
	input: ResolveAgentSelectionInput,
): Promise<SelectAgentOutcome> {
	return selectAgentFabric(input);
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
