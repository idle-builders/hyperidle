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

import type { BlockHostKind } from "@hyperidle/shared";
import { createContext } from "react";

/**
 * A context reference with a display label for the chip (label is NOT
 * persisted in the message payload — only the wire fields travel over the wire).
 *
 * @lore T4: AssistantContextRef is a discriminated union mirroring InlineRef.
 * Entity refs carry (kind, id, label); block refs carry (kind, blockId, hostKind, hostId, label).
 * The label is display-only and never serialized into the API payload.
 *
 * @lore AD8b: Renamed from CocContextRef → AssistantContextRef.
 */
export type AssistantContextRef =
	| {
			kind: "knowledge_item" | "task" | "artifact" | "bet" | "message";
			id: string;
			/** Display label for the chip in the overlay composer area. */
			label: string;
	  }
	| {
			kind: "block";
			blockId: string;
			hostKind: BlockHostKind;
			hostId: string;
			/** Display label for the chip in the overlay composer area. */
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

// ---------------------------------------------------------------------------
// AF14: Coc→Assistant rename complete. CocContext.tsx, CocOverlay.tsx,
// CocAttachButton.tsx, useCocThread.ts are all deleted. All callers use
// AssistantContext, AssistantOverlay, AssistantAttachButton, useAssistantThread.
// ---------------------------------------------------------------------------
