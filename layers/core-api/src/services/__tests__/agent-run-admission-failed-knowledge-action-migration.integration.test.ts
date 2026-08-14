/**
 * AU21 Increment 3, knowledge_action wave (RED) — protected proof obligation
 * named explicitly in this wave's brief: "Confirm the knowledge_action
 * subscriber (Wave 0's review-flagged-item-on-terminal-failure reaction)
 * actually fires."
 *
 * Wave 0's own `agent-run-admission-failed-subscribers.integration.test.ts`
 * proves the REACTION exists — but its `knowledge_action` scenario
 * deliberately forces the failure through the STILL-PRESENT
 * `resolveIntentInputInternal` "knowledge_action" case (an unbaked intent,
 * an archived item rejecting with `INVALID_WORK_SOURCE`) — the exact
 * mechanism THIS wave deletes. That test is not a proof the reaction still
 * fires once the intent carries a REAL baked payload produced by the REAL
 * migrated emit call site.
 *
 * This file drives the real, already-migrated-by-this-wave emit call site
 * (`POST /api/knowledge/:id/flag`, `routes/knowledge.ts`) to create a REAL
 * baked `knowledge_action` intent, then forces a genuine drain-time failure —
 * a real Postgres trigger rejecting the `agent_session_requests` insert (the
 * same fault-injection idiom
 * `agent-run-admission-failed-task-run-migration.integration.test.ts` already
 * uses) — forced terminal on the first attempt via `maxAttempts: 1`. This is
 * a legitimate downstream failure class for an ALREADY-validly-baked
 * payload: with zero re-validation at drain (Decision B step 2), the only
 * way a baked `knowledge_action` intent can still fail pre-handoff is a
 * genuine infra/DB fault at the hand-off write itself — exactly what this
 * trigger simulates.
 *
 * Currently RED: `routes/knowledge.ts`'s `/flag` handler does not yet bake a
 * payload (this wave's GREEN phase adds it), so the emitted intent's
 * `bakedRequestJson` is null — asserted directly below as the first,
 * cheapest RED signal — meaning the drain still runs the (still-present)
 * per-kind `resolveIntentInputInternal` "knowledge_action" case, not the
 * baked hand-off path this test targets.
 */

import {
	agentWorkIntents,
	type HyperIdleDb,
	items,
	knowledgeAppProjection,
	knowledgeItems,
	users,
} from "@hyperidle/db";
import type { AgentRunAdmissionFailedEvent } from "@hyperidle/domain-model";
import { attentionReviewReasoningMarker } from "@hyperidle/review";
import { drainIntents } from "@hyperidle/session-requests";
import { eq, sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { queueDeps } from "../../__testing__/durable-agent-queue-test-deps.js";
import { test } from "../../__testing__/test-fixtures.js";

const TEST_API_KEY = "test-key-au21-knowledge-action-migration";

function authHeaders(): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json" };
}

async function rejectSessionRequestWrites(db: HyperIdleDb): Promise<void> {
	await db.execute(
		sql`drop trigger if exists au21_reject_session_request_write on agent_session_requests`,
	);
	await db.execute(sql`
		create or replace function au21_reject_session_request_write() returns trigger as $$
		begin raise exception 'AU21 injected agent_session_requests write failure'; end;
		$$ language plpgsql
	`);
	await db.execute(sql`
		create trigger au21_reject_session_request_write
		before insert on agent_session_requests
		for each row execute function au21_reject_session_request_write()
	`);
}

async function allowSessionRequestWrites(db: HyperIdleDb): Promise<void> {
	await db.execute(
		sql`drop trigger if exists au21_reject_session_request_write on agent_session_requests`,
	);
}

describe("agent_run_admission_failed — knowledge_action reaction fires for a REAL migrated (baked) intent", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("a real baked knowledge_action intent that fails terminally at drain still creates a review-flagged item", async ({
		db,
		app,
		eventBus,
	}) => {
		const now = new Date().toISOString();
		await db.insert(users).values({
			id: "agent-au21-know-mig",
			kind: "ai",
			name: "Agent",
			role: "builder",
			status: "active",
			createdAt: now,
		});
		await db.insert(knowledgeItems).values({
			id: "item-au21-know-mig",
			scopeKind: "factory",
			title: "knowledge_action migration proof item",
			body: "Body",
			format: "markdown",
			status: "draft",
			version: 1,
			updatedBy: "agent-au21-know-mig",
			createdAt: now,
			updatedAt: now,
		});
		// The owner writes the projection row alongside the item.
		await db.insert(knowledgeAppProjection).values({
			id: "item-au21-know-mig-projection",
			knowledgeItemId: "item-au21-know-mig",
		});

		const res = await app.request("/api/knowledge/item-au21-know-mig/flag", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ reason: "Needs review", agentId: "agent-au21-know-mig" }),
		});
		expect(res.status).toBe(200);

		const [intentBeforeDrain] = await db
			.select()
			.from(agentWorkIntents)
			.where(eq(agentWorkIntents.sourceId, "knowledge:item-au21-know-mig"));
		// RED today: the emit call site does not yet bake the request.
		expect(intentBeforeDrain?.bakedRequestJson).toBeTruthy();

		await rejectSessionRequestWrites(db);
		try {
			const emitted: AgentRunAdmissionFailedEvent[] = [];
			eventBus.on("agent_run_admission_failed", (event) => emitted.push(event));

			const deps = { ...queueDeps(db), eventBus };
			await drainIntents(deps, { maxAttempts: 1 });

			expect(emitted).toHaveLength(1);
			expect(emitted[0]).toMatchObject({
				kind: "knowledge_action",
				sourceId: "knowledge:item-au21-know-mig",
				terminal: true,
			});

			await vi.waitFor(async () => {
				const reviewItems = await db.select().from(items);
				const marker = attentionReviewReasoningMarker("item-au21-know-mig");
				const flagged = reviewItems.find((row) => (row.reasoning ?? "").includes(marker));
				expect(flagged).toBeDefined();
			});
		} finally {
			// @lore shared-pglite-workers: TRUNCATE clears rows, not schema triggers.
			await allowSessionRequestWrites(db);
		}
	});
});
