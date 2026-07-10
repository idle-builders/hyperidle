import {
	type AgentSessionRequest,
	agentSessionRequests,
	bets,
	type HyperIdleDb,
	messages,
	sessions,
	tasks,
	teamMembers,
	teams,
	threads,
	users,
} from "@hyperidle/db";
import type { TaskDispatcherDeps } from "@hyperidle/fabric";
import type {
	AssistantFormation,
	AssistantFormationRequest,
	HarnessCapabilities,
	ResolvedModel,
	SelectAgentOutcome,
	SelectAgentRequest,
	SessionConfig,
	SessionHandle,
	SessionResult,
	Strategy,
} from "@hyperidle/shared";
import { minimalStrategy } from "@hyperidle/strategy-minimal";
import { eq } from "drizzle-orm";
import { vi } from "vitest";
import { setAgentSessionRequestCreateFn } from "../../../fabric/src/services/provision-registry.js";
import { AdapterPool } from "../harness/adapter-pool.js";
import { LocalSandboxAdapter } from "../harness/local-sandbox-adapter.js";
import { createAgentSessionRequest } from "../services/agent-session-requests.js";
import type { CredentialResolver } from "../services/credential-resolver.js";

const NOW = "2026-07-08T12:00:00.000Z";

class NeverStartAdapter {
	async startSession(_config: SessionConfig): Promise<SessionHandle> {
		throw new Error("AU1 test adapter should not be reached before request emission");
	}

	async *streamEvents(): AsyncGenerator<never> {}

	async stopSession(_handle: SessionHandle): Promise<SessionResult> {
		return {
			outcome: "completed",
			cost: { minor: 0, currency: "USD" },
			tokenUsage: { byTier: {} },
		};
	}

	getCapabilities(): HarnessCapabilities {
		return {
			preCompactionTrigger: false,
			subAgents: false,
			modelProviders: ["openrouter", "anthropic"],
			mcpSupport: false,
			returnEnforcement: "none",
		};
	}
}

function makePool(): AdapterPool {
	const pool = new AdapterPool();
	pool.register("au1-never-start", new NeverStartAdapter(), {
		name: "AU1 never start",
		kind: "local",
		type: "builtin",
		modelProviders: ["openrouter", "anthropic"],
		maxConcurrent: 4,
	});
	return pool;
}

const credentialResolver: CredentialResolver = {
	async resolve(name: string): Promise<string | null> {
		if (name === "openrouter_api_key") return "sk-or-au1";
		return null;
	},
};

export async function seedAssistantTurnFixture(db: HyperIdleDb) {
	const userId = "user-au1";
	const assistantId = `ast-${userId}`;
	const threadId = "thread-au1";
	const messageId = "msg-au1";

	await db.insert(users).values([
		{
			id: userId,
			kind: "human",
			name: "AU1 User",
			role: "founder",
			status: "active",
			createdAt: NOW,
		},
		{
			id: assistantId,
			kind: "ai",
			name: "AU1 Assistant",
			role: "assistant",
			status: "active",
			agentCategory: "individual",
			harnessType: "builtin",
			modelId: "deepseek/deepseek-v4-flash",
			modelProvider: "openrouter",
			createdAt: NOW,
		},
	]);
	await db.insert(threads).values({
		id: threadId,
		hostKind: "user",
		hostId: userId,
		initiatorId: userId,
		participants: JSON.stringify([userId, assistantId]),
		pinned: false,
		createdAt: NOW,
		lastActiveAt: NOW,
	});
	await db.insert(messages).values({
		id: messageId,
		threadId,
		senderId: userId,
		type: "plain",
		payload: JSON.stringify({ text: "hello" }),
		clientKey: `ck-${messageId}`,
		createdAt: NOW,
	});

	const strategy: Strategy<HyperIdleDb> = {
		...minimalStrategy,
		formAssistant(_req: AssistantFormationRequest<HyperIdleDb>): Promise<AssistantFormation> {
			return Promise.resolve({ persona: null, assistantDraftSurface: "standard" });
		},
	};

	return {
		userId,
		assistantId,
		threadId,
		messageId,
		adapterPool: makePool(),
		credentialResolver,
		strategy,
	};
}

export async function seedDecompositionFixture(db: HyperIdleDb) {
	const teamId = "team-au1";
	const memberId = "member-au1";
	const betId = "bet-au1";
	const pmId = "pm-au1";

	await db.insert(teams).values({ id: teamId, name: "AU1 Team", phase: "build", createdAt: NOW });
	await db
		.insert(teamMembers)
		.values({ id: memberId, teamId, capacity: 3, activeBets: 0, formedAt: NOW });
	await db.insert(users).values({
		id: pmId,
		kind: "ai",
		name: "AU1 PM",
		role: "product_manager",
		agentCategory: "team",
		teamId: memberId,
		status: "active",
		harnessType: "builtin",
		createdAt: NOW,
	});
	await db.insert(bets).values({
		id: betId,
		teamId,
		description: "AU1 decomposition target",
		status: "active",
		createdAt: NOW,
	});

	const strategy: Strategy<HyperIdleDb> = {
		...minimalStrategy,
		selectAgent: vi.fn(
			async (_req: SelectAgentRequest<HyperIdleDb>): Promise<SelectAgentOutcome> => {
				return { agentId: pmId };
			},
		),
		decomposeBet: vi.fn(async () => ({ decomposerAgentId: pmId, tasks: [] })),
	};

	const resolvedModel: ResolvedModel = {
		provider: "openrouter",
		model: "deepseek/deepseek-v4-flash",
		apiKey: "sk-or-au1",
		baseUrl: "https://openrouter.ai/api/v1",
	};

	return {
		betId,
		adapterPool: makePool(),
		sandbox: new LocalSandboxAdapter(),
		sandboxBasePath: "/tmp/hyperidle-au1-decomposition",
		resolvedModel,
		strategy,
	};
}

export async function seedPublicTaskSessionFixture(db: HyperIdleDb) {
	const teamId = "team-au1-route";
	const memberId = "member-au1-route";
	const betId = "bet-au1-route";
	const agentId = "agent-au1-route";
	const taskId = "task-au1-route";

	await db
		.insert(teams)
		.values({ id: teamId, name: "AU1 Route Team", phase: "build", createdAt: NOW });
	await db
		.insert(teamMembers)
		.values({ id: memberId, teamId, capacity: 3, activeBets: 0, formedAt: NOW });
	await db.insert(users).values({
		id: agentId,
		kind: "ai",
		name: "AU1 Route Agent",
		role: "builder",
		agentCategory: "team",
		teamId: memberId,
		status: "active",
		harnessType: "builtin",
		modelId: "deepseek/deepseek-v4-flash",
		modelProvider: "openrouter",
		createdAt: NOW,
	});
	await db.insert(bets).values({
		id: betId,
		teamId,
		description: "AU1 route bet",
		status: "active",
		createdAt: NOW,
	});
	await db.insert(tasks).values({
		id: taskId,
		betId,
		teamId,
		title: "AU1 route task",
		state: "accepted",
		createdAt: NOW,
		updatedAt: NOW,
	});

	return {
		teamId,
		agentId,
		taskId,
		adapterPool: makePool(),
		credentialResolver,
		sandbox: new LocalSandboxAdapter(),
	};
}

export function registerRoutineRequestRuntime(
	db: HyperIdleDb,
): Omit<TaskDispatcherDeps, "db" | "eventBus"> {
	setAgentSessionRequestCreateFn(createAgentSessionRequest);
	const executeAgentRunRequest = async (_deps: unknown, request: AgentSessionRequest) => {
		const sessionId = `session-${request.id}`;
		const now = new Date().toISOString();
		const sourceCorrelation = JSON.parse(request.sourceCorrelationJson) as {
			routineId?: string;
		};
		await db.insert(sessions).values({
			id: sessionId,
			taskId: null,
			requestId: request.id,
			sourceKind: request.sourceKind,
			sourceId: request.sourceId,
			sourceCorrelationJson: request.sourceCorrelationJson,
			agentId: request.agentId,
			modelTier: "workhorse",
			startedAt: now,
			state: "active",
			routineId: sourceCorrelation.routineId ?? null,
		});
		await db
			.update(agentSessionRequests)
			.set({ status: "completed", sessionId, updatedAt: now })
			.where(eq(agentSessionRequests.id, request.id));
		return {
			sessionId,
			outcome: "completed",
			totalCostCents: 0,
			taskId: null,
			forceReturnCount: 0,
		};
	};
	return {
		adapterPool: {},
		workspace: {},
		sandboxBasePath: "/tmp/hyperidle-au1-routine-runtime",
		executeAgentRunRequest,
	} as Omit<TaskDispatcherDeps, "db" | "eventBus">;
}
