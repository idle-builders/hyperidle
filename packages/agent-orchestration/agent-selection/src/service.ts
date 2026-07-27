import {
	type HyperIdleDb,
	readSystemPromptTemplateForRole,
	sessions,
	userSkills,
} from "@hyperidle/db";
import {
	AGENT_ROLE_CATALOG,
	defaultRoster,
	findRoleCatalogEntry,
	type UserRole,
} from "@hyperidle/shared";
import { and, eq, sql } from "drizzle-orm";
import type {
	AgentScaffoldSpec,
	CandidateFilter,
	ScaffoldRequest,
	SelectionCandidate,
	SelectionOccasion,
} from "./contracts.js";
import type { AgentSelectionDeps } from "./ports.js";

const APP_ASSISTANT_SYSTEM_PROMPT =
	"You are a helpful AI assistant. Be concise, direct, and thoughtful in your responses.";

export interface AgentSelectionService {
	selectAgent(occasion: SelectionOccasion): Promise<{ agentId: string | null }>;
	listCandidates(filter: CandidateFilter): Promise<SelectionCandidate[]>;
	isAtCapacity(db: HyperIdleDb, agentId: string): Promise<boolean>;
	resolveScaffoldSpecs(request: ScaffoldRequest): Promise<readonly AgentScaffoldSpec[]>;
}

async function activeSessionCount(db: HyperIdleDb, agentId: string): Promise<number> {
	const [row] = await db
		.select({ count: sql<number>`count(*)` })
		.from(sessions)
		.where(and(eq(sessions.agentId, agentId), eq(sessions.state, "active")))
		.limit(1);
	return row?.count ?? 0;
}

async function atCapacity(
	deps: AgentSelectionDeps,
	db: HyperIdleDb,
	agentId: string,
): Promise<boolean> {
	const agent = await deps.users.getUserById(db, agentId);
	if (!agent) return true;
	return (await activeSessionCount(db, agentId)) >= agent.maxConcurrentSessions;
}

async function candidates(
	deps: AgentSelectionDeps,
	filter: CandidateFilter,
): Promise<SelectionCandidate[]> {
	const membership = await deps.teams.getTeamMembersByTeamId(filter.db, filter.teamId);
	if (!membership) return [];
	const rows = await deps.users.listActiveAiUsersByTeams(filter.db, [membership.id]);
	return rows
		.filter((user) => findRoleCatalogEntry(user.role)?.category === "team")
		.map((user) => ({ agentId: user.id, role: user.role as UserRole }))
		.sort((left, right) => left.agentId.localeCompare(right.agentId));
}

async function selectBetAgent(
	deps: AgentSelectionDeps,
	occasion: Exclude<SelectionOccasion, { surface: "routine_delegate" }>,
): Promise<{ agentId: string | null }> {
	const population = await candidates(deps, { db: occasion.db, teamId: occasion.teamId });
	occasion.eventBus.emit({
		type: "work_selection_requested",
		streamId: occasion.teamId,
		teamId: occasion.teamId,
		surface: occasion.surface,
		workKey: occasion.workKey,
		roleHint: occasion.roleHint,
		at: new Date().toISOString(),
	});

	let agentId: string | null;
	if (occasion.surface === "bet_decomposer") {
		const chosen =
			population.find((candidate) => candidate.role === "product_manager") ?? population[0];
		agentId = chosen?.agentId ?? null;
	} else {
		const roleMatch = occasion.roleHint
			? population.find((candidate) => candidate.role === occasion.roleHint)
			: undefined;
		if (roleMatch) agentId = roleMatch.agentId;
		else if (population.length === 0) agentId = null;
		else agentId = population[occasion.spreadIndex % population.length]?.agentId ?? null;
	}
	if (agentId === null) return { agentId: null };
	const user = await deps.users.getUserById(occasion.db, agentId);
	return { agentId: user?.kind === "ai" && user.status === "active" ? agentId : null };
}

async function selectRoutineDelegate(
	deps: AgentSelectionDeps,
	occasion: Extract<SelectionOccasion, { surface: "routine_delegate" }>,
): Promise<{ agentId: string | null }> {
	const population = await occasion.db
		.select({ agentId: userSkills.userId })
		.from(userSkills)
		.where(eq(userSkills.skillId, occasion.skillId));
	for (const candidate of population) {
		if (candidate.agentId === occasion.excludeAgentId) continue;
		if (!(await atCapacity(deps, occasion.db, candidate.agentId))) {
			return { agentId: candidate.agentId };
		}
	}
	return { agentId: null };
}

function scaffoldSpecs(request: ScaffoldRequest): readonly AgentScaffoldSpec[] {
	switch (request.trigger) {
		case "team_scaffold": {
			const specs: AgentScaffoldSpec[] = [];
			for (const role of defaultRoster(request.functions ?? [])) {
				const entry = AGENT_ROLE_CATALOG.find((candidate) => candidate.role === role);
				specs.push({
					role,
					name: `${request.teamName ?? "Team"} ${entry?.label ?? role}`,
					agentCategory: entry?.category ?? "team",
					systemPrompt: entry?.hasTemplate ? readSystemPromptTemplateForRole(role) : null,
				});
			}
			return specs;
		}
		case "agent_added": {
			if (request.role === null) throw new Error("agent_added trigger requires a role");
			const entry = AGENT_ROLE_CATALOG.find((candidate) => candidate.role === request.role);
			return [
				{
					role: request.role,
					name: request.name ?? `${request.teamName ?? "Agent"} ${request.role}`,
					agentCategory: entry?.category ?? "team",
					systemPrompt: entry?.hasTemplate ? readSystemPromptTemplateForRole(request.role) : null,
				},
			];
		}
		case "user_assistant":
			return [
				{
					role: "assistant",
					name: request.ownerUserName ? `${request.ownerUserName}'s Assistant` : "Assistant",
					agentCategory: "individual",
					systemPrompt: APP_ASSISTANT_SYSTEM_PROMPT,
					idHint: request.ownerUserId ? `ast-${request.ownerUserId}` : undefined,
				},
			];
	}
}

export function createAgentSelectionService(deps: AgentSelectionDeps): AgentSelectionService {
	return {
		selectAgent: (occasion) =>
			occasion.surface === "routine_delegate"
				? selectRoutineDelegate(deps, occasion)
				: selectBetAgent(deps, occasion),
		listCandidates: (filter) => candidates(deps, filter),
		isAtCapacity: (db, agentId) => atCapacity(deps, db, agentId),
		resolveScaffoldSpecs: (request) => Promise.resolve(scaffoldSpecs(request)),
	};
}
