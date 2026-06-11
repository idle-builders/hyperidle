/**
 * AF9 — AC1: Access→relevance subscriber.
 *
 * RED PHASE: These tests fail until `registerRelevanceListener` is implemented
 * and wired in `bootstrapFabric` (Task 1).
 *
 * @lore AF9 WARNING 1 (critique): `EventBus.emit` is synchronous over handler
 * *invocation* but the relevance handler is `void (async () => {...})()`.
 * `GET /api/knowledge/:id` returns (and emit returns) BEFORE `recomputeScores`
 * writes `relevanceScore`. Every post-emit assertion MUST use `vi.waitFor` to
 * poll until the async write lands — NOT a single synchronous read after the
 * GET. See `lifecycle-propagation.integration.test.ts` for the exact pattern.
 */

import { knowledgeAccessLog, knowledgeItems, knowledgeStrategyFabric } from "@hyperidle/db";
// @lore AF9 red phase: registerRelevanceListener does not exist until Task 1.
// We import the whole fabric module at runtime and cast to avoid a compile-time
// "no exported member" error — the test must fail at *behavior* not at import.
import * as fabricModule from "@hyperidle/fabric";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, test, vi } from "../test-fixtures.js";

// Cast: the function exists after Task 1 is implemented. Until then, the cast
// compiles but calling it throws/is-undefined — that is the behavioral failure.
const registerRelevanceListener = (
	fabricModule as unknown as {
		registerRelevanceListener: (
			db: Parameters<typeof fabricModule.bootstrapFabric>[0]["db"],
			eventBus: Parameters<typeof fabricModule.bootstrapFabric>[0]["eventBus"],
		) => () => void;
	}
).registerRelevanceListener;

const TEST_API_KEY = "test-key-af9-relevance";
const NOW_ISO = new Date().toISOString();

function authHeaders(): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json" };
}

/** Seed a knowledge item + fabric row (provisional, no relevanceScore). */
async function seedItemWithFabric(
	db: Parameters<typeof fabricModule.bootstrapFabric>[0]["db"],
	id: string,
): Promise<void> {
	await db.insert(knowledgeItems).values({
		id,
		scopeKind: "factory",
		topic: "testing",
		title: `Item ${id}`,
		body: "Body content",
		format: "markdown",
		status: "active",
		version: 1,
		updatedBy: "agent:seed",
		createdAt: NOW_ISO,
		updatedAt: NOW_ISO,
	});

	await db.insert(knowledgeStrategyFabric).values({
		id: `ksf-${id}`,
		knowledgeItemId: id,
		layer: "L3",
		scopeId: "scope-a",
		kind: "pattern",
		attentionScore: null,
		relevanceScore: null,
	});
}

describe("AF9 AC1: access→relevance subscriber", () => {
	let unsubscribe: (() => void) | undefined;

	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});

	afterEach(() => {
		unsubscribe?.();
		vi.unstubAllEnvs();
	});

	test("GET /api/knowledge/:id populates relevanceScore (not permanently null)", async ({
		db,
		app,
		eventBus,
	}) => {
		// Wire the subscriber — this is what Task 1 must implement.
		// Without registerRelevanceListener, this import will fail or the
		// subscriber won't exist and the assertion below will time out/fail.
		unsubscribe = registerRelevanceListener(db, eventBus);

		// Arrange: insert item + fabric row (relevanceScore starts null)
		await seedItemWithFabric(db, "ki-ac1-a");

		// Insert an access-log row manually so recomputeScores sees signal data.
		// (The GET route also inserts one — we insert this to pre-seed the signal.)
		await db.insert(knowledgeAccessLog).values({
			id: "kal-ac1-a-1",
			itemId: "ki-ac1-a",
			accessorKind: "human",
			accessorId: "browser",
			accessedAt: NOW_ISO,
		});

		// Sanity: relevanceScore is null before any access event fires.
		const [fabricBefore] = await db
			.select({ relevanceScore: knowledgeStrategyFabric.relevanceScore })
			.from(knowledgeStrategyFabric)
			.where(eq(knowledgeStrategyFabric.knowledgeItemId, "ki-ac1-a"));
		expect(fabricBefore?.relevanceScore).toBeNull();

		// Act: GET the item — the route emits `knowledge_accessed` which the
		// subscriber should pick up and call recomputeScores.
		const res = await app.request("/api/knowledge/ki-ac1-a", { headers: authHeaders() });
		expect(res.status).toBe(200);

		// Assert: relevanceScore is no longer null.
		// MUST use vi.waitFor — the handler is async fire-and-forget.
		// @lore AF9 WARNING 1: do NOT assert synchronously here.
		await vi.waitFor(async () => {
			const [fabric] = await db
				.select({ relevanceScore: knowledgeStrategyFabric.relevanceScore })
				.from(knowledgeStrategyFabric)
				.where(eq(knowledgeStrategyFabric.knowledgeItemId, "ki-ac1-a"));
			expect(fabric?.relevanceScore).not.toBeNull();
			const score = Number(fabric?.relevanceScore);
			expect(Number.isFinite(score)).toBe(true);
		});
	});

	test("item that was never accessed stays null (fake-zero guard preserved)", async ({
		db,
		eventBus,
	}) => {
		unsubscribe = registerRelevanceListener(db, eventBus);

		// Arrange: insert item with NO access-log entry — never accessed.
		await seedItemWithFabric(db, "ki-ac1-never");

		// Do NOT GET the item — no event fires.
		// Wait a brief moment to confirm nothing materialises.
		// Use waitFor with a short timeout to confirm the score stays null.
		await new Promise<void>((resolve) => setTimeout(resolve, 50));

		const [fabric] = await db
			.select({ relevanceScore: knowledgeStrategyFabric.relevanceScore })
			.from(knowledgeStrategyFabric)
			.where(eq(knowledgeStrategyFabric.knowledgeItemId, "ki-ac1-never"));

		// No event fired → subscriber never called → relevanceScore stays null.
		expect(fabric?.relevanceScore).toBeNull();
	});

	test("accessing item twice produces a finite non-null relevanceScore (multi-access signal)", async ({
		db,
		app,
		eventBus,
	}) => {
		unsubscribe = registerRelevanceListener(db, eventBus);

		await seedItemWithFabric(db, "ki-ac1-b");

		// Pre-seed two access-log rows for signal.
		await db.insert(knowledgeAccessLog).values({
			id: "kal-ac1-b-1",
			itemId: "ki-ac1-b",
			accessorKind: "human",
			accessorId: "browser",
			accessedAt: NOW_ISO,
		});
		await db.insert(knowledgeAccessLog).values({
			id: "kal-ac1-b-2",
			itemId: "ki-ac1-b",
			accessorKind: "human",
			accessorId: "browser",
			accessedAt: NOW_ISO,
		});

		// Act: GET twice — each GET emits knowledge_accessed.
		await app.request("/api/knowledge/ki-ac1-b", { headers: authHeaders() });
		await app.request("/api/knowledge/ki-ac1-b", { headers: authHeaders() });

		// Assert: relevanceScore is a non-null finite number.
		await vi.waitFor(async () => {
			const [fabric] = await db
				.select({ relevanceScore: knowledgeStrategyFabric.relevanceScore })
				.from(knowledgeStrategyFabric)
				.where(eq(knowledgeStrategyFabric.knowledgeItemId, "ki-ac1-b"));
			expect(fabric?.relevanceScore).not.toBeNull();
			const score = Number(fabric?.relevanceScore);
			expect(Number.isFinite(score)).toBe(true);
		});
	});

	test("unsubscribe stops the listener — subsequent access does not update relevanceScore", async ({
		db,
		app,
		eventBus,
	}) => {
		// Register then immediately unsubscribe.
		const unsub = registerRelevanceListener(db, eventBus);
		unsub();

		await seedItemWithFabric(db, "ki-ac1-unsub");

		await db.insert(knowledgeAccessLog).values({
			id: "kal-ac1-unsub-1",
			itemId: "ki-ac1-unsub",
			accessorKind: "human",
			accessorId: "browser",
			accessedAt: NOW_ISO,
		});

		// Act: GET after unsubscribe — no handler should fire.
		await app.request("/api/knowledge/ki-ac1-unsub", { headers: authHeaders() });

		// Wait briefly; relevanceScore should remain null.
		await new Promise<void>((resolve) => setTimeout(resolve, 80));

		const [fabric] = await db
			.select({ relevanceScore: knowledgeStrategyFabric.relevanceScore })
			.from(knowledgeStrategyFabric)
			.where(eq(knowledgeStrategyFabric.knowledgeItemId, "ki-ac1-unsub"));
		expect(fabric?.relevanceScore).toBeNull();
	});
});
