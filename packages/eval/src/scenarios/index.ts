/**
 * X7/X8: Scenario registry.
 *
 * Each scenario file exports an array of EvalScenario objects.
 * The runner discovers scenarios by importing this index and walking all exports.
 *
 * X8 adds named array exports for each feature's scenarios.
 */

// X7 POC (single default export — kept for backward compat)
export { default as pocSessionNotes } from "./poc-session-notes.js";

// X8 scenario arrays — ordered by feature complexity (LOW → MEDIUM → HIGH → non-session)

// Non-session (interactions 20-24)
export { builtinRoutinesScenarios } from "./builtin-routines.js";
export { composedPromptScenarios } from "./composed-prompt.js";
export { createArtifactScenarios } from "./create-artifact.js";
export { createConflictReviewScenarios } from "./create-conflict-review.js";
// HIGH complexity
export { createItemScenarios } from "./create-item.js";
export { createTaskScenarios } from "./create-task.js";
export { delegationScenarios } from "./delegation.js";
export { handoffToScenarios } from "./handoff-to.js";
export { knowledgeWritebackScenarios } from "./knowledge-writeback.js";
export { logTaskScenarios } from "./log-task.js";
export { materializedKnowledgeScenarios } from "./materialized-knowledge.js";
export { promoteKnowledgeScenarios } from "./promote-knowledge.js";
export { queryPracticeScenarios } from "./query-practice.js";
export { readInboxScenarios } from "./read-inbox.js";
export { routeItemScenarios } from "./route-item.js";
export { routineSessionsScenarios } from "./routine-sessions.js";
export { scoreAttentionScenarios } from "./score-attention.js";
export { sendMessageScenarios } from "./send-message.js";
export { sessionScenarios } from "./session.js";
export { skillAutonomyScenarios } from "./skill-autonomy.js";
export { submitReviewScenarios } from "./submit-review.js";
export { toolAuthorizationScenarios } from "./tool-authorization.js";
// MEDIUM complexity
export { writeMemoryScenarios } from "./write-memory.js";
// LOW complexity
export { writeSessionNotesScenarios } from "./write-session-notes.js";
