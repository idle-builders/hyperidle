/**
 * L21 — CocContext
 *
 * Provides the CoC overlay open state and context-attachment function to
 * components rendered inside Main. This allows BetCard, TaskCard, KnowledgeRow,
 * and ThreadRow to surface a "+" attach affordance without prop-drilling through
 * the entire component tree.
 *
 * @lore L21: The context coupling surface is intentionally minimal — one boolean
 * and one function. If the overlay pattern scales beyond CoC, the context can
 * generalize without breaking consumers.
 */

import type { BlockHostKind } from "@hyperidle/shared";
import { createContext } from "react";

/**
 * A context reference with a display label for the chip (label is NOT
 * persisted in the message payload — only the wire fields travel over the wire).
 *
 * @lore T4: CocContextRef is a discriminated union mirroring InlineRef.
 * Entity refs carry (kind, id, label); block refs carry (kind, blockId, hostKind, hostId, label).
 * The label is display-only and never serialized into the API payload.
 */
export type CocContextRef =
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

export interface CocContextValue {
	overlayOpen: boolean;
	attachContext: (ref: CocContextRef) => void;
}

/**
 * Default value: overlay is closed and attachContext is a no-op.
 * Consumers outside a Provider receive these stable defaults.
 */
export const CocContext = createContext<CocContextValue>({
	overlayOpen: false,
	attachContext: () => undefined,
});
