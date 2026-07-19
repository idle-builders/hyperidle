/**
 * AR4b — Formation seam: the assistant's persona + tool surface are decided by
 * the app-owned formation resolver at turn time, NOT read from a hardcoded constant.
 *
 * Verifies AC3: changing the resolver response changes the assistant's form.
 *
 * This is a unit test (*.test.ts) — it mocks runSession to capture the
 * conversational parameters (systemPromptOverride + draftRegistry) handed to it
 * by executeAssistantRequest after the formation seam consultation.
 *
 * The key observable: executeAssistantRequest calls resolveAssistantFormation()
 * BEFORE calling the runtime. The captured systemPromptOverride must reflect
 * the current resolver response, proving the formation seam is consulted at turn time.
 *
 * @lore AU9 R1: createTriggeredAgentSessionRequest has exactly one PRODUCTION call
 * site (the intent drain) — the assistant's own direct-create fallback was deleted.
 * This test therefore builds the request the same way the drain does (via
 * createTriggeredAgentSessionRequest) before invoking executeAssistantRequest, the
 * split "consume the exact durable request" entrypoint. Using the constructor here
 * is fixture setup in a non-protected unit test, not a second production caller.
 *
 * @lore AR4b: We observe via the runSession call-site capture rather than
 * by reading the DB or the AGENTS.md file on disk, because:
 *   1. The persona lands in the assembled prompt (not the DB row) at turn time.
 *   2. runSession receives it as params.conversational.systemPromptOverride.
 *   3. Mocking runSession lets us capture that field without
 *      running a real harness (unit test scope).
 */

import type { CredentialResolver } from "@hyperidle/connections";
import {
	type AgentSessionRequest,
	type HyperIdleDb,
	messages,
	threads,
	users,
} from "@hyperidle/db";
import { AdapterPool, createHarnessAdapter } from "@hyperidle/harness-registry";
import { getTeamMembers } from "@hyperidle/org";
import {
	createAgentSessionRequest,
	createTriggeredAgentSessionRequest,
	findSessionRequest,
	type TriggerResolutionDeps,
} from "@hyperidle/session-requests";
import { listConfiguration } from "@hyperidle/settings";
import { EventBus } from "@hyperidle/shared";
import { findUser } from "@hyperidle/users";
import { beforeEach, describe, expect, vi } from "vitest";
import { agentSelectionService } from "../services/agent-selection-bindings.js";
import { executeAssistantRequest } from "../services/dispatch-bindings.js";
import { test } from "../test-fixtures.js";

const triggerResolutionDeps: TriggerResolutionDeps = {
	sessionRequests: {
		findByIdempotencyKey: (db, key) =>
			findSessionRequest(db, {
				by: "idempotencyKey",
				sourceKind: key.sourceKind,
				sourceId: key.sourceId,
				idempotencyKey: key.idempotencyKey,
			}),
		create: createAgentSessionRequest,
	},
	config: { listConfiguration },
	users: {
		getUserByIdScopedToTeam: (db, userId, teamId) =>
			findUser(db, teamId !== undefined ? { id: userId, teamIds: [teamId] } : { id: userId }),
	},
	teams: { getTeamMembersByTeamId: (db, teamId) => getTeamMembers(db, { teamId }) },
};

// ─── Constants ────────────────────────────────────────────────────────────────

const FOUNDER_ID = "founder-ar4b-formation";
const ASSISTANT_ID = `ast-${FOUNDER_ID}`;
const THREAD_ID = "thread-ar4b-formation";
const TRIGGER_MSG_ID = "msg-trigger-ar4b-formation";
const ALPHA_PERSONA = "AR4b-test-persona-alpha — you are the Alpha test assistant.";

const formationState = vi.hoisted(() => ({
	persona: null as string | null,
	calls: [] as Array<{ userId: string }>,
}));

// ─── Captured provisionSession calls ─────────────────────────────────────────

type CapturedConversational = {
	systemPromptOverride?: string | null;
	draftRegistryToolNames?: string[];
};

const capturedConversational: CapturedConversational[] = [];

/**
 * Mock runSession to capture the conversational parameters.
 * The mock resolves immediately with a completed outcome + a stub reply
 * so runAssistantTurn persists a reply row (not a notice).
 *
 * @lore AR4b: We capture params.conversational.systemPromptOverride to prove the
 * formation seam consulted the app resolver at turn time. The mock never runs
 * a real harness — this is a unit test of the call-site wiring, not the turn itself.
 */
vi.mock("@hyperidle/session-lifecycle", async (importOriginal) => {
	const original = await importOriginal<typeof import("@hyperidle/session-lifecycle")>();
	return {
		...original,
		admitSession: vi.fn(
			async (
				_deps: unknown,
				params: import("@hyperidle/session-lifecycle").ProvisionSessionParams,
			) => {
				return {
					sessionId: "stub-session-ar4b",
					sessionContext: {
						sessionId: "stub-session-ar4b",
						agentId: params.agentId,
						taskId: params.taskId,
						sandboxPath: "/tmp/ar4b",
						ingestion: { dispose: vi.fn() },
						traceId: "trace-ar4b",
						requestContext: params.requestContext,
					},
				};
			},
		),
		runSession: vi.fn(
			async (
				_deps: unknown,
				params: import("@hyperidle/session-lifecycle").ProvisionSessionParams,
			) => {
				if (params.conversational) {
					capturedConversational.push({
						systemPromptOverride: params.conversational.systemPromptOverride,
						draftRegistryToolNames: params.conversational.draftRegistry.definitions.map(
							(d) => d.name,
						),
					});
				}
				const stubResult: import("@hyperidle/session-lifecycle").ProvisionSessionResult = {
					sessionId: "stub-session-ar4b",
					outcome: "completed",
					totalCostCents: 0,
					taskId: null,
					forceReturnCount: 0,
					conversationalReply: "AR4b formation seam stub reply",
				};
				return stubResult;
			},
		),
	};
});

function setFormationPersona(persona: string | null): void {
	formationState.persona = persona;
}

// ─── Credential resolver ──────────────────────────────────────────────────────

const credentialResolver: CredentialResolver = {
	async resolve(name: string): Promise<string | null> {
		if (name === "openrouter_api_key") return "sk-or-test-ar4b-seam";
		return null;
	},
};

// ─── Fixtures ─────────────────────────────────────────────────────────────────

async function seedFixtures(db: HyperIdleDb): Promise<void> {
	const now = new Date().toISOString();
	await db.insert(users).values({
		id: FOUNDER_ID,
		name: "AR4b Formation Founder",
		role: "founder",
		status: "active",
		kind: "human",
		createdAt: now,
	});
	await db.insert(users).values({
		id: ASSISTANT_ID,
		name: "Assistant",
		role: "assistant",
		kind: "ai",
		agentCategory: "individual",
		status: "active",
		harnessType: "builtin",
		modelId: "deepseek/deepseek-v4-flash",
		modelProvider: "openrouter",
		systemPrompt: "Original row persona — should be overridden at turn time",
		maxConcurrentSessions: 1,
		createdAt: now,
	});
	await db.insert(threads).values({
		id: THREAD_ID,
		hostKind: "user",
		hostId: FOUNDER_ID,
		initiatorId: FOUNDER_ID,
		participants: JSON.stringify([FOUNDER_ID, ASSISTANT_ID]),
		pinned: false,
		createdAt: now,
		lastActiveAt: now,
	});
	await db.insert(messages).values({
		id: TRIGGER_MSG_ID,
		threadId: THREAD_ID,
		senderId: FOUNDER_ID,
		type: "plain",
		payload: JSON.stringify({ text: "AR4b formation seam test" }),
		clientKey: `ck-${TRIGGER_MSG_ID}`,
		createdAt: now,
	});
}

/**
 * Builds the durable request the same way the production intent drain does
 * (via createTriggeredAgentSessionRequest), so executeAssistantRequest is always
 * consuming an already-created row — mirroring the real production sequence.
 */
async function createAssistantRequest(
	db: HyperIdleDb,
	params: { userId: string; threadId: string; triggerMessageId: string },
): Promise<AgentSessionRequest> {
	const assistantAgentId = `ast-${params.userId}`;
	const { request } = await createTriggeredAgentSessionRequest(
		db,
		{
			eventType: "assistant.message",
			sourceKind: "assistant",
			sourceId: params.triggerMessageId,
			streamId: `thread:${params.threadId}`,
			defaultAgentId: assistantAgentId,
			userId: params.userId,
			idempotencyKey: `assistant:${params.triggerMessageId}`,
			payload: { threadId: params.threadId, triggerMessageId: params.triggerMessageId },
			sourceCorrelation: {
				threadId: params.threadId,
				messageId: params.triggerMessageId,
				userId: params.userId,
				assistantAgentId,
			},
		},
		triggerResolutionDeps,
	);
	return request;
}

/** Test-only replacement for the deleted direct-create `runAssistantTurn` entrypoint. */
async function runTurn(
	deps: Parameters<typeof executeAssistantRequest>[0],
	params: { userId: string; threadId: string; triggerMessageId: string },
): Promise<void> {
	const request = await createAssistantRequest(deps.db, params);
	await executeAssistantRequest(deps, request);
}

function makeAdapterPool(): AdapterPool {
	const pool = new AdapterPool();
	pool.register("builtin-ar4b", createHarnessAdapter({ kind: "builtin" }), {
		name: "Builtin AR4b Test",
		kind: "local",
		type: "builtin",
		modelProviders: ["anthropic", "openrouter", "openai-compatible"],
		maxConcurrent: 5,
	});
	return pool;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("AR4b: formation seam — app resolver decides persona + tools at turn time", () => {
	beforeEach(() => {
		capturedConversational.length = 0;
		formationState.calls.length = 0;
		setFormationPersona(null);
		vi.clearAllMocks();
		// @lore AU20 Ag1b: mock resolveScaffoldSpecs on the agentSelectionService singleton
		// so the dispatch port returns a controllable persona without hitting the DB.
		vi.spyOn(agentSelectionService, "resolveScaffoldSpecs").mockImplementation(async (request) => {
			formationState.calls.push({
				userId: (request as { ownerUserId?: string }).ownerUserId ?? "",
			});
			return [
				{
					role: "assistant" as const,
					name: "Assistant",
					agentCategory: "individual" as const,
					systemPrompt: formationState.persona,
				},
			];
		});
	});

	test("default app assistant formation leaves persona unset", async ({ db }) => {
		await seedFixtures(db);

		const eventBus = new EventBus();
		await runTurn(
			{
				db,
				eventBus,
				adapterPool: makeAdapterPool(),
				credentialResolver,
			},
			{ userId: FOUNDER_ID, threadId: THREAD_ID, triggerMessageId: TRIGGER_MSG_ID },
		);

		expect(capturedConversational).toHaveLength(1);
		const captured = capturedConversational[0]!;
		expect(captured.systemPromptOverride).toBeNull();
		// Draft surface is "standard" → two draft tools present
		expect(captured.draftRegistryToolNames).toEqual(
			expect.arrayContaining(["create_bet", "edit_bet"]),
		);
		// @lore AU20 Ag1b: resolveScaffoldSpecs receives ownerUserId (not threadId — dissolved).
		expect(formationState.calls).toEqual([{ userId: FOUNDER_ID }]);
	});

	test("app assistant formation persona is applied to the runtime turn", async ({ db }) => {
		setFormationPersona(ALPHA_PERSONA);
		await seedFixtures(db);

		const eventBus = new EventBus();
		await runTurn(
			{
				db,
				eventBus,
				adapterPool: makeAdapterPool(),
				credentialResolver,
			},
			{ userId: FOUNDER_ID, threadId: THREAD_ID, triggerMessageId: TRIGGER_MSG_ID },
		);

		expect(capturedConversational).toHaveLength(1);
		const captured = capturedConversational[0]!;
		expect(captured.systemPromptOverride).toBe(ALPHA_PERSONA);
	});

	test("changing formation response changes the assistant's form (AC3)", async ({ db }) => {
		await seedFixtures(db);
		const eventBus = new EventBus();
		const pool = makeAdapterPool();

		// Turn 1: default app formation.
		setFormationPersona(null);
		await runTurn(
			{ db, eventBus, adapterPool: pool, credentialResolver },
			{ userId: FOUNDER_ID, threadId: THREAD_ID, triggerMessageId: TRIGGER_MSG_ID },
		);
		const minimalCapture = capturedConversational[0]!;

		capturedConversational.length = 0;
		const secondTriggerMessageId = `${TRIGGER_MSG_ID}-second`;
		await db.insert(messages).values({
			id: secondTriggerMessageId,
			threadId: THREAD_ID,
			senderId: FOUNDER_ID,
			type: "plain",
			payload: JSON.stringify({ text: "AR4b formation seam test, second turn" }),
			clientKey: `ck-${secondTriggerMessageId}`,
			createdAt: new Date().toISOString(),
		});

		// Turn 2: resolver returns a persona override.
		setFormationPersona(ALPHA_PERSONA);
		await runTurn(
			{ db, eventBus, adapterPool: pool, credentialResolver },
			{ userId: FOUNDER_ID, threadId: THREAD_ID, triggerMessageId: secondTriggerMessageId },
		);
		const alphaCapture = capturedConversational[0]!;

		expect(minimalCapture.systemPromptOverride).toBeNull();
		expect(alphaCapture.systemPromptOverride).toBe(ALPHA_PERSONA);
		expect(minimalCapture.systemPromptOverride).not.toBe(alphaCapture.systemPromptOverride);
	});

	test("runAssistantTurn calls the formation resolver at turn time", async ({ db }) => {
		// Set resolver response AFTER seeding but BEFORE runAssistantTurn — verifies turn-time consultation.
		await seedFixtures(db);
		setFormationPersona(ALPHA_PERSONA);

		const eventBus = new EventBus();
		await runTurn(
			{ db, eventBus, adapterPool: makeAdapterPool(), credentialResolver },
			{ userId: FOUNDER_ID, threadId: THREAD_ID, triggerMessageId: TRIGGER_MSG_ID },
		);

		expect(capturedConversational).toHaveLength(1);
		expect(capturedConversational[0]!.systemPromptOverride).toBe(ALPHA_PERSONA);
		// @lore AU20 Ag1b: resolveScaffoldSpecs receives ownerUserId (not threadId — dissolved).
		expect(formationState.calls).toEqual([{ userId: FOUNDER_ID }]);
	});
});
