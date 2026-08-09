# AU30 — Architecture

**Phase:** technical plan (`/architecture`). **Authority:** `.pipeline/work/AU30/plan.md`.
**Constrained by:** `.pipeline/work/AU30/requirements.md` (revision 1, approved).
**Evidence:** `.pipeline/work/AU30/feasibility.md` — every count below was re-measured in this worktree.

**Tier:** production. **Type:** backend. **No new package, no new service, no UI change.**
**One schema change: `user_skills` is DROPPED** (Ruling 4) — one hand-authored migration, no other
table, column or index touched.

**Revision 3 — amended by `.pipeline/work/AU30/founder-rulings.md` (2026-08-09).** Five rulings, every
one binding. Rulings 1, 2, 3 and 5 confirm what this plan already recommended and are recorded as
**decided**; the former "six open decisions" list is gone, replaced by [§6](#6-the-founder-rulings--decided).
Ruling 4 is a scope change: `userSkills` gets no owner — the table is deleted, and the owner-and-accessors
section that stood at §3.2 is replaced by [§11](#11-ruling-4--deleting-user_skills).

**DOC-CLASS: minimal.** `governance/README.md:5-6` forbids restating a governance rule in `docs/`,
`CLAUDE.md` or a code comment, so no ownership fact reaches `docs/`. What does reach `docs/` is four
factual lines the table deletion falsifies (§11.10), plus the set of code comments the relocations
falsify ([§9](#9-documentation-made-false)). Not `significant`: no user-facing concept changes here — the
product decision that killed per-skill autonomy was made long ago and is already written down at
`docs/product/product-decisions.md:13`.

---

## 1. What this plan settles

`plan.md` requires every table to name one owning service and every production access to reach its table
through that owner. Requirements settled the owners. This plan settles the five things a builder cannot
derive:

1. the exact accessor each owner exposes, and the production caller that justifies it ([§3](#3-the-owner-surfaces));
2. how the no-live-runtime terminal transition and its `session_ended` emit move without losing the
   rowcount invariant ([§4](#4-the-terminal-transition));
3. every cross-ownership read, and its decomposition ([§5](#5-cross-owned-table-reads));
4. an order in which the tree is never left failing, and which edits are inseparable ([§7](#7-order-ownership-and-what-must-land-together));
5. the evidence that proves behaviour unchanged — including the two invariants that have **no** evidence
   in the repo today — and which acceptance criteria are lint rather than test ([§8](#8-evidence-plan)).

Nothing is left open. The five questions this plan carried to the concept gate were ruled on, and the
rulings are recorded as decisions in [§6](#6-the-founder-rulings--decided).

### 1.1 Reconciliation with `plan.md` — settled by the rulings

`plan.md:5,13` states a `sessions` service "does not exist and has to be created — that is the one piece
of new construction here", and `plan.md:26` makes creating it human-review-load-bearing. **Ruling 1
settles it the other way: `run-orchestration` owns `sessions` and no package is created.** Ruling 4
removes the other candidate for new construction. **This work package therefore contains no new package
and no new service. It is placement throughout, plus one deletion.**

`plan.md`'s scope is widened in exactly one place, deliberately and on the record: Ruling 4 folds the
charter of the registered-but-never-started work package AL9 into this one. It is the only amendment to
`plan.md`'s scope, and it *shrinks* the code this work package writes — nine production sites clear with
no accessor added at all.

Everything else in `plan.md` is reconciled. Every symbol `plan.md` and `requirements.md` name — the six
tables, the ten severity keys, the eleven `(other)` sites, `governance/table-owners.json`'s shape,
`no-per-file-allowances`' closed six-file set — exists in the shape assumed. The three mechanical drifts
in `plan.md` (violation counts, "four table rules", the `propagationLog` per-package split) are recorded
in `requirements.md` §8.4; none changes an outcome and none is re-litigated here.

---

## 2. AC → implementation obligation

| AC (`plan.md:47-53`) | What the builder must produce |
|---|---|
| 1 — every table names one owner; `unowned` empty | 5 owner entries added + 2 corrected in `governance/table-owners.json`, and **one table deleted rather than owned** (§11); `totals` → 44/44/0; `unowned.tables` reduced to an empty object. The `unowned` **block** stays with a rewritten note — `validateTableOwners` reads `registry.unowned.tables` unconditionally (`scripts/lib/governance-registry.ts:141`) and the type declares the field required (`:22`) (§7 commits 1-6) |
| 2 — every production read and write reaches its table through the owner | the 27 remaining table crossings cleared by the relocations in §3, §5 and §7; the 9 `userSkills` crossings cleared by deleting the table (§11) |
| 3 — a service asks the owner; no cross-owned-table query | the decomposition table in §5. Two doors carry the caller's transaction (§5.3). No allowlist, no ceiling, no carve-out |
| 4 — the table rules fail the build in both directions, no baseline entry | 10 keys deleted from `governance/rule-severity.json`; the 2 already-absent keys stay absent; proven red by the probe in §8.2 |
| 5 — every group key this WP owns removed | the same 10 deletions, in the same pull request as the commit that clears the last site |
| 6 — the bookkeeping mechanism stays gone | nothing new under `governance/`; `no-per-file-allowances` already enforces it |
| 7 — `verify` green, relocated behaviour proven unchanged | §8.3's runtime evidence: the existing integration suites over the relocated paths stay green with **import-path edits only, no assertion edits**, plus **two** new owner-side tests (§8.3.2). The deletion carries its own evidence (§11.7), and it is the single place an existing assertion legitimately changes — because its subject changed |
| constraint (`plan.md:33`) — no production export only tests consume | the named-caller column in §3 is the contract; §8.4 states exactly what the machine can and cannot see |

---

## 3. The owner surfaces

**The rule for every surface below: minimal, and a named production caller per accessor.** An owning
service's *existing* in-package sites do not move — the owner may name its own table, so
`run-orchestration`'s 30 `sessions` sites, `policy`'s 9 `propagationLog` sites and `work`'s 8
`taskDispatchAttempts` sites are legal the moment the registry names them and are **not** refactored.
Refactoring them into a store would be gratuitous, and reducing any service's method surface is AU20's
axis (`plan.md:41`).

**Row-type name, verbatim.** `@hyperidle/db` exports `type Session = typeof sessions.$inferSelect`
(`framework/db/src/schema.ts:1631`, barrel `framework/db/src/index.ts:125`). **Use that name.
`SessionRow` does not exist** — an earlier revision of this plan invented it, and a builder writing a
contract against it would not compile. It is a `db:row-type` reach, not a `db:table` reach
(`scripts/lib/db-surfaces.ts:157,193`), so a consumer may name the return type without naming the table —
that is the mechanism, and it holds under the real name. (`UserSkill` / `NewUserSkill` were the second
half of this note; both are deleted by §11.2.)

### 3.1 `run-orchestration` owns `sessions` — 8 accessors

New module `layers/agent-orchestration/run-orchestration/src/session-store.ts`, re-exported from that
package's `src/index.ts`.

| # | accessor | signature | semantics | production caller(s) |
|---|---|---|---|---|
| 1 | `findSessionById` | `(db: HyperIdleDb, sessionId: string) => Promise<Session \| undefined>` | full row, `undefined` on miss. **Never throws on miss** — the socket authorizer's fail-closed property depends on it | `routes/sessions.ts:211`†, `:273`, `:285`, `:316`, `:362`; `routes/agent-orchestration-sessions.ts:98`; `services/session-stream-hub.ts:73` |
| 2 | `listSessions` | `(db, filter: { taskId?: string; agentId?: string; state?: string }, page: { limit: number; offset: number }) => Promise<Session[]>` | full rows; an absent filter field is not applied — verbatim `routes/sessions.ts:237-250` | `routes/sessions.ts:242-250` |
| 3 | `countActiveRunsByAgent` | `(db, agentIds?: readonly string[]) => Promise<Record<string, number>>` | `count()` grouped by `agentId` over `state = "active"`; `agentIds` undefined means all agents; rows with a null `agentId` are dropped, agents with zero runs are absent — verbatim `routes/agent-orchestration-sessions.ts:147-159` | `routes/agent-orchestration-sessions.ts:147` |
| 4 | `listLatestOutcomeByTask` | `(db, taskIds: readonly string[]) => Promise<Record<string, string \| null>>` | newest run per task by `startedAt` desc, first-seen wins; a task with no run is absent — verbatim `:177-186` | `routes/agent-orchestration-sessions.ts:177` |
| 5 | `listRunSummaries` + `RunSummary` type | `(db, by: { taskId: string } \| { agentIds: readonly string[] }) => Promise<RunSummary[]>` | the eight-column projection (`RUN_SUMMARY_COLUMNS`, `:227-236`), newest first. **The projection object moves with the accessor** — it names `sessions.*` and cannot stay in the route | `routes/agent-orchestration-sessions.ts:204` |
| 6 | `endSessionByCas` | see [§4](#4-the-terminal-transition) | the CAS + the `session_ended` emit + the read-back, as one function | `routes/sessions.ts:192-212` |
| 7 | `recordSessionMetadata` | `(db, sessionId: string, patch: { outcome?: string; notes?: string; effectivenessScore?: string; effectivenessRecordedAt?: string; effectivenessRecordedBy?: string }) => Promise<void>` | plain update by id, **never terminal** (no `state`, no `endedAt` in the patch type — the type is what enforces `routes/sessions.ts:343`'s promise). No-op on an empty patch | `routes/sessions.ts:358-360` |
| 8 | `writeSessionNotes` | `(db, sessionId: string, notes: string) => Promise<void>` | sets `notes` only | `tool-handlers`' `write_session_notes` via port (§3.6) — that is the accessor's production caller, and it is the only one |

† `:211` disappears entirely — accessor #6 returns the read-back row (§4).

**`writeback-processor.ts:338` is not retargeted.** An earlier revision listed it as a second caller of
accessor #8, which contradicted §10's "an owner's existing in-package table sites are not touched".
§10 wins: `writeback-processor.ts` is inside `run-orchestration`, so its
`db.update(sessions).set({ notes })` (`:338`) becomes legal the moment the registry names the owner and
is left exactly as it is. Accessor #8 exists for the port in §3.6 and for that alone.

Locked, so the builder does not re-derive them:

- **`findSessionById` serves all seven get-by-id sites, including the socket authorizer.** Do not add a
  separate `sessionExists`. The authorizer (`session-stream-hub.ts:70-75`) selects one column today and
  will select eighteen; it runs once per socket *subscription*, not per message, so this is not a hot
  path. One fewer public export beats one narrower query.
- **`routes/sessions.ts:273` is the same shape as `:211`/`:285`/`:316`/`:362`.** `requirements.md` §3.4
  listed it as a separate surface #2; it is not — it is a plain get-by-id inside
  `if (start.status === "admitted" && start.sessionId)`. One accessor, seven sites.
- **Accessors 3, 4 and 5 return the shaped result, not raw rows.** The reduce loops at
  `agent-orchestration-sessions.ts:156-159`, `:182-186` move into the owner with the query they belong
  to. The route keeps its `satisfies AgentRun*Response` assertion so the wire contract stays asserted at
  the wire.
- **The owner does not import a wire type.** Accessors return plain `Record`/array shapes;
  `@hyperidle/api-contract` and the `AgentRun*Response` types stay on the route side.
- **Two accessors take `effectivenessScore` at different types, deliberately.**
  `recordSessionMetadata` takes `effectivenessScore?: string`, `endSessionByCas` takes
  `effectivenessScore?: number`. Each is verbatim of its own call site — `routes/sessions.ts:352` has
  already called `.toString()` before the metadata patch is built, while `:188` calls `.toString()`
  inside the branch. Do not unify them; unifying is a behaviour change on one of the two paths and this
  work package moves code, it does not tidy it.
- **`listRunSummaries` returns the owner's `RunSummary[]`; the route keeps `satisfies AgentRunsResponse`.**
  If the two shapes ever diverge, the route's `satisfies` is what fails, at compile time, on the route
  side — which is where the wire contract belongs. The owner must not import `@hyperidle/api-contract`
  to close the gap.
- **Do not merge `endSessionByCas` with the existing `updateSessionRow`** (`transition-run.ts:363-380`).
  They share a CAS shape but not a field set. Both now live inside the owner, which is the point — the
  invariant is no longer split across a package boundary. Consolidating them is a separate judgement,
  not this work package's.

**Consumer mechanism.** `layers/agent-orchestration/src/**` imports these directly from
`@hyperidle/run-orchestration` — a layer reaching its own contents (`reach-your-own-contents`,
`scripts/lib/governance-model.ts:315-317`), already the established shape at `routes/sessions.ts:28`,
which imports `findSessionRequest` straight out of `@hyperidle/session-requests`. The layer's
`package.json` already declares `@hyperidle/run-orchestration` as a dependency — no manifest change.

### 3.2 `userSkills` — no owner, no accessors: the table is deleted

**Ruling 4.** `layers/core-api/users` grows nothing. `user-skill-store.ts` is not written,
`findUserSkill` / `listUserSkills` / `setSkillAutonomyLevel` are not added, and
`SettingsUserDirectory` gains no method. The nine production sites clear because the table, its two dead
endpoints, its unreachable delegation port and its settings seed are removed.

The full plan — schema, migration, endpoints, the delegation cascade and where it stops, settings, evals,
tests, registry and docs — is [§11](#11-ruling-4--deleting-user_skills).

### 3.3 `policy` owns `propagationLog` — 2 accessors

| accessor | signature | semantics | production caller |
|---|---|---|---|
| `reapTerminalPropagationLog` | `(db: HyperIdleDb, termCutoff: string) => Promise<void>` | deletes rows with `createdAt < cutoff` and `status in ("applied","skipped")` — verbatim `layers/core-api/src/service-bootstrap.ts:135-143` | `layers/core-api/src/service-bootstrap.ts`'s retention sweep |
| `recordPropagationHop` | `(db: HyperIdleDb, entry: LogPropagationEntry) => Promise<void>`, where `LogPropagationEntry` is **the existing interface at `lifecycle-propagation.ts:187-197`, unchanged**: `{ sourceLevel: string; sourceId: string; sourceEvent: string; targetLevel: string; targetId: string; targetTransition: string \| null; status: string; failureReason?: string; attempts?: number }` | verbatim `logPropagation` (`:199-216`): the owner fills `id: crypto.randomUUID()`, `attempts: entry.attempts ?? 1`, `failureReason: entry.failureReason ?? null`, `createdAt: now`, and **`appliedAt: entry.status === "applied" ? now : null`** — conditional, not unconditional | `layers/core-api/work/src/bet-kill-cascade.ts:134` via a DI port |

**`recordPropagationHop` is `policy`'s existing private `logPropagation`** (`lifecycle-propagation.ts:199-216`)
made public under a name that says what it records — **the same function and the same parameter
interface, renamed and exported, with no field dropped and no branch flattened.** An earlier revision of
this plan declared a narrower parameter shape (no `failureReason`, no `attempts`) and described
`appliedAt` as unconditional. Both were wrong and the builder must not implement them: `policy`'s own
in-package callers pass `failureReason` (e.g. `lifecycle-propagation.ts:243-251`, the
`outcome does not trigger propagation` skip), and `appliedAt` is `entry.status === "applied" ? now : null`
at `:215`. Dropping the optional fields breaks the internal callers at typecheck; flattening `appliedAt`
would silently stamp an applied-time on a `skipped` row, which typecheck does not catch. This is the one place the relocation *consolidates*
rather than merely moves: `bet-kill-cascade.ts:120-123`'s own comment says its row shape "mirrors
fabric's `logPropagation` field-for-field", a hand-maintained duplicate. Routing the cascade through the
owner's builder deletes that hazard. The two builders are already field-identical for the cascade's
inputs (`status:"applied"` ⇒ `appliedAt = now`; `attempts ?? 1` ⇒ `1`; `failureReason: null`), so this is
behaviour-preserving for the cascade's inputs, and `AF12-bet-cascade.integration.test.ts` covers the
fields it covers (§8.3, and read the exact list there before relying on it).

**`reapPropagationLog` is deleted from `service-bootstrap.ts`.** Its `@lore AU20 C1` says it was exported
purely for test coverage; after the move that coverage lives at the owner, and the layer keeps no export.

**Consumer mechanism.**
- `layers/core-api/src/service-bootstrap.ts` imports `@hyperidle/policy` directly — it already does, at
  `:34-35`. Layer reaching its own contents, silent.
- `work/bet-kill-cascade.ts` receives a DI port. `BetKillCascadeDeps` already carries a
  `runOrchestration` port wired at `layers/core-api/src/routes/bets.ts` (its `@lore AU26 H2`) — add
  `policy: { recordPropagationHop }` beside it, wired at the same site. `work` and `policy` are both
  core-api services ⇒ silent.

### 3.4 `work` owns `taskDispatchAttempts` — 1 new method

Added to the existing `taskDispatchAttemptStore` (`layers/core-api/work/src/work-service.ts:60-115`).

| accessor | signature | semantics | production caller |
|---|---|---|---|
| `taskDispatchAttemptStore.insertAttempt` | `(exec: WriteExecutor, input: { taskId: string; occasion: string; agentId: string; predecessorSessionId: string; now: string }) => Promise<{ id: string }>` | **computes the ordinal itself** — `count of existing rows for taskId + 1` — inserts with `status: "requested"` and `createdAt`/`updatedAt` = `now`, returns the generated id | `layers/core-api/policy/src/handoff-protocol.ts:317-330` via `PolicyDeps.work` |

This is the one place the plan decomposes a two-statement sequence into a single owner call: the read at
`:317-320` exists only to compute `existing.length + 1`, so the ordinal invariant moves into the owner
with the insert and the read disappears from `policy` entirely. `insertAttempt` is deliberately generic —
`occasion` is the caller's word, not `work`'s.

**Must accept the caller's transaction.** `handoff-protocol.ts:311-330` runs inside a `tx` alongside
`deps.work.updateTaskById(tx, …)`, and the resulting `attemptId` feeds
`deps.taskRunResolver.resolve(tx, attemptId)` at `:337`. A door that opened its own transaction would
split an atomic write. `taskDispatchAttemptStore`'s four existing methods already take
`exec: WriteExecutor`; the fifth does the same.

**Consumer mechanism.** `PolicyDeps.work` already exists and already carries `updateTaskById(tx, …)`;
add one method. Wired at `layers/core-api/src/service-bootstrap.ts:217` (`const policyDeps: PolicyDeps`),
which already imports `@hyperidle/work` at `:47`. Same layer ⇒ silent.

### 3.5 `agent-run-config`, `credentials`, `filesystem-mounting` — zero accessors, zero code

`agentRunConfig` and `teamRunConfigDefaults` are touched only by `agent-run-config`
(`agent-run-config-store.ts:21,81,104,147`; `team-run-config-defaults-store.ts:17,47,60`), and the schema
itself already records the intent (`framework/db/src/schema.ts:47-48`). `serverCredentials` is touched
only by `layers/core-api/credentials`; `filesystemCaptures` only by
`layers/agent-orchestration/filesystem-mounting`. All four are registry lines. See §6 items 1 and 2 for
the two that are corrections rather than fills.

### 3.6 `tool-handlers` — one port method

`write_session_notes` (`tool-handlers/src/tool-definitions.ts:592-594`) writes the notes file to disk and
then updates `sessions.notes`. The disk write stays; the DB write goes to the owner.

Add to `ToolHandlersPorts` (`layers/agent-orchestration/tool-handlers/src/ports.ts`):

```
sessions: { writeNotes(db: TDb, sessionId: string, notes: string): Promise<void> }
```

`TDb` because that is this file's own declared idiom for a db handle crossing the port (its header:
"Types are declared locally … or a narrow generic `TDb`"). The handler calls
`ports.sessions.writeNotes(ctx.db, ctx.sessionId, bodyOnDisk)` and stops importing `sessions`.

**Wired at `layers/core-api/src/services/tool-handlers-bindings.ts`**, the single wiring site for
`ToolHandlersPorts` in the tree. That file must then import `@hyperidle/run-orchestration`, which adds
**exactly one** `layer → service (other layer) [import]` production warning — measured, 107 → 108
(feasibility F4). See §6 item 4 for the alternative and why this is the recommendation.

### 3.7 The `bets` zod-schema import

`layers/core-api/src/schemas/bet.schema.ts:15` imports `selectBetSchema` from `@hyperidle/db/zod-schemas`.
`scripts/lib/db-surfaces.ts:118-133` resolves a `createSelectSchema(bets)` export to a `db:table` reach on
`bets` — deliberately, because "allowing the generated schema while forbidding the table would be a hole
straight around the ownership rule". It is the **only** site in `layer → db:table (other) [import]` at
baseline, and that key cannot be deleted while it stands.

**Means:** `@hyperidle/work` — the owner of `bets` — re-exports the schema under its own name from
`layers/core-api/work/src/index.ts`:

```
export { selectBetSchema as betRowSchema } from "@hyperidle/db/zod-schemas";
```

`bet.schema.ts` then imports `betRowSchema` from `@hyperidle/work`: a core-api layer file naming a
core-api service, `reach-your-own-contents`, silent (the same crossing `service-bootstrap.ts:47` already
makes without a finding). The owner naming its own table's schema is legal by definition.

This is not the transitive-table hole the `users` barrel warns against: a zod schema carries no Drizzle
table reference and cannot be handed to `db.select().from(…)`. Leave `selectBetSchema` in place in
`framework/db/src/zod-schemas.ts` — it sits among sibling `select*Schema` exports with no production
consumer and deleting it is not this work package's business.

---

## 4. The terminal transition

This is the single most delicate piece of the work package and it is specified here in full.

### 4.1 What exists

`layers/agent-orchestration/src/routes/sessions.ts:89-213`, `applyStateChangePatch`. Three branches:

1. **already terminal** → 409, no write (`:97-105`);
2. **a live runtime entry exists** → `transitionRun(… request-termination)`, then
   `sessionRunRegistry.abort(sessionId)`, then 202 — **no `sessions` write at all** (`:118-148`);
3. **no live runtime** → terminalize the correlated request (`:154-176`), then a CAS-guarded direct
   write `active → terminal` (`:192-196`), then `session_ended` **iff the CAS affected a row**
   (`:199-209`), then a read-back and 200 (`:211-212`).

Branch 3 is the only one that writes `sessions`, and it is the only branch that moves.

**The invariant.** `.where(and(eq(sessions.id, id), eq(sessions.state, "active"))).returning({ id })` —
the `active` predicate makes the write idempotent under a concurrent runtime teardown, and
`transitioned.length > 0` is what gates the emit. If a caller can perform the write without the
predicate, or emit without consulting the rowcount, a session can be double-ended and `session_ended`
fires twice. The route's own comment names this "§4.3 rowcount invariant" (`:86`, `:198`).

The invariant is **already split** today: `run-orchestration` performs the terminal write on every path
where a runtime is live (`end-run-for-handoff.ts:40`, `runtime-reapers.ts:193`, `transition-run.ts:371`,
`request-run-stop-for-tasks.ts:55`, `start-runtime.ts:37`), and the layer route performs it on the
no-live-runtime path. Naming `run-orchestration` the owner is the only shape under which that split
closes rather than being institutionalised behind a port.

### 4.2 What moves, and how

`routes/sessions.ts:178-212` — the outcome resolution, the update payload, the CAS, the emit and the
read-back — becomes one exported function in `session-store.ts`:

```
endSessionByCas(
  db: HyperIdleDb,
  eventBus: EventBus,
  input: {
    readonly sessionId: string;
    readonly agentId: string | null;      // from the caller's pre-read row — the event payload
    readonly taskId: string | null;       // from the caller's pre-read row — the event payload
    readonly state: "done" | "crashed";
    readonly outcome?: string;            // caller override; default derives from `state`
    readonly notes?: string;
    readonly effectivenessScore?: number;
    readonly actor?: string;
    readonly now: string;
  },
): Promise<Session | undefined>
```

Body, verbatim from `:179-212`:

1. `const outcome: SessionOutcome = state === "crashed" ? "crashed" : "completed";`
2. build the update payload — `state`, `outcome: input.outcome ?? outcome`, `notes: input.notes`,
   `endedAt: now`, and the three `effectiveness*` fields only when `effectivenessScore !== undefined`
   (`effectivenessRecordedBy = actor ?? agentId`);
3. the CAS: `update(sessions).set(payload).where(and(eq(id), eq(state, "active"))).returning({ id })`;
4. **iff `transitioned.length > 0`**, `eventBus.emit<"session_ended">({ type, streamId: sessionId,
   sessionId, agentId, taskId, timestamp: Date.now(), outcome } satisfies SessionEndedEvent)`;
5. read the row back and return it.

The route becomes `return { status: 200, body: await endSessionByCas(db, eventBus, {…}) }`. Both
`routes/sessions.ts:193` (the write) and `:211` (the read-back) clear with this one accessor.

### 4.3 The three properties that make this correct, and how each is held

| property | how it is held after the move |
|---|---|
| the CAS predicate cannot be dropped | it is inside the accessor; the accessor takes no `where` and exposes no update path. The only way to write a terminal state through this door is with the predicate |
| the emit cannot fire on a zero-row CAS | the emit is inside the same function, gated on the same `transitioned.length`. **The accessor takes an `EventBus`, not just a `db` handle** — that is the whole reason the surface is a transition and not a setter |
| the emit cannot fire twice **through this door** | `endSessionByCas` has exactly one caller, and its emit is gated on its own CAS rowcount. It cannot double-emit for one transition |

**The precise post-condition — stated because it is weaker than "the invariant becomes universal".**
After the move there are **three** other terminal-write paths, not two, and they do not all hold the same
invariant:

| path | `active` CAS predicate | emit gated on rowcount |
|---|---|---|
| `endSessionByCas` (this plan) | yes | yes |
| `transition-run.ts:202` `endSession` | yes (`updateSessionRow`, `:363-380`) | yes |
| `transition-run.ts:275` `crashSession` | yes (same helper) | yes |
| `runtime-reapers.ts:193-209` (the stale-routine-session reaper) | **no** — `.where(eq(sessions.id, session.id))` only | **no** — `eventBus.emit({ … outcome: "crashed" })` runs unconditionally at `:198-209` |

So what this work package establishes is narrower and true: **every `sessions` terminal write and every
`session_ended` emit in the tree ends up inside `run-orchestration`, and no package outside the owner can
perform either.** It does not establish that every terminal write is CAS-guarded. `runtime-reapers.ts` is
pre-existing, is already inside the owner, and is out of scope (§10) — it is named here so no reader
mistakes the consolidation for a repair, and so a future reader does not cite §4.3 as proof of an
invariant the reaper does not hold. Do not "fix" it in this work package; it is a behaviour change
(the reaper would stop emitting for a session another path already ended) and it needs its own evidence.

**Dependencies already in place.** `run-orchestration/package.json` declares `@hyperidle/shared` (which
exports `EventBus`, `SessionEndedEvent`, `SessionOutcome`) and `@hyperidle/db`. `transition-run.ts`
already takes `deps.eventBus` and already emits `session_ended`. Nothing new is added to the package's
dependency set, and no new dependency direction is created.

**What does NOT move.** The 409 guard (`:97-105`), the live-runtime abort branch (`:118-148`), the two
`transitionRun` calls that terminalize the correlated request (`:156-175`), and the `sessionRunRegistry`
check. Those are request-lifecycle and HTTP concerns, they touch `agentSessionRequests` and the in-memory
registry rather than `sessions`, and they belong to the route. The route keeps its
`../services/run-transition.js` binding unchanged.

**Ordering hazard the builder must preserve.** The request-side `terminalize` at `:169-175` happens
*before* the session CAS. Do not reorder: the route's comment at `:150-153` says the request/inbox side
of the contract must not depend on a live runtime, and a reordering would change which side wins a race.

---

## 5. Cross-owned-table reads

`plan.md:31` is absolute: a cross-owned-table join decomposes into one call per owning service. No
allowlist, no carve-out, however small.

### 5.1 Measured result: there are no cross-owned-table queries to decompose

Every production query touching the six tables and the eleven `(other)` sites was read. **Not one joins
across an ownership boundary.**

| table | reads checked | verdict |
|---|---|---|
| `sessions`, layer-world (12) | `routes/sessions.ts:211,246,250,273,285,316,362`; `routes/agent-orchestration-sessions.ts:98,149,179,206`; `session-stream-hub.ts:73` | all single-table. The activity route composes the row with an **in-process buffer**, not a second table (`routes/sessions.ts:290`) |
| `sessions`, `run-orchestration` (9 after §11.5.3 deletes `concurrency.ts`) | `create-bare-run.ts:67`, `provisioner.ts:946,993`, `request-run-stop-for-tasks.ts:45`, `runtime-reapers.ts:69,178`, `runtime.ts:51,79`, `start-runtime.ts:22` (and `concurrency.ts:67`, which the deletion removes) | all single-table — `rg 'leftJoin|innerJoin'` over `run-orchestration/src/*.ts` returns nothing |
| ~~`userSkills`~~ | — | **the table is deleted (§11).** All five reads were single-table; none survives |
| `propagationLog` (2 reads/deletes outside the owner) | `service-bootstrap.ts:136`; owner-side `lifecycle-propagation.ts:588` | single-table |
| `taskDispatchAttempts` (2 outside the owner) | `handoff-protocol.ts:319`; owner-side `task-state-machine.ts:116`, `work-service.ts:65,79,97,105` | single-table |
| `serverCredentials` (8) | `credential-resolver.ts:52`, `credential-store.ts:54,59,92,110,119` | single-table |
| `filesystemCaptures` (1) | `mounter-registry.ts:339` — an insert, never read in production | n/a |

Two joins exist near this work but neither crosses an ownership boundary:
`plugin-configuration.ts:524-525` joins `pluginConfigurationDefaults × plugins × configurationOverrides`
(all `settings`), and `filesystem-registry.ts:41` joins `filesystemInjections × filesystems` (both
`filesystems`). Both stay legal under every owner assignment in this plan.

**Consequence:** AC #3 is satisfied by the mechanism choices in §3, not by query surgery. `plan.md:11`'s
"three service reads" are three single-table reads that become owner calls.

### 5.2 Foreign-key edges that cross an owner, and why they are not AC #3's business

Two FKs will point across an ownership boundary after this lands: `sessions.taskId → tasks` (`work`) and
`filesystemCaptures.sessionId → sessions` (`run-orchestration`). AC #3 governs *queries*, not referential
constraints, and the only schema change in scope is the `user_skills` drop. Recorded so a reviewer does
not read an FK as a violation.

The third edge an earlier revision listed — `userSkills.userId → users` — disappears with its table.
It is an **outbound** FK owned by the dropped table, so `users` is not modified; §11.3 states this with
its evidence.

### 5.3 Two doors must accept the caller's transaction

| site | why | shape |
|---|---|---|
| `policy/handoff-protocol.ts:317-330` → `work.insertAttempt` | the insert shares a `tx` with `deps.work.updateTaskById(tx, …)` at `:311` and its returned id feeds `deps.taskRunResolver.resolve(tx, …)` at `:337` | `(exec: WriteExecutor, …)` — matches the four existing `taskDispatchAttemptStore` methods |
| `work/task-state-machine.ts:115-128` | inside `work`'s own `tx`; `work` owns the table, so this is legal unchanged and is **not** relocated | — |

`work/task-state-machine.ts:115-128`'s own ordinal computation is **not** consolidated into
`insertAttempt`. The two are legal side by side (`work` owns the table), consolidating them is a
behaviour question rather than a placement one, and §10 forbids refactoring an owner's in-package sites
here. Recorded so nobody reads §3.4 as leaving one copy of the invariant.

`policy.recordPropagationHop` takes `HyperIdleDb`, matching both of its callers
(`bet-kill-cascade.ts:134` and `lifecycle-propagation.ts`'s own uses), which are not inside a shared
transaction with the write.

---

## 6. The founder rulings — decided

Recorded at the concept gate on 2026-08-09 (`.pipeline/work/AU30/founder-rulings.md`). These are no
longer decisions to make; they are constraints on the build. The evidence each rests on is kept, because
a builder who understands why a ruling went the way it did will not accidentally undo it.

### 6.1 Ruling 1 — `run-orchestration` owns `sessions`. **DECIDED.** No new package.

`sessions` is the product primitive Session, distinct from `loginSessions` (`users`),
`agentSessionRequests` (`session-requests`) and the in-memory `sessionRunRegistry`. `run-orchestration`
already consumes the row for its own decisions — capacity gating, boot recovery, the live-runtime
terminal writes. Naming it owner legalises 74 sites with zero code change; any other owner leaves 30
additional sites, every one inside `run-orchestration`, each needing an injected port because a service
may never name a sibling service (`scripts/lib/governance-model.ts:154-164`).

**Consequences carried into the build:** §3.1's eight accessors are written into
`@hyperidle/run-orchestration`'s barrel; §4's terminal transition moves there; §7.2 commit 6 is the
largest commit. The "is `run-orchestration` due to be split" question that revision 2 raised is answered
**no** — nothing in `.pipeline/AU.md` registers such a work package, and the ruling names this package
owner outright.

### 6.2 Ruling 2 — correct `filesystemCaptures` to `filesystem-mounting`. **DECIDED.**

`governance/table-owners.json:47` names `filesystems`, which never touches the table.
`layers/agent-orchestration/filesystem-mounting/src/index.ts:2-20` — the package's own barrel header —
already records founder-approved ownership of `filesystem_captures`. One registry line, **zero code**,
2 sites cleared (measured, feasibility F3).

The genuine counter-argument is recorded so nobody re-raises it as new: `filesystemCaptures` is the
symmetric twin of `filesystemInjections`, which `filesystems` owns, and the row carries FKs to both
`filesystems` and `sessions` (`framework/db/src/schema.ts:1284-1291`). It did not outweigh a recorded
founder-approved split the code already documents.

### 6.3 Ruling 3 — correct `serverCredentials` to `core-api/credentials`. **DECIDED.**

The table is registered to `connections`, which never touches it; `connections/src/index.ts:16-18` says
the catalog "genuinely stays core-side". All eight production sites are in `layers/core-api/credentials`,
whose barrel calls itself the SQL-owning service for `server_credentials` (`credentials/src/index.ts:1-19`).
The ruling notes this was forced rather than chosen: routing through the registered owner would be
cross-layer, where dependency injection is forbidden (`governance-model.ts:265-289`), so AC #2 and AC #3
would be **unsatisfiable** for those 8 sites under any other choice. One registry line, zero code,
8 sites cleared (feasibility F3).

### 6.4 Ruling 4 — delete `user_skills`. **DECIDED — and this is the scope change.**

The full plan is [§11](#11-ruling-4--deleting-user_skills). The short form: the table is `agent_skills`
renamed by a mechanical sweep, its columns are the per-skill autonomy score sheet that
`docs/product/product-decisions.md:13` killed outright, and **no production insert exists anywhere** — so
a production database has it permanently empty. Deletion satisfies "every table names exactly one owner"
by removing the table and clears 9 production sites without adding a single accessor.

**Explicitly not foreclosed** (`founder-rulings.md:74-78`): whether skills become knowledge items stays
open at `docs/product/product-decisions.md:24`. Both plausible destinations — a knowledge kind, or
capability-side alongside the tool catalog where `ConfigurationKind` already reserves a `"skill"` slot —
lead away from this table. §11.6 keeps that slot intact for exactly this reason.

### 6.5 Ruling 5 — accept the one net-new `tool-handlers` warning, for now. **DECIDED.**

§3.6's wiring of `ToolHandlersPorts.sessions.writeNotes` at
`layers/core-api/src/services/tool-handlers-bindings.ts` adds **exactly one**
`layer → service (other layer) [import]` production warning — measured, not estimated (feasibility F4).
The group sits at `warn` (`governance/rule-severity.json:16`) and AU31 clears it entirely.

> **STANDING INSTRUCTION — read this before rebasing.**
> When this branch rebases onto AU31, the `tool-handlers` sessions wiring **must be resolved, not
> carried** — and it must be resolved **by copying the pattern AU31 introduces**, never by inventing a
> second one. Do not build the zero-crossing alternative (constructing the tool context inside the owner,
> baking `writeSessionNotes` onto `ToolContext` beside `onAbortSession` at
> `run-orchestration/src/provisioner.ts:1195`) in this work package. It is better architecture and it is
> explicitly ruled out here.

**Arithmetic note that makes this cheaper than it looked.** Ruling 4 deletes two production imports from
the *same group* — `readAgentRunConfig` and `isAgentAtCapacity` at
`routine-scheduler-bindings.ts:18,39`, both `layer → service (other layer) [import]`. So the group goes
**36 → 35** across this work package: the one net-new entry is more than absorbed, and the group ends
below its baseline rather than above it (§7.4).

### 6.6 Companion violations after relocation — a gate, not a risk to design around

Not a ruling; carried forward because it is still the one unmeasured thing. The development world reads
**0** with all owners assigned (measured, feasibility F2), and the mechanism explains why: a companion
group needs an exported top-level *function declaration* in the owning package that **unconditionally**
inserts two or more tables that package both owns and elsewhere revises
(`scripts/lib/crossing-detectors.ts:362-451`). §4's `endSessionByCas` is an **update**, so it cannot form
one. Ruling 4 only removes code, so it cannot form one either. Nonetheless the builder re-runs
`npx tsx scripts/governance-lint.ts` after the last relocation and confirms the development world still
reads 0 — every development rule is at `error`, so any companion violation must clear in this same pull
request (`plan.md:34`).

## 7. Order, ownership, and what must land together

### 7.1 The mechanical fact that sets the order

`layer → db:table (other) [table:read]` and `[table:write]` are **absent** from
`governance/rule-severity.json` and therefore resolve to `error`
(`governance/README.md:74-76`; `severity.severity[ruleKey] ?? "error"`, `scripts/governance-lint.ts:229-230`).
So **naming an owner converts every layer-world site against that table into a hard build failure the
moment the registry line lands.** Measured with the table still present and all eight owners assigned:
107 warnings and **20 errors, exit 1** (feasibility F2). Ruling 4 removes five of those errors before any
owner is named, leaving 15.

| table | layer-world sites that become errors |
|---|---|
| `sessions` | 14 — `routes/sessions.ts` (7 reads + 2 writes), `routes/agent-orchestration-sessions.ts` (4 reads), `services/session-stream-hub.ts` (1 read) |
| ~~`userSkills`~~ | **0 — deleted (§11). Its five would-be errors never come into existence** |
| `propagationLog` | 1 — `service-bootstrap.ts:136` |
| `taskDispatchAttempts`, `agentRunConfig`, `teamRunConfigDefaults`, `serverCredentials`, `filesystemCaptures` | 0 |

`plan.md:28`'s "sequence the five cheap assignments first" therefore holds for the **three** tables with
no layer-world site, not five. Only `agentRunConfig` and `teamRunConfigDefaults` are genuinely one-line
fills, and `serverCredentials` / `filesystemCaptures` are one-line corrections.

### 7.2 The order — the tree is PASS after every commit

**The deletion goes first.** It is a different shape from every other commit here — a migration, two HTTP
endpoints, a cascade through two layers, eval scenarios and thirteen test files — and it is the only
commit that *removes* an unowned table rather than assigning one. Putting it first buys three things:
the `unowned` map shrinks from six tables to five before any assignment, so the ladder is monotone; the
`userSkills` relocation commit disappears from the schedule entirely rather than being planned and then
withdrawn; and `run-orchestration`'s barrel is already shrunk by one export when commit 6 grows it by
eight, rather than the reverse. It also puts the largest, least reversible change on a clean base where
its own `verify` is unambiguous.

| # | commit | contents | end state |
|---|---|---|---|
| 1 | **delete `user_skills`** | §11 in full — `schema.ts` + barrel + zod; `0056_drop_user_skills.sql` + the `_journal.json` entry; `routes/users.ts`'s two dead endpoints; the delegation cascade through `concurrency.ts`; the `plugin-configuration.ts` seed; the eval rework; the test deletions; registry `unowned.tables` loses `userSkills` and `totals` → 44/39/5; the four doc lines. **Indivisible** — the schema drop, the registry line and every call site must land together or the tree does not build (`totals.tables !== liveTables.size`, `governance-registry.ts:147-149`) | PASS, 191 → 178 warn |
| 2 | free registry fills | `agentRunConfig` → `agent-run-config`, `teamRunConfigDefaults` → `agent-run-config`. Registry only, `totals` → 44/41/3 | PASS, → 171 warn |
| 3 | free registry corrections | `serverCredentials` → `credentials`, `filesystemCaptures` → `filesystem-mounting`. Registry only. Fix the false comment at `connections/src/index.ts:7-9` (§9) | PASS, → 161 warn |
| 4 | `taskDispatchAttempts` | registry → `work`; **`work/src/__tests__/task-dispatch-attempt-store.integration.test.ts` written first, red on the missing export** (§8.3.2 test 2); then `taskDispatchAttemptStore.insertAttempt`; `PolicyDeps.work` grows one method, wired at `service-bootstrap.ts:217`; `handoff-protocol.ts:317-330` decomposed. The §8.3.3 mutation reds for A1-A3 are run and recorded before the commit closes. `totals` → 44/42/2 | PASS |
| 5 | `propagationLog` | **registry + relocation inseparable** — `service-bootstrap.ts:136` is a layer write. `policy` exports `reapTerminalPropagationLog` + `recordPropagationHop`; `service-bootstrap.ts` drops its local reaper; `BetKillCascadeDeps.policy` wired at `routes/bets.ts`. `totals` → 44/43/1 | PASS |
| 6 | `sessions` | **registry + relocation inseparable** — 14 layer-world sites. **`run-orchestration/src/__tests__/session-store.integration.test.ts` written first, red on the missing export** (§8.3.2 test 1); `run-orchestration/src/session-store.ts` + barrel (8 accessors, §3.1); `routes/sessions.ts`, `routes/agent-orchestration-sessions.ts`, `session-stream-hub.ts` retargeted; §4's transition moved; `ToolHandlersPorts.sessions.writeNotes` + its wiring (Ruling 5). The §8.3.3 mutation reds for the four transition assertions are run and recorded before the commit closes. `totals` → 44/44/0 | PASS, 0 table crossings, `unowned.tables` empty |
| 7 | `bets` zod | `@hyperidle/work` re-exports `betRowSchema`; `bet.schema.ts:15` retargeted. Order-independent — may land anywhere before 8 | PASS |
| 8 | **promotion** | delete the ten table keys from `governance/rule-severity.json` (23 → 13 keys). Nothing else | PASS — and the rules now bite |

**The rule the builder must not break:** for commits 5 and 6 the registry edit and the layer-side
relocation are **one commit**. A commit that names the owner without moving the layer-side accessor
leaves `main`-shaped CI red. Commit 1 is indivisible for its own reason (the registry must not name a
table the schema no longer declares, and vice versa). Commits 2, 3, 4 and 7 have no layer-world site and
are individually safe.

**Commit 8 is last, and it is what makes the rule bite.** Until it lands the table rules still warn on
every violation including new ones (`governance/README.md:78-80`), so the intermediate states are not
"stalled" — they are exactly as enforced as `origin/main` is today. `plan.md:28` asks that this be said
explicitly, and it is: **no table rule promotes until the last unowned table is owned, because the group
key carries no table name.**

### 7.3 One builder, sequential — one technical task

**Recommendation: one builder, one technical task with the eight ordered steps above.**

The honest reason is overlap, not size:

- **every step edits `governance/table-owners.json`** — a 60-line file with a `totals` block that must
  stay consistent. Parallel leaves conflict on every merge;
- **commit 8 is a strict join point.** It requires the whole tree clean, so a parallel schedule saves
  nothing on the critical path — the last leaf plus `verify` is the critical path either way;
- **commit 1 spans both layers on its own** (`core-api` routes and settings, `routine`, plus
  `run-orchestration`'s `concurrency.ts`), so it cannot sit inside either leaf of a two-leaf split;
- **commits 4 and 5 both touch `layers/core-api/policy/src/` and `layers/core-api/work/src/`**; 5 and 6
  both touch core-api's composition surface;
- **commit 6 is over half the remaining work and cannot be split further** — the fourteen layer-world
  sites are in three files that all import the same accessor module.

If the orchestrator does choose to parallelise, commit 1 must land **before** the split, not inside it —
it is the one commit whose files belong to both leaves. After it, the single safe seam is:

| leaf | owned writes | seam |
|---|---|---|
| **agent-orchestration leaf** | `run-orchestration/src/session-store.ts` + `src/index.ts`; `agent-orchestration/src/routes/sessions.ts`, `src/routes/agent-orchestration-sessions.ts`, `src/services/session-stream-hub.ts`; `tool-handlers/src/ports.ts`, `src/tool-definitions.ts`; `core-api/src/services/tool-handlers-bindings.ts` | the `sessions` line in `table-owners.json`, and the one wiring line in `tool-handlers-bindings.ts` |
| **core-api leaf** | `policy/src/lifecycle-propagation.ts` + barrel, `src/handoff-protocol.ts`; `work/src/work-service.ts`, `src/bet-kill-cascade.ts`, `src/index.ts`; `core-api/src/routes/bets.ts`, `src/schemas/bet.schema.ts`, `src/service-bootstrap.ts` | the other six lines in `table-owners.json` |

One leaf must own the registry file and the other rebases. **An integration step is then required**, and
it is commit 8: a single agent runs the full lint, confirms zero table crossings and zero development
violations, and deletes the ten keys. I do not recommend this split — the coordination is close to the
whole saving.

### 7.4 The violation arithmetic, end to end

Every figure below is either measured in this worktree or derived from a measured one by subtracting an
enumerated set. Nothing is estimated.

| point | production warnings | errors | source |
|---|---|---|---|
| baseline (`origin/main`, this worktree) | **191** | 0 | measured, feasibility F1/F8, re-run in this phase |
| after commit 1 (deletion) | **178** | 0 | 191 − 13; the 13 are enumerated in feasibility F11 |
| after commit 2 (fills) | **171** | 0 | 178 − 7 (derived: the fills cleared 7 in the pre-ruling ladder) |
| after commit 3 (corrections) | **161** | 0 | 171 − 10 (measured, F3: 8 + 2) |
| commits 4-6 (registry + relocation) | intermediate | up to 15 transiently *within* a commit, 0 at every commit boundary | F2 measured 20 errors with the table present; Ruling 4 removes 5 |
| **final, after commit 8** | **90** | 0 | 91 non-table warnings (F2: 107 − 16 table) − 2 (Ruling 4 deletes `routine-scheduler-bindings.ts:18,39`) + 1 (Ruling 5's `tool-handlers` import) |

**The two numbers a reviewer should check first.** Table crossings end at **0** — that is AC #2, and it
is what commit 8's key deletions then enforce at `error`. Total production warnings end at **90**,
against 191 at baseline and against the 92 this plan projected before the rulings. The 2-point
improvement is Ruling 4's: `layer → service (other layer) [import]` goes **36 → 35** even after Ruling 5
adds one to it (§6.5).

## 8. Evidence plan

`CLAUDE.md`'s First Principle: a static codebase property is enforced by a lint rule or the type system,
never by a test that reads the filesystem; runtime behaviour gets a real test that imports code and
asserts on its behaviour.

### 8.1 Which AC gets which

| AC | kind | mechanism | can it go red? |
|---|---|---|---|
| 1 — every table owned | **static** | `npx tsx scripts/governance-lint.ts`. A table missing from the registry, and a registry entry naming a table the schema does not declare, are both already build errors by construction (`scripts/lib/governance-registry.ts:124-135`); `totals` must read 44/44/0 and `unowned.tables` must be an empty object | yes — red today for six tables |
| 2 — every access through the owner | **static** | governance-lint: zero production findings in any `db:table` group | yes — 100 findings today |
| 3 — no cross-owned-table query, no allowlist | **static + review** | governance-lint reports a foreign read inside a join like any other; §5's decomposition table is checked against the diff; `no-per-file-allowances` catches a governance-side carve-out | yes |
| 4 — the rules fail the build in both directions | **static, and demonstrated** | see §8.2 | yes — demonstrated |
| 5 — the ten keys removed | **static** | diff of `governance/rule-severity.json`: exactly 10 deletions, 23 → 13 keys. Lint's "ready to flip to error" NOTE must list **no** table key afterwards | yes |
| 6 — the bookkeeping mechanism stays gone | **static** | `no-per-file-allowances`, already registered and attack-tested (`scripts/rules/no-per-file-allowances.ts:32-39`) | yes |
| 7 — `verify` green; relocated behaviour unchanged | **runtime** | §8.3 | yes |
| `plan.md:33` — no production export only tests consume | **partly static** | §8.4 | partly |

### 8.2 AC #4 — the proof, and how it goes red

**Reference, do not reinvent:** `requirements.md` §6 already demonstrated this red in this worktree.

`governance-lint --attacks` is **not** the proof and must not be presented as one: the attack runner
overlays a synthetic tree and hardcodes `severityOf: () => "error"`
(`scripts/governance-lint.ts:155-160`), so it is blind to severity by construction and passes on the
pristine tree today with all ten keys still at `warn`. It proves the *detector* still recognises the
crossing — keep it there. (It also guarantees the rules stay registered after promotion: property 4 of
`governance/README.md:122`, "a registered rule with no attack case fails the build", is unaffected by
deleting a severity key.)

**The enforcement is key absence and nothing else** (`scripts/governance-lint.ts:229-230`). The probe,
run twice after commit 8 and reverted each time:

1. **layer direction** — add a genuine `from(sessions)` read plus its table-symbol import to a
   `layers/core-api/src/**` file. Expect `ERROR … layer → db:table (other) [table:read]` and
   `FAIL`, exit 1.
2. **service direction** — add a genuine `update(<some other service's table>)` to a service that does
   not own it. Expect `ERROR … service → db:table (other) [table:write]` and `FAIL`, exit 1.

Requirements' own run of shape 2 is the recorded precedent: with the keys present the same two crossings
reported `WARN` and the run exited **0**; with the keys deleted they reported `ERROR` and the run exited
**1**. Revert both probes; `git status` must show no tracked modification.

This is the same check `plan.md:61` writes as a validation scenario, and it is red today for exactly the
reason AC #4 exists.

### 8.3 AC #7 — runtime evidence, per relocated accessor

**The contract for the whole work package: every *existing* test file below stays green with import-path
edits only. No assertion in an existing test may change.** An assertion edit is a behaviour change and
must be argued in the pull request, not absorbed.

**The single exception, and it is not a relocation:** §11.7's expected-table-list edit in
`migration.integration.test.ts` and `pg-migration.integration.test.ts`. That edit *is* the red
demonstration for the `user_skills` drop, and it is permitted for the one reason that permits it — the
assertion's **subject** changed, not its behaviour. New evidence goes in new files, never by widening an
old one to cover something it does not.

| relocated surface | existing test that proves it, unmodified | what it exercises — exactly, not generously |
|---|---|---|
| `sessions` terminal transition (§4) | `layers/core-api/src/__tests__/sessions.integration.test.ts` — `AC11: PATCH /api/sessions/:id` (`:182-340`: done, crashed, 404, 400) | the no-live-runtime CAS path end to end through the real app + event bus, including `expect(emitted).toHaveLength(1)` on a live `session_ended` subscription |
| same, on the orchestration app | `layers/core-api/src/__tests__/two-app-mount-session-routes.integration.test.ts` | the route on its owning app, byte-identical URL |
| `recordSessionMetadata` (#7) | `layers/core-api/src/__tests__/AC1-session-effectiveness.integration.test.ts` | the effectiveness-only PATCH that never ends a session |
| `findSessionById` in the socket authorizer | `layers/agent-orchestration/src/services/__tests__/session-stream-hub.integration.test.ts` | fail-closed on an unknown run — i.e. that the accessor returns `undefined` rather than throwing |
| `writeSessionNotes` via the new port | `layers/core-api/src/__tests__/write-session-notes.integration.test.ts` | the tool's disk write **and** its `sessions.notes` write (`:130-139`) |
| ~~`userSkills` read + autonomy PATCH~~ | — | **no relocation: the table and both endpoints are deleted.** The tests that exercised them are deleted with them, never repointed — §11.9. What proves nothing depended on them is §11.4 and §11.7 |
| `reapTerminalPropagationLog` | `layers/core-api/src/__tests__/retention-reaper.integration.test.ts` (imports `reapPropagationLog` today — retarget the import to `@hyperidle/policy`, change nothing else) | the retention predicate |
| `recordPropagationHop` from the cascade | `layers/core-api/src/__tests__/AF12-bet-cascade.integration.test.ts` | **five fields, not "the row":** `sourceEvent` and `targetLevel` (via the `where` at `:248-253`, `:269-277`), `targetId`, `status` (`:255`, `:279`) and `targetTransition` (`:256`, `:280`), plus the idempotency property that a repeat writes no second row (`:298-318`). It does **not** assert `attempts`, `failureReason`, `appliedAt`, `createdAt`, `sourceLevel` or `sourceId`. That residue is covered by the signature being verbatim (§3.3) — not by this test |
| `insertAttempt` from the handoff | `layers/core-api/src/__tests__/handoff-to.integration.test.ts` | **the caller's arguments — and not the ordinal.** See §8.3.1 |
| `listSessions` / the three run-state reads | the existing orchestration route tests + `sessions.integration.test.ts` | the GET surfaces |

#### 8.3.1 The ordinal has no evidence in the repo today, and this plan adds it

`insertAttempt` is the **only** relocation here that is not a verbatim move: the caller-side
`select({id}).from(taskDispatchAttempts).where(eq(taskId, task.id))` at `handoff-protocol.ts:317-320` is
deleted and its result — `ordinal: existing.length + 1` (`:328`) — is re-derived inside the owner. An
earlier revision of this plan cited `handoff-to.integration.test.ts` as asserting the ordinal. **That was
false, and it was false about the one thing in this work package that most needed to be true.** Verified
in this phase:

- `rg -a 'ordinal' layers/core-api/src/__tests__/handoff-to.integration.test.ts` → **no match**;
  `rg -a 'taskDispatchAttempt' ` over the same file → no match. It never names the table.
- Repo-wide, `ordinal` appears in five test files and in every one it is a **seeded fixture value**
  (`task-run-resolver.integration.test.ts:130`, `work-session-end-reactions.integration.test.ts:178`,
  `agent-run-admission-failed-subscribers.integration.test.ts:183`,
  `context-bundle-sandbox-byte-parity.integration.test.ts:103`, `retention-reaper.integration.test.ts:107`),
  never an assertion.
- No production code reads it either: outside the schema, the only two occurrences are the two
  computations themselves (`handoff-protocol.ts:328`, `task-state-machine.ts:125`).
- `uniqueIndex("task_dispatch_attempts_task_ordinal_uq")` on `(task_id, ordinal)`
  (`framework/db/src/schema.ts:522`) does not rescue it: the handoff test seeds no prior attempt, so
  `existing.length` is 0 and an off-by-one collides with nothing and passes green. There is no `check`
  constraint on the column.

**What `handoff-to.integration.test.ts` does prove, stated so it is not over-claimed again.** The insert
sits inside the handoff `tx`, and the id it returns feeds `deps.taskRunResolver.resolve(tx, attemptId)` at
`:337`. `resolveTaskRunRequest` re-loads the attempt and its task and throws
`TaskRunSourceUnavailableError` if the attempt is missing, its status is not `"requested"`, the task is
missing or ineligible, or `task.ownerAgentId !== attempt.agentId`
(`layers/core-api/work/src/task-run-resolver.ts:183-192`). So a wrong `taskId`, a wrong `agentId` or a
wrong `status` on the relocated insert rolls the whole handoff back and fails
`expect(result.success).toBe(true)` at `:169`. That is real coverage of the caller's **arguments**. It is
no coverage at all of the **ordinal**, because nothing downstream reads it.

#### 8.3.2 Two new test files — and now it is two, not one

An earlier revision committed to "one new test, and only one". That was one too few. The ordinal is a
second relocated invariant and it needs its own file; stretching an existing test to reach it would be
exactly the move this plan tells the builder not to make.

**New test 1 — `layers/agent-orchestration/run-orchestration/src/__tests__/session-store.integration.test.ts`**
(service integration, `{ db, eventBus }` fixtures; `run-orchestration` is a registered vitest project and
already holds ~20 `*.integration.test.ts` files on that shape). Asserts:

1. **the CAS refuses a non-`active` row** — seed a `done` session, call `endSessionByCas`, assert the row
   is byte-unchanged **and no `session_ended` was emitted**;
2. **`session_ended` fires exactly once on a real transition** — seed an `active` session, call once,
   assert one emit carrying the right `sessionId`/`agentId`/`taskId`/`outcome`; call again, assert the row
   is unchanged and **no second emit**;
3. **the returned row is the post-write row**, so the route's dropped read-back at `:211` is genuinely
   equivalent;
4. **the `outcome` asymmetry is preserved** — call with `state: "done"` **and** an explicit
   `outcome: "stopped"` override; assert the persisted row's `outcome` is `"stopped"` (the override,
   `routes/sessions.ts:183`) while the emitted event's `outcome` is `"completed"` (the derived value,
   `:207`). This closes the one place a builder could "tidy" two values into one and ship green.

**New test 2 — `layers/core-api/work/src/__tests__/task-dispatch-attempt-store.integration.test.ts`**
(service integration, `{ db }` fixture from `@hyperidle/db/test-fixtures`; `layers/core-api/work` is a
registered vitest project, `vitest.config.ts:34`, and already holds five `*.integration.test.ts` files).
It calls `taskDispatchAttemptStore.insertAttempt` directly — the owner, not the route — and asserts:

| # | assertion | what it catches |
|---|---|---|
| A1 | three successive calls for one task produce ordinals **1, 2, 3** (read the rows back and compare) | an off-by-one in either direction, and a constant |
| A2 | with task A already at ordinal 3, the first call for task B produces **1** | a count whose `where(eq(taskId))` predicate was dropped or widened |
| A3 | seed one attempt for a fresh task with `ordinal: 9`, then call once → **2** | a builder who "improves" `count + 1` into `max(ordinal) + 1`. The semantics being relocated are count-based; this pins them |
| A4 | two calls inside one `db.transaction(tx => …)`, passing `tx` as `exec`, produce **1 then 2**, and both rows are readable through `tx` before commit | the count reading a committed snapshot instead of the caller's transaction — which is precisely what `taskRunResolver.resolve(tx, attemptId)` depends on at `handoff-protocol.ts:337`, and what would surface as a unique-index violation in production |
| A5 | a `db.transaction` that calls `insertAttempt` and then throws leaves **zero** attempt rows for that task | the insert escaping the caller's transaction — the atomicity `handoff-protocol.ts:311-337` relies on |

#### 8.3.3 How each new assertion is demonstrated red

The standard this plan applied to AC #4 (`§8.2`) applies here without discount: a check that cannot go red
is not evidence. Both new files are written **before** the accessors exist, so the first run is red on a
missing export — that proves the order, not the assertion. The builder must additionally record a
**one-mutation-at-a-time** red for each load-bearing assertion, running only the affected file
(`npx vitest run <file>`), reverting each mutation before the next:

| mutation, applied to the new accessor | expected red |
|---|---|
| drop `eq(sessions.state, "active")` from `endSessionByCas`'s `where` | test 1, assertion 1 — the `done` row is overwritten |
| make the emit unconditional (delete the `transitioned.length > 0` gate) | test 1, assertions 1 and 2 — an emit on a zero-row CAS, and a second emit on the repeat |
| collapse the row write to `outcome: derived` (drop `input.outcome ??`) | test 1, assertion 4 — persisted `outcome` is `"completed"`, not `"stopped"` |
| collapse the event to `outcome: input.outcome ?? derived` | test 1, assertion 4 — emitted `outcome` is `"stopped"`, not `"completed"` |
| `existing.length` instead of `existing.length + 1` | test 2, A1 — first ordinal is 0 |
| delete the `where(eq(taskDispatchAttempts.taskId, input.taskId))` from the count | test 2, A2 — task B's first attempt is 4 |
| `max(ordinal) + 1` instead of `count + 1` | test 2, A3 — 10, not 2 |

A4 and A5 are **exercise, not mutation-red**: `insertAttempt` receives a `WriteExecutor` and has no other
handle in scope, so there is no in-accessor mutation that makes the count or the insert leave the caller's
transaction. Their guard is the signature plus these two assertions running against a real `tx`. Stated
plainly rather than dressed up as a demonstrated red.

**Note for the next reader, so §3.4 is not over-read.** After this lands there are still **two** ordinal
computations inside `work`: the relocated one in `taskDispatchAttemptStore.insertAttempt`, and the
hand-written one at `task-state-machine.ts:115-128`, which this work package does not touch (§10 — an
owner's in-package sites are not refactored). "The ordinal invariant moved into the owner" means it left
`policy`; it does not mean there is now exactly one copy of it. Test 2 covers the accessor, not
`task-state-machine.ts`.

**The one piece of end-to-end evidence the build is held to:** `npm run test:integration:service` green,
with the ten existing files above showing **import-path edits only** in the diff, and the two new files
above added. Plus `npm run test:full` and `npm run verify` (check + lint + knip + knip:production +
deps:check + mock-inventory + web build + desktop build + attestation).

`npm run test:e2e` and the harness lane are not implicated — no UI, no route path, no wire shape, no
harness plumbing changes.

### 8.4 The `knip` hole, and what stands in its place

**Measured (feasibility F6), and the builder must not be told otherwise.**

- A production **module** reachable only from a test **is** caught: `npm run knip:production` reports
  `Unused files (1)`. `npm run knip` (plain lane) is silent, because a test counts as a consumer there.
- A test-only **barrel export** is caught by **neither lane**. `knip.json` does not set
  `includeEntryExports`, so knip does not report exports from an entry file, and the production lane's
  `--include files,dependencies,unlisted,binaries` (`package.json:61`) omits `exports` entirely.

That hole sits exactly where this work package grows — eight accessors onto
`@hyperidle/run-orchestration`, two onto `@hyperidle/policy`, one onto `@hyperidle/work`, one zod
re-export onto `@hyperidle/work`. **`@hyperidle/users` grows nothing** after Ruling 4 (§3.2), which
removes three of the twelve accessors and the one place a test-only export was most likely — the
`userSkills` owner had a single caller for two of its three surfaces.

**What stands in its place:** the *named production caller* column in §3 is the contract. Eleven
accessors, eleven named callers, every one a production file. Review checks that column against the
barrel diff, and **an accessor with no production caller is not added.** Do not widen `knip.json` to
close this — that is a repo-wide change with a repo-wide fallout and it is not this work package's.

### 8.5 Security

Reasoned from the surfaces this change actually reaches.

- **A socket-subscribe authorizer** (`session-stream-hub.ts:60-77`). Abuse case: an accessor that throws
  on a missing row instead of returning `undefined` fails **open** if any caller wraps it. Closed by
  `findSessionById`'s contract (§3.1: `undefined` on miss, never throws) and by
  `session-stream-hub.integration.test.ts` staying green unmodified. The authorizer's accepted residue —
  a second logged-in user holding a run's `randomUUID` — is pre-existing and unchanged by this plan.
- **One state-changing endpoint** — `PATCH /api/sessions/:id`. Its `requireBoundary({ kind: "public-data" })`
  guard stays on the route and is not touched. The accessors are package exports inside one layer, not
  HTTP routes: **no new network surface appears**, and no authorization decision moves behind them. An
  accessor must never grow an auth check — that would put the same decision in two places.
- **One state-changing endpoint is REMOVED** — `PATCH /api/users/:id/skills/:skillId`, together with the
  `skills` key on `GET /api/users/:id` (§11.4). Removing an authenticated write surface can only shrink
  the attack surface, never grow it, and nothing calls either: no `framework/api-contract` type declares
  them and no client issues the requests. Its `requireBoundary({ kind: "principal-self" })` guard goes
  with it; no other route loses a guard.
- **One agent-authored field** — `sessions.notes`, written by `write_session_notes`. The relocation moves
  the write verbatim; it must not silently add truncation, and it must not add sanitisation the tool does
  not have today, because a silent shape change to agent-authored content is a behaviour change wearing a
  security hat.
- **One migration** — `DROP TABLE "user_skills"` (§11.3). It destroys data by construction, which is why
  §11.1 pins the fact that carries it: there is no production insert path anywhere, so a production
  database has the table empty and the drop deletes nothing. `ON DELETE RESTRICT` points *outward* from
  the dropped table, so no other table's integrity is weakened and `users` is not modified.
- **Not touched:** credentials (the `serverCredentials` change is one registry line, zero code), outbound
  requests, filesystem paths (the `filesystemCaptures` change is one registry line), untrusted input
  parsing, secrets, and every other migration path.

### 8.6 Plausible changed failure behaviour

| change | plausible new failure | how the plan closes it |
|---|---|---|
| the CAS moves behind an accessor | a future caller writes a terminal state without the `active` predicate | the accessor exposes no `where`; there is no other write door on `sessions` outside the owner after this lands, and the rule enforces it at `error` |
| the emit moves with the CAS | `session_ended` fires twice, or not at all | §8.3.2 test 1 asserts exactly-once and never-on-zero-rows, and §8.3.3 shows both red under mutation. Every emit in the tree is then inside one package — with the reaper caveat in §4.3 |
| the DB write takes the `outcome` override, the event carries the derived value | a builder "tidies" the two into one | §8.3.2 test 1 assertion 4 pins both, and §8.3.3 shows each direction red |
| `insertAttempt` computes the ordinal | ordinals drift, reset, collide, or switch from count-based to max-based | §8.3.2 test 2 (A1–A3) pins the sequence, the per-task scoping and the count-based rule, each demonstrated red by mutation; A4–A5 exercise it on the caller's `tx`. **No existing test covers this — see §8.3.1** |
| `recordPropagationHop` replaces a hand-mirrored row builder | the cascade row shape drifts from fabric's | the accessor is `logPropagation` exported verbatim, parameter interface unchanged (§3.3); `AF12-bet-cascade.integration.test.ts` asserts `targetId`, `status` and `targetTransition` plus no-phantom-row. The unasserted fields (`attempts`, `failureReason`, `appliedAt`, `createdAt`, `sourceLevel`, `sourceId`) are covered by the move being verbatim, not by the test |
| `DROP TABLE "user_skills"` runs against a database that is **not** empty | rows are destroyed | there is no production insert path (§11.1) — every insert in the tree is a test or `tools/eval/src/seeding.ts:609`. A self-hosted database seeded by an older build is the only way rows could exist, and those rows are the dead autonomy score sheet the product decision already discarded (`docs/product/product-decisions.md:13`) |
| the delegation branch is deleted on the strength of "unreachable in production" | a routine somewhere really does have `delegationAllowed && skillId` and silently stops delegating | four independent checks, each cited, in §11.5.1: the only `skillId` writer hard-sets `delegationAllowed: false`; neither route schema accepts either field; the agent-facing seam accepts neither; every other write of `delegationAllowed` in the tree is `false`. This is a static property and gets no test — the type system then makes it unrecoverable by accident, because the port ceases to exist |
| a test is repointed instead of deleted when its subject goes | coverage looks unchanged while the thing under test is gone | §11.9 names all **twenty** affected test files and says, per file — and for `routine-run-resolver.integration.test.ts`, per case — whether it is deleted, loses a case, or loses a fixture line. After commit 1, `rg -a 'userSkills\|user_skills'` over `layers/ framework/ applications/ tools/` excluding **both** migration archives (`framework/db/drizzle/**` and `framework/db/drizzle-sqlite-archive/**`) returns nothing, and `npm run check` enforces it for every reference that names the symbol. Four of the twenty never name it — §11.7 mechanism 1 says which, and why the file list rather than the compiler carries them |

---

## 9. Documentation made false

Two separate things change, and they are kept separate because they are judged differently.

**Docs (`DOC-CLASS: minimal`).** `governance/README.md:5-6` forbids restating a governance rule in
`docs/`, so **no ownership fact reaches `docs/`**. What does reach `docs/` is four factual lines the
`user_skills` deletion falsifies. They are listed with their evidence in **§11.10**, and they are the
whole docs change: no page is rewritten, and the four `skill_change` routing docs are explicitly **not**
touched, because they are not false (§11.4).

**Code comments.** `UNOWNED_SHARED_TABLES` and `scripts/table-ownership-guard.ts` are cited in 17 files
outside `plans/` and `.pipeline/`, and **`scripts/table-ownership-guard.ts` does not exist**. A repo-wide
comment sweep is not in scope. The rule is: **fix the comment at every file this pull request already
edits, plus the one comment that describes a registry line this pull request changes.**

**No comment this pull request writes or rewrites may carry a work-package id.** Work-package ids stay
inside `.pipeline/**`; the only exception is an `@lore` tag, which may name one. The same applies to the
new migration's filename — `0056_drop_user_skills.sql`, not the `0049_AU18_…` shape its neighbours use
(§11.3). The comments below are being fixed because they are false, and the replacement states the fact,
not the work package that changed it.

In scope, by commit:

| commit | comment | why |
|---|---|---|
| 1 | `layers/core-api/src/services/routine-scheduler-bindings.ts:67-72` | says `userSkills` is an `UNOWNED_SHARED_TABLES` table that "any Service may query". **Deleted with the function it documents** — no rewrite needed |
| 1 | `layers/core-api/routine/src/agent-delegation.ts:1-17` and `layers/core-api/routine/src/index.ts:44-48` | both describe the `userSkills`-backed delegate scan. Deleted with the file and the export |
| 1 | `layers/agent-orchestration/run-orchestration/src/concurrency.ts:1-30` | names `routine`'s delegation decision as its only reason to exist. Deleted with the file |
| 1 | `layers/core-api/routine/src/routine-service.ts:345-356` and `:277-286` | the first names the deleted condition ("the owner is at capacity AND delegation is allowed AND a skill is set"); the second documents the `agentSelection` deps. **Rewritten**, since the enclosing function survives |
| 1 | `layers/core-api/routine/src/ports.ts:118-126` | documents the `agentSelection` field being removed. Deleted with the field |
| 1 | `eslint.config.ts:791-805` | the AK7 AC2 header and the `@lore` recording the *previous* zero-match block. **Deleted with the block they explain** (`:806-833`), no replacement — §11.2 gives the range, the precedent and the one-sentence check that the range was right |
| 1 | `layers/core-api/routine/src/__tests__/routine-run-resolver.integration.test.ts:15-19` | step 3 of the file header states the delegation rule in prose. **Rewritten to name the owner, and nothing else in that header is touched** — it carries pre-existing work-package ids this pull request must not re-author (§11.9) |
| 3 | `layers/agent-orchestration/connections/src/index.ts:7-9` | asserts present-tense sanction naming a script that does not exist, and its next paragraph contradicts the `serverCredentials` registry line this commit corrects |
| 4 | `layers/core-api/work/src/work-service.ts:60` | already correct ("the **work-owned** dispatch-attempt table") — verify only |
| 5 | `layers/core-api/src/service-bootstrap.ts:123-127` | says the `propagation_log` table is `UNOWNED_SHARED_TABLES` and a direct delete is "sanctioned"; the file loses that delete |
| 6 | `layers/agent-orchestration/run-orchestration/src/transition-run.ts:356-360` | says "no Service owns this table"; that package is about to own it |
| 6 | `layers/agent-orchestration/src/routes/sessions.ts:78-88` and `:326-328` | the "sole terminal-state writer **for a running session**" qualifier: after §4 the layer performs no `sessions` write at all, so the comment must say the owner is the sole terminal writer, full stop |
| 6 | `governance/table-owners.json`'s `unowned.note` | **rewritten, not deleted** — the block stays with an empty `tables` map (§11.10) |

Out of scope and left alone: the historical past-tense citations in `framework/db/src/schema.ts:997-999`,
`layers/core-api/work/src/ports.ts:34-36`, `layers/core-api/work/src/bet-state-machine.ts:94-96`,
`layers/core-api/users/src/hint-progress.ts`, `layers/core-api/work/src/session-start-resolver.ts`,
`layers/agent-orchestration/filesystem-mounting/src/mounter-registry.ts`,
`layers/agent-orchestration/tool-handlers/src/tool-definitions.ts` (unless the edited hunk carries it),
`layers/core-api/src/services/durable-agent-queue.ts:16-17,45` (it says the `agentSelection` field is
already removed — still true), `layers/agent-orchestration/tool-handlers/src/ports.ts:54` (same),
`scripts/mock-inventory.ts` and four `__tests__` files.
`layers/core-api/routine/src/agent-delegation.ts:11-12` no longer needs an exception — the file is gone.

**Three places that look like hits and are not, checked so the next reader does not re-check them:**
`scripts/typecheck-gate.ts:499-503` names both `agent-delegation.ts` and `concurrency.ts` in a `@lore`,
but the list it annotates is of package **directories**, not files, so nothing breaks and no edit is in
scope (§9's no-sweep rule). `layers/core-api/src/services/durable-agent-queue.ts:16-17` and
`layers/agent-orchestration/tool-handlers/src/ports.ts:54-56` both name an `agentSelection` — a
**different** one (`resolveScaffoldSpecs`, already removed), and both say so in the past tense, so both
stay true. So does
`layers/core-api/src/services/__tests__/core-api-port-increment2-org-routine-handoff.integration.test.ts:44`,
which mentions that same removed scaffold port in a doc comment only.

`layers/agent-orchestration/filesystem-mounting/src/index.ts:2-20` needs **no** change — it already
states the correct owner, and this work package makes the registry agree with it.

## 10. Non-goals — not to be widened

Per `plan.md:38-41`, `requirements.md` §7 and the rulings:

- `framework/db`'s own production table writes — AU29, shipped.
- The development-world companion violations — AU32, shipped. The development world reads **0** today and
  must read 0 at the end (§6.6).
- Reducing any service's exposed method surface — AU20's axis. This work package **grows**
  `@hyperidle/run-orchestration`'s barrel by eight and shrinks it by one (§11.5.3); that net growth is a
  known, accepted consequence.
- Splitting, renaming or relocating `run-orchestration` (§6.1 — Ruling 1 settles the owner).
- Refactoring an owner's existing in-package table sites. `run-orchestration`'s **28** (30 before
  §11.5.3 deletes `concurrency.ts`'s two), `policy`'s 9 and `work`'s 8 become legal by the registry line
  alone and are not touched. Named explicitly, because each is a place a reviewer might expect this work
  package to act and it does not: `run-orchestration/src/runtime-reapers.ts:193-209` (a terminal write
  with no `active` predicate and an ungated `session_ended` emit — §4.3);
  `run-orchestration/src/writeback-processor.ts:338` (a direct `sessions.notes` write that does **not**
  move behind accessor #8 — §3.1); `work/src/task-state-machine.ts:115-128` (a second, hand-written
  ordinal computation that stays where it is — §8.3.3).
- **The zero-crossing `tool-handlers` alternative** — ruled out for this work package by Ruling 5, and to
  be resolved on rebase by copying AU31's pattern (§6.5).
- **Any schema change other than `DROP TABLE "user_skills"`.** In particular: `routines.skillId` becomes
  write-only and `routines.delegationAllowed` is read only into a response body after §11.5 — **neither
  column is dropped here** (§11.5.4). No other column, index, FK or migration.
- **Shrinking `ITEM_KINDS`.** `autonomy_change` loses its only production producer in commit 1 but keeps
  an independent one in the `create_item` tool, and the enum is an agent-facing contract (§11.4).
- **Removing `"skill"` from `ConfigurationKind`** or from the Settings category list. It is enforced by
  two DB CHECK constraints, the ruling names the slot as a live destination, and the UI category is
  already permanently empty — §11.6.
- **Any `eslint.config.ts` change beyond deleting the block whose `files` array is the deleted
  `agent-delegation.ts`** (§11.2). No rule is repointed, relaxed, added or re-scoped; the single block is
  deleted because its only target ceases to exist.
- Widening `knip.json` to close the barrel-export hole (§8.4).
- A repo-wide `UNOWNED_SHARED_TABLES` comment sweep (§9).

---

## 11. Ruling 4 — deleting `user_skills`

`founder-rulings.md:38-78`. The question "which service owns `userSkills`" was rejected as the wrong
question and the table was ruled deleted. This section is the deletion plan. It replaces the owner and
accessors that stood at §3.2. **This is the only schema change in the work package.**

### 11.1 The four load-bearing facts, re-verified in this worktree

I did not re-litigate the ruling. I re-checked the four facts a builder will act on, because acting on
a wrong one is expensive.

| claim | verified how | verdict |
|---|---|---|
| the table is `agent_skills` renamed by a mechanical sweep | `framework/db/drizzle/0013_P2_rename_agents_to_users.sql:11-15` — `ALTER TABLE "agent_skills" RENAME TO "user_skills"` immediately after `"agents"` → `"users"`, then `RENAME COLUMN "agent_id" TO "user_id"` | confirmed |
| **no production insert exists** | `rg -a 'insert\(userSkills\)'` repo-wide → 11 files: 10 are `*.test.ts`, one is `tools/eval/src/seeding.ts:609`. Zero in `layers/`, `framework/` (outside `__tests__`) or `applications/`. There is no insert zod schema either — `zod-schemas.ts:58` declares only `selectUserSkillSchema` | confirmed. **A production database has this table permanently empty** |
| nine production read/write sites | the live governance-lint report, re-run in this phase: 9 findings, no more, no fewer (feasibility F11) | confirmed |
| the delegation path is unreachable in production | four independent checks, §11.5.1 | confirmed |

The columns are the per-skill autonomy score sheet — `autonomyLevel`, `successCount`, `failureCount`,
`lastUsedAt`, `promotedAt` (`framework/db/src/schema.ts:830-844`) — killed by ruling at
`docs/product/product-decisions.md:13` ("No per-skill autonomy controls, ever").

### 11.2 The complete file list

Every file the deletion touches. Tests are **§11.9** and docs are **§11.10**; those two sections are
part of this list, not additions to it. Nothing outside the three places changes.

**The total, so it can be counted rather than trusted:** 27 non-test files (5 in `framework/db`
including one new migration, 3 production call sites, 7 cascade files, 6 eval files, the registry,
`eslint.config.ts`, and 4 doc files) plus **20 test files** (§11.9) — 47 files.

**Schema and generated surfaces (`framework/db`)**

| file | change |
|---|---|
| `framework/db/src/schema.ts:828-845` | delete the `// --- User skills ---` banner and the `userSkills` `pgTable` |
| `framework/db/src/schema.ts:1658-1659` | delete `type UserSkill` / `type NewUserSkill` |
| `framework/db/src/index.ts:103,153,154` | delete `type NewUserSkill`, `type UserSkill`, `userSkills` from the barrel re-export list |
| `framework/db/src/zod-schemas.ts:35,58` | delete the `userSkills` import member and `selectUserSkillSchema` |
| `framework/db/drizzle/0056_drop_user_skills.sql` | **new** — `DROP TABLE "user_skills";` (§11.3) |
| `framework/db/drizzle/meta/_journal.json` | **new entry** `idx: 56`, `tag: "0056_drop_user_skills"` (§11.3) |

**Production call sites (9 governance findings)**

| file | change |
|---|---|
| `layers/core-api/src/routes/users.ts` | delete the `skills` read at `:241` and return `user` unchanged; delete the whole `PATCH /:id/skills/:skillId` handler `:297-369`; delete `updateSkillSchema` `:49-51`; then the now-unused imports: `userSkills` (`:2`, leaving `type HyperIdleDb` alone), `ItemCreatedEvent` (`:9`), `insertThread` (`:21`), `import * as work from "@hyperidle/work"` (`:31`), `import { and, eq } from "drizzle-orm"` (`:32`). `eventBus` **stays** — still used at `:178` |
| `layers/core-api/src/services/routine-scheduler-bindings.ts` | delete `listAgentIdsBySkill` `:66-80` and `concurrencyBoundReader` `:48-64`; delete the whole `agentSelection` port literal `:152-163`; then the now-unused imports: `readAgentRunConfig` (`:18`), `userSkills` (`:20`), `selectRoutineDelegate` (`:36`), `isAgentAtCapacity` (`:39`), `findUser` (from `:43`, keeping `requireRunnableAgent`), `eq` (`:41`) |
| `layers/core-api/settings/src/plugin-configuration.ts` | delete the skill seed loop `:745-758`; delete the `userSkills` import member (`:11`) |

**The delegation cascade (§11.5)**

| file | change |
|---|---|
| `layers/core-api/routine/src/agent-delegation.ts` | **delete the file** — `AgentDelegationDeps` and `selectRoutineDelegate` |
| `layers/core-api/routine/src/index.ts:44-48` | delete the `selectRoutineDelegate` export and its banner comment |
| `layers/core-api/routine/src/routine-service.ts:277-297` | drop `agentSelection` from `RoutineRunResolverDeps` |
| `layers/core-api/routine/src/routine-service.ts:345-356,366-378` | delete the capacity/delegation branch; `selectedAgentId` becomes `routine.ownerAgentId`, full stop. Rewrite the doc comment, which names the deleted condition |
| `layers/core-api/routine/src/ports.ts:118-136` | drop `agentSelection` from `RoutineSchedulerPorts` and its comment |
| `layers/core-api/routine/src/routine-scheduler.ts:607` | drop `agentSelection: ports.agentSelection` from the forwarded deps |
| `layers/agent-orchestration/run-orchestration/src/concurrency.ts` | **delete the file** — `ConcurrencyBoundReader`, `isAgentAtCapacity` |
| `layers/agent-orchestration/run-orchestration/src/index.ts:21` | delete the `isAgentAtCapacity` export |

**Lint configuration**

| file | change |
|---|---|
| `eslint.config.ts:791-834` | **delete the whole AK7 AC2 block** — its `files` array is exactly `["layers/core-api/routine/src/agent-delegation.ts"]` (`:813`), the file this commit deletes |

`eslint.config.ts:806-833` is a flat-config object whose entire scope is the deleted file, carrying the
two AK7 AC2 `no-restricted-syntax` rules (`:822`, `:827`). Once `agent-delegation.ts` is gone the block
matches **zero files and reports clean forever** — `CLAUDE.md` § Monorepo: *"hard-fail when a scan finds
nothing — a guard that silently matches zero files reads as passing forever."*

**Deleted, not repointed, and this file already says why.** The `@lore` at `:798-805` records this repo
hitting the identical failure once before, when the AC1 half of the same guard survived the deletion of
`bet-decomposition.ts`: *"The block survived the deletion pointing at a file that no longer exists, which
in ESLint is a silent no-op: it reported clean forever and read as coverage. Deleted rather than
repointed — there is no successor file performing that selection, so there is nothing left to police."*
Verbatim the same situation: with `selectRoutineDelegate` gone, no successor file performs
routine-delegate selection. AK7 AC2 had exactly two targets, `work`'s `agent-assignment.ts` (already
deleted) and this one; with both gone the rule has no subject and the guard retires whole.

**The deletion range is `:791-834`, not just the object.** `:791-796` is the AK7 header comment and
`:798-805` is that `@lore`; both exist only to explain this block. **No replacement comment is written** —
the lesson the `@lore` carries is already the repo-wide rule in `CLAUDE.md` § Monorepo, and a `@lore`
about a retired guard hung on an unrelated neighbouring block is worse than none.

**One incidental repair, and it is how the builder checks the range.** The AK7 block was spliced into the
middle of the *preceding* comment: `:778-790` is the AJ3 preview-harness header, it breaks off
mid-sentence at `:790` (*"…so it must re-state the full"*), and its tail resumes at `:835`
(*"server+db ban itself rather than relying on any earlier block."*) above the block it actually
describes (`:836`, `files: ["layers/core-ui/src/__preview__/**"]`). Deleting `:791-834` rejoins that
sentence. **If the sentence does not read continuously afterwards, the range was wrong.**

**Evals (`tools/eval`)** — §11.8

| file | change |
|---|---|
| `tools/eval/src/scenarios/skill-autonomy.ts` | **delete the file** (3 scenarios) |
| `tools/eval/src/scenarios/index.ts:35` | delete the `skillAutonomyScenarios` export |
| `tools/eval/src/scenarios/routine-sessions.ts` | **add** `rs-silent-no-review-item`, the de-skilled survivor of `ska-l4-silent` (§11.8) |
| `tools/eval/src/scenarios/delegation.ts:42,118-127,244-245` | delete the four `seedUserSkill` calls and the import. Every judge in the file stays |
| `tools/eval/src/seeding.ts:31,596-617` | delete `seedUserSkill` and the `userSkills` import member |
| `tools/eval/src/judges.ts:25,608-637` | delete `judgeUserSkillLevel` (already zero callers) and the `userSkills` import member |

**Registry** — `governance/table-owners.json`: delete the `userSkills` line from `unowned.tables`;
`totals` → `{ tables: 44, owned: 39, unowned: 5 }` in this commit (§7.2 carries it to 44/44/0).

**Tests** — §11.9. **Docs** — §11.10.

### 11.3 The migration — hand-authored, not generated

**`npm run db:generate` output is not usable here, and a builder who runs it will produce a wrong file.**
This repo's drizzle-kit snapshot chain is stale at `0042`; every migration from `0043` on is a
hand-authored incremental SQL file tracked only by `meta/_journal.json`. `0054_AU21_cost_hard_delete.sql`
says so in its own header: *"`drizzle-kit generate` against the stale 0042 snapshot re-detects every
0043-0053 change as new, so its output is NOT usable verbatim here"*. `0049` and `0053` carry the same
note. The precedent for a whole-table drop is `0049`, whose entire body is `DROP TABLE "factory_settings";`.

**So:** hand-author `framework/db/drizzle/0056_drop_user_skills.sql` and append one entry to
`framework/db/drizzle/meta/_journal.json` — `{ "idx": 56, "version": "7", "when": <prev + 3600000>,
"tag": "0056_drop_user_skills", "breakpoints": true }`, matching the 3 600 000 ms spacing of entries
52-55. Do **not** regenerate `meta/*_snapshot.json`; nothing past `0042` has one.

**The filename carries no work-package id.** The `0043`-`0055` names do (`0049_AU18_…`), and that is the
pattern a builder will copy. It is not to be copied: work-package ids stay inside `.pipeline/**`.
`0056_drop_user_skills` says what the migration does, which is what the name is for. The file's header
comment states the fact and the reason — the per-skill autonomy product was removed and this is the
remaining storage — and cites `docs/product/product-decisions.md:13`, not a work package.

**The FK does not need touching.** `user_skills.user_id` references `users.id` with
`onDelete: "restrict"` (`schema.ts:833-835`) — an **outbound** FK, owned by the table being dropped and
destroyed with it. Nothing references `user_skills`: `rg 'userSkills\.' framework/db/src/schema.ts`
returns only the two `$inferSelect`/`$inferInsert` type lines. `DROP TABLE "user_skills";` is sufficient,
with no `CASCADE`, and `users` is not modified. The restrict direction is also why no row can be
orphaned: the table is empty in production, so the drop deletes nothing.

### 11.4 The two dead endpoints

**`GET /api/users/:id` loses its `skills` key** (`routes/users.ts:241`). The route keeps everything else
and returns `c.json(user)`.

**`PATCH /api/users/:id/skills/:skillId` is deleted whole** (`routes/users.ts:297-369`), along with its
`updateSkillSchema` (`:49-51`). In production it returns 404 unconditionally, because the row it looks up
at `:307-311` can never exist.

**Nothing declares or calls either.** Verified:

- `rg 'skills' framework/api-contract/src` → **no match**. No contract type, no seam method, no
  `CoreApiPort` surface names them.
- `rg '/api/users' layers/core-ui/src applications` (excluding `__e2e__`) → three call sites, none of
  them these: `SettingsProfile.tsx:67` (`PATCH /api/users/:id`), `SettingsAgents.tsx:253`
  (`PATCH /api/users/:userId/assistant`), `SetupFlow.tsx:267` (`POST /api/users`). **No client performs
  `GET /api/users/:id` at all**, so no UI observes the `skills` key. The two `AgentProfile` doc comments
  that mention skills describe `/api/agents/:id/profile`, a different route that has never exposed them —
  `AD4-agent-profile.integration.test.ts:270-271` asserts exactly that and stays green untouched.

**What dies with the PATCH, and what does not.** The handler also creates a thread, writes an `item` of
`kind: "autonomy_change"`, and emits `item_created` (`:335-365`). All three go with it.

- **`"autonomy_change"` the item kind stays.** It is a member of `ITEM_KINDS`, the `create_item` tool's
  closed kind vocabulary (`layers/agent-orchestration/tool-handlers/src/tool-definitions.ts:424-433`), so
  an agent can still produce one; the kind has an independent producer and the enum is an agent-facing
  contract. Nothing routes on it — `policy-engine.ts:121` special-cases only `skill_change` — so no
  routing becomes dead. After this lands, `autonomy_change` has no production producer and no routing,
  which makes shrinking `ITEM_KINDS` a legitimate follow-on (there is precedent: `cost_cap_breach` was
  deleted from the same list, `tool-definitions.ts:422-424`). **It is not this work package's**: it
  changes a tool contract agents are prompted against, and it is not what Ruling 4 covers.
- **`"skill_change"` is untouched and is not dead.** An earlier reading held that its routing
  (`policy-engine.ts:121` → always push) can never trigger and that four docs describing it are false.
  That is wrong: `skill_change` is also in `ITEM_KINDS` (`tool-definitions.ts:427`) and
  `create_item` can produce one. The routing is live and
  `docs/human-interface-layer/items-and-routing.md:20,55`,
  `docs/human-interface-layer/review-primitive.md:55`,
  `docs/human-interface-layer/overview.md:59` and `docs/requirements/usability-requirements.md:29` stay
  true. **Correct nothing there.**

### 11.5 The delegation cascade — how far it goes and where it stops

#### 11.5.1 The unreachability claim, verified four ways

`routine-service.ts:367` gates the whole delegation path on `routine.delegationAllowed && routine.skillId`.
For that conjunction to be true in production something must write both fields on one row. Nothing does:

1. **The only production writer of `routines.skillId` hard-sets `delegationAllowed: false`.** Builtin
   routines are inserted at `layers/core-api/routine/src/routine-scheduler.ts:201-213` — `skillId:
   spec.skillId` at `:211`, `delegationAllowed: false` at `:213`, four specs (`:137,148,159,170`).
2. **The HTTP route accepts neither field.** `createRoutineSchema`
   (`layers/core-api/src/routes/routines-routes.ts:48-56`) declares `id, name, description, teamId,
   ownerAgentId, triggerType, triggerConfig` — a non-strict zod object, so an unknown `skillId` or
   `delegationAllowed` in the body is *stripped*, not rejected. `updateRoutineSchema` (`:58-67`) declares
   `active, triggerConfig, autonomyLevel, silent, state, name, description`.
3. **The agent-facing seam accepts neither.** `InsertRoutineRequest`
   (`framework/api-contract/src/core-api-port.ts:457-465`) and `UpdateRoutineRequest` (`:483-491`) carry
   the same field sets. `create_routine`'s handler reaches the route through this seam
   (`tool-handlers-bindings.ts:167-168`).
4. **`delegationAllowed` is written in exactly two other places in the tree, both `false`.**
   `rg 'delegationAllowed' --glob '!*.md' --glob '!**/__tests__/**'` → `routine-scheduler.ts:213`
   (false), `tools/setup/src/demo-fixture.ts:201` (false), `schema.ts:630` (column, `.default(false)`),
   `routines-routes.ts:265` (a **read** into a response body), plus stories/e2e fixtures at `false`.

So the branch is dead in production, and every test that exercised it does so by inserting the routine
row directly. **This is a static property; per `CLAUDE.md` it gets no test.** The type system enforces
the consequence: once `agentSelection` is off `RoutineRunResolverDeps`, nothing can re-enter the branch
by accident.

#### 11.5.2 `selectRoutineDelegate` cannot survive without the skill filter

It has no other candidate source. Its whole input is `{ skillId, excludeAgentId }`
(`agent-delegation.ts:32-34`) and its first statement is
`await deps.listAgentIdsBySkill(db, input.skillId)`. With the table gone the port returns nothing there
is any honest way to compute. **So the delegation decision goes, not just its port.**

#### 11.5.3 The cascade is forced as far as `concurrency.ts`, and that is where it stops

Each step below is forced by the previous one — none is an opportunistic cleanup:

`listAgentIdsBySkill` deleted → `selectRoutineDelegate` has no wireable deps → `agent-delegation.ts`
deleted → `agentSelection.selectAgent` has no implementation → the `selectAgent` member goes from
`RoutineRunResolverDeps` (`routine-service.ts:289-297`) and `RoutineSchedulerPorts`
(`ports.ts:129-135`) → the `if (routine.delegationAllowed && routine.skillId)` body at
`routine-service.ts:367-378` is empty → the enclosing
`if (await deps.agentSelection.isAtCapacity(…))` at `:366` has an empty body → **`isAtCapacity` has no
caller** → the `agentSelection` field goes entirely → `isAgentAtCapacity` and `ConcurrencyBoundReader`
have no production caller.

`concurrency.ts` holds **only** those two exports (`:50`, `:58`), and its own header states its single
purpose: *"This is the ONE canonical implementation `routine`'s delegation decision (`@hyperidle/routine`'s
`agent-delegation.ts`) is injected"* (`:1-9`). Its only production consumer in the tree is
`routine-scheduler-bindings.ts:39,153,159` (verified: `rg 'isAgentAtCapacity|ConcurrencyBoundReader'`
returns nothing else in `layers/` or `applications/` outside `__tests__/`).

**Recommendation: delete `concurrency.ts` and its barrel line.** Three reasons: (1) it is genuinely
orphaned, and leaving an orphan behind a deletion is precisely the mistake this ruling is correcting —
AD4 shipped the removal and left the table; (2) **nothing else would catch it** — knip reports neither
entry-file exports nor a file that is still reachable from a barrel (feasibility F6), so it would sit
there indefinitely; (3) it is not a refactor of an owner's in-package site — the thing §10 forbids — it
is the deletion of code whose only caller this same commit removes.

**Where the cascade stops, explicitly.** `provisioner.ts`'s own Phase-3 admission gate is a *different*
concurrency check and is untouched — `concurrency.ts:11-18` says so and explains why the two were never
merged. No other capacity behaviour changes.

**One consequence for the rest of this plan:** `concurrency.ts:33` (import) and `:67` (`from(sessions)`)
are two of `run-orchestration`'s in-package `sessions` sites. Deleting the file takes
`run-orchestration` from **30 sites to 28**, and §5.1's "10 reads" to 9. §3, §5.1, §10 and feasibility
F8 are corrected accordingly. It changes no conclusion — `run-orchestration` is still by far the largest
toucher and still the owner under Ruling 1.

#### 11.5.4 What I flag rather than do

**`routines.skillId` becomes write-only.** After the branch is gone, the column is written by builtin
routines (`routine-scheduler.ts:211`) and read by nobody (`rg 'skillId' layers/core-api/src/routes/routines-routes.ts
layers/core-ui/src` → no match). `routines.delegationAllowed` is read once, into a response body
(`routines-routes.ts:265`), and written only as `false`. **Both are out of scope.** Dropping columns from
`routines` is a second schema change on a live table with real rows, it is not `user_skills`, and Ruling 4
does not cover it. Recorded here so a reviewer does not read the residue as an oversight, and so whoever
wants it has the evidence ready.

### 11.6 The settings seed, and why the `skill` configuration slot stays

**Delete the seed, keep the kind.**

The seed at `layers/core-api/settings/src/plugin-configuration.ts:745-758` scans the whole table and
projects each row into a `kind: "skill"` configuration default keyed `skill.${userId}.${skillId}`. It
goes, with the `userSkills` import member at `:11`. Nothing else in the file changes.

**`"skill"` stays in `CONFIGURATION_KINDS`** (`framework/shared/src/configuration.ts:1-11`) and in both
DB CHECK constraints (`framework/db/src/schema.ts:1388` on `plugin_configuration_defaults`, `:1415` on
`configuration_overrides`). Removing an enum member would mean a second migration rewriting two CHECK
constraints — larger than the deletion it would serve — and the ruling names that very slot as a live
destination for a future real skill concept: *"capability-side alongside the tool catalog where
`ConfigurationKind` already reserves a `"skill"` slot"* (`founder-rulings.md:76-78`). Deleting the slot
would foreclose what the ruling says the deletion must not foreclose.

**The Settings "Skills" category also stays, and the UI does not change.** Two facts make this the
correct answer rather than a dodge:

- The category is rendered from `CATEGORY_LABELS` in
  `layers/core-ui/src/settings/SettingsAgentBehavior.tsx:28-35`, a total map
  `satisfies Record<AgentBehaviorConfigView["kind"], string>` over a **separate** UI union,
  `AgentBehaviorConfigKind` (`framework/shared/src/agent-behavior-config.ts:85-92` — six members, with
  `mcp` not `mcp_server` and no `harness_descriptor`).

  **Correction to an earlier revision, which argued this the wrong way round.** That revision said
  `agent-behavior-config-impl.ts:56` declares `Record<ConfigurationKind, AgentBehaviorConfigKind>`, a map
  *total over `ConfigurationKind`*, so the UI union could not shed `"skill"` without weakening it to a
  partial record. **That is false.** The live declaration at
  `layers/core-api/src/routes/agent-behavior-config-impl.ts:55-57` is already
  `Partial<Record<ConfigurationKind, AgentBehaviorConfigKind>>` — deliberately, because
  `harness_descriptor` (`framework/shared/src/configuration.ts:7`) has no UI counterpart. There is
  nothing to weaken and no coupling in that direction. The reverse map,
  `AGENT_BEHAVIOR_KIND_TO_CONFIG_KIND` (`:66-72`), is total over `AgentBehaviorConfigKind`, but that is
  the UI union constraining *itself*; `ConfigurationKind` does not pin it. So the UI union **could** shed
  `"skill"` on its own, in a self-contained edit.

  **The conclusion does not move, because it never rested on that sentence.** Two grounds carry it, both
  verified: (a) removing `"skill"` from `ConfigurationKind` needs a second migration rewriting two DB
  CHECK constraints — larger than the deletion it would serve; (b) `founder-rulings.md:76-78` names the
  slot as a live destination. And shedding the *UI* member alone buys nothing: the next bullet shows the
  screen is byte-identical either way. Keeping both unions intact is therefore the smaller change and the
  one the ruling asks for.
- **There is nothing to change on screen.** The tile renders unconditionally from the static label map
  and shows `counts.get("skill") ?? 0`. In production the seed produced zero rows because the table has
  no insert path, so the tile reads "Skills — 0 items" today and reads "Skills — 0 items" after. The
  bytes of `GET /api/settings/agent-behavior` are identical.

So the ruling's "the resulting empty Settings category" is the **status quo**, not a change: the category
was already permanently empty, and this work package removes the code that pretended otherwise. Whether
an always-empty category should render at all is a product question about the Settings page, not about
this table.

### 11.7 Evidence — how a deletion is proven

Deleting a table and two endpoints is a behaviour change. Four mechanisms carry it, and each can go red.

**1 — The type system proves the symbol is gone (static).** Removing `userSkills` from `schema.ts` and
the `@hyperidle/db` barrel turns every surviving reference **to that symbol** into a compile error.
`npm run check` is therefore the proof that no production file and no test still *names* the table.

**What it does not prove, stated precisely.** An earlier revision said "there is no way to be partially
done". That over-claims: the cascade reaches three files that never name `userSkills` at all.

- `framework/db/src/__tests__/zod-schemas.test.ts:44` imports `selectUserSkillSchema`, a deleted export —
  `check` catches it.
- `layers/core-api/routine/src/__tests__/routine-scheduler-completeness.integration.test.ts:71-74` builds
  a fresh `RoutineSchedulerPorts` object literal, so excess-property checking bites — `check` catches it.
- `layers/core-api/routine/src/__tests__/routine-run-resolver.integration.test.ts` is only half-caught.
  Thirteen of its fourteen cases pass their deps through `buildDeps(...)` (`:127-129`) — a **call
  expression**, which gets no excess-property check — so the six delegation cases would compile and fail
  at *runtime*. `check` does flag the file, but on one line: the contextBundle case at `:496-501` passes a
  fresh object literal. One compile error, six silently failing tests.

So the compiler carries the *symbol*, and **§11.9's enumerated file list carries the cascade**. Those
runtime failures surface only in `test:integration:service`; `npm run test` excludes the integration lane
entirely (`CLAUDE.md` § Which command to use when).

**2 — governance-lint proves the registry (static).** Three already-live checks in
`scripts/lib/governance-registry.ts` cover the registry edit, in both directions:
`phantom` (`:132-135`) fails if the registry still names `userSkills`; `missing` (`:124-130`) fails if a
live table is unclaimed; `totals.tables !== liveTables.size` (`:147-149`) fails on a stale count. No new
mechanism is added and none is needed.

**What it does not check.** `validateTableOwners` (`:117-150`) validates `totals.tables` and nothing else
in that object — `totals.owned` and `totals.unowned` are never compared to anything. Of §7.2's
`44/39/5 → … → 44/44/0` ladder, **only the leading figure is machine-verified**; the other two are
bookkeeping the builder keeps honest by hand at every commit. Recorded so nobody assumes a check will
catch a slip there.

Note also what `liveTables` is: `scripts/lib/db-surfaces.ts:88` parses `pgTable(` calls out of
`schema.ts` **source**. Governance-lint never touches a database, so it agrees at 44 regardless of what
any database actually contains — which is why mechanism 3 below carries the migration and this one
cannot.

**3 — The migration is proven at runtime by the whole integration suite.** Every service integration test
builds its database by running the **real** drizzle migrator over `framework/db/drizzle`, driven by
`meta/_journal.json` (`framework/db/src/__testing__/test-pool.ts:41,55`;
`__testing__/test-utils.ts:45,92`). So `npm run test:integration:service` green *is* the proof that
`0056_drop_user_skills.sql` applies cleanly on top of the full 55-migration chain.

**Its red demonstration — `not.toContain`, and not the expected-list edit.**

An earlier revision said the red comes from removing `"user_skills"` from the expected table lists.
**That is wrong.** All three lists are inclusion assertions,
`expect(tableNames).toEqual(expect.arrayContaining([…]))`:
`migration.integration.test.ts:28-50`, `pg-migration.integration.test.ts:34-58`,
`schema.integration.test.ts:37-57`. `arrayContaining` passes when the received array *contains* the
listed elements; extras are tolerated. Removing a name from the expected array is therefore a **no-op in
both directions** — it passes with the table present and passes with it absent. The floor at
`migration.integration.test.ts:56` (`toBeGreaterThanOrEqual(15)`) is a floor, not a count. The list edit
is still **required** (leaving `"user_skills"` in would fail once the table is gone), but it is the
*green* side of the change and proves nothing.

**The assertion that bites already exists in all three files**, written for the last whole-table drop
(`0049` dropped `factory_settings`) — `migration.integration.test.ts:55`,
`pg-migration.integration.test.ts:63`, `schema.integration.test.ts:63`:

```ts
expect(tableNames).not.toContain("factory_settings");
```

**So, in each of the three files, immediately beside that line, add:**

```ts
expect(tableNames).not.toContain("user_skills");
```

**Order of work.** Add the three assertions **first**, before the migration exists, and run
`npm run test:integration:service`. All three go red — the table is still there. Then land
`0056_drop_user_skills.sql` **and** its `meta/_journal.json` entry, and all three go green. That is the
genuine red-then-green for the only schema change in this work package.

**Why this exact assertion, and why the list edit could never substitute for it.** The failure that
everything else in `verify` misses is a **missing or mis-tagged `_journal.json` entry**. The migrator
resolves files by journal `tag` (`framework/db/src/__testing__/test-pool.ts:55` —
`migrate(db, { migrationsFolder })` over `framework/db/drizzle`), so a `0056_drop_user_skills.sql` with
no journal entry, a wrong `idx`, or a `tag` that does not match the filename is **silently skipped**. In
exactly that state:

- `npm run check` passes — the source no longer names the symbol (mechanism 1);
- governance-lint passes — `liveTables` is parsed from `schema.ts` source, never from a database
  (mechanism 2), so `totals.tables`, `missing` and `phantom` all agree at 44;
- every other integration test passes — the inclusion assertions tolerate a surviving table, and nothing
  else asserts its absence.

The table would then survive in **every real and test database while `verify` stays green**: the
silent-orphan failure Ruling 4 exists to correct, reproduced one level down. `not.toContain("user_skills")`
is the only check in the repo that reads the actual post-migration database and can say the drop
happened. It is a required deliverable of commit 1, not optional symmetry.

**All three files, not two.** `migration.integration.test.ts` and `schema.integration.test.ts` use the
pooled PGlite fixture; `pg-migration.integration.test.ts` builds its own PGlite database via
`createTestDb()` and separately asserts the chain is idempotent (migrating twice). All three run in
`test:integration:service`, the lane per-merge verify runs. Three lines, and it matches the
`factory_settings` precedent exactly.

**Assertion-edit accounting.** This work package makes exactly two kinds of assertion change, both here
and both because the assertion's **subject** changed: three `not.toContain` **additions**, and the
removal of `"user_skills"` from three expected lists. §8.3's contract — import-path edits only — still
binds every relocation, without exception.

**4 — The endpoints.** What proves nothing depended on them is stated in §11.4 and is static, not
runtime: no `framework/api-contract` type declares `skills`; no client issues `GET /api/users/:id` or the
skills `PATCH`. The response-shape change is therefore observable by nothing that ships. The tests that
exercised the endpoints are **deleted with them, never repointed** (§11.9), which is also what keeps the
diff honest: if a deleted endpoint were still reachable, a surviving test would fail.

**Also unchanged by Ruling 4:** §8.3.2's two new test files
(`run-orchestration/src/__tests__/session-store.integration.test.ts`,
`work/src/__tests__/task-dispatch-attempt-store.integration.test.ts`) and every mutation-red in §8.3.3.
Ruling 4 touches neither `sessions` nor `taskDispatchAttempts`.

### 11.8 The three eval scenarios — one correction, then a decision each

**First, a correction to the ruling's scope, in the ruling's favour.**
`tools/eval/src/scenarios/routine-sessions.ts` **does not seed skills.** `rg 'seedUserSkill'` over
`tools/eval` returns hits in only two scenario files, `skill-autonomy.ts` (3) and `delegation.ts` (4).
`routine-sessions.ts`'s three `skillId:` occurrences (`:65,175,257`) are arguments to `seedRoutine` and
set `routines.skill_id`, a different column on a table that stays. **It needs no change for the
deletion** — the only edit it receives is the addition in the next paragraph.

Evals require real LLM calls and deleting one is a product decision, so each is argued separately. Note
first that all three of these particular scenarios are **synthetic**: they call `fireRoutine` directly
and return `makeSyntheticResult(...)`; no agent runs. That does not license carelessness, but it does mean
none of them is measuring model behaviour.

| scenario | judges | verdict |
|---|---|---|
| `ska-success-tracking` (`skill-autonomy.ts:266-354`) | `skill_record_exists`, `counts_correct` — both read `userSkills.successCount`/`failureCount` for a row the scenario itself seeded | **delete.** It exists only to exercise the dead autonomy score sheet, and both judges are tautologies: they assert back the literal the seed wrote |
| `ska-l1-review-required` (`:43-152`) | `routine_fired`, `review_item_created`, `autonomy_level_correct` | **delete.** The autonomy judge is the same tautology. The other two are `rs-human-review-flag` (`routine-sessions.ts:242-313`) already — same `humanReview: true` routine, same "a review item exists for the owner" assertion. Nothing is lost |
| `ska-l4-silent` (`:154-264`) | `routine_fired`, `no_review_item`, `autonomy_level_correct` | **rework.** Drop the autonomy judge and the `seedUserSkill` call and the scenario still asserts something real and otherwise uncovered: `humanReview: false` produces **no** review item. That negative has no equivalent anywhere else in the eval set |
| `delegation.ts` (3 scenarios) | `routine_fired_despite_owner_wip`, `intent_recorded_owner_hint`, `routine_fires_and_defers_not_skips`, `single_running_run_no_pileup`, `routine_fires_regardless_of_delegation_flag` | **rework — fixture lines only.** Not one judge reads `userSkills`. The file's own note at `:328` records why: *"fire-time no longer evaluates delegation at all"*. The four `seedUserSkill` calls (`:118,:123,:244,:245`) are leftovers. Delete them and the import; every judge stays |

**So:** delete `tools/eval/src/scenarios/skill-autonomy.ts` and its export at
`scenarios/index.ts:35`, and move the surviving assertion into `routine-sessions.ts` as
`rs-silent-no-review-item` — the same routine seed as `rs-human-review-flag` with `humanReview: false`,
the `routine_fired` and `no_review_item` judges, no skill seed. That is a ~40-line de-skilled copy of an
existing scenario, which is what "rework" means; it is not new eval design.

The file must be **deleted, not merely unexported** — `npm run knip` reports unused files, and an
unexported scenario file becomes one.

Two dead helpers go with them: `tools/eval/src/seeding.ts:596-617` (`seedUserSkill`, no remaining
callers) and `tools/eval/src/judges.ts:608-637` (`judgeUserSkillLevel`, which has **zero** callers today
and is already dead).

**Cheaper alternative, if the founder prefers it:** delete `skill-autonomy.ts` outright and do not carry
`ska-l4-silent` over. The cost is one uncovered negative assertion. I do not recommend it — the carry-over
is small and the assertion is genuinely unduplicated — but it is a one-line decision either way.

### 11.9 Tests — the exact list

The rule (`.claude/rules/testing.md`, and this repo's practice): **a test whose subject is deleted is
deleted, never repointed.** A test that merely seeds a row loses a fixture line.

**Twenty test files, in two groups.** Sixteen name `userSkills` / `user_skills` today; four more are
reached by the cascade without ever naming it. Both groups are enumerated below and the four are marked
**[cascade]**, because they are the ones the compiler does not fully carry (§11.7 mechanism 1).

**Deleted files (4 — 3 test files + 1 eval scenario)**

| file | why |
|---|---|
| `layers/core-api/routine/src/__tests__/agent-delegation.test.ts` | subject is `selectRoutineDelegate` |
| `layers/agent-orchestration/run-orchestration/src/__tests__/concurrency.integration.test.ts` | subject is `isAgentAtCapacity` |
| `layers/core-api/src/services/__tests__/agent-work-intent-worker.routine-selection.integration.test.ts` | subject is delegate selection at emit time — the describe is *"routine agent-selection — resolved at emit, handed off (baked) at drain"* and three of its four tests are delegation (`:156,:173` and the `delegationAllowed` case). Its one surviving behaviour — a routine fires, bakes, and drains to its owner — is already covered by `routine-scheduler-baked-emit.integration.test.ts:206` and `:231`, so nothing is lost silently |
| `tools/eval/src/scenarios/skill-autonomy.ts` | §11.8 (a scenario file, not a test file — listed here so the count is complete) |

**Deleted describes / test cases inside surviving files (8)**

| file | what goes |
|---|---|
| `layers/core-api/src/__tests__/users.integration.test.ts` | the whole `AC3/AC15: PATCH …/skills/:skillId` describe (`:138-217`, 5 tests); the skills seed at `:71-76`; the skills assertions inside `AC2` (`:120-124`) — the test keeps its 404 and identity assertions; the `userSkills` import |
| `layers/core-api/src/__tests__/P2-user-routes.integration.test.ts` | the whole `AC10: PATCH …/skills/:skillId` describe (`:214-286`); the skills seed and `toHaveProperty("skills")` inside `:166`; the `userSkills` import |
| `framework/db/src/__tests__/P2-user-schema.integration.test.ts` | the `AC1 (critique): user_skills table has user_id column` describe (`:182-239`, 3 tests); the `user_skills` clause in the `:240` describe title (its two tests are about `org_edges`); the file-header claim at `:3`; the `userSkills` import |
| `framework/db/src/__tests__/schema.integration.test.ts` | the `inserts and reads user_skills` test (`:451-470`); `"user_skills"` from the expected table list at `:39-42`; the `userSkills` import. **Plus one addition:** `expect(tableNames).not.toContain("user_skills");` beside `:63` — one of the drop's three reds (§11.7) |
| `layers/core-api/src/routes/__tests__/AD4-agent-profile.integration.test.ts` | the `response does NOT expose skills even when userSkills rows exist` test (`:274-294`). **The preceding test at `:270-271`, which asserts the profile has no `skills` key without seeding, stays** — its subject is the profile response, not the table |
| `layers/core-api/src/routes/__tests__/agent-profile.integration.test.ts` | the `userSkills rows in DB do NOT appear in profile response` test (`:423-445`) |
| `layers/core-api/routine/src/__tests__/routine-run-resolver.integration.test.ts` **[cascade]** | **six** delegation cases, plus both shared helpers reshaped — the per-case table below |
| `framework/db/src/__tests__/zod-schemas.test.ts` **[cascade]** | the `selectUserSkillSchema is a valid Zod schema` case (`:144-146`) — its subject is a deleted export — and the `selectUserSkillSchema` import member (`:44`). The other ~40 select-schema cases in the file are untouched |

**`routine-run-resolver.integration.test.ts` — per case.** This is the dedicated test file for
`resolveRoutineRunRequest`, the function whose delegation branch §11.2 deletes
(`routine-service.ts:366-378`). An earlier revision omitted it entirely; that was the largest gap in the
list. It holds **fourteen** cases across two describes (the critique said fifteen — `grep -c '\ttest('`
returns 14, and the correction does not change any disposition).

| case | disposition |
|---|---|
| `:132` bakes the full request, owner not at capacity | **stays** — the surviving happy path |
| `:166` rejects when the routine run does not exist | **stays** |
| `:177` rejects when the run's outcome is not `running` | **stays** |
| `:197` rejects when the routine is soft-deleted | **stays** |
| `:218` rejects when the routine is inactive | **stays** |
| `:239` rejects when the routine's state is not `active` | **stays** |
| `:260` delegates to a fallback agent when at capacity + delegation allowed + skillId | **deleted** — its subject is the branch |
| `:285` keeps the owner when at capacity but `delegationAllowed` is false | **deleted** — the branch's negative; without a capacity check the setup is meaningless |
| `:308` keeps the owner when at capacity but no `skillId` | **deleted** — same |
| `:331` keeps the owner when NOT at capacity even if both fields are set | **deleted** — same |
| `:356` keeps the owner when `selectAgent` finds no candidate | **deleted** — asserts a code path that ceases to exist |
| `:380` rejects when the **resolved owner** is not a runnable AI agent | **stays** — subject is `requireRunnableAgent`, which survives |
| `:400` rejects when the **delegated fallback** is not a runnable AI agent | **deleted** — there is no delegated fallback |
| `:462` bakes a `contextBundle` with ranked knowledge | **stays** — drop only the `agentSelection:` line from its fresh deps literal (`:496-501`) |

Eight stay, six go, **none is repointed**. The five "keeps the owner" negatives are deleted rather than
kept-as-trivially-true for the reason the rule exists: after the branch is gone they would assert an
outcome no code can vary, which reads as coverage and is not.

**The two shared helpers.** `fakeAgentSelection` (`:116-125`) exists only to supply `agentSelection` —
**delete it**. `buildDeps` (`:127-129`) returns `{ agentSelection, requireRunnableAgent }` — it becomes
zero-argument and returns `{ requireRunnableAgent }`, which the eight survivors call as `buildDeps()`.
Keeping `buildDeps` rather than inlining is one edit instead of seven and leaves the file's shape intact.

**One comment rewrite.** The file header's step 3 (`:15-19`) describes the delegation rule in prose; it
becomes *"Resolve the target agent: the routine's `ownerAgentId`."* Rewrite **only** those lines — the
surrounding header carries pre-existing work-package ids this pull request must not re-author (§9).

**Fixture-line edits only (9)**

| file | what goes |
|---|---|
| `layers/core-api/settings/src/__tests__/plugin-configuration.test.ts` | the `userSkills` seed (`:511-515`), the `kind: "skill"` assertion (`:294-298`), `, skills,` from the test title at `:268`, the import. Every other assertion in that test stays — that is the evidence the projection is otherwise unchanged |
| `layers/core-api/src/__tests__/configuration-projection-boot.integration.test.ts` | the `userSkills` seed (`:179-183`) and the `kind: "skill"` assertion (`:62-66`), same argument |
| `framework/db/src/__tests__/migration.integration.test.ts` | **remove** `"user_skills"` from the expected list (`:30-34`) — required for green, proves nothing on its own — **and add** `expect(tableNames).not.toContain("user_skills");` beside the `factory_settings` line at `:55`. The addition is the red (§11.7) |
| `framework/db/src/__tests__/pg-migration.integration.test.ts` | same two edits: list at `:36-40`, addition beside `:63` |
| `layers/core-api/routine/src/__tests__/routine-scheduler-completeness.integration.test.ts` **[cascade]** | `inertPorts()` (`:52-77`) returns a fresh `RoutineSchedulerPorts` literal; drop its `agentSelection: { isAtCapacity, selectAgent }` entry (`:71-74`). That is the file's only reference — no case, title or assertion changes |
| `layers/core-api/src/__tests__/policy-engine.integration.test.ts` | see the paragraph below — eleven fixture calls, no assertion change |
| `layers/core-api/src/services/__tests__/routine-scheduler-baked-emit.integration.test.ts` | the local `listAgentIdsBySkill` (`:77-84`), `testConcurrencyBoundReader` (`:63-`), the `agentSelection` port literal (`:152-165`), the `isAgentAtCapacity` and `userSkills` imports. Its four tests and every assertion stay |
| `layers/core-api/src/services/__tests__/routine-scheduler-relocation.integration.test.ts` and `layers/core-api/src/services/__tests__/agent-run-admission-failed-routine-run-migration.integration.test.ts` | the same four edits (`:88-95`/`:101-108`, `:74-`/`:71-`, `:162-175`/`:170-183`, imports). Their tests and assertions stay |

**`policy-engine.integration.test.ts` — the eleven callers an earlier revision missed.**

That revision said the `seedAgentSkill` helper (`:238-247`) "has **zero callers** — verified" and could
be deleted as dead code. **That is false, and it would have stranded a builder mid-commit.** It is called
**eleven** times in the same file: `:341, :355, :382, :401, :416, :436, :476, :497, :527, :552, :577`.
Its `@deprecated AD4` banner says the *rows* no longer drive policy decisions; it does not say the helper
is uncalled, and it is not.

**Disposition: delete the helper, all eleven call lines, and the `userSkills` import. No assertion
changes and no test is deleted.** The eleven rows are inert, and this is verified two ways rather than
asserted:

- **Production never reads the table for policy.** `rg 'userSkills' layers/core-api/src --glob '!**/__tests__/**'`
  returns only `routes/users.ts` and `services/routine-scheduler-bindings.ts` — nothing in `policy`. Post-AD4
  routing is verdict-based trust, so the seeded `autonomyLevel` reaches no decision.
- **The file proves it against itself.** `AC4: no agentSkills defaults to L1 -> push` (`:367-378`) seeds
  **no** row and expects exactly the same single push as `AC3` (`:339`, seeds L2) and `AC4` (`:353`,
  seeds L1). Same expectation with the row and without it.

Per call site, so nothing is improvised: `:341` (AC3, push), `:355` (AC4, push), `:382` (AC7, high risk
pushes + no auto-resolve), `:401` (AC8, `skill_change` pushes + no auto-resolve), `:436` (AC5 blocking →
push), `:552` (AC11 outside window → push) — six that expect a push the seed does not cause; `:416` (AC5
silence → queue), `:476` (AC10 per-team silence → queue), `:497` (AC11 in-window → queue), `:527` (AC11
overnight wrap → queue) — four that expect a queue the seed does not prevent; `:577` (high risk pushes
through silence mode). All eleven: subject survives, assertion unchanged, seed line removed.

Three stale trailing comments go with their lines — `// Would normally push` (`:416, :476, :497`) and
`// L2 should push` (`:527`) — as does the orphaned `// No seedAgentSkill call — defaults to L1` at
`:369`. That case's title, `AC4: no agentSkills defaults to L1 -> push`, then names a table that no
longer exists: **retitle it to state the surviving fact** (an item with no trust history pushes) and
touch nothing else in it. A title is not an assertion; §8.3's contract is unaffected.

**Counts, corrected.** **Sixteen** test files name `userSkills` / `user_skills` today — not thirteen —
and **four** more are reached by the cascade without naming it: `concurrency.integration.test.ts`,
`routine-run-resolver.integration.test.ts`, `routine-scheduler-completeness.integration.test.ts`,
`zod-schemas.test.ts`. **Twenty test files**, and the three tables above account for all twenty:
3 deleted + 8 losing cases + 9 losing fixture lines.

**The post-commit sweep, stated so it is actually true.** After this commit,

```
rg -a 'userSkills|user_skills' layers/ framework/ applications/ tools/   --glob '!framework/db/drizzle/**' --glob '!framework/db/drizzle-sqlite-archive/**'
```

returns **nothing**. Both migration-archive exclusions are load-bearing: `framework/db/drizzle/` holds
the `0013` rename and twenty-one `meta/*_snapshot.json` files, and
`framework/db/drizzle-sqlite-archive/0018_P2_rename_agents_to_users.sql` holds the same rename — history,
never edited. An earlier revision excluded only the first and would have reported a false positive. The
sweep is a check, not the guarantee: `npm run check` is what enforces it, since the symbol is gone.

### 11.10 Registry and docs

**`governance/table-owners.json`.** Delete the `userSkills` line from `unowned.tables`. `totals` becomes
`{ tables: 44, owned: 39, unowned: 5 }` in this commit and reaches `44 / 44 / 0` at §7.2 commit 7. A
table left in the registry after the schema drops it is a **build error** by the `phantom` check
(`scripts/lib/governance-registry.ts:132-135`), so the two edits are inseparable — which they already
are, since the schema edit alone fails `totals.tables !== liveTables.size` (`:147-149`).

**Keep the `unowned` block itself when its `tables` map empties.** `validateTableOwners` iterates
`registry.unowned.tables` unconditionally (`:141`) and `TableOwners` declares `unowned` as required
(`:22`), so `unowned` must remain as `{ note, tables: {} }` with a rewritten note. An earlier draft of §9
said the block is deleted; it is not — only its contents are. AC #1's "`unowned` empty" is satisfied by
an empty `tables` map.

**Docs — four lines, no rewrite.**

| doc | change | why in scope |
|---|---|---|
| `docs/architecture/as-implemented-domain-architecture.md:388` | `45 tables` → `44 tables`; drop `user_skills` from the enumeration | directly falsified by the same commit that changes `totals.tables` |
| `docs/process-layer/staged-operation.md:72` | *"Removing vestigial per-skill autonomy data is **AL9** (not built)"* → state that the data is removed | it is built, here. State the fact rather than swapping in another work-package id |
| `docs/requirements/functional-requirements.md:11` | drop the `(users.skills)` parenthetical from F-1.1 | this cite was **already wrong** — there has never been a `users.skills` column — but the deletion removes the last storage that could ever back the claim, so it moves from mis-cited to unbackable. One parenthetical, not a rewrite of F-1.1 |
| `docs/process-layer/teams.md:19` | drop the `(users.skills, schema.ts)` cite from the "Skill match" bullet | same, and it is the only remaining doc claim that an agent has a persisted skills attribute |

**Out of scope and deliberately left:** the four `skill_change` routing docs (§11.4 — not false);
`docs/agent-layer/agent-model.md:15` and `docs/process-layer/staged-operation.md:147` (both say autonomy
is *not* a per-skill dial — still true); `docs/product/product-decisions.md:13` (still true) and `:24`
(the skills-as-knowledge question stays open — Ruling 4 forecloses nothing, `founder-rulings.md:74-78`);
`docs/archive/kernel-strategy-split.md:255,282` (archive).

**Code comments the deletion falsifies** are covered in §9. Every one of them lives in a file or block
this commit deletes outright, which is the cheapest possible resolution.
