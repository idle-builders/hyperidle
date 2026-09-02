/**
 * AF9 — AC4: Attention-sorted triage orders items by a real, populated score.
 *
 * Tests the attention population that the promotion sweep piggybacks.
 * The builtin routine mechanism was deleted in BA9d; these tests now call
 * `sweep(db, eventBus, "autoPromotion")` directly.
 *
 * - `recomputeScope` requires a filter (FILTER_REQUIRED) and rejects oversize
 *   batches (BATCH_TOO_LARGE). The sweep drives the narrow form:
 *   `{ ids: candidateIds }` — the form that passes the guards.
 * - Items seeded here ARE in the candidate set (status=provisional, meet the
 *   promotion threshold), so the sweep's attention recompute actually runs.
 * - Assertions verify differing scores across items with structurally different
 *   inputs (one with an open conflict, one without) — not a constant.
 */

import {
	type HyperIdleDb,
	knowledgeAppProjection,
	knowledgeConflicts,
	knowledgeItems,
} from "@hyperidle/db";
import { sweep } from "@hyperidle/knowledge";
import { eq } from "drizzle-orm";
import { describe, expect, test } from "../__testing__/test-fixtures.js";

const NOW_ISO = "2026-06-11T00:00:00.000Z";

/**
 * Seed 5 provisional items (same signature, distinct scopes) to meet the
 * promotion threshold. Returns all 5 ids.
 */
async function seedCandidates(db: HyperIdleDb, prefix: string): Promise<string[]> {
	const scopes = ["scope-a", "scope-b", "scope-c", "scope-d", "scope-e"];
	const ids: string[] = [];

	for (let i = 0; i < scopes.length; i++) {
		const id = `${prefix}-ki-${i}`;
		ids.push(id);
		await db.insert(knowledgeItems).values({
			id,
			scopeKind: "factory",
			scopeId: scopes[i],
			title: `Candidate ${prefix}-${i}`,
			body: "Body content for attention scoring.",
			format: "markdown",
			status: "proposed",
			version: 1,
			updatedBy: "agent:seed",
			createdAt: NOW_ISO,
			updatedAt: NOW_ISO,
		});
		await db.insert(knowledgeAppProjection).values({
			id: `ksf-${id}`,
			knowledgeItemId: id,
			scopeId: scopes[i],
			attentionScore: null,
		});
	}

	return ids;
}

describe("AF9 AC4: attention population on promotion sweep", () => {
	test("promotion sweep populates attentionScore on candidate items (not all null)", async ({
		db,
		eventBus,
	}) => {
		// Seed 5 provisional items that meet the promotion threshold.
		const ids = await seedCandidates(db, "attn-basic");

		// Sanity: all attentionScores start null.
		for (const id of ids) {
			const [row] = await db
				.select({ attentionScore: knowledgeAppProjection.attentionScore })
				.from(knowledgeAppProjection)
				.where(eq(knowledgeAppProjection.knowledgeItemId, id));
			expect(row?.attentionScore).toBeNull();
		}

		// Act: run the promotion sweep. Attention recompute is piggybacked on the sweep's candidate set.
		await sweep(db, eventBus, "autoPromotion");

		// Assert: at least some items now have a populated attentionScore.
		let populatedCount = 0;
		for (const id of ids) {
			const [fabric] = await db
				.select({ attentionScore: knowledgeAppProjection.attentionScore })
				.from(knowledgeAppProjection)
				.where(eq(knowledgeAppProjection.knowledgeItemId, id));
			if (fabric?.attentionScore != null) populatedCount++;
		}

		// At least one item's attentionScore was populated by the sweep.
		expect(populatedCount).toBeGreaterThan(0);
	});

	test("items with an open conflict score differently from items without (real differing scores)", async ({
		db,
		eventBus,
	}) => {
		// Seed 5 candidates using different prefix — isolated test.
		const ids = await seedCandidates(db, "attn-diff");
		const conflictedId = ids[0]!;
		const cleanId = ids[1]!;

		// Seed an open conflict on conflictedId only.
		await db.insert(knowledgeConflicts).values({
			id: "kc-af9-attn-1",
			itemId: conflictedId,
			versionBase: 1,
			versionCurrent: 1,
			proposedBody: "Proposed body",
			proposedBy: "agent:other",
			status: "open",
			createdAt: NOW_ISO,
		});

		// Act: run promotion sweep — attention recompute is piggybacked.
		await sweep(db, eventBus, "autoPromotion");

		// Retrieve scores.
		const [conflictedFabric] = await db
			.select({ attentionScore: knowledgeAppProjection.attentionScore })
			.from(knowledgeAppProjection)
			.where(eq(knowledgeAppProjection.knowledgeItemId, conflictedId));

		const [cleanFabric] = await db
			.select({ attentionScore: knowledgeAppProjection.attentionScore })
			.from(knowledgeAppProjection)
			.where(eq(knowledgeAppProjection.knowledgeItemId, cleanId));

		// Both scores must be populated (not null).
		expect(conflictedFabric?.attentionScore).not.toBeNull();
		expect(cleanFabric?.attentionScore).not.toBeNull();

		// Conflicted item scores higher than a clean item (open conflict raises attention).
		const conflictedScore = Number(conflictedFabric?.attentionScore);
		const cleanScore = Number(cleanFabric?.attentionScore);
		expect(Number.isFinite(conflictedScore)).toBe(true);
		expect(Number.isFinite(cleanScore)).toBe(true);
		expect(conflictedScore).toBeGreaterThan(cleanScore);
	});

	test("attentionScore values differ across items (not all equal — confirms real scoring)", async ({
		db,
		eventBus,
	}) => {
		// Two candidates: one gets an open conflict (higher attention), one is clean.
		const ids = await seedCandidates(db, "attn-neq");
		const conflictedId = ids[0]!;

		await db.insert(knowledgeConflicts).values({
			id: "kc-af9-neq-1",
			itemId: conflictedId,
			versionBase: 1,
			versionCurrent: 1,
			proposedBody: "Proposed",
			proposedBy: "agent:other",
			status: "open",
			createdAt: NOW_ISO,
		});

		await sweep(db, eventBus, "autoPromotion");

		// Collect all populated scores.
		const scores: number[] = [];
		for (const id of ids) {
			const [row] = await db
				.select({ attentionScore: knowledgeAppProjection.attentionScore })
				.from(knowledgeAppProjection)
				.where(eq(knowledgeAppProjection.knowledgeItemId, id));
			if (row?.attentionScore != null) {
				scores.push(Number(row.attentionScore));
			}
		}

		expect(scores.length).toBeGreaterThan(0);

		// Not all scores are identical — real scoring produces variance.
		// (The conflicted item gets a different score from the clean ones.)
		const uniqueScores = new Set(scores);
		expect(uniqueScores.size).toBeGreaterThan(1);
	});

	test("attention-sorted order reflects scores (conflicted item sorts above clean items)", async ({
		db,
		eventBus,
	}) => {
		const ids = await seedCandidates(db, "attn-order");
		const conflictedId = ids[2]!; // mid-list item gets a conflict

		await db.insert(knowledgeConflicts).values({
			id: "kc-af9-order-1",
			itemId: conflictedId,
			versionBase: 1,
			versionCurrent: 1,
			proposedBody: "Proposed",
			proposedBy: "agent:other",
			status: "open",
			createdAt: NOW_ISO,
		});

		await sweep(db, eventBus, "autoPromotion");

		// Retrieve scores for the conflicted item and the first clean item.
		const [conflictedFabric] = await db
			.select({ attentionScore: knowledgeAppProjection.attentionScore })
			.from(knowledgeAppProjection)
			.where(eq(knowledgeAppProjection.knowledgeItemId, conflictedId));

		const cleanId = ids[0]!; // no conflict seeded for ids[0]
		const [cleanFabric] = await db
			.select({ attentionScore: knowledgeAppProjection.attentionScore })
			.from(knowledgeAppProjection)
			.where(eq(knowledgeAppProjection.knowledgeItemId, cleanId));

		expect(conflictedFabric?.attentionScore).not.toBeNull();
		expect(cleanFabric?.attentionScore).not.toBeNull();

		const conflictedScore = Number(conflictedFabric?.attentionScore);
		const cleanScore = Number(cleanFabric?.attentionScore);

		// An item with an open conflict must score higher (attention engine weights conflicts).
		expect(conflictedScore).toBeGreaterThan(cleanScore);
	});
});
