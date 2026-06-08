/**
 * Re-exports useHumanCount from the hooks layer for settings components.
 *
 * @lore AD3: Settings components import from this re-export so that test mocks
 * at "../useHumanCount" (relative to settings/__tests__/) can intercept the
 * hook without needing to know the deep hooks/ path. This keeps the mock path
 * short and consistent with sibling settings files.
 */
export type { UseHumanCountResult } from "../hooks/useHumanCount.js";
export { useHumanCount } from "../hooks/useHumanCount.js";
