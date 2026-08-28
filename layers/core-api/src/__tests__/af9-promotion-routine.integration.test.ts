/**
 * AF9 — AC2: Promotion sweep.
 *
 * Tests the knowledge-promotion sweep logic directly via `sweep(db, eventBus, "autoPromotion")`.
 * The builtin routine mechanism was deleted in BA9d; these tests now call the
 * underlying service function that the plugin (or a future scheduler entry)
 * will invoke.
 */

import {
	type HyperIdleDb,
	knowledgeAppProjection,
	knowledgeEditLog,
	knowledgeItems,
} from "@hyperidle/db";
import type { KnowledgeUpdatedEvent } from "@hyperidle/event-bus";
import { sweep } from "@hyperidle/knowledge";
import { eq } from "drizzle-orm";
import { describe, expect, test } from "../__testing__/test-fixtures.js";

const NOW_ISO = "2026-06-11T00:00:00.000Z";

/**
 * Seed 5 provisional items sharing the same (layer, topic, kind) signature
 * across 5 distinct scopeIds — the minimum threshold for auto-promotion.
 * Returns the id of the first item (the "subject").
 */
async function seedPromotionCandidates(db: HyperIdleDb, prefix: string): Promise<string> {
	const scopes = ["scope-a", "scope-b", "scope-c", "scope-d", "scope-e"];
	const layer = "L3";
	const topic = `topic-${prefix}`;
	const kind = "pattern";

	for (let i = 0; i < scopes.length; i++) {
		const id = `${prefix}-ki-${i}`;
		await db.insert(knowledgeItems).values({
			id,
			scopeKind: "factory",
			topic,
			title: `Candidate ${prefix}-${i}`,
			body: "Body",
			format: "markdown",
			status: "provisional",
			version: 1,
			updatedBy: "agent:seed",
			createdAt: NOW_ISO,
			updatedAt: NOW_ISO,
		});
		await db.insert(knowledgeAppProjection).values({
			id: `ksf-${id}`,
			knowledgeItemId: id,
			layer,
			scopeId: scopes[i],
			kind,
		});
	}

	return `${prefix}-ki-0`;
}

describe("AF9 AC2: knowledge-promotion sweep", () => {
	test("sweep promotes provisional items meeting the threshold", async ({ db, eventBus }) => {
		// Seed 5 provisional items with same signature across 5 scopes.
		const subjectId = await seedPromotionCandidates(db, "promo-basic");

		// Act: run the promotion sweep.
		await sweep(db, eventBus, "autoPromotion");

		// Assert: the subject item is now validated.
		const [item] = await db
			.select({ status: knowledgeItems.status })
			.from(knowledgeItems)
			.where(eq(knowledgeItems.id, subjectId));
		expect(item?.status).toBe("validated");

		// Assert: an edit-log row for the promotion exists.
		const editRows = await db
			.select()
			.from(knowledgeEditLog)
			.where(eq(knowledgeEditLog.itemId, subjectId));
		expect(editRows.length).toBeGreaterThanOrEqual(1);
		const autoPromoEdit = editRows.find((r) => r.editor === "system:auto-promotion");
		expect(autoPromoEdit).toBeDefined();
	});

	test("exactly ONE knowledge_updated action=auto_promoted per promoted item (no double-emit)", async ({
		db,
		eventBus,
	}) => {
		const subjectId = await seedPromotionCandidates(db, "promo-emit");

		const updatedEvents: KnowledgeUpdatedEvent[] = [];
		eventBus.on("knowledge_updated", (e) => updatedEvents.push(e));

		await sweep(db, eventBus, "autoPromotion");

		// Filter to auto_promoted events for the subject.
		const autoPromotedForSubject = updatedEvents.filter(
			(e) => e.action === "auto_promoted" && e.itemId === subjectId,
		);

		// The sweep emits exactly one event per promoted item.
		expect(autoPromotedForSubject.length).toBe(1);
	});

	test("idempotent: running again on already-validated items does not re-promote", async ({
		db,
		eventBus,
	}) => {
		await seedPromotionCandidates(db, "promo-idem");

		// First run — promotes items.
		await sweep(db, eventBus, "autoPromotion");

		const updatedEventsRound2: KnowledgeUpdatedEvent[] = [];
		eventBus.on("knowledge_updated", (e) => updatedEventsRound2.push(e));

		// Second run — already validated, should produce no new auto_promoted events.
		await sweep(db, eventBus, "autoPromotion");

		const newAutoPromoted = updatedEventsRound2.filter((e) => e.action === "auto_promoted");
		expect(newAutoPromoted.length).toBe(0);
	});
});
