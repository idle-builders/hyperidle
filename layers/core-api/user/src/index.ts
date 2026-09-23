/**
 * Barrel for @hyperidle/user (core-api Layer, SQL-owning Service).
 *
 * Typed functions only. This barrel MUST NOT re-export the raw `users`/
 * `teams`/`orgEdges`/`loginSessions`/`inviteCodes` pgTable objects — that
 * would let a consumer obtain a table transitively and defeat Table ACL
 * (Mechanism A). Consumers get typed functions; the tables stay private to
 * this Service.
 *
 * @lore BC5 T2: users, teams, org edges, login sessions and invite codes are
 * one Service now — a user (human or agent) with its team and who it reports
 * to is one row of state, not three packages agreeing by convention.
 * `user-store.ts`, `factory-writers.ts`, `invite-code.ts`, `login-session.ts`,
 * `runnable-agent.ts` and `upgrade-token-store.ts` moved here unchanged from
 * `@hyperidle/users`; `team-lookup.ts` and `org-edges.ts` moved here
 * unchanged from `@hyperidle/org`. `cron.ts` moved here unchanged from
 * `@hyperidle/routine` — it was already private to that package (the only
 * caller was its own `insertRoutine`), and this Service's subscription clock
 * is now its other caller, so `parseCron`/`nextCronMatch` are exported here
 * for `@hyperidle/routine` to keep importing until the cut-over retires it.
 *
 * @lore BC5 T5: `search_users`/`open_user`/`edit_user` (`user-actions.ts`)
 * are this Service's own action list now, the way `@hyperidle/task`/
 * `@hyperidle/thread`/`@hyperidle/document` each declare theirs.
 * `agent-identity.ts` and `validate-agent-config.ts` moved here verbatim
 * from `layers/core-api/src/routes/` — every agent-creating route
 * (`routes/agents.ts`, `routes/org.ts`, `routes/users.ts`,
 * `routes/teams-routes.ts`) imports both from here now, unchanged in
 * substance, until T11 deletes those routes outright.
 *
 * @lore AU19 Increment 1d: this is the real cut-over — `user-store.ts`
 * (users), `login-session.ts` (loginSessions), `invite-code.ts`
 * (inviteCodes), and `upgrade-token-store.ts` (pure in-memory, no table)
 * moved here from `packages/server/src/services/`/`packages/server/src/auth/`
 * unchanged (behavior-preserving move).
 *
 * @lore AU20 Am11: 14 bespoke read variants collapsed into `findUser` +
 * `listUsers` + `UserFilter`. The two projected getters (`listAgentProfiles` /
 * `listUserDirectory`) and their row types are deleted — routes project full
 * rows themselves. `generateToken`, `hashToken`, `findLoginSessionByTokenHash`,
 * `generateInviteCode` internalized (only external callers were tests).
 * `reapLoginSessions` + `reapInviteCodes` merged into `reapExpiredCredentials`.
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
// -- cron (AU44 batch 3 — private to the routine trigger until the
// subscription clock became its second caller, and moved here with it) --
export type { CronFields } from "./cron.js";
export { nextCronMatch, parseCron } from "./cron.js";
// -- factory writers (AU29 §2.5.2 — idempotent first-boot users writes) --
export { insertUserIfAbsent, listFactoryAgents, setAgentsStatus } from "./factory-writers.js";
// -- invite code (S1 — invite/claim flow) --
export { claimInvite, createInvite } from "./invite-code.js";
// -- login session (S1 — bearer-token auth) --
export { createLoginSession, revokeLoginSession, validateBearerToken } from "./login-session.js";
// -- org edges (P2 — org chart edge CRUD, survivor from batch 0) --
export type { UpsertOrgEdgeInput } from "./org-edges.js";
export { deleteOrgEdge, listOrgEdges, upsertOrgEdge } from "./org-edges.js";
// -- runnable-agent invariant (AU21 §6 Decision B — the shared ast-<userId> check) --
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
// -- team lookup (AU20 Am7 / AU44 B1 — team_members dissolved) --
export type { CreateTeamInput } from "./team-lookup.js";
export { createTeam, getTeam, listTeams } from "./team-lookup.js";
// -- upgrade token store (I2 — WS-handshake one-shot tokens, no table) --
export type { UpgradeTokenStore } from "./upgrade-token-store.js";
export { createUpgradeTokenStore } from "./upgrade-token-store.js";
// -- user actions (search_users / open_user / edit_user) --
export type { UserActionsDeps } from "./user-actions.js";
export { createUserActions } from "./user-actions.js";
// -- user store (AU12 / AU20 Am11 — single owner of `users` row read/write) --
export type { UserFilter } from "./user-store.js";
export { findUser, getOrCreateUser, insertUser, listUsers, updateUser } from "./user-store.js";
// -- run-config validation (moved verbatim from routes/validate-agent-config.ts) --
export type {
	AgentConfigValidationError,
	HarnessCapabilityProbe,
} from "./validate-agent-config.js";
export { validateAgentConfig } from "./validate-agent-config.js";
