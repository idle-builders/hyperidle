import type { JSX } from "react";
import type { ReviewSubject } from "./review-artifact";

interface ReviewPageProps {
	readonly subject?: ReviewSubject;
}

/**
 * AL2 — production review route scaffold.
 *
 * This page renders the review Subject and maps each artifact through the review
 * canvas registry. Stub: the real implementation will use `getReviewCanvas` and
 * mount the returned components.
 */
export function ReviewPage({ subject }: ReviewPageProps): JSX.Element {
	return (
		<div data-ds-page="ReviewPage">
			<h1>{subject?.title ?? "Review"}</h1>
		</div>
	);
}
