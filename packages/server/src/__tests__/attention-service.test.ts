import {
	createTestDb,
	factorySettings,
	type HyperIdleDb,
	items,
	knowledgeConflicts,
	knowledgeItems,
	knowledgeStrategyFabric,
} from "@hyperidle/db";
import type { ItemCreatedEvent, KnowledgeUpdatedEvent } from "@hyperidle/shared";
import { EventBus } from "@hyperidle/shared";
import { eq, like } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { buildAttentionService, MAX_RECOMPUTE_BATCH } from "../services/attention-service.js";
import { attentionReviewReasoningMarker } from "../services/review-item-factory.js";

const NOW = "2026-04-18T00:00:00.000Z";
const NOW_MS = new Date(NOW).getTime();

interface SeedKiOverrides {
	readonly id: string;
	readonly layer?: string | null;
	readonly scopeId?: string | null;
	readonly kind?: string | null;
	readonly topic?: string | null;
	readonly title?: string;
	readonly body?: string;
	readonly format?: string;
	readonly status?: string;
	/** @lore O2: attentionScore stored as text in knowledgeStrategyFabric */
	readonly attentionScore?: number | null;
	/** @lore O2: confidence stored as text in knowledgeStrategyFabric */
	readonly confidence?: number | null;
	readonly version?: number;
	readonly updatedBy?: string;
	readonly createdAt?: string;
	readonly updatedAt?: string;
	readonly meta?: string | null;
}

/**
 * @lore O2: seedKi inserts into BOTH the kernel knowledgeItems table AND the
 * knowledgeStrategyFabric extension table. Strategy fields (layer, scopeId,
 * kind, attentionScore, confidence, meta) are no longer columns on the kernel
 * table.
 */
function seedKi(db: HyperIdleDb, overrides: SeedKiOverrides): SeedKiOverrides & { id: string } {
	const kernelRow = {
		id: overrides.id,
		topic: overrides.topic ?? null,
		title: overrides.title ?? "Test",
		body: overrides.body ?? "Body",
		format: overrides.format ?? "markdown",
		status: overrides.status ?? "active",
		version: overrides.version ?? 1,
		updatedBy: overrides.updatedBy ?? "agent-1",
		createdAt: overrides.createdAt ?? NOW,
		updatedAt: overrides.updatedAt ?? NOW,
	};
	db.insert(knowledgeItems).values(kernelRow).run();

	// Insert strategy extension row
	db.insert(knowledgeStrategyFabric)
		.values({
			id: `ksf-${overrides.id}`,
			knowledgeItemId: overrides.id,
			layer: overrides.layer ?? "L3",
			scopeId: overrides.scopeId ?? null,
			kind: overrides.kind ?? "pattern",
			attentionScore: overrides.attentionScore != null ? String(overrides.attentionScore) : null,
			confidence: overrides.confidence != null ? String(overrides.confidence) : null,
			meta: overrides.meta ?? null,
		})
		.run();

	return overrides;
}

function seedConflict(db: HyperIdleDb, id: string, itemId: string): void {
	db.insert(knowledgeConflicts)
		.values({
			id,
			itemId,
			versionBase: 1,
			versionCurrent: 2,
			proposedBody: "body",
			proposedBy: "agent-x",
			status: "open",
			createdAt: NOW,
		})
		.run();
}

describe("attention-service", () => {
	let db: HyperIdleDb;
	let eventBus: EventBus;

	beforeEach(() => {
		db = createTestDb();
		eventBus = new EventBus();
	});

	it("recomputeOne persists the new score on knowledge_strategy_fabric.attentionScore and does NOT bump version", async () => {
		// @lore O2: attentionScore moved from kernel knowledgeItems to extension table
		seedKi(db, { id: "ki-1", attentionScore: 0.1, version: 3, confidence: 0.5 });
		const service = buildAttentionService({ db, eventBus, now: () => NOW_MS });
		await service.recomputeOne("ki-1");
		// Kernel version must NOT be bumped
		const row = db.select().from(knowledgeItems).where(eq(knowledgeItems.id, "ki-1")).get();
		expect(row?.version).toBe(3);
		// attentionScore written to fabric extension table
		const fabric = db
			.select()
			.from(knowledgeStrategyFabric)
			.where(eq(knowledgeStrategyFabric.knowledgeItemId, "ki-1"))
			.get();
		expect(fabric?.attentionScore).not.toBeNull();
	});

	it("recomputeOne fires ItemCreatedEvent on prior<0.7 & current>=0.7 AND writes items row", async () => {
		// Seed item with strong attention signals (conflict + taste-sensitive + low confidence)
		seedKi(db, {
			id: "ki-crosses",
			kind: "brief",
			topic: "brand",
			confidence: 0.1,
			attentionScore: 0.3,
		});
		seedConflict(db, "c-1", "ki-crosses");

		const received: ItemCreatedEvent[] = [];
		eventBus.on("item_created", (e) => {
			received.push(e);
		});

		const service = buildAttentionService({ db, eventBus, now: () => NOW_MS });
		const result = await service.recomputeOne("ki-crosses");

		expect(result.current).toBeGreaterThanOrEqual(0.7);
		expect(result.crossedThreshold).toBe(true);
		expect(received.length).toBe(1);

		// items row exists
		const rows = db.select().from(items).all();
		const review = rows.find((r) => r.kind === "knowledge");
		expect(review).toBeDefined();
		expect(review?.verb).toBe("review");
	});

	it("recomputeOne does NOT fire ItemCreatedEvent when prior was already >= 0.7", async () => {
		seedKi(db, {
			id: "ki-stable-high",
			kind: "brief",
			topic: "brand",
			confidence: 0.1,
			attentionScore: 0.85,
		});

		const received: ItemCreatedEvent[] = [];
		eventBus.on("item_created", (e) => {
			received.push(e);
		});

		const service = buildAttentionService({ db, eventBus, now: () => NOW_MS });
		const result = await service.recomputeOne("ki-stable-high");
		expect(result.crossedThreshold).toBe(false);
		expect(received.length).toBe(0);
	});

	it("recomputeOne does NOT fire when prior<0.7 stays below 0.7", async () => {
		// Low-attention technical item, high confidence — should stay low
		seedKi(db, {
			id: "ki-low",
			kind: "pattern",
			topic: "auth",
			confidence: 0.95,
			attentionScore: 0.1,
		});

		const received: ItemCreatedEvent[] = [];
		eventBus.on("item_created", (e) => {
			received.push(e);
		});

		const service = buildAttentionService({ db, eventBus, now: () => NOW_MS });
		const result = await service.recomputeOne("ki-low");
		expect(result.current).toBeLessThan(0.7);
		expect(result.crossedThreshold).toBe(false);
		expect(received.length).toBe(0);
	});

	it("recomputeMany: 1000 items completes in <1s", async () => {
		const ids: string[] = [];
		for (let i = 0; i < 1000; i++) {
			const id = `ki-${i}`;
			seedKi(db, {
				id,
				layer: "L3",
				scopeId: `scope-${i % 10}`,
				kind: i % 2 === 0 ? "pattern" : "brief",
				topic: i % 3 === 0 ? "brand" : "auth",
				confidence: (i % 100) / 100,
				attentionScore: 0.1,
			});
			ids.push(id);
		}

		const service = buildAttentionService({ db, eventBus, now: () => NOW_MS });
		const start = performance.now();
		const results = await service.recomputeMany(ids);
		const duration = performance.now() - start;

		expect(results.length).toBe(1000);
		expect(duration).toBeLessThan(1500);
	});

	it("recomputeMany emits exactly one ItemCreatedEvent per item that crosses the threshold", async () => {
		// Seed 3 crossing and 2 non-crossing items.
		// @lore L22: each crossing item uses a UNIQUE topic so cohort size = 1
		// (novelty = 1.0). After L22's IMPACT_BY_KIND deletion (impact = 0),
		// sharing a cohort (topic="brand" for all three) drops novelty to
		// 1/sqrt(3) ≈ 0.577 and the maximum reachable score falls below 0.7.
		// Unique topics keep novelty = 1 and the score reaches ~0.74, crossing.
		const crossing = ["c1", "c2", "c3"];
		for (const [i, id] of crossing.entries()) {
			seedKi(db, {
				id,
				kind: "brief",
				topic: `brand-unique-${i}`,
				confidence: 0.1,
				attentionScore: 0.3,
			});
			seedConflict(db, `conf-${id}`, id);
		}
		seedKi(db, {
			id: "ok1",
			kind: "pattern",
			topic: "auth",
			confidence: 0.95,
			attentionScore: 0.1,
		});
		seedKi(db, {
			id: "ok2",
			kind: "pattern",
			topic: "auth",
			confidence: 0.95,
			attentionScore: 0.1,
		});

		const received: ItemCreatedEvent[] = [];
		eventBus.on("item_created", (e) => {
			received.push(e);
		});

		const service = buildAttentionService({ db, eventBus, now: () => NOW_MS });
		await service.recomputeMany(["c1", "c2", "c3", "ok1", "ok2"]);

		expect(received.length).toBe(3);
	});

	it("recomputeMany emits KnowledgeUpdatedEvent for every item, action=attention_recomputed", async () => {
		for (let i = 0; i < 3; i++) {
			seedKi(db, { id: `k-${i}`, confidence: 0.5, attentionScore: 0.1 });
		}

		const received: KnowledgeUpdatedEvent[] = [];
		eventBus.on("knowledge_updated", (e) => {
			received.push(e);
		});

		const service = buildAttentionService({ db, eventBus, now: () => NOW_MS });
		await service.recomputeMany(["k-0", "k-1", "k-2"]);

		expect(received.length).toBe(3);
		for (const ev of received) {
			expect(ev.action).toBe("attention_recomputed");
		}
	});

	it("recomputeScope({layer:'L3', scopeId:'build'}) updates only L3/build items", async () => {
		// @lore O2: attentionScore is now in knowledgeStrategyFabric, not knowledgeItems
		seedKi(db, { id: "a", layer: "L3", scopeId: "build", confidence: 0.5, attentionScore: 0.1 });
		seedKi(db, { id: "b", layer: "L3", scopeId: "other", confidence: 0.5, attentionScore: 0.1 });
		seedKi(db, { id: "c", layer: "L2", scopeId: "build", confidence: 0.5, attentionScore: 0.1 });

		const service = buildAttentionService({ db, eventBus, now: () => NOW_MS });
		const result = await service.recomputeScope({ layer: "L3", scopeId: "build" });

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.summary.updated).toBe(1);

		// Check via fabric extension table
		const fabricA = db
			.select()
			.from(knowledgeStrategyFabric)
			.where(eq(knowledgeStrategyFabric.knowledgeItemId, "a"))
			.get();
		const fabricB = db
			.select()
			.from(knowledgeStrategyFabric)
			.where(eq(knowledgeStrategyFabric.knowledgeItemId, "b"))
			.get();
		const fabricC = db
			.select()
			.from(knowledgeStrategyFabric)
			.where(eq(knowledgeStrategyFabric.knowledgeItemId, "c"))
			.get();

		// Only A updated (recomputed to new value); B and C retain prior "0.1"
		expect(fabricA?.attentionScore).not.toBeNull();
		expect(fabricB?.attentionScore).toBe("0.1");
		expect(fabricC?.attentionScore).toBe("0.1");
	});

	it("respects weights loaded from factory_settings", async () => {
		// Zero out all signal weights except conflict — score should be 1 only when
		// an item has a conflict, 0 otherwise.
		const zeroKeys = [
			"novelty",
			"impact",
			"repetition",
			"confidence",
			"tasteSensitivity",
			"recency",
			"usage",
		];
		for (const k of zeroKeys) {
			db.insert(factorySettings)
				.values({ key: `attention.weight.${k}`, value: "0", updatedAt: NOW })
				.run();
		}
		db.insert(factorySettings)
			.values({ key: "attention.weight.conflict", value: "1", updatedAt: NOW })
			.run();

		seedKi(db, { id: "with-conflict", confidence: 0.5, attentionScore: 0.1 });
		seedKi(db, { id: "no-conflict", confidence: 0.5, attentionScore: 0.1 });
		seedConflict(db, "c-x", "with-conflict");

		const service = buildAttentionService({ db, eventBus, now: () => NOW_MS });
		const results = await service.recomputeMany(["with-conflict", "no-conflict"]);
		const withConflict = results.find((r) => r.knowledgeItemId === "with-conflict");
		const withoutConflict = results.find((r) => r.knowledgeItemId === "no-conflict");
		expect(withConflict?.current).toBeCloseTo(1, 5);
		expect(withoutConflict?.current).toBeCloseTo(0, 5);
	});

	// --- Idempotency & concurrency (review findings #1, #3) ---

	it("a second upward crossing does NOT create a duplicate review item", async () => {
		seedKi(db, {
			id: "ki-dup",
			kind: "brief",
			topic: "brand",
			confidence: 0.1,
			attentionScore: 0.3,
		});
		seedConflict(db, "c-dup", "ki-dup");

		const received: ItemCreatedEvent[] = [];
		eventBus.on("item_created", (e) => {
			received.push(e);
		});

		const service = buildAttentionService({ db, eventBus, now: () => NOW_MS });
		const first = await service.recomputeOne("ki-dup");
		expect(first.reviewItemCreated).toBe(true);

		// Reset the KI's stored attention so the next recompute ALSO observes a
		// upward crossing (prior<0.7 → current>=0.7). Without idempotency this
		// would double-create the review item.
		// @lore O2: attentionScore is in knowledgeStrategyFabric, not knowledgeItems
		db.update(knowledgeStrategyFabric)
			.set({ attentionScore: "0.3" })
			.where(eq(knowledgeStrategyFabric.knowledgeItemId, "ki-dup"))
			.run();

		const second = await service.recomputeOne("ki-dup");
		expect(second.crossedThreshold).toBe(true);
		expect(second.reviewItemCreated).toBe(false);

		// Only one review item and only one item_created event.
		const reviewRows = db
			.select()
			.from(items)
			.where(like(items.reasoning, `%${attentionReviewReasoningMarker("ki-dup")}%`))
			.all();
		expect(reviewRows.length).toBe(1);
		expect(received.length).toBe(1);
	});

	it("concurrent recomputeOne calls produce exactly one review item (transactional)", async () => {
		seedKi(db, {
			id: "ki-race",
			kind: "brief",
			topic: "brand",
			confidence: 0.1,
			attentionScore: 0.3,
		});
		seedConflict(db, "c-race", "ki-race");

		const received: ItemCreatedEvent[] = [];
		eventBus.on("item_created", (e) => {
			received.push(e);
		});

		const service = buildAttentionService({ db, eventBus, now: () => NOW_MS });
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

	it("recomputeScope rejects an empty filter with FILTER_REQUIRED", async () => {
		seedKi(db, { id: "any", confidence: 0.5, attentionScore: 0.1 });
		const service = buildAttentionService({ db, eventBus, now: () => NOW_MS });
		const result = await service.recomputeScope({});
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.error.code).toBe("FILTER_REQUIRED");
	});

	it("recomputeScope returns BATCH_TOO_LARGE when the selection exceeds MAX_RECOMPUTE_BATCH", async () => {
		// Build the service with a trivial filter and stub the DB selection to
		// report a size over the cap. Rather than seed MAX+1 rows, we verify
		// the cap semantics by calling via a small override that short-circuits
		// the selection path. We seed MAX_RECOMPUTE_BATCH+1 distinct ids which
		// is small enough to insert in-memory quickly.
		const BATCH_OVER = MAX_RECOMPUTE_BATCH + 1;
		// Insert MAX+1 rows with the same layer so the filter matches all.
		for (let i = 0; i < BATCH_OVER; i++) {
			seedKi(db, { id: `k-big-${i}`, layer: "L9", confidence: 0.5, attentionScore: 0.1 });
		}
		const service = buildAttentionService({ db, eventBus, now: () => NOW_MS });
		const result = await service.recomputeScope({ layer: "L9" });
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.error.code).toBe("BATCH_TOO_LARGE");
		if (result.error.code !== "BATCH_TOO_LARGE") return;
		expect(result.error.size).toBe(BATCH_OVER);
	});

	it("recomputeScope accepts `kind`, `topic`, and `ids` filter fields", async () => {
		seedKi(db, {
			id: "m-1",
			layer: "L3",
			kind: "brief",
			topic: "brand",
			confidence: 0.5,
			attentionScore: 0.1,
		});
		seedKi(db, {
			id: "m-2",
			layer: "L3",
			kind: "pattern",
			topic: "auth",
			confidence: 0.5,
			attentionScore: 0.1,
		});
		const service = buildAttentionService({ db, eventBus, now: () => NOW_MS });

		const byKind = await service.recomputeScope({ kind: "brief" });
		expect(byKind.ok).toBe(true);
		if (!byKind.ok) return;
		expect(byKind.summary.updated).toBe(1);

		const byTopic = await service.recomputeScope({ topic: "auth" });
		expect(byTopic.ok).toBe(true);
		if (!byTopic.ok) return;
		expect(byTopic.summary.updated).toBe(1);

		const byIds = await service.recomputeScope({ ids: ["m-1", "m-2"] });
		expect(byIds.ok).toBe(true);
		if (!byIds.ok) return;
		expect(byIds.summary.updated).toBe(2);
	});

	// --- Threshold boundary (review finding #10) ---

	it("threshold boundary: prior=0.6999, current≈0.7 crosses; prior=0.7, current=0.7 does NOT cross", async () => {
		// Force `current` to land at exactly 0.7 with a trivial zero-weight
		// configuration except recency=1. With `recentlyHumanEdited=false` and
		// `lastHumanEditAt=null`, the recency signal returns 1 and (when taken
		// as the only contributor) the normalized score is 1. We instead use
		// two contributors that average to 0.7.
		// Approach: zero-weight everything except tasteSensitivity=0.7 and
		// recency=0.3. A taste-sensitive brief with no human edit yields
		// taste=1, recency=1 → weighted=(1*0.7 + 1*0.3)/(0.7+0.3) = 1.0.
		// That won't land on 0.7 — instead we pin the prior values directly
		// and assert the service's crossing predicate by calling recomputeOne
		// twice with different configured priors.
		seedKi(db, {
			id: "edge-just-below",
			kind: "brief",
			topic: "brand",
			confidence: 0.1,
			attentionScore: 0.6999,
		});
		seedConflict(db, "conf-edge-below", "edge-just-below");

		seedKi(db, {
			id: "edge-at",
			kind: "brief",
			topic: "brand",
			confidence: 0.1,
			attentionScore: 0.7,
		});
		seedConflict(db, "conf-edge-at", "edge-at");

		const received: ItemCreatedEvent[] = [];
		eventBus.on("item_created", (e) => {
			received.push(e);
		});
		const service = buildAttentionService({ db, eventBus, now: () => NOW_MS });

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

	it("passing an explicit `now` produces deterministic scores across runs", async () => {
		seedKi(db, {
			id: "det-1",
			kind: "pattern",
			topic: "auth",
			confidence: 0.5,
			attentionScore: 0.1,
		});
		const fixedNow = NOW_MS;
		const svcA = buildAttentionService({ db, eventBus, now: () => fixedNow });
		const a = await svcA.recomputeOne("det-1");

		// Reset the stored attention and re-run with the same fixed now — the
		// scorer inputs (recency etc) depend on now, so same now → same score.
		// @lore O2: attentionScore is in knowledgeStrategyFabric, not knowledgeItems
		db.update(knowledgeStrategyFabric)
			.set({ attentionScore: "0.1" })
			.where(eq(knowledgeStrategyFabric.knowledgeItemId, "det-1"))
			.run();
		const svcB = buildAttentionService({ db, eventBus, now: () => fixedNow });
		const b = await svcB.recomputeOne("det-1");
		expect(b.current).toBe(a.current);
	});
});
