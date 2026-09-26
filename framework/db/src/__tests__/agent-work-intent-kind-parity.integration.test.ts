/**
 * The `agent_work_intents_kind_ck`/`agent_work_intents_kind_source_compat_ck` CHECK
 * constraints (`schema.ts`) must accept every kind `@hyperidle/event-bus`'s
 * `AGENT_WORK_INTENT_KINDS` declares, and reject anything outside it — proving the
 * DB constraint and the shared kind union can't silently drift apart.
 */

import { describe, expect, test } from "@hyperidle/db/test-fixtures";
import type { AgentWorkIntentKind } from "@hyperidle/event-bus";
import { AGENT_WORK_INTENT_KINDS } from "@hyperidle/event-bus";
import type { HyperIdleDb } from "../connection.js";
import { agentWorkIntents } from "../schema.js";

/**
 * The `agent_work_intents_kind_source_compat_ck` closed pairing map
 * (`schema.ts`), keyed as a `Record` over `AgentWorkIntentKind` so `tsc`
 * forces this test to name a pairing for every kind the shared union
 * declares — a kind added to `AGENT_WORK_INTENT_KINDS` without a
 * corresponding entry here is a compile error, not a silent gap.
 */
const COMPATIBLE_SOURCE_KIND: Record<
	AgentWorkIntentKind,
	typeof agentWorkIntents.$inferInsert.sourceKind
> = {
	thread_turn: "thread_message",
	session_start: "explicit_session_start",
	knowledge_action: "knowledge_action",
	task_run: "task_dispatch_attempt",
	subscription_run: "subscription",
};

function baseIntent(
	overrides: Partial<typeof agentWorkIntents.$inferInsert> = {},
): typeof agentWorkIntents.$inferInsert {
	const ts = new Date().toISOString();
	return {
		id: "parity-default",
		kind: "thread_turn",
		sourceKind: "thread_message",
		sourceId: "parity-source-default",
		idempotencyKey: "parity-key-default",
		status: "pending",
		createdAt: ts,
		updatedAt: ts,
		...overrides,
	};
}

describe("agent_work_intents kind CHECK == @hyperidle/domain-model AGENT_WORK_INTENT_KINDS", () => {
	test("the DB accepts every kind AGENT_WORK_INTENT_KINDS declares (shared ⊆ schema CHECK)", async ({
		db,
	}: {
		db: HyperIdleDb;
	}) => {
		for (const kind of AGENT_WORK_INTENT_KINDS) {
			const [row] = await db
				.insert(agentWorkIntents)
				.values(
					baseIntent({
						id: `parity-${kind}`,
						kind,
						sourceKind: COMPATIBLE_SOURCE_KIND[kind],
						sourceId: `parity-source-${kind}`,
						idempotencyKey: `parity-key-${kind}`,
					}),
				)
				.returning();
			expect(row).toBeDefined();
			expect(row?.kind).toBe(kind);
		}
	});

	test("the DB rejects a kind outside AGENT_WORK_INTENT_KINDS (schema CHECK stays closed)", async ({
		db,
	}: {
		db: HyperIdleDb;
	}) => {
		await expect(
			db.insert(agentWorkIntents).values(
				baseIntent({
					id: "parity-invented-kind",
					kind: "invented_kind_not_in_shared_union",
					sourceKind: "thread_message",
				}),
			),
		).rejects.toThrow();
	});
});
