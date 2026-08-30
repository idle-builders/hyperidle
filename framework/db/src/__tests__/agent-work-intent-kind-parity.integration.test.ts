/**
 * AU21 §6 Decision G (recorder unification) / §8 AC #6 — "a test asserts the
 * unified `AgentWorkIntentRecorder` — one shared contract, local mirrors
 * deleted — with `kind`-set == the schema CHECK constraint."
 *
 * Complements (does not duplicate) `agent-work-intent-schema.integration.test.ts`'s
 * "accepts every closed kind/source pairing" test (which hardcodes its own
 * pairs list): THIS test derives its accept-list from `@hyperidle/domain-model`'s
 * `AGENT_WORK_INTENT_KINDS` — the same canonical list
 * `AgentWorkIntentRecorderInput` (the widened recorder contract `work`/
 * `review` now import instead of their deleted local mirrors) discriminates
 * over. If a kind is ever added to (or removed from) the shared union
 * without updating `agent_work_intents_kind_ck`/
 * `agent_work_intents_kind_source_compat_ck` in `schema.ts` — or vice versa —
 * this test fails, proving the two sets can't silently drift apart.
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
	assistant_turn: "thread_message",
	session_start: "explicit_session_start",
	knowledge_action: "knowledge_action",
	routine_run: "routine_run",
	task_run: "task_dispatch_attempt",
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

	// AU21 §9 Increment 10a (Decision I) — the built-in `bet_decomposition`
	// mechanism is REMOVED entirely, not migrated: the intent union shrinks
	// from seven kinds to six. Deleting the capture machinery removes
	// `reengagement` too, so the union is now five kinds.
	const FIVE_LIVE_KINDS = [
		"assistant_turn",
		"session_start",
		"knowledge_action",
		"routine_run",
		"task_run",
	] as const;

	test("AGENT_WORK_INTENT_KINDS is exactly the five live kinds (reengagement removed)", () => {
		expect(AGENT_WORK_INTENT_KINDS).toHaveLength(5);
		expect([...AGENT_WORK_INTENT_KINDS].sort()).toEqual([...FIVE_LIVE_KINDS].sort());
		expect(AGENT_WORK_INTENT_KINDS).not.toContain("bet_decomposition");
		expect(AGENT_WORK_INTENT_KINDS).not.toContain("reengagement");
	});
});
