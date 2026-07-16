/**
 * Barrel for @hyperidle/tool-handlers (agent-orchestration Layer Service).
 *
 * Typed functions only — no raw table (this Service owns zero tables of its
 * own; every table it touches is owned by `work`/`org`/`knowledge`/`routine`
 * and reached through this Service's own `ports.ts` DI ports).
 *
 * @lore AU19 Increment 4 (§7.5 C1 resolution): the DB-/domain-touching
 * handler bodies of `tools/*` (§4 roster). `buildAllToolDefinitions(ports)`
 * DI-wires all 21 domain-touching tool bodies + `commit_file` (execution-
 * internal logic, zero domain touch, but grouped with the master list here
 * to match the pre-migration `ALL_TOOL_DEFINITIONS` shape exactly) + writes
 * `write_session_notes` (touches `sessions`, `UNOWNED_SHARED_TABLES`). The
 * orchestration Layer (today `packages/server`'s composition root) wires
 * `ports` to each target Service's real exports, then hands the resulting
 * `RegisteredTool[]` into `@hyperidle/tool-provider`'s `buildToolRegistry`.
 */

export { createAddAgentTool } from "./add-agent.js";
export {
	type AssistantDraftRegistryParams,
	buildAssistantDraftRegistry,
	resolveCurrentDraftBetId,
	resolveDraftTeamId,
} from "./assistant-draft-registry.js";
export { createCommitFileTool } from "./commit-file.js";
export { createCreateArtifactTool } from "./create-artifact.js";
export { createCreateBetTool } from "./create-bet.js";
export { createCreateConflictReviewTool } from "./create-conflict-review.js";
export { createCreateItemTool } from "./create-item.js";
export { createCreateRoutineTool } from "./create-routine.js";
export { createCreateTaskTool } from "./create-task.js";
export { createCreateTeamTool } from "./create-team.js";
export { createEditBetTool } from "./edit-bet.js";
export { createHandoffToTool } from "./handoff-to.js";
export { createLogTaskTool } from "./log-task.js";
export type {
	ToolHandlersAgentSelectionAccessor,
	ToolHandlersConversationAccessor,
	ToolHandlersDispatchAccessor,
	ToolHandlersHandoffMetadata,
	ToolHandlersHandoffParams,
	ToolHandlersHandoffResult,
	ToolHandlersKnowledgeAccessor,
	ToolHandlersOrgAccessor,
	ToolHandlersPolicyAccessor,
	ToolHandlersPorts,
	ToolHandlersRoutineAccessor,
	ToolHandlersSessionContext,
	ToolHandlersUsersAccessor,
	ToolHandlersWorkAccessor,
} from "./ports.js";
export { createPromoteKnowledgeTool } from "./promote-knowledge.js";
export { createQueryPracticeTool } from "./query-practice.js";
export { createReadInboxTool } from "./read-inbox.js";
export { createRouteItemTool } from "./route-item.js";
export { createScoreAttentionTool } from "./score-attention.js";
export { createSendMessageTool } from "./send-message.js";
export { createSubmitReviewTool } from "./submit-review.js";
export { buildAllToolDefinitions, toolsForRoleFromPorts } from "./tool-definitions.js";
export { createUpdateRoutineTool } from "./update-routine.js";
export { createWriteMemoryTool } from "./write-memory.js";
export { createWriteSessionNotesTool } from "./write-session-notes.js";
