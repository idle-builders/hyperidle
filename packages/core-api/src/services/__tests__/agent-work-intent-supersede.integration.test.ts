/**
 * AU21 Increment 3, Wave 0 (RED) — Decision B‴'s "not-yet-started → supersede"
 * path (architecture.md §6 Decision B‴ / §9 Increment 3 / AC #11a).
 *
 * `(kind, sourceId)` is the stable work identity; `idempotencyKey` is a
 * version token. A repeat emission with a DIFFERENT `idempotencyKey` for the
 * same `(kind, sourceId)` inserts a second, distinct row today (no supersede
 * — confirmed by the identity unique index including `idempotencyKey`). This
 * wave adds: before claiming/dispatching, the drain must check for a newer
 * PENDING intent sharing the same `(kind, sourceId)` identity; if one exists,
 * the older is marked `superseded` and the freshest one is the one that
 * actually dispatches — never both.
 *
 * Currently RED: the drain has no such check at all — both rows are
 * independently claimed and handed off in the same `drainIntents` pass,
 * producing TWO agentSessionRequests rows for one identity instead of one.
 */

import { agentSessionRequests, agentWorkIntents, knowledgeItems, users } from "@hyperidle/db";
import { drainIntents, enqueueWorkIntent } from "@hyperidle/session-requests";
import { and, eq } from "drizzle-orm";
import { describe, expect, test } from "../../test-fixtures.js";
import { queueDeps } from "../durable-agent-queue.js";

describe("agent_work_intents — Decision B‴ supersede (not-yet-started)", () => {
	test("a newer pending intent for the same (kind, sourceId) supersedes the older one", async ({
		db,
		eventBus,
	}) => {
		const now = new Date().toISOString();
		await db.insert(users).values({
			id: "wave0-supersede-agent",
			kind: "ai",
			name: "Agent",
			role: "builder",
			status: "active",
			createdAt: now,
		});
		const [item] = await db
			.insert(knowledgeItems)
			.values({
				id: "wave0-supersede-item",
				scopeKind: "factory",
				title: "Wave 0 supersede item",
				body: "Body",
				format: "markdown",
				status: "draft",
				updatedBy: "wave0-supersede-agent",
				createdAt: now,
				updatedAt: now,
			})
			.returning();

		const older = await enqueueWorkIntent(db, {
			kind: "knowledge_action",
			sourceKind: "knowledge_action",
			sourceId: item?.id ?? "",
			requestedBy: "wave0-supersede-agent",
			idempotencyKey: "wave0-supersede-v1",
		});
		// Force the older row unambiguously earlier so ordering can never be a
		// coin-flip between two same-millisecond inserts.
		const anHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
		await db
			.update(agentWorkIntents)
			.set({ createdAt: anHourAgo, updatedAt: anHourAgo })
			.where(eq(agentWorkIntents.id, older.id));

		const newer = await enqueueWorkIntent(db, {
			kind: "knowledge_action",
			sourceKind: "knowledge_action",
			sourceId: item?.id ?? "",
			requestedBy: "wave0-supersede-agent",
			idempotencyKey: "wave0-supersede-v2",
		});

		const deps = { ...queueDeps(db), eventBus };
		await drainIntents(deps);

		const rows = await db
			.select()
			.from(agentWorkIntents)
			.where(
				and(
					eq(agentWorkIntents.kind, "knowledge_action"),
					eq(agentWorkIntents.sourceId, item?.id ?? ""),
				),
			);
		expect(rows).toHaveLength(2);
		const olderRow = rows.find((row) => row.id === older.id);
		const newerRow = rows.find((row) => row.id === newer.id);
		expect(olderRow?.status).toBe("superseded");
		expect(newerRow?.status).toBe("handed_off");

		// Exactly one session request dispatched for this identity, not two.
		const dispatched = await db
			.select()
			.from(agentSessionRequests)
			.where(eq(agentSessionRequests.sourceId, item?.id ?? ""));
		expect(dispatched).toHaveLength(1);
		expect(dispatched[0]?.id).toBe(newerRow?.requestId);
	});
});
