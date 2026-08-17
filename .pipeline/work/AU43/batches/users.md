# Delete batch — `users`

18 convicted rows. Delete every one, or record it as a survivor with a reason.

| # | Symbol | Reach | Why it was convicted |
|---|---|---|---|
| 1 | `getOrCreateUser` |  | Ruling 1 + A7 — resolve-or-provision a user record for an authenticated identity is exactly what OIDC just-in-time provisioning needs. The current form (caller-supplied random id, redundant re-select, only caller claimInvite) dies; the idea is the one survivor of the credential stack and the countable carrier of the A7 work inside this package. |
| 2 | `createInvite` |  | Invites are not the access mechanism — OIDC is. Ruling 1 names invite minting as correctly dead. |
| 3 | `claimInvite` |  | Invite claiming dies because OIDC replaces it, not because there is one user. |
| 4 | `createLoginSession` |  | Home-grown session minting dies because the OIDC provider owns sessions. (Also still: only caller is claimInvite — re-confirmed with rg -a.) |
| 5 | `validateBearerToken` |  | Home-grown token-table lookup is replaced by OIDC token verification (JWKS), which shares zero code with this function. The replacement middleware is A7 work in core-api/src/middleware/auth.ts, not a finish of this function. |
| 6 | `revokeLoginSession` |  | Logout belongs to the OIDC provider. |
| 7 | `reapExpiredCredentials` | SCHED:6h retention sweep (service-bootstrap.ts:510) | Reaps tables that die with feature kill #1; under OIDC the provider owns session lifecycle — there is nothing home-grown left to reap. |
| 8 | `setAgentCategoryForRole` | BOOTSTRAP (bootstrap/factory-state.ts) | Permanent re-run of the one-time AB0 backfill; on a shared backend it reverts another human's recategorization every boot. Unchanged. |
| 9 | `listDismissedHints` | UI:GET /api/hint-progress/ | Re-judged under Ruling 1, stands — localStorage is per-human already; tooltip memory earns no table. |
| 10 | `dismissHint` | UI:POST /api/hint-progress/:hintId/dismiss | Dies with #5. Unchanged. |
| 11 | `createInvite` | UI:POST /api/auth/invite (mounts only under HYPERIDLE_SHARED_MODE=true — nothing sets it) | Ruling 1: invites are not the access mechanism, OIDC is. Reason re-based; verdict stands. |
| 12 | `claimInvite` | UI:POST /api/auth/claim (same dead gate) | Invite claiming is replaced by OIDC login. Reason re-based; verdict stands. |
| 13 | `createLoginSession` | INTERNAL (only production caller claimInvite — re-confirmed) | The OIDC provider owns sessions; also dies with its only caller. |
| 14 | `validateBearerToken` | BOOTSTRAP (middleware/auth.ts shared-mode branch) | Home-grown token-table lookup; its successor is OIDC JWT verification, which shares zero code — that successor is A7 middleware work, not a finish of this function. |
| 15 | `revokeLoginSession` | UI:POST /api/auth/logout (shared mode only; no client) | Logout belongs to the OIDC provider. Reason re-based; verdict stands. |
| 16 | `ReapExpiredCredentialsArgs` |  | Dies with row 1. |
| 17 | `ReapExpiredCredentialsResult` |  | Dies with row 1. |
| 18 | `DismissedHint` |  | Dies with rows 5–6. |
