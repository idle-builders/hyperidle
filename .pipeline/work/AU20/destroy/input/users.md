# Destroyer input — `users` (core-api)

Package: `layers/core-api/users`
Surface: 18 exported functions, 1 classes (0 member methods), 5 interface/type declarations, 0 const/enum exports.

## A. Exported functions — EVERY ONE NEEDS A VERDICT

| # | Method | Public | Location |
|---|---|---|---|
| 1 | `reapExpiredCredentials` | yes | `layers/core-api/users/src/credentials-reaper.ts:34` |
| 2 | `insertUserIfAbsent` | yes | `layers/core-api/users/src/factory-writers.ts:20` |
| 3 | `setAgentCategoryForRole` | yes | `layers/core-api/users/src/factory-writers.ts:29` |
| 4 | `listFactoryAgents` | yes | `layers/core-api/users/src/factory-writers.ts:45` |
| 5 | `listDismissedHints` | yes | `layers/core-api/users/src/hint-progress.ts:35` |
| 6 | `dismissHint` | yes | `layers/core-api/users/src/hint-progress.ts:50` |
| 7 | `createInvite` | yes | `layers/core-api/users/src/invite-code.ts:32` |
| 8 | `claimInvite` | yes | `layers/core-api/users/src/invite-code.ts:74` |
| 9 | `createLoginSession` | yes | `layers/core-api/users/src/login-session.ts:41` |
| 10 | `validateBearerToken` | yes | `layers/core-api/users/src/login-session.ts:82` |
| 11 | `revokeLoginSession` | yes | `layers/core-api/users/src/login-session.ts:117` |
| 12 | `requireRunnableAgent` | yes | `layers/core-api/users/src/runnable-agent.ts:34` |
| 13 | `createUpgradeTokenStore` | yes | `layers/core-api/users/src/upgrade-token-store.ts:73` |
| 14 | `findUser` | yes | `layers/core-api/users/src/user-store.ts:106` |
| 15 | `listUsers` | yes | `layers/core-api/users/src/user-store.ts:122` |
| 16 | `insertUser` | yes | `layers/core-api/users/src/user-store.ts:143` |
| 17 | `updateUser` | yes | `layers/core-api/users/src/user-store.ts:147` |
| 18 | `getOrCreateUser` | yes | `layers/core-api/users/src/user-store.ts:157` |

## B. Classes and their member methods — EVERY MEMBER NEEDS A VERDICT

### `AgentNotRunnableError` — `layers/core-api/users/src/runnable-agent.ts:24` (public)
- (no public member methods)

## C. Interface / type declarations — the DI-port surface

Verdict each DECLARATION (not every member individually) unless a member is independently interesting. A port member whose only implementation you are deleting dies with it — say so.

- `ReapExpiredCredentialsArgs` (interface, public) `layers/core-api/users/src/credentials-reaper.ts:16` — members: `sessionCutoff`, `inviteExpiredCutoff`, `inviteConsumedCutoff`
- `ReapExpiredCredentialsResult` (interface, public) `layers/core-api/users/src/credentials-reaper.ts:25` — members: `sessions`, `invites`
- `DismissedHint` (interface, public) `layers/core-api/users/src/hint-progress.ts:27` — members: `hintId`, `seenAt`
- `UpgradeTokenStore` (interface, public) `layers/core-api/users/src/upgrade-token-store.ts:37` — members: `issue`, `consume`
- `UserFilter` (interface, public) `layers/core-api/users/src/user-store.ts:62` — members: `id`, `ids`, `kind`, `teamIds`, `role`, `status`, `nameContains`, `excludeId`, `orderById`
