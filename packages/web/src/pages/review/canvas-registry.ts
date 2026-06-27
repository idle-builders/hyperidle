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

/**
 * @lore AL5: Single audited cast for ActionOperationCanvas → ReviewCanvasComponent.
 * ActionOperationCanvasProps has AL7 props (status/outcome/proposedCall) absent from
 * ReviewCanvasComponent. The ExaminePane NEVER calls getReviewCanvas for action_operation
 * (it hard-branches), so this entry is only a type-level placeholder.
 * Contained here so the `no-unknown-cast` rule catches any unaudited duplicates.
 */
function auditedActionOperationCast(
	component: typeof ReviewActionOperation,
): ReviewCanvasComponent {
	// Intentional narrowing: ExaminePane hard-branches action_operation and never
	// renders via getReviewCanvas. This cast only satisfies the registry type.
	return component as ReviewCanvasComponent;
}

export const REVIEW_CANVAS_REGISTRY: Record<ReviewCanvasKind, ReviewCanvasComponent> = {
	outcome_summary: ReviewOutcomeSummary,
	field_change_set: ReviewFieldChangeSet,
	action_operation: auditedActionOperationCast(ReviewActionOperation),
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
