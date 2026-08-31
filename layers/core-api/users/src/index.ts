/**
 * Barrel for @hyperidle/users (core-api Layer, SQL-owning Service).
 *
 * Typed functions only. This barrel MUST NOT re-export the raw `users`/
 * `loginSessions`/`inviteCodes` pgTable objects — that would let a consumer
 * obtain a table transitively and defeat Table ACL (Mechanism A). Consumers
 * get typed functions; the tables stay private to this Service.
 *
 * @lore AU19 Increment 1d: this is the real cut-over — `user-store.ts`
 * (users), `login-session.ts` (loginSessions), `invite-code.ts`
 * (inviteCodes), and `upgrade-token-store.ts` (pure in-memory, no table)
 * moved here from `packages/server/src/services/`/`packages/server/src/auth/`
 * unchanged (behavior-preserving move). `users` has ZERO real outbound
 * Service edges per architecture §10.1/§10.2's census.
 *
 * @lore AU20 Am11: 14 bespoke read variants collapsed into `findUser` +
 * `listUsers` + `UserFilter`. The two projected getters (`listAgentProfiles` /
 * `listUserDirectory`) and their row types are deleted — routes project full
 * rows themselves. `generateToken`, `hashToken`, `findLoginSessionByTokenHash`,
 * `generateInviteCode` internalized (only external callers were tests).
 * `reapLoginSessions` + `reapInviteCodes` merged into `reapExpiredCredentials`.
 * Net: 38 → 20 public exports.
 */

// -- factory writers (AU29 §2.5.2 — idempotent first-boot users writes) --
export { insertUserIfAbsent, listFactoryAgents, setAgentsStatus } from "./factory-writers.js";
// -- hint progress (P5 — first-time hint dismissal tracking) --
export type { DismissedHint } from "./hint-progress.js";
export { dismissHint, listDismissedHints } from "./hint-progress.js";
// -- invite code (S1 — invite/claim flow) --
export { claimInvite, createInvite } from "./invite-code.js";
// -- login session (S1 — bearer-token auth) --
export { createLoginSession, revokeLoginSession, validateBearerToken } from "./login-session.js";
// -- runnable-agent invariant (AU21 §6 Decision B — the shared ast-<userId> check) --
export { AgentNotRunnableError, requireRunnableAgent } from "./runnable-agent.js";
// -- upgrade token store (I2 — WS-handshake one-shot tokens, no table) --
export type { UpgradeTokenStore } from "./upgrade-token-store.js";
export { createUpgradeTokenStore } from "./upgrade-token-store.js";
// -- user store (AU12 / AU20 Am11 — single owner of `users` row read/write) --
export type { UserFilter } from "./user-store.js";
export { findUser, getOrCreateUser, insertUser, listUsers, updateUser } from "./user-store.js";
