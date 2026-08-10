/**
 * Barrel for `@hyperidle/agent-run-config` (agent-orchestration Layer, SQL-owning Service).
 *
 * Typed functions only. This barrel MUST NOT re-export the raw `agentRunConfig`
 * / `teamRunConfigDefaults` pgTable objects — that would let a consumer obtain a
 * table transitively and defeat the Table ACL. Consumers get typed functions;
 * the tables stay private to this Service.
 *
 * @lore AU26 G1 (architecture §D-L): this Service is the new home of the nine
 * run-config columns that lived on `users` (six) and `teams` (three) until
 * AU26. `users.system_prompt_path` and `users.skills` were DROPPED, not moved
 * — zero production readers repo-wide at the time of the move.
 *
 * @lore AU31 §2.8: `validateAgentConfig` moved BACK to core-api (its only
 * caller's layer) — AU26 G1's "moved with the columns it validates" held only
 * while the crossing it created was free (both packages lived inside
 * core-api's own composition at the time); under AU31's boundary rule that
 * crossing costs something and buys nothing, so it returns to
 * `layers/core-api/src/routes/validate-agent-config.ts`.
 *
 * @lore AU26 G1: core-api still hosts every run-config write route (§D-A rule
 * 3 — those handlers gate on `users`, a core table, so they have exactly one
 * legal host) and calls down into this Service to persist. Orchestration reads
 * this table live at drain instead of consuming a baked snapshot, because it is
 * orchestration's OWN table — that is an in-layer read, not the core-state read
 * AU21 closed.
 */

export type {
	AgentRunConfig,
	AgentRunConfigPatch,
} from "./agent-run-config-store.js";
export {
	DEFAULT_AGENT_RUN_CONFIG,
	readAgentRunConfig,
	readAgentRunConfigs,
	writeAgentRunConfig,
} from "./agent-run-config-store.js";
export type { TeamRunConfigDefaults } from "./team-run-config-defaults-store.js";
export {
	EMPTY_TEAM_RUN_CONFIG_DEFAULTS,
	readTeamRunConfigDefaults,
	writeTeamRunConfigDefaults,
} from "./team-run-config-defaults-store.js";
