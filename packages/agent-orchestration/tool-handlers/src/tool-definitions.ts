/**
 * The canonical list of every skill tool, DI-wired to the injected
 * `ToolHandlersPorts`. Callers filter by role without needing a `ctx` (e.g.
 * the session-provisioning phase that has to decide which tool names to
 * hand the harness BEFORE the session is live) — mirrors the pre-migration
 * `tools/tool-registry.ts`'s `ALL_TOOL_DEFINITIONS` export exactly, minus
 * `commit_file`/`hyperidle_return_status` which stayed execution-internal
 * (`@hyperidle/tool-provider`, per §4/§7.5 — `return-status-tool.ts` is
 * injected per-session via `extraTools`, never in this base list, same as
 * before).
 *
 * @lore Four facilitator-only tools (`route_item`, `score_attention`,
 * `promote_knowledge`, `create_conflict_review`) narrow to the facilitator
 * roles — passing them to builders would break G1 AC6's authorization intent
 * and let a builder mutate knowledge lifecycle state.
 */

import type { HyperIdleDb } from "@hyperidle/db";
import type { RegisteredTool, UserRole } from "@hyperidle/shared";
import { toolsForRole, toRegistered, wrapForRegistry } from "@hyperidle/shared";
import { createAddAgentTool } from "./add-agent.js";
import { createCommitFileTool } from "./commit-file.js";
import { createCreateArtifactTool } from "./create-artifact.js";
import { createCreateBetTool } from "./create-bet.js";
import { createCreateConflictReviewTool } from "./create-conflict-review.js";
import { createCreateItemTool } from "./create-item.js";
import { createCreateRoutineTool } from "./create-routine.js";
import { createCreateTaskTool } from "./create-task.js";
import { createCreateTeamTool } from "./create-team.js";
import { createEditBetTool } from "./edit-bet.js";
import { createHandoffToTool } from "./handoff-to.js";
import { createLogTaskTool } from "./log-task.js";
import type { ToolHandlersPorts } from "./ports.js";
import { createPromoteKnowledgeTool } from "./promote-knowledge.js";
import { createQueryPracticeTool } from "./query-practice.js";
import { createReadInboxTool } from "./read-inbox.js";
import { createRouteItemTool } from "./route-item.js";
import { createScoreAttentionTool } from "./score-attention.js";
import { createSendMessageTool } from "./send-message.js";
import { createSubmitReviewTool } from "./submit-review.js";
import { createUpdateRoutineTool } from "./update-routine.js";
import { createWriteMemoryTool } from "./write-memory.js";
import { createWriteSessionNotesTool } from "./write-session-notes.js";

/**
 * @lore tool-handlers ALWAYS operates with the real `HyperIdleDb` — it is the
 * db-keeping side of the §7.5 C1 split (only `tool-provider`, agent-execution,
 * needs the generic `TDb = unknown` erasure). `buildAllToolDefinitions` is
 * therefore concretely typed rather than generic; each individual
 * `createXxxTool<TDb>(ports)` factory still stays generic (so its own unit
 * tests can instantiate it against a lighter fake `TDb`), with `TDb` inferred
 * as `HyperIdleDb` here from the concrete `ports` argument.
 */
export function buildAllToolDefinitions(
	ports: ToolHandlersPorts<HyperIdleDb>,
): readonly RegisteredTool<HyperIdleDb>[] {
	return [
		toRegistered(createReadInboxTool(ports)),
		toRegistered(createSendMessageTool(ports)),
		toRegistered(createLogTaskTool(ports)),
		toRegistered(createQueryPracticeTool(ports)),
		toRegistered(createWriteMemoryTool(ports)),
		toRegistered(createHandoffToTool(ports)),
		toRegistered(createCreateItemTool(ports)),
		toRegistered(createWriteSessionNotesTool()),
		toRegistered(createCreateTaskTool(ports)),
		toRegistered(createSubmitReviewTool(ports)),
		toRegistered(createCreateArtifactTool(ports)),
		toRegistered(createRouteItemTool(ports)),
		toRegistered(createScoreAttentionTool(ports)),
		toRegistered(createPromoteKnowledgeTool(ports)),
		toRegistered(createCreateConflictReviewTool(ports)),
		toRegistered(createCreateTeamTool(ports)),
		toRegistered(createAddAgentTool(ports)),
		wrapForRegistry(createCreateBetTool(ports), ["assistant"]),
		wrapForRegistry(createEditBetTool(ports), ["assistant"]),
		toRegistered(createCreateRoutineTool(ports)),
		toRegistered(createUpdateRoutineTool(ports)),
		toRegistered(createCommitFileTool<HyperIdleDb>()),
	];
}

/**
 * Return the subset of tool definitions accessible to a given agent role.
 * A tool with `roles === undefined` is available to all roles; otherwise the
 * role must appear in the tool's `roles` array.
 */
export function toolsForRoleFromPorts(
	ports: ToolHandlersPorts<HyperIdleDb>,
	role: UserRole,
): readonly RegisteredTool<HyperIdleDb>[] {
	return toolsForRole(buildAllToolDefinitions(ports), role);
}
