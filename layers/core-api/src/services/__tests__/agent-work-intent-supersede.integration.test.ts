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
 *
 * @lore AU21 Increment 3, knowledge_action wave: this test's vehicle kind
 * (`knowledge_action`, chosen at Wave 0 purely as a convenient seedable kind,
 * before any resolver existed) is migrated by this wave —
 * `resolveIntentInputInternal`'s "knowledge_action" case is DELETED, so an
 * unbaked `knowledge_action` intent (the shape this test originally built)
 * now falls through to `default` and fails immediately instead of resolving
 * inline. Rewired to bake both intents via the real, now-migrated
 * `resolveKnowledgeActionRequest` — the honest post-migration shape a real
 * caller produces — so this test keeps proving the GENUINE own-state
 * supersede/CAS guarantee (identical assertions) rather than a resolution
 * path that no longer exists in production.
 */

import {
	agentSessionRequests,
	agentWorkIntents,
	type HyperIdleDb,
	knowledgeAppProjection,
	knowledgeItems,
	users,
} from "@hyperidle/db";
import { resolveKnowledgeActionRequest } from "@hyperidle/knowledge";
import { drainIntents, enqueueWorkIntent } from "@hyperidle/session-requests";
import { requireRunnableAgent } from "@hyperidle/users";
import { and, eq } from "drizzle-orm";
import { queueDeps } from "../../__testing__/durable-agent-queue-test-deps.js";
import { describe, expect, test } from "../../__testing__/test-fixtures.js";

describe("agent_work_intents — Decision B‴ supersede (not-yet-started)", () => {
	test("a newer pending intent for the same (kind, sourceId) supersedes the older one", async ({
		db,
		eventBus,
		ids,
	}) => {
		const now = new Date().toISOString();
		const agentId = ids("wave0-supersede-agent");
		const itemId = ids("wave0-supersede-item");
		await db.insert(users).values({
			id: agentId,
			kind: "ai",
			name: "Agent",
			role: "builder",
			status: "active",
			createdAt: now,
		});
		const [item] = await db
			.insert(knowledgeItems)
			.values({
				id: itemId,
				scopeKind: "factory",
				title: "Wave 0 supersede item",
				body: "Body",
				format: "markdown",
				status: "draft",
				updatedBy: agentId,
				createdAt: now,
				updatedAt: now,
			})
			.returning();
		// The owner writes the projection row alongside the item.
		await db.insert(knowledgeAppProjection).values({
			id: ids("wave0-supersede-item-projection"),
			knowledgeItemId: itemId,
		});

		// @lore this test's identity/session-request assertions were written
		// (Wave 0) against a bare item id, not the real emit site's
		// `knowledge:<id>`-prefixed `sourceId` convention — kept as-is (only the
		// resolution mechanism is being rewired here, not the test's own
		// identity shape); `resolveKnowledgeActionRequest`'s prefix-strip is a
		// no-op on a bare id, so this bakes correctly either way.
		const bakedRequest = await resolveKnowledgeActionRequest(db as HyperIdleDb, item?.id ?? "", {
			requireRunnableAgent,
		});

		const older = await enqueueWorkIntent(db, {
			kind: "knowledge_action",
			sourceKind: "knowledge_action",
			sourceId: item?.id ?? "",
			requestedBy: agentId,
			idempotencyKey: ids("wave0-supersede-v1"),
			bakedRequest,
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
			requestedBy: agentId,
			idempotencyKey: ids("wave0-supersede-v2"),
			bakedRequest,
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
