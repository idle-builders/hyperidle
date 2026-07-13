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
 * Service edges per architecture §10.1/§10.2's census (no `| users |` source
 * row exists anywhere in the 110-edge census — every edge to `users` is
 * inbound) — a pure leaf domain, so no `ports.ts` / Mechanism C DI is needed
 * for this Service's own outbound composition. `users`' many inbound
 * consumers (`connections`, `filesystems`(via `work`), `notifications`,
 * `org`, `policy`, `realtime`, `review`, `settings`, `work`, plus
 * `agent-selection`/`context-assembly`/`cost`/`dispatch` in
 * agent-orchestration, plus every `packages/server` route/tool/service that
 * reads or writes a user row) are all repointed to this package's real
 * exports at their call sites. `work`'s `UserStoreReader` port and `org`'s
 * `OrgUserDirectory` port (both pre-existing forward-reference DI ports built
 * in Increments 1b/1c before `users` was migrated) are now wired to these
 * real functions instead of `packages/server`'s `user-store.ts` copy.
 */

// -- invite code (S1 — invite/claim flow) --
export { claimInvite, createInvite, generateInviteCode } from "./invite-code.js";
// -- login session (S1 — bearer-token auth) --
export {
	createLoginSession,
	findLoginSessionByTokenHash,
	generateToken,
	hashToken,
	revokeLoginSession,
	validateBearerToken,
} from "./login-session.js";
// -- upgrade token store (I2 — WS-handshake one-shot tokens, no table) --
export type { UpgradeTokenStore } from "./upgrade-token-store.js";
export { createUpgradeTokenStore } from "./upgrade-token-store.js";
// -- user store (AU12 — single owner of `users` row read/write) --
export type { AgentProfileRow, OrgDirectoryRow } from "./user-store.js";
export {
	findActiveTeammateByRole,
	getFirstUserByKind,
	getOrCreateUser,
	getUserById,
	getUserByIdScopedToTeam,
	getUsersByIds,
	incrementUserCost,
	insertUser,
	listActiveAiUsersByTeams,
	listAgentProfiles,
	listAllUsers,
	listUserDirectory,
	listUsersByKind,
	listUsersByTeam,
	listUsersByTeamAndKind,
	listUsersByTeams,
	resetAllUserCost,
	searchUsersByName,
	sumAllUserCost,
	updateUser,
} from "./user-store.js";
