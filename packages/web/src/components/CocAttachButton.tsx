/**
 * L21 — CocAttachButton
 *
 * A "+" button that appears on BetCard/TaskCard/KnowledgeRow when the CoC
 * overlay is open. Clicking it attaches the item as a context ref in the
 * CocOverlay composer.
 *
 * @lore L21 T12-T13: the button is context-driven (reads CocContext), not
 * prop-driven. This avoids threading an `onAttach` callback through every
 * card in the tree. The button renders nothing when overlayOpen=false so
 * existing card consumers (tests, stories) that don't wrap in a Provider
 * are unaffected.
 *
 * @lore L21 reviewer A3: keyboard-accessible — rendered as a <button> with
 * an aria-label. NOT hover-only.
 */

import type { JSX } from "react";
import { useContext } from "react";
import type { CocContextRef } from "../contexts/CocContext";
import { CocContext } from "../contexts/CocContext";

export interface CocAttachButtonProps {
	/** The context ref that will be attached when the button is clicked. */
	ref: CocContextRef;
}

/**
 * Renders a "+" button when the CoC overlay is open.
 * Returns null when the overlay is closed (no-op for non-CoC contexts).
 */
export function CocAttachButton({ ref: cocRef }: CocAttachButtonProps): JSX.Element | null {
	const { overlayOpen, attachContext } = useContext(CocContext);

	if (!overlayOpen) return null;

	return (
		<button
			type="button"
			aria-label={`Attach ${cocRef.label} to Chief of Staff`}
			data-testid="coc-attach-button"
			className="ml-auto shrink-0 flex items-center justify-center h-[24px] w-[24px] rounded-[var(--r1)] text-[var(--text-lo)] hover:text-[var(--text-hi)] hover:bg-[var(--surface-6)] focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--primary)] transition-colors duration-[var(--motion-fast)]"
			onClick={(e) => {
				// Prevent the card's own onClick from triggering (e.g. navigate to bet detail).
				e.stopPropagation();
				attachContext(cocRef);
			}}
		>
			<span aria-hidden="true" className="text-[14px] leading-none">
				+
			</span>
		</button>
	);
}
