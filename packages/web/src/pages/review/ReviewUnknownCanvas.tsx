import type { JSX } from "react";
import type { ReviewCanvasProps } from "./review-artifact";

/**
 * AL2 — fallback canvas for unknown review artifact kinds.
 *
 * Renders the source header (when the source href is safe) plus a safe JSON dump
 * of the payload. Stub: real implementation will import and use
 * `CanvasSourceHeader` and `isSafeSourceHref`.
 */
export function ReviewUnknownCanvas({ artifact }: ReviewCanvasProps): JSX.Element {
	return (
		<div data-ds-component="ReviewUnknownCanvas" data-testid="review-unknown-canvas">
			<a href={artifact.sourceHref}>Open in {artifact.app}</a>
			<pre>{JSON.stringify(artifact.payload)}</pre>
		</div>
	);
}
