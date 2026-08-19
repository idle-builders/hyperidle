import type { JSX } from "react";
import { CanvasSourceHeader } from "./CanvasSourceHeader";
import type { ReviewCanvasProps } from "./review-artifact";

/**
 * AL2 — fallback canvas for unknown review artifact kinds.
 *
 * Renders the source header (when the source href is safe) plus a safe JSON dump
 * of the payload. Never crashes or leaves a blank surface.
 */
export function ReviewUnknownCanvas({ artifact }: ReviewCanvasProps): JSX.Element {
	const kindLabel = artifact.kind;
	const preview = JSON.stringify(artifact.payload, null, 2);
	return (
		<div
			data-ds-component="ReviewUnknownCanvas"
			data-testid="review-unknown-canvas"
			className="border-width-thin w-full max-w-[760px] overflow-hidden rounded-[var(--r-default)]  border-[var(--border-subtle)] bg-[var(--surface-elevated)] text-left shadow-[var(--shadow-default)]"
		>
			<CanvasSourceHeader
				tool={artifact.tool}
				app={artifact.app}
				record={artifact.title}
				href={artifact.sourceHref}
			/>
			<div className="px-[18px] py-[18px]">
				<div className="mb-[12px] flex items-center gap-[9px]">
					<span className="type-label rounded-[var(--r-pill)] bg-[var(--surface-container)] px-[9px] py-[3px]   uppercase  text-[var(--text-tertiary)]">
						{kindLabel}
					</span>
					<span className="type-small  text-[var(--text-secondary)]">No dedicated canvas</span>
				</div>
				<section aria-label="Artifact payload preview">
					<pre className="type-data max-h-[320px] overflow-auto rounded-[var(--r-subtle)] bg-[var(--surface-page)] p-[12px]    text-[var(--text-secondary)]">
						{preview}
					</pre>
				</section>
			</div>
		</div>
	);
}
