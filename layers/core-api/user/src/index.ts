/**
 * Barrel for @hyperidle/user (core-api Layer, SQL-owning Service).
 * Typed functions only — must NOT re-export raw `users`/`teams`/`orgEdges` pgTable objects (table ownership).
 * Users, teams and org edges are one Service — a user with its team is one unit of state; parseCron/nextCronMatch live here because the subscription clock (this Service) is their caller.
 */

// -- agent identity --
export type { AgentIdentityDeps, AgentIdentityPort } from "./agent-identity.js";
export { createAgentIdentityPort } from "./agent-identity.js";
// -- whose services an agent reaches --
export { connectionOwnerFor } from "./connection-owner.js";
// -- cron (used by the subscription clock's schedule trigger) --
export type { CronFields } from "./cron.js";
export { nextCronMatch, parseCron } from "./cron.js";
// -- factory writers (idempotent first-boot actor insert, agent status flip) --
export { insertUserIfAbsent, setAgentsStatus } from "./factory-writers.js";
// -- org edges --
export type { UpsertOrgEdgeInput } from "./org-edges.js";
export { deleteOrgEdge, listOrgEdges, upsertOrgEdge } from "./org-edges.js";
// -- a person's own key (who a request is) --
export { findPersonByKey, givePersonKey, isEmailTaken, newPersonKey } from "./person-key.js";
// -- runnable-agent invariant (the shared runnable check) --
export type { RunnableAgent } from "./runnable-agent.js";
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
// -- upgrade token store --
export type { UpgradeTokenStore } from "./upgrade-token-store.js";
export { createUpgradeTokenStore } from "./upgrade-token-store.js";
// -- user actions (search_users / open_user / edit_user) --
export type { UserActionsDeps } from "./user-actions.js";
export { createUserActions } from "./user-actions.js";
// -- live updates for people's pages --
export { registerUserLiveUpdates } from "./user-live-updates.js";
// -- user store (single owner of `users` row read/write) --
export type { UserFilter, UserWithTeams } from "./user-store.js";
export {
	findUser,
	getOrCreateUser,
	insertUser,
	listUsers,
	setUserTeams,
	updateUser,
} from "./user-store.js";
// -- run-config validation --
export type {
	AgentConfigValidationError,
	HarnessCapabilityProbe,
} from "./validate-agent-config.js";
export { validateAgentConfig } from "./validate-agent-config.js";
