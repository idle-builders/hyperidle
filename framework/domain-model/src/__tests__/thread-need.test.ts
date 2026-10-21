/**
 * Pure rule: computeThreadNeed(viewer, openMessages) → ThreadNeed.
 * Table-driven; one row per distinct branch plus precedence.
 */

import { describe, expect, test } from "vitest";
import { computeThreadNeed } from "../actions/thread-need.js";

const ME = "me";
const agentQuestion = { type: "questionnaire", senderId: "agent", senderIsAgent: true };
const personQuestion = { type: "questionnaire", senderId: "maya", senderIsAgent: false };
const review = { type: "review", senderId: "agent", senderIsAgent: true };
const myQuestion = { type: "questionnaire", senderId: ME, senderIsAgent: false };
const myReview = { type: "review", senderId: ME, senderIsAgent: false };

const rows: {
	label: string;
	open: (typeof agentQuestion)[];
	expected: ReturnType<typeof computeThreadNeed>;
}[] = [
	{ label: "nothing open → null", open: [], expected: null },
	{ label: "an agent asks → stuck", open: [agentQuestion], expected: "stuck" },
	{ label: "a person asks → input", open: [personQuestion], expected: "input" },
	{ label: "an open review → review", open: [review], expected: "review" },
	{ label: "what you asked yourself waits on others → null", open: [myQuestion], expected: null },
	{ label: "a review you raised waits on others → null", open: [myReview], expected: null },
	{
		label: "stuck wins over input and review",
		open: [review, personQuestion, agentQuestion],
		expected: "stuck",
	},
	{ label: "input wins over review", open: [review, personQuestion], expected: "input" },
];

describe("computeThreadNeed", () => {
	test.each(rows)("$label", ({ open, expected }) => {
		expect(computeThreadNeed(ME, open)).toBe(expected);
	});
});
