/**
 * `@hyperidle/harness-registry`'s `ProposedCallWorkflowPort` (Mechanism C) +
 * the production `buildToolRegistry`/`toolsForRole` entry points every real
 * call site (`session-lifecycle-bindings.ts`, `dispatch`'s
 * `agent-work-assistant.ts` via `ports.toolProvider`) uses — wired here at
 * the `packages/server` composition point.
 *
 * @lore AU19 Increment 4 (§7.5 C1 resolution): `tool-provider` (agent-
 * execution, zero `@hyperidle/db`) forwarded `ctx.db` opaquely into
 * `ProposedCallWorkflowPort`'s three methods. AU20 B3a: `tool-provider` folded
 * into `@hyperidle/harness-registry` — same zero-DB seam, same Mechanism B.
 * The concrete implementation is `@hyperidle/review`'s owned
 * `captureProposedCall`/`consumeTailoredGrant`/`recordOutcome`
 * (`proposedCalls`/`tailoredGrants`/`operationOutcomes` are `review`'s
 * `TABLE_OWNER`). The tool definitions come from `tool-handlers-bindings.ts`'s
 * `buildToolDefinitions` (the DI-wired 21-tool + `write_session_notes` +
 * `commit_file` master list, built fresh per `CoreApiTransport` value).
 *
 * @lore AU31 B2 step 1: `tool-handlers-bindings.ts`'s tool-definitions
 * factory now takes a `CoreApiTransport` value instead of exposing a
 * module-level array (§3.2 clause 7 prep). This file still resolves that
 * value from the `CoreApiPort` ambient global at call time
 * (`getRegisteredCoreApiTransport()`) — this file itself, and the ambient
 * global, are deleted together in the leaf that kills the global outright
 * (§2.5, §3.2). Mechanical intermediate step, not the end state.
 */

import type { HyperIdleDb } from "@hyperidle/db";
import { buildToolRegistry as buildToolRegistryInternal } from "@hyperidle/harness-registry";
import { returnStatusTool } from "@hyperidle/harness-registry/mcp";
import { recordProposedCall, transitionProposedCall } from "@hyperidle/review";
import type {
	BuildToolRegistryOptions,
	ProposedCallWorkflowPort,
	ToolContext,
	ToolRegistry,
} from "@hyperidle/shared";
import { getRegisteredCoreApiTransport } from "./core-api-port-composition.js";
import { buildToolDefinitions } from "./tool-handlers-bindings.js";

/**
 * @lore AU20 Am9: `ProposedCallWorkflowPort<TDb>` in `@hyperidle/shared` keeps the
 * OLD method names (`captureProposedCall`/`consumeTailoredGrant`/`recordOutcome`)
 * because the port is defined in the shared layer and changing it would cascade
 * across `@hyperidle/tool-provider`. These bridge adapters translate to the new
 * `recordProposedCall`/`transitionProposedCall` API at the composition root — the
 * only legal place where both layers are importable together.
 */
export const proposedCallWorkflowPort: ProposedCallWorkflowPort<HyperIdleDb> = {
	captureProposedCall: recordProposedCall,
	consumeTailoredGrant: async (db, opts) => {
		const result = await transitionProposedCall(db, {
			to: "consumed",
			taskId: opts.taskId,
			agentId: opts.agentId,
			toolId: opts.toolId,
		});
		return result ?? null;
	},
	recordOutcome: (db, id, result) =>
		transitionProposedCall(db, { to: "outcome-recorded", id, result }),
};

/** Production-wired `buildToolRegistry` — every real call site imports this, not `@hyperidle/tool-provider` directly. */
export function buildToolRegistry(
	ctx: ToolContext<HyperIdleDb>,
	options: BuildToolRegistryOptions<HyperIdleDb>,
): ToolRegistry<HyperIdleDb> {
	const definitions = buildToolDefinitions(getRegisteredCoreApiTransport());
	return buildToolRegistryInternal(definitions, ctx, options, proposedCallWorkflowPort);
}

/**
 * Production-wired `toolsForRole` — filters the real DI-wired tool definitions.
 *
 * @lore AU29 §2.7: inlined from `@hyperidle/shared`'s (now-deleted) `toolsForRole`
 * — three copies of this one-line predicate beat a shared behavioural function
 * that structurally invites layer values into the framework. See the `roles`
 * doc comment on `RegisteredTool` (framework/shared/src/tool.ts) for the
 * single place this filter's intent stays documented.
 */
export function toolsForRole(role: string) {
	return buildToolDefinitions(getRegisteredCoreApiTransport()).filter(
		(d) => d.roles === undefined || d.roles.includes(role),
	);
}

export { returnStatusTool };
