/**
 * LG1 Phase 5 — ReviewResolvedPart stories: verdict echo once decision taken.
 */

import type { OpenTarget, Part, PartAuthor } from "@hyperidle/shared";
import type { JSX } from "react";
import { ReviewResolvedPart } from "./ReviewResolvedPart.js";

export default { title: "ReviewResolvedPart", group: "Conversations" as const };

const AGENT: PartAuthor = { id: "a-atlas", name: "Atlas", isAgent: true, isMe: false };

function makeReviewResolvedPart(
	overrides: Partial<Extract<Part, { kind: "resolved" }>>,
): Extract<Part, { kind: "resolved" }> {
	return {
		id: "rrsp1",
		kind: "resolved",
		author: AGENT,
		createdAt: "2026-06-22T14:00:00.000Z",
		embeds: [],
		label: "APPROVED",
		resolvedBy: "Founder",
		summary: "Fix streaming regression in AI SDK upgrade",
		reviewTarget: { betId: "bet-01", reviewId: "rev-01" },
		...overrides,
	};
}

const noop = (_target: OpenTarget): void => {};

/** Approved verdict. */
export function ReviewResolvedPartApproved(): JSX.Element {
	return (
		<div className="p-[18px]" style={{ fontFamily: "var(--font-sans)" }}>
			<ReviewResolvedPart part={makeReviewResolvedPart({})} onOpen={noop} />
		</div>
	);
}

/** Changes-requested verdict. */
export function ReviewResolvedPartChangesRequested(): JSX.Element {
	return (
		<div className="p-[18px]" style={{ fontFamily: "var(--font-sans)" }}>
			<ReviewResolvedPart
				part={makeReviewResolvedPart({
					label: "CHANGES_REQUESTED",
					resolvedBy: "Atlas",
					summary: "Architecture decision: adopt parts[] shape for all session events",
				})}
				onOpen={noop}
			/>
		</div>
	);
}

/** Rejected verdict. */
export function ReviewResolvedPartRejected(): JSX.Element {
	return (
		<div className="p-[18px]" style={{ fontFamily: "var(--font-sans)" }}>
			<ReviewResolvedPart
				part={makeReviewResolvedPart({
					label: "REJECTED",
					resolvedBy: "Founder",
					summary: "Revert the SDK upgrade entirely",
				})}
				onOpen={noop}
			/>
		</div>
	);
}
