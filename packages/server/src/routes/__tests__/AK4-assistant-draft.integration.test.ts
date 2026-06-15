/**
 * AK4 RED — Assistant can draft and shape a bet.
 *
 * All AC2/AC4 tests run through the REAL runChatTurn loop via
 * vi.mock("../llm-client.js") seam (same seam as builtin-harness-adapter.test.ts).
 * NO stub adapter that bypasses startSession — the plan requires the real
 * BuiltinHarnessAdapter, mocking only callLlm at the network boundary.
 *
 * AC1: text-only turn → plain reply persisted + event emitted (guards AH3).
 * AC2: create_bet tool_use → bets row status='draft', payload.toolCalls carries betId.
 * AC3a: bet stays draft after turn. AC3b: unit test (separate describe below).
 * AC4: second turn edit_bet → same betId mutated, bet count stays 1, no client betId needed.
 * AC4-loop-bound: infinite tool_use mock → ≤MAX_TOOL_ITERATIONS executions + non-empty reply.
 * Team-inject: wrong model teamId → row still carries resolved teams.id.
 */

import { bets, teamMembers, teams, users } from "@hyperidle/db";
import type {} from "@hyperidle/shared";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { AdapterPool } from "../../harness/adapter-pool.js";
import { BuiltinHarnessAdapter } from "../../harness/builtin-harness-adapter.js";
import type { LlmResponse } from "../../harness/llm-types.js";
import type { AssistantTurnDeps } from "../../services/assistant-turn.js";
import { runAssistantTurn } from "../../services/assistant-turn.js";
import type { CredentialResolver } from "../../services/credential-resolver.js";
import { test } from "../../test-fixtures.js";

// ── Mock callLlm at network boundary ─────────────────────────────────────────
// Same seam as builtin-harness-adapter.test.ts.
vi.mock("../../harness/llm-client.js", () => ({
	callLlm: vi.fn(),
}));

const { callLlm } = await import("../../harness/llm-client.js");
const callLlmMock = vi.mocked(callLlm);

// ── Helpers ───────────────────────────────────────────────────────────────────

const NOW = "2026-06-15T00:00:00.000Z";
const TEAM_ID = "team-ak4-test";
const TEAM_MEMBER_ID = "tm-ak4-test";

/** LlmResponse with text end_turn */
function makeTextResponse(text: string, inputTokens = 100, outputTokens = 50): LlmResponse {
	return {
		stopReason: "end_turn",
		content: [{ type: "text", text }],
		usage: { inputTokens, outputTokens },
	};
}

/** LlmResponse with a single tool_use block */
function makeToolCallResponse(
	toolName: string,
	toolInput: Record<string, unknown>,
	toolId = "tool-001",
	inputTokens = 500,
	outputTokens = 100,
): LlmResponse {
	return {
		stopReason: "tool_use",
		content: [{ type: "tool_use", id: toolId, name: toolName, input: toolInput }],
		usage: { inputTokens, outputTokens },
	};
}

/** Build a pool with a real BuiltinHarnessAdapter. */
function makePool(): AdapterPool {
	const pool = new AdapterPool();
	pool.register("local-builtin", new BuiltinHarnessAdapter(), {
		name: "Built-in Harness",
		kind: "local",
		type: "builtin",
		modelProviders: ["anthropic", "openrouter", "openai-compatible"],
		maxConcurrent: 4,
	});
	return pool;
}

/** Credential resolver that returns a fake key. */
const stubResolver: CredentialResolver = {
	resolve: async (name) => (name === "anthropic_api_key" ? "sk-test-ak4-fake" : null),
};

// ── Seed helpers ──────────────────────────────────────────────────────────────

async function seedTeamAndUser(
	db: import("@hyperidle/db").HyperIdleDb,
	userId: string,
): Promise<void> {
	// Team
	await db.insert(teams).values({ id: TEAM_ID, name: "AK4 Team", phase: "build", createdAt: NOW });
	// TeamMembers group (agent membership group)
	await db.insert(teamMembers).values({
		id: TEAM_MEMBER_ID,
		teamId: TEAM_ID,
		capacity: 5,
		activeBets: 0,
		formedAt: NOW,
	});
	// Human user — teamId references teamMembers.id (U1 two-hop)
	await db.insert(users).values({
		id: userId,
		kind: "human",
		name: "AK4 User",
		role: "founder",
		status: "active",
		teamId: TEAM_MEMBER_ID, // users.teamId → teamMembers.id (U1 lore)
		createdAt: NOW,
	});
	// Assistant agent for this user
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
		createdAt: NOW,
	});
}

/** Spin up the assistant thread via API and return its threadId. */
async function getOrCreateAssistantThread(
	app: import("hono").Hono,
	userId: string,
): Promise<string> {
	const res = await app.request("/api/threads/assistant", {
		method: "GET",
		headers: {
			"X-API-Key": "test-key-ak4",
			"X-Identity": userId,
		},
	});
	const body = (await res.json()) as { thread: { id: string } };
	return body.thread.id;
}

// ── AC1: Text-only turn — plain reply persisted, event emitted ────────────────

describe("AK4 AC1: text-only turn → plain reply persisted + thread_message_appended", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", "test-key-ak4");
	});
	afterEach(() => {
		vi.unstubAllEnvs();
		vi.clearAllMocks();
	});

	test("callLlm returns text end_turn → ast-* reply persisted with payload.text, no toolCalls", async ({
		db,
		eventBus,
	}) => {
		await seedTeamAndUser(db, "u-ak4-ac1");

		const REPLY_TEXT = "Hello from the assistant!";
		callLlmMock.mockResolvedValue(makeTextResponse(REPLY_TEXT));

		const pool = makePool();
		const deps: AssistantTurnDeps = {
			db,
			eventBus,
			adapterPool: pool,
			credentialResolver: stubResolver,
		};

		// Use a capturing adapter to verify thread_message_appended fires
		let appendedCount = 0;
		eventBus.on("thread_message_appended", () => {
			appendedCount++;
		});

		// We need a thread — use the real app to create one
		const { createTestApp } = await import("../../test-utils.js");
		const app = await createTestApp({ db, eventBus, adapterPool: pool });

		vi.stubEnv("HYPERIDLE_API_KEY", "test-key-ak4");
		const threadId = await getOrCreateAssistantThread(app, "u-ak4-ac1");

		// Post a human message to get the transcript seeded
		await app.request(`/api/threads/${threadId}/messages`, {
			method: "POST",
			headers: {
				"X-API-Key": "test-key-ak4",
				"X-Identity": "u-ak4-ac1",
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				type: "plain",
				payload: { text: "What should we work on?" },
				clientKey: "ck-ak4-ac1",
			}),
		});

		// Run the turn directly
		await runAssistantTurn(deps, {
			userId: "u-ak4-ac1",
			threadId,
			triggerMessageId: "msg-ac1",
		});

		// Assert: ast-* plain reply persisted
		const { messages } = await import("@hyperidle/db");
		const allMsgs = await db.select().from(messages).where(eq(messages.threadId, threadId));

		const replyMsg = allMsgs.find(
			(m) => m.senderId === "ast-u-ak4-ac1" && !JSON.parse(m.payload).notice,
		);
		expect(replyMsg).toBeDefined();

		const payload = JSON.parse(replyMsg!.payload) as { text: string; toolCalls?: unknown[] };
		expect(payload.text).toBe(REPLY_TEXT);
		// Text-only turn: no toolCalls
		expect(!payload.toolCalls || payload.toolCalls.length === 0).toBe(true);

		// thread_message_appended must have fired at least once
		expect(appendedCount).toBeGreaterThanOrEqual(1);
	});
});

// ── AC2: create_bet tool_use → draft bet + payload.toolCalls carries betId ────

describe("AK4 AC2: create_bet tool_use → bets row status=draft + payload.toolCalls.betId", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", "test-key-ak4");
	});
	afterEach(() => {
		vi.unstubAllEnvs();
		vi.clearAllMocks();
	});

	test("create_bet tool_use then text end_turn → draft bet persisted + toolCalls in reply payload", async ({
		db,
		eventBus,
	}) => {
		await seedTeamAndUser(db, "u-ak4-ac2");

		// Script: call 1 → create_bet tool_use (no teamId from model — hard-inject test)
		// The model omits teamId; the wrapper must inject it from resolveDraftTeamId
		callLlmMock
			.mockResolvedValueOnce(
				makeToolCallResponse("create_bet", {
					description: "Build a faster checkout flow",
					doneCondition: "Checkout completes in <3s",
				}),
			)
			.mockResolvedValueOnce(makeTextResponse("I've drafted that bet for you!"));

		const pool = makePool();
		const deps: AssistantTurnDeps = {
			db,
			eventBus,
			adapterPool: pool,
			credentialResolver: stubResolver,
		};

		const { createTestApp } = await import("../../test-utils.js");
		const app = await createTestApp({ db, eventBus, adapterPool: pool });

		const threadId = await getOrCreateAssistantThread(app, "u-ak4-ac2");

		// Post a human message to populate transcript
		await app.request(`/api/threads/${threadId}/messages`, {
			method: "POST",
			headers: {
				"X-API-Key": "test-key-ak4",
				"X-Identity": "u-ak4-ac2",
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				type: "plain",
				payload: { text: "Draft a bet to build a faster checkout flow" },
				clientKey: "ck-ak4-ac2",
			}),
		});

		await runAssistantTurn(deps, {
			userId: "u-ak4-ac2",
			threadId,
			triggerMessageId: "msg-ac2",
		});

		// Assert: bets row exists with status='draft'
		const allBets = await db.select().from(bets);
		const draftBet = allBets.find((b) => b.status === "draft");
		expect(draftBet).toBeDefined();
		expect(draftBet!.description).toBe("Build a faster checkout flow");
		expect(draftBet!.doneCondition).toBe("Checkout completes in <3s");

		// The teamId must be the RESOLVED teams.id, not a model-hallucinated value
		expect(draftBet!.teamId).toBe(TEAM_ID);

		// Assert: persisted reply has payload.toolCalls with create_bet ok + parseable betId
		const { messages } = await import("@hyperidle/db");
		const allMsgs = await db.select().from(messages).where(eq(messages.threadId, threadId));

		const replyMsg = allMsgs.find(
			(m) => m.senderId === "ast-u-ak4-ac2" && !JSON.parse(m.payload).notice,
		);
		expect(replyMsg).toBeDefined();

		const payload = JSON.parse(replyMsg!.payload) as {
			text: string;
			toolCalls?: Array<{ name: string; status: string; output: string }>;
		};
		expect(Array.isArray(payload.toolCalls)).toBe(true);
		expect(payload.toolCalls!.length).toBeGreaterThan(0);

		const createBetCall = payload.toolCalls!.find((tc) => tc.name === "create_bet");
		expect(createBetCall).toBeDefined();
		expect(createBetCall!.status).toBe("ok");

		// output must JSON-parse to include the betId
		const output = JSON.parse(createBetCall!.output) as { betId: string };
		expect(typeof output.betId).toBe("string");
		expect(output.betId).toBe(draftBet!.id);
	});

	test("team-inject: model supplies wrong teamId → row still carries resolved teams.id", async ({
		db,
		eventBus,
	}) => {
		await seedTeamAndUser(db, "u-ak4-inject");

		// Model supplies a wrong teamId — the wrapper must override it
		callLlmMock
			.mockResolvedValueOnce(
				makeToolCallResponse("create_bet", {
					teamId: "wrong-team-id-from-model",
					description: "Team inject test bet",
				}),
			)
			.mockResolvedValueOnce(makeTextResponse("Drafted!"));

		const pool = makePool();
		const deps: AssistantTurnDeps = {
			db,
			eventBus,
			adapterPool: pool,
			credentialResolver: stubResolver,
		};

		const { createTestApp } = await import("../../test-utils.js");
		const app = await createTestApp({ db, eventBus, adapterPool: pool });
		const threadId = await getOrCreateAssistantThread(app, "u-ak4-inject");

		await app.request(`/api/threads/${threadId}/messages`, {
			method: "POST",
			headers: {
				"X-API-Key": "test-key-ak4",
				"X-Identity": "u-ak4-inject",
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				type: "plain",
				payload: { text: "Draft a bet" },
				clientKey: "ck-ak4-inject",
			}),
		});

		await runAssistantTurn(deps, {
			userId: "u-ak4-inject",
			threadId,
			triggerMessageId: "msg-inject",
		});

		// Despite wrong model teamId, resolved teams.id must be in the row
		const allBets = await db.select().from(bets);
		const draftBet = allBets.find((b) => b.description === "Team inject test bet");
		expect(draftBet).toBeDefined();
		expect(draftBet!.teamId).toBe(TEAM_ID); // resolved, not "wrong-team-id-from-model"
	});
});

// ── AC3a: bet stays draft after turn, no autonomous commit ───────────────────

describe("AK4 AC3a: bet stays draft after turn — no autonomous commit", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", "test-key-ak4");
	});
	afterEach(() => {
		vi.unstubAllEnvs();
		vi.clearAllMocks();
	});

	test("after create_bet tool_use, bet remains status=draft — no bet_state_changed(active)", async ({
		db,
		eventBus,
	}) => {
		await seedTeamAndUser(db, "u-ak4-ac3a");

		callLlmMock
			.mockResolvedValueOnce(
				makeToolCallResponse("create_bet", {
					description: "Stay draft bet",
					doneCondition: "Done when shipped",
				}),
			)
			.mockResolvedValueOnce(makeTextResponse("Drafted!"));

		// Track any bet_state_changed events
		const stateChangedEvents: unknown[] = [];
		eventBus.on("bet_state_changed", (evt) => {
			stateChangedEvents.push(evt);
		});

		const pool = makePool();
		const deps: AssistantTurnDeps = {
			db,
			eventBus,
			adapterPool: pool,
			credentialResolver: stubResolver,
		};

		const { createTestApp } = await import("../../test-utils.js");
		const app = await createTestApp({ db, eventBus, adapterPool: pool });
		const threadId = await getOrCreateAssistantThread(app, "u-ak4-ac3a");

		await app.request(`/api/threads/${threadId}/messages`, {
			method: "POST",
			headers: {
				"X-API-Key": "test-key-ak4",
				"X-Identity": "u-ak4-ac3a",
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				type: "plain",
				payload: { text: "Draft a stay-draft bet" },
				clientKey: "ck-ak4-ac3a",
			}),
		});

		await runAssistantTurn(deps, {
			userId: "u-ak4-ac3a",
			threadId,
			triggerMessageId: "msg-ac3a",
		});

		// Bet must still be draft
		const allBets = await db.select().from(bets);
		const bet = allBets.find((b) => b.description === "Stay draft bet");
		expect(bet).toBeDefined();
		expect(bet!.status).toBe("draft");

		// No autonomous commit event
		const activeChanges = stateChangedEvents.filter(
			(e) => (e as { status?: string }).status === "active",
		);
		expect(activeChanges).toHaveLength(0);
	});
});

// ── AC4: second turn edit_bet → same betId mutated, count stays 1 ─────────────

describe("AK4 AC4: second turn edit_bet → same betId mutated, bet count stays 1", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", "test-key-ak4");
	});
	afterEach(() => {
		vi.unstubAllEnvs();
		vi.clearAllMocks();
	});

	test("turn1=create_bet, turn2=edit_bet (no client betId) → same bet mutated, count=1", async ({
		db,
		eventBus,
	}) => {
		await seedTeamAndUser(db, "u-ak4-ac4");

		// Turn 1: create_bet
		callLlmMock
			.mockResolvedValueOnce(
				makeToolCallResponse("create_bet", {
					description: "Initial bet description",
					doneCondition: "Initial done condition",
				}),
			)
			.mockResolvedValueOnce(makeTextResponse("I drafted the bet!"));

		const pool = makePool();
		const deps: AssistantTurnDeps = {
			db,
			eventBus,
			adapterPool: pool,
			credentialResolver: stubResolver,
		};

		const { createTestApp } = await import("../../test-utils.js");
		const app = await createTestApp({ db, eventBus, adapterPool: pool });
		const threadId = await getOrCreateAssistantThread(app, "u-ak4-ac4");

		await app.request(`/api/threads/${threadId}/messages`, {
			method: "POST",
			headers: {
				"X-API-Key": "test-key-ak4",
				"X-Identity": "u-ak4-ac4",
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				type: "plain",
				payload: { text: "Draft a bet for me" },
				clientKey: "ck-ak4-ac4-t1",
			}),
		});

		await runAssistantTurn(deps, {
			userId: "u-ak4-ac4",
			threadId,
			triggerMessageId: "msg-ac4-t1",
		});

		// Verify turn 1 created a bet
		const betsAfterTurn1 = await db.select().from(bets);
		expect(betsAfterTurn1).toHaveLength(1);
		const originalBetId = betsAfterTurn1[0]!.id;

		// Turn 2: edit_bet (model supplies NO betId — server must resolve it from transcript)
		vi.clearAllMocks();
		callLlmMock
			.mockResolvedValueOnce(
				makeToolCallResponse("edit_bet", {
					// Intentionally NO betId — server should inject it
					doneCondition: "Updated done condition via edit",
				}),
			)
			.mockResolvedValueOnce(makeTextResponse("I updated the done condition!"));

		// Post second human message to update transcript
		await app.request(`/api/threads/${threadId}/messages`, {
			method: "POST",
			headers: {
				"X-API-Key": "test-key-ak4",
				"X-Identity": "u-ak4-ac4",
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				type: "plain",
				payload: { text: "Update the done condition" },
				clientKey: "ck-ak4-ac4-t2",
			}),
		});

		await runAssistantTurn(deps, {
			userId: "u-ak4-ac4",
			threadId,
			triggerMessageId: "msg-ac4-t2",
		});

		// Assert: STILL only 1 bet (not 2)
		const betsAfterTurn2 = await db.select().from(bets);
		expect(betsAfterTurn2).toHaveLength(1);

		// Assert: the field was mutated on the SAME betId
		const mutatedBet = betsAfterTurn2[0]!;
		expect(mutatedBet.id).toBe(originalBetId);
		expect(mutatedBet.doneCondition).toBe("Updated done condition via edit");

		// Assert: reply has toolCalls with edit_bet ok
		const { messages } = await import("@hyperidle/db");
		const allMsgs = await db.select().from(messages).where(eq(messages.threadId, threadId));

		// Find last assistant reply (reverse the array then use find)
		const editReply = [...allMsgs]
			.reverse()
			.find(
				(m) =>
					m.senderId === "ast-u-ak4-ac4" && !(JSON.parse(m.payload) as { notice?: unknown }).notice,
			);
		expect(editReply).toBeDefined();
		const editPayload = JSON.parse(editReply!.payload) as {
			toolCalls?: Array<{ name: string; status: string }>;
		};
		expect(Array.isArray(editPayload.toolCalls)).toBe(true);
		const editBetCall = editPayload.toolCalls!.find((tc) => tc.name === "edit_bet");
		expect(editBetCall).toBeDefined();
		expect(editBetCall!.status).toBe("ok");
	});
});

// ── AC4-loop-bound: infinite tool_use → ≤3 executions + non-empty reply ──────

describe("AK4 AC4-loop-bound: tool-use cap at MAX_TOOL_ITERATIONS=3, never-silent", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", "test-key-ak4");
	});
	afterEach(() => {
		vi.unstubAllEnvs();
		vi.clearAllMocks();
	});

	test("callLlm always returns tool_use → ≤3 create_bet rows created + non-empty reply persisted", async ({
		db,
		eventBus,
	}) => {
		await seedTeamAndUser(db, "u-ak4-loop");

		// Script: ALWAYS return tool_use (never end_turn) — tests the cap
		callLlmMock.mockResolvedValue(
			makeToolCallResponse("create_bet", {
				description: "Loop test bet",
			}),
		);

		const pool = makePool();
		const deps: AssistantTurnDeps = {
			db,
			eventBus,
			adapterPool: pool,
			credentialResolver: stubResolver,
		};

		const { createTestApp } = await import("../../test-utils.js");
		const app = await createTestApp({ db, eventBus, adapterPool: pool });
		const threadId = await getOrCreateAssistantThread(app, "u-ak4-loop");

		await app.request(`/api/threads/${threadId}/messages`, {
			method: "POST",
			headers: {
				"X-API-Key": "test-key-ak4",
				"X-Identity": "u-ak4-loop",
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				type: "plain",
				payload: { text: "Draft bets forever" },
				clientKey: "ck-ak4-loop",
			}),
		});

		await runAssistantTurn(deps, {
			userId: "u-ak4-loop",
			threadId,
			triggerMessageId: "msg-loop",
		});

		// (a) loop was capped: ≤ MAX_TOOL_ITERATIONS (3) bets created
		const allBets = await db.select().from(bets);
		expect(allBets.length).toBeLessThanOrEqual(3);

		// (b) a plain reply IS persisted (never-silent invariant)
		const { messages } = await import("@hyperidle/db");
		const allMsgs = await db.select().from(messages).where(eq(messages.threadId, threadId));

		const replyMsg = allMsgs.find(
			(m) => m.senderId === "ast-u-ak4-loop" && !JSON.parse(m.payload).notice,
		);
		expect(replyMsg).toBeDefined();

		// (c) reply text is non-empty (never silent)
		const payload = JSON.parse(replyMsg!.payload) as { text: string };
		expect(typeof payload.text).toBe("string");
		expect(payload.text.length).toBeGreaterThan(0);
	});
});
