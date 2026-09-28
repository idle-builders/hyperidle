/**
 * AssistantContext
 *
 * Provides the assistant overlay open state and context-attachment function to
 * components rendered inside Main. This allows BetCard, TaskCard, DocRow,
 * and ThreadRow to surface a "+" attach affordance without prop-drilling through
 * the entire component tree.
 *
 */

import { createContext } from "react";

/**
 * A context reference with a display label for the chip (label is NOT
 * persisted in the message payload — only the wire fields travel over the wire).
 *
 */
export type AssistantContextRef =
	| {
			kind: "document" | "task" | "message";
			id: string;
			/** Display label for the chip in the overlay composer area. */
			label: string;
	  }
	| {
			/**
			 * A block whose content is captured at attach time. On send,
			 * `call("edit_document", …)` creates a real document parented to the
			 * thread. The content is a snapshot — editing the source afterwards
			 * leaves this item unchanged.
			 */
			kind: "pending_block";
			/** Full plain-text content of the block at attach time. */
			content: string;
			/** Display label for the chip. */
			label: string;
	  };

export interface AssistantContextValue {
	overlayOpen: boolean;
	attachContext: (ref: AssistantContextRef) => void;
}

/**
 * Default value: overlay is closed and attachContext is a no-op.
 * Consumers outside a Provider receive these stable defaults.
 */
export const AssistantContext = createContext<AssistantContextValue>({
	overlayOpen: false,
	attachContext: () => undefined,
});
