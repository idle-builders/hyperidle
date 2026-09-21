/**
 * AD8b — AssistantContext
 *
 * Provides the assistant overlay open state and context-attachment function to
 * components rendered inside Main. This allows BetCard, TaskCard, KnowledgeRow,
 * and ThreadRow to surface a "+" attach affordance without prop-drilling through
 * the entire component tree.
 *
 * @lore AD8b: Renamed from CocContext → AssistantContext. The Coc/CoC noun is
 * purged (AD8a AC-10). All symbols and file references updated atomically.
 */

import { createContext } from "react";

/**
 * A context reference with a display label for the chip (label is NOT
 * persisted in the message payload — only the wire fields travel over the wire).
 *
 * @lore AD8b: Renamed from CocContextRef → AssistantContextRef.
 * @lore artifacts-become-knowledge: BlockRef (kind:"block") removed — a block id rots
 * the moment the source is edited. Replaced by kind:"pending_block" which captures the
 * block's text at attach time and creates a real knowledge item parented to the thread on
 * send. No pointer, no degradation.
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
			 * POST /api/knowledge creates a real knowledge item parented to the
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
