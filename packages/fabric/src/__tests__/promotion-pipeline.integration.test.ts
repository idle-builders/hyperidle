import {
	type HyperIdleDb,
	knowledgeConflicts,
	knowledgeEditLog,
	knowledgeItems,
	knowledgeStrategyFabric,
} from "@hyperidle/db";
import { describe, expect, test } from "@hyperidle/db/test-fixtures";
import { EventBus, type KnowledgeUpdatedEvent } from "@hyperidle/shared";
import { eq } from "drizzle-orm";
import type { KnowledgeItemWithFabric } from "../knowledge-repository.js";
import {
	AUTO_PROMOTION_EDITOR,
	AUTO_PROMOTION_REPETITION_THRESHOLD,
	checkAutoPromotion,
	detectLayerContradiction,
	findStaleItems,
	markStale,
	runAutoPromotionSweep,
	runStaleSweep,
	STALE_THRESHOLD_MS,
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

/**
 * @lore O2: seedKi inserts into BOTH the kernel knowledgeItems table and the
 * knowledgeStrategyFabric extension table. Strategy fields (layer, scopeId,
 * kind, meta) are no longer columns on the kernel table.
 */
async function seedKi(db: HyperIdleDb, overrides: SeedOverrides): Promise<KnowledgeItemWithFabric> {
	const metaStr =
		overrides.meta === null || overrides.meta === undefined ? null : JSON.stringify(overrides.meta);

	const kernelRow = {
		id: overrides.id,
		topic: overrides.topic === undefined ? "testing" : overrides.topic,
		title: overrides.title ?? "Test",
		body: overrides.body ?? "Body",
		format: "markdown",
		status: overrides.status ?? "provisional",
		version: overrides.version ?? 1,
		updatedBy: "agent:seed",
		createdAt: NOW,
		updatedAt: overrides.updatedAt ?? NOW,
	};
	await db.insert(knowledgeItems).values(kernelRow);

	// Insert strategy extension row
	await db.insert(knowledgeStrategyFabric).values({
		id: `ksf-${overrides.id}`,
		knowledgeItemId: overrides.id,
		layer: overrides.layer ?? "L3",
		scopeId: overrides.scopeId === undefined ? "scope-a" : overrides.scopeId,
		kind: overrides.kind ?? "pattern",
		attentionScore: null,
		confidence: null,
		meta: metaStr,
	});

	return {
		...kernelRow,
		layer: overrides.layer ?? "L3",
		scopeId: overrides.scopeId === undefined ? "scope-a" : overrides.scopeId,
		kind: overrides.kind ?? "pattern",
		attentionScore: null,
		confidence: null,
		meta: metaStr,
	};
}

async function seedConflict(
	db: HyperIdleDb,
	id: string,
	itemId: string,
	status: "open" | "resolved" | "discarded",
): Promise<void> {
	await db.insert(knowledgeConflicts).values({
		id,
		itemId,
		versionBase: 1,
		versionCurrent: 1,
		proposedBody: "proposed",
		proposedBy: "agent:other",
		status,
		createdAt: NOW,
	});
}

async function seedRepetitionCluster(
	db: HyperIdleDb,
	signature: { layer: string; topic: string; kind: string },
	idPrefix: string,
	count: number,
	options: { status?: string; startIndex?: number } = {},
): Promise<void> {
	const status = options.status ?? "active";
	const start = options.startIndex ?? 0;
	for (let i = 0; i < count; i++) {
		await seedKi(db, {
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
	// --- AC2 — auto-promotion at 5+ cross-scope repetitions ---

	describe("checkAutoPromotion (AC2)", () => {
		test("returns shouldPromote=true when 5 distinct scopes match signature", async ({ db }) => {
			const subject = await seedKi(db, {
				id: "subject",
				layer: "L3",
				scopeId: "scope-subject",
				kind: "pattern",
				topic: "auth",
				status: "provisional",
			});
			// 4 siblings in other scopes (+ subject = 5 distinct scopes total)
			await seedRepetitionCluster(
				db,
				{ layer: "L3", topic: "auth", kind: "pattern" },
				"sibling",
				4,
			);

			const result = await checkAutoPromotion(db, subject.id);
			expect(result.shouldPromote).toBe(true);
		});

		test("returns shouldPromote=false at count=4 (just below threshold)", async ({ db }) => {
			const subject = await seedKi(db, {
				id: "subject",
				layer: "L3",
				scopeId: "scope-subject",
				kind: "pattern",
				topic: "auth",
				status: "provisional",
			});
			// 3 siblings (+ subject = 4 distinct scopes)
			await seedRepetitionCluster(
				db,
				{ layer: "L3", topic: "auth", kind: "pattern" },
				"sibling",
				3,
			);

			const result = await checkAutoPromotion(db, subject.id);
			expect(result.shouldPromote).toBe(false);
		});

		test("ignores archived items in the count", async ({ db }) => {
			const subject = await seedKi(db, {
				id: "subject",
				layer: "L3",
				scopeId: "scope-subject",
				kind: "pattern",
				topic: "auth",
				status: "provisional",
			});
			// 4 active siblings + 10 archived — archived must not count
			await seedRepetitionCluster(
				db,
				{ layer: "L3", topic: "auth", kind: "pattern" },
				"archived",
				10,
				{
					status: "archived",
				},
			);
			await seedRepetitionCluster(
				db,
				{ layer: "L3", topic: "auth", kind: "pattern" },
				"sibling",
				3,
				{
					startIndex: 20,
				},
			);

			const result = await checkAutoPromotion(db, subject.id);
			expect(result.shouldPromote).toBe(false);
		});

		test("ignores items without scope_id (cannot demonstrate cross-product)", async ({ db }) => {
			const subject = await seedKi(db, {
				id: "subject",
				layer: "L3",
				scopeId: "scope-subject",
				kind: "pattern",
				topic: "auth",
				status: "provisional",
			});
			// 10 matching items with no scope — must not contribute to distinct-scope count
			for (let i = 0; i < 10; i++) {
				await seedKi(db, {
					id: `no-scope-${i}`,
					layer: "L3",
					scopeId: null,
					kind: "pattern",
					topic: "auth",
					status: "active",
				});
			}
			const result = await checkAutoPromotion(db, subject.id);
			expect(result.shouldPromote).toBe(false);
		});

		test("exposes the threshold constant as 5 per AC2", () => {
			expect(AUTO_PROMOTION_REPETITION_THRESHOLD).toBe(5);
		});

		test("AUTO_PROMOTION_EDITOR uses the reserved system:* prefix (W5)", () => {
			// `system:*` is reserved for machine-initiated edits and must
			// not clash with `agent:*` ids used for real agents.
			expect(AUTO_PROMOTION_EDITOR).toBe("system:auto-promotion");
			expect(AUTO_PROMOTION_EDITOR.startsWith("system:")).toBe(true);
		});

		test("runAutoPromotionSweep respects maxBatchSize (W4)", async ({ db }) => {
			// Seed 3 provisional items that would promote — one cluster of
			// five scopes for each. Call the sweep with maxBatchSize=1 and
			// verify only 1 is processed in this pass.
			const eventBus = new EventBus();
			for (let i = 0; i < 3; i++) {
				const subjectId = `subject-${i}`;
				await seedKi(db, {
					id: subjectId,
					layer: "L3",
					scopeId: `subject-scope-${i}`,
					kind: "pattern",
					topic: `topic-${i}`,
					status: "provisional",
				});
				await seedRepetitionCluster(
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

		test("runStaleSweep respects maxBatchSize (W4)", async ({ db }) => {
			const eventBus = new EventBus();
			const OLDER = new Date(NOW_MS - STALE_THRESHOLD_MS - 1000).toISOString();
			for (let i = 0; i < 5; i++) {
				await seedKi(db, { id: `old-${i}`, status: "active", updatedAt: OLDER });
			}
			const summary = await runStaleSweep(db, eventBus, NOW_MS, STALE_THRESHOLD_MS, {
				maxBatchSize: 2,
			});
			expect(summary.markedIds.length).toBe(2);
		});

		test("treats topic=NULL and topic='' as DISTINCT signatures (W1)", async ({ db }) => {
			// Subject has topic = null.
			const subject = await seedKi(db, {
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
				await seedKi(db, {
					id: `empty-${i}`,
					layer: "L3",
					scopeId: `scope-empty-${i}`,
					kind: "pattern",
					topic: "",
					status: "active",
				});
			}

			const result = await checkAutoPromotion(db, subject.id);
			expect(result.shouldPromote).toBe(false);
			// Only the subject itself matches the null-topic signature =>
			// distinct scopes = 1.
			expect(result.distinctScopes).toBe(1);
		});

		test("treats topic='' and topic=NULL as DISTINCT signatures in the other direction (W1)", async ({
			db,
		}) => {
			const subject = await seedKi(db, {
				id: "subject",
				layer: "L3",
				scopeId: "scope-subject",
				kind: "pattern",
				topic: "",
				status: "provisional",
			});
			for (let i = 0; i < 4; i++) {
				await seedKi(db, {
					id: `null-${i}`,
					layer: "L3",
					scopeId: `scope-null-${i}`,
					kind: "pattern",
					topic: null,
					status: "active",
				});
			}

			const result = await checkAutoPromotion(db, subject.id);
			expect(result.shouldPromote).toBe(false);
			expect(result.distinctScopes).toBe(1);
		});
	});

	// --- AC3 — contradiction check ---

	describe("detectLayerContradiction (AC3)", () => {
		test("contradicts=true when L4 principle.meta.forbids overlaps L3.meta.claims", async ({
			db,
		}) => {
			const l3 = await seedKi(db, {
				id: "l3-practice",
				layer: "L3",
				kind: "pattern",
				topic: "auth",
				status: "provisional",
				meta: { claims: ["store-secrets-in-env-vars"] },
			});
			await seedKi(db, {
				id: "l4-principle",
				layer: "L4",
				kind: "principle",
				topic: "auth",
				status: "active",
				meta: { forbids: ["store-secrets-in-env-vars"] },
			});

			const result = await detectLayerContradiction(db, l3.id);
			expect(result.contradicts).toBe(true);
			if (!result.contradicts) return;
			expect(result.withItemId).toBe("l4-principle");
		});

		test("contradicts=true when L4 principle.meta.forbids contains the L3 item's topic", async ({
			db,
		}) => {
			const l3 = await seedKi(db, {
				id: "l3-practice",
				layer: "L3",
				kind: "pattern",
				topic: "use-jwt",
				status: "provisional",
			});
			await seedKi(db, {
				id: "l4-principle",
				layer: "L4",
				kind: "principle",
				topic: "use-jwt",
				status: "active",
				meta: { forbids: ["use-jwt"] },
			});

			const result = await detectLayerContradiction(db, l3.id);
			expect(result.contradicts).toBe(true);
		});

		test("contradicts=false when no overlap", async ({ db }) => {
			const l3 = await seedKi(db, {
				id: "l3-practice",
				layer: "L3",
				kind: "pattern",
				topic: "auth",
				status: "provisional",
				meta: { claims: ["use-oauth"] },
			});
			await seedKi(db, {
				id: "l4-principle",
				layer: "L4",
				kind: "principle",
				topic: "auth",
				status: "active",
				meta: { forbids: ["unrelated-thing"] },
			});
			const result = await detectLayerContradiction(db, l3.id);
			expect(result.contradicts).toBe(false);
		});

		test("contradicts=false when topics don't match", async ({ db }) => {
			const l3 = await seedKi(db, {
				id: "l3-practice",
				layer: "L3",
				kind: "pattern",
				topic: "auth",
				status: "provisional",
				meta: { claims: ["x"] },
			});
			await seedKi(db, {
				id: "l4-principle",
				layer: "L4",
				kind: "principle",
				topic: "billing",
				status: "active",
				meta: { forbids: ["x"] },
			});
			const result = await detectLayerContradiction(db, l3.id);
			expect(result.contradicts).toBe(false);
		});

		test("contradicts=false when no L4 principles exist", async ({ db }) => {
			const l3 = await seedKi(db, {
				id: "l3-only",
				layer: "L3",
				kind: "pattern",
				topic: "auth",
				status: "provisional",
				meta: { claims: ["x"] },
			});
			const result = await detectLayerContradiction(db, l3.id);
			expect(result.contradicts).toBe(false);
		});

		test("contradicts=false when subject item is not L3 (rule applies only to L3 proposals)", async ({
			db,
		}) => {
			const l2 = await seedKi(db, {
				id: "l2-item",
				layer: "L2",
				kind: "pattern",
				topic: "auth",
				status: "provisional",
				meta: { claims: ["x"] },
			});
			await seedKi(db, {
				id: "l4-principle",
				layer: "L4",
				kind: "principle",
				topic: "auth",
				status: "active",
				meta: { forbids: ["x"] },
			});
			const result = await detectLayerContradiction(db, l2.id);
			expect(result.contradicts).toBe(false);
		});
	});

	// --- AC4 — stale detection ---

	describe("stale detection (AC4)", () => {
		const OLDER_THAN_90_DAYS = new Date(NOW_MS - STALE_THRESHOLD_MS - 1000).toISOString();
		const WITHIN_90_DAYS = new Date(NOW_MS - 10 * 24 * 60 * 60 * 1000).toISOString();

		test("findStaleItems returns active items with updated_at older than 90 days", async ({
			db,
		}) => {
			await seedKi(db, { id: "stale-1", status: "active", updatedAt: OLDER_THAN_90_DAYS });
			await seedKi(db, { id: "fresh-1", status: "active", updatedAt: WITHIN_90_DAYS });

			const stale = await findStaleItems(db, NOW_MS);
			const ids = stale.map((s) => s.id);
			expect(ids).toContain("stale-1");
			expect(ids).not.toContain("fresh-1");
		});

		test("findStaleItems does NOT return active items within 90 days", async ({ db }) => {
			await seedKi(db, { id: "fresh", status: "active", updatedAt: WITHIN_90_DAYS });
			const stale = await findStaleItems(db, NOW_MS);
			expect(stale.some((s) => s.id === "fresh")).toBe(false);
		});

		test("findStaleItems does NOT return non-active items", async ({ db }) => {
			await seedKi(db, { id: "old-prov", status: "provisional", updatedAt: OLDER_THAN_90_DAYS });
			await seedKi(db, { id: "old-stale", status: "stale", updatedAt: OLDER_THAN_90_DAYS });
			await seedKi(db, { id: "old-arch", status: "archived", updatedAt: OLDER_THAN_90_DAYS });
			const stale = await findStaleItems(db, NOW_MS);
			const ids = stale.map((s) => s.id);
			expect(ids).not.toContain("old-prov");
			expect(ids).not.toContain("old-stale");
			expect(ids).not.toContain("old-arch");
		});

		test("markStale transitions active→stale and writes edit log with editor='system:auto-promotion'", async ({
			db,
		}) => {
			await seedKi(db, { id: "m-1", status: "active", updatedAt: OLDER_THAN_90_DAYS });
			await markStale(db, "m-1");

			const [row] = await db
				.select()
				.from(knowledgeItems)
				.where(eq(knowledgeItems.id, "m-1"))
				.limit(1);
			expect(row?.status).toBe("stale");

			const log = await db
				.select()
				.from(knowledgeEditLog)
				.where(eq(knowledgeEditLog.itemId, "m-1"));
			const statusLog = log.find((l) => l.field === "status");
			expect(statusLog).toBeDefined();
			expect(statusLog?.editor).toBe("system:auto-promotion");
			expect(statusLog?.oldValue).toBe("active");
			expect(statusLog?.newValue).toContain("stale");
		});

		test("runStaleSweep emits knowledge_updated action=marked_stale", async ({ db }) => {
			const eventBus = new EventBus();
			await seedKi(db, { id: "s-1", status: "active", updatedAt: OLDER_THAN_90_DAYS });
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
		async function seedProvisionalClusterOf5(db: HyperIdleDb, subjectId: string): Promise<void> {
			await seedKi(db, {
				id: subjectId,
				layer: "L3",
				scopeId: "scope-subject",
				kind: "pattern",
				topic: "auth",
				status: "provisional",
			});
			await seedRepetitionCluster(
				db,
				{ layer: "L3", topic: "auth", kind: "pattern" },
				"sibling",
				4,
			);
		}

		test("promotes provisional→validated when count>=5, no conflicts, no contradictions (AC2)", async ({
			db,
		}) => {
			const eventBus = new EventBus();
			await seedProvisionalClusterOf5(db, "subject");
			const summary = await runAutoPromotionSweep(db, eventBus);
			expect(summary.promotedIds).toContain("subject");

			const [row] = await db
				.select()
				.from(knowledgeItems)
				.where(eq(knowledgeItems.id, "subject"))
				.limit(1);
			expect(row?.status).toBe("validated");
		});

		test("emits knowledge_updated action=auto_promoted (AC2)", async ({ db }) => {
			const eventBus = new EventBus();
			await seedProvisionalClusterOf5(db, "subject");
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

		test("writes editor='system:auto-promotion' on the promotion edit log (AC2 constraint)", async ({
			db,
		}) => {
			const eventBus = new EventBus();
			await seedProvisionalClusterOf5(db, "subject");
			await runAutoPromotionSweep(db, eventBus);

			const log = await db
				.select()
				.from(knowledgeEditLog)
				.where(eq(knowledgeEditLog.itemId, "subject"));
			const statusLog = log.find((l) => l.field === "status");
			expect(statusLog).toBeDefined();
			expect(statusLog?.editor).toBe("system:auto-promotion");
		});

		test("does NOT promote when contradiction detected, even with 5+ repetitions (AC3)", async ({
			db,
		}) => {
			const eventBus = new EventBus();
			await seedProvisionalClusterOf5(db, "subject");
			// Store claims on subject; add a contradicting L4 principle
			// @lore O2: meta is in knowledgeStrategyFabric, not knowledgeItems
			await db
				.update(knowledgeStrategyFabric)
				.set({ meta: JSON.stringify({ claims: ["forbidden-x"] }) })
				.where(eq(knowledgeStrategyFabric.knowledgeItemId, "subject"));
			await seedKi(db, {
				id: "l4-forbid",
				layer: "L4",
				kind: "principle",
				topic: "auth",
				status: "active",
				meta: { forbids: ["forbidden-x"] },
			});

			const summary = await runAutoPromotionSweep(db, eventBus);
			expect(summary.promotedIds).not.toContain("subject");
			const [row] = await db
				.select()
				.from(knowledgeItems)
				.where(eq(knowledgeItems.id, "subject"))
				.limit(1);
			expect(row?.status).toBe("provisional");
			expect(summary.flaggedForReviewIds).toContain("subject");
		});

		test("emits knowledge_updated action=contradiction_flagged (AC3)", async ({ db }) => {
			const eventBus = new EventBus();
			await seedProvisionalClusterOf5(db, "subject");
			// @lore O2: meta is in knowledgeStrategyFabric, not knowledgeItems
			await db
				.update(knowledgeStrategyFabric)
				.set({ meta: JSON.stringify({ claims: ["forbidden-x"] }) })
				.where(eq(knowledgeStrategyFabric.knowledgeItemId, "subject"));
			await seedKi(db, {
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

		test("does NOT promote when an open conflict exists, even with 5+ repetitions (AC5)", async ({
			db,
		}) => {
			const eventBus = new EventBus();
			await seedProvisionalClusterOf5(db, "subject");
			await seedConflict(db, "conf-open", "subject", "open");
			const summary = await runAutoPromotionSweep(db, eventBus);
			expect(summary.promotedIds).not.toContain("subject");
			const [row] = await db
				.select()
				.from(knowledgeItems)
				.where(eq(knowledgeItems.id, "subject"))
				.limit(1);
			expect(row?.status).toBe("provisional");
		});

		test("DOES promote when only resolved/discarded conflicts exist (AC5)", async ({ db }) => {
			const eventBus = new EventBus();
			await seedProvisionalClusterOf5(db, "subject");
			await seedConflict(db, "conf-1", "subject", "resolved");
			await seedConflict(db, "conf-2", "subject", "discarded");
			const summary = await runAutoPromotionSweep(db, eventBus);
			expect(summary.promotedIds).toContain("subject");
		});

		test("skips items below threshold (no spurious promotions)", async ({ db }) => {
			const eventBus = new EventBus();
			// Only subject — count=1 distinct scope, below threshold
			await seedKi(db, {
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
