// Barrel for @hyperidle/policy (core-api Layer, non-SQL orchestration Service).

// -- lifecycle propagation --
export { registerLifecyclePropagation } from "./lifecycle-propagation.js";

// -- aggregate injection contract + cross-boundary types --
export type { PolicyDeps } from "./ports.js";
