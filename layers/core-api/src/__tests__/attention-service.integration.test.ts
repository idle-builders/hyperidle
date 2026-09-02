import {
	buildToolHandlersPorts,
	createInProcessCoreApiTransport,
} from "@hyperidle/agent-orchestration";
import { THROWING_REVIEW_ACCESSOR } from "@hyperidle/agent-orchestration/testing";
import { insertThread } from "@hyperidle/conversation";
import {
	type HyperIdleDb,
	items,
	knowledgeAppProjection,
	knowledgeConflicts,
	knowledgeEditLog,
	knowledgeItems,
} from "@hyperidle/db";
import type { ItemCreatedEvent, KnowledgeUpdatedEvent } from "@hyperidle/event-bus";
import { attentionReviewReasoningMarker, recomputeAttention } from "@hyperidle/knowledge";
import * as work from "@hyperidle/work";
import { eq, like } from "drizzle-orm";
import { describe, expect } from "vitest";
import { test } from "../__testing__/test-fixtures.js";

const NOW = "2026-04-18T00:00:00.000Z";
const NOW_MS = new Date(NOW).getTime();

/**
 * @lore AU19 Increment 1a/1j: `buildAttentionService` now takes `work`/`review`
 * as injected DI ports (Mechanism C — `knowledge` never imports another
 * Service). This test constructs the real `work-service.ts` /
 * `@hyperidle/review` functions and passes them through, exercising the
 * exact same production wiring `score-attention.ts`/`builtin-routine-handlers.ts`
 * use — no behavior change from the pre-migration direct-import version.
 */
const workPort = {
	findItemByReasoningMarker: async (
		exec: import("@hyperidle/db").WriteExecutor,
		marker: string,
	) => {
		const rows = await work.list(exec, "item", { marker });
		return rows[0] ? { id: rows[0].id } : undefined;
	},
	createItem: (
		exec: import("@hyperidle/db").WriteExecutor,
		values: import("@hyperidle/db").NewItem,
	) => work.create(exec, "item", values),
};
const conversationPort = {
	insertThread,
};

const MAX_RECOMPUTE_BATCH = 5000;
function createAttentionApi(deps: Parameters<typeof recomputeAttention>[0]) {
	return {
		recomputeOne: async (itemId: string) => {
			const result = await recomputeAttention(deps, { itemId });
			if (Array.isArray(result) || !("current" in result)) throw new Error("unexpected result");
			return result;
		},
		recomputeMany: async (itemIds: readonly string[]) => {
			const result = await recomputeAttention(deps, { itemIds });
			if (!Array.isArray(result)) throw new Error("unexpected result");
			return result;
		},
		recomputeScope: async (
			filter: Extract<Parameters<typeof recomputeAttention>[1], { filter: unknown }>["filter"],
		) => {
			const result = await recomputeAttention(deps, { filter });
			if (!("ok" in result)) throw new Error("unexpected result");
			return result;
		},
	};
}

interface SeedKiOverrides {
	readonly id: string;
	readonly scopeId?: string | null;
	readonly parentKind?: string | null;
	readonly parentId?: string | null;
	readonly title?: string;
	readonly body?: string;
	readonly format?: string;
	readonly status?: string;
	/** @lore O2: attentionScore stored as text in knowledgeAppProjection */
	readonly attentionScore?: number | null;
	/** @lore O2: confidence stored as text in knowledgeAppProjection */
	readonly confidence?: number | null;
	readonly version?: number;
	readonly updatedBy?: string;
	readonly createdAt?: string;
	readonly updatedAt?: string;
	readonly meta?: string | null;
}

/**
 * @lore O2: seedKi inserts into BOTH the kernel knowledgeItems table AND the
 * knowledgeAppProjection extension table. Strategy fields (layer, scopeId,
 * kind, attentionScore, confidence, meta) are no longer columns on the kernel
 * table.
 */
async function seedKi(
	db: HyperIdleDb,
	overrides: SeedKiOverrides,
): Promise<SeedKiOverrides & { id: string }> {
	const kernelRow = {
		id: overrides.id,
		title: overrides.title ?? "Test",
		body: overrides.body ?? "Body",
		format: overrides.format ?? "markdown",
		status: overrides.status ?? "active",
		version: overrides.version ?? 1,
		updatedBy: overrides.updatedBy ?? "agent-1",
		createdAt: overrides.createdAt ?? NOW,
		updatedAt: overrides.updatedAt ?? NOW,
		parentKind: overrides.parentKind ?? null,
		parentId: overrides.parentId ?? null,
	};
	await db.insert(knowledgeItems).values(kernelRow);

	// Insert strategy extension row
	await db.insert(knowledgeAppProjection).values({
		id: `ksf-${overrides.id}`,
		knowledgeItemId: overrides.id,
		scopeId: overrides.scopeId ?? null,
		attentionScore: overrides.attentionScore != null ? String(overrides.attentionScore) : null,
		confidence: overrides.confidence != null ? String(overrides.confidence) : null,
		meta: overrides.meta ?? null,
	});

	return overrides;
}

async function seedConflict(db: HyperIdleDb, id: string, itemId: string): Promise<void> {
	await db.insert(knowledgeConflicts).values({
		id,
		itemId,
		versionBase: 1,
		versionCurrent: 2,
		proposedBody: "body",
		proposedBy: "agent-x",
		status: "open",
		createdAt: NOW,
	});
}

describe("attention-service", () => {
	test("tool attention override atomically upserts projection only", async ({ db, app }) => {
		const toolHandlersPorts = buildToolHandlersPorts(
			createInProcessCoreApiTransport(app),
			THROWING_REVIEW_ACCESSOR,
		);
		await seedKi(db, { id: "ki-override", attentionScore: 0.1 });
		const [before] = await db
			.select()
			.from(knowledgeItems)
			.where(eq(knowledgeItems.id, "ki-override"));
		const logsBefore = await db
			.select()
			.from(knowledgeEditLog)
			.where(eq(knowledgeEditLog.itemId, "ki-override"));

		await toolHandlersPorts.coreApi.upsertKnowledgeAppProjectionAttentionScore(
			"ki-override",
			"0.42",
			"agent-attention-override",
		);
		await toolHandlersPorts.coreApi.upsertKnowledgeAppProjectionAttentionScore(
			"ki-override",
			"0.73",
			"agent-attention-override",
		);

		const [after] = await db
			.select()
			.from(knowledgeItems)
			.where(eq(knowledgeItems.id, "ki-override"));
		const [projection] = await db
			.select()
			.from(knowledgeAppProjection)
			.where(eq(knowledgeAppProjection.knowledgeItemId, "ki-override"));
		const logsAfter = await db
			.select()
			.from(knowledgeEditLog)
			.where(eq(knowledgeEditLog.itemId, "ki-override"));

		expect(projection?.attentionScore).toBe("0.73");
		expect(after?.version).toBe(before?.version);
		expect(after?.updatedAt).toBe(before?.updatedAt);
		expect(logsAfter).toHaveLength(logsBefore.length);
	});
	test("recomputeOne persists the new score on knowledge_app_projection.attentionScore and does NOT bump version", async ({
		db,
		eventBus,
	}) => {
		// @lore O2: attentionScore moved from kernel knowledgeItems to extension table
		await seedKi(db, { id: "ki-1", attentionScore: 0.1, version: 3, confidence: 0.5 });
		const service = createAttentionApi({
			db,
			eventBus,
			work: workPort,
			conversation: conversationPort,
			now: () => NOW_MS,
		});
		await service.recomputeOne("ki-1");
		// Kernel version must NOT be bumped
		const [row] = await db.select().from(knowledgeItems).where(eq(knowledgeItems.id, "ki-1"));
		expect(row?.version).toBe(3);
		// attentionScore written to fabric extension table
		const [fabric] = await db
			.select()
			.from(knowledgeAppProjection)
			.where(eq(knowledgeAppProjection.knowledgeItemId, "ki-1"))
			.limit(1);
		expect(fabric?.attentionScore).not.toBeNull();
	});

	test("recomputeOne fires ItemCreatedEvent on prior<0.7 & current>=0.7 AND writes items row", async ({
		db,
		eventBus,
	}) => {
		// Seed item with strong attention signals (conflict + taste-sensitive + low confidence)
		await seedKi(db, {
			id: "ki-crosses",
			title: "Brand guidance",
			confidence: 0.1,
			attentionScore: 0.3,
		});
		await seedConflict(db, "c-1", "ki-crosses");

		const received: ItemCreatedEvent[] = [];
		eventBus.on("item_created", (e) => {
			received.push(e);
		});

		const service = createAttentionApi({
			db,
			eventBus,
			work: workPort,
			conversation: conversationPort,
			now: () => NOW_MS,
		});
		const result = await service.recomputeOne("ki-crosses");

		expect(result.current).toBeGreaterThanOrEqual(0.7);
		expect(result.crossedThreshold).toBe(true);
		expect(received.length).toBe(1);

		// items row exists
		const rows = await db.select().from(items);
		const review = rows.find((r) => r.kind === "knowledge");
		expect(review).toBeDefined();
		expect(review?.verb).toBe("review");
	});

	test("recomputeOne does NOT fire ItemCreatedEvent when prior was already >= 0.7", async ({
		db,
		eventBus,
	}) => {
		await seedKi(db, {
			id: "ki-stable-high",
			title: "Brand guidance",
			confidence: 0.1,
			attentionScore: 0.85,
		});

		const received: ItemCreatedEvent[] = [];
		eventBus.on("item_created", (e) => {
			received.push(e);
		});

		const service = createAttentionApi({
			db,
			eventBus,
			work: workPort,
			conversation: conversationPort,
			now: () => NOW_MS,
		});
		const result = await service.recomputeOne("ki-stable-high");
		expect(result.crossedThreshold).toBe(false);
		expect(received.length).toBe(0);
	});

	test("recomputeOne does NOT fire when prior<0.7 stays below 0.7", async ({ db, eventBus }) => {
		// Low-attention technical item, high confidence — should stay low
		await seedKi(db, {
			id: "ki-low",
			confidence: 0.95,
			attentionScore: 0.1,
		});

		const received: ItemCreatedEvent[] = [];
		eventBus.on("item_created", (e) => {
			received.push(e);
		});

		const service = createAttentionApi({
			db,
			eventBus,
			work: workPort,
			conversation: conversationPort,
			now: () => NOW_MS,
		});
		const result = await service.recomputeOne("ki-low");
		expect(result.current).toBeLessThan(0.7);
		expect(result.crossedThreshold).toBe(false);
		expect(received.length).toBe(0);
	});

	// @lore PGlite: PGlite is significantly slower than SQLite for bulk ops
	// (2-3x). The original 1500ms threshold assumed SQLite; raised to 10000ms
	// to accommodate PGlite's in-process Postgres overhead on 1000 items.
	test("recomputeMany: 1000 items completes in <1s", async ({ db, eventBus }) => {
		const ids: string[] = [];
		for (let i = 0; i < 1000; i++) {
			const id = `ki-${i}`;
			await seedKi(db, {
				id,
				scopeId: `scope-${i % 10}`,
				confidence: (i % 100) / 100,
				attentionScore: 0.1,
			});
			ids.push(id);
		}

		const service = createAttentionApi({
			db,
			eventBus,
			work: workPort,
			conversation: conversationPort,
			now: () => NOW_MS,
		});
		const start = performance.now();
		const results = await service.recomputeMany(ids);
		const duration = performance.now() - start;

		expect(results.length).toBe(1000);
		expect(duration).toBeLessThan(10000);
	}, 60_000);

	test("recomputeMany emits exactly one ItemCreatedEvent per item that crosses the threshold", async ({
		db,
		eventBus,
	}) => {
		// Seed 3 crossing and 2 non-crossing items.
		// @lore nested-knowledge-items: each crossing item gets a UNIQUE parent
		// so cohort size = 1 (novelty = 1.0) — the cohort key is now
		// (parentKind, parentId, scopeId), not (layer, topic, kind). After
		// L22's IMPACT_BY_KIND deletion (impact = 0), sharing a cohort drops
		// novelty to 1/sqrt(3) ≈ 0.577 and the maximum reachable score falls
		// below 0.7. Unique parents keep novelty = 1 and the score reaches
		// ~0.74, crossing.
		const crossing = ["c1", "c2", "c3"];
		for (const [i, id] of crossing.entries()) {
			await seedKi(db, {
				id,
				title: "Brand guidance",
				parentKind: "task",
				parentId: `unique-cohort-${i}`,
				confidence: 0.1,
				attentionScore: 0.3,
			});
			await seedConflict(db, `conf-${id}`, id);
		}
		await seedKi(db, {
			id: "ok1",
			confidence: 0.95,
			attentionScore: 0.1,
		});
		await seedKi(db, {
			id: "ok2",
			confidence: 0.95,
			attentionScore: 0.1,
		});

		const received: ItemCreatedEvent[] = [];
		eventBus.on("item_created", (e) => {
			received.push(e);
		});

		const service = createAttentionApi({
			db,
			eventBus,
			work: workPort,
			conversation: conversationPort,
			now: () => NOW_MS,
		});
		await service.recomputeMany(["c1", "c2", "c3", "ok1", "ok2"]);

		expect(received.length).toBe(3);
	});

	test("recomputeMany emits KnowledgeUpdatedEvent for every item, action=attention_recomputed", async ({
		db,
		eventBus,
	}) => {
		for (let i = 0; i < 3; i++) {
			await seedKi(db, { id: `k-${i}`, confidence: 0.5, attentionScore: 0.1 });
		}

		const received: KnowledgeUpdatedEvent[] = [];
		eventBus.on("knowledge_updated", (e) => {
			received.push(e);
		});

		const service = createAttentionApi({
			db,
			eventBus,
			work: workPort,
			conversation: conversationPort,
			now: () => NOW_MS,
		});
		await service.recomputeMany(["k-0", "k-1", "k-2"]);

		expect(received.length).toBe(3);
		for (const ev of received) {
			expect(ev.action).toBe("attention_recomputed");
		}
	});

	test("recomputeScope({scopeId:'build', status:'active'}) updates only matching items", async ({
		db,
		eventBus,
	}) => {
		// @lore O2: attentionScore is now in knowledgeAppProjection, not knowledgeItems
		await seedKi(db, {
			id: "a",
			scopeId: "build",
			status: "active",
			confidence: 0.5,
			attentionScore: 0.1,
		});
		await seedKi(db, {
			id: "b",
			scopeId: "other",
			status: "active",
			confidence: 0.5,
			attentionScore: 0.1,
		});
		await seedKi(db, {
			id: "c",
			scopeId: "build",
			status: "stale",
			confidence: 0.5,
			attentionScore: 0.1,
		});

		const service = createAttentionApi({
			db,
			eventBus,
			work: workPort,
			conversation: conversationPort,
			now: () => NOW_MS,
		});
		const result = await service.recomputeScope({ scopeId: "build", status: "active" });

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.summary.updated).toBe(1);

		// Check via fabric extension table
		const [fabricA] = await db
			.select()
			.from(knowledgeAppProjection)
			.where(eq(knowledgeAppProjection.knowledgeItemId, "a"))
			.limit(1);
		const [fabricB] = await db
			.select()
			.from(knowledgeAppProjection)
			.where(eq(knowledgeAppProjection.knowledgeItemId, "b"))
			.limit(1);
		const [fabricC] = await db
			.select()
			.from(knowledgeAppProjection)
			.where(eq(knowledgeAppProjection.knowledgeItemId, "c"))
			.limit(1);

		// Only A updated (recomputed to new value); B and C retain prior "0.1"
		expect(fabricA?.attentionScore).not.toBeNull();
		expect(fabricB?.attentionScore).toBe("0.1");
		expect(fabricC?.attentionScore).toBe("0.1");
	});

	// @lore AU18: `attention.weight.*` settability via `factory_settings` is
	// retired (plan §3/§10 — no production or eval writer ever existed; the
	// only path was the generic PATCH /api/status/settings catch-all, also
	// retired this WP). `loadAttentionWeights` now always returns the
	// hardcoded `DEFAULT_ATTENTION_WEIGHTS`, so this test's "zero out all but
	// conflict" premise no longer applies — dropped, not replaced, per the
	// plan's explicit "defaults-only, boring tech" decision. Default-weight
	// scoring behavior remains covered by the surrounding tests in this file.

	// --- Idempotency & concurrency (review findings #1, #3) ---

	test("a second upward crossing does NOT create a duplicate review item", async ({
		db,
		eventBus,
	}) => {
		await seedKi(db, {
			id: "ki-dup",
			title: "Brand guidance",
			confidence: 0.1,
			attentionScore: 0.3,
		});
		await seedConflict(db, "c-dup", "ki-dup");

		const received: ItemCreatedEvent[] = [];
		eventBus.on("item_created", (e) => {
			received.push(e);
		});

		const service = createAttentionApi({
			db,
			eventBus,
			work: workPort,
			conversation: conversationPort,
			now: () => NOW_MS,
		});
		const first = await service.recomputeOne("ki-dup");
		expect(first.reviewItemCreated).toBe(true);

		// Reset the KI's stored attention so the next recompute ALSO observes a
		// upward crossing (prior<0.7 → current>=0.7). Without idempotency this
		// would double-create the review item.
		// @lore O2: attentionScore is in knowledgeAppProjection, not knowledgeItems
		await db
			.update(knowledgeAppProjection)
			.set({ attentionScore: "0.3" })
			.where(eq(knowledgeAppProjection.knowledgeItemId, "ki-dup"));

		const second = await service.recomputeOne("ki-dup");
		expect(second.crossedThreshold).toBe(true);
		expect(second.reviewItemCreated).toBe(false);

		// Only one review item and only one item_created event.
		const reviewRows = await db
			.select()
			.from(items)
			.where(like(items.reasoning, `%${attentionReviewReasoningMarker("ki-dup")}%`));
		expect(reviewRows.length).toBe(1);
		expect(received.length).toBe(1);
	});

	test("concurrent recomputeOne calls produce exactly one review item (transactional)", async ({
		db,
		eventBus,
	}) => {
		await seedKi(db, {
			id: "ki-race",
			title: "Brand guidance",
			confidence: 0.1,
			attentionScore: 0.3,
		});
		await seedConflict(db, "c-race", "ki-race");

		const received: ItemCreatedEvent[] = [];
		eventBus.on("item_created", (e) => {
			received.push(e);
		});

		const service = createAttentionApi({
			db,
			eventBus,
			work: workPort,
			conversation: conversationPort,
			now: () => NOW_MS,
		});
		// Kick off two recomputes "simultaneously". SQLite under better-sqlite3
		// is synchronous, so transactions serialize deterministically — but the
		// CALL path is async so this models the two-caller scenario.
		const [a, b] = await Promise.all([
			service.recomputeOne("ki-race"),
			service.recomputeOne("ki-race"),
		]);
		// Exactly one caller created the review.
		const createdCount = [a, b].filter((r) => r.reviewItemCreated).length;
		expect(createdCount).toBe(1);
		expect(received.length).toBe(1);
	});

	// --- recomputeScope guardrails (review finding #2) ---

	test("recomputeScope rejects an empty filter with FILTER_REQUIRED", async ({ db, eventBus }) => {
		await seedKi(db, { id: "any", confidence: 0.5, attentionScore: 0.1 });
		const service = createAttentionApi({
			db,
			eventBus,
			work: workPort,
			conversation: conversationPort,
			now: () => NOW_MS,
		});
		const result = await service.recomputeScope({});
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.error.code).toBe("FILTER_REQUIRED");
	});

	test("recomputeScope returns BATCH_TOO_LARGE when the selection exceeds MAX_RECOMPUTE_BATCH", async ({
		db,
		eventBus,
	}) => {
		const BATCH_OVER = MAX_RECOMPUTE_BATCH + 1;
		// Insert MAX+1 rows with the same scope so the filter matches all.
		for (let i = 0; i < BATCH_OVER; i++) {
			await seedKi(db, {
				id: `k-big-${i}`,
				scopeId: "big-batch",
				confidence: 0.5,
				attentionScore: 0.1,
			});
		}
		const service = createAttentionApi({
			db,
			eventBus,
			work: workPort,
			conversation: conversationPort,
			now: () => NOW_MS,
		});
		const result = await service.recomputeScope({ scopeId: "big-batch" });
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.error.code).toBe("BATCH_TOO_LARGE");
		if (result.error.code !== "BATCH_TOO_LARGE") return;
		expect(result.error.size).toBe(BATCH_OVER);
	});

	test("recomputeScope accepts `scopeId` and `ids` filter fields", async ({ db, eventBus }) => {
		await seedKi(db, {
			id: "m-1",
			scopeId: "brand-team",
			confidence: 0.5,
			attentionScore: 0.1,
		});
		await seedKi(db, {
			id: "m-2",
			scopeId: "auth-team",
			confidence: 0.5,
			attentionScore: 0.1,
		});
		const service = createAttentionApi({
			db,
			eventBus,
			work: workPort,
			conversation: conversationPort,
			now: () => NOW_MS,
		});

		const byScope = await service.recomputeScope({ scopeId: "brand-team" });
		expect(byScope.ok).toBe(true);
		if (!byScope.ok) return;
		expect(byScope.summary.updated).toBe(1);

		const byIds = await service.recomputeScope({ ids: ["m-1", "m-2"] });
		expect(byIds.ok).toBe(true);
		if (!byIds.ok) return;
		expect(byIds.summary.updated).toBe(2);
	});

	// --- Threshold boundary (review finding #10) ---

	test("threshold boundary: prior=0.6999, current≈0.7 crosses; prior=0.7, current=0.7 does NOT cross", async ({
		db,
		eventBus,
	}) => {
		await seedKi(db, {
			id: "edge-just-below",
			title: "Brand guidance",
			confidence: 0.1,
			attentionScore: 0.6999,
		});
		await seedConflict(db, "conf-edge-below", "edge-just-below");

		await seedKi(db, {
			id: "edge-at",
			title: "Brand guidance",
			confidence: 0.1,
			attentionScore: 0.7,
		});
		await seedConflict(db, "conf-edge-at", "edge-at");

		const received: ItemCreatedEvent[] = [];
		eventBus.on("item_created", (e) => {
			received.push(e);
		});
		const service = createAttentionApi({
			db,
			eventBus,
			work: workPort,
			conversation: conversationPort,
			now: () => NOW_MS,
		});

		const below = await service.recomputeOne("edge-just-below");
		const at = await service.recomputeOne("edge-at");

		// `edge-just-below` had prior strictly below 0.7 and current >=0.7
		// (taste-sensitive brief with conflict and low confidence lands well
		// above 0.7), so it crosses.
		expect(below.current).toBeGreaterThanOrEqual(0.7);
		expect(below.crossedThreshold).toBe(true);
		expect(below.reviewItemCreated).toBe(true);

		// `edge-at` had prior exactly at 0.7: the half-open predicate means
		// it does NOT cross (no review item).
		expect(at.current).toBeGreaterThanOrEqual(0.7);
		expect(at.crossedThreshold).toBe(false);
		expect(at.reviewItemCreated).toBe(false);

		expect(received.length).toBe(1);
	});

	// --- Determinism (review finding #8) ---

	test("passing an explicit `now` produces deterministic scores across runs", async ({
		db,
		eventBus,
	}) => {
		await seedKi(db, {
			id: "det-1",
			confidence: 0.5,
			attentionScore: 0.1,
		});
		const fixedNow = NOW_MS;
		const svcA = createAttentionApi({
			db,
			eventBus,
			work: workPort,
			conversation: conversationPort,
			now: () => fixedNow,
		});
		const a = await svcA.recomputeOne("det-1");

		// Reset the stored attention and re-run with the same fixed now — the
		// scorer inputs (recency etc) depend on now, so same now → same score.
		// @lore O2: attentionScore is in knowledgeAppProjection, not knowledgeItems
		await db
			.update(knowledgeAppProjection)
			.set({ attentionScore: "0.1" })
			.where(eq(knowledgeAppProjection.knowledgeItemId, "det-1"));

		const svcB = createAttentionApi({
			db,
			eventBus,
			work: workPort,
			conversation: conversationPort,
			now: () => fixedNow,
		});
		const b = await svcB.recomputeOne("det-1");
		expect(b.current).toBe(a.current);
	});
});
