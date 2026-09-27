/**
 * AssistantAttachButton
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
import { Button } from "../ds";

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
		<Button
			variant="ghost"
			tone="neutral"
			size="icon"
			aria-label={`Attach ${contextRef.label} to Assistant`}
			data-testid="assistant-attach-button"
			className="ml-auto shrink-0"
			onClick={(e) => {
				// Prevent the card's own onClick from triggering (e.g. navigate to bet detail).
				e.stopPropagation();
				attachContext(contextRef);
			}}
		>
			<svg aria-hidden="true" viewBox="0 0 16 16" className="h-[14px] w-[14px]">
				<path d="M8 3v10M3 8h10" fill="none" stroke="currentColor" strokeWidth="1.5" />
			</svg>
		</Button>
	);
}
