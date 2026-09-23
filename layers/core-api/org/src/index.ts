/**
 * Barrel for @hyperidle/org (core-api Layer, SQL-owning Service).
 *
 * Typed functions only. Consumers get typed functions; the tables stay
 * private to this Service.
 *
 * @lore BC5 T2: `team-lookup.ts`, `org-edges.ts` and their exports moved to
 * `@hyperidle/user` — users, teams and org edges are one Service now.
 * `org-routing.ts`'s `resolveReviewRecipients` had zero production callers
 * left (only its own test) and was deleted with it, not moved. What stays
 * here is the scaffold seam: resolving and persisting the agent rows a
 * welcome-screen or team creation writes, and the `OrgUserDirectory` port
 * that seam calls through (Mechanism C — this Service may not import
 * `@hyperidle/user` directly).
 *
 * @lore AU44 B1: `team_members` dissolved into `teams`. Removed exports:
 * `getTeamMembers`, `listTeamMembers`, `ActiveTeamMembersWithTeamName`,
 * `OrgAgentRunConfigWriter` (folded into `OrgUserDirectory`),
 * `resolveTeamAgentHarness` (inlined into `persistScaffoldedAgents`),
 * `team-default-harness.ts` (deleted). `AgentScaffoldSpec` declared here;
 * the duplicate in `framework/factory-defaults` is deleted (AU44 AU20-fd).
 *
 * @lore AU44 AU20-fd: `framework/factory-defaults` dissolved into this package.
 * `resolveAgentScaffoldSpecs` + `readSystemPromptTemplateForRole` land here so
 * core-api routes import from `@hyperidle/org` and the scaffold-request seam
 * can resolve internally (no framework→layer import needed).
 *
 * @lore AU19 Increment 1c: original cut-over — files moved here from
 * `packages/server/src/services/` unchanged (behavior-preserving move).
 */

// -- ports (Mechanism C — DI-injected outbound edges) --
export type { OrgUserDirectory } from "./ports.js";
// -- scaffold spec resolution (AU44 AU20-fd — moved from framework/factory-defaults) --
export { resolveAgentScaffoldSpecs } from "./resolve-scaffold-specs.js";
// -- scaffold agents (AK6 — single writer of agent user rows) --
export type { AgentScaffoldSpec, ScaffoldResult } from "./scaffold-agents.js";
export { persistScaffoldedAgents } from "./scaffold-agents.js";
