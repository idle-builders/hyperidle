# AU20 Re-Architecture — `users` (core-api) as a coherent product

**Verdict: STANDALONE — the identity & access product.** Canonical directory of every human/agent principal + how principals authenticate (bearer sessions, invite claim, WS upgrade tokens) + per-user UI state. Not a merge anchor.

Census baseline: **23 file-level `export function`s + 5 exported types** (17 barrelled functions + 6 internal helpers that are still `export`ed: `generateToken`, `hashToken`, `findLoginSessionByTokenHash`, `generateInviteCode`, `reapLoginSessions`, `reapInviteCodes`). The Am11 read-collapse already landed in code; this pass adds the inside-out anchor, proves the floor, and closes the surface to the coherent product.

---

## 1. INSIDE-OUT (the anchor)

### Substrate: OWNED DB TABLES (4) + one in-memory logic store

| Table | Nature | Natural op set (floor) |
|---|---|---|
| `users` | **The one real CRUD table** — the principal directory; `costActual` column colocated | find / list / insert / update / getOrCreate — ~5 (no `delete`: users are never hard-deleted, zero delete demand) |
| `loginSessions` | Credential **lifecycle** (not generic CRUD) | create / validate / revoke — 3 |
| `inviteCodes` | Invite **lifecycle** | create / claim — 2 |
| `hintProgress` | Append-only per-user UI state | dismiss / list — 2 |
| _upgrade-token store_ | **internal-logic** — in-memory one-shot token cache, no table, no external system | `createUpgradeTokenStore()` factory → `{ issue, consume }` — 1 |
| _(cross-table retention)_ | lifecycle sweep over `loginSessions` + `inviteCodes` | `reapExpiredCredentials` — 1 |

**Naive owned-tables floor = 5 × 4 = 20.** The honest coherent floor is **~14**, because only `users` is a full CRUD surface; the other three tables are narrow lifecycle/append domains (3 + 2 + 2), plus the token store (1) and the shared reaper (1). The design lands **below the naive 20**.

### Genuine owned capabilities beyond plain CRUD

- **Composable read** — `findUser`/`listUsers` over one `UserFilter` WHERE-builder (the general read interface; absorbs the whole Cartesian product of by-id/by-kind/by-team/by-role/by-status/by-name predicate combinations).
- **Idempotent create** — `getOrCreateUser` (distinct from plain `insertUser`; the invite transaction and `dispatch` both need get-or-create semantics).
- **Cost metering trio** — `incrementUserCost` (atomic `coalesce(costActual,0)+delta` SQL, kept in-store so the `costActual` column ref never leaks), `sumAllUserCost` (factory-wide aggregate), `resetAllUserCost` (bulk update). **Colocation artifact** (`costActual` rides the `users` row) — genuine while the column lives here; all three leave `users` if the column ever moves to a cost-owned table.
- **Bearer-session lifecycle** — `createLoginSession` / `validateBearerToken` / `revokeLoginSession` (hash-only storage; `validateBearerToken` absorbs the raw hash lookup).
- **Invite lifecycle** — `createInvite` / `claimInvite` (claim atomically mints a user + session in one `db.transaction`).
- **Retention** — `reapExpiredCredentials` (one call sweeping both credential tables, matching the single call `retention`'s injected port makes).
- **WS upgrade tokens** — `createUpgradeTokenStore` (in-memory single-use TTL tokens for the WS handshake; distinct auth primitive, no table).
- **Hint state** — `dismissHint` / `listDismissedHints` (FK-anchored per-user UI state).

---

## 2. OUTSIDE-IN (real consumer demand)

11 consumers, all reads except `cost` (metering writes) and `org`/`dispatch` (create):

| Demand | Requesters | Served by |
|---|---|---|
| get one user by id | notifications, org, policy, realtime, work, agent-selection, cost, dispatch, session-requests | `findUser({id})` |
| first user by kind | connections, policy | `findUser({kind})` |
| active teammate by role | policy | `findUser({role, teamIds, status:'active', excludeId})` |
| list users by kind | org, settings | `listUsers({kind})` |
| list users by team | session-requests | `listUsers({teamIds})` |
| active AI users by teams | work, agent-selection | `listUsers({kind:'ai', status:'active', teamIds, orderById})` |
| create a user | org | `insertUser` |
| get-or-create | dispatch | `getOrCreateUser` |
| cost increment / sum / reset / patch | cost | `incrementUserCost` / `sumAllUserCost` / `resetAllUserCost` / `updateUser` |

Every read request is a `UserFilter` literal — no consumer needs a bespoke method. Auth/invite/hint/reaper/token demand comes from route composition roots + `retention`, not listed service edges, but is real product surface.

---

## 3. THE COHERENT PRODUCT API — 17 methods, 5 types

| # | Interface | Shape | Lens | Source |
|---|---|---|---|---|
| 1 | `findUser` | `(exec, filter: UserFilter) → User \| undefined` | both | `users` read floor + the get-one/first-match demand |
| 2 | `listUsers` | `(exec, filter?: UserFilter) → User[]` | both | `users` read floor + all list-by-* demand |
| 3 | `insertUser` | `(exec, values: NewUser) → void` | both | `users` create; org create demand |
| 4 | `updateUser` | `(exec, id, patch: UserPatch) → void` | both | `users` update; general per-column patch (admits `SQL`) |
| 5 | `getOrCreateUser` | `(exec, id, create: NewUser) → User` | both | `users` idempotent create; invite tx + dispatch |
| 6 | `incrementUserCost` | `(exec, id, deltaMinor) → void` | inside-out | `users.costActual` metering (atomic SQL, encapsulated) |
| 7 | `sumAllUserCost` | `(exec) → number` | both | `users.costActual` aggregate; cost demand |
| 8 | `resetAllUserCost` | `(exec) → void` | both | `users.costActual` bulk reset; cost demand |
| 9 | `createLoginSession` | `(db, userId, ttlMs?) → {session, token}` | inside-out | `loginSessions` lifecycle |
| 10 | `validateBearerToken` | `(db, token) → {ok,session}\|{ok:false,reason}` | inside-out | `loginSessions` lifecycle (absorbs hash lookup) |
| 11 | `revokeLoginSession` | `(db, sessionId) → void` | inside-out | `loginSessions` lifecycle |
| 12 | `createInvite` | `(db, createdBy, role, ttlMs?) → InviteCode` | inside-out | `inviteCodes` lifecycle |
| 13 | `claimInvite` | `(db, code, name, email?) → {ok,user,token}\|{ok:false,error}` | inside-out | `inviteCodes` lifecycle (atomic user+session mint) |
| 14 | `reapExpiredCredentials` | `(db, ReapExpiredCredentialsArgs) → ReapExpiredCredentialsResult` | both | cross-table retention; the one call `retention`'s port makes |
| 15 | `createUpgradeTokenStore` | `() → UpgradeTokenStore` | inside-out | internal-logic token store (WS handshake) |
| 16 | `dismissHint` | `(db, userId, hintId) → {inserted}` | both | `hintProgress` append |
| 17 | `listDismissedHints` | `(db, userId) → DismissedHint[]` | both | `hintProgress` read |

**Types (5, all genuinely required — none are per-caller mirrors):**
`UserFilter` (the general read param — the whole predicate space), `UpgradeTokenStore` (store interface), `DismissedHint` (deliberate projection), `ReapExpiredCredentialsArgs` + `ReapExpiredCredentialsResult` (the `retention` port contract).

### Fusion note
The two lenses fuse cleanly: the outside-in demand is 100% read-by-filter + create + cost, which the inside-out `users` CRUD floor already provides via `findUser`/`listUsers`/`insertUser`/`updateUser`/`getOrCreateUser`. No demand forces a method the substrate wouldn't already justify. The auth/invite/reaper/token/hint surfaces are inside-out lifecycle capabilities the product owns and routes/retention consume.

---

## 4. TARGET NUMBERS

- **Naive floor (5×4): 20. Honest coherent floor: ~14.**
- **targetMethods = 17** = 14 coherent floor + 3 cost-metering colocation (fenced, removable if `costActual` moves).
- **targetTypes = 5** — each required by the coherent API.

### What gets removed to reach 17 (from the 23 census)

**Internalized (drop `export`, keep as module-private — capability preserved, off the public surface):** the 6 helpers — `generateToken` + `hashToken` (used by `createLoginSession`/`validateBearerToken`), `findLoginSessionByTokenHash` (folded into `validateBearerToken`), `generateInviteCode` (used by `createInvite`), `reapLoginSessions` + `reapInviteCodes` (used only by `reapExpiredCredentials`). Only external callers today are tests → the tests exercise the public surface instead.

**Already deleted (Am11, capability re-homed at the call site):** 14 bespoke read variants → `findUser`/`listUsers` (`getUserById`, `getUserByIdScopedToTeam`, `getUsersByIds`, `getFirstUserByKind`, `listAllUsers`, `listUsersByKind`, `listUsersByTeam`, `listUsersByTeams`, `listUsersByTeamAndKind`, `listActiveAiUsersByTeams`, `findActiveTeammateByRole`, `searchUsersByName`); 2 projected getters (`listUserDirectory`, `listAgentProfiles`) + 2 row types (`OrgDirectoryRow`, `AgentProfileRow`) — routes project full rows; 2 reapers merged → `reapExpiredCredentials`.

### Lean AND complete — capability proof
Every current real feature stays deliverable: auth login/logout (9-11), invite issue+claim onboarding (12-13), WS handshake (15), cost cap/metering (6-8), user directory + agent lists + teammate lookup + name search (1-2 via `UserFilter`), user create/patch (3-5), retention sweep (14), first-time hint dismissal (16-17). No feature loses a reachable capability; only fragmentation (14 read variants, 6 exported helpers, 2 projected getters) is removed. The read space is *more* complete than before — any new predicate combination is a `UserFilter` literal, zero new methods.
