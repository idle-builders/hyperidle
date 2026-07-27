# Service-as-Product Audit — `users` (core-api)

Current: **38 public exports**, 4 owned tables (`users`, `loginSessions`, `inviteCodes`, `hintProgress`) + in-memory upgrade-token store. 17 consumers, 33 requests. Zero outbound service edges (pure leaf).

---

## 1. Existence / Consolidation Verdict — **STANDALONE**

`users` is the **identity & access product**: the canonical directory of every human/agent principal, plus how those principals authenticate (bearer login sessions, invite claim flow, WS upgrade tokens). It is the most-consumed leaf in core-api — 17 services read a user row, and one clear owner is exactly what keeps team-scoped queries, cost attribution, and auth consistent. That is a real product boundary, not table-colocation.

**AU19's "separate because zero outbound edges + most-consumed" claim survives** — but it undersells the point. The boundary is earned by *product purpose* (one authoritative identity source), not by the edge census. It would earn its boundary even with outbound edges.

**Candidate-cluster hypothesis: none proposed (`[]`), correct.** `users` is not a satellite of anything and has no sibling it should fold into. The steer flagged it as the *parameterize-vs-per-intent poster child* — that is the real finding here, and it lives inside the API (Section 2), not in a consolidation move.

**Challenged the reverse (splitting auth OUT):** login-session + invite + upgrade-token could be carved into a separate `auth` service. Rejected — it would *add* a service (against the frame's direction), and `claimInvite` transactionally *creates a user* (`getOrCreateUser` inside a `db.transaction`), so identity and the invite flow are one atomic concern. Auth stays folded in as a sub-surface. `hintProgress` (per-user UI state, one accessor) and the `costActual` column are FK-anchored colocation artifacts — cheap to keep, flagged below.

Not infra/platform: this is an end-user-facing identity domain, not a framework product.

---

## 2. Deliberate Target Public API — **~19 exports** (down from 38, ~50%)

### The core collapse: two general query interfaces subsume 14 read variants

The service today carries **~14 bespoke read functions** that are all one SELECT with a different WHERE — the exact per-intent sprawl the frame rejects. They collapse into a **`find`/`list` pair parameterized by one `UserFilter`**:

```
type UserFilter = {
  ids?: string[]; kind?: string; teamIds?: string[];
  role?: string; status?: string; nameContains?: string;
  excludeId?: string; orderById?: boolean;
}
findUser(exec, filter): User | undefined     // first match (LIMIT 1)
listUsers(exec, filter?): User[]              // all matches
```

| Target interface | Shape | Subsumes (current per-caller exports) |
|---|---|---|
| **`findUser`** | `find(filter) → User \| undefined` | `getUserById` (`{id}`), `getUserByIdScopedToTeam` (`{id,teamId}`), `getFirstUserByKind` (`{kind}`), `findActiveTeammateByRole` (`{role,teamIds,status:'active',excludeId}`) |
| **`listUsers`** | `list(filter) → User[]` | `getUsersByIds` (`{ids}`), `listAllUsers` (`{}`), `listUsersByKind`, `listUsersByTeam`, `listUsersByTeams`, `listUsersByTeamAndKind`, `listActiveAiUsersByTeams` (`{kind:'ai',status:'active',teamIds,orderById}`), `searchUsersByName` (`{nameContains}`), `listUserDirectory` (projection → route projects), `listAgentProfiles` (`{kind:'ai'}` → route drops system/retired + projects) |

The two projected getters (`listUserDirectory`, `listAgentProfiles`) and their row types (`AgentProfileRow`, `OrgDirectoryRow`) are **deleted** — the two route call sites (`routes/org.ts`, `routes/agents.ts`) project the columns they render from the full row, as every other route already does. The `ne(role,'system')/ne(status,'retired')` agent filter becomes a one-line JS filter at the single agent-list call site rather than a bespoke query.

### Retained surfaces (each carries its justification)

| # | Export | Why it stays |
|---|---|---|
| 3 | `insertUser` | Real create demand across org + routes + teams; the write path. |
| 4 | `updateUser` | General per-column patch (admits `SQL` for atomic cost coalesce). |
| 5 | `getOrCreateUser` | Idempotent create used by `claimInvite` (tx) + `dispatch`; distinct from plain insert. |
| 6-8 | `incrementUserCost`, `sumAllUserCost`, `resetAllUserCost` | Cost-metering trio, sole consumer `cost`. **Colocation smell** — exists only because `costActual` lives on the `users` row. Kept as a coherent metering sub-surface; if the column ever moves to a cost-owned table, all three leave `users`. |
| 9-11 | `createLoginSession`, `validateBearerToken`, `revokeLoginSession` | Bearer-session lifecycle. `validateBearerToken` absorbs the raw `findLoginSessionByTokenHash` lookup. |
| 12-13 | `createInvite`, `claimInvite` | Invite lifecycle (claim atomically mints a user + session). |
| 14 | `reapExpiredCredentials` | **Merges `reapLoginSessions` + `reapInviteCodes`** into the single call `retention`'s reaper port makes: `reap(exec, {sessionCutoff, inviteExpiredCutoff, inviteConsumedCutoff}) → {sessions, invites}`. |
| 15-16 | `createUpgradeTokenStore`, `type UpgradeTokenStore` | In-memory WS-handshake token store (no table); distinct auth primitive. |
| 17-19 | `dismissHint`, `listDismissedHints`, `type DismissedHint` | Per-user hint state, one accessor; FK-anchored, cheap to keep. |
| + | `type UserFilter` | The shared filter shape for `find`/`list`. |

### Deleted / internalized (not re-exported)
- **Internalized** (still used internally, drop from barrel; only external callers today are tests): `generateToken`, `hashToken` (used by `createLoginSession`/`validateBearerToken`), `findLoginSessionByTokenHash` (subsumed by `validateBearerToken`), `generateInviteCode` (used by `createInvite`).
- **Deleted, collapsed into `find`/`list`**: `getUserById`, `getUserByIdScopedToTeam`, `getUsersByIds`, `getFirstUserByKind`, `listAllUsers`, `listUsersByKind`, `listUsersByTeam`, `listUsersByTeams`, `listUsersByTeamAndKind`, `listActiveAiUsersByTeams`, `findActiveTeammateByRole`, `searchUsersByName`, `listUserDirectory`, `listAgentProfiles`, and types `AgentProfileRow`, `OrgDirectoryRow`.
- **Merged**: `reapLoginSessions` + `reapInviteCodes` → `reapExpiredCredentials`.

---

## 3. Inside Lens

One `user-store.ts` compiles `UserFilter` into a single `and(...)` WHERE-builder — every read predicate lives in one place; a new column filter is one `if (filter.x) preds.push(eq(...))` line, not a new function. Callers project full rows at the route (no projection functions to maintain). Auth stays in `login-session.ts` / `invite-code.ts`; token store isolated. Tables stay private to the package (Mechanism-A ACL preserved — the barrel never re-exports pgTables). The cost trio is fenced as its own metering sub-module so the colocation debt is visible and removable.

---

## 4. Scaling Argument (sub-linear)

Add dozens of services and hundreds of user-reads — **zero new methods**:
- "active humans in team T" → `listUsers({kind:'human', status:'active', teamIds:[T]})`
- "any admin except me" → `findUser({role:'admin', excludeId:me})`
- "users named ~foo in my teams" → `listUsers({nameContains:'foo', teamIds})`

Every one composes from `UserFilter`. The rejected design grows one method per predicate combination — today's `listUsersByKind` / `listUsersByTeam` / `listUsersByTeamAndKind` / `listActiveAiUsersByTeams` chain is precisely that failure: four methods for four AND-combinations of the same three columns. `find(filter)`/`list(filter)` absorbs the Cartesian product in two exports. Passes the scaling test; the current API fails it.

---

## 5. Key Collapses

1. **14 read variants → 2 (`findUser` + `listUsers`) + 1 filter type.** The headline: ~10 `getUserBy*`/`listUsersBy*` + directory/profile projections become one parameterized `find`/`list` pair.
2. **2 projected getters + 2 row types deleted** — routes project full rows themselves.
3. **4 token/lookup helpers internalized** (`generateToken`, `hashToken`, `findLoginSessionByTokenHash`, `generateInviteCode`) — used only internally + by tests; off the public surface.
4. **2 retention reapers → 1** `reapExpiredCredentials` matching the single call `retention` actually makes.
5. **Cost trio flagged** as a colocation artifact (sole consumer `cost`) — kept for MVP but marked for removal if `costActual` moves off the user row.

Net: **38 → ~19 exports**, and the read surface stops growing a method per new query.
