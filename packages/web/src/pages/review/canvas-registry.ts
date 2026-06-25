import { ReviewActionOperation } from "./ReviewActionOperation";
import { ReviewBatch } from "./ReviewBatch";
import { ReviewBrowserPreview } from "./ReviewBrowserPreview";
import { ReviewCodeDiff } from "./ReviewCodeDiff";
import { ReviewFieldChangeSet } from "./ReviewFieldChangeSet";
import { ReviewMetricsMoved } from "./ReviewMetricsMoved";
import { ReviewOutcomeSummary } from "./ReviewOutcomeSummary";
import { ReviewRenderedInContext } from "./ReviewRenderedInContext";
import { ReviewUnknownCanvas } from "./ReviewUnknownCanvas";
import { ReviewVisualDiff } from "./ReviewVisualDiff";
import type { ReviewCanvasComponent, ReviewCanvasKind } from "./review-artifact";

/**
 * AL2 — review canvas registry.
 *
 * Maps each known review artifact kind to its purpose-built canvas component.
 * Unknown kinds fall back to `ReviewUnknownCanvas`, which renders a safe source
 * header + JSON preview so the review surface never breaks.
 *
 * @lore AL5: ReviewActionOperation is NOT fetched via getReviewCanvas() in
 * normal operation — ExaminePane hard-branches action_operation (ReviewComposition.tsx
 * §4.3) and passes the full AL7 props directly. The registry entry is kept for
 * completeness but the cast is needed because ActionOperationCanvasProps has a
 * narrower artifact type than ReviewCanvasComponent<unknown>.
 */
export const REVIEW_CANVAS_REGISTRY: Record<ReviewCanvasKind, ReviewCanvasComponent> = {
	outcome_summary: ReviewOutcomeSummary,
	field_change_set: ReviewFieldChangeSet,
	// @lore AL5: cast needed — ReviewActionOperation takes ActionOperationCanvasProps
	// (wider than ReviewCanvasComponent), but ExaminePane never calls getReviewCanvas
	// for action_operation — it hard-branches with the full AL7 props (§4.3).
	action_operation: ReviewActionOperation as unknown as ReviewCanvasComponent,
	rendered_in_context: ReviewRenderedInContext,
	metrics_moved: ReviewMetricsMoved,
	visual_diff: ReviewVisualDiff,
	code_diff: ReviewCodeDiff,
	batch: ReviewBatch,
	browser_preview: ReviewBrowserPreview,
};

export function getReviewCanvas(kind: ReviewCanvasKind): ReviewCanvasComponent;
export function getReviewCanvas(kind: string): ReviewCanvasComponent;
export function getReviewCanvas(kind: string): ReviewCanvasComponent {
	return (
		(REVIEW_CANVAS_REGISTRY as Record<string, ReviewCanvasComponent>)[kind] ?? ReviewUnknownCanvas
	);
}
