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

import type { InlineRef } from "@hyperidle/shared";
import { createContext } from "react";

/**
 * A context reference with a display label for the chip (label is NOT
 * persisted in the message payload — only kind+id travel over the wire).
 */
export interface CocContextRef {
	kind: InlineRef["kind"];
	id: string;
	/** Display label for the chip in the overlay composer area. */
	label: string;
}

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
