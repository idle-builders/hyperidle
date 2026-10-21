/**
 * Pure rule: computeTaskNeed(state, messages, reasons) → TaskNeed.
 * Table-driven; one row per distinct branch plus precedence checks.
 */

import { describe, expect, it } from "vitest";
import type { Reason } from "../actions/task.js";
import { computeTaskNeed } from "../actions/task-need.js";

type MsgStub = { type: string; resolvedAt: string | null };

const none: MsgStub[] = [];
const unresolvedQuestionnaire: MsgStub[] = [{ type: "questionnaire", resolvedAt: null }];
const resolvedQuestionnaire: MsgStub[] = [{ type: "questionnaire", resolvedAt: "2026-01-01T00:00:00.000Z" }];
const unresolvedReview: MsgStub[] = [{ type: "review", resolvedAt: null }];
const resolvedReview: MsgStub[] = [{ type: "review", resolvedAt: "2026-01-01T00:00:00.000Z" }];

const waitingDecision: Reason[] = [{ id: "r1", kind: "decision", what: "Choose DB", state: "waiting", why: null }];
const madeDecision: Reason[] = [{ id: "r1", kind: "decision", what: "Choose DB", state: "made", why: null }];

const rows: {
	label: string;
	state: string;
	msgs: MsgStub[];
	reasons: Reason[];
	expected: ReturnType<typeof computeTaskNeed>;
}[] = [
	// stuck
	{ label: "blocked → stuck", state: "blocked", msgs: none, reasons: [], expected: "stuck" },
	// stuck wins over everything
	{ label: "blocked + questionnaire → stuck (precedence)", state: "blocked", msgs: unresolvedQuestionnaire, reasons: [], expected: "stuck" },
	{ label: "blocked + waiting decision → stuck (precedence)", state: "blocked", msgs: none, reasons: waitingDecision, expected: "stuck" },
	{ label: "blocked + review message → stuck (precedence)", state: "blocked", msgs: unresolvedReview, reasons: [], expected: "stuck" },
	// input
	{ label: "unresolved questionnaire → input", state: "in_progress", msgs: unresolvedQuestionnaire, reasons: [], expected: "input" },
	{ label: "waiting decision → input", state: "in_progress", msgs: none, reasons: waitingDecision, expected: "input" },
	{ label: "input wins over review message (precedence)", state: "in_progress", msgs: [...unresolvedQuestionnaire, ...unresolvedReview], reasons: [], expected: "input" },
	// review
	{ label: "state=review → review", state: "review", msgs: none, reasons: [], expected: "review" },
	{ label: "unresolved review message → review", state: "in_progress", msgs: unresolvedReview, reasons: [], expected: "review" },
	// null — no signal
	{ label: "in_progress, nothing special → null", state: "in_progress", msgs: none, reasons: [], expected: null },
	{ label: "proposed → null", state: "proposed", msgs: none, reasons: [], expected: null },
	// resolved messages don't count
	{ label: "resolved questionnaire → null", state: "in_progress", msgs: resolvedQuestionnaire, reasons: [], expected: null },
	{ label: "resolved review message → null", state: "in_progress", msgs: resolvedReview, reasons: [], expected: null },
	// made decision doesn't count
	{ label: "made decision → null", state: "in_progress", msgs: none, reasons: madeDecision, expected: null },
];

describe("computeTaskNeed", () => {
	for (const { label, state, msgs, reasons, expected } of rows) {
		it(label, () => {
			expect(computeTaskNeed(state, msgs, reasons)).toBe(expected);
		});
	}
});
