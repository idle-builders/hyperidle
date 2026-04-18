import {
	type HyperIdleDb,
	type KnowledgeItem,
	createTestDb,
	knowledgeConflicts,
	knowledgeEditLog,
	knowledgeItems,
} from "@hyperidle/db";
import { EventBus, type KnowledgeUpdatedEvent } from "@hyperidle/shared";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import {
	AUTO_PROMOTION_EDITOR,
	AUTO_PROMOTION_REPETITION_THRESHOLD,
	STALE_THRESHOLD_MS,
	checkAutoPromotion,
	detectLayerContradiction,
	findStaleItems,
	markStale,
	runAutoPromotionSweep,
	runStaleSweep,
} from "../promotion-pipeline.js";

const NOW = "2026-04-18T00:00:00.000Z";
const NOW_MS = new Date(NOW).getTime();

interface SeedOverrides {
	readonly id: string;
	readonly layer?: string;
	readonly scopeId?: string | null;
	readonly kind?: string;
	readonly topic?: string | null;
	readonly title?: string;
	readonly body?: string;
	readonly status?: string;
	readonly meta?: Record<string, unknown> | null;
	readonly updatedAt?: string;
	readonly version?: number;
}

function seedKi(db: HyperIdleDb, overrides: SeedOverrides): KnowledgeItem {
	const row: KnowledgeItem = {
		id: overrides.id,
		layer: overrides.layer ?? "L3",
		scopeId: overrides.scopeId === undefined ? "scope-a" : overrides.scopeId,
		kind: overrides.kind ?? "pattern",
		topic: overrides.topic === undefined ? "testing" : overrides.topic,
		title: overrides.title ?? "Test",
		body: overrides.body ?? "Body",
		format: "markdown",
		status: overrides.status ?? "provisional",
		attentionScore: null,
		confidence: null,
		version: overrides.version ?? 1,
		updatedBy: "agent:seed",
		createdAt: NOW,
		updatedAt: overrides.updatedAt ?? NOW,
		meta:
			overrides.meta === null || overrides.meta === undefined
				? null
				: JSON.stringify(overrides.meta),
	};
	db.insert(knowledgeItems).values(row).run();
	return row;
}

function seedConflict(
	db: HyperIdleDb,
	id: string,
	itemId: string,
	status: "open" | "resolved" | "discarded",
): void {
	db.insert(knowledgeConflicts)
		.values({
			id,
			itemId,
			versionBase: 1,
			versionCurrent: 1,
			proposedBody: "proposed",
			proposedBy: "agent:other",
			status,
			createdAt: NOW,
		})
		.run();
}

function seedRepetitionCluster(
	db: HyperIdleDb,
	signature: { layer: string; topic: string; kind: string },
	idPrefix: string,
	count: number,
	options: { status?: string; startIndex?: number } = {},
): void {
	const status = options.status ?? "active";
	const start = options.startIndex ?? 0;
	for (let i = 0; i < count; i++) {
		seedKi(db, {
			id: `${idPrefix}-${start + i}`,
			layer: signature.layer,
			scopeId: `scope-${start + i}`,
			kind: signature.kind,
			topic: signature.topic,
			status,
		});
	}
}

describe("promotion-pipeline", () => {
	let db: HyperIdleDb;
	let eventBus: EventBus;

	beforeEach(() => {
		db = createTestDb();
		eventBus = new EventBus();
	});

	// --- AC2 — auto-promotion at 5+ cross-scope repetitions ---

	describe("checkAutoPromotion (AC2)", () => {
		it("returns shouldPromote=true when 5 distinct scopes match signature", () => {
			const subject = seedKi(db, {
				id: "subject",
				layer: "L3",
				scopeId: "scope-subject",
				kind: "pattern",
				topic: "auth",
				status: "provisional",
			});
			// 4 siblings in other scopes (+ subject = 5 distinct scopes total)
			seedRepetitionCluster(db, { layer: "L3", topic: "auth", kind: "pattern" }, "sibling", 4);

			const result = checkAutoPromotion(db, subject.id);
			expect(result.shouldPromote).toBe(true);
		});

		it("returns shouldPromote=false at count=4 (just below threshold)", () => {
			const subject = seedKi(db, {
				id: "subject",
				layer: "L3",
				scopeId: "scope-subject",
				kind: "pattern",
				topic: "auth",
				status: "provisional",
			});
			// 3 siblings (+ subject = 4 distinct scopes)
			seedRepetitionCluster(db, { layer: "L3", topic: "auth", kind: "pattern" }, "sibling", 3);

			const result = checkAutoPromotion(db, subject.id);
			expect(result.shouldPromote).toBe(false);
		});

		it("ignores archived items in the count", () => {
			const subject = seedKi(db, {
				id: "subject",
				layer: "L3",
				scopeId: "scope-subject",
				kind: "pattern",
				topic: "auth",
				status: "provisional",
			});
			// 4 active siblings + 10 archived — archived must not count
			seedRepetitionCluster(db, { layer: "L3", topic: "auth", kind: "pattern" }, "archived", 10, {
				status: "archived",
			});
			seedRepetitionCluster(db, { layer: "L3", topic: "auth", kind: "pattern" }, "sibling", 3, {
				startIndex: 20,
			});

			const result = checkAutoPromotion(db, subject.id);
			expect(result.shouldPromote).toBe(false);
		});

		it("ignores items without scope_id (cannot demonstrate cross-product)", () => {
			const subject = seedKi(db, {
				id: "subject",
				layer: "L3",
				scopeId: "scope-subject",
				kind: "pattern",
				topic: "auth",
				status: "provisional",
			});
			// 10 matching items with no scope — must not contribute to distinct-scope count
			for (let i = 0; i < 10; i++) {
				seedKi(db, {
					id: `no-scope-${i}`,
					layer: "L3",
					scopeId: null,
					kind: "pattern",
					topic: "auth",
					status: "active",
				});
			}
			const result = checkAutoPromotion(db, subject.id);
			expect(result.shouldPromote).toBe(false);
		});

		it("exposes the threshold constant as 5 per AC2", () => {
			expect(AUTO_PROMOTION_REPETITION_THRESHOLD).toBe(5);
		});

		it("AUTO_PROMOTION_EDITOR uses the reserved system:* prefix (W5)", () => {
			// `system:*` is reserved for machine-initiated edits and must
			// not clash with `agent:*` ids used for real agents.
			expect(AUTO_PROMOTION_EDITOR).toBe("system:auto-promotion");
			expect(AUTO_PROMOTION_EDITOR.startsWith("system:")).toBe(true);
		});

		it("runAutoPromotionSweep respects maxBatchSize (W4)", async () => {
			// Seed 3 provisional items that would promote — one cluster of
			// five scopes for each. Call the sweep with maxBatchSize=1 and
			// verify only 1 is processed in this pass.
			for (let i = 0; i < 3; i++) {
				const subjectId = `subject-${i}`;
				seedKi(db, {
					id: subjectId,
					layer: "L3",
					scopeId: `subject-scope-${i}`,
					kind: "pattern",
					topic: `topic-${i}`,
					status: "provisional",
				});
				seedRepetitionCluster(
					db,
					{ layer: "L3", topic: `topic-${i}`, kind: "pattern" },
					`sibling-${i}`,
					4,
					{ startIndex: i * 100 },
				);
			}

			const summary = await runAutoPromotionSweep(db, eventBus, 1);
			expect(summary.scanned).toBe(1);
		});

		it("runStaleSweep respects maxBatchSize (W4)", async () => {
			const OLDER = new Date(NOW_MS - STALE_THRESHOLD_MS - 1000).toISOString();
			for (let i = 0; i < 5; i++) {
				seedKi(db, { id: `old-${i}`, status: "active", updatedAt: OLDER });
			}
			const summary = await runStaleSweep(db, eventBus, NOW_MS, STALE_THRESHOLD_MS, {
				maxBatchSize: 2,
			});
			expect(summary.markedIds.length).toBe(2);
		});

		it("treats topic=NULL and topic='' as DISTINCT signatures (W1)", () => {
			// Subject has topic = null.
			const subject = seedKi(db, {
				id: "subject",
				layer: "L3",
				scopeId: "scope-subject",
				kind: "pattern",
				topic: null,
				status: "provisional",
			});
			// Four siblings with topic = '' (explicitly blank) — these must
			// NOT count toward the null-topic signature.
			for (let i = 0; i < 4; i++) {
				seedKi(db, {
					id: `empty-${i}`,
					layer: "L3",
					scopeId: `scope-empty-${i}`,
					kind: "pattern",
					topic: "",
					status: "active",
				});
			}

			const result = checkAutoPromotion(db, subject.id);
			expect(result.shouldPromote).toBe(false);
			// Only the subject itself matches the null-topic signature =>
			// distinct scopes = 1.
			expect(result.distinctScopes).toBe(1);
		});

		it("treats topic='' and topic=NULL as DISTINCT signatures in the other direction (W1)", () => {
			const subject = seedKi(db, {
				id: "subject",
				layer: "L3",
				scopeId: "scope-subject",
				kind: "pattern",
				topic: "",
				status: "provisional",
			});
			for (let i = 0; i < 4; i++) {
				seedKi(db, {
					id: `null-${i}`,
					layer: "L3",
					scopeId: `scope-null-${i}`,
					kind: "pattern",
					topic: null,
					status: "active",
				});
			}

			const result = checkAutoPromotion(db, subject.id);
			expect(result.shouldPromote).toBe(false);
			expect(result.distinctScopes).toBe(1);
		});
	});

	// --- AC3 — contradiction check ---

	describe("detectLayerContradiction (AC3)", () => {
		it("contradicts=true when L4 principle.meta.forbids overlaps L3.meta.claims", () => {
			const l3 = seedKi(db, {
				id: "l3-practice",
				layer: "L3",
				kind: "pattern",
				topic: "auth",
				status: "provisional",
				meta: { claims: ["store-secrets-in-env-vars"] },
			});
			seedKi(db, {
				id: "l4-principle",
				layer: "L4",
				kind: "principle",
				topic: "auth",
				status: "active",
				meta: { forbids: ["store-secrets-in-env-vars"] },
			});

			const result = detectLayerContradiction(db, l3.id);
			expect(result.contradicts).toBe(true);
			if (!result.contradicts) return;
			expect(result.withItemId).toBe("l4-principle");
		});

		it("contradicts=true when L4 principle.meta.forbids contains the L3 item's topic", () => {
			const l3 = seedKi(db, {
				id: "l3-practice",
				layer: "L3",
				kind: "pattern",
				topic: "use-jwt",
				status: "provisional",
			});
			seedKi(db, {
				id: "l4-principle",
				layer: "L4",
				kind: "principle",
				topic: "use-jwt",
				status: "active",
				meta: { forbids: ["use-jwt"] },
			});

			const result = detectLayerContradiction(db, l3.id);
			expect(result.contradicts).toBe(true);
		});

		it("contradicts=false when no overlap", () => {
			const l3 = seedKi(db, {
				id: "l3-practice",
				layer: "L3",
				kind: "pattern",
				topic: "auth",
				status: "provisional",
				meta: { claims: ["use-oauth"] },
			});
			seedKi(db, {
				id: "l4-principle",
				layer: "L4",
				kind: "principle",
				topic: "auth",
				status: "active",
				meta: { forbids: ["unrelated-thing"] },
			});
			const result = detectLayerContradiction(db, l3.id);
			expect(result.contradicts).toBe(false);
		});

		it("contradicts=false when topics don't match", () => {
			const l3 = seedKi(db, {
				id: "l3-practice",
				layer: "L3",
				kind: "pattern",
				topic: "auth",
				status: "provisional",
				meta: { claims: ["x"] },
			});
			seedKi(db, {
				id: "l4-principle",
				layer: "L4",
				kind: "principle",
				topic: "billing",
				status: "active",
				meta: { forbids: ["x"] },
			});
			const result = detectLayerContradiction(db, l3.id);
			expect(result.contradicts).toBe(false);
		});

		it("contradicts=false when no L4 principles exist", () => {
			const l3 = seedKi(db, {
				id: "l3-only",
				layer: "L3",
				kind: "pattern",
				topic: "auth",
				status: "provisional",
				meta: { claims: ["x"] },
			});
			const result = detectLayerContradiction(db, l3.id);
			expect(result.contradicts).toBe(false);
		});

		it("contradicts=false when subject item is not L3 (rule applies only to L3 proposals)", () => {
			const l2 = seedKi(db, {
				id: "l2-item",
				layer: "L2",
				kind: "pattern",
				topic: "auth",
				status: "provisional",
				meta: { claims: ["x"] },
			});
			seedKi(db, {
				id: "l4-principle",
				layer: "L4",
				kind: "principle",
				topic: "auth",
				status: "active",
				meta: { forbids: ["x"] },
			});
			const result = detectLayerContradiction(db, l2.id);
			expect(result.contradicts).toBe(false);
		});
	});

	// --- AC4 — stale detection ---

	describe("stale detection (AC4)", () => {
		const OLDER_THAN_90_DAYS = new Date(NOW_MS - STALE_THRESHOLD_MS - 1000).toISOString();
		const WITHIN_90_DAYS = new Date(NOW_MS - 10 * 24 * 60 * 60 * 1000).toISOString();

		it("findStaleItems returns active items with updated_at older than 90 days", () => {
			seedKi(db, { id: "stale-1", status: "active", updatedAt: OLDER_THAN_90_DAYS });
			seedKi(db, { id: "fresh-1", status: "active", updatedAt: WITHIN_90_DAYS });

			const stale = findStaleItems(db, NOW_MS);
			const ids = stale.map((s) => s.id);
			expect(ids).toContain("stale-1");
			expect(ids).not.toContain("fresh-1");
		});

		it("findStaleItems does NOT return active items within 90 days", () => {
			seedKi(db, { id: "fresh", status: "active", updatedAt: WITHIN_90_DAYS });
			const stale = findStaleItems(db, NOW_MS);
			expect(stale.some((s) => s.id === "fresh")).toBe(false);
		});

		it("findStaleItems does NOT return non-active items", () => {
			seedKi(db, { id: "old-prov", status: "provisional", updatedAt: OLDER_THAN_90_DAYS });
			seedKi(db, { id: "old-stale", status: "stale", updatedAt: OLDER_THAN_90_DAYS });
			seedKi(db, { id: "old-arch", status: "archived", updatedAt: OLDER_THAN_90_DAYS });
			const stale = findStaleItems(db, NOW_MS);
			const ids = stale.map((s) => s.id);
			expect(ids).not.toContain("old-prov");
			expect(ids).not.toContain("old-stale");
			expect(ids).not.toContain("old-arch");
		});

		it("markStale transitions active→stale and writes edit log with editor='system:auto-promotion'", () => {
			seedKi(db, { id: "m-1", status: "active", updatedAt: OLDER_THAN_90_DAYS });
			markStale(db, "m-1");

			const row = db.select().from(knowledgeItems).where(eq(knowledgeItems.id, "m-1")).get();
			expect(row?.status).toBe("stale");

			const log = db
				.select()
				.from(knowledgeEditLog)
				.where(eq(knowledgeEditLog.itemId, "m-1"))
				.all();
			const statusLog = log.find((l) => l.field === "status");
			expect(statusLog).toBeDefined();
			expect(statusLog?.editor).toBe("system:auto-promotion");
			expect(statusLog?.oldValue).toBe("active");
			expect(statusLog?.newValue).toContain("stale");
		});

		it("runStaleSweep emits knowledge_updated action=marked_stale", async () => {
			seedKi(db, { id: "s-1", status: "active", updatedAt: OLDER_THAN_90_DAYS });
			const received: KnowledgeUpdatedEvent[] = [];
			eventBus.on("knowledge_updated", (e) => {
				received.push(e);
			});

			await runStaleSweep(db, eventBus, NOW_MS);

			expect(received.some((e) => e.itemId === "s-1" && e.action === "marked_stale")).toBe(true);
		});
	});

	// --- AC2 + AC5 integration — sweep respects gates ---

	describe("runAutoPromotionSweep (AC2 + AC3 + AC5)", () => {
		function seedProvisionalClusterOf5(db: HyperIdleDb, subjectId: string): void {
			seedKi(db, {
				id: subjectId,
				layer: "L3",
				scopeId: "scope-subject",
				kind: "pattern",
				topic: "auth",
				status: "provisional",
			});
			seedRepetitionCluster(db, { layer: "L3", topic: "auth", kind: "pattern" }, "sibling", 4);
		}

		it("promotes provisional→validated when count>=5, no conflicts, no contradictions (AC2)", async () => {
			seedProvisionalClusterOf5(db, "subject");
			const summary = await runAutoPromotionSweep(db, eventBus);
			expect(summary.promotedIds).toContain("subject");

			const row = db.select().from(knowledgeItems).where(eq(knowledgeItems.id, "subject")).get();
			expect(row?.status).toBe("validated");
		});

		it("emits knowledge_updated action=auto_promoted (AC2)", async () => {
			seedProvisionalClusterOf5(db, "subject");
			const received: KnowledgeUpdatedEvent[] = [];
			eventBus.on("knowledge_updated", (e) => {
				received.push(e);
			});

			await runAutoPromotionSweep(db, eventBus);
			const promoteEvent = received.find(
				(e) => e.itemId === "subject" && e.action === "auto_promoted",
			);
			expect(promoteEvent).toBeDefined();
		});

		it("writes editor='system:auto-promotion' on the promotion edit log (AC2 constraint)", async () => {
			seedProvisionalClusterOf5(db, "subject");
			await runAutoPromotionSweep(db, eventBus);

			const log = db
				.select()
				.from(knowledgeEditLog)
				.where(eq(knowledgeEditLog.itemId, "subject"))
				.all();
			const statusLog = log.find((l) => l.field === "status");
			expect(statusLog).toBeDefined();
			expect(statusLog?.editor).toBe("system:auto-promotion");
		});

		it("does NOT promote when contradiction detected, even with 5+ repetitions (AC3)", async () => {
			seedProvisionalClusterOf5(db, "subject");
			// Store claims on subject; add a contradicting L4 principle
			db.update(knowledgeItems)
				.set({ meta: JSON.stringify({ claims: ["forbidden-x"] }) })
				.where(eq(knowledgeItems.id, "subject"))
				.run();
			seedKi(db, {
				id: "l4-forbid",
				layer: "L4",
				kind: "principle",
				topic: "auth",
				status: "active",
				meta: { forbids: ["forbidden-x"] },
			});

			const summary = await runAutoPromotionSweep(db, eventBus);
			expect(summary.promotedIds).not.toContain("subject");
			const row = db.select().from(knowledgeItems).where(eq(knowledgeItems.id, "subject")).get();
			expect(row?.status).toBe("provisional");
			expect(summary.flaggedForReviewIds).toContain("subject");
		});

		it("emits knowledge_updated action=contradiction_flagged (AC3)", async () => {
			seedProvisionalClusterOf5(db, "subject");
			db.update(knowledgeItems)
				.set({ meta: JSON.stringify({ claims: ["forbidden-x"] }) })
				.where(eq(knowledgeItems.id, "subject"))
				.run();
			seedKi(db, {
				id: "l4-forbid",
				layer: "L4",
				kind: "principle",
				topic: "auth",
				status: "active",
				meta: { forbids: ["forbidden-x"] },
			});

			const received: KnowledgeUpdatedEvent[] = [];
			eventBus.on("knowledge_updated", (e) => {
				received.push(e);
			});
			await runAutoPromotionSweep(db, eventBus);
			expect(
				received.some((e) => e.itemId === "subject" && e.action === "contradiction_flagged"),
			).toBe(true);
		});

		it("does NOT promote when an open conflict exists, even with 5+ repetitions (AC5)", async () => {
			seedProvisionalClusterOf5(db, "subject");
			seedConflict(db, "conf-open", "subject", "open");
			const summary = await runAutoPromotionSweep(db, eventBus);
			expect(summary.promotedIds).not.toContain("subject");
			const row = db.select().from(knowledgeItems).where(eq(knowledgeItems.id, "subject")).get();
			expect(row?.status).toBe("provisional");
		});

		it("DOES promote when only resolved/discarded conflicts exist (AC5)", async () => {
			seedProvisionalClusterOf5(db, "subject");
			seedConflict(db, "conf-1", "subject", "resolved");
			seedConflict(db, "conf-2", "subject", "discarded");
			const summary = await runAutoPromotionSweep(db, eventBus);
			expect(summary.promotedIds).toContain("subject");
		});

		it("skips items below threshold (no spurious promotions)", async () => {
			// Only subject — count=1 distinct scope, below threshold
			seedKi(db, {
				id: "subject",
				layer: "L3",
				scopeId: "scope-solo",
				kind: "pattern",
				topic: "auth",
				status: "provisional",
			});
			const summary = await runAutoPromotionSweep(db, eventBus);
			expect(summary.promotedIds).not.toContain("subject");
		});
	});
});
