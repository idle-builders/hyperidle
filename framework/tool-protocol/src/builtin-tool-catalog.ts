import type { Reversibility } from "@hyperidle/domain-model";

/**
 * A single built-in tool's configuration-relevant metadata: the fields the
 * plugin/default configuration projection needs to seed a `tool` capability
 * default (name, description, roles, reversibility). Deliberately does NOT
 * carry `inputSchema` or `handler` — those are execution concerns owned by
 * `tools/tool-registry.ts`, not configuration.
 *
 * @lore AU19 Increment 1f: moved here from `packages/server/src/config/
 * builtin-tool-catalog.ts` per architecture §5 — pure config data read by both
 * `settings` (core-api) and `tool-provider` (execution); keeping it in
 * execution would make `settings → execution` an against-grain edge (§10.2).
 * Zero behavior change — only the import path for `Reversibility`/`UserRole`
 * changed (relative, since this file now lives inside `@hyperidle/tool-protocol`
 * itself rather than importing its own package).
 */
export interface ToolCatalogEntry {
	readonly name: string;
	readonly description: string;
	readonly roles?: readonly string[];
	readonly reversibility?: Reversibility;
}

/**
 * Pure-data mirror of every built-in tool's configuration-relevant metadata.
 * This is the config-source side of the AU10 dependency inversion: the
 * plugin/default configuration projection (`plugin-configuration.ts`) reads
 * this catalog instead of importing the runtime tool execution registry
 * (`tools/tool-registry.ts`, which imports every tool handler + `ToolContext`
 * + the agent-owned `services/contracts.ts`). `tool-registry.ts` depends on this catalog too
 * (via the anti-drift consistency test) — both config and execution now
 * depend *down* onto this one pure-data source, instead of config depending
 * upward on execution.
 *
 * Zero import of `tool-registry.ts` or any `./tools/*` handler module —
 * originally enforced by `scripts/au10-plugin-config-ownership-guard.ts`
 * (retired AU19 Increment 5 item 4: vacuous once `plugin-configuration.ts`
 * moved into the real `@hyperidle/settings` Service package, where
 * `scripts/composition-boundary-guard.ts`'s Mechanism C now bans importing
 * ANY other Service package — a strictly stricter guarantee than au10's
 * denylist ever gave).
 *
 * Kept in sync with `ALL_TOOL_DEFINITIONS` by
 * `layers/agent-orchestration/tool-handlers/src/__tests__/builtin-tool-catalog-consistency.integration.test.ts`
 * — a name-set +
 * per-name metadata deep-equal check that goes red the moment a tool is added
 * to the registry without a catalog entry (or vice versa). `return-status-tool`
 * is deliberately excluded from both, consistent with the runtime registry.
 */
export const BUILTIN_TOOL_CATALOG: readonly ToolCatalogEntry[] = [
	{
		name: "send_message",
		description:
			"Send a direct message to another agent. Reuses an existing direct thread when one exists between the two agents, otherwise creates a new one.",
	},
	{
		name: "reply",
		description:
			"Post a message into the conversation this session was started for. This is how you answer " +
			"the person or agent who triggered you. Takes no thread argument — it always posts to your " +
			"own calling thread (or, when the session has none, to a direct thread with the team's " +
			"human).",
		reversibility: "reversible",
	},
	{
		name: "log_task",
		description:
			"Append a prose note to the current task's notes column. Useful for recording mid-session discoveries, decisions, or status updates. Does not touch the audit trail.",
	},
	{
		name: "query_practice",
		description:
			"Search the knowledge fabric for L3 practices (defaults to layer L3) matching a free-text query. Use to discover prior patterns, decisions, or reflections before starting work.",
	},
	{
		name: "write_memory",
		description:
			"Write a new knowledge item (pattern, decision, reflection, etc.) into the knowledge fabric, attributed to the current agent. Returns the new item ID and version.",
	},
	{
		name: "handoff_to",
		description:
			"Hand off the current task to another agent (by ID), to any teammate matching a role, or to a human reviewer. Ends the current session and transfers ownership.",
	},
	{
		name: "create_item",
		description:
			"Create a human-facing item (review, escalation, knowledge proposal, etc.) and route it to the appropriate view based on risk tier and kind. Auto-creates a thread if none is provided.",
	},
	{
		name: "create_task",
		description:
			"Create a new task under the current bet. Derives betId and teamId from the session context. The new task starts in 'proposed' state.",
	},
	{
		name: "submit_review",
		description:
			"Submit a review for the current bet's work. Posts a review-type message to the bet's host thread. If no artifactRef is provided, falls back to a plain message with the review summary.",
	},
	{
		name: "create_artifact",
		description:
			"Record an artifact produced by the current agent session. The artifact is linked to the current task via context — the producingTaskId is never taken from input.\n\nKind determines the review experience:\n- 'text': markdown/prose (contracts, emails, decisions, analyses)\n- 'code': source code diffs\n- 'image': visual assets (screenshots, designs, diagrams)\n- 'data': structured metrics and tables\n- 'html': rich rendered content (dashboards, charts, visualizations)\n- 'url': references to external resources (deployed services, PRs)\n\nOptional label provides business context (e.g., label='contract' on a text artifact).",
	},
	{
		name: "score_attention",
		description:
			"Set an attention score on an item or knowledge_item. Two modes: 'override' (default; uses the provided score directly — G1 behavior) and 'recompute' (runs the G2 attention engine; ignores the provided score; knowledge_item only).",
		roles: ["assistant", "facilitator", "product_manager"],
	},
	{
		name: "promote_knowledge",
		description:
			"Transition a knowledge item's lifecycle status (captured → provisional → validated → active → stale → archived). Blocks promotion to 'validated' if any open conflict exists on the item.",
		roles: ["assistant", "facilitator", "product_manager"],
	},
	{
		name: "create_conflict_review",
		description:
			"Record a conflict between a proposed knowledge edit and the current stored version. Creates an open knowledge_conflicts row routed to the relevant facilitator's queue.",
		roles: ["assistant", "facilitator", "product_manager"],
	},
	{
		name: "create_team",
		description:
			"Create a new team with the specified functions. Automatically generates an app-default agent roster with appropriate system prompt templates.",
		roles: ["assistant"],
	},
	{
		name: "add_agent",
		description:
			"Add a new AI agent to an existing team with the specified role. App defaults determine the persona. If systemPrompt is provided, it overrides the default.",
		roles: ["assistant"],
	},
	{
		name: "create_bet",
		description:
			"Create a new bet in draft status for the given team. HIGH RISK: requires human approval before execution.",
		roles: ["assistant"],
	},
	{
		name: "edit_bet",
		description:
			"Edit a bet's description, done condition, or hypothesis. HIGH RISK: requires human approval.",
		roles: ["assistant"],
	},
	{
		name: "create_routine",
		description:
			"Create a new routine (recurring automated task) for a team agent. Requires a calendar trigger with a cron expression.",
		roles: ["assistant"],
	},
	{
		name: "update_routine",
		description:
			"Update an existing routine's configuration — name, description, schedule, or state.",
		roles: ["assistant"],
	},
];
