/**
 * @lore AU20 Stage 2: thin re-export stub. All logic moved to tool-definitions.ts
 * so that buildAssistantDraftRegistry and the private bet-tool makers are
 * co-located (they share the private makeCreateBetTool/makeEditBetTool factories).
 *
 * Stage-1 completeness-contract test imports `buildAssistantDraftRegistry` from
 * this path — keeping this stub preserves that import without requiring a test change.
 */
export { buildAssistantDraftRegistry } from "./tool-definitions.js";
