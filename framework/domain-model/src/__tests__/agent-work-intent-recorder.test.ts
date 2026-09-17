// AU21 §6 Decision G (recorder unification) — `AgentWorkIntentRecorderInput`
// widens from the AC-9 2-kind scope to the full six-kind union matching
// `agent_work_intents_kind_ck` (framework/db/src/schema.ts). This proves the
// widened type + its canonical runtime kind list stay in lockstep with
// `AgentWorkIntentKind` (events.ts) so `work`/`review`'s deleted local
// mirrors can't be silently reintroduced.
//
// AU21 §9 Increment 10a (Decision I): `bet_decomposition` is REMOVED — the
// built-in bet_decomposition mechanism no longer exists, so the union shrinks
// from seven kinds to six.
// `reengagement` is REMOVED with the capture machinery it belonged to,
// so the union shrinks from six kinds to five.

import { describe, expect, expectTypeOf, it } from "vitest";
import {
	AGENT_WORK_INTENT_KINDS,
	type AgentWorkIntentKind,
	type AgentWorkIntentRecorderInput,
} from "../work-intent.js";

describe("AGENT_WORK_INTENT_KINDS canonical runtime kind list", () => {
	it("contains exactly the six canonical kinds", () => {
		expect(AGENT_WORK_INTENT_KINDS).toEqual([
			"thread_turn",
			"session_start",
			"knowledge_action",
			"routine_run",
			"task_run",
			"session_resume",
		]);
	});

	it("AgentWorkIntentKind is the literal union of AGENT_WORK_INTENT_KINDS", () => {
		for (const kind of AGENT_WORK_INTENT_KINDS) {
			const k: AgentWorkIntentKind = kind;
			expect(k).toBe(kind);
		}
	});
});

describe("AgentWorkIntentRecorderInput widened six-kind union", () => {
	it("accepts every one of the six kinds as its discriminant, paired with the correct sourceKind", () => {
		const inputs: AgentWorkIntentRecorderInput[] = [
			{
				kind: "thread_turn",
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
				kind: "task_run",
				sourceKind: "task_dispatch_attempt",
				sourceId: "s5",
				idempotencyKey: "k5",
			},
			{
				// BA2: the only kind that resumes a session rather than starting one,
				// so it bakes a resume instead of a BakedWorkIntentRequest.
				kind: "session_resume",
				sourceKind: "review_verdict",
				sourceId: "review-message-1",
				idempotencyKey: "k6",
				resume: {
					sessionId: "sess-1",
					harnessSessionId: "native-1",
					decision: "approve",
					threadId: "thread-1",
					agentId: "agent-1",
				},
			},
		];
		expect(inputs.map((i) => i.kind)).toEqual(AGENT_WORK_INTENT_KINDS);
	});

	it("the discriminant's kind values equal AGENT_WORK_INTENT_KINDS exactly (compile-time)", () => {
		expectTypeOf<AgentWorkIntentRecorderInput["kind"]>().toEqualTypeOf<AgentWorkIntentKind>();
	});

	it("rejects an invented kind via type narrowing", () => {
		acceptRecorderInput({
			// @ts-expect-error — "not_a_real_kind" is not one of the five canonical kinds
			kind: "not_a_real_kind",
			sourceKind: "thread_message",
			sourceId: "s1",
			idempotencyKey: "k1",
		});
	});

	it("rejects a mismatched kind/sourceKind pairing via type narrowing", () => {
		// @ts-expect-error — "routine_run" pairs only with sourceKind "routine_run"
		acceptRecorderInput({
			kind: "routine_run",
			sourceKind: "thread_message",
			sourceId: "s1",
			idempotencyKey: "k1",
		});
	});

	it("rejects the removed bet_decomposition kind entirely (Decision I)", () => {
		acceptRecorderInput({
			// @ts-expect-error — "bet_decomposition" no longer exists in the five-kind union
			kind: "bet_decomposition",
			sourceKind: "thread_message",
			sourceId: "s1",
			idempotencyKey: "k1",
		});
	});
});

/** Type-only acceptor — lets the two rejection tests above trigger a per-property compile error without declaring an unused local. */
function acceptRecorderInput(_input: AgentWorkIntentRecorderInput): void {}
