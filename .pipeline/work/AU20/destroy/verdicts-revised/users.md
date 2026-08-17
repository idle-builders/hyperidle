# users — destroyer verdict (REVISED after founder rulings)

## What changed after the rulings

### Rows whose verdict moved

| # | Method | Old verdict | New verdict | Ruling |
|---|---|---|---|---|
| 18 | `getOrCreateUser` | DELETE | FINISH | Ruling 1 + A7 — resolve-or-provision a user record for an authenticated identity is exactly what OIDC just-in-time provisioning needs. The current form (caller-supplied random id, redundant re-select, only caller `claimInvite`) dies; the idea is the one survivor of the credential stack and the countable carrier of the A7 work inside this package. |

One verdict moved. Every other verdict stands — but five stand on **corrected reasoning**:

### Rows whose verdict stands on a new premise (Ruling 1)

| # | Method | Verdict (unchanged) | Old reason (voided) | New reason |
|---|---|---|---|---|
| 7 | `createInvite` | DELETE | "no client / product is single-user" | Invites are not the access mechanism — OIDC is. Ruling 1 names invite minting as correctly dead. |
| 8 | `claimInvite` | DELETE | same | Invite claiming dies because OIDC replaces it, not because there is one user. |
| 9 | `createLoginSession` | DELETE | dies with its only caller | Home-grown session minting dies because the OIDC provider owns sessions. (Also still: only caller is `claimInvite` — re-confirmed with `rg -a`.) |
| 10 | `validateBearerToken` | DELETE | "the Bearer branch is unreachable; deployed auth is one team key" | Home-grown token-table lookup is replaced by OIDC token verification (JWKS), which shares zero code with this function. The replacement middleware is A7 work in `core-api/src/middleware/auth.ts`, not a finish of this function. |
| 11 | `revokeLoginSession` | DELETE | "logout for a system nobody can log into" | Logout belongs to the OIDC provider. |

Rows 5–6 (hint progress) were re-judged under Ruling 1 and **stand as DELETE**: the first-wave argument ("tooltip memory belongs in localStorage") never rested on single-user. Under a shared backend, localStorage is per-human-per-browser, which is exactly right for first-run tooltips; a DB table + two routes + a service so a dismissed tooltip roams across a human's devices is still not core value.

Ruling 2 (events) moves nothing here — this verdict killed no event types. Ruling 3 (ritual → plugin) has no rows in this package; no PLUGIN verdicts.

**Re-verification on the current tree** (all with `rg -a`): nothing sets `HYPERIDLE_SHARED_MODE` anywhere (code, docs, helm, desktop — the one new reference since the first wave is a doc comment in `layers/agent-orchestration/connections/src/held-connections-for-provisioning.ts`, not code); `getOrCreateUser` and `createLoginSession` have exactly one production caller each (`invite-code.ts`); `orderById` has exactly one caller and it is a test; **zero OIDC code exists in the repo** — A7 is entirely unbuilt.

## Should this service exist?

KEEP AS the identity spine — sole owner of the `users` table, now judged against the real deployment: a **shared backend for a team, and an organisation of several teams, with identity from an OIDC provider**. `findUser`/`listUsers`/`insertUser`/`updateUser` sit under 54/22/10/3 real doors, `requireRunnableAgent` is the one cross-domain invariant ("never run the human sender as the agent") under 19 doors, and — new under Ruling 1 — this service is where an OIDC-authenticated human becomes a `users` row. "Who is the acting human" is not an enterprise reflex on a shared backend; it is load-bearing (conversation attribution, per-human held connections in the connections service key on `userId`, team membership).

The per-human credential stack inside it still dies wholesale — but for the corrected reason: **OIDC replaces it**, it was never the wrong goal, only the wrong mechanism (home-grown invites + bearer sessions), and it shipped gated behind an env var nothing sets, with no client.

## If written today, from scratch

Against the corrected premise — shared backend, team of humans + agents, OIDC identity, event stream plugins hang off — eight public symbols:

- `findUser(exec, filter)` — single-row read
- `listUsers(exec, filter)` — multi-row read
- `insertUser(exec, values, opts?: { ifAbsent?: true })` — one insert, conflict mode as option
- `updateUser(exec, id, patch: Partial<NewUser>)` — plain patch, no SQL-expression admittance
- `getOrCreateUserForIdentity(exec, subject, profile)` — the finished row 18: map a verified OIDC subject to a `users` row, create on first login (JIT provisioning). The only human-creation door besides founder setup.
- `requireRunnableAgent(db, agentId)` + `AgentNotRunnableError` — the runnability invariant
- `createUpgradeTokenStore()` — one-shot WS handshake tokens (in-memory, hardcoded TTL/cap)

Plus `UserFilter` (minus `orderById`) as the one filter type. What is deliberately **not** in the from-scratch shape: invite codes, home-grown sessions/logout, credential reaping (the OIDC provider owns session lifecycle), a role matrix (`admin`/`member` — if a human role distinction is ever earned, it arrives as an OIDC claim, not a table), server-side tooltip memory, and a perpetual backfill.

## Kill summary

| Verdict | Count |
|---|---|
| DELETE | 9 |
| MERGE | 2 |
| SIMPLIFY | 3 |
| FINISH | 1 |
| KEEP | 4 |

Surface: 19 methods (18 functions + 1 class) → 8 (58% cut). Delta vs first wave: one DELETE became FINISH; the cut shrinks by one symbol because OIDC provisioning keeps a door.

## Feature-level kills

### 1. The home-grown credential mechanism (rows 1, 7–11) — DELETE, replaced by OIDC (Ruling 1 / A7)

`invite-code.ts`, `login-session.ts`, `credentials-reaper.ts`, and the `inviteCodes` + `loginSessions` tables. The conviction is re-based:

1. **Wrong mechanism by ruling.** Access to the shared backend arrives via an OIDC provider. Invite minting, invite claiming, and home-grown bearer sessions are the mechanism OIDC replaces — Ruling 1 names them dead explicitly.
2. **Still unreachable as shipped.** All of it mounts only under `HYPERIDLE_SHARED_MODE=true`, which nothing sets (re-confirmed on current tree), and no client mints invites, claims them, stores a session token, or logs out. Nothing real breaks when it goes.
3. **What it tried to do survives elsewhere.** Per-human identity on a shared backend is real and needed — it is re-provided by A7 (OIDC middleware + row 18's FINISH), not preserved by keeping this code.

Cascade kills, adjusted: `auth-public.ts`, the shared-mode Bearer branch + `handleBearerAuth` in `middleware/auth.ts` (its successor is the A7 OIDC verification, written fresh), `INVITE_ROLES` + `LOGIN_SESSION_TTL_MS` + `INVITE_CODE_TTL_MS`, `SESSION_EXPIRED`/`SESSION_REVOKED`/`INVITE_CLAIMED`/`INVITE_EXPIRED` error codes, `loginSessionId`/`authMethod="login_session"` context vars, the `reapExpiredCredentials` call in `service-bootstrap.ts:510`, both tables, the S1-* integration tests. **Not** killed: the `sharedMode` flag itself — under Ruling 1 shared mode is the real deployment, so the flag's fate (probably "which auth middleware mounts") is decided by A7, not by this deletion.

### 2. Server-side hint dismissal (rows 5–6) — DELETE (re-judged under Ruling 1, stands)

`hint-progress.ts`, the `hintProgress` table, both `/api/hint-progress` routes, the round-trip in `useHints.tsx`. Multi-human changes nothing: localStorage is already per-human-per-browser. The only capability lost is dismissals roaming across one human's devices — first-run tooltips do not earn a table and two endpoints for that. The hook already degrades to the localStorage shape on API failure.

### 3. Perpetual factory backfill (row 3) — DELETE (premise-neutral, unchanged)

`setAgentCategoryForRole` re-runs the one-time AB0 backfill every launch and clobbers any recategorized factory-role agent at next boot. On a shared backend this is *worse* than first judged: one boot reverts a category some other team member set. A migration wearing a bootstrap costume.

## Full method audit

| # | Method | Reach | Verdict | Reason |
|---|---|---|---|---|
| 1 | `reapExpiredCredentials` | SCHED:6h retention sweep (`service-bootstrap.ts:510`) | DELETE | Reaps tables that die with feature kill #1; under OIDC the provider owns session lifecycle — there is nothing home-grown left to reap. |
| 2 | `insertUserIfAbsent` | BOOTSTRAP (`bootstrap/factory-state.ts` via desktop + tools/setup) | MERGE | Fold into `insertUser(exec, values, { ifAbsent: true })`; two insert functions are one insert function. Unchanged. |
| 3 | `setAgentCategoryForRole` | BOOTSTRAP (`bootstrap/factory-state.ts`) | DELETE | Permanent re-run of the one-time AB0 backfill; on a shared backend it reverts another human's recategorization every boot. Unchanged. |
| 4 | `listFactoryAgents` | BOOTSTRAP (`bootstrap/factory-state.ts`) | MERGE | Bespoke projected getter; `listUsers(db, {ids, kind:"ai"})` + caller projects `{id, role}`. Unchanged. |
| 5 | `listDismissedHints` | UI:GET /api/hint-progress/ | DELETE | Re-judged under Ruling 1, stands — localStorage is per-human already; tooltip memory earns no table. |
| 6 | `dismissHint` | UI:POST /api/hint-progress/:hintId/dismiss | DELETE | Dies with #5. Unchanged. |
| 7 | `createInvite` | UI:POST /api/auth/invite (mounts only under `HYPERIDLE_SHARED_MODE=true` — nothing sets it) | DELETE | Ruling 1: invites are not the access mechanism, OIDC is. Reason re-based; verdict stands. |
| 8 | `claimInvite` | UI:POST /api/auth/claim (same dead gate) | DELETE | Invite claiming is replaced by OIDC login. Reason re-based; verdict stands. |
| 9 | `createLoginSession` | INTERNAL (only production caller `claimInvite` — re-confirmed) | DELETE | The OIDC provider owns sessions; also dies with its only caller. |
| 10 | `validateBearerToken` | BOOTSTRAP (`middleware/auth.ts` shared-mode branch) | DELETE | Home-grown token-table lookup; its successor is OIDC JWT verification, which shares zero code — that successor is A7 middleware work, not a finish of this function. |
| 11 | `revokeLoginSession` | UI:POST /api/auth/logout (shared mode only; no client) | DELETE | Logout belongs to the OIDC provider. Reason re-based; verdict stands. |
| 12 | `requireRunnableAgent` | UI:POST /api/threads/:id/messages + 18 more doors, 6 event subscribers | KEEP | The one cross-domain invariant (never run the human sender as the agent) — on a shared backend with several humans it matters *more*. Cross-service debt unchanged: `session-requests`' duplicate `requireRunnableActor` should die into this one. |
| 13 | `createUpgradeTokenStore` | BOOTSTRAP (`app.ts`/`boot.ts`) → UI:POST /api/auth/ws-token → `core-ui` ws-client | SIMPLIFY | Live (the UI's WS handshake rides it); drop the `HYPERIDLE_WS_TOKEN_TTL_MS`/`HYPERIDLE_WS_TOKEN_MAX` env knobs — referenced nowhere but this file and its test; hardcode 60s/1000. Unchanged. |
| 14 | `findUser` | 54 doors (routes, agent tools, schedulers, subscribers) | KEEP | The identity spine's single-row read. Unchanged. |
| 15 | `listUsers` | 22 doors | SIMPLIFY | Drop `orderById` — sole caller is `conversation-user-store-reads.integration.test.ts` (re-confirmed); test-only surface is dead surface. Unchanged. |
| 16 | `insertUser` | 10 doors (user setup, agents, teams, scaffold, assistant) | KEEP | The one write door to `users`; absorbs row 2's conflict mode; becomes the insert under row 18's provisioning. Unchanged. |
| 17 | `updateUser` | UI:PATCH /api/users/:id, PATCH /api/agents/:id, DELETE /api/agents/:id | SIMPLIFY | `UserPatch`'s SQL-expression admittance lost its only use when cost metering died; patch becomes `Partial<NewUser>`. Unchanged. |
| 18 | `getOrCreateUser` | INTERNAL (only production caller `claimInvite`) | **FINISH** | Ruling 1 + A7. Reshape into OIDC just-in-time provisioning: key by verified OIDC subject (not a caller-supplied random id), get the mapped `users` row or create it on first login, drop the redundant post-insert re-select. This is the countable A7 work inside this package — the one idea from the credential stack that a shared backend genuinely needs. |
| 19 | `AgentNotRunnableError` (class) | Caught by `routine/src/routine-service.ts` + route handlers | KEEP | The error contract of row 12. Unchanged. |

## Types / DI ports

| Declaration | Verdict | Reason |
|---|---|---|
| `ReapExpiredCredentialsArgs` | DELETE | Dies with row 1. |
| `ReapExpiredCredentialsResult` | DELETE | Dies with row 1. |
| `DismissedHint` | DELETE | Dies with rows 5–6. |
| `UpgradeTokenStore` | KEEP | Live DI port between boot composition and the auth route/WS handler; both members have real callers. |
| `UserFilter` | SIMPLIFY | Drop `orderById` (test-only). The other eight fields have production callers; on a shared backend `teamIds`/`excludeId`/`nameContains` are load-bearing, not speculative. |

## Holes this leaves

1. **Until A7 lands, a second human has no individual identity.** This is now a **scheduled gap, not an accepted one** (the first wave's "hole in the roadmap, not the product" framing is void). Deleting the invite/session stack removes nothing reachable, but the shared backend the product *is* needs OIDC: verification middleware in `core-api/src/middleware/auth.ts` and row 18's FINISH in this package. Zero OIDC code exists today — **a work package for A7 needs writing**; nothing in any track registry covers it.
2. **Per-human held connections keep working.** `held-connections-for-provisioning.ts` scopes plaintext tokens per `userId`; its doc comment cites "shipped shared mode + invite codes" as the identity source, but the code keys on `userId` only — OIDC supplies that instead. Comment goes stale, behavior does not break.
3. **Hint dismissals stop roaming across a human's devices.** First-run UX; acceptable even multi-human.
4. **`loginSessions`/`inviteCodes` tables drop** — a migration, plus S1-* integration tests, `INVITE_ROLES`, both TTL constants, four API error codes. Auth middleware collapses to API-key-only *for now*; A7 replaces the shared-mode branch with OIDC verification. The `sharedMode` flag survives this deletion — its fate is A7's to decide, since shared mode is the real deployment (Ruling 1), not an edge case.
5. **Pre-AB0 databases never get `agentCategory` backfilled** — one SQL migration fixes it once instead of every launch, destructively.
6. **Nothing reaps credentials** — nothing home-grown is left to reap; the OIDC provider owns session lifecycle. The 6h sweep keeps reaping its other tables untouched.
