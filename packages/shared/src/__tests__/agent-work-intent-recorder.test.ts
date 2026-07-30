// AU21 §6 Decision G (recorder unification) — `AgentWorkIntentRecorderInput`
// widens from the AC-9 2-kind scope to the full seven-kind union matching
// `agent_work_intents_kind_ck` (packages/db/src/schema.ts). This proves the
// widened type + its canonical runtime kind list stay in lockstep with
// `AgentWorkIntentKind` (events.ts) so `work`/`review`'s deleted local
// mirrors can't be silently reintroduced.

import { describe, expect, expectTypeOf, it } from "vitest";
import {
	AGENT_WORK_INTENT_KINDS,
	type AgentWorkIntentKind,
	type AgentWorkIntentRecorderInput,
} from "../index.js";

describe("AGENT_WORK_INTENT_KINDS canonical runtime kind list", () => {
	it("contains exactly the seven canonical kinds", () => {
		expect(AGENT_WORK_INTENT_KINDS).toEqual([
			"assistant_turn",
			"session_start",
			"knowledge_action",
			"routine_run",
			"bet_decomposition",
			"task_run",
			"reengagement",
		]);
	});

	it("AgentWorkIntentKind is the literal union of AGENT_WORK_INTENT_KINDS", () => {
		for (const kind of AGENT_WORK_INTENT_KINDS) {
			const k: AgentWorkIntentKind = kind;
			expect(k).toBe(kind);
		}
	});
});

describe("AgentWorkIntentRecorderInput widened seven-kind union", () => {
	it("accepts every one of the seven kinds as its discriminant, paired with the correct sourceKind", () => {
		const inputs: AgentWorkIntentRecorderInput[] = [
			{
				kind: "assistant_turn",
				sourceKind: "thread_message",
				sourceId: "s1",
				idempotencyKey: "k1",
			},
			{
				kind: "session_start",
				sourceKind: "explicit_session_start",
				sourceId: "s2",
				idempotencyKey: "k2",
			},
			{
				kind: "knowledge_action",
				sourceKind: "knowledge_action",
				sourceId: "s3",
				idempotencyKey: "k3",
			},
			{
				kind: "routine_run",
				sourceKind: "routine_run",
				sourceId: "s4",
				idempotencyKey: "k4",
			},
			{
				kind: "bet_decomposition",
				sourceKind: "bet",
				sourceId: "s5",
				idempotencyKey: "k5",
			},
			{
				kind: "task_run",
				sourceKind: "task_dispatch_attempt",
				sourceId: "s6",
				idempotencyKey: "k6",
			},
			{
				kind: "reengagement",
				sourceKind: "proposed_call",
				sourceId: "s7",
				idempotencyKey: "k7",
			},
		];
		expect(inputs.map((i) => i.kind)).toEqual(AGENT_WORK_INTENT_KINDS);
	});

	it("the discriminant's kind values equal AGENT_WORK_INTENT_KINDS exactly (compile-time)", () => {
		expectTypeOf<AgentWorkIntentRecorderInput["kind"]>().toEqualTypeOf<AgentWorkIntentKind>();
	});

	it("rejects an invented kind via type narrowing", () => {
		acceptRecorderInput({
			// @ts-expect-error — "not_a_real_kind" is not one of the seven canonical kinds
			kind: "not_a_real_kind",
			sourceKind: "thread_message",
			sourceId: "s1",
			idempotencyKey: "k1",
		});
	});

	it("rejects a mismatched kind/sourceKind pairing via type narrowing", () => {
		// @ts-expect-error — "bet_decomposition" pairs only with sourceKind "bet"
		acceptRecorderInput({
			kind: "bet_decomposition",
			sourceKind: "thread_message",
			sourceId: "s1",
			idempotencyKey: "k1",
		});
	});
});

/** Type-only acceptor — lets the two rejection tests above trigger a per-property compile error without declaring an unused local. */
function acceptRecorderInput(_input: AgentWorkIntentRecorderInput): void {}
