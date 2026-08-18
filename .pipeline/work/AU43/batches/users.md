# Delete batch — `users`

12 convicted rows. Delete every one, or record it as a survivor with a reason.

| # | Symbol | Reach | Why it was convicted |
|---|---|---|---|
| 1 | `reapExpiredCredentials` | SCHED:6h retention sweep (service-bootstrap.ts:510) | Reaps tables that die with feature kill #1; under OIDC the provider owns session lifecycle — there is nothing home-grown left to reap. |
| 2 | `setAgentCategoryForRole` | BOOTSTRAP (bootstrap/factory-state.ts) | Permanent re-run of the one-time AB0 backfill; on a shared backend it reverts another human's recategorization every boot. Unchanged. |
| 3 | `listDismissedHints` | UI:GET /api/hint-progress/ | Re-judged under Ruling 1, stands — localStorage is per-human already; tooltip memory earns no table. |
| 4 | `dismissHint` | UI:POST /api/hint-progress/:hintId/dismiss | Dies with #5. Unchanged. |
| 5 | `createInvite` | UI:POST /api/auth/invite (mounts only under HYPERIDLE_SHARED_MODE=true — nothing sets it) | Ruling 1: invites are not the access mechanism, OIDC is. Reason re-based; verdict stands. |
| 6 | `claimInvite` | UI:POST /api/auth/claim (same dead gate) | Invite claiming is replaced by OIDC login. Reason re-based; verdict stands. |
| 7 | `createLoginSession` | INTERNAL (only production caller claimInvite — re-confirmed) | The OIDC provider owns sessions; also dies with its only caller. |
| 8 | `validateBearerToken` | BOOTSTRAP (middleware/auth.ts shared-mode branch) | Home-grown token-table lookup; its successor is OIDC JWT verification, which shares zero code — that successor is A7 middleware work, not a finish of this function. |
| 9 | `revokeLoginSession` | UI:POST /api/auth/logout (shared mode only; no client) | Logout belongs to the OIDC provider. Reason re-based; verdict stands. |
| 10 | `ReapExpiredCredentialsArgs` |  | Dies with row 1. |
| 11 | `ReapExpiredCredentialsResult` |  | Dies with row 1. |
| 12 | `DismissedHint` |  | Dies with rows 5–6. |
