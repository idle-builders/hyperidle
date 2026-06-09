/**
 * @lore AD8b: useCocThread.ts is superseded by useAssistantThread.ts.
 * This file re-exports from useAssistantThread for backward compatibility.
 * All imports that still reference useCocThread will continue to work.
 * New code must import from useAssistantThread directly.
 */

export type {
	AssistantThreadData as CocThreadData,
	AssistantThreadState as CocThreadState,
	AssistantThreadStatus as CocThreadStatus,
} from "./useAssistantThread.js";
export { useAssistantThread as useCocThread } from "./useAssistantThread.js";
