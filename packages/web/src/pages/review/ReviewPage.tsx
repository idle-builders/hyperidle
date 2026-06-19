import type { JSX } from "react";
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { apiFetch } from "../../services/api-fetch.js";
import { ReviewComposition } from "./ReviewComposition.js";
import { REVIEW_COMPOSITION_SUBJECT } from "./review-composition.fixture.js";
import type { ComposedReviewSubject } from "./review-composition.js";

export type ReviewLoader = (params: {
	readonly betId: string;
	readonly reviewId: string;
}) => Promise<ComposedReviewSubject>;

interface ReviewPageProps {
	readonly loader?: ReviewLoader;
}

async function defaultLoader({
	reviewId,
}: {
	readonly reviewId: string;
}): Promise<ComposedReviewSubject> {
	const res = await apiFetch(`/api/reviews/${encodeURIComponent(reviewId)}`);
	if (!res.ok) {
		throw new Error(`Could not load review: ${res.status}`);
	}
	return (await res.json()) as ComposedReviewSubject;
}

/**
 * AL3 — production review destination.
 *
 * Loads the review Subject for the canonical route
 * `/work/bet/:betId/review/:reviewId` and renders the ReviewComposition surface.
 * The optional `loader` prop is used by tests to avoid a real fetch.
 */
export function ReviewPage({ loader = defaultLoader }: ReviewPageProps = {}): JSX.Element {
	const { betId = "", reviewId = "" } = useParams<{ betId: string; reviewId: string }>();
	const [subject, setSubject] = useState<ComposedReviewSubject | null>(null);
	const [error, setError] = useState<Error | null>(null);

	useEffect(() => {
		let cancelled = false;
		loader({ betId, reviewId })
			.then((s) => {
				if (!cancelled) setSubject(s);
			})
			.catch((e: unknown) => {
				if (!cancelled) setError(e instanceof Error ? e : new Error(String(e)));
			});
		return () => {
			cancelled = true;
		};
	}, [betId, reviewId, loader]);

	if (error) {
		return (
			<div className="p-[24px] text-[var(--status-error)]">
				<p>Could not load review.</p>
				<p className="text-[13px] text-[var(--text-tertiary)]">{error.message}</p>
			</div>
		);
	}

	if (!subject) {
		return (
			<div className="p-[24px] text-[var(--text-secondary)]">
				<p>Loading review…</p>
			</div>
		);
	}

	return (
		<div className="h-full">
			<ReviewComposition
				subject={subject}
				onSubmitVerdict={() => {
					// AL3: the surface captures the decision; wiring to the thread API is out of scope.
				}}
			/>
		</div>
	);
}

// @lore AL3: keep the fixture reachable from the production module for
// host tests and storybook; importing from the fixture file rather than
// redeclaring avoids drift between test data and the defaultLoader fallback.
export { REVIEW_COMPOSITION_SUBJECT };
