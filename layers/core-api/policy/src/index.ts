// Barrel for @hyperidle/policy (core-api Layer, non-SQL orchestration Service).

// -- approval rate --
export type { ApprovalRateResult } from "./approval-rate.js";
export { computeApprovalRate } from "./approval-rate.js";
// -- lifecycle propagation --
export { registerLifecyclePropagation } from "./lifecycle-propagation.js";

// -- aggregate injection contract + cross-boundary types --
export type { PolicyDeps } from "./ports.js";
