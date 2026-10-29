/**
 * Pure rule: computeTaskNeed(state, messages) → TaskNeed.
 * Table-driven; one row per distinct branch plus precedence checks.
 */

import { describe, expect, it } from "vitest";
import { computeTaskNeed } from "../actions/task-need.js";

type MsgStub = { type: string; resolvedAt: string | null };

const none: MsgStub[] = [];
const unresolvedQuestionnaire: MsgStub[] = [{ type: "questionnaire", resolvedAt: null }];
const resolvedQuestionnaire: MsgStub[] = [
	{ type: "questionnaire", resolvedAt: "2026-01-01T00:00:00.000Z" },
];
const unresolvedReview: MsgStub[] = [{ type: "review", resolvedAt: null }];
const resolvedReview: MsgStub[] = [{ type: "review", resolvedAt: "2026-01-01T00:00:00.000Z" }];

const rows: {
	label: string;
	state: string;
	msgs: MsgStub[];
	expected: ReturnType<typeof computeTaskNeed>;
}[] = [
	// a finished task waits on nobody, even when the conversation it shares still asks
	{
		label: "done + open review → none",
		state: "done",
		msgs: unresolvedReview,
		expected: null,
	},
	{
		label: "killed + open question → none",
		state: "killed",
		msgs: unresolvedQuestionnaire,
		expected: null,
	},
	// stuck
	{ label: "blocked → stuck", state: "blocked", msgs: none, expected: "stuck" },
	// stuck wins over everything
	{
		label: "blocked + questionnaire → stuck (precedence)",
		state: "blocked",
		msgs: unresolvedQuestionnaire,
		expected: "stuck",
	},
	{
		label: "blocked + review message → stuck (precedence)",
		state: "blocked",
		msgs: unresolvedReview,
		expected: "stuck",
	},
	// input
	{
		label: "unresolved questionnaire → input",
		state: "in_progress",
		msgs: unresolvedQuestionnaire,
		expected: "input",
	},
	{
		label: "input wins over review message (precedence)",
		state: "in_progress",
		msgs: [...unresolvedQuestionnaire, ...unresolvedReview],
		expected: "input",
	},
	// review — only from an open card, never from state alone
	{
		label: "state=review alone → null (no open card)",
		state: "review",
		msgs: none,
		expected: null,
	},
	{
		label: "unresolved review message → review",
		state: "in_progress",
		msgs: unresolvedReview,
		expected: "review",
	},
	// null — no signal
	{
		label: "in_progress, nothing special → null",
		state: "in_progress",
		msgs: none,
		expected: null,
	},
	{ label: "proposed → null", state: "proposed", msgs: none, expected: null },
	// resolved messages don't count
	{
		label: "resolved questionnaire → null",
		state: "in_progress",
		msgs: resolvedQuestionnaire,
		expected: null,
	},
	{
		label: "resolved review message → null",
		state: "in_progress",
		msgs: resolvedReview,
		expected: null,
	},
	// once you have answered, the agent has it: nothing waits on you
	{
		label: "review state, its review decided → null",
		state: "review",
		msgs: resolvedReview,
		expected: null,
	},
	{
		label: "review state, a later round still open → review",
		state: "review",
		msgs: [...resolvedReview, ...unresolvedReview],
		expected: "review",
	},
];

describe("computeTaskNeed", () => {
	for (const { label, state, msgs, expected } of rows) {
		it(label, () => {
			expect(computeTaskNeed(state, msgs)).toBe(expected);
		});
	}
});
