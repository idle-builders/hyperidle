/**
 * AD8b — AssistantAttachButton
 *
 * A "+" button that appears on BetCard/TaskCard/DocRow when the assistant
 * overlay is open. Clicking it attaches the item as a context ref in the
 * AssistantOverlay composer.
 *
 * @lore AD8b: Renamed from CocAttachButton → AssistantAttachButton.
 * data-testid changed from "coc-attach-button" → "assistant-attach-button".
 */

import type { JSX } from "react";
import { useContext } from "react";
import type { AssistantContextRef } from "../contexts/AssistantContext";
import { AssistantContext } from "../contexts/AssistantContext";

export interface AssistantAttachButtonProps {
	/** The context ref that will be attached when the button is clicked. */
	ref: AssistantContextRef;
}

/**
 * Renders a "+" button when the assistant overlay is open.
 * Returns null when the overlay is closed (no-op for non-assistant contexts).
 */
export function AssistantAttachButton({
	ref: contextRef,
}: AssistantAttachButtonProps): JSX.Element | null {
	const { overlayOpen, attachContext } = useContext(AssistantContext);

	if (!overlayOpen) return null;

	return (
		<button
			type="button"
			aria-label={`Attach ${contextRef.label} to Assistant`}
			data-testid="assistant-attach-button"
			/* AI5 AQ-015: 44px touch floor ≤1024px, dense 24px ≥1280px. */
			className="ml-auto shrink-0 flex items-center justify-center h-[24px] w-[24px] min-h-[44px] min-w-[44px] xl:min-h-[24px] xl:min-w-[24px] rounded-[var(--r-subtle)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-overlay)] focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--accent-deep)]  "
			onClick={(e) => {
				// Prevent the card's own onClick from triggering (e.g. navigate to bet detail).
				e.stopPropagation();
				attachContext(contextRef);
			}}
		>
			<svg aria-hidden="true" viewBox="0 0 16 16" className="h-[14px] w-[14px]">
				<path d="M8 3v10M3 8h10" fill="none" stroke="currentColor" strokeWidth="1.5" />
			</svg>
		</button>
	);
}
