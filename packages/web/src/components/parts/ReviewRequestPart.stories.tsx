/**
 * LG1 Phase 5 — ReviewRequestPart stories: compact review request card.
 *
 * No inline approve/reject — "Open review" routes via onOpen.
 */

import type { OpenTarget, Part, PartAuthor } from "@hyperidle/shared";
import type { JSX } from "react";
import { ReviewRequestPart } from "./ReviewRequestPart.js";

export default { title: "ReviewRequestPart", group: "Conversations" as const };

const AGENT: PartAuthor = { id: "a-atlas", name: "Atlas", isAgent: true, isMe: false };

function makeReviewRequestPart(
	overrides: Partial<Extract<Part, { kind: "review" }>>,
): Extract<Part, { kind: "review" }> {
	return {
		id: "rrp1",
		kind: "review",
		author: AGENT,
		createdAt: "2026-06-22T14:00:00.000Z",
		embeds: [],
		title: "Fix streaming regression in AI SDK upgrade",
		changeSet: {
			kind: "diff",
			label: "server/chat/stream.ts",
			meta: "+9/−2",
			target: { route: "artifact", artifactId: "art-stream-fix" },
		},
		reviewTarget: { betId: "bet-01", reviewId: "rev-01" },
		...overrides,
	};
}

const noop = (_target: OpenTarget): void => {};

/** Default review request with a diff changeset. */
export function ReviewRequestPartDefault(): JSX.Element {
	return (
		<div className="p-[18px]" style={{ fontFamily: "var(--font-sans)" }}>
			<ReviewRequestPart part={makeReviewRequestPart({})} onOpen={noop} />
		</div>
	);
}

/** Review request with no changeset (optional field is null). */
export function ReviewRequestPartNoChangeset(): JSX.Element {
	return (
		<div className="p-[18px]" style={{ fontFamily: "var(--font-sans)" }}>
			<ReviewRequestPart
				part={makeReviewRequestPart({
					title: "Architecture decision: adopt parts[] shape for all session events",
					changeSet: null,
				})}
				onOpen={noop}
			/>
		</div>
	);
}
