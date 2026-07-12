# AU12 — Conversation and Users own their own writes AND reads — Architecture

**Branch:** `framework/AU12-conversation-users-ownership` · **Type:** backend refactor (behavior-preserving) · **Complexity:** L→XL (read pass ~doubles surface)
**Depends on:** AU11 (shipped, PR #428). Refine + Design skipped (pure internal refactor, no UI, no behavior change).

---

## 0. REWORK BANNER — founder correction (2026-07-12)

**This is a REWORK pass on the open PR #435, not a new work package.** The original AU12 shipped a
**write-only** ownership boundary: `conversation-store.ts` / `user-store.ts` owned the
`insert`/`update`/`delete` of `threads`/`messages`/`users`, but **reads stayed direct** (~40+
`select().from(...)` sites left in place, explicitly scoped out in the original §7c, and that
write-only reading was REVIEWED + APPROVED, round 2). PR #435 is open and **not merged**.

**The founder has ruled that interpretation wrong.** The requirement is **reads AND writes**:
`conversation-store.ts` and `user-store.ts` must be the **only** code path to the
`threads`/`messages`/`users` tables — full stop, not just for mutations. This rework:

1. **Rebases the branch onto current `origin/main`** (AU13 #436 + AU14 #434/#437 have merged since the
   branch was cut — see §7a; rebase notes below).
2. **Adds read functions** to both stores, shaped by what the real call sites need (§3d/§3e).
3. **Migrates every remaining direct read call site** in `packages/server/src` — both normal query-builder
   reads (§5b) and raw-`sql\`\`` owned-column references (§5c, the round-1 BLOCKER fix).
4. **Extends the guard** from write-scoped to **full-access-scoped** — any reference to an owned table
   object outside the two owning files is a finding (§4).
5. Keeps the four out-of-`packages/server` exceptions as exceptions for reads too (§5a).

Everything in §1–§6 from the original write-migration plan that is still correct is retained; §7c now
records the correction and the new (reads+writes) interpretation. The **write** migration already
landed in PR #435 and survives the rebase — the delta this rework adds is the **read** migration plus
the guard extension.

### Rebase result (completed by this planner)

`git rebase origin/main` was **NOT clean** — the write-migration commit `0eda7dc6` collides with
AU13's and AU14's ownership refactors (both merged to main) because all three migrations touch the
same shared service files. Conflicts were **import-block-only** (each file's body 3-way-merged cleanly
— main's `work-service`/`routine-service` write routing and AU12's `conversation-store`/`user-store`
write routing are orthogonal edits in different hunks). Resolution rule applied: **union of both
sides' service imports, minus any raw table symbol either side migrated away** (if either side removed
`items`/`threads`/`messages` from a file's `@hyperidle/db` import because it routed that write through a
store, the merged body no longer references it, so it was dropped). Files resolved: `package.json`
(union of the au12 + au13 guard invocations in `lint`), `routes/users.ts`, `services/{builtin-routine-handlers,
cost-cap, handoff-protocol, lifecycle-propagation, review-item-factory, session-review-creator}.ts`,
plus `plans/mock-data-purge/inventory.{json,md}` (unrelated to AU12 → took main's version). The two
stale **attestation** commits (`dc7c6d72`, `dfead246`) were **dropped** during rebase (rename/rename
conflicts; attestations are regenerated at ship and the code has changed anyway). `npm ci` re-run
(package-lock moved). Branch is now current on `origin/main`; the builder re-runs the full gate.

---

## 1. Context

Today ~59 write call sites across 22 files in `packages/server/src` independently `insert`/`update`
`threads`, `messages`, and `users` — core routes and agent-owned code writing the same rows with no
shared function, so nothing enforces the shape of a message/thread/user row. **In addition (rework
scope), ~148 direct query-builder READs** (`.from(threads|messages|users)` + joins) across ~50 files,
**plus 15 raw-`sql\`\`` owned-column references** across 7 files (§5c), read those same tables with no
shared function. AU8's should-graph guard cannot be built until there is one owning module per domain to
check against. AU12 creates two owning modules and routes every write **and every read** through them,
changing nothing the product does.

**This plan supersedes the WP narrative's call-site count.** The WP text names ~8 files; the real
audit finds **22 files / ~59 write sites** (§5), **~50 files / ~148 query-builder read sites** (§5b),
**and 7 files / 15 raw-`sql` owned-column references** (§5c) in `packages/server/src` — ~163 read
access sites total. The AC ("the owning service's functions are the only code … permitted to import the
Drizzle table objects") is now read **as written** — reads AND writes (see the §0 banner and §7c).
Production access to these tables that lives **outside** `packages/server/src`
(bootstrap/seed/fixture code) is triaged as named exceptions in §5a — reads there are equally out of
scope.

## 2. Constraints (from the WP)

- **No product behavior may change.** Ownership consolidation only. **This is the load-bearing risk of
  the read pass** — 163 read sites, many with narrowed column projections, ordering, pagination, joins,
  raw-SQL WHERE fragments, and in-transaction reads that must be preserved exactly (§8b).
- The two owning files (plus their own tests) are the only code permitted to **read or write** these
  tables. **Interpretation (CORRECTED, §7c): the guard is FULL-ACCESS-scoped — any reference to an owned
  table object outside the owners is a finding, including a bare `${threads.x}` interpolation inside a
  `sql\`\`` template.**
- No new tables, no schema changes.
- Agent-layer callers keep calling in-process (plain function call, same process — no queue/API).
- Only the two named services are new production code besides their own tests.

## 3. The two owning modules

Both are **core-app domain services** (Conversation and Users are core domains per
`runtime-simplification.md`). They live in the shared `packages/server/src/services/` directory
(core and agent services share it, distinguished by ownership not path — AU11 frame). They may be
imported by both core routes and agent-owned files (agent→core is the allowed direction; core→core is
fine). Naming avoids the `Service`/`Manager`/`Store`-of-nothing anti-pattern; `-store` communicates
"owns the persistence/shape of these rows" and matches the multi-export domain-noun file convention
already used across `services/` (e.g. `agent-session-requests.ts`).

### 3a. Executor type (shared prerequisite)

Several call sites write inside a `db.transaction(async (tx) => …)` (threads.ts, handoff-protocol.ts,
builtin-routine-handlers.ts) — the write MUST stay inside the caller's transaction to preserve
atomicity (e.g. threads.ts appends a message + updates the thread + inserts an `agentWorkIntents` row
atomically, with verdict-race logic). Therefore **every store function (read and write) takes the
executor as its first argument**, so the caller passes either `db` or its live `tx`. **This is exactly
what makes the read migration safe for the 4 in-transaction reads (§8b): passing `tx as HyperIdleDb`
into a read function keeps the read inside the caller's transaction snapshot.**

**Executor type = plain `HyperIdleDb` (no union, no derived generics).** This mirrors the existing,
documented repo convention. `packages/server/src/services/practice-meeting.ts:448-454` types its
transaction param as plain `HyperIdleDb` with an explicit `@lore`:

> *"Passing `HyperIdleDb` as the `tx` parameter type is safe — the drizzle transaction object is
> structurally compatible (same `insert`/`update`/`select` methods) and this avoids depending on
> drizzle's internal transaction type."*

`agent-session-requests.ts:279` (`terminalizeAgentSessionRequestInTx(tx: HyperIdleDb, …)`) does the
same. No new `DbExecutor` export is added to `@hyperidle/db`.

**Verified call-site mechanics.** How existing callers pass a `tx` into a `HyperIdleDb`-typed param
today: `agent-session-requests.ts:331` does
`db.transaction((tx) => terminalizeAgentSessionRequestInTx(tx as HyperIdleDb, input))`. The drizzle
transaction handle is **not** silently assignable to `HyperIdleDb` — the established convention pairs
the `HyperIdleDb` param with an explicit `tx as HyperIdleDb` cast at every transaction-composition call
site. **Therefore every `tx`-scoped read/write in §5/§5b/§5c passes `getThreadById(tx as HyperIdleDb, id)` /
`insertThread(tx as HyperIdleDb, v)` etc.** `db` and `ctx.db` rows pass their value directly, no cast.

Every store function signature below takes `exec: HyperIdleDb`. The `@lore` rationale (structural
compatibility, avoids drizzle internal type) already lives on both store files.

### 3b. `packages/server/src/services/conversation-store.ts` — owns `threads` + `messages` (WRITES — already built)

The service owns **the row write** — no event emission, no transaction orchestration, no
participant/verdict business logic. Callers keep their existing `eventBus.emit(...)`, `db.transaction`
wrappers, participant math, and `agentWorkIntents`/`items` inserts exactly as-is.

Existing (shipped) write surface — unchanged by this rework:

```ts
// --- threads ---
export function insertThread(exec: HyperIdleDb, values: NewThread): Promise<void>;
export function updateThread(exec: HyperIdleDb, id: string, patch: Partial<NewThread>): Promise<void>;

// --- messages ---
export function insertMessage(exec: HyperIdleDb, values: NewMessage): Promise<void>;
export function updateMessage(exec: HyperIdleDb, id: string, patch: Partial<NewMessage>): Promise<void>;
export function resolveMessageIfUnresolved(exec, id, resolvedAt): Promise<{ id: string }[]>; // verdict race

// --- DM thread find-or-create (relocated from direct-thread.ts) ---
export function findOrCreateDirectThread(exec, senderId, recipientId, now, recipientKind?): Promise<string>;
```

### 3c. `packages/server/src/services/user-store.ts` — owns `users` (WRITES — already built)

Existing (shipped) write surface — unchanged by this rework:

```ts
export function insertUser(exec: HyperIdleDb, values: NewUser): Promise<void>;
export function updateUser(exec: HyperIdleDb, id: string, patch: UserPatch): Promise<void>; // UserPatch admits SQL (cost coalesce)
export function getOrCreateUser(exec: HyperIdleDb, id: string, create: NewUser): Promise<User>; // read+write
export function resetAllUserCost(exec: HyperIdleDb): Promise<void>;
```

**New write helper (rework — closes the cost-cap raw-SQL SET, §5c).** `cost-cap.ts:240` currently
builds `sql\`coalesce(${users.costActual}, 0) + ${delta}\`` **in the caller** and passes it into
`updateUser`'s `UserPatch`. That splices `users.costActual` into a caller-side template → guard finding.
The coalesce moves **into** user-store as a dedicated write helper so the column ref lives only in the owner:

```ts
export function incrementUserCost(exec: HyperIdleDb, id: string, deltaMinor: number): Promise<void>;
// owns `set({ costActual: sql\`coalesce(${users.costActual}, 0) + ${deltaMinor}\` })`
```

### 3d. `conversation-store.ts` — READ functions (NEW, rework)

Shaped by the real read call sites (§5b/§5c), not an idealized query API. `Thread`/`Message` are the
existing `@hyperidle/db` row types.

**Projection rule (hard — see §8b#1).** A projected store function returns **exactly the column set its
call site's current response already includes — no more, no less.** *No more* is the real value: it stops a
shared full-row getter, reused by some future caller, from silently widening what a response exposes.
*No less* preserves behavior (AC-2). Full-row getters (`getThreadById`, `getMessageById`, …) return the
complete row and are used by internal/logic callers **and** by any route whose current response already
IS the full row. Where a route today narrows a full-row select in JS before responding, that narrowed
shape becomes a projected store function so the column list lives in one reviewed place — callers stop
hand-narrowing at the edge, but the projected set is whatever that route returns **today**, sensitive
columns included where the route legitimately returns them (see §8b#1).

```ts
// --- threads: single-row + id-batch lookups (internal/logic reads) ---
export function getThreadById(exec: HyperIdleDb, id: string): Promise<Thread | undefined>;
export function getThreadsByIds(exec: HyperIdleDb, ids: string[]): Promise<Thread[]>;      // inArray(threads.id)
export function getThreadByDirectKey(exec: HyperIdleDb, directKey: string): Promise<Thread | undefined>; // 2 sites

// --- threads: host-scoped + list ---
export function getThreadIdsByHost(exec: HyperIdleDb, hostKind: string, hostId: string): Promise<string[]>; // decompose helper (§5b, builtin-routine-handlers)
export function listThreadsByHost(exec: HyperIdleDb, hostKind: string, hostId: string): Promise<Thread[]>;
export function listThreads(exec: HyperIdleDb, filter: ThreadListFilter): Promise<Thread[]>;
//   ThreadListFilter carries the real route knobs: { pinned?, hostKind?, hostId?, order: "lastActiveAt"|"createdAt",
//   dir: "asc"|"desc", limit?, offset? }. routes/threads.ts (25 reads, the densest file) decomposes into
//   listThreads + a small number of BESPOKE functions for its filter/ordering/pagination variants — one
//   store function per real shape, NO bypass (§8b ordering caveat is load-bearing here).
export function listThreadsByParticipant(exec: HyperIdleDb, participantProbe: string, limit: number): Promise<Thread[]>;
//   owns `where(sql\`${threads.participants} LIKE …\`).orderBy(desc(lastActiveAt), desc(id)).limit()` — closes
//   threads.ts:686 + users.ts inbox participant probe. Caller keeps its JS re-verify of participant membership.

// --- messages: single-row + thread-scoped list ---
export function getMessageById(exec: HyperIdleDb, id: string): Promise<Message | undefined>;              // 6 sites
export function listMessagesByThread(exec: HyperIdleDb, threadId: string, opts?: MessageListOpts): Promise<Message[]>;
//   opts = { type?, order?: "createdAt", dir?, limit?, offset? }. 7 by-threadId sites, MUST preserve the
//   existing orderBy(messages.createdAt) exactly — a dropped/flipped order reorders a conversation.
export function getMessageByLegacyItemId(exec: HyperIdleDb, legacyItemId: string): Promise<Message | undefined>; // 2 sites
export function getMessagesByThreadIds(exec: HyperIdleDb, threadIds: string[], opts?: MessageListOpts): Promise<Message[]>; // inArray; opts.includeDeleted=false owns `deletedAt IS NULL` (search.ts:205)
export function listUnresolvedReviewThreadIds(exec: HyperIdleDb, threadIds: string[]): Promise<string[]>;
//   owns `where(type IN ('review','questionnaire') AND ${messages.resolvedAt} IS NULL)` returning the threadId set —
//   closes threads.ts:710.

// --- PROJECTED, response-bound joins/searches (both tables conv-owned) — return exactly caller-safe columns ---
export function listInboxMessagesForRecipient(exec, recipientId, limit, offset): Promise<InboxRow[]>; // read-inbox.ts:28, users.ts:367/368
export function searchConversations(exec, participantPattern, messagePattern, limit): Promise<ThreadSearchRow[]>;
//   owns search.ts:137/141-145 threads⋈messages join incl. the participant LIKE + payload ILIKE + deletedAt WHERE;
//   returns the projected { id, hostKind, lastActiveAt, participants } rows the route JS-filters. NO full-row leak.
export function countInboxByRecipient(exec, recipientId): Promise<number>; // approval-rate.ts:81 aggregate

// --- Artifact-thread summaries (bets.ts decompose — §5b Finding 3): reads ONLY threads+messages, keyed by artifactIds ---
export function getArtifactThreadSummaries(exec, artifactIds: string[]): Promise<ArtifactThreadSummary[]>;
//   { artifactId, threadId, messageCount, lastMessageAt, lastMessagePayload, hasUnresolvedReview } — filters
//   threads.hostKind='artifact' AND threads.hostId IN artifactIds (plain string ids; NO artifacts/tasks read).
```

### 3e. `user-store.ts` — READ functions (NEW, rework)

Dominant pattern is by-id lookup (64 of 94 `users` reads). `User` is the existing row type.

**Same projection rule as §3d** (exact current response column set — no more, no less). Full-row getters
serve internal/logic callers **and** the user routes that already return the full row today
(`routes/users.ts` GET `/:id` → `c.json({...user, skills})`, POST `/` → `c.json({ user: created })`,
PATCH `/:id` → `c.json(updated)` — all three return the whole `users` row **including `email`**, verified
against current code). Those routes keep using `getUserById`; that is behavior-preserving because the full
row IS their current response. A projected function is added only where a route narrows the row in JS
today — and it returns **exactly** that narrowed set, sensitive columns included where the route returns
them now.

```ts
// --- full-row getters — INTERNAL / TRUSTED callers only (services, logic, tests) ---
export function getUserById(exec: HyperIdleDb, id: string): Promise<User | undefined>;           // ~64 sites
export function getUsersByIds(exec: HyperIdleDb, ids: string[]): Promise<User[]>;                // inArray(users.id); closes teams-routes.ts:967 users.id IN (…)
export function listUsersByTeam(exec: HyperIdleDb, teamId: string): Promise<User[]>;             // 7 + inArray(teamId)
export function listUsersByKind(exec: HyperIdleDb, kind: string): Promise<User[]>;               // 14 kind filters
export function listUsersByTeamAndKind(exec: HyperIdleDb, teamId: string, kind: string): Promise<User[]>;
export function listUsersByStatus(exec: HyperIdleDb, status: string): Promise<User[]>;
export function searchUsersByName(exec: HyperIdleDb, query: string): Promise<User[]>;            // owns recipients.ts:49 LOWER(${users.name}) LIKE …; builds the LIKE internally

// --- PROJECTED, response-bound reads — column set == the route's CURRENT response, no more/no less ---
export function listAgentProfiles(exec): Promise<AgentProfileRow[]>; // routes/agents.ts GET / (agent list)
//   Returns EXACTLY the columns agents.ts:237-250 returns today (verified): id, name, role, agentCategory,
//   systemPrompt, harnessType, modelTierPreference, modelId, modelProvider, maxConcurrentSessions, status —
//   with the route's WHERE (kind='ai' AND role!='system' AND status!='retired'). systemPrompt IS INCLUDED:
//   the route legitimately returns it today, so excluding it would break AC-2. activeSessions is NOT a users
//   column — the route keeps joining it from `sessions` and merges in JS.
export function listTeamMembersSummary(exec, teamId): Promise<UserSummary[]>; // routes/teams-routes.ts roster (GET /:id)
//   Returns EXACTLY the roster's current columns (verified teams-routes.ts:771-777): id, name, role,
//   agentCategory. email/systemPrompt/costActual are absent because the roster response does NOT include
//   them today (the `costActual` elsewhere in that route is a ROUTINE cost, not a users column) — this is
//   behavior-preserving, not stripping.
//   The builder adds one projected variant per route that narrows a users row in JS; each returns exactly
//   that route's current column set, reviewed in one place. §8b#1 makes this mandatory, not per-site discretion.

// --- aggregates that a full-row getter CANNOT replace — dedicated functions returning the scalar ---
export function sumAllUserCost(exec: HyperIdleDb): Promise<number>;                              // closes cost-cap.ts:363 sum(users.costActual)
export function countUsersByTeam(exec: HyperIdleDb, teamId: string): Promise<number>;            // where a users count() read exists
```

**Function-set discipline.** Where several call sites share a select shape, they collapse to one
function above. Where a read is genuinely bespoke (a one-off filter/join/aggregate used at a single
site) the builder still adds a dedicated store function for it — **no bypass is permitted under the
hard requirement, even for a single caller.** The lists above are the consolidations the audit already
justifies; the builder adds the residual bespoke functions as it walks §5b/§5c and names each in the
store with a one-line `@lore` pointing at its sole caller.

## 4. Guard mechanism — EXTENDED to full-access (AC-3)

`scripts/au12-conversation-users-ownership-guard.ts` (already built as a write-expression guard) is
**extended from write-scoped to full-access-scoped.** It already builds, per file, the set of
**table-object references** that resolve to a value import of `threads`/`messages`/`users` from
`@hyperidle/db` — both the **bare-identifier** form (`import { threads }` → `threads`) and the
**namespace-member** form (`import * as schema from "@hyperidle/db"` → `schema.threads`). The AST
plumbing (`collectReferences`, `argIsOwnedTable`, the `--fixtures` self-test, `--check`, the
`EXEMPT_FILES` owner set) is reused verbatim.

**Extension.** Today the guard flags only a `CallExpression` whose callee is `insert`/`update`/`delete`
and whose first argument is an owned-table reference. **The full-access guard flags ANY reference to an
owned table object** — i.e. any `Identifier` node in `tableIdents`, and any
`PropertyAccessExpression` `ns.threads` where `ns ∈ namespaceBindings` and the member ∈
`{threads, messages, users}` — anywhere in a non-exempt production file. This subsumes the write guard
(an `insert(threads)` argument is such a reference) and additionally catches `select().from(threads)`,
`.leftJoin(threads, …)`, `.innerJoin(users, …)`, every `eq(users.id, …)` / `threads.id` column
reference in a `where`/`orderBy`, **and every `${threads.participants}` / `${messages.payload}` /
`${users.id}` interpolation inside a `sql\`\`` tagged template** — a template substitution is an ordinary
Identifier/PropertyAccess node in the AST, so the same node-walk catches all 15 §5c sites. Implementation:
replace the `isCallExpression && WRITE_METHODS` gate with a walk that, for each file with a non-empty
reference set, visits every node and reports each owned-table `Identifier` / namespace-member access
(dedupe by line). Finding message becomes generic:
`"direct reference to an owned table (threads/messages/users) — route through conversation-store/user-store (AU12)"`.

**False-positive guardrails to preserve.**
- Resolve to the **import**, not the string name (a local `const threads = …` is not flagged — keep
  fixture (f), and see the new shadow fixture (m) below).
- **Type-only references stay legal.** Callers use the row *types* `Thread`/`Message`/`User` and
  `NewThread`/`NewUser`, which are **separate type exports**, not the table objects — the guard already
  only binds `tableIdents` from *value* imports of the table names, so `type Thread` is untouched.
  Verify no call site does `typeof users` / `users.$inferSelect` (audit: none found).
- Skip references **inside an `ImportDeclaration`** node itself (the owner-file re-export edge does not
  apply here; non-owner files must not import the table at all under the new rule, so the import line is
  itself a legitimate finding — but report it once, at the reference, not doubled).

**`--fixtures` self-test — ADD read + raw-sql + shadow cases** to the existing set:
- (h) `db.select().from(threads)` in a route → **now a finding** (was explicitly NO-finding in the
  write-only guard; fixture (e) flips).
- (i) `eq(users.id, x)` column reference in a `where` → finding.
- (j) `.innerJoin(messages, …)` → finding.
- (k) same reads inside `conversation-store.ts`/`user-store.ts` → NO finding (exempt owners).
- (l) `import type { User } from "@hyperidle/db"` used as a type annotation → NO finding.
- **(m) SHADOW NAME (new, Minor fix):** a file that does NOT value-import an owned table but declares a
  local `const users = [...]` / `const threads = …` and references it → **NO finding**. Proves the guard
  binds on the actual `@hyperidle/db` value import, not the identifier string. (No live file both imports
  an owned table and shadows the name today; this fixture pins the intended resolution so a future
  refactor can't silently regress it.)
- **(n) RAW-SQL (new, BLOCKER fix):** `sql\`${threads.participants} LIKE ${p}\`` referencing an
  import-bound owned column inside a tagged template → **finding**. Guards the §5c class explicitly.
Keep (g) namespace bypass and (f) local-shadow. **Note: fixture (e) in the shipped guard asserts reads
are NOT flagged — this rework INVERTS that assertion; update it, don't add a contradictory case.**

**CLI invocation confirmed (Minor fix).** `au13-work-routine-ownership-guard.ts` is wired in `lint`
with a **bare** invocation (no `--check` flag). Confirmed by reading its CLI entry (lines 169-179): the
non-`--fixtures` branch runs `inspect(process.cwd())`, prints each finding to stderr, and calls
`process.exit(1)` when `findings.length > 0` — i.e. it is **check-and-exit-nonzero by default**, so a
violation fails `npm run lint` even without a flag. The `au12` guard's `--check` flag is therefore
belt-and-suspenders, not required for enforcement; both guards fail the lane on a real finding. No
silent no-op on either line.

Wire is unchanged (au12 guard runs in `package.json` `lint` after the au11 guard, before the au13 guard). A
green run (zero findings) is the AC proof within `packages/server/src` production scope.

## 5. Write call-site migration table (AC-1) — ALREADY LANDED IN PR #435

The full write-migration table (16 thread inserts · 12 thread updates · 14 message inserts · 2 message
updates · 6 user inserts · 9 user updates ≈ **59 write sites / 22 files**) is **already applied and
survives the rebase.** It is retained verbatim below for completeness and for AU8's later
`TABLE_OWNER` map; the rework does not re-touch these writes.

Executor column: `db` = pass `db`; `tx` = pass **`tx as HyperIdleDb`**; `ctx.db` = pass `ctx.db`.

### threads (insert)
| File:line | New | Exec |
|---|---|---|
| routes/coach.ts:189 | `insertThread(db, v)` | db |
| routes/users.ts | `insertThread(db, v)` | db |
| routes/assistant.ts | `insertThread(db, v)` | db |
| routes/teams-routes.ts | `insertThread(db, v)` | db |
| routes/threads.ts | `insertThread(tx as HyperIdleDb, v)` | tx |
| services/review-item-factory.ts | `insertThread(db, v)` | db |
| services/session-review-creator.ts | `insertThread(db, v)` | db |
| services/lifecycle-propagation.ts | `insertThread(db, v)` | db |
| services/routine-scheduler.ts | `insertThread(db, v)` | db |
| services/handoff-protocol.ts (×2) | `insertThread(tx as HyperIdleDb, v)` | tx |
| services/builtin-routine-handlers.ts (×2) | `insertThread(tx as HyperIdleDb, v)` | tx |
| services/direct-thread.ts | folded into conversation-store (`findOrCreateDirectThread`) | — |
| tools/submit-review.ts, tools/create-item.ts | `insertThread(ctx.db, v)` | ctx.db |

### threads (update) · messages (insert/update) · users (insert/update)
Retained as originally specified — `updateThread` / `insertMessage` / `updateMessage` /
`resolveMessageIfUnresolved` / `insertUser` / `updateUser` / `getOrCreateUser` / `resetAllUserCost`,
across `routes/{threads,users,assistant,teams-routes,agents}`, `services/{policy-engine,
agent-work-assistant,handoff-protocol,lifecycle-propagation,cost-cap,assistant-dispatcher,
session-review-creator}`, `tools/{send-message,submit-review,create-item}`, `scaffold-agents`,
`invite-code`. (Full per-line table preserved in git history of this file pre-rework; unchanged by the
rework — the writes are done.)

## 5b. Read call-site migration (AC-1, rework — THE NEW WORK)

Audit of remaining direct query-builder reads in `packages/server/src` production code (excludes tests):
**~148 read operations = 142 `.from(threads|messages|users)` SELECT roots + 6 joins**, across ~50
files. Per table: **users 94 · threads 29 · messages 19.** (The 15 raw-`sql` references are additional —
§5c.) Dominant shapes drive §3d/§3e; the long tail gets bespoke store functions. Densest files (must be
migrated with the most care):

| File | reads | notes |
|---|---|---|
| routes/threads.ts | 25 | thread-list route: pagination, ordering, pinned filter, participant/message joins — needs `listThreads` + `listThreadsByParticipant` + several bespoke functions; **ordering/limit must be preserved exactly (§8b)** |
| routes/users.ts | 11 | user CRUD + a message⋈thread inbox join (line 367/368) |
| routes/teams-routes.ts | 11 | user rosters by team/kind → projected `listTeamMembersSummary` for responses |
| routes/assistant.ts | 11 | assistant user + thread lookups |
| routes/conversations.ts | 6 | thread + message reads |
| routes/agents.ts | 5 | agent (user-kind) reads → projected getter for responses |
| services/{cost-cap, agent-work-intent-worker} | 4 each | user cost + agent-work reads (cost-cap reads are in-transaction with its writes — §8b) |
| + ~44 more files | 1–3 each | mostly `getUserById` / `getThreadById` / `listMessagesByThread` |

**6 query-builder join sites** (`.from(root).innerJoin(owned, …)`):
- `messages ⋈ threads` (both conversation-owned): `approval-rate.ts:81`, `tools/read-inbox.ts:28`,
  `routes/search.ts:137`, `routes/users.ts:367` → clean purpose-built functions **inside**
  conversation-store (`listInboxMessagesForRecipient` / `searchConversations` / `countInboxByRecipient`,
  §3d). Both tables are conv-owned, so no cross-owner coupling.
- **`items ⋈ threads`** (`builtin-routine-handlers.ts:346`) and **`artifacts ⋈ threads`/`messages`**
  (`bets.ts:1210-1238`) → these are the only reads that touch a Work-domain table. **Decision: DECOMPOSE
  (Finding 3, not a cross-owner relocation).** See §8b#4. conversation-store owns ONLY its threads/messages
  half, keyed by plain-string ids the caller passes in; the Work-domain code keeps its `items`/`tasks`/
  `artifacts` reads and merges the two result sets in JS. **No conversation-store function reads a
  Work-domain table** — zero new cross-owner coupling.

**Migration order (read pass).** After §3d/§3e functions + tests exist and the guard is extended (but
run the guard LAST): migrate the by-id / single-shape reads first (mechanical: `getUserById`,
`getThreadById`, `listMessagesByThread` cover the bulk), then the projection/aggregate/join sites
(§8b) and the raw-sql sites (§5c), then routes/threads.ts (densest) last. Run the affected route/service
integration tests after each file. Guard green = zero remaining direct reads/writes/`sql`-refs in scope.

## 5c. Raw-`sql\`\`` owned-column reference migration (AC-1, rework — round-1 BLOCKER fix)

Re-audit of `sql\`\`` tagged templates that splice an owned column/table object (`threads.*` /
`messages.*` / `users.*` / bare `${threads|messages|users}`) into a fragment of a larger, often
non-owned-rooted query. **15 references across 7 files** — the extended guard's node-walk flags every one
(they are import-bound Identifier/PropertyAccess nodes). Each has a concrete home below; **no
improvisation, no whole-search/roster query dragged into a store.**

| # | File:line | What it does | Disposition |
|---|---|---|---|
| 1 | `services/cost-cap.ts:240` | `updateUser` SET `costActual: sql\`coalesce(${users.costActual},0)+delta\`` — caller-built write fragment | **(a) relocate.** Replace with `incrementUserCost(db, agentId, deltaMinor)` (§3c) — coalesce lives in user-store; cost-cap references no owned column. |
| 2 | `services/cost-cap.ts:363` | `.select({ total: sql\`coalesce(sum(${users.costActual}),0)\` }).from(users)` aggregate read | **(a) relocate.** `sumAllUserCost(db)` (§3e) returns the scalar; cost-cap keeps its `factorySettings` upsert. |
| 3 | `routes/recipients.ts:49` | `.from(users).where(sql\`LOWER(${users.name}) LIKE …\`)` recipient name search | **(a) relocate.** `searchUsersByName(db, q)` (§3e) owns the `LOWER(name) LIKE` + escape; caller keeps its post-query kind filter. |
| 4 | `routes/teams-routes.ts:967` | `.from(users).where(sql\`${users.id} IN (${sql.join(ownerIds)})\`)` | **(a) relocate — no new fn.** This is exactly `getUsersByIds(db, ownerIds)` (§3e). Caller builds `ownerMap` from the result. |
| 5 | `routes/users.ts:368` | inbox: `.from(messages).innerJoin(threads).where(sql\`${threads.participants} LIKE …\`).orderBy(desc(messages.createdAt)).limit/offset` | **(a) relocate.** `listInboxMessagesForRecipient(db, userId, limit, offset)` (§3d, projected). Caller keeps JS re-verify of participant membership. |
| 6 | `routes/search.ts:141,143,145` | threads⋈messages join WHERE: `${threads.participants} LIKE`, `${messages.payload} ILIKE`, `${messages.deletedAt} IS NULL`, `orderBy(desc(lastActiveAt), threads.id).limit()` | **(a) relocate.** `searchConversations(db, participantPattern, messagePattern, limit)` (§3d) owns the whole join incl. these fragments; returns the projected `{id,hostKind,lastActiveAt,participants}` rows the route JS-filters. |
| 7 | `routes/search.ts:205` | `.from(messages).where(and(inArray(threadId,…), sql\`${messages.deletedAt} IS NULL\`)).orderBy(createdAt)` batch | **(a) relocate.** `getMessagesByThreadIds(db, ids, { includeDeleted: false, order: "createdAt" })` (§3d) owns the `deletedAt IS NULL` fragment. |
| 8 | `routes/threads.ts:686` | `.from(threads).where(sql\`${threads.participants} LIKE ${probe}\`).orderBy(desc(lastActiveAt), desc(id)).limit()` | **(a) relocate.** `listThreadsByParticipant(db, probe, limit)` (§3d). Caller keeps JS membership re-verify. |
| 9 | `routes/threads.ts:710` | `.from(messages).where(and(inArray(threadId,…), inArray(type,[review,questionnaire]), sql\`${messages.resolvedAt} IS NULL\`))` | **(a) relocate.** `listUnresolvedReviewThreadIds(db, threadIds)` (§3d) owns the type + `resolvedAt IS NULL` predicate, returns the threadId set. |
| 10 | `routes/bets.ts:1218,1223,1228,1232` | artifacts-thread summaries: `.from(artifacts).innerJoin(tasks).leftJoin(threads).select({… 4 correlated subqueries on ${messages} …})` — touches artifacts+tasks (Work) + threads+messages (Conversation) | **(a) decompose (Finding 3).** bets.ts keeps its artifacts⋈tasks query → `artifactIds`; `getArtifactThreadSummaries(db, artifactIds)` (§3d) does the threads(hostKind='artifact', hostId IN artifactIds) + messages correlated subqueries, reading ONLY threads+messages; bets.ts merges per-artifact summaries in JS. No owned-table ref remains in bets.ts; no Work-table ref in conversation-store. |

**Disposition summary:** 9 of 10 sites are clean (a)-relocations into an owning-store function; the
10th (bets.ts) decomposes so neither side crosses the ownership line. **Zero SQL-fragment-returning
helpers were needed** — every fragment fit inside a store function that owns its whole query or a
plain-string-keyed slice of it. This is stronger than the fragment-builder fallback the critique
offered: no owned column ever leaves a store, even as an `SQL` object.

## 5a. Out-of-server production ACCESS — named exceptions (reads + writes)

The guard's enforceable scope is `packages/server/src`. Production **reads and writes** to these tables
also exist outside that scope; each stays a named exception (unchanged from the write pass — reads
there are equally out of scope, do not touch them):

| Site | Access | Disposition |
|---|---|---|
| `packages/db/src/factory-bootstrap.ts` | users | **BOUNDARY EXCEPTION.** `packages/db` sits below `packages/server` — cannot import the stores upward. AU8 allowlists. |
| `packages/db/src/demo-fixture.ts` | users | **EXCEPTION.** Same lower layer; demo seeding under its own guard. |
| `packages/eval/src/seeding.ts` | users/threads/messages | **EXCEPTION (deliberate).** Benchmark fixture seeding — same category as test fixtures. Not on any production request/agent path. AU8 allowlists `eval/**`. |
| `packages/web/scripts/ah6-test-server.ts` | users | **EXCEPTION.** Dev/test harness script. |

## 6. Ordered task list (rework)

1. **(DONE by planner) Rebase** onto `origin/main`; resolve import-block conflicts (§0); `npm ci`.
2. **Add read functions** to `conversation-store.ts` (§3d) + `user-store.ts` (§3e), plus `incrementUserCost`
   (§3c). `npm run check` green (no callers migrated yet). Carry the `exec: HyperIdleDb` convention.
3. **Red→green read tests** (`*.integration.test.ts`, `{ db }` fixture): `getThreadById`/`getUserById`
   return the seeded row and `undefined` when absent; `listMessagesByThread` returns messages in
   `createdAt` order (order-sensitive assertion); `listUsersByTeam`/`listUsersByKind` filter correctly;
   `getUsersByIds` preserves the `inArray` set; a read passed a `tx` (`tx as HyperIdleDb`) sees
   uncommitted writes from the same transaction (in-tx read proof, §8b); each projected/join function
   returns exactly its call site's CURRENT response column set (assert projected shape == current response
   shape — e.g. `listAgentProfiles` INCLUDES `systemPrompt`, matching agents.ts today; NOT "sensitive
   absent"); `searchConversations`
   preserves the over-fetch order; `getArtifactThreadSummaries` reproduces the 4 correlated aggregates;
   `incrementUserCost`/`sumAllUserCost` match the coalesce/sum semantics.
4. **Migrate the bulk single-shape reads** (getUserById / getThreadById / listMessagesByThread across
   the ~44 light files). Run affected integration tests per file.
5. **Migrate projection / aggregate / join / in-transaction reads** (§8b) — every response-bound read
   goes through a projected store function per the §8b#1 hard rule (no caller-side re-narrowing of a
   full sensitive row). Migrate the 6 query-builder joins + the 15 raw-`sql` sites (§5c) + the aggregates.
   Preserve every column set, order, limit, and transaction scope.
6. **Migrate routes/threads.ts last** (25 reads — densest; pagination/ordering/pinned + §5c #8/#9).
7. **Extend the guard** to full-access (§4), invert fixture (e)→(h), add (i)–(n) incl. shadow (m) +
   raw-sql (n). Run `--fixtures` then the bare guard → PASS.
8. **Full gate:** `npm run check` + `npm run lint` + `npm run test` + `npm run test:integration:service`
   green. The pre-existing thread/message/user/roster/agent route + agent-work + cost-cap tests passing
   **unchanged** is the behavior-preservation proof.

No half-broken state: read functions exist before any caller migrates (step 2 before 4–6); each read
swap is behavior-identical and independently compiles; the guard extension lands LAST, after every
read is already routed (running the guard earlier would flag the not-yet-migrated reads — that is
expected, not a regression).

## 7. Acceptance criteria → verification

| AC | Verification |
|---|---|
| AC-1 every writer AND reader calls one owning function | Write table §5 (landed) + read migration §5b + raw-sql migration §5c fully applied; guard finds zero remaining direct references in `packages/server/src`; §5a names every out-of-scope access |
| AC-2 all observable behavior unchanged | Existing threads/users/conversations/teams/agents route + agent-work + cost-cap + roster integration tests pass **unchanged** (`npm run test` + `test:integration:service`). §8b risk sites each covered by a passing pre-existing test or a new order/projection/aggregate assertion |
| AC-3 a bypass fails a check | `au12-…-guard.ts --fixtures` asserts a direct `select().from`/`join`/column reference AND a `sql\`\`` interpolation on these tables — bare-identifier **and** namespace forms — is flagged; type-only + shadow-name refs are NOT; guard wired into `npm run lint` (fails lane on any finding, confirmed check-by-default) |
| AC-4 zero remaining direct access | `npm run lint` green (guard PASS) proves zero reads+writes+`sql`-refs in `packages/server/src`; §5a accounts for every access outside that scope as a named exception |

## 8. Flagged findings (do NOT silently absorb)

**§7a — AU13 + AU14 have MERGED (was: overlap warning; now historical).** AU13 (`items`/routines
writes, PR #436) and AU14 (knowledge write path, PR #434/#437) are on `origin/main`. The former
`builtin-routine-handlers.ts:381/463` `threads`⋈`items` co-located-transaction overlap resolved
cleanly at rebase: AU12 owns the `threads` inserts (via `insertThread(tx as HyperIdleDb, …)`), AU13
owns the sibling `items` write (via `work.createItem`), both sharing the same `tx` — the orthogonal
migrations 3-way-merged with only import-block conflicts (§0). No double-refactor. The shared-executor
design (§3a) is what made the two-owner transaction clean. `handoff-protocol.ts` / `review-item-factory.ts`
likewise now carry BOTH main's `work.*` write routing and AU12's `conversation-store` routing.

**§7b — `users.costActual` is metering, not identity/config.** `cost-cap.ts` updates AND reads
`users.costActual` (agent-owned). In scope by AC-4 — reads route via `getUserById` / `sumAllUserCost`,
writes via `incrementUserCost` / `updateUser` / `resetAllUserCost`. Note only: do not expand AU12 to
move the metering *logic*, only route the raw access. **Its reads sit inside the same transaction as its
writes — preserve the tx scope (§8b).**

**§7c — CORRECTED: guard is FULL-ACCESS-scoped, reads AND writes (was: write-scoped, reads direct).**
The original plan interpreted the constraint narrowly (write-only) on two grounds: AC-4's literal
wording said "direct-table-**write** call sites," and a full read-ban touches ~40+ (actually ~163)
existing access sites in what was scoped as a small no-behavior-change refactor. That interpretation was
reviewed + APPROVED (architecture-critique round 2) and shipped in PR #435. **The founder has ruled it
wrong.** The Contracts/constraints line — *"the owning service's functions are the only code … permitted
to import the Drizzle table objects for threads/messages/users"* — is now read **as written**:
`conversation-store.ts` / `user-store.ts` are the ONLY code path to these tables, reads included. The
guard is extended to full-access (§4); every read is migrated (§3d/§3e/§5b/§5c). This section supersedes
the original write-only §7c. **Reviewer: this is the founder-mandated interpretation, not a proposal —
evaluate execution completeness (are all ~148 query reads + 15 raw-sql refs routed? does the guard catch
column-refs, joins, and `sql\`\`` interpolations? is behavior preserved at the projection + join + in-tx
sites?), not whether write-only would have sufficed.**

**§7d — Event ownership still deferred.** conversation-store owns row read+write only; callers keep
emitting events. Unchanged by the rework.

**§8a — SCOPE GROWTH: Settings and Notification have the identical raw-access pattern — do NOT fold
into AU12.** `serverConfig`/`factorySettings` (~14 write sites + reads across 8 files) and
`notificationQueue` (~15 write sites + reads across 5 files) are the same structural violation and each
warrants its own owning-service WP. **Not in AU12.** The full read-ownership rework must NOT opportunistically
absorb these — same discipline as the write pass.

**§8b — BEHAVIOR-PRESERVATION RISK (the load-bearing risk of the read pass — 163 sites, honestly
assessed).** The write pass was mechanical (values in → row written). Reads are riskier. Genuine risks,
flagged rather than assumed safe:

1. **Column projection → ACCIDENTAL new exposure (HIGHEST risk).** Call sites do
   `select({ id: users.id, name: users.name }).from(users)` — narrowed column sets, not full rows, and
   some flow into HTTP/tool responses (routes/users, routes/teams-routes, routes/agents, tools/read-inbox).
   **RESOLVED AS A HARD RULE, not a per-site audit — but the rule is behavior-preserving, not security
   stripping.** *A projected store function returns EXACTLY the column set its route's response includes
   TODAY — no more, no less.* **No more** is the real protection: it stops a shared full-row getter, reused
   by a future caller, from silently leaking a column that route never meant to expose. **No less** is AC-2:
   where a route legitimately returns a sensitive column today, its projected function keeps returning it.
   Verified against current code: `routes/agents.ts` GET `/` returns `systemPrompt` (agents.ts:242) → its
   projected `listAgentProfiles` **includes** `systemPrompt`; `routes/users.ts` GET/POST/PATCH return the
   **full** `users` row via `c.json(fullRow)` incl. `email` → they keep using the full-row `getUserById`
   (the full row IS their current response); the teams roster returns only id/name/role/agentCategory
   (teams-routes.ts:771-777) → `listTeamMembersSummary` returns exactly those. Full-row getters
   (`getUserById`, `getThreadById`, …) serve internal/logic callers **and** routes whose current response is
   already the full row; they must simply never be reused to WIDEN a response that today is narrower. The
   read tests (step 3) assert **projected shape == current response shape** (not "sensitive absent").
   **Explicitly out of scope:** whether a route SHOULD stop returning `systemPrompt`/`email` publicly is a
   separate security/product decision (ETHOS: security is earned, never preemptive) — a future WP, not AU12's
   call. AU12 preserves today's exposure exactly.
2. **Ordering / limit / pagination (routes/threads.ts, listMessagesByThread — order-sensitive).** A
   consolidated `listMessagesByThread` that drops the existing `orderBy(messages.createdAt)` would
   silently reorder a conversation; the thread-list route's `orderBy(threads.lastActiveAt desc).limit()`
   pagination and search's `desc(lastActiveAt), threads.id` over-fetch order must be reproduced exactly.
   **Preserve order/limit/offset in every list function; assert order in the read tests (step 3).**
3. **In-transaction reads (4 sites, e.g. cost-cap read-modify-write).** A read that currently runs
   inside `db.transaction` for consistency (read current cost → compute → write) MUST keep running in
   the same tx. The `exec`-first-arg design preserves this **iff** the caller passes `tx as HyperIdleDb`
   into the read function (not `db`). **Risk if the builder passes `db` instead of `tx`:** the read would
   escape the transaction snapshot and could read stale/committed-elsewhere data mid-transaction. Test:
   read-in-tx sees the same tx's uncommitted write (step 3). Do not hoist reads out of their tx.
4. **Cross-owner reads — RESOLVED BY DECOMPOSITION, no coupling introduced (was: 2 accepted cross-owner
   joins).** The only reads touching a Work-domain table are `items⋈threads`
   (`builtin-routine-handlers.ts:346`) and the `bets.ts:1210-1238` artifacts-thread summary (which
   actually touches **four** tables — `artifacts`+`tasks` Work, `threads`+`messages` Conversation, via a
   `leftJoin(threads)` + 4 correlated `${messages}` subqueries). **Decision: decompose, do not relocate a
   Work query into conversation-store.** conversation-store exposes functions that read ONLY its own
   tables, keyed by plain-string ids the caller passes in — `getThreadIdsByHost(hostKind, hostId)` for the
   builtin-routine-handlers existence check, and `getArtifactThreadSummaries(artifactIds)` for bets.ts
   (filters `threads.hostKind='artifact' AND threads.hostId IN artifactIds` — `hostId` is a plain string
   column, no `artifacts` join needed). The Work-domain code keeps its `items`/`tasks`/`artifacts` reads
   (legal — AU13's guard is write-scoped) and merges the two result sets in JS. **Result: zero
   conversation-store function reads a Work-domain table; zero Work file references an owned table.** This
   is a strictly better outcome than accepting the reverse-ownership coupling the earlier draft proposed;
   no `@lore` cross-boundary exception is needed. **Note for AU17 (package split):** AU13 (merged) has
   established `tasks`/`artifacts` as Work-service-owned for writes; this decomposition keeps the read
   boundary aligned with that write boundary, so AU17 sees a clean Conversation/Work split with no
   cross-domain read to untangle.
5. **`getMessageByLegacyItemId` / `getThreadByDirectKey` bespoke lookups.** Low volume but genuinely
   bespoke — one store function each, no bypass.

## 9. Out of scope

Knowledge / Work / Routine domains (AU13/AU14 — merged); Settings/Notification (§8a); event ownership
(§7d); the package split (AU17); the routine-scheduler fire-time edge (AU15); migration of the §5a
out-of-server access (bootstrap/eval/dev-script — named exceptions, allowlisted by AU8). No schema
changes, no UI. Do not move cost-metering *logic* (§7b) — only route its raw access.
