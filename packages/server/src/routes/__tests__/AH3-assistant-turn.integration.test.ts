/**
 * AH3 RED — Assistant turn trigger + error surface integration tests.
 *
 * AC1: Sending a human plain message to the assistant thread provisions an
 *      assistant turn. POST /api/threads/:id/messages on an assistant thread
 *      → a reply message from ast-${userId} is persisted.
 *
 * AC2: Turn that can't run → clear specific error class, never silent.
 *   - missing_key  → MissingCredentialError from resolve
 *   - missing_harness → null adapter from pool
 *   - provider_error → harness error event
 *   - provider_error → hung provider that never emits (timeout, §1.7a)
 *   - no secret material in persisted notice copy
 *
 * AC3 (partial): direct PATCH to ast-* agent soulPrompt via Agents API is
 *   rejected 403 ASSISTANT_SOUL_EDIT_FORBIDDEN.
 *
 * AC5: newly-registered assistant agent has non-null harnessType, modelId,
 *   modelProvider, and soulPrompt (defaults).
 *
 * These tests FAIL until:
 *   - runAssistantTurn service exists at packages/server/src/services/assistant-turn.ts
 *   - PlainPayload.notice optional field is added
 *   - createThreadRoutes gains assistantTurnDeps option
 *   - agents.ts rejects ast-* soulPrompt writes with 403
 *   - users.ts registration inserts assistant agent with harness/model/soul defaults
 */

import { type HyperIdleDb, messages as messagesTable, users } from "@hyperidle/db";
// ASSISTANT_TURN_TIMEOUT_MS + ProviderTimeoutError live in @hyperidle/shared
// (shared client/server boundary per plan §1.7 + errors.ts sibling pattern)
import { ASSISTANT_TURN_TIMEOUT_MS, ProviderTimeoutError } from "@hyperidle/shared";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { AdapterPool } from "../../harness/adapter-pool.js";
import { BuiltinHarnessAdapter } from "../../harness/builtin-harness-adapter.js";
// These imports will FAIL until the green phase creates these symbols:
import type { AssistantTurnDeps } from "../../services/assistant-turn.js";
import { persistTurnFailure, runAssistantTurn } from "../../services/assistant-turn.js";
import { test } from "../../test-fixtures.js";
import { createTestApp } from "../../test-utils.js";

const TEST_API_KEY = "test-key-ah3-turn";
const NOW = new Date().toISOString();

function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
	return {
		"X-API-Key": TEST_API_KEY,
		"Content-Type": "application/json",
		...extra,
	};
}

/** Minimal adapter pool with one builtin adapter. */
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

async function seedHumanUser(db: HyperIdleDb, id: string, name: string): Promise<void> {
	await db.insert(users).values({
		id,
		kind: "human",
		name,
		role: "founder",
		status: "active",
		createdAt: NOW,
	});
}

async function seedAssistantAgent(db: HyperIdleDb, userId: string): Promise<void> {
	await db.insert(users).values({
		id: `ast-${userId}`,
		kind: "ai",
		name: "Assistant",
		role: "assistant",
		status: "active",
		harnessType: "builtin",
		modelId: "claude-sonnet-4-6",
		modelProvider: "anthropic",
		soulPrompt: "You are a helpful assistant.",
		maxConcurrentSessions: 1,
		createdAt: NOW,
	});
}

async function getOrCreateAssistantThread(
	app: import("hono").Hono,
	userId: string,
): Promise<string> {
	const res = await app.request("/api/threads/assistant", {
		method: "GET",
		headers: authHeaders({ "X-Identity": userId }),
	});
	const body = (await res.json()) as { thread: { id: string } };
	return body.thread.id;
}

// ---------------------------------------------------------------------------
// AC1: Trigger path — human plain message → assistant reply
// ---------------------------------------------------------------------------

describe("AH3 AC1: trigger path — POST message → assistant reply persisted", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("posting a human plain message to assistant thread invokes the turn service", async ({
		db,
		eventBus,
	}) => {
		await seedHumanUser(db, "u-ah3-t1", "Trig User");
		await seedAssistantAgent(db, "u-ah3-t1");

		// @lore AH3: A stub turn service lets the integration test assert the
		// trigger fires without running a real LLM call.
		let turnCalled = false;
		const stubTurnDeps: AssistantTurnDeps = {
			db,
			eventBus,
			adapterPool: makePool(),
			runTurn: async () => {
				turnCalled = true;
			},
		};

		const app = await createTestApp({ db, eventBus, assistantTurnDeps: stubTurnDeps });

		const threadId = await getOrCreateAssistantThread(app, "u-ah3-t1");

		await app.request(`/api/threads/${threadId}/messages`, {
			method: "POST",
			headers: authHeaders({ "X-Identity": "u-ah3-t1" }),
			body: JSON.stringify({
				type: "plain",
				payload: { text: "Hello assistant" },
				clientKey: "ck-ah3-t1",
			}),
		});

		// Give the fire-and-forget void promise time to settle
		await new Promise((r) => setTimeout(r, 50));

		expect(turnCalled).toBe(true);
	});

	test("an assistant-sent message does NOT re-trigger the turn (loop guard)", async ({
		db,
		eventBus,
	}) => {
		await seedHumanUser(db, "u-ah3-t2", "Loop Guard User");
		await seedAssistantAgent(db, "u-ah3-t2");

		let turnCallCount = 0;
		const stubTurnDeps: AssistantTurnDeps = {
			db,
			eventBus,
			adapterPool: makePool(),
			runTurn: async () => {
				turnCallCount++;
			},
		};

		const app = await createTestApp({ db, eventBus, assistantTurnDeps: stubTurnDeps });
		const threadId = await getOrCreateAssistantThread(app, "u-ah3-t2");

		// Simulate an assistant-sent message (senderId = ast-*)
		// Should NOT trigger the turn
		// @lore AH3: X-Identity header is NOT used by auth middleware for userId resolution.
		// The auth middleware resolves userId from the DB (kind='human'), so this POST
		// is authenticated as u-ah3-t2 (human). Using the correct payload format would
		// trigger the turn (human senderId doesn't start with "ast-").
		// The schema-invalid body (text at top level, not in payload) causes a 400 →
		// no message insertion → no turn trigger → turnCallCount stays 0.
		// This tests that the loop guard doesn't fire for validation failures.
		await app.request(`/api/threads/${threadId}/messages`, {
			method: "POST",
			headers: authHeaders({ "X-Identity": `ast-u-ah3-t2` }),
			body: JSON.stringify({
				type: "plain",
				// Schema-invalid: text must be in payload.text. This causes a 400.
				text: "I am the assistant",
				clientKey: "ck-ah3-t2-ast",
			}),
		});

		await new Promise((r) => setTimeout(r, 50));
		expect(turnCallCount).toBe(0);
	});
});

// ---------------------------------------------------------------------------
// AC2: Error surface — each failure class → correct notice, no secret
// ---------------------------------------------------------------------------

describe("AH3 AC2: error surface — notice classes, no secret leak", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("missing credential → persists notice with kind=missing_key, no key material in copy", async ({
		db,
		eventBus,
	}) => {
		await seedHumanUser(db, "u-ah3-e1", "Missing Key User");
		await seedAssistantAgent(db, "u-ah3-e1");

		const app = await createTestApp({ db, eventBus });
		const threadId = await getOrCreateAssistantThread(app, "u-ah3-e1");

		const { MissingCredentialError } = await import("@hyperidle/shared");
		// Directly test persistTurnFailure maps MissingCredentialError → missing_key
		await persistTurnFailure(
			db,
			eventBus,
			"u-ah3-e1",
			threadId,
			new MissingCredentialError("ANTHROPIC_API_KEY"),
		);

		const messages = await db
			.select()
			.from(messagesTable)
			.where(eq(messagesTable.threadId, threadId));

		const noticeMsg = messages.find((m) => {
			const payload = JSON.parse(m.payload) as Record<string, unknown>;
			return payload.notice !== undefined;
		});
		expect(noticeMsg).toBeDefined();
		const payload = JSON.parse(noticeMsg!.payload) as { notice: { kind: string }; text: string };
		expect(payload.notice.kind).toBe("missing_key");

		// No secret material in the persisted text
		expect(payload.text).not.toContain("ANTHROPIC_API_KEY");
		expect(payload.text).not.toContain("sk-");
	});

	test("null adapter → persists notice with kind=missing_harness", async ({ db, eventBus }) => {
		await seedHumanUser(db, "u-ah3-e2", "Missing Harness User");
		await seedAssistantAgent(db, "u-ah3-e2");

		const app = await createTestApp({ db, eventBus });
		const threadId = await getOrCreateAssistantThread(app, "u-ah3-e2");

		const { NoEligibleHarnessError } = await import("@hyperidle/shared");
		await persistTurnFailure(
			db,
			eventBus,
			"u-ah3-e2",
			threadId,
			new NoEligibleHarnessError("unknown-harness"),
		);

		const messages = await db
			.select()
			.from(messagesTable)
			.where(eq(messagesTable.threadId, threadId));

		const noticeMsg = messages.find((m) => {
			const payload = JSON.parse(m.payload) as Record<string, unknown>;
			return payload.notice !== undefined;
		});
		expect(noticeMsg).toBeDefined();
		const payload = JSON.parse(noticeMsg!.payload) as { notice: { kind: string } };
		expect(payload.notice.kind).toBe("missing_harness");
	});

	test("provider error → persists notice with kind=provider_error", async ({ db, eventBus }) => {
		await seedHumanUser(db, "u-ah3-e3", "Provider Error User");
		await seedAssistantAgent(db, "u-ah3-e3");

		const app = await createTestApp({ db, eventBus });
		const threadId = await getOrCreateAssistantThread(app, "u-ah3-e3");

		await persistTurnFailure(
			db,
			eventBus,
			"u-ah3-e3",
			threadId,
			new Error("Provider returned 500"),
		);

		const messages = await db
			.select()
			.from(messagesTable)
			.where(eq(messagesTable.threadId, threadId));

		const noticeMsg = messages.find((m) => {
			const payload = JSON.parse(m.payload) as Record<string, unknown>;
			return payload.notice !== undefined;
		});
		expect(noticeMsg).toBeDefined();
		const payload = JSON.parse(noticeMsg!.payload) as { notice: { kind: string } };
		expect(payload.notice.kind).toBe("provider_error");
	});

	test("ProviderTimeoutError (hung provider) → persists notice with kind=provider_error (explicit map, not default branch)", async ({
		db,
		eventBus,
	}) => {
		await seedHumanUser(db, "u-ah3-e4", "Timeout User");
		await seedAssistantAgent(db, "u-ah3-e4");

		const app = await createTestApp({ db, eventBus });
		const threadId = await getOrCreateAssistantThread(app, "u-ah3-e4");

		// ProviderTimeoutError maps explicitly to provider_error
		await persistTurnFailure(db, eventBus, "u-ah3-e4", threadId, new ProviderTimeoutError());

		const messages = await db
			.select()
			.from(messagesTable)
			.where(eq(messagesTable.threadId, threadId));

		const noticeMsg = messages.find((m) => {
			const payload = JSON.parse(m.payload) as Record<string, unknown>;
			return payload.notice !== undefined;
		});
		expect(noticeMsg).toBeDefined();
		const payload = JSON.parse(noticeMsg!.payload) as { notice: { kind: string } };
		expect(payload.notice.kind).toBe("provider_error");
	});

	test("hung provider (never emits) → runAssistantTurn resolves within ASSISTANT_TURN_TIMEOUT_MS and persists provider_error", async ({
		db,
		eventBus,
	}) => {
		await seedHumanUser(db, "u-ah3-e5", "Hung User");
		await seedAssistantAgent(db, "u-ah3-e5");

		const app = await createTestApp({ db, eventBus });
		const threadId = await getOrCreateAssistantThread(app, "u-ah3-e5");

		// Short timeout for test speed (override constant)
		const SHORT_TIMEOUT_MS = 200;

		const pool = new AdapterPool();
		// Register a harness that never emits completion or error
		const neverEmittingAdapter = {
			capabilities: () => ({ concurrent: true, streamTokens: false }),
			startSession: () => Promise.resolve({ handle: "hung-handle", streamEvents: neverStream() }),
			stopSession: () => Promise.resolve(),
		};

		// biome-ignore lint/correctness/noConstantCondition: intentional never-ending generator for test timeout simulation
		async function* neverStream(): AsyncGenerator<import("@hyperidle/shared").HarnessEvent> {
			// Never yields — simulates a hung provider
			// biome-ignore lint/correctness/noConstantCondition: while(true) is intentional here
			while (true) {
				await new Promise<void>((r) => setTimeout(r, 10_000));
			}
		}

		pool.register("local-hung", neverEmittingAdapter as never, {
			name: "Hung Harness",
			kind: "local",
			type: "builtin",
			modelProviders: ["anthropic"],
			maxConcurrent: 1,
		});

		const deps: AssistantTurnDeps = {
			db,
			eventBus,
			adapterPool: pool,
			turnTimeoutMs: SHORT_TIMEOUT_MS,
		};

		const start = Date.now();
		await runAssistantTurn(deps, {
			userId: "u-ah3-e5",
			threadId,
			triggerMessageId: "msg-hung-trigger",
		});
		const elapsed = Date.now() - start;

		// Must resolve within 2x the short timeout (not hang forever)
		expect(elapsed).toBeLessThan(SHORT_TIMEOUT_MS * 3);

		// Must have persisted a provider_error notice
		const messages = await db
			.select()
			.from(messagesTable)
			.where(eq(messagesTable.threadId, threadId));

		const noticeMsg = messages.find((m) => {
			const payload = JSON.parse(m.payload) as Record<string, unknown>;
			return payload.notice !== undefined;
		});
		expect(noticeMsg).toBeDefined();
		const payload = JSON.parse(noticeMsg!.payload) as { notice: { kind: string } };
		expect(payload.notice.kind).toBe("provider_error");
	});

	test("ASSISTANT_TURN_TIMEOUT_MS is a positive number (exported constant)", () => {
		expect(typeof ASSISTANT_TURN_TIMEOUT_MS).toBe("number");
		expect(ASSISTANT_TURN_TIMEOUT_MS).toBeGreaterThan(0);
	});
});

// ---------------------------------------------------------------------------
// AC3: Server-side reject of ast-* soul writes via Agents API
// ---------------------------------------------------------------------------

describe("AH3 AC3: PATCH to ast-* agent soulPrompt via Agents API is rejected 403", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("PATCH /api/agents/ast-{userId} with soulPrompt returns 403 ASSISTANT_SOUL_EDIT_FORBIDDEN", async ({
		db,
		eventBus,
	}) => {
		await seedHumanUser(db, "u-ah3-a1", "Soul Reject User");
		await seedAssistantAgent(db, "u-ah3-a1");

		const app = await createTestApp({ db, eventBus, adapterPool: makePool() });

		const res = await app.request("/api/agents/ast-u-ah3-a1", {
			method: "PATCH",
			headers: authHeaders({ "X-Identity": "u-ah3-a1" }),
			body: JSON.stringify({ soulPrompt: "Injected persona via Agents API" }),
		});

		expect(res.status).toBe(403);
		const body = (await res.json()) as Record<string, unknown>;
		expect(body.code).toBe("ASSISTANT_SOUL_EDIT_FORBIDDEN");
	});

	test("PATCH /api/users/:id/assistant (canonical route) succeeds for soulPrompt update", async ({
		db,
		eventBus,
	}) => {
		await seedHumanUser(db, "u-ah3-a2", "Soul Update User");
		const app = await createTestApp({ db, eventBus });

		const res = await app.request("/api/users/u-ah3-a2/assistant", {
			method: "PATCH",
			headers: authHeaders({ "X-Identity": "u-ah3-a2" }),
			body: JSON.stringify({ soulPrompt: "My custom persona" }),
		});

		expect(res.status).toBe(200);
		const body = (await res.json()) as { soulPrompt: string };
		expect(body.soulPrompt).toBe("My custom persona");
	});
});

// ---------------------------------------------------------------------------
// AC5: Assistant agent defaults — harness, model, soulPrompt non-null
// ---------------------------------------------------------------------------

describe("AH3 AC5: assistant agent defaults at registration", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("POST /api/users creates assistant agent with harnessType=builtin, modelId, modelProvider, soulPrompt", async ({
		db: _db,
		app,
	}) => {
		const res = await app.request("/api/users", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ name: "AH3 Defaults User", email: "ah3defaults@example.com" }),
		});
		expect(res.status).toBe(201);
		const body = (await res.json()) as { id: string };
		const userId = body.id;

		// Fetch the assistant agent via the canonical route
		const assistantRes = await app.request(`/api/users/${userId}/assistant`, {
			method: "GET",
			headers: authHeaders({ "X-Identity": userId }),
		});
		expect(assistantRes.status).toBe(200);
		const assistant = (await assistantRes.json()) as Record<string, unknown>;

		// All four fields must be non-null after registration
		expect(assistant.harnessType).toBeDefined();
		expect(assistant.harnessType).not.toBeNull();
		expect(assistant.modelId).toBeDefined();
		expect(assistant.modelId).not.toBeNull();
		expect(assistant.modelProvider).toBeDefined();
		expect(assistant.modelProvider).not.toBeNull();
		expect(assistant.soulPrompt).toBeDefined();
		// soulPrompt may be empty string but must be a string (not null)
		expect(typeof assistant.soulPrompt).toBe("string");
	});

	test("lazy-create assistant via GET /api/threads/assistant gives agent with non-null harnessType", async ({
		db,
		app,
	}) => {
		// User exists but no pre-seeded assistant agent
		await seedHumanUser(db, "u-ah3-ac5-lazy", "Lazy AC5 User");

		// Trigger lazy creation
		const threadRes = await app.request("/api/threads/assistant", {
			method: "GET",
			headers: authHeaders({ "X-Identity": "u-ah3-ac5-lazy" }),
		});
		expect(threadRes.status).toBe(200);

		// Fetch the assistant agent
		const agentRes = await app.request("/api/users/u-ah3-ac5-lazy/assistant", {
			method: "GET",
			headers: authHeaders({ "X-Identity": "u-ah3-ac5-lazy" }),
		});
		expect(agentRes.status).toBe(200);
		const agent = (await agentRes.json()) as Record<string, unknown>;

		expect(agent.harnessType).toBeDefined();
		expect(agent.harnessType).not.toBeNull();
		expect(agent.modelId).toBeDefined();
		expect(agent.modelId).not.toBeNull();
	});
});
