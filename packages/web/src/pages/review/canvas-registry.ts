import { ReviewUnknownCanvas } from "./ReviewUnknownCanvas";
import type { ReviewCanvasComponent } from "./review-artifact";

/**
 * AL2 — review canvas registry stub.
 *
 * The real registry will map every `ReviewCanvasKind` to its dedicated canvas
 * component. During the red phase this fallback-only stub lets the test file
 * compile and fail its assertions.
 */
export function getReviewCanvas(_kind: string): ReviewCanvasComponent {
	return ReviewUnknownCanvas;
}
