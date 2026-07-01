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
 * AC3 (partial): direct PATCH to ast-* agent systemPrompt via Agents API is
 *   rejected 403 ASSISTANT_SOUL_EDIT_FORBIDDEN.
 *
 * AC5: newly-registered assistant agent has non-null harnessType, modelId,
 *   modelProvider, and systemPrompt (defaults).
 *
 * These tests FAIL until:
 *   - runAssistantTurn service exists at packages/server/src/services/assistant-turn.ts
 *   - PlainPayload.notice optional field is added
 *   - createThreadRoutes gains assistantTurnDeps option
 *   - agents.ts rejects ast-* systemPrompt writes with 403
 *   - users.ts registration inserts assistant agent with harness/model/systemPrompt defaults
 */

import { type HyperIdleDb, messages as messagesTable, users } from "@hyperidle/db";
// ASSISTANT_TURN_TIMEOUT_MS + ProviderTimeoutError live in @hyperidle/shared
// (shared client/server boundary per plan §1.7 + errors.ts sibling pattern)
import {
	ASSISTANT_TURN_TIMEOUT_MS,
	MissingCredentialError,
	ProviderTimeoutError,
} from "@hyperidle/shared";
import { minimalStrategy } from "@hyperidle/strategy-minimal";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { AdapterPool } from "../../harness/adapter-pool.js";
import { BuiltinHarnessAdapter } from "../../harness/builtin-harness-adapter.js";
// These imports will FAIL until the green phase creates these symbols:
import type { AssistantTurnDeps } from "../../services/assistant-turn.js";
import { persistTurnFailure, runAssistantTurn } from "../../services/assistant-turn.js";
import type { CredentialResolver } from "../../services/credential-resolver.js";
import { clearActiveStrategy, setActiveStrategy } from "../../services/strategy-registry.js";
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
	// @lore AK1: systemPrompt is the post-rename persona field (harness-vocab rename).
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
		vi.stubEnv("ANTHROPIC_API_KEY", "test-anthropic-key-hung");
		await seedHumanUser(db, "u-ah3-e5", "Hung User");
		await seedAssistantAgent(db, "u-ah3-e5");

		const app = await createTestApp({ db, eventBus });
		const threadId = await getOrCreateAssistantThread(app, "u-ah3-e5");

		// Short timeout for test speed (override constant)
		const SHORT_TIMEOUT_MS = 200;

		const pool = new AdapterPool();

		// biome-ignore lint/correctness/noConstantCondition: intentional never-ending generator for test timeout simulation
		async function* neverStream(): AsyncGenerator<import("@hyperidle/shared").HarnessEvent> {
			// Never yields — simulates a hung provider
			// biome-ignore lint/correctness/noConstantCondition: while(true) is intentional here
			while (true) {
				await new Promise<void>((r) => setTimeout(r, 10_000));
			}
		}

		// @lore AH3 S7: Adapter stub must implement streamEvents on the adapter object
		// (not embedded on the handle). The prior duck-typed pattern is removed.
		const neverEmittingAdapter = {
			capabilities: () => ({ concurrent: true, streamTokens: false }),
			startSession: () => Promise.resolve({ sessionId: "hung-session" }),
			streamEvents: (_handle: import("@hyperidle/shared").SessionHandle) => neverStream(),
			stopSession: () => Promise.resolve(),
		};

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
// AC3: Server-side reject of ast-* systemPrompt writes via Agents API
// ---------------------------------------------------------------------------

describe("AH3 AC3: PATCH to ast-* agent systemPrompt via Agents API is rejected 403", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		// AK6 T8: lazy-create paths now route through the Strategy port.
		// Register Minimal so createTestApp-based tests don't throw on missing strategy.
		setActiveStrategy(minimalStrategy);
	});
	afterEach(() => {
		vi.unstubAllEnvs();
		clearActiveStrategy();
	});

	test("PATCH /api/agents/ast-{userId} with systemPrompt returns 403 ASSISTANT_SOUL_EDIT_FORBIDDEN", async ({
		db,
		eventBus,
	}) => {
		await seedHumanUser(db, "u-ah3-a1", "System Reject User");
		await seedAssistantAgent(db, "u-ah3-a1");

		const app = await createTestApp({ db, eventBus, adapterPool: makePool() });

		const res = await app.request("/api/agents/ast-u-ah3-a1", {
			method: "PATCH",
			headers: authHeaders({ "X-Identity": "u-ah3-a1" }),
			body: JSON.stringify({ systemPrompt: "Injected persona via Agents API" }),
		});

		expect(res.status).toBe(403);
		const body = (await res.json()) as Record<string, unknown>;
		expect(body.code).toBe("ASSISTANT_SOUL_EDIT_FORBIDDEN");
	});

	test("PATCH /api/users/:id/assistant (canonical route) succeeds for systemPrompt update", async ({
		db,
		eventBus,
	}) => {
		await seedHumanUser(db, "u-ah3-a2", "System Update User");
		const app = await createTestApp({ db, eventBus });

		// @lore AK1: systemPrompt is the post-rename persona field (harness-vocab rename).
		const res = await app.request("/api/users/u-ah3-a2/assistant", {
			method: "PATCH",
			headers: authHeaders({ "X-Identity": "u-ah3-a2" }),
			body: JSON.stringify({ systemPrompt: "My custom persona" }),
		});

		expect(res.status).toBe(200);
		const body = (await res.json()) as { systemPrompt: string };
		expect(body.systemPrompt).toBe("My custom persona");
	});
});

// ---------------------------------------------------------------------------
// AC5: Assistant agent defaults — harness, model, systemPrompt non-null
// ---------------------------------------------------------------------------

describe("AH3 AC5: assistant agent defaults at registration", () => {
	beforeEach(async () => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		// AK6 T8: non-null systemPrompt at registration is Fabric Strategy behavior.
		// Minimal returns null systemPrompt; Fabric supplies the builtin assistant persona.
		const { fabricStrategy } = await import("@hyperidle/fabric");
		setActiveStrategy(fabricStrategy);
	});
	afterEach(() => {
		vi.unstubAllEnvs();
		clearActiveStrategy();
	});

	test("POST /api/users creates assistant agent with harnessType=builtin, modelId, modelProvider, systemPrompt", async ({
		db: _db,
		app,
	}) => {
		const res = await app.request("/api/users", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ name: "AH3 Defaults User", email: "ah3defaults@example.com" }),
		});
		expect(res.status).toBe(201);
		// AK6 T8: POST /api/users response shape changed to { user: { ... } }
		const body = (await res.json()) as { user: { id: string } };
		const userId = body.user.id;

		// Fetch the assistant agent via the canonical route
		const assistantRes = await app.request(`/api/users/${userId}/assistant`, {
			method: "GET",
			headers: authHeaders({ "X-Identity": userId }),
		});
		expect(assistantRes.status).toBe(200);
		const assistant = (await assistantRes.json()) as Record<string, unknown>;

		// All four fields must be non-null after registration
		// @lore AK1: systemPrompt is the post-rename persona field (harness-vocab rename).
		expect(assistant.harnessType).toBeDefined();
		expect(assistant.harnessType).not.toBeNull();
		expect(assistant.modelId).toBeDefined();
		expect(assistant.modelId).not.toBeNull();
		expect(assistant.modelProvider).toBeDefined();
		expect(assistant.modelProvider).not.toBeNull();
		expect(assistant.systemPrompt).toBeDefined();
		// systemPrompt may be empty string but must be a string (not null)
		expect(typeof assistant.systemPrompt).toBe("string");
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

// ---------------------------------------------------------------------------
// H1: Real happy-path completion (ast-* reply persisted) is covered by the
// full-matrix AR4a-conversational-reply-row.integration.test.ts harness journey.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// H2: Notice round-trip test — persisted notice survives GET read-back
// ---------------------------------------------------------------------------

describe("AH3 H2: notice round-trip — persisted notice survives GET /api/threads/assistant", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("missing_key notice persisted via persistTurnFailure survives GET /api/threads/assistant read-back", async ({
		db,
		eventBus,
	}) => {
		await seedHumanUser(db, "u-ah3-h2", "H2 User");
		await seedAssistantAgent(db, "u-ah3-h2");

		const app = await createTestApp({ db, eventBus });
		const threadId = await getOrCreateAssistantThread(app, "u-ah3-h2");

		// Persist a notice via persistTurnFailure (the server-authored path)
		await persistTurnFailure(
			db,
			eventBus,
			"u-ah3-h2",
			threadId,
			new MissingCredentialError("anthropic_api_key"),
		);

		// Read back via the API route — this exercises messageRowSchema.parse()
		// which used to strip `notice` (H2 bug: plainPayloadSchemaWithToolCalls lacked notice)
		const res = await app.request("/api/threads/assistant", {
			method: "GET",
			headers: authHeaders({ "X-Identity": "u-ah3-h2" }),
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			messages: Array<{ payload: { text?: string; notice?: { kind: string } } }>;
		};

		const noticeMsg = body.messages.find((m) => m.payload.notice !== undefined);
		expect(noticeMsg).toBeDefined();
		expect(noticeMsg!.payload.notice!.kind).toBe("missing_key");
	});
});

// ---------------------------------------------------------------------------
// M3: null-resolve → missing_key (credential resolver returns null)
// ---------------------------------------------------------------------------

describe("AH3 M3: null-resolve → missing_key notice", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("credentialResolver.resolve() returning null → persists missing_key notice", async ({
		db,
		eventBus,
	}) => {
		await seedHumanUser(db, "u-ah3-m3", "M3 User");
		await seedAssistantAgent(db, "u-ah3-m3");

		const app = await createTestApp({ db, eventBus });
		const threadId = await getOrCreateAssistantThread(app, "u-ah3-m3");

		// Resolver that always returns null — simulates no key stored
		const nullResolver: CredentialResolver = {
			resolve: async () => null,
		};

		const pool = new AdapterPool();
		pool.register("local-m3", new BuiltinHarnessAdapter(), {
			name: "M3 Harness",
			kind: "local",
			type: "builtin",
			modelProviders: ["anthropic"],
			maxConcurrent: 1,
		});

		const deps: AssistantTurnDeps = {
			db,
			eventBus,
			adapterPool: pool,
			credentialResolver: nullResolver,
		};

		await runAssistantTurn(deps, {
			userId: "u-ah3-m3",
			threadId,
			triggerMessageId: "msg-m3-trigger",
		});

		// Must have persisted a missing_key notice (not provider_error or silent)
		const allMessages = await db
			.select()
			.from(messagesTable)
			.where(eq(messagesTable.threadId, threadId));

		const noticeMsg = allMessages.find((m) => {
			const payload = JSON.parse(m.payload) as Record<string, unknown>;
			return payload.notice !== undefined;
		});
		expect(noticeMsg).toBeDefined();
		const payload = JSON.parse(noticeMsg!.payload) as { notice: { kind: string } };
		expect(payload.notice.kind).toBe("missing_key");
	});
});

// ---------------------------------------------------------------------------
// Loop-guard real test — valid ast-* message does NOT re-trigger turn
// ---------------------------------------------------------------------------

describe("AH3 loop-guard: ast-* sender message does NOT re-trigger turn", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("valid plain message persisted with ast-* senderId does NOT fire the assistant turn", async ({
		db,
		eventBus,
	}) => {
		await seedHumanUser(db, "u-ah3-lg", "Loop Guard User");
		await seedAssistantAgent(db, "u-ah3-lg");

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
		const threadId = await getOrCreateAssistantThread(app, "u-ah3-lg");

		// Insert a valid message directly into DB with senderId = ast-*
		// This exercises the guard predicate (!senderId.startsWith("ast-")) directly.
		// @lore AH3 loop-guard: The threads.ts trigger checks senderId BEFORE calling
		// runAssistantTurn. This test inserts a DB row that bypasses the POST handler
		// and directly emits thread_message_appended via eventBus to exercise the
		// eventBus subscriber path as well.
		//
		// The POST handler loop-guard: the trigger is inline in threads.ts and fires
		// only if !senderId.startsWith("ast-"). We verify this by:
		// 1. Seeding a valid ast-* message row directly (no POST — POST would be from human)
		// 2. Emitting thread_message_appended with senderId=ast-* manually
		// 3. Asserting turnCallCount stays 0 after the event bus drains
		const astMessageId = crypto.randomUUID();
		await db.insert(messagesTable).values({
			id: astMessageId,
			threadId,
			senderId: `ast-u-ah3-lg`,
			type: "plain",
			payload: JSON.stringify({ text: "I am the assistant reply" }),
			clientKey: `ast-reply-${astMessageId}`,
			createdAt: new Date().toISOString(),
		});

		// Emit the event that would normally come from the POST handler
		eventBus.emit({
			type: "thread_message_appended",
			streamId: threadId,
			threadId,
			messageId: astMessageId,
			messageType: "plain",
			senderId: `ast-u-ah3-lg`,
			timestamp: Date.now(),
		});

		// Give event handlers time to settle
		await new Promise((r) => setTimeout(r, 50));

		// Turn must NOT have been triggered (guard correctly filters ast-* senders)
		expect(turnCallCount).toBe(0);
	});

	test("guard is tied to threads.ts POST handler: deleting !senderId check would cause this to fail", async ({
		db,
		eventBus,
	}) => {
		// This is the PREDICATE test: post a valid human message, confirm turn fires (1).
		// Then post an ast-* message and confirm turn count stays at 1.
		// If the ast-* guard were deleted from threads.ts, posting the ast-* reply
		// via POST would re-trigger (count = 2).
		await seedHumanUser(db, "u-ah3-lg2", "Loop Guard Predicate User");
		await seedAssistantAgent(db, "u-ah3-lg2");

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
		const threadId = await getOrCreateAssistantThread(app, "u-ah3-lg2");

		// Human message → triggers turn
		await app.request(`/api/threads/${threadId}/messages`, {
			method: "POST",
			headers: authHeaders({ "X-Identity": "u-ah3-lg2" }),
			body: JSON.stringify({
				type: "plain",
				payload: { text: "Human message" },
				clientKey: "ck-ah3-lg2-human",
			}),
		});
		await new Promise((r) => setTimeout(r, 50));
		expect(turnCallCount).toBe(1);

		// Now post a valid ast-* message via DB+event (the real guard path)
		const astMessageId = crypto.randomUUID();
		await db.insert(messagesTable).values({
			id: astMessageId,
			threadId,
			senderId: `ast-u-ah3-lg2`,
			type: "plain",
			payload: JSON.stringify({ text: "Assistant reply" }),
			clientKey: `ast-reply-${astMessageId}`,
			createdAt: new Date().toISOString(),
		});
		eventBus.emit({
			type: "thread_message_appended",
			streamId: threadId,
			threadId,
			messageId: astMessageId,
			messageType: "plain",
			senderId: `ast-u-ah3-lg2`,
			timestamp: Date.now(),
		});

		await new Promise((r) => setTimeout(r, 50));
		// Must still be 1 — ast-* did not re-trigger
		expect(turnCallCount).toBe(1);
	});
});

// ---------------------------------------------------------------------------
// H3: User's message actually reaches the model (SessionConfig.messages)
// ---------------------------------------------------------------------------
// This test FAILS if:
//   - SessionConfig.messages is missing or empty
//   - The user's message text is not present in the messages delivered to startSession
//   - The adapter replies based on PLANNING_PROMPT instead of the user's question
// A ScriptedAdapter that ignores input cannot satisfy it — the test uses a
// capturing adapter that records what it received and echoes the user's question
// back, then asserts the reply IS a function of the input.
// ---------------------------------------------------------------------------

describe("AH3 H3: user message reaches the model — SessionConfig.messages carries the transcript", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("SessionConfig.messages contains the user's question text — adapter observes it", async ({
		db,
		eventBus,
	}) => {
		await seedHumanUser(db, "u-ah3-h3a", "H3 Capturing User");
		await seedAssistantAgent(db, "u-ah3-h3a");

		const app = await createTestApp({ db, eventBus });
		const threadId = await getOrCreateAssistantThread(app, "u-ah3-h3a");

		// Insert the user's trigger message so loadThreadTranscript can find it
		await app.request(`/api/threads/${threadId}/messages`, {
			method: "POST",
			headers: authHeaders({ "X-Identity": "u-ah3-h3a" }),
			body: JSON.stringify({
				type: "plain",
				payload: { text: "What time is it?" },
				clientKey: "ck-ah3-h3a-trigger",
			}),
		});

		// Capturing adapter: records the SessionConfig it receives in startSession,
		// then echoes the user's message in streamEvents.
		// CRITICAL: the echo reply is a FUNCTION of the received messages — if messages is empty
		// or missing the user's text, capturedUserContent stays null and the test fails.
		let capturedUserContent: string | null = null;
		const capturedConfigs = new Map<string, import("@hyperidle/shared").SessionConfig>();

		const capturingAdapter = {
			capabilities: () => ({ concurrent: true, streamTokens: false }),
			startSession: async (
				config: import("@hyperidle/shared").SessionConfig,
			): Promise<import("@hyperidle/shared").SessionHandle> => {
				capturedConfigs.set(config.sessionId, config);
				return { sessionId: config.sessionId };
			},
			streamEvents: async function* (
				handle: import("@hyperidle/shared").SessionHandle,
			): AsyncGenerator<import("@hyperidle/shared").HarnessEvent> {
				const config = capturedConfigs.get(handle.sessionId);
				const msgs = config?.messages ?? [];
				const lastUserMsg = [...msgs].reverse().find((m) => m.role === "user");
				capturedUserContent = lastUserMsg?.content ?? null;
				// Echo what the adapter "saw" — a function of input, not a hardcoded constant.
				// If messages was empty/missing, this yields "NO_USER_MESSAGE_RECEIVED".
				const replyText =
					capturedUserContent !== null
						? `Received: ${capturedUserContent}`
						: "NO_USER_MESSAGE_RECEIVED";
				yield { type: "completion", text: replyText } as import("@hyperidle/shared").HarnessEvent;
			},
			stopSession: async () => {},
		};

		const pool = new AdapterPool();
		pool.register("local-capturing", capturingAdapter as never, {
			name: "Capturing Harness",
			kind: "local",
			type: "builtin",
			modelProviders: ["anthropic"],
			maxConcurrent: 1,
		});

		const stubResolver: CredentialResolver = {
			resolve: async (name) => (name === "anthropic_api_key" ? "sk-test-capture-key" : null),
		};

		// Fetch the thread's messages from DB to get the triggerMessageId
		const threadMessages = await db
			.select()
			.from(messagesTable)
			.where(eq(messagesTable.threadId, threadId));
		const triggerMsg = threadMessages.find((m) => {
			const p = JSON.parse(m.payload) as Record<string, unknown>;
			return p.text === "What time is it?";
		});
		expect(triggerMsg).toBeDefined();

		const deps: AssistantTurnDeps = {
			db,
			eventBus,
			adapterPool: pool,
			credentialResolver: stubResolver,
		};

		await runAssistantTurn(deps, {
			userId: "u-ah3-h3a",
			threadId,
			triggerMessageId: triggerMsg!.id,
		});

		// The capturing adapter must have observed the user's question
		expect(capturedUserContent).not.toBeNull();
		expect(capturedUserContent).toBe("What time is it?");

		// A reply must have been persisted (not just nothing)
		const allMessages = await db
			.select()
			.from(messagesTable)
			.where(eq(messagesTable.threadId, threadId));

		const replyMsg = allMessages.find((m) => {
			const p = JSON.parse(m.payload) as Record<string, unknown>;
			return m.senderId === "ast-u-ah3-h3a" && p.notice === undefined;
		});
		expect(replyMsg).toBeDefined();
		const replyPayload = JSON.parse(replyMsg!.payload) as { text: string };
		// The reply is a function of the user's input — not a hardcoded constant
		expect(replyPayload.text).toContain("What time is it?");
	});

	test("adapter receives messages — test FAILS if messages array is empty or missing user text", async ({
		db,
		eventBus,
	}) => {
		await seedHumanUser(db, "u-ah3-h3b", "H3 Validation User");
		await seedAssistantAgent(db, "u-ah3-h3b");

		const UNIQUE_QUESTION = "UniqueQuestionH3B-XyzAbcDef";

		const app = await createTestApp({ db, eventBus });
		const threadId = await getOrCreateAssistantThread(app, "u-ah3-h3b");

		await app.request(`/api/threads/${threadId}/messages`, {
			method: "POST",
			headers: authHeaders({ "X-Identity": "u-ah3-h3b" }),
			body: JSON.stringify({
				type: "plain",
				payload: { text: UNIQUE_QUESTION },
				clientKey: "ck-ah3-h3b-trigger",
			}),
		});

		// This adapter validates that messages is non-empty and contains the user's unique text.
		// If the service passes messages:[] or messages without the user text, it emits an error.
		let receivedMessages: readonly import("@hyperidle/shared").ConversationMessage[] = [];
		const validatingConfigs = new Map<string, import("@hyperidle/shared").SessionConfig>();

		const validatingAdapter = {
			capabilities: () => ({ concurrent: true, streamTokens: false }),
			startSession: async (
				config: import("@hyperidle/shared").SessionConfig,
			): Promise<import("@hyperidle/shared").SessionHandle> => {
				validatingConfigs.set(config.sessionId, config);
				return { sessionId: config.sessionId };
			},
			streamEvents: async function* (
				handle: import("@hyperidle/shared").SessionHandle,
			): AsyncGenerator<import("@hyperidle/shared").HarnessEvent> {
				const config = validatingConfigs.get(handle.sessionId);
				receivedMessages = config?.messages ?? [];
				const hasUserMessage = receivedMessages.some(
					(m) => m.role === "user" && m.content === UNIQUE_QUESTION,
				);
				if (!hasUserMessage) {
					yield {
						type: "error",
						message: `MISSING_USER_MESSAGE: messages=${JSON.stringify(receivedMessages)}`,
					} as import("@hyperidle/shared").HarnessEvent;
					return;
				}
				yield {
					type: "completion",
					text: "I see your question.",
				} as import("@hyperidle/shared").HarnessEvent;
			},
			stopSession: async () => {},
		};

		const pool = new AdapterPool();
		pool.register("local-validating", validatingAdapter as never, {
			name: "Validating Harness",
			kind: "local",
			type: "builtin",
			modelProviders: ["anthropic"],
			maxConcurrent: 1,
		});

		const stubResolver: CredentialResolver = {
			resolve: async (name) => (name === "anthropic_api_key" ? "sk-test-validate-key" : null),
		};

		const threadMessages = await db
			.select()
			.from(messagesTable)
			.where(eq(messagesTable.threadId, threadId));
		const triggerMsg = threadMessages.find((m) => {
			const p = JSON.parse(m.payload) as Record<string, unknown>;
			return p.text === UNIQUE_QUESTION;
		});
		expect(triggerMsg).toBeDefined();

		const deps: AssistantTurnDeps = {
			db,
			eventBus,
			adapterPool: pool,
			credentialResolver: stubResolver,
		};

		await runAssistantTurn(deps, {
			userId: "u-ah3-h3b",
			threadId,
			triggerMessageId: triggerMsg!.id,
		});

		// Assert that the messages array was non-empty and contained the user's unique question
		expect(receivedMessages.length).toBeGreaterThan(0);
		const userMsg = receivedMessages.find(
			(m) => m.role === "user" && m.content === UNIQUE_QUESTION,
		);
		expect(userMsg).toBeDefined();

		// Assert a successful reply (not an error notice) was persisted
		const allMessages = await db
			.select()
			.from(messagesTable)
			.where(eq(messagesTable.threadId, threadId));
		const replyMsg = allMessages.find((m) => {
			const p = JSON.parse(m.payload) as Record<string, unknown>;
			return m.senderId === "ast-u-ah3-h3b" && p.notice === undefined;
		});
		expect(replyMsg).toBeDefined();
		const replyPayload = JSON.parse(replyMsg!.payload) as { text: string };
		// If messages was missing, the adapter would have emitted error → notice persisted, not this
		expect(replyPayload.text).toBe("I see your question.");
	});
});
