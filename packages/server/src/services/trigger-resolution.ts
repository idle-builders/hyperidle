import { randomUUID } from "node:crypto";
import {
	type AgentSessionRequest,
	agentSessionRequests,
	type HyperIdleDb,
	teamMembers,
	triggerResolutionHistory,
} from "@hyperidle/db";
import {
	type AgentSessionPromptMode,
	type AgentSessionRequestInput,
	type AgentSessionSourceCorrelation,
	type AgentSessionSourceKind,
	isTriggerEventType,
	type TriggerEventType,
	type TriggerResolutionResult,
	type TriggerRuleValue,
	TriggerRuleValueSchema,
} from "@hyperidle/shared";
import { and, eq } from "drizzle-orm";
import { createAgentSessionRequest } from "./agent-session-requests.js";
import { listResolvedConfiguration } from "./plugin-configuration.js";
import { getUserByIdScopedToTeam } from "./user-store.js";

const PROMPT_MODE_BY_SOURCE: Record<AgentSessionSourceKind, AgentSessionPromptMode> = {
	task: "task",
	assistant: "conversation",
	routine: "routine",
	knowledge: "knowledge",
	decomposition: "decomposition",
	proposed_call: "proposed_call",
};

export interface TriggeredSessionRequestInput {
	readonly eventType: TriggerEventType;
	readonly sourceKind: AgentSessionSourceKind;
	readonly sourceId: string;
	readonly streamId: string;
	readonly defaultAgentId: string;
	readonly idempotencyKey: string;
	readonly sourceCorrelation: AgentSessionSourceCorrelation;
	readonly buildSourceCorrelation?: (
		resolution: TriggerResolutionResult,
	) => AgentSessionSourceCorrelation;
	readonly teamId?: string;
	readonly userId?: string;
	readonly taskId?: string | null;
	readonly payload?: Record<string, unknown>;
}

interface Candidate {
	readonly key: string;
	readonly value: import("@hyperidle/shared").TriggerRuleValue;
	readonly source: "default" | "user_override" | "user_owned";
	readonly pluginId: string | null;
	readonly specificity: number;
	readonly priority: number;
}

function specificityFor(
	rule: TriggerRuleValue,
	input: TriggeredSessionRequestInput,
): number | null {
	if (rule.eventType !== input.eventType || rule.sourceKind !== input.sourceKind) return null;
	let specificity = 0;
	if (rule.scope?.sourceId !== undefined) {
		if (rule.scope.sourceId !== input.sourceId) return null;
		specificity += 4;
	}
	if (rule.scope?.teamId !== undefined) {
		if (rule.scope.teamId !== input.teamId) return null;
		specificity += 2;
	}
	if (rule.scope?.userId !== undefined) {
		if (rule.scope.userId !== input.userId) return null;
		specificity += 1;
	}
	return specificity;
}

function sourcePriority(candidate: Candidate): number {
	if (candidate.source === "user_override") return 0;
	if (candidate.source === "user_owned") return 1;
	return 2;
}

function isRunnableAgentStatus(status: string): boolean {
	// @lore AU4: `idle` is a legacy runnable user status still present in route
	// fixtures and old local DBs. Treat it like active for trigger attach; `paused`
	// and `retired` remain non-runnable explicit trigger failures.
	return status === "active" || status === "idle";
}

function compareCandidates(left: Candidate, right: Candidate): number {
	const bySpecificity = right.specificity - left.specificity;
	if (bySpecificity !== 0) return bySpecificity;
	if (left.key === right.key) {
		const bySource = sourcePriority(left) - sourcePriority(right);
		if (bySource !== 0) return bySource;
	}
	const byPriority = (right.priority ?? 0) - (left.priority ?? 0);
	if (byPriority !== 0) return byPriority;
	const byPlugin = (left.pluginId ?? "").localeCompare(right.pluginId ?? "");
	if (byPlugin !== 0) return byPlugin;
	return left.key.localeCompare(right.key);
}

function buildPayload(
	input: TriggeredSessionRequestInput,
	resolution: TriggerResolutionResult,
): string | undefined {
	const payload = { ...(input.payload ?? {}) };
	if (resolution.result === "matched") {
		payload.trigger = {
			key: resolution.triggerKey,
			source: resolution.triggerSource,
			...(resolution.prompt ? { prompt: resolution.prompt } : {}),
		};
	}
	return Object.keys(payload).length > 0 ? JSON.stringify(payload) : undefined;
}

async function isEligibleAgent(
	db: HyperIdleDb,
	agentId: string,
	teamId?: string,
): Promise<boolean> {
	const membership = teamId
		? await db
				.select({ id: teamMembers.id })
				.from(teamMembers)
				.where(eq(teamMembers.teamId, teamId))
				.limit(1)
		: [];
	if (teamId && !membership[0]) return false;
	const membershipId = membership[0]?.id;
	const agent = await getUserByIdScopedToTeam(db, agentId, membershipId);
	if (!agent || agent.kind !== "ai" || !isRunnableAgentStatus(agent.status)) return false;
	return true;
}

async function persistResolution(
	db: HyperIdleDb,
	input: TriggeredSessionRequestInput,
	resolution: TriggerResolutionResult,
	requestId?: string,
): Promise<void> {
	await db.insert(triggerResolutionHistory).values({
		id: randomUUID(),
		sourceKind: input.sourceKind,
		sourceId: input.sourceId,
		streamId: input.streamId,
		eventType: input.eventType,
		result: resolution.result,
		triggerKey: resolution.triggerKey,
		triggerSource: resolution.triggerSource,
		chosenAgentId: resolution.chosenAgentId,
		promptSource: resolution.promptSource,
		requestId: requestId ?? null,
		resolutionJson: JSON.stringify(resolution),
		createdAt: new Date().toISOString(),
	});
}

async function findExistingRequest(
	db: HyperIdleDb,
	input: TriggeredSessionRequestInput,
): Promise<AgentSessionRequest | null> {
	const [existing] = await db
		.select()
		.from(agentSessionRequests)
		.where(
			and(
				eq(agentSessionRequests.sourceKind, input.sourceKind),
				eq(agentSessionRequests.sourceId, input.sourceId),
				eq(agentSessionRequests.idempotencyKey, input.idempotencyKey),
			),
		)
		.limit(1);
	return existing ?? null;
}

async function findPersistedResolution(
	db: HyperIdleDb,
	requestId: string,
): Promise<TriggerResolutionResult | null> {
	const [history] = await db
		.select({ resolutionJson: triggerResolutionHistory.resolutionJson })
		.from(triggerResolutionHistory)
		.where(eq(triggerResolutionHistory.requestId, requestId))
		.limit(1);
	if (!history) return null;
	return JSON.parse(history.resolutionJson) as TriggerResolutionResult;
}

function synthesizeResolutionFromRequest(
	input: TriggeredSessionRequestInput,
	request: AgentSessionRequest,
): TriggerResolutionResult {
	const payload = request.payloadJson ? JSON.parse(request.payloadJson) : {};
	const trigger = payload && typeof payload === "object" ? payload.trigger : undefined;
	const triggerKey =
		trigger && typeof trigger === "object" && typeof trigger.key === "string" ? trigger.key : null;
	const triggerSource =
		trigger && typeof trigger === "object" && typeof trigger.source === "string"
			? (trigger.source as TriggerResolutionResult["triggerSource"])
			: "fallback";
	const prompt =
		trigger && typeof trigger === "object" && typeof trigger.prompt === "string"
			? trigger.prompt
			: null;
	return {
		eventType: input.eventType,
		sourceKind: input.sourceKind,
		sourceId: input.sourceId,
		triggerKey,
		triggerSource,
		result: triggerKey ? "matched" : "fallback",
		chosenAgentId: request.agentId,
		prompt,
		promptSource: prompt && triggerKey ? `${triggerSource}:${triggerKey}` : null,
		conflicts: [],
		deterministicOrder: [],
		reason: "existing_request_without_history",
	};
}

export async function resolveTriggerForSessionRequest(
	db: HyperIdleDb,
	input: TriggeredSessionRequestInput,
): Promise<TriggerResolutionResult> {
	if (!isTriggerEventType(input.eventType)) {
		throw new Error(`Unknown trigger event type: ${input.eventType}`);
	}
	const entries = await listResolvedConfiguration(db, "trigger");
	const candidates: Candidate[] = [];
	for (const entry of entries) {
		if (!entry.active) continue;
		const parsed = TriggerRuleValueSchema.safeParse(entry.activeValue);
		if (!parsed.success) continue;
		const rule = parsed.data;
		const specificity = specificityFor(rule, input);
		if (specificity === null) continue;
		candidates.push({
			key: entry.key,
			value: rule,
			source: entry.valueSource,
			pluginId: entry.origin.pluginId,
			specificity,
			priority: rule.priority ?? 0,
		});
	}

	candidates.sort(compareCandidates);
	const selected = candidates[0];
	if (!selected) {
		return {
			eventType: input.eventType,
			sourceKind: input.sourceKind,
			sourceId: input.sourceId,
			triggerKey: null,
			triggerSource: "fallback",
			result: "fallback",
			chosenAgentId: input.defaultAgentId,
			prompt: null,
			promptSource: null,
			conflicts: [],
			deterministicOrder: [],
			reason: "no_matching_trigger",
		};
	}

	return {
		eventType: input.eventType,
		sourceKind: input.sourceKind,
		sourceId: input.sourceId,
		triggerKey: selected.key,
		triggerSource: selected.source,
		result: "matched",
		chosenAgentId: selected.value.agentId,
		prompt: selected.value.prompt ?? null,
		promptSource: selected.value.prompt ? `${selected.source}:${selected.key}` : null,
		conflicts: candidates.slice(1).map((candidate) => candidate.key),
		deterministicOrder: candidates.map((candidate) => candidate.key),
		reason: "matched_trigger",
	};
}

export async function createTriggeredAgentSessionRequest(
	db: HyperIdleDb,
	input: TriggeredSessionRequestInput,
): Promise<{ request: AgentSessionRequest; resolution: TriggerResolutionResult }> {
	const existing = await findExistingRequest(db, input);
	if (existing) {
		const persisted = await findPersistedResolution(db, existing.id);
		if (persisted) return { request: existing, resolution: persisted };
		const synthesized = synthesizeResolutionFromRequest(input, existing);
		await persistResolution(db, input, synthesized, existing.id);
		return { request: existing, resolution: synthesized };
	}
	const resolution = await resolveTriggerForSessionRequest(db, input);
	const effectiveResolution =
		input.sourceKind === "proposed_call" && resolution.result === "matched"
			? {
					...resolution,
					chosenAgentId: input.defaultAgentId,
					reason: "matched_trigger_preserved_granted_agent",
				}
			: resolution;
	if (!(await isEligibleAgent(db, effectiveResolution.chosenAgentId ?? "", input.teamId))) {
		const failed: TriggerResolutionResult = {
			...effectiveResolution,
			result: "failed",
			triggerSource: "failed",
			chosenAgentId: null,
			prompt: null,
			promptSource: null,
			reason: "ineligible_agent",
		};
		await persistResolution(db, input, failed);
		throw new Error(`Trigger resolution chose ineligible agent for ${input.eventType}`);
	}
	const requestInput = {
		sourceKind: input.sourceKind,
		sourceId: input.sourceId,
		streamId: input.streamId,
		agentId: effectiveResolution.chosenAgentId,
		teamId: input.teamId,
		userId: input.userId,
		taskId: input.taskId,
		promptMode: PROMPT_MODE_BY_SOURCE[input.sourceKind],
		idempotencyKey: input.idempotencyKey,
		payloadJson: buildPayload(input, effectiveResolution),
		sourceCorrelation:
			input.buildSourceCorrelation?.(effectiveResolution) ?? input.sourceCorrelation,
	} as AgentSessionRequestInput;
	const request = await createAgentSessionRequest(db, requestInput);
	const persisted = await findPersistedResolution(db, request.id);
	if (persisted) return { request, resolution: persisted };
	const requestMatchesResolution =
		request.agentId === effectiveResolution.chosenAgentId &&
		(request.payloadJson ?? undefined) === (requestInput.payloadJson ?? undefined);
	const finalResolution = requestMatchesResolution
		? effectiveResolution
		: synthesizeResolutionFromRequest(input, request);
	await persistResolution(db, input, finalResolution, request.id);
	return { request, resolution: finalResolution };
}
