# users — destroyer verdict

## Should this service exist?

KEEP AS the identity spine — sole owner of the `users` table. `findUser`/`listUsers`/`insertUser`/`updateUser` sit under 54/22/10/3 real doors and `requireRunnableAgent` is the one cross-domain invariant ("never trust the human sender as the agent") under 19 doors. That is the service.

Everything else in the package is a second product hiding inside it: a full per-human credential system (invites, bearer login sessions, revocation, credential retention) that **no client anywhere can reach**. It dies wholesale — see feature-level kills.

## If written today, from scratch

Seven public symbols:

- `findUser(exec, filter)` — single-row read
- `listUsers(exec, filter)` — multi-row read
- `insertUser(exec, values, opts?: { ifAbsent?: true })` — one insert, conflict mode as option
- `updateUser(exec, id, patch: Partial<NewUser>)` — plain patch, no SQL-expression admittance
- `requireRunnableAgent(db, agentId)` + `AgentNotRunnableError` — the runnability invariant
- `createUpgradeTokenStore()` — one-shot WS handshake tokens (in-memory, feeds the real UI's WebSocket)

Plus `UserFilter` as the one filter type. Nothing else.

## Kill summary

| Verdict | Count |
|---|---|
| DELETE | 10 |
| MERGE | 2 |
| SIMPLIFY | 3 |
| KEEP | 4 |

Surface: 19 methods (18 functions + 1 class) → 7 (63% cut)

## Feature-level kills

### 1. The entire per-human credential stack (rows 1, 7–11, 18) — DELETE

`invite-code.ts`, `login-session.ts`, `credentials-reaper.ts`, and the `inviteCodes` + `loginSessions` tables. Three facts convict it:

1. **Gated behind an env var nothing sets.** `/api/auth/invite`, `/api/auth/claim`, `/api/auth/logout`, and the Bearer branch of the auth middleware mount only when `HYPERIDLE_SHARED_MODE=true`. Grep across repo, helm, desktop, docs: nothing sets it. Desktop "shared mode" (`--backend-mode=shared`) is a *client* connecting with the team API key — a different thing.
2. **Zero client.** No UI creates invites, no claim page exists, no logout button exists, no code anywhere stores or sends a login-session Bearer token (the one `Bearer` in `applications/desktop/src/credential-validator.ts` carries the API key). Every endpoint in this stack is curl-only.
3. **The documented deployment contradicts it.** `docs/deployment/shared-backend.md` §Auth: "one shared team `HYPERIDLE_API_KEY`". That is the ETHOS trust model — trust the team, share the key. Per-human credentials with admin/member invite roles (enforced nowhere — the only admin gate is holding the master key), 30-day sessions, revocation, and an invite "audit-window" reaper is preemptive enterprise identity built for a learning nobody has had.

Deleting it removes **zero user-reachable behavior** and aligns code with the deployed reality. Cascade kills: `auth-public.ts`, the shared-mode Bearer branch + `handleBearerAuth` in `middleware/auth.ts`, `INVITE_ROLES` + `LOGIN_SESSION_TTL_MS` + `INVITE_CODE_TTL_MS` in domain-model, `SESSION_EXPIRED`/`SESSION_REVOKED`/`INVITE_CLAIMED`/`INVITE_EXPIRED` error codes, `loginSessionId`/`authMethod="login_session"` context vars, the `reapExpiredCredentials` call in `service-bootstrap.ts:510`, both tables from schema, and the S1-* integration tests.

### 2. Server-side hint dismissal (rows 5–6) — DELETE

`hint-progress.ts`, the `hintProgress` table, both `/api/hint-progress` routes, and the server round-trip in `useHints.tsx`. A DB table + two endpoints + a service to remember "user closed a tooltip" is bloat; localStorage does this with zero backend. The hook already treats API failure as all-dismissed, so it degrades to exactly the localStorage shape.

### 3. Perpetual factory backfill (row 3) — DELETE

`setAgentCategoryForRole` re-runs the one-time AB0 `agentCategory` column backfill on **every launch**, and overwrites the category of *any* ai user sharing a factory role name — a founder who recategorizes a "builder" agent gets silently reverted at next boot. Every factory insert already sets its category. A migration wearing a bootstrap costume, with a side of data clobbering.

## Full method audit

| # | Method | Reach | Verdict | Reason |
|---|---|---|---|---|
| 1 | `reapExpiredCredentials` | SCHED:6h retention sweep (`service-bootstrap.ts:510` — graph missed the setInterval wiring) | DELETE | Reaps tables that are themselves deleted; and expired/revoked rows were already unusable — this was hygiene, the invite cutoff literally an "audit-window". |
| 2 | `insertUserIfAbsent` | BOOTSTRAP (`bootstrap/factory-state.ts` via desktop + tools/setup) | MERGE | Same idea as `insertUser` with `onConflictDoNothing` — fold in as `insertUser(exec, values, { ifAbsent: true })`; two insert functions are one insert function. |
| 3 | `setAgentCategoryForRole` | BOOTSTRAP (`bootstrap/factory-state.ts`) | DELETE | Permanent re-run of the one-time AB0 backfill; clobbers custom categories by role every launch; factory inserts already carry the category. |
| 4 | `listFactoryAgents` | BOOTSTRAP (`bootstrap/factory-state.ts`) | MERGE | Bespoke projected getter — exactly the species AU20 Am11 exterminated; `listUsers(db, {ids, kind:"ai"})` + caller projects `{id, role}`. |
| 5 | `listDismissedHints` | UI:GET /api/hint-progress/ | DELETE | Feature kill #2 — tooltip memory belongs in localStorage, not a DB table behind two endpoints. |
| 6 | `dismissHint` | UI:POST /api/hint-progress/:hintId/dismiss | DELETE | Dies with #5; the TOCTOU-safe upsert is careful engineering on a feature that shouldn't exist server-side. |
| 7 | `createInvite` | UI:POST /api/auth/invite (mounts only if `HYPERIDLE_SHARED_MODE=true` — nothing sets it; no client) | DELETE | Feature kill #1; admin/member invite roles are a permission matrix enforced by zero lines of code. |
| 8 | `claimInvite` | UI:POST /api/auth/claim (same dead gate; no client) | DELETE | Feature kill #1 — the only production human-creation path besides founder setup, and no user can reach it. |
| 9 | `createLoginSession` | INTERNAL (only caller is `claimInvite`; exported but no external production import) | DELETE | Dies with its only caller. |
| 10 | `validateBearerToken` | BOOTSTRAP (`middleware/auth.ts` shared-mode branch — dead-gated) | DELETE | The Bearer branch it serves is unreachable; deployed auth is the one team API key, per docs and ETHOS. |
| 11 | `revokeLoginSession` | UI:POST /api/auth/logout (shared mode only; no client) | DELETE | Logout for a login system nobody can log into. |
| 12 | `requireRunnableAgent` | UI:POST /api/threads/:id/messages + 18 more doors, 6 event subscribers | KEEP | The one cross-domain invariant (never run the human sender as the agent) — core to agents-as-participants. Cross-service note: `session-requests`' duplicate `requireRunnableActor` copy should die into this one (AU21 Increment 4 debt). |
| 13 | `createUpgradeTokenStore` | BOOTSTRAP (`app.ts`/`boot.ts`) → UI:POST /api/auth/ws-token → `core-ui/src/services/ws-client.ts` | SIMPLIFY | Real (the UI's WS handshake rides it) but drop the `HYPERIDLE_WS_TOKEN_TTL_MS`/`HYPERIDLE_WS_TOKEN_MAX` env knobs — operator toggles referenced nowhere but this file and its test; hardcode 60s/1000. |
| 14 | `findUser` | 54 doors (routes, agent tools, schedulers, subscribers) | KEEP | The identity spine's single-row read; the AU20 Am11 collapse already made it minimal. |
| 15 | `listUsers` | 22 doors | KEEP-shape, SIMPLIFY | Drop `orderById` — its only remaining caller is a test (`conversation-user-store-reads.integration.test.ts`); test-only surface is dead surface. |
| 16 | `insertUser` | 10 doors (user setup, agents, teams, scaffold, assistant) | KEEP | The one write door to `users`; absorbs row 2's conflict mode. |
| 17 | `updateUser` | UI:PATCH /api/users/:id, PATCH /api/agents/:id, DELETE /api/agents/:id | SIMPLIFY | `UserPatch`'s SQL-expression admittance lost its only use when cost metering died (AU21 14a) — the @lore admits it's kept "as reusable infrastructure", i.e. speculative generality. Patch becomes `Partial<NewUser>`. |
| 18 | `getOrCreateUser` | INTERNAL (only caller `claimInvite`, which passes a freshly random id — the "get" branch is structurally dead in production) | DELETE | A plain insert wearing a get-or-create costume plus a redundant re-select; dies with feature kill #1 regardless. |
| 19 | `AgentNotRunnableError` (class) | Caught by `routine/src/routine-service.ts` + route handlers | KEEP | The error contract of row 12 — callers map it to 4xx; one class, no members, earns its line. |

## Types / DI ports

| Declaration | Verdict | Reason |
|---|---|---|
| `ReapExpiredCredentialsArgs` | DELETE | Dies with row 1. |
| `ReapExpiredCredentialsResult` | DELETE | Dies with row 1. |
| `DismissedHint` | DELETE | Dies with rows 5–6. |
| `UpgradeTokenStore` | KEEP | Live DI port between boot composition and the auth route/WS handler; both members (`issue`, `consume`) have real callers. |
| `UserFilter` | SIMPLIFY | Drop `orderById` (test-only, row 15). The other eight fields all have production callers (`excludeId` via policy-bindings, `nameContains` via recipients, etc.). |

## Holes this leaves

1. **A second human cannot join a backend with their own identity.** This is the big one — and it is a hole in the *roadmap*, not the *product*: today no user-reachable path creates a second human anyway (`POST /api/users` returns the existing human once one exists; claim had no client). The product as shipped is single-human-per-backend, and deleting the stack makes the code stop pretending otherwise. When multi-human becomes real, build the smallest door that fits the documented trust model (share the team key, pick your name on connect) — not a credential system in advance. If a login UI is genuinely landing next, the founder overrules feature kill #1 and rows 7–11 flip to KEEP; the facts above say it is not wired to anything today.
2. **Hint dismissals stop roaming.** Dismissed onboarding tooltips reappear on a new device/browser profile. They are first-run UX; acceptable.
3. **`loginSessions`/`inviteCodes` tables drop** — a migration, plus deletion of the S1-* integration tests, `INVITE_ROLES`, both TTL constants, and four API error codes. The auth middleware collapses to API-key-only in both modes; the `sharedMode` flag likely shrinks to "is /api/users setup pre-auth or not" and may die entirely in a follow-up.
4. **Pre-AB0 databases never get `agentCategory` backfilled.** If such a DB still exists, one SQL migration fixes it once, correctly, instead of every launch, destructively.
5. **Nothing reaps credentials** — nothing is left to reap. The 6h sweep in `service-bootstrap.ts` keeps reaping its other tables untouched.
