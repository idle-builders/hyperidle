/**
 * AK4 — Unit tests for buildAssistantDraftRegistry + related helpers.
 *
 * AC3b (static/structural):
 *   - buildAssistantDraftRegistry().definitions names === ["create_bet","edit_bet"] (sorted)
 *   - ALL_TOOL_DEFINITIONS has no commit_bet/ship_bet/kill_bet
 *
 * AC0 (CRITICAL-1):
 *   - toolsForRole("assistant") includes both create_bet AND edit_bet
 *   - ALL_TOOL_DEFINITIONS contains editBetTool registered for assistant role
 *
 * Task 2 (team-inject unit):
 *   - create_bet via the draft registry with a wrong model teamId still writes resolved teams.id
 *
 * Task 5 (edit_bet draft guard unit):
 *   - editBetTool.handler rejects active bet with status='error', no DB write
 *   - editBetTool.handler allows draft bet, returns ok
 *
 * resolveDraftTeamId unit:
 *   - two-hop resolution: users.teamId → teamMembers.teamId = teams.id
 *   - null users.teamId → undefined
 *
 * AC3a (demoted from AK4 integration — AR4):
 *   - after create_bet tool_use, bet status=draft, no autonomous commit
 *
 * AC4 (demoted from AK4 integration — AR4):
 *   - second turn edit_bet → same betId mutated, bet count stays 1
 *
 * AC4-loop-bound (demoted from AK4 integration — AR4):
 *   - infinite tool_use mock → ≤MAX_TOOL_ITERATIONS (3) executions + non-empty reply
 *
 * @lore AR4 AK4: AC3a/AC4/AC4-loop were in AK4-assistant-draft.integration.test.ts
 * with vi.mock("harness/llm-client.js"). Demoted to this unit file in AR4 because
 * they test deterministic tool-handler logic (draft guard, transcript resolution,
 * iteration cap), not real LLM behavior. vi.mock is acceptable in .test.ts.
 */

import * as os from "node:os";
import * as path from "node:path";
import { bets, teamMembers, teams, users } from "@hyperidle/db";
import { EventBus } from "@hyperidle/shared";
import { minimalStrategy } from "@hyperidle/strategy-minimal";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdapterPool } from "../../harness/adapter-pool.js";
import { BuiltinHarnessAdapter } from "../../harness/builtin-harness-adapter.js";
import type { LlmResponse } from "../../harness/llm-types.js";
import type { AssistantTurnDeps } from "../../services/assistant-turn.js";
import { runAssistantTurn } from "../../services/assistant-turn.js";
import type { CredentialResolver } from "../../services/credential-resolver.js";
import { clearActiveStrategy, setActiveStrategy } from "../../services/strategy-registry.js";

// @lore AR4 AK4: vi.mock seam used by demoted AC3a/AC4/AC4-loop tests.
// Existing registry/tool-handler tests don't call callLlm, so the mock is harmless.
vi.mock("../../harness/llm-client.js", () => ({
	callLlm: vi.fn(),
}));

const { callLlm } = await import("../../harness/llm-client.js");
const callLlmMock = vi.mocked(callLlm);

import { test } from "../../test-fixtures.js";
// These imports will FAIL until the green phase creates these symbols:
import {
	buildAssistantDraftRegistry,
	resolveDraftTeamId,
} from "../../tools/assistant-draft-registry.js";
import { editBetTool } from "../../tools/edit-bet.js";
import type { ToolContext } from "../../tools/tool-registry.js";
import { ALL_TOOL_DEFINITIONS, toolsForRole } from "../../tools/tool-registry.js";

const NOW = "2026-06-15T00:00:00.000Z";

function makeContext(db: import("@hyperidle/db").HyperIdleDb): ToolContext {
	return {
		db,
		eventBus: new EventBus(),
		agentId: "ast-u-ak4-unit",
		sessionId: "session-unit-1",
		taskId: "",
		sandboxPath: path.join(os.tmpdir(), `hi-ak4-${Date.now()}`),
		ingestion: { dispose: () => {} },
	};
}

// ── AC0 (CRITICAL-1): edit_bet registered for assistant role ──────────────────

describe("AK4 AC0: toolsForRole('assistant') includes edit_bet", () => {
	it("edit_bet is in ALL_TOOL_DEFINITIONS", () => {
		const names = ALL_TOOL_DEFINITIONS.map((d) => d.name);
		expect(names).toContain("edit_bet");
	});

	it("toolsForRole('assistant') includes both create_bet and edit_bet", () => {
		const assistantTools = toolsForRole("assistant");
		const names = assistantTools.map((d) => d.name);
		expect(names).toContain("create_bet");
		expect(names).toContain("edit_bet");
	});

	it("edit_bet definition has roles including 'assistant'", () => {
		const editBetDef = ALL_TOOL_DEFINITIONS.find((d) => d.name === "edit_bet");
		expect(editBetDef).toBeDefined();
		expect(editBetDef!.roles).toContain("assistant");
	});
});

// ── AC3b: buildAssistantDraftRegistry has EXACTLY [create_bet, edit_bet] ─────

describe("AK4 AC3b: buildAssistantDraftRegistry — exactly 2 tools, no commit/kill/ship", () => {
	test("registry.definitions.map(d=>d.name).sort() === ['create_bet','edit_bet']", async ({
		db,
	}) => {
		const ctx = makeContext(db);
		const registry = buildAssistantDraftRegistry(ctx, {
			resolvedTeamId: "some-team-id",
			currentDraftBetId: undefined,
		});

		const names = registry.definitions.map((d) => d.name).sort();
		expect(names).toEqual(["create_bet", "edit_bet"]);
	});

	it("ALL_TOOL_DEFINITIONS has no commit_bet, ship_bet, or kill_bet tool", () => {
		const names = ALL_TOOL_DEFINITIONS.map((d) => d.name);
		expect(names).not.toContain("commit_bet");
		expect(names).not.toContain("ship_bet");
		expect(names).not.toContain("kill_bet");
	});

	test("registry.toClaudeToolSpecs() returns 2 specs", async ({ db }) => {
		const ctx = makeContext(db);
		const registry = buildAssistantDraftRegistry(ctx, {
			resolvedTeamId: "some-team-id",
			currentDraftBetId: undefined,
		});

		const specs = registry.toClaudeToolSpecs();
		expect(specs).toHaveLength(2);
		const specNames = specs.map((s) => s.name).sort();
		expect(specNames).toEqual(["create_bet", "edit_bet"]);
	});
});

// ── resolveDraftTeamId unit ───────────────────────────────────────────────────

describe("AK4 resolveDraftTeamId: two-hop users.teamId → teamMembers.teamId = teams.id", () => {
	test("resolves users.teamId (teamMembers.id) → teamMembers.teamId (teams.id)", async ({ db }) => {
		const TEAM_ID = "team-resolve-test";
		const TM_ID = "tm-resolve-test";
		const USER_ID = "u-resolve-test";

		await db
			.insert(teams)
			.values({ id: TEAM_ID, name: "Resolve Team", phase: "build", createdAt: NOW });
		await db.insert(teamMembers).values({
			id: TM_ID,
			teamId: TEAM_ID,
			capacity: 3,
			activeBets: 0,
			formedAt: NOW,
		});
		await db.insert(users).values({
			id: USER_ID,
			kind: "human",
			name: "Resolve User",
			role: "founder",
			status: "active",
			teamId: TM_ID, // users.teamId → teamMembers.id
			createdAt: NOW,
		});

		const resolved = await resolveDraftTeamId(db, USER_ID);
		expect(resolved).toBe(TEAM_ID); // must be teams.id, not tm_id
	});

	test("users.teamId is null → returns undefined", async ({ db }) => {
		await db.insert(users).values({
			id: "u-no-team",
			kind: "human",
			name: "No Team User",
			role: "founder",
			status: "active",
			// no teamId
			createdAt: NOW,
		});

		const resolved = await resolveDraftTeamId(db, "u-no-team");
		expect(resolved).toBeUndefined();
	});

	test("user does not exist → returns undefined", async ({ db }) => {
		const resolved = await resolveDraftTeamId(db, "u-nonexistent");
		expect(resolved).toBeUndefined();
	});
});

// ── Task 5: edit_bet draft-only guard ─────────────────────────────────────────

describe("AK4 Task 5: edit_bet draft-only guard", () => {
	test("editBetTool.handler rejects an active bet — returns status=error, no DB write", async ({
		db,
	}) => {
		const TEAM_ID = "team-edit-guard";
		const BET_ID = "bet-active-edit-guard";
		const TM_ID = "tm-edit-guard";

		await db
			.insert(teams)
			.values({ id: TEAM_ID, name: "Edit Guard Team", phase: "build", createdAt: NOW });
		await db.insert(teamMembers).values({
			id: TM_ID,
			teamId: TEAM_ID,
			capacity: 3,
			activeBets: 0,
			formedAt: NOW,
		});
		await db.insert(bets).values({
			id: BET_ID,
			teamId: TEAM_ID,
			description: "Active bet — must not be editable by assistant",
			status: "active",
			createdAt: NOW,
		});

		const ctx = makeContext(db);
		const result = await editBetTool.handler({ betId: BET_ID, description: "Attempted edit" }, ctx);

		expect(result.status).toBe("error");

		// No DB write — description must remain unchanged
		const [bet] = await db.select().from(bets).where(eq(bets.id, BET_ID)).limit(1);
		expect(bet!.description).toBe("Active bet — must not be editable by assistant");
	});

	test("editBetTool.handler allows editing a draft bet — returns status=ok", async ({ db }) => {
		const TEAM_ID = "team-edit-draft";
		const BET_ID = "bet-draft-edit";
		const TM_ID = "tm-edit-draft";

		await db
			.insert(teams)
			.values({ id: TEAM_ID, name: "Edit Draft Team", phase: "build", createdAt: NOW });
		await db.insert(teamMembers).values({
			id: TM_ID,
			teamId: TEAM_ID,
			capacity: 3,
			activeBets: 0,
			formedAt: NOW,
		});
		await db.insert(bets).values({
			id: BET_ID,
			teamId: TEAM_ID,
			description: "Draft bet",
			status: "draft",
			createdAt: NOW,
		});

		const ctx = makeContext(db);
		const result = await editBetTool.handler(
			{ betId: BET_ID, description: "Updated description via assistant" },
			ctx,
		);

		expect(result.status).toBe("ok");

		const [bet] = await db.select().from(bets).where(eq(bets.id, BET_ID)).limit(1);
		expect(bet!.description).toBe("Updated description via assistant");
	});
});

// ── Team-inject via buildAssistantDraftRegistry.create_bet wrapper ────────────

describe("AK4 team-inject unit: create_bet wrapper hard-injects resolvedTeamId", () => {
	test("create_bet via registry with resolvedTeamId → writes correct teamId to DB", async ({
		db,
	}) => {
		const TEAM_ID = "team-inject-unit";
		const TM_ID = "tm-inject-unit";

		await db
			.insert(teams)
			.values({ id: TEAM_ID, name: "Inject Test Team", phase: "build", createdAt: NOW });
		await db.insert(teamMembers).values({
			id: TM_ID,
			teamId: TEAM_ID,
			capacity: 3,
			activeBets: 0,
			formedAt: NOW,
		});

		const ctx = makeContext(db);
		const registry = buildAssistantDraftRegistry(ctx, {
			resolvedTeamId: TEAM_ID,
			currentDraftBetId: undefined,
		});

		// Invoke create_bet WITHOUT any teamId (or with wrong teamId)
		// The wrapper must inject TEAM_ID
		const result = await registry.invoke("create_bet", {
			// teamId intentionally absent — wrapper must inject
			description: "Injected team bet",
		});

		expect(result.success).toBe(true);

		// Bet row must carry the injected TEAM_ID
		const allBets = await db.select().from(bets);
		const bet = allBets.find((b) => b.description === "Injected team bet");
		expect(bet).toBeDefined();
		expect(bet!.teamId).toBe(TEAM_ID);
	});

	test("create_bet via registry with undefined resolvedTeamId → returns error", async ({ db }) => {
		const ctx = makeContext(db);
		const registry = buildAssistantDraftRegistry(ctx, {
			resolvedTeamId: undefined, // no team
			currentDraftBetId: undefined,
		});

		const result = await registry.invoke("create_bet", {
			description: "Should fail — no team",
		});

		expect(result.success).toBe(false);
		// No bet created
		const allBets = await db.select().from(bets);
		expect(allBets).toHaveLength(0);
	});

	test("edit_bet via registry when currentDraftBetId is undefined → returns error", async ({
		db,
	}) => {
		const ctx = makeContext(db);
		const registry = buildAssistantDraftRegistry(ctx, {
			resolvedTeamId: "some-team",
			currentDraftBetId: undefined, // no draft yet
		});

		const result = await registry.invoke("edit_bet", {
			doneCondition: "Should fail — no draft",
		});

		expect(result.success).toBe(false);
	});
});

// ── Demoted from AK4 integration: callLlm-mocked runAssistantTurn tests ──────
//
// AC3a, AC4, AC4-loop-bound test deterministic loop logic in runAssistantTurn
// (draft guard, transcript resolution, iteration cap). They use vi.mock to
// control callLlm without a real network. Demoted to this unit in AR4.

const AK4_UNIT_TEAM_ID = "team-ak4-unit-loop";
const AK4_UNIT_TM_ID = "tm-ak4-unit-loop";
const AK4_UNIT_NOW = "2026-06-15T00:00:00.000Z";

function makePoolForLoopTests(): AdapterPool {
	const pool = new AdapterPool();
	pool.register("local-builtin-loop", new BuiltinHarnessAdapter(), {
		name: "Built-in Harness",
		kind: "local",
		type: "builtin",
		modelProviders: ["anthropic", "openrouter", "openai-compatible"],
		maxConcurrent: 4,
	});
	return pool;
}

const loopStubResolver: CredentialResolver = {
	resolve: async (name) => (name === "anthropic_api_key" ? "sk-test-ak4-unit" : null),
};

function makeTextResp(text: string): LlmResponse {
	return {
		stopReason: "end_turn",
		content: [{ type: "text", text }],
		usage: { inputTokens: 100, outputTokens: 50 },
	};
}

function makeToolResp(toolName: string, toolInput: Record<string, unknown>): LlmResponse {
	return {
		stopReason: "tool_use",
		content: [{ type: "tool_use", id: "tool-unit-001", name: toolName, input: toolInput }],
		usage: { inputTokens: 500, outputTokens: 100 },
	};
}

async function seedLoopUser(
	db: import("@hyperidle/db").HyperIdleDb,
	userId: string,
): Promise<void> {
	await db
		.insert(teams)
		.values({
			id: AK4_UNIT_TEAM_ID,
			name: "AK4 Loop Team",
			phase: "build",
			createdAt: AK4_UNIT_NOW,
		})
		.onConflictDoNothing();
	await db
		.insert(teamMembers)
		.values({
			id: AK4_UNIT_TM_ID,
			teamId: AK4_UNIT_TEAM_ID,
			capacity: 5,
			activeBets: 0,
			formedAt: AK4_UNIT_NOW,
		})
		.onConflictDoNothing();
	await db.insert(users).values({
		id: userId,
		kind: "human",
		name: "AK4 Loop User",
		role: "founder",
		status: "active",
		teamId: AK4_UNIT_TM_ID,
		createdAt: AK4_UNIT_NOW,
	});
	await db.insert(users).values({
		id: `ast-${userId}`,
		kind: "ai",
		name: "Assistant",
		role: "assistant",
		status: "active",
		harnessType: "builtin",
		modelId: "claude-sonnet-4-6",
		modelProvider: "anthropic",
		systemPrompt: "You are a helpful assistant.",
		maxConcurrentSessions: 1,
		createdAt: AK4_UNIT_NOW,
	});
}

async function seedThreadAndTrigger(
	db: import("@hyperidle/db").HyperIdleDb,
	userId: string,
	threadId: string,
	triggerMsgId: string,
	triggerText: string,
): Promise<void> {
	const { threads, messages: messagesDb } = await import("@hyperidle/db");
	await db.insert(threads).values({
		id: threadId,
		hostKind: "user",
		hostId: userId,
		initiatorId: userId,
		participants: JSON.stringify([userId, `ast-${userId}`]),
		lastActiveAt: AK4_UNIT_NOW,
		createdAt: AK4_UNIT_NOW,
	});
	await db.insert(messagesDb).values({
		id: triggerMsgId,
		threadId,
		senderId: userId,
		type: "plain",
		payload: JSON.stringify({ text: triggerText }),
		clientKey: `ck-${triggerMsgId}`,
		createdAt: AK4_UNIT_NOW,
	});
}

// ── AC3a: bet stays draft after turn, no autonomous commit ───────────────────

describe("AK4 AC3a (demoted): bet stays draft after create_bet turn — no autonomous commit", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", "test-key-ak4-unit");
		// AR4a: runAssistantTurn now delegates to provisionSession which calls getActiveStrategy().
		// The app fixture (which normally sets it) is not requested here — set it explicitly.
		setActiveStrategy(minimalStrategy);
	});
	afterEach(() => {
		vi.unstubAllEnvs();
		vi.clearAllMocks();
		clearActiveStrategy();
	});

	test("after create_bet tool_use, bet remains status=draft — no bet_state_changed(active)", async ({
		db,
		eventBus,
	}) => {
		await seedLoopUser(db, "u-ak4-unit-ac3a");
		const threadId = "thread-ak4-unit-ac3a";
		const triggerMsgId = "msg-ak4-unit-ac3a";
		await seedThreadAndTrigger(db, "u-ak4-unit-ac3a", threadId, triggerMsgId, "Draft a bet");

		callLlmMock
			.mockResolvedValueOnce(
				makeToolResp("create_bet", {
					description: "Stay draft bet",
					doneCondition: "Done when shipped",
				}),
			)
			.mockResolvedValueOnce(makeTextResp("Drafted!"));

		const stateChangedEvents: unknown[] = [];
		eventBus.on("bet_state_changed", (evt) => {
			stateChangedEvents.push(evt);
		});

		const deps: AssistantTurnDeps = {
			db,
			eventBus,
			adapterPool: makePoolForLoopTests(),
			credentialResolver: loopStubResolver,
		};

		await runAssistantTurn(deps, {
			userId: "u-ak4-unit-ac3a",
			threadId,
			triggerMessageId: triggerMsgId,
		});

		const allBets = await db.select().from(bets);
		const bet = allBets.find((b) => b.description === "Stay draft bet");
		expect(bet).toBeDefined();
		expect(bet!.status).toBe("draft");

		const activeChanges = stateChangedEvents.filter(
			(e) => (e as { status?: string }).status === "active",
		);
		expect(activeChanges).toHaveLength(0);
	});
});

// ── AC4: second turn edit_bet → same betId mutated, count stays 1 ─────────────

describe("AK4 AC4 (demoted): second turn edit_bet → same betId mutated, bet count stays 1", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", "test-key-ak4-unit");
		// AR4a: same as AC3a — strategy required for provisionSession.
		setActiveStrategy(minimalStrategy);
	});
	afterEach(() => {
		vi.unstubAllEnvs();
		vi.clearAllMocks();
		clearActiveStrategy();
	});

	test("turn1=create_bet, turn2=edit_bet (no client betId) → same bet mutated, count=1", async ({
		db,
		eventBus,
	}) => {
		await seedLoopUser(db, "u-ak4-unit-ac4");
		const threadId = "thread-ak4-unit-ac4";
		const trigger1 = "msg-ak4-unit-ac4-t1";
		await seedThreadAndTrigger(db, "u-ak4-unit-ac4", threadId, trigger1, "Draft a bet for me");

		callLlmMock
			.mockResolvedValueOnce(
				makeToolResp("create_bet", {
					description: "Initial bet description",
					doneCondition: "Initial done condition",
				}),
			)
			.mockResolvedValueOnce(makeTextResp("I drafted the bet!"));

		const deps: AssistantTurnDeps = {
			db,
			eventBus,
			adapterPool: makePoolForLoopTests(),
			credentialResolver: loopStubResolver,
		};

		await runAssistantTurn(deps, {
			userId: "u-ak4-unit-ac4",
			threadId,
			triggerMessageId: trigger1,
		});

		const allBetsAfterTurn1 = await db.select().from(bets);
		const userBetsAfterTurn1 = allBetsAfterTurn1;
		expect(userBetsAfterTurn1).toHaveLength(1);
		const originalBetId = userBetsAfterTurn1[0]!.id;

		// Turn 2: edit_bet (no betId from model — server must inject from transcript)
		vi.clearAllMocks();
		callLlmMock
			.mockResolvedValueOnce(
				makeToolResp("edit_bet", { doneCondition: "Updated done condition via edit" }),
			)
			.mockResolvedValueOnce(makeTextResp("I updated the done condition!"));

		const { messages: messagesDb } = await import("@hyperidle/db");
		const trigger2 = "msg-ak4-unit-ac4-t2";
		await db.insert(messagesDb).values({
			id: trigger2,
			threadId,
			senderId: "u-ak4-unit-ac4",
			type: "plain",
			payload: JSON.stringify({ text: "Update the done condition" }),
			clientKey: `ck-${trigger2}`,
			createdAt: new Date().toISOString(),
		});

		await runAssistantTurn(deps, {
			userId: "u-ak4-unit-ac4",
			threadId,
			triggerMessageId: trigger2,
		});

		const allBetsAfterTurn2 = await db.select().from(bets);
		const userBetsAfterTurn2 = allBetsAfterTurn2;
		expect(userBetsAfterTurn2).toHaveLength(1);
		const mutatedBet = userBetsAfterTurn2[0]!;
		expect(mutatedBet.id).toBe(originalBetId);
		expect(mutatedBet.doneCondition).toBe("Updated done condition via edit");
	});
});

// ── AC4-loop-bound: infinite tool_use → ≤MAX_TOOL_ITERATIONS + non-empty reply ──

describe("AK4 AC4-loop-bound (demoted): tool-use cap at MAX_TOOL_ITERATIONS=3, never-silent", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", "test-key-ak4-unit");
		// AR4a: same as AC3a — strategy required for provisionSession.
		setActiveStrategy(minimalStrategy);
	});
	afterEach(() => {
		vi.unstubAllEnvs();
		vi.clearAllMocks();
		clearActiveStrategy();
	});

	test("callLlm always returns tool_use → ≤3 create_bet rows created + non-empty reply persisted", async ({
		db,
		eventBus,
	}) => {
		await seedLoopUser(db, "u-ak4-unit-loop");
		const threadId = "thread-ak4-unit-loop";
		const triggerMsgId = "msg-ak4-unit-loop";
		await seedThreadAndTrigger(db, "u-ak4-unit-loop", threadId, triggerMsgId, "Draft bets forever");

		// Always return tool_use (never end_turn) — tests the iteration cap
		callLlmMock.mockResolvedValue(makeToolResp("create_bet", { description: "Loop test bet" }));

		const deps: AssistantTurnDeps = {
			db,
			eventBus,
			adapterPool: makePoolForLoopTests(),
			credentialResolver: loopStubResolver,
		};

		await runAssistantTurn(deps, {
			userId: "u-ak4-unit-loop",
			threadId,
			triggerMessageId: triggerMsgId,
		});

		// (a) loop was capped: ≤ MAX_TOOL_ITERATIONS (3) bets created
		const allBets = await db.select().from(bets);
		const userBets = allBets;
		expect(userBets.length).toBeLessThanOrEqual(3);

		// (b) a plain reply IS persisted (never-silent invariant)
		const { messages: messagesDb } = await import("@hyperidle/db");
		const allMsgs = await db.select().from(messagesDb).where(eq(messagesDb.threadId, threadId));

		const replyMsg = allMsgs.find(
			(m) =>
				m.senderId === "ast-u-ak4-unit-loop" &&
				!(JSON.parse(m.payload) as { notice?: unknown }).notice,
		);
		expect(replyMsg).toBeDefined();

		// (c) reply text is non-empty
		const payload = JSON.parse(replyMsg!.payload) as { text: string };
		expect(typeof payload.text).toBe("string");
		expect(payload.text.length).toBeGreaterThan(0);
	});
});
