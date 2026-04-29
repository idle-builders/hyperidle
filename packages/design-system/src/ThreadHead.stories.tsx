/**
 * L1a — `ThreadHead` stories (stub).
 */

import type { Message } from "@hyperidle/shared";
import { ThreadHead } from "./ThreadHead.js";

export default {
	title: "ThreadHead",
	tier: "3" as const,
	order: ["Review", "Questionnaire", "Resolved"],
};

const review: Message = {
	id: "m-rev",
	threadId: "t-1",
	senderId: "agent-1",
	clientKey: "k-rev",
	deletedAt: null,
	redactedAt: null,
	resolvedAt: null,
	createdAt: "2026-04-19T12:00:00.000Z",
	type: "review",
	payload: {
		title: "Pricing overhaul",
		reasoning: ["Reduces churn", "Aligns with Q3 roadmap"],
		artifactRef: { id: "art-1", kind: "text_diff" },
	},
};

const questionnaire: Message = {
	id: "m-q",
	threadId: "t-1",
	senderId: "agent-1",
	clientKey: "k-q",
	deletedAt: null,
	redactedAt: null,
	resolvedAt: null,
	createdAt: "2026-04-19T12:00:00.000Z",
	type: "questionnaire",
	payload: {
		title: "Should we ship?",
		question: "Pick one",
		options: ["Yes", "No"],
	},
};

export const Review = (): React.JSX.Element => <ThreadHead message={review} />;
export const Questionnaire = (): React.JSX.Element => <ThreadHead message={questionnaire} />;
export const Resolved = (): React.JSX.Element => (
	<ThreadHead message={{ ...review, resolvedAt: "2026-04-19T13:00:00.000Z" }} />
);
