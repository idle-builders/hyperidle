import type {
	AgentScaffoldSpec,
	AssistantFormation,
	AssistantFormationRequest,
	DecomposeBetRequest,
	DecompositionPlan,
	ScaffoldRequest,
	SelectAgentOutcome,
	SelectAgentRequest,
} from "../../app-runtime/contracts.js";
import { composeRoster } from "../../app-runtime/roster.js";
import { selectAgentByAppDefaults } from "../../app-runtime/services/agent-selection.js";

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
	input: ResolveAgentSelectionInput,
): Promise<SelectAgentOutcome> {
	return selectAgentByAppDefaults(input);
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
