import type { JSX } from "react";
import { getReviewCanvas } from "./canvas-registry";
import type { ReviewSubject } from "./review-artifact";
import { AL2_REVIEW_SUBJECT } from "./review-subject";

interface ReviewPageProps {
	readonly subject?: ReviewSubject;
}

/**
 * AL2 — production review route scaffold.
 *
 * This page renders the review Subject and maps each artifact through the review
 * canvas registry. The fixture is the default subject so the canvases are mounted
 * and reachable in production code without waiting for AL3 wiring.
 *
 * @lore This is an AL2 integration scaffold only. The route is intentionally
 * registered here so the canvases are reachable; AL3 (`ReviewCompositionRefined`)
 * owns the full dual-anchor composition (frame header, intent, rationale,
 * conversation, verdict wiring) and will replace/extend this page. Keep the page
 * small and fixture-driven; do not build composition chrome here.
 */
export function ReviewPage({ subject = AL2_REVIEW_SUBJECT }: ReviewPageProps): JSX.Element {
	return (
		<div
			data-ds-page="ReviewPage"
			className="mx-auto flex max-w-[860px] flex-col gap-[24px] p-[24px] text-left"
		>
			<header>
				<h1 className="text-[24px] font-[600] leading-[1.25] text-[var(--text-primary)]">
					{subject.title}
				</h1>
			</header>

			<section className="flex flex-col gap-[24px]">
				{subject.artifacts.map((artifact) => {
					const Canvas = getReviewCanvas(artifact.kind);
					return (
						<article
							key={artifact.id}
							className="rounded-[var(--r-default)] border border-[var(--border-subtle)] bg-[var(--surface-elevated)] shadow-[var(--shadow-default)]"
						>
							<Canvas artifact={artifact} />
						</article>
					);
				})}
			</section>
		</div>
	);
}
