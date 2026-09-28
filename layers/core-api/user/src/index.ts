/**
 * Barrel for @hyperidle/user (core-api Layer, SQL-owning Service).
 * Typed functions only — must NOT re-export raw `users`/`teams`/`orgEdges` pgTable objects (Table ACL, Mechanism A).
 * Users, teams and org edges are one Service — a user with its team is one unit of state; parseCron/nextCronMatch live here because the subscription clock (this Service) is their caller.
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
