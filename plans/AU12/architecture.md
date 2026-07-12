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
3. **Migrates every remaining direct read call site** in `packages/server/src` (§5b).
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
scope), ~148 direct READ operations** (`.from(threads|messages|users)` + joins) across ~50 files read
those same tables with no shared function. AU8's should-graph guard cannot be built until there is one
owning module per domain to check against. AU12 creates two owning modules and routes every write
**and every read** through them, changing nothing the product does.

**This plan supersedes the WP narrative's call-site count.** The WP text names ~8 files; the real
audit finds **22 files / ~59 write sites** (§5) **and ~50 files / ~148 read sites** (§5b) in
`packages/server/src`. The AC ("the owning service's functions are the only code … permitted to
import the Drizzle table objects") is now read **as written** — reads AND writes (see the §0 banner and
§7c). Production access to these tables that lives **outside** `packages/server/src`
(bootstrap/seed/fixture code) is triaged as named exceptions in §5a — reads there are equally out of
scope.

## 2. Constraints (from the WP)

- **No product behavior may change.** Ownership consolidation only. **This is the load-bearing risk of
  the read pass** — 148 read sites, many with narrowed column projections, ordering, pagination, joins,
  and in-transaction reads that must be preserved exactly (§8b).
- The two owning files (plus their own tests) are the only code permitted to **read or write** these
  tables. **Interpretation (CORRECTED, §7c): the guard is FULL-ACCESS-scoped — any reference to an owned
  table object outside the owners is a finding.**
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
site. **Therefore every `tx`-scoped read/write in §5/§5b passes `getThreadById(tx as HyperIdleDb, id)` /
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

### 3d. `conversation-store.ts` — READ functions (NEW, rework)

Shaped by the real read call sites (§5b), not an idealized query API. `Thread`/`Message` are the
existing `@hyperidle/db` row types. **Every getter returns full rows** (`Thread`/`Message`); callers
re-narrow if they need a projection (see §8b for the API-leakage caveat).

```ts
// --- threads: single-row + id-batch lookups (29 read sites, 15 by-id) ---
export function getThreadById(exec: HyperIdleDb, id: string): Promise<Thread | undefined>;
export function getThreadsByIds(exec: HyperIdleDb, ids: string[]): Promise<Thread[]>;      // inArray(threads.id)
export function getThreadByDirectKey(exec: HyperIdleDb, directKey: string): Promise<Thread | undefined>; // 2 sites

// --- threads: host-scoped + list (thread-list route, agent inbox) ---
export function listThreadsByHost(exec: HyperIdleDb, hostKind: string, hostId: string): Promise<Thread[]>;
export function listThreads(exec: HyperIdleDb, filter: ThreadListFilter): Promise<Thread[]>;
//   ThreadListFilter carries the real route knobs: { pinned?, hostKind?, hostId?, order: "lastActiveAt"|"createdAt",
//   dir: "asc"|"desc", limit?, offset? }. routes/threads.ts (25 reads, the densest file) decomposes into
//   listThreads + a small number of BESPOKE functions for its filter/ordering/pagination variants — one
//   store function per real shape, NO bypass (§8b ordering caveat is load-bearing here).

// --- messages: single-row + thread-scoped list (19 read sites) ---
export function getMessageById(exec: HyperIdleDb, id: string): Promise<Message | undefined>;              // 6 sites
export function listMessagesByThread(exec: HyperIdleDb, threadId: string, opts?: MessageListOpts): Promise<Message[]>;
//   opts = { type?, order?: "createdAt", dir?, limit?, offset? }. 7 by-threadId sites, MUST preserve the
//   existing orderBy(messages.createdAt) exactly — a dropped/flipped order reorders a conversation.
export function getMessageByLegacyItemId(exec: HyperIdleDb, legacyItemId: string): Promise<Message | undefined>; // 2 sites
export function getMessagesByThreadIds(exec: HyperIdleDb, threadIds: string[]): Promise<Message[]>;       // inArray

// --- joins that stay INSIDE conversation-store (both tables are conv-owned): messages ⋈ threads (4 sites) ---
//   approval-rate.ts:81, tools/read-inbox.ts:28, routes/search.ts:137, routes/users.ts:367.
//   Each projects a slightly different column set → one purpose-built function per real join shape,
//   returning the exact projected shape the caller needs (do NOT collapse to full-row here — these feed
//   filtered/aggregated logic and, for read-inbox/users, API responses). e.g.
export function listInboxMessagesForRecipient(exec, recipientId, ...): Promise<InboxRow[]>;
```

### 3e. `user-store.ts` — READ functions (NEW, rework)

Dominant pattern is by-id lookup (64 of 94 `users` reads). `User` is the existing row type.

```ts
export function getUserById(exec: HyperIdleDb, id: string): Promise<User | undefined>;           // ~64 sites
export function getUsersByIds(exec: HyperIdleDb, ids: string[]): Promise<User[]>;                // inArray(users.id), 4 sites
export function listUsersByTeam(exec: HyperIdleDb, teamId: string): Promise<User[]>;             // 7 + inArray(teamId)
export function listUsersByKind(exec: HyperIdleDb, kind: string): Promise<User[]>;               // 14 kind filters
export function listUsersByTeamAndKind(exec: HyperIdleDb, teamId: string, kind: string): Promise<User[]>; // team+kind combos
export function listUsersByStatus(exec: HyperIdleDb, status: string): Promise<User[]>;           // status filters (few)
// aggregate reads (count/sql) that a full-row getter CANNOT replace — dedicated functions returning the scalar:
export function countUsersByTeam(exec: HyperIdleDb, teamId: string): Promise<number>;            // only where a users count() read exists
```

**Function-set discipline.** Where several call sites share a select shape, they collapse to one
function above. Where a read is genuinely bespoke (a one-off filter/join/aggregate used at a single
site) the builder still adds a dedicated store function for it — **no bypass is permitted under the
hard requirement, even for a single caller.** The lists above are the consolidations the audit already
justifies; the builder adds the residual bespoke functions as it walks §5b and names each in the store
with a one-line `@lore` pointing at its sole caller.

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
`.leftJoin(threads, …)`, `.innerJoin(users, …)`, and every `eq(users.id, …)` / `threads.id` column
reference in a `where`/`orderBy`. Implementation: replace the `isCallExpression && WRITE_METHODS`
gate with a walk that, for each file with a non-empty reference set, visits every node and reports each
owned-table `Identifier` / namespace-member access (dedupe by line). Finding message becomes generic:
`"direct reference to an owned table (threads/messages/users) — route through conversation-store/user-store (AU12)"`.

**False-positive guardrails to preserve.**
- Resolve to the **import**, not the string name (a local `const threads = …` is not flagged — keep
  fixture (f)).
- **Type-only references stay legal.** Callers use the row *types* `Thread`/`Message`/`User` and
  `NewThread`/`NewUser`, which are **separate type exports**, not the table objects — the guard already
  only binds `tableIdents` from *value* imports of the table names, so `type Thread` is untouched.
  Verify no call site does `typeof users` / `users.$inferSelect` (audit: none found).
- Skip references **inside an `ImportDeclaration`** node itself (the owner-file re-export edge does not
  apply here; non-owner files must not import the table at all under the new rule, so the import line is
  itself a legitimate finding — but report it once, at the reference, not doubled).

**`--fixtures` self-test — ADD read cases** to the existing set: (h) `db.select().from(threads)` in a
route → **now a finding** (was explicitly NO-finding in the write-only guard; fixture (e) flips); (i)
`eq(users.id, x)` column reference in a `where` → finding; (j) `.innerJoin(messages, …)` → finding;
(k) same reads inside `conversation-store.ts`/`user-store.ts` → NO finding (exempt owners); (l)
`import type { User } from "@hyperidle/db"` used as a type annotation → NO finding. Keep (g) namespace
bypass and (f) local-shadow. **Note: fixture (e) in the shipped guard asserts reads are NOT flagged —
this rework INVERTS that assertion; update it, don't add a contradictory case.**

Wire is unchanged (already in `package.json` `lint` after the au11 guard, before the au13 guard). A
green `--check` (zero findings) is the AC proof within `packages/server/src` production scope.

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

Audit of remaining direct reads in `packages/server/src` production code (excludes tests):
**~148 read operations = 142 `.from(threads|messages|users)` SELECT roots + 6 joins**, across ~50
files. Per table: **users 94 · threads 29 · messages 19.** Dominant shapes drive §3d/§3e; the long
tail gets bespoke store functions. Densest files (must be migrated with the most care):

| File | reads | notes |
|---|---|---|
| routes/threads.ts | 25 | thread-list route: pagination, ordering, pinned filter, participant/message joins — needs `listThreads` + several bespoke functions; **ordering/limit must be preserved exactly (§8b)** |
| routes/users.ts | 11 | user CRUD + a message⋈thread inbox join (line 367) |
| routes/teams-routes.ts | 11 | user rosters by team/kind |
| routes/assistant.ts | 11 | assistant user + thread lookups |
| routes/conversations.ts | 6 | thread + message reads |
| routes/agents.ts | 5 | agent (user-kind) reads |
| services/{cost-cap, agent-work-intent-worker} | 4 each | user cost + agent-work reads (cost-cap reads are in-transaction with its writes — §8b) |
| + ~44 more files | 1–3 each | mostly `getUserById` / `getThreadById` / `listMessagesByThread` |

**6 join sites** (`.from(root).innerJoin(owned, …)`):
- `messages ⋈ threads` (both conversation-owned): `approval-rate.ts:81`, `tools/read-inbox.ts:28`,
  `routes/search.ts:137`, `routes/users.ts:367` → clean purpose-built functions **inside**
  conversation-store (§3d).
- **`items ⋈ threads`** (`builtin-routine-handlers.ts:346`) and **`artifacts ⋈ threads`**
  (`bets.ts:1238`) → cross-owner joins. Under the hard rule the `threads` reference must not live
  outside conversation-store, so these relocate into conversation-store as **purpose-built read
  functions that read a non-owned table in the join** (`items` / `artifacts`). This is acceptable:
  AU12's guard forbids OTHER files from touching `threads`/`messages`/`users`, and it does NOT forbid
  conversation-store from reading `items`/`artifacts` (AU13's item guard is write-scoped — reads of
  `items` are unrestricted). Flag as the one genuine cross-boundary coupling the rework introduces
  (§8b). Name each with `@lore` explaining the reverse-join ownership.

**Migration order (read pass).** After §3d/§3e functions + tests exist and the guard is extended (but
run `--check` LAST): migrate the by-id / single-shape reads first (mechanical: `getUserById`,
`getThreadById`, `listMessagesByThread` cover the bulk), then the projection/aggregate/join sites
(§8b), then routes/threads.ts (densest) last. Run the affected route/service integration tests after
each file. Guard `--check` green = zero remaining direct reads/writes in scope.

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
2. **Add read functions** to `conversation-store.ts` (§3d) + `user-store.ts` (§3e). `npm run check`
   green (no callers migrated yet). Carry the `exec: HyperIdleDb` convention.
3. **Red→green read tests** (`*.integration.test.ts`, `{ db }` fixture): `getThreadById`/`getUserById`
   return the seeded row and `undefined` when absent; `listMessagesByThread` returns messages in
   `createdAt` order (order-sensitive assertion); `listUsersByTeam`/`listUsersByKind` filter correctly;
   `getUsersByIds` preserves the `inArray` set; a read passed a `tx` (`tx as HyperIdleDb`) sees
   uncommitted writes from the same transaction (in-tx read proof, §8b); each join function returns the
   exact projected shape its caller needs.
4. **Migrate the bulk single-shape reads** (getUserById / getThreadById / listMessagesByThread across
   the ~44 light files). Run affected integration tests per file.
5. **Migrate projection / aggregate / join / in-transaction reads** (§8b) — audit each of the 38
   `select({…})` projection sites for API-response leakage; migrate the 6 joins (2 cross-owner) and 3
   aggregates. Preserve every column set, order, limit, and transaction scope.
6. **Migrate routes/threads.ts last** (25 reads — densest; pagination/ordering/pinned).
7. **Extend the guard** to full-access (§4), invert fixture (e)→(h), add (i)–(l). Run `--fixtures`
   then `--check` → PASS.
8. **Full gate:** `npm run check` + `npm run lint` + `npm run test` + `npm run test:integration:service`
   green. The pre-existing thread/message/user/roster/agent route + agent-work + cost-cap tests passing
   **unchanged** is the behavior-preservation proof.

No half-broken state: read functions exist before any caller migrates (step 2 before 4–6); each read
swap is behavior-identical and independently compiles; the guard extension lands LAST, after every
read is already routed (running `--check` earlier would flag the not-yet-migrated reads — that is
expected, not a regression).

## 7. Acceptance criteria → verification

| AC | Verification |
|---|---|
| AC-1 every writer AND reader calls one owning function | Write table §5 (landed) + read migration §5b fully applied; guard `--check` finds zero remaining direct references in `packages/server/src`; §5a names every out-of-scope access |
| AC-2 all observable behavior unchanged | Existing threads/users/conversations/teams/agents route + agent-work + cost-cap + roster integration tests pass **unchanged** (`npm run test` + `test:integration:service`). §8b risk sites each covered by a passing pre-existing test or a new order/projection assertion |
| AC-3 a bypass fails a check | `au12-…-guard.ts --fixtures` asserts a direct `select().from`/`join`/column reference on these tables — bare-identifier **and** namespace forms — is flagged; type-only refs are NOT; guard wired into `npm run lint` |
| AC-4 zero remaining direct access | `npm run lint` green (guard PASS) proves zero reads+writes in `packages/server/src`; §5a accounts for every access outside that scope as a named exception |

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
`users.costActual` (agent-owned). In scope by AC-4 — reads route via `getUserById` / the aggregate
readers, writes via `updateUser` / `resetAllUserCost`. Note only: do not expand AU12 to move the
metering *logic*, only route the raw access. **Its reads sit inside the same transaction as its writes
— preserve the tx scope (§8b).**

**§7c — CORRECTED: guard is FULL-ACCESS-scoped, reads AND writes (was: write-scoped, reads direct).**
The original plan interpreted the constraint narrowly (write-only) on two grounds: AC-4's literal
wording said "direct-table-**write** call sites," and a full read-ban touches ~40+ (actually ~148)
existing read sites in what was scoped as a small no-behavior-change refactor. That interpretation was
reviewed + APPROVED (architecture-critique round 2) and shipped in PR #435. **The founder has ruled it
wrong.** The Contracts/constraints line — *"the owning service's functions are the only code … permitted
to import the Drizzle table objects for threads/messages/users"* — is now read **as written**:
`conversation-store.ts` / `user-store.ts` are the ONLY code path to these tables, reads included. The
guard is extended to full-access (§4); every read is migrated (§3d/§3e/§5b). This section supersedes
the original write-only §7c. **Reviewer: this is the founder-mandated interpretation, not a proposal —
evaluate execution completeness (are all ~148 reads routed? does the guard catch column-refs and joins?
is behavior preserved at the 38 projection + 6 join + 4 in-tx sites?), not whether write-only would
have sufficed.**

**§7d — Event ownership still deferred.** conversation-store owns row read+write only; callers keep
emitting events. Unchanged by the rework.

**§8a — SCOPE GROWTH: Settings and Notification have the identical raw-access pattern — do NOT fold
into AU12.** `serverConfig`/`factorySettings` (~14 write sites + reads across 8 files) and
`notificationQueue` (~15 write sites + reads across 5 files) are the same structural violation and each
warrants its own owning-service WP. **Not in AU12.** The full read-ownership rework must NOT opportunistically
absorb these — same discipline as the write pass.

**§8b — BEHAVIOR-PRESERVATION RISK (the load-bearing risk of the read pass — 148 sites, honestly
assessed).** The write pass was mechanical (values in → row written). Reads are riskier. Genuine risks,
flagged rather than assumed safe:

1. **Column projection → over-fetch / API leakage (HIGHEST risk, 38 sites).** 38 call sites do
   `select({ id: users.id, name: users.name }).from(users)` — narrowed column sets, not full rows. The
   §3e getters return the **full** `User`/`Thread`/`Message` row. Two sub-risks:
   - *API leakage:* where a projected select result flows **directly into an HTTP/tool response**
     (routes/users, routes/teams-routes, routes/agents, tools/read-inbox), swapping to a full-row getter
     would leak columns the projection deliberately excluded (`email`, `systemPrompt`, `costActual`,
     harness secrets). **The builder MUST audit each of the 38 for "does this result serialize to an
     external surface?" and, where yes, re-project in the caller after the full-row fetch OR add a
     projected store function returning the exact column set.** Do not blanket-swap to full-row getters.
   - *Perf:* full-row over-fetch on a hot list path (routes/threads.ts list) — acceptable for
     correctness but note for the list route (small row counts, not a real concern here).
2. **Ordering / limit / pagination (routes/threads.ts, listMessagesByThread — order-sensitive).** A
   consolidated `listMessagesByThread` that drops the existing `orderBy(messages.createdAt)` would
   silently reorder a conversation; the thread-list route's `orderBy(threads.lastActiveAt desc).limit()`
   pagination must be reproduced exactly. **Preserve order/limit/offset in every list function; assert
   order in the read tests (step 3).**
3. **In-transaction reads (4 sites, e.g. cost-cap read-modify-write).** A read that currently runs
   inside `db.transaction` for consistency (read current cost → compute → write) MUST keep running in
   the same tx. The `exec`-first-arg design preserves this **iff** the caller passes `tx as HyperIdleDb`
   into the read function (not `db`). **Risk if the builder passes `db` instead of `tx`:** the read would
   escape the transaction snapshot and could read stale/committed-elsewhere data mid-transaction. Test:
   read-in-tx sees the same tx's uncommitted write (step 3). Do not hoist reads out of their tx.
4. **Cross-owner joins (2 sites, §5b).** `items⋈threads`, `artifacts⋈threads` relocate into
   conversation-store, which then reads a non-owned table (`items`/`artifacts`) inside the join. This is
   the one new cross-boundary coupling; behavior is preserved (same join, same predicate) but it inverts
   the natural ownership (a Conversation function reading Work/Artifact rows). Flagged as accepted under
   the hard rule; `@lore` each.
5. **`getMessageByLegacyItemId` / `directKey` bespoke lookups.** Low volume but genuinely bespoke — one
   store function each, no bypass.

## 9. Out of scope

Knowledge / Work / Routine domains (AU13/AU14 — merged); Settings/Notification (§8a); event ownership
(§7d); the package split (AU17); the routine-scheduler fire-time edge (AU15); migration of the §5a
out-of-server access (bootstrap/eval/dev-script — named exceptions, allowlisted by AU8). No schema
changes, no UI. Do not move cost-metering *logic* (§7b) — only route its raw access.
