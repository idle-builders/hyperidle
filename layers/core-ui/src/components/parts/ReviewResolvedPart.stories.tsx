/**
 * Stories for ReviewResolvedPart — verdict echo once a review is decided.
 */

import type { JSX } from "react";
import type { Part, PartAuthor } from ".";
import { ReviewResolvedPart } from "./ReviewResolvedPart.js";

export default { title: "ReviewResolvedPart", group: "Conversations" as const };

const AGENT: PartAuthor = { id: "a-atlas", name: "Atlas", isAgent: true, isMe: false };

function makePart(): Extract<Part, { kind: "resolved" }> {
	return {
		id: "rv1",
		kind: "resolved",
		author: AGENT,
		createdAt: "2026-06-22T14:00:00.000Z",
		embeds: [],
		label: "APPROVED",
		resolvedBy: "Founder",
		summary: "Ship it.",
		reviewTarget: { reviewId: "rev-1", threadId: "t-1" },
	} as Extract<Part, { kind: "resolved" }>;
}

const noop = () => {};

export function Approved(): JSX.Element {
	return (
		<div className="p-[18px]" style={{ fontFamily: "var(--font-sans)" }}>
			<ReviewResolvedPart part={makePart()} onOpen={noop} />
		</div>
	);
}
