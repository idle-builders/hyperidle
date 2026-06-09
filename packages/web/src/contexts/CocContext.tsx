/**
 * @lore AD8b: CocContext.tsx is superseded by AssistantContext.tsx.
 * This file re-exports from AssistantContext for backward compatibility.
 * All imports that still reference CocContext will continue to work.
 * New code must import from AssistantContext directly.
 */

export type {
	AssistantContextRef as CocContextRef,
	AssistantContextValue as CocContextValue,
} from "./AssistantContext.js";
export { AssistantContext as CocContext } from "./AssistantContext.js";
