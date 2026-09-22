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

export { assembledKnowledgeScenarios } from "./assembled-knowledge.js";

export { composedPromptScenarios } from "./composed-prompt.js";
export { createArtifactScenarios } from "./create-artifact.js";
export { createTaskScenarios } from "./create-task.js";
export { delegationScenarios } from "./delegation.js";
// Live eval scaffold for force-return enforcement
export { forceReturnScenarios } from "./force-return.js";
export { handoffToScenarios } from "./handoff-to.js";
export { knowledgeWritebackScenarios } from "./knowledge-writeback.js";
export { logTaskScenarios } from "./log-task.js";
export { readDocumentScenarios } from "./read-document.js";
export { readInboxScenarios } from "./read-inbox.js";
export { routineSessionsScenarios } from "./routine-sessions.js";
export { sendMessageScenarios } from "./send-message.js";
export { sessionScenarios } from "./session.js";
export { submitReviewScenarios } from "./submit-review.js";
export { toolAuthorizationScenarios } from "./tool-authorization.js";
export { writeMemoryScenarios } from "./write-memory.js";
export { writeSessionNotesScenarios } from "./write-session-notes.js";
