/**
 * Stories for ReviewRequestPart — compact review reference into the review page.
 */

import type { JSX } from "react";
import type { Part, PartAuthor } from ".";
import { ReviewRequestPart } from "./ReviewRequestPart.js";

export default { title: "ReviewRequestPart", group: "Conversations" as const };

const AGENT: PartAuthor = { id: "a-atlas", name: "Atlas", isAgent: true, isMe: false };

function makePart(): Extract<Part, { kind: "review" }> {
	return {
		id: "rr1",
		kind: "review",
		author: AGENT,
		createdAt: "2026-06-22T14:00:00.000Z",
		embeds: [],
		title: "Pricing overhaul",
		changeSet: null,
		reviewTarget: { reviewId: "rev-1", threadId: "t-1" },
	} as Extract<Part, { kind: "review" }>;
}

const noop = () => {};

export function Default(): JSX.Element {
	return (
		<div className="p-[18px]" style={{ fontFamily: "var(--font-sans)" }}>
			<ReviewRequestPart part={makePart()} onOpen={noop} />
		</div>
	);
}
