/**
 * L11 — `RichMessageCard` stories.
 *
 * Plan §6.1: Idle (review), Idle (questionnaire), Saving, Error, Resolved
 * (collapsed), Resolved (re-expanded), Long-reasoning collapsed,
 * Short-reasoning inline.
 */

import type { Message } from "@hyperidle/domain-model";
import type React from "react";
import { useState } from "react";
import { RichMessageCard } from "./RichMessageCard.js";

export default {
	title: "RichMessageCard",
	tier: "2" as const,
	order: [
		"IdleReview",
		"IdleQuestionnaire",
		"Saving",
		"Error",
		"ResolvedCollapsed",
		"ResolvedReexpanded",
		"LongReasoningCollapsed",
		"ShortReasoningInline",
	],
};

const sender = { id: "agent-1", name: "Maya", role: "Product Manager" };

function reviewMsg(reasoning: ReadonlyArray<string>): Message {
	return {
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
			title: "Approve deploy of v2.4 to staging",
			reasoning,
			artifactRef: { id: "art-1", kind: "text_diff" },
		},
	};
}

const questionnaireMsg: Message = {
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
		title: "Pick a target audience",
		question: "Which segment ships first?",
		options: ["Enterprise", "SMB", "Self-serve"],
	},
};

const longReasoning = [
	"Schema migration adds two columns; backfill verified.",
	"All 142 contract tests pass; integration suite green.",
	"P95 latency down 8%; no regressions observed.",
];

const shortReasoning = ["Pick before deploy."];

const mockArtifact = (
	<div
		data-component="ArtifactView"
		data-shape="text_diff"
		className="border border-[var(--border-subtle)] rounded-[var(--r-subtle)] bg-[var(--surface-container)] px-[10px] py-[8px] text-[12px] text-[var(--text-secondary)] font-mono"
	>
		mock-artifact (text_diff)
	</div>
);

export const IdleReview = (): React.JSX.Element => (
	<RichMessageCard
		message={reviewMsg(longReasoning)}
		sender={sender}
		blocking={true}
		artifactSlot={mockArtifact}
		onAction={(): void => undefined}
		state={{ phase: "idle" }}
	/>
);

export const IdleQuestionnaire = (): React.JSX.Element => (
	<RichMessageCard
		message={questionnaireMsg}
		sender={sender}
		blocking={false}
		onAction={(): void => undefined}
		state={{ phase: "idle" }}
	/>
);

export const Saving = (): React.JSX.Element => (
	<RichMessageCard
		message={reviewMsg(longReasoning)}
		sender={sender}
		blocking={false}
		artifactSlot={mockArtifact}
		onAction={(): void => undefined}
		state={{ phase: "saving" }}
	/>
);

export const ErrorState = (): React.JSX.Element => (
	<RichMessageCard
		message={reviewMsg(longReasoning)}
		sender={sender}
		blocking={false}
		artifactSlot={mockArtifact}
		onAction={(): void => undefined}
		state={{ phase: "error", reason: "Could not commit verdict" }}
	/>
);

function ResolvedHarness({ reExpanded }: { reExpanded: boolean }): React.JSX.Element {
	const [open, setOpen] = useState(reExpanded);
	return (
		<RichMessageCard
			message={{ ...reviewMsg(longReasoning), resolvedAt: "2026-04-19T13:00:00.000Z" }}
			sender={sender}
			blocking={false}
			onAction={(): void => undefined}
			state={{ phase: "idle" }}
			resolved={{
				decision: "approve",
				actor: "A. Founder",
				timestamp: "14 min ago",
				reExpanded: open,
				onReexpandToggle: (): void => setOpen((p) => !p),
			}}
		/>
	);
}

export const ResolvedCollapsed = (): React.JSX.Element => <ResolvedHarness reExpanded={false} />;
export const ResolvedReexpanded = (): React.JSX.Element => <ResolvedHarness reExpanded={true} />;

export const LongReasoningCollapsed = (): React.JSX.Element => (
	<RichMessageCard
		message={reviewMsg(longReasoning)}
		sender={sender}
		blocking={false}
		artifactSlot={mockArtifact}
		onAction={(): void => undefined}
		state={{ phase: "idle" }}
	/>
);

export const ShortReasoningInline = (): React.JSX.Element => (
	<RichMessageCard
		message={reviewMsg(shortReasoning)}
		sender={sender}
		blocking={false}
		artifactSlot={mockArtifact}
		onAction={(): void => undefined}
		state={{ phase: "idle" }}
	/>
);
