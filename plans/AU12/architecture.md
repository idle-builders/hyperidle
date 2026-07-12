# AU12 — Conversation and Users own their own writes — Architecture

**Branch:** `framework/AU12-conversation-users-ownership` · **Type:** backend refactor (behavior-preserving) · **Complexity:** L
**Depends on:** AU11 (shipped, PR #428). Refine + Design skipped (pure internal refactor, no UI, no behavior change).

---

## 1. Context

Today ~59 write call sites across 22 files in `packages/server/src` independently `insert`/`update`
`threads`, `messages`, and `users` — core routes and agent-owned code writing the same rows with no
shared function, so nothing enforces the shape of a message/thread/user row. AU8's should-graph guard
cannot be built until there is one owning module per domain to check against. AU12 creates two owning
modules and routes every write through them, changing nothing the product does.

**This plan supersedes the WP narrative's call-site count.** The WP text names ~8 files; the real
audit (direct grep of every `.insert/.update/.delete` against these three tables) finds **22 files /
~59 write sites** in `packages/server/src`. The AC ("zero remaining direct-table-write call sites …
outside the two owning modules") is unambiguous within the guard's enforceable scope — all 59 are in
scope. Full enumeration in §5. Production writes to these tables that live **outside** `packages/server/src`
(bootstrap/seed/fixture code) are triaged as named exceptions in §5a.

## 2. Constraints (from the WP)

- **No product behavior may change.** Ownership consolidation only.
- The two owning files (plus their own tests) are the only code permitted to `insert/update/delete`
  these tables. **Interpretation (flagged, §7c): the guard is WRITE-scoped, not import-scoped.**
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
atomically, with verdict-race logic). Therefore **every write function takes the executor as its first
argument**, so the caller passes either `db` or its live `tx`.

**Executor type = plain `HyperIdleDb` (no union, no derived generics).** This mirrors the existing,
documented repo convention. `packages/server/src/services/practice-meeting.ts:448-454` types its
transaction param as plain `HyperIdleDb` with an explicit `@lore`:

> *"Passing `HyperIdleDb` as the `tx` parameter type is safe — the drizzle transaction object is
> structurally compatible (same `insert`/`update`/`select` methods) and this avoids depending on
> drizzle's internal transaction type."*

`agent-session-requests.ts:279` (`terminalizeAgentSessionRequestInTx(tx: HyperIdleDb, …)`) does the
same. The earlier draft's
`type DbExecutor = HyperIdleDb | Parameters<Parameters<HyperIdleDb["transaction"]>[0]>[0]` is
**rejected**: it does not typecheck (`TS2344` on the `Parameters<…>` derivation) and it reaches for the
exact "depend on drizzle's internal transaction type" approach the lore warns against. No new
`DbExecutor` export is added to `@hyperidle/db`.

**Verified call-site mechanics.** How existing callers pass a `tx` into a `HyperIdleDb`-typed param
today: `agent-session-requests.ts:331` does
`db.transaction((tx) => terminalizeAgentSessionRequestInTx(tx as HyperIdleDb, input))`, and
`session-lifecycle.ts` / `task-state-machine.ts` / `routine-scheduler.ts` / `handoff-protocol.ts` /
`routes/{sessions,routines,knowledge}-routes.ts` all pass `tx as HyperIdleDb` into these functions.
The drizzle transaction handle is **not** silently assignable to `HyperIdleDb` — the established
convention pairs the `HyperIdleDb` param with an explicit `tx as HyperIdleDb` cast at every
transaction-composition call site (already used repo-wide, so the cast is an accepted, precedented
pattern here, not new debt). **Therefore every `tx` row in the §5 migration table passes
`insertThread(tx as HyperIdleDb, v)` / `updateThread(tx as HyperIdleDb, …)` etc.** `db` and `ctx.db`
rows pass their value directly (already `HyperIdleDb`), no cast.

Every store function signature below takes `exec: HyperIdleDb`. Carry the same `@lore` rationale
(structural compatibility, avoids drizzle internal type) onto `conversation-store.ts` /
`user-store.ts`, citing `practice-meeting.ts` as precedent.

### 3b. `packages/server/src/services/conversation-store.ts` — owns `threads` + `messages`

The service owns **the row write only** — no event emission, no transaction orchestration, no
participant/verdict business logic. Callers keep their existing `eventBus.emit(...)`, `db.transaction`
wrappers, participant math, and `agentWorkIntents`/`items` inserts exactly as-is. This is the minimal,
lowest-risk consolidation that satisfies "one place owns the shape of a row" (the insert values ARE the
shape). Owning assistant-visible *events* is explicitly a later step, not AU12 (flagged §7d).

Import `threads, messages, type NewThread, type NewMessage` and `type HyperIdleDb` from `@hyperidle/db`.

```ts
// --- threads ---
export function insertThread(exec: HyperIdleDb, values: NewThread): Promise<void>;
export function updateThread(exec: HyperIdleDb, id: string, patch: Partial<NewThread>): Promise<void>;
//   ^ generic typed patch covers every current update: { pinned }, { lastActiveAt },
//     { resolvedAt, lastActiveAt }, { resolvedAt: null, lastActiveAt }, { participants }.

// --- messages ---
export function insertMessage(exec: HyperIdleDb, values: NewMessage): Promise<void>;
export function updateMessage(exec: HyperIdleDb, id: string, patch: Partial<NewMessage>): Promise<void>;

// --- verdict race (threads.ts:1307): first-verdict-wins needs the WHERE + .returning() length ---
export function resolveMessageIfUnresolved(
  exec: HyperIdleDb, id: string, resolvedAt: string,
): Promise<{ id: string }[]>;
//   sets resolvedAt WHERE id = ? AND resolvedAt IS NULL, .returning({ id }). Caller checks .length.

// --- DM thread find-or-create: FOLD IN direct-thread.ts (see §5 note) ---
export function findOrCreateDirectThread(
  exec: HyperIdleDb, senderId: string, recipientId: string, now: string,
): Promise<string>; // returns threadId; relocated verbatim from services/direct-thread.ts
```

`updateThread`/`updateMessage` are deliberately thin typed passthroughs. Their value is a single
import surface + single guard surface + a typed `Partial<NewThread|NewMessage>` patch (no arbitrary
column strings). Do NOT invent semantic wrappers (`pinThread`, `touchThread`) — the patches vary per
call site and extra names add surface without owning more shape. `insertThread`/`insertMessage` carry
the real shape ownership (`NewThread`/`NewMessage` typed values).

### 3c. `packages/server/src/services/user-store.ts` — owns `users`

Import `users, type NewUser, type User` and `type HyperIdleDb` from `@hyperidle/db`.

```ts
export function insertUser(exec: HyperIdleDb, values: NewUser): Promise<void>;
export function updateUser(exec: HyperIdleDb, id: string, patch: Partial<NewUser>): Promise<void>;
//   covers: identity { name, email }, harness config { harnessType, modelId, modelProvider },
//   status { status: "retired" }, cost metering { costActual } (see §7b), assistant config patch.

// get-or-create — Validation Scenario 2 names this explicitly.
export function getOrCreateUser(exec: HyperIdleDb, id: string, create: NewUser): Promise<User>;
//   select by id; if absent insert `create`; re-select and return the row.
//   Caller supplies the full NewUser (keeps assistant persona / BUILTIN_SYSTEM_PROMPT in the
//   caller — pulling that agent-layer constant into a core service would be a boundary smell).

// bulk cost reset — cost-cap.ts:541 does .set({ costActual: 0 }).where(sql`true`) (all rows);
// a bulk update with no id doesn't fit updateUser(id, patch). See §7b.
export function resetAllUserCost(exec: HyperIdleDb): Promise<void>;
```

## 4. Guard mechanism (AC-3: bypass must fail a check, not convention)

New standalone AST guard `scripts/au12-conversation-users-ownership-guard.ts`. It reuses the **CLI
scaffolding** of the `au9/au10/au11` guards (TS compiler AST walk, `--fixtures` self-test, `--check`
mode, wired into `npm run lint`) — but its **detection logic is a genuinely new shape**, not a copy of
theirs (framing correction below).

**AU12 is a NEW write-ownership guard pattern — au9/au10/au11 do NOT already implement it.** au9–au11
are *import/module-reachability* guards (an agent-owned file may not import certain modules; they carry
agent-owned-file allowlists). AU12 is a *write-expression* guard: it resolves the first argument of an
`insert/update/delete` call back to a `threads`/`messages`/`users` table object and flags it. Only the
CLI plumbing is shared; the analysis is a different kind. Downstream framing correction:
**AU8's repo-wide `TABLE_OWNER` map (TRACK-AU line 621) is precisely AU12's write-ownership shape, so
AU8 — and AU17's later guard consolidation — converge *toward* AU12's convention, not AU12 toward
theirs.** Do not describe AU12 as "following au9–au11's shape"; it establishes the shape those later
guards adopt.

**Why an AST write-guard, not ESLint `no-restricted-imports`:** the import ban would break the ~40+
legitimate READ sites (`db.select().from(threads)` etc.) — the constraint is about *writes*, and the
AC says "direct-table-**write** call sites." The guard matches the write *expression*, leaving reads
free.

**Rule.** Walk every production `.ts` under `packages/server/src` (exclude `__tests__/`, `*.test.ts`,
`*.integration.test.ts`, `*.spec.ts`). For each file, parse its imports and build the set of
**table-object references** that resolve to a value import of `threads`/`messages`/`users` from
`@hyperidle/db`. Two reference forms both resolve to the same table objects:

1. **Bare identifier** from a named import — `import { threads } from "@hyperidle/db"` → local id
   `threads`.
2. **Namespace member access** from a namespace import —
   `import * as schema from "@hyperidle/db"` (or `import * as dbSchema from "@hyperidle/db"`) →
   `schema.threads` / `dbSchema.messages`. The guard resolves the namespace binding to the
   `@hyperidle/db` module, then checks the accessed member name against `{threads, messages, users}`.

Flag any `CallExpression` whose callee is a `PropertyAccessExpression` named `insert`/`update`/`delete`
**and** whose first argument is **either** an `Identifier` in set (1) **or** a `PropertyAccessExpression`
matching set (2). Receiver-agnostic (matches `db.`, `tx.`, `ctx.db.`). Resolving the reference to the
import (not string-matching the name) avoids false positives on a local var coincidentally named
`threads`, and closes the `db.insert(schema.threads)` namespace-access bypass.

**Exempt** exactly the two owning files:
`packages/server/src/services/conversation-store.ts`, `packages/server/src/services/user-store.ts`.

`--fixtures` self-test must assert: (a) `db.insert(threads)` in a route → finding; (b) `tx.update(users)`
in a service → finding; (c) `ctx.db.insert(messages)` in a tool → finding; (d) same write inside
`conversation-store.ts`/`user-store.ts` → NO finding; (e) `db.select().from(threads)` (read) → NO
finding; (f) a local `const threads = […]; db.insert(threads)` not imported from `@hyperidle/db` → NO
finding; **(g) namespace-access `import * as schema from "@hyperidle/db"; db.insert(schema.threads)` →
finding** (the bypass case).

Wire into `package.json` `lint` script, appended after the au11 guard:
`&& npx tsx scripts/au12-conversation-users-ownership-guard.ts --check`.

A green lint with zero findings **is** the proof of AC-4 **within the guard's enforceable scope**
(`packages/server/src` production code). Writes outside that scope are the named §5a exceptions.

## 5. Call-site migration table (AC-1)

Executor column: `db` = pass `db`; `tx` = pass **`tx as HyperIdleDb`** (per §3a — the accepted
transaction-composition cast); `ctx.db` = pass `ctx.db`. Old code → new call. Events / transaction
wrappers / participant logic / `agentWorkIntents`+`items` inserts stay in the caller unchanged.

### threads (insert)
| File:line | Old | New | Exec |
|---|---|---|---|
| routes/coach.ts:189 | `db.insert(threads).values(v)` | `insertThread(db, v)` | db |
| routes/users.ts:306 | `db.insert(threads).values(v)` | `insertThread(db, v)` | db |
| routes/assistant.ts:225 | `db.insert(threads).values(v)` | `insertThread(db, v)` | db |
| routes/teams-routes.ts:592 | `db.insert(threads).values(v)` | `insertThread(db, v)` | db |
| routes/threads.ts:973 | `tx.insert(threads).values(v)` | `insertThread(tx as HyperIdleDb, v)` | tx |
| services/review-item-factory.ts:60 | `db.insert(threads).values(v)` | `insertThread(db, v)` | db |
| services/session-review-creator.ts:52 | `db.insert(threads).values(v)` | `insertThread(db, v)` | db |
| services/lifecycle-propagation.ts:548 | `db.insert(threads).values(v)` | `insertThread(db, v)` | db |
| services/routine-scheduler.ts:245 | `db.insert(threads).values(v)` | `insertThread(db, v)` | db |
| services/handoff-protocol.ts:167 | `tx.insert(threads).values(v)` | `insertThread(tx as HyperIdleDb, v)` | tx |
| services/handoff-protocol.ts:234 | `tx.insert(threads).values(v)` | `insertThread(tx as HyperIdleDb, v)` | tx |
| services/builtin-routine-handlers.ts:381 | `tx.insert(threads).values(v)` | `insertThread(tx as HyperIdleDb, v)` | tx | ⚠ AU13 overlap (§7a) |
| services/builtin-routine-handlers.ts:463 | `tx.insert(threads).values(v)` | `insertThread(tx as HyperIdleDb, v)` | tx | ⚠ AU13 overlap (§7a) |
| services/direct-thread.ts:41 | `db.insert(threads).values(v)` | **relocate whole `findOrCreateDirectThread` into conversation-store** (§ note) | — |
| tools/submit-review.ts:77 | `ctx.db.insert(threads).values(v)` | `insertThread(ctx.db, v)` | ctx.db |
| tools/create-item.ts:89 | `ctx.db.insert(threads).values(v)` | `insertThread(ctx.db, v)` | ctx.db |

### threads (update)
| File:line | Old (set) | New | Exec |
|---|---|---|---|
| routes/threads.ts:900 | `.set({ lastActiveAt })` | `updateThread(tx as HyperIdleDb, winner.id, { lastActiveAt })` | tx |
| routes/threads.ts:1046 | `.set({ lastActiveAt })` | `updateThread(tx as HyperIdleDb, winner.id, { lastActiveAt })` | tx |
| routes/threads.ts:1300 | `.set({ participants })` | `updateThread(tx as HyperIdleDb, threadId, { participants })` | tx |
| routes/threads.ts:1317 | `.set({ resolvedAt, lastActiveAt })` | `updateThread(tx as HyperIdleDb, threadId, { resolvedAt, lastActiveAt })` | tx |
| routes/threads.ts:1322 | `.set({ resolvedAt: null, lastActiveAt })` | `updateThread(tx as HyperIdleDb, threadId, { resolvedAt: null, lastActiveAt })` | tx |
| routes/threads.ts:1326 | `.set({ lastActiveAt })` | `updateThread(tx as HyperIdleDb, threadId, { lastActiveAt })` | tx |
| services/policy-engine.ts:188 | `.update(threads).set(...)` | `updateThread(db, id, patch)` | db |
| services/session-review-creator.ts:95 | `.update(threads).set(...)` | `updateThread(db, id, patch)` | db |
| services/assistant-dispatcher.ts:119 | `.set({ pinned: true })` | `updateThread(db, event.threadId, { pinned: true })` | db |
| tools/submit-review.ts:70 | `.update(threads).set(...)` | `updateThread(ctx.db, id, patch)` | ctx.db |
| tools/submit-review.ts:122 | `.set({ lastActiveAt })` | `updateThread(ctx.db, threadId, { lastActiveAt })` | ctx.db |
| tools/create-item.ts:131 | `.update(threads).set(...)` | `updateThread(ctx.db, id, patch)` | ctx.db |

### messages (insert)
| File:line | New | Exec |
|---|---|---|
| routes/users.ts:417 | `insertMessage(db, v)` | db |
| routes/teams-routes.ts:619 | `insertMessage(db, v)` | db |
| routes/threads.ts:889 | `insertMessage(tx as HyperIdleDb, v)` | tx |
| routes/threads.ts:992 | `insertMessage(tx as HyperIdleDb, v)` | tx |
| routes/threads.ts:1035 | `insertMessage(tx as HyperIdleDb, v)` | tx |
| routes/threads.ts:1265 | `insertMessage(tx as HyperIdleDb, v)` | tx |
| services/policy-engine.ts:171 | `insertMessage(db, v)` | db |
| services/agent-work-assistant.ts:236 | `insertMessage(db, v)` | db |
| services/agent-work-assistant.ts:533 | `insertMessage(db, v)` | db |
| services/handoff-protocol.ts:293 | `insertMessage(tx as HyperIdleDb, v)` | tx |
| services/lifecycle-propagation.ts:559 | `insertMessage(db, v)` | db |
| tools/send-message.ts:37 | `insertMessage(ctx.db, v)` | ctx.db |
| tools/submit-review.ts:98 | `insertMessage(ctx.db, v)` | ctx.db |
| tools/submit-review.ts:110 | `insertMessage(ctx.db, v)` | ctx.db |

### messages (update)
| File:line | New | Exec |
|---|---|---|
| routes/threads.ts:1307 | `resolveMessageIfUnresolved(tx as HyperIdleDb, resolvesMessageRow.id, now)` → check `.length === 0` → `throw new VerdictRaceConflict()` | tx |
| services/policy-engine.ts:183 | `updateMessage(db, id, patch)` | db |

### users (insert)
| File:line | New | Exec |
|---|---|---|
| routes/users.ts:130 | `insertUser(db, v)` | db |
| routes/teams-routes.ts:560 | `insertUser(db, v)` | db |
| routes/agents.ts:309 | `insertUser(db, v)` | db |
| services/agent-work-assistant.ts:307 | replaced by `getOrCreateUser` (see below) | db |
| services/scaffold-agents.ts:103 | `insertUser(db, v)` | db |
| services/invite-code.ts:114 | `insertUser(db, v)` | db |

**agent-work-assistant.ts:303–323** (select-or-insert of `ast-${userId}`): replace the
select-then-`insert(users)` with `const agentRow = await getOrCreateUser(db, assistantAgentId, { …assistant NewUser… });`
(Validation Scenario 2). The assistant `NewUser` (persona, harness, model) stays composed in the caller.

### users (update)
| File:line | Old (set) | New | Exec |
|---|---|---|---|
| routes/users.ts:261 | `.set(updates)` | `updateUser(db, targetId, updates)` | db |
| routes/assistant.ts:472 | `.set(updateSet)` | `updateUser(db, assistantAgentId, updateSet)` | db |
| routes/teams-routes.ts:575 | `.set({ harnessType, modelId, modelProvider })` | `updateUser(db, assistantId, {…})` | db |
| routes/agents.ts:414 | `.set(updateSet)` | `updateUser(db, id, updateSet)` | db |
| routes/agents.ts:487 | `.set(updateSet)` | `updateUser(db, id, updateSet)` | db |
| routes/agents.ts:532 | `.set({ status: "retired" })` | `updateUser(db, id, { status: "retired" })` | db |
| services/cost-cap.ts:246 | `.set(...)` (costActual) | `updateUser(db, id, patch)` | db | ⚠ §7b |
| services/cost-cap.ts:527 | `.set({ costActual: 0 })` | `updateUser(db, normalizedParams.id, { costActual: 0 })` | db | ⚠ §7b |
| services/cost-cap.ts:541 | `.set({ costActual: 0 }).where(sql\`true\`)` | `resetAllUserCost(db)` (bulk reset — see §3c) | db | ⚠ §7b |

> **direct-thread.ts fold-in.** `findOrCreateDirectThread` is already a shared DM-thread helper
> (imported by tools/send-message.ts, routes/users.ts:413, etc.). Relocate the whole function into
> `conversation-store.ts` (it owns a `threads` write) and update its ~handful of importers to the new
> path. Delete `services/direct-thread.ts`. Verify with `rg` that every importer is updated (knip
> will catch a stale file; check will catch a stale import).

**Totals:** 16 thread inserts · 12 thread updates · 14 message inserts · 2 message updates · 6 user
inserts · 9 user updates ≈ **59 write sites / 22 files** in `packages/server/src`. Test files that
reference these tables are **not** production call sites (guard excludes them); they keep writing
directly via fixtures.

## 5a. Out-of-server production writes — named exceptions (AC-4 scope honesty)

The guard's enforceable scope is `packages/server/src` production code. Production writes to
`threads`/`messages`/`users` also exist **outside** that scope. AU12 triages each explicitly (same
rigor as the §8a Settings/Notification carve-out) so AU8's later repo-wide `TABLE_OWNER` guard
(TRACK-AU line 621) has a pre-triaged allowlist and never trips on an untriaged write (TRACK-AU line
630 forbids AU8 from absorbing untriaged exceptions — they must arrive as named prerequisites, which
this section supplies).

| Site | Writes | Disposition |
|---|---|---|
| `packages/db/src/factory-bootstrap.ts` (86, 105, 126, 148, 235, 264) | 6 `users` insert/update | **NAMED BOUNDARY EXCEPTION.** `packages/db` sits *below* `packages/server` — it structurally **cannot** import `user-store` (would be an upward dependency / cycle). Genuine production bootstrap (called from `setup-cli`, `seed`, `bootstrap-pg`). Cannot be migrated; AU8 must allowlist these 6. |
| `packages/db/src/demo-fixture.ts` (66, 81, 97, 184) | 4 `users` insert/update | **NAMED EXCEPTION.** Same `packages/db` layer (cannot import upward); demo-data seeding, already gated by its own `demo-fixture-guard`. AU8 allowlists. |
| `packages/eval/src/seeding.ts` (92, 126, 383, 410, 529, 543, 559) | 7 writes (users/threads/messages) | **NAMED EXCEPTION (deliberate, not blocked).** `packages/eval` *does* depend on `@hyperidle/server` so it *could* import the stores. **Decision: carve out, do not migrate.** This is benchmark-harness fixture seeding that builds arbitrary graph shapes for evals — the same category as test fixtures, which write directly by design. It is not on any production request/agent path; routing it through the stores adds coupling to server internals for zero product benefit and widens AU12's blast radius. AU8 allowlists `eval/**` seeding. (Optional future cleanup, not AU12.) |
| `packages/web/scripts/ah6-test-server.ts` (126, 216) | 2 `users` insert | **NAMED EXCEPTION.** Dev/test harness script, not shipped production request handling. AU8 allowlists. |

**AC-4 restated precisely:** *zero remaining direct `threads`/`messages`/`users` write call sites in
`packages/server/src` production code outside the two owning modules* — proven by a green
`au12-…-guard.ts --check`. Every production write **outside** that scope is one of the four named
exceptions above, each justified (lower-layer boundary for `packages/db`; harness/fixture seeding for
`eval` and the web dev script), none silently dropped.

## 6. Ordered task list

1. **Author `conversation-store.ts` + `user-store.ts`** with the §3 signatures (executor param typed
   `exec: HyperIdleDb`; `@lore` citing `practice-meeting.ts:448-454` for the structural-compat
   rationale). No new `@hyperidle/db` export needed — `HyperIdleDb` already exports. `npm run check`
   green. (No callers yet.)
2. **Relocate `findOrCreateDirectThread`** into conversation-store; delete `direct-thread.ts` after
   importers move (step 4).
3. **Red→green service tests** (`*.integration.test.ts`, `{ db }` fixture): prove `insertThread`,
   `insertMessage`, `insertUser` write the expected row; `getOrCreateUser` creates once then returns
   the existing row on second call; `resolveMessageIfUnresolved` returns `[]` on a second call (race);
   `resetAllUserCost` zeroes every row; a write function called with a `tx` (passed
   `tx as HyperIdleDb`) participates in and rolls back with the caller's transaction.
   These are the runtime-behavior ACs for the new functions.
4. **Migrate the simple `db`/`ctx.db` call sites** (all non-`tx` rows in §5): coach, users, assistant,
   teams-routes, agents, invite-code, scaffold-agents, review-item-factory, session-review-creator,
   lifecycle-propagation, routine-scheduler, policy-engine, cost-cap, agent-work-assistant,
   assistant-dispatcher, tools (send-message, submit-review, create-item), and the direct-thread
   importers. Run the affected route/service integration tests after each file — behavior-identical, so
   they pass unchanged.
5. **Migrate the `tx`-composed call sites last** (most delicate): threads.ts (12 sites — keep the
   `db.transaction`, verdict-race `VerdictRaceConflict`, participant math, and `agentWorkIntents`
   insert exactly; only the `threads`/`messages` writes move, each passing `tx as HyperIdleDb`),
   handoff-protocol.ts (3), builtin-routine-handlers.ts (2 — see §7a). Run
   `threads.routes.integration.test.ts`, `AF14-threads`, `threads.identity/mention/blockId`, and the
   handoff/routine tests after each.
6. **Add the guard** `scripts/au12-conversation-users-ownership-guard.ts` + `--fixtures` (incl. the
   namespace-access case (g)); wire into `package.json` `lint`. Run
   `npx tsx scripts/au12-…-guard.ts --fixtures` then `--check` → PASS (zero findings = AC-4 proof
   within scope).
7. **Full gate:** `npm run check` + `npm run lint` + `npm run test` + `npm run test:integration:service`
   all green. The pre-existing thread/message/user route + agent-work-assistant + assistant-dispatcher
   tests passing **unchanged** is the behavior-preservation proof (Validation Scenario 4).

No half-broken state: services exist before any caller migrates (step 1 before 4/5); each call-site
swap is behavior-identical and independently compiles; the guard lands last, after every write is
already routed.

## 7. Acceptance criteria → verification

| AC | Verification |
|---|---|
| AC-1 every writer calls one owning function | Migration table §5 fully applied; guard `--check` finds zero remaining direct writes in `packages/server/src`; §5a names every out-of-scope write |
| AC-2 all observable behavior unchanged | Existing threads/users/coach/teams/agents route + agent-work-assistant + assistant-dispatcher integration tests pass **unchanged** (`npm run test` + `test:integration:service`) |
| AC-3 a bypass fails a check | `au12-…-guard.ts --fixtures` asserts a new direct `insert/update/delete` on these tables — bare-identifier **and** namespace-access forms — is flagged; guard wired into `npm run lint` |
| AC-4 zero remaining direct writes | `npm run lint` green (guard PASS) proves zero in `packages/server/src`; §5a accounts for every production write outside that scope as a named, justified exception |

## 8. Flagged findings (do NOT silently absorb)

**§7a — AU13 `threads` overlap (boundary lock).** `builtin-routine-handlers.ts:381` and `:463` do
`tx.insert(threads)` **co-located with `tx.insert(items)`** (Work domain) in one transaction. **AU12
owns and migrates BOTH `threads` inserts** → `insertThread(tx as HyperIdleDb, …)`. **AU13
(Work/Routine) must NOT re-touch these two `threads` sites** — it migrates only the sibling
`tx.insert(items)` (and the `insert(routines)`/`insert(routineRuns)`/`update(routines)` sites) to its
Work/Routine store, leaving the `threads` inserts already routed through conversation-store. The
shared-executor design makes this clean: both stores' `insert*` take the same `tx` (as `HyperIdleDb`),
so one transaction spans two owners with no double-refactor. Record this in the AU13 WP notes at ship
time.

**§7b — `users.costActual` is metering, not identity/config (interpretation).** `cost-cap.ts` (agent-
owned) updates `users.costActual` (246, 527, 541). Literally a `users` write, so in scope by AC-4 —
routed via `updateUser` / new `resetAllUserCost`. But `costActual` is cost metering, not the "identity/
config fields" the WP scopes the Users service to. Kept in scope (it IS a `users` write the guard would
flag) but noted: if the maintainer wants cost metering owned elsewhere, that's a separate decision — do
not expand AU12 to move the metering logic, only route the raw write.

**§7c — Guard is WRITE-scoped, reads stay direct (interpretation).** The constraint prose says "the
only code permitted to import the table objects." Taken literally that breaks ~40+ read sites
(`select().from(threads)`). AC-4 says "direct-table-**write** call sites," so the guard bans
`insert/update/delete` expressions only; reads remain direct. Forcing every read through the store is a
much larger, behavior-risking rewrite — out of scope for AU12/L/no-behavior-change. Reviewer: confirm
this interpretation.

**§7d — Event ownership deferred.** conversation-store owns the row write only; callers keep emitting
`thread_message_appended`/`item_created`/etc. The dep-graph's "Conversation Service owns assistant-
visible events" is a larger follow-up, not AU12 (folding emission in risks changing which events fire).

**§8a — SCOPE GROWTH: Settings and Notification have the identical raw-write pattern — do NOT fold into
AU12.** First-task audit result (per the WP's instruction to check these two domains):
- **Settings:** `serverConfig` written raw in `services/server-config.ts` (259, 263, 354);
  `factorySettings` (the generic key-value settings table) written raw in **~11 sites across 8 files** —
  `cost-cap.ts:378`, `cost-sentinel.ts:70/75`, `notifications/config.ts:247/263`, `notifications/mute.ts:62`,
  `services/observability/config.ts:129`, `config/git-export-config.ts:115/145`, `routes/status.ts:142`.
- **Notification:** `notificationQueue` written raw in **~15 sites across 5 files** —
  `notifications/dispatcher.ts` (~9), `notifications/digest.ts` (4), `routes/notifications-routes.ts`
  (407, 430), `services/retention-reaper.ts:148`, `services/lifecycle-propagation.ts:663`.

Both are genuine instances of the same structural violation and each warrants its own owning-service WP
(the dep-graph already names a **Settings Service** and a **Notification Service**). **They are NOT in
AU12** (WP Out-of-scope explicitly lists Settings/Notification as separate WPs). Extra caution for
Settings: `factorySettings` is a **generic key-value store shared by many domains** (cost, git-export,
observability, notifications) — "who owns factorySettings" is thornier than Conversation/Users and needs
its own refinement, not a rushed fold-in. **Recommendation:** register two follow-up WPs (Settings-owns-
its-writes, Notification-owns-its-writes) rather than absorbing ~26 more sites into AU12.

## 9. Out of scope

Knowledge / Work / Routine domains (other WPs); Settings/Notification (§8a); the AU13 `items`/routines
writes (§7a); reads (§7c); event ownership (§7d); the package split (AU17); the routine-scheduler
fire-time selection edge (AU15); migration of the §5a out-of-server writes (bootstrap/eval/dev-script —
named exceptions, allowlisted by AU8). No schema changes, no UI.
