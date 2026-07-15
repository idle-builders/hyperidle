/**
 * `@hyperidle/tool-provider`'s `ProposedCallWorkflowPort` (Mechanism C) +
 * the production `buildToolRegistry`/`toolsForRole` entry points every real
 * call site (`session-lifecycle-bindings.ts`, `dispatch`'s
 * `agent-work-assistant.ts` via `ports.toolProvider`) uses — wired here at
 * the `packages/server` composition point.
 *
 * @lore AU19 Increment 4 (§7.5 C1 resolution): `tool-provider` (agent-
 * execution, zero `@hyperidle/db`) forwards `ctx.db` opaquely into
 * `ProposedCallWorkflowPort`'s three methods — the concrete implementation
 * is `@hyperidle/review`'s owned `captureProposedCall`/`consumeTailoredGrant`/
 * `recordOutcome` (`proposedCalls`/`tailoredGrants`/`operationOutcomes` are
 * `review`'s `TABLE_OWNER`). `allToolDefinitions` comes from
 * `tool-handlers-bindings.ts` (the DI-wired 21-tool + `write_session_notes` +
 * `commit_file` master list).
 */

import type { HyperIdleDb } from "@hyperidle/db";
import { captureProposedCall, consumeTailoredGrant, recordOutcome } from "@hyperidle/review";
import type {
	BuildToolRegistryOptions,
	ProposedCallWorkflowPort,
	ToolContext,
	ToolRegistry,
} from "@hyperidle/shared";
import { toolsForRole as toolsForRoleShared } from "@hyperidle/shared";
import {
	buildToolRegistry as buildToolRegistryInternal,
	returnStatusTool,
} from "@hyperidle/tool-provider";
import { allToolDefinitions } from "./tool-handlers-bindings.js";

export const proposedCallWorkflowPort: ProposedCallWorkflowPort<HyperIdleDb> = {
	captureProposedCall,
	consumeTailoredGrant,
	recordOutcome,
};

/** Production-wired `buildToolRegistry` — every real call site imports this, not `@hyperidle/tool-provider` directly. */
export function buildToolRegistry(
	ctx: ToolContext<HyperIdleDb>,
	options: BuildToolRegistryOptions<HyperIdleDb>,
): ToolRegistry<HyperIdleDb> {
	return buildToolRegistryInternal(allToolDefinitions, ctx, options, proposedCallWorkflowPort);
}

/** Production-wired `toolsForRole` — filters the real DI-wired `allToolDefinitions`. */
export function toolsForRole(role: string) {
	return toolsForRoleShared(allToolDefinitions, role);
}

export { returnStatusTool };
