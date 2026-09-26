/**
 * Barrel for @hyperidle/user (core-api Layer, SQL-owning Service).
 *
 * Typed functions only. This barrel MUST NOT re-export the raw `users`/
 * `teams`/`orgEdges` pgTable objects — that
 * would let a consumer obtain a table transitively and defeat Table ACL
 * (Mechanism A). Consumers get typed functions; the tables stay private to
 * this Service.
 *
 * @lore BC5 T2: users, teams and org edges are one Service — a user (human
 * or agent) with its team and who it reports to is one row of state, not
 * three packages agreeing by convention. `cron.ts` lives here — this
 * Service's subscription clock is its caller, so `parseCron`/`nextCronMatch`
 * are exported here.
 *
 * @lore BC5 T5: `search_users`/`open_user`/`edit_user` (`user-actions.ts`)
 * are this Service's own action list now, the way `@hyperidle/task`/
 * `@hyperidle/thread`/`@hyperidle/document` each declare theirs.
 * `agent-identity.ts` and `validate-agent-config.ts` moved here verbatim
 * from `layers/core-api/src/routes/`. The agent-creating routes that used
 * to import them (`routes/agents.ts`, `routes/org.ts`, `routes/users.ts`,
 * `routes/teams-routes.ts`) are deleted along with the rest of the user/org
 * route surface; `user-actions.ts` is their only caller now.
 *
 * @lore AU20 Am11: 14 bespoke read variants collapsed into `findUser` +
 * `listUsers` + `UserFilter`. The two projected getters (`listAgentProfiles` /
 * `listUserDirectory`) and their row types are deleted — routes project full
 * rows themselves.
 *
 * @lore AU44 B1: `team_members` dissolved into `teams`. `AU20 Am7`: 22
 * per-call-site team exports collapsed into `getTeam`/`listTeams`/
 * `createTeam`/`updateTeam`.
 *
 * @lore AH4: `upsertOrgEdge` is idempotent by construction — INSERT … ON
 * CONFLICT DO NOTHING against the composite unique index, then re-select.
 */

// -- agent identity (moved verbatim from routes/agent-identity.ts) --
export type { AgentIdentityDeps, AgentIdentityPort } from "./agent-identity.js";
export { createAgentIdentityPort } from "./agent-identity.js";
// -- cron (used by the subscription clock's schedule trigger) --
export type { CronFields } from "./cron.js";
export { nextCronMatch, parseCron } from "./cron.js";
// -- factory writers (idempotent first-boot actor insert, agent status flip) --
export { insertUserIfAbsent, setAgentsStatus } from "./factory-writers.js";
// -- org edges (P2 — org chart edge CRUD, survivor from batch 0) --
export type { UpsertOrgEdgeInput } from "./org-edges.js";
export { deleteOrgEdge, listOrgEdges, upsertOrgEdge } from "./org-edges.js";
// -- runnable-agent invariant (the shared runnable check) --
export { AgentNotRunnableError, requireRunnableAgent } from "./runnable-agent.js";
// -- subscription clock (the schedule half — cron due rows) --
export type {
	SubscriptionClock,
	SubscriptionClockConfig,
	SubscriptionClockDeps,
} from "./subscription-clock.js";
export { startSubscriptionClock } from "./subscription-clock.js";
// -- subscription fire (the nine object events wake a subscription) --
export type {
	SearchTasksReachFn,
	SearchThreadsReachFn,
	SubscriptionFireDeps,
	SubscriptionFireDisposer,
} from "./subscription-fire.js";
export { registerSubscriptionFire } from "./subscription-fire.js";
// -- subscription wake (the baked request both fire and clock share) --
export type { ResolveSubscriptionWakeInput, SubscriptionWakeDeps } from "./subscription-wake.js";
export { resolveSubscriptionWakeRequest } from "./subscription-wake.js";
// -- subscriptions and inbox (subscription search/edit/wake state) --
export type {
	InboxRowFilter,
	NewSubscriptionRow,
	SubscriptionPatch,
	SubscriptionsFilter,
} from "./subscriptions-store.js";
export {
	deleteReapableInboxRows,
	deleteSubscription,
	deleteSubscriptions,
	getSubscription,
	insertInboxRow,
	insertSubscription,
	listInboxRows,
	listReadInboxChangeIds,
	listSubscriptions,
	markInboxRead,
	markInboxSeen,
	setSubscriptionsPaused,
	updateSubscription,
} from "./subscriptions-store.js";
// -- team lookup --
export type { CreateTeamInput } from "./team-lookup.js";
export { createTeam, getTeam, listTeams } from "./team-lookup.js";
// -- upgrade token store (I2 — WS-handshake one-shot tokens, no table) --
export type { UpgradeTokenStore } from "./upgrade-token-store.js";
export { createUpgradeTokenStore } from "./upgrade-token-store.js";
// -- user actions (search_users / open_user / edit_user) --
export type { UserActionsDeps } from "./user-actions.js";
export { createUserActions } from "./user-actions.js";
// -- user store (single owner of `users` row read/write) --
export type { UserFilter } from "./user-store.js";
export { findUser, getOrCreateUser, insertUser, listUsers, updateUser } from "./user-store.js";
// -- run-config validation (moved verbatim from routes/validate-agent-config.ts) --
export type {
	AgentConfigValidationError,
	HarnessCapabilityProbe,
} from "./validate-agent-config.js";
export { validateAgentConfig } from "./validate-agent-config.js";
