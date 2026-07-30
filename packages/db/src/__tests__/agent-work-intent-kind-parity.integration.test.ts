/**
 * AU21 §6 Decision G (recorder unification) / §8 AC #6 — "a test asserts the
 * unified `AgentWorkIntentRecorder` — one shared contract, local mirrors
 * deleted — with `kind`-set == the schema CHECK constraint."
 *
 * Complements (does not duplicate) `agent-work-intent-schema.integration.test.ts`'s
 * "accepts every closed kind/source pairing" test (which hardcodes its own
 * pairs list): THIS test derives its accept-list from `@hyperidle/shared`'s
 * `AGENT_WORK_INTENT_KINDS` — the same canonical list
 * `AgentWorkIntentRecorderInput` (the widened recorder contract `work`/
 * `review` now import instead of their deleted local mirrors) discriminates
 * over. If a kind is ever added to (or removed from) the shared union
 * without updating `agent_work_intents_kind_ck`/
 * `agent_work_intents_kind_source_compat_ck` in `schema.ts` — or vice versa —
 * this test fails, proving the two sets can't silently drift apart.
 */

import { describe, expect, test } from "@hyperidle/db/test-fixtures";
import { AGENT_WORK_INTENT_KINDS, type AgentWorkIntentKind } from "@hyperidle/shared";
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
	assistant_turn: "thread_message",
	session_start: "explicit_session_start",
	knowledge_action: "knowledge_action",
	routine_run: "routine_run",
	bet_decomposition: "bet",
	task_run: "task_dispatch_attempt",
	reengagement: "proposed_call",
};

function baseIntent(
	overrides: Partial<typeof agentWorkIntents.$inferInsert> = {},
): typeof agentWorkIntents.$inferInsert {
	const ts = new Date().toISOString();
	return {
		id: "parity-default",
		kind: "assistant_turn",
		sourceKind: "thread_message",
		sourceId: "parity-source-default",
		idempotencyKey: "parity-key-default",
		status: "pending",
		createdAt: ts,
		updatedAt: ts,
		...overrides,
	};
}

describe("agent_work_intents kind CHECK == @hyperidle/shared AGENT_WORK_INTENT_KINDS", () => {
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

	test("AGENT_WORK_INTENT_KINDS has exactly seven entries, one per schema CHECK member", () => {
		expect(AGENT_WORK_INTENT_KINDS).toHaveLength(7);
		expect(Object.keys(COMPATIBLE_SOURCE_KIND)).toHaveLength(AGENT_WORK_INTENT_KINDS.length);
	});
});
