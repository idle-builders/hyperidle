# BA1 — Code Review

**Scope:** `efd57907b..9fe1dc6e7` (82 files). Gates pre-verified by the coordinator, unpiped, and not re-reported here.

**Verdict: BLOCKED.** Two blocking findings.

---

## BLOCKING

### B1 — Migration `0060` aborts on any real database; the test that "proves" it uses a fabricated pre-migration schema

`framework/db/drizzle/0060_BA1_one_routine_primitive.sql:32-44` (and the identical blocks at `:49-61`, `:66-79`).

Step 3 copies the surviving global-builtin row with an explicit column list that omits `team_id`. But
`routines.team_id` is `text NOT NULL` with no default — created that way in
`0023_AA1_routine_visibility.sql:14` and never widened — and it is not dropped until step 4 (`:89`). So the
INSERT writes NULL into a NOT NULL column.

Reproduced by replaying the real `0060_*.sql` against a PGlite instance migrated to the real pre-BA1 shape
and seeded with `builtin:knowledge-decay:t1` / `:t2`:

```
0060 FAILED: null value in column "team_id" of relation "routines" violates not-null constraint
```

**Failure scenario.** Any deployment where a team has ever been created holds
`builtin:portfolio-retro:<teamId>` rows. `npm run db:migrate` aborts at the first of the three INSERTs.
`0060` is not idempotent, so the database is left mid-migration — `description` already renamed to `prompt`,
`event_type` added and backfilled, index created — with the journal entry unwritten. A fresh or empty
database is unaffected, because the SELECT returns no rows and the INSERT is a no-op. That is precisely why
every automated gate is green.

**Why the test does not catch it.** `framework/db/src/__tests__/ba1-routine-and-belonging-migration.integration.test.ts:72`
reconstructs the pre-migration shape as `ALTER TABLE "routines" ADD COLUMN "team_id" text` — nullable.
Re-running the same repro with only that line changed to `NOT NULL` flips the result from pass to the failure
above. `PRE_BA1_SHAPE` was added during the green phase and is a hand-written stand-in for the schema under
test. Every other column it restores matches the real thing; `team_id`'s nullability is the one that differs,
and it is the one the migration depends on. The check exercises a stand-in for the thing it exists to prove.

Governing: architecture §4 step 3 and §9 — "the migration's data steps, proved against a database that has
rows". The invariant is unproven on the real schema.

### B2 — D6's belonging column has no writer; nothing in production ever sets `users.owner_user_id`

Architecture D6 and task T1 name the writer explicitly: `AgentScaffoldSpec` gains `ownerUserId?: string`, the
`user_assistant` case sets it, `persistScaffoldedAgents` passes it to `insertUser`. None of that is in the
diff — it touches no file under `layers/core-api/users/`, `layers/core-api/org/`, or
`framework/factory-defaults/`. The only surviving reference is unchanged:
`layers/core-api/org/src/resolve-scaffold-specs.ts:75` — `idHint: request.ownerUserId ? \`ast-${request.ownerUserId}\` : undefined`.

A production sweep for `owner_user_id` / `ownerUserId` outside tests finds three live sites: the schema
declaration, the read at `layers/core-api/routine/src/routine-service.ts:457`, and the `ScaffoldRequest` field
that only ever becomes an `idHint`. There is no write path.

**Failure scenario.** Register a human after this ships. `layers/core-api/src/routes/users.ts:140` scaffolds
their `ast-<userId>` assistant and the row is inserted with `owner_user_id = NULL`. The naming convention is
still the only link — the exact defect `requirements.md` identifies. The column is populated only by `0059`'s
one-time backfill of rows existing at migrate time, never again, so `resolveRoutineRunRequest`'s `userId` bake
is dead for every agent created after the migration.

**Confirmed live** by the coordinator on the running server: a freshly registered human's assistant returns
`ownerUserId: null` with id `ast-<user-id>`.

This also makes shipped documentation false: `docs/agent-layer/agent-model.md:36` and `:68`.

---

## NON-BLOCKING DEFECTS

**N1 — the only test of secret-bearing configuration rejection was deleted and not replaced.** The green-phase
rewrite of `agent-behavior-settings.integration.test.ts` removed the `SECRET_VALUE_REJECTED` row. That symbol
now appears in two production files and zero tests; `plugin-configuration.ts:143`'s `secret-bearing` throw
likewise has none. The mechanism is still live and reachable through `tool`'s free-text `description`. Coverage
loss, not a behaviour regression — but the one item the rewrite dropped silently.

**N2 — `users_belonging_ck` is declared but never proven live.** §9 required an assertion that writing both
`team_id` and `owner_user_id` is rejected. None exists, and nothing asserts the founder-required "belongs to
neither" is accepted. The predicate itself reads correctly.

**N3 — `create_routine`'s agent-facing description still says event routines are impossible.**
`layers/agent-orchestration/tool-handlers/src/tool-definitions.ts:1196` still reads "Requires a calendar
trigger with a cron expression" and still speaks of "a team agent". An agent asked to run something when a bet
completes reads this, concludes the tool cannot express it, and refuses or fabricates a cron. The capability
exists and is invisible to the only surface the model can see.

**N4 — a transient failure inside `requireRunnableAgent` now permanently disables the routine.**
`routine-service.ts:435-451` normalises every throw into `agent_not_runnable`, and
`routine-scheduler.ts:634-653` reacts by setting `state:"error", active:false`. `requireRunnableAgent` begins
with a database read. A connection blip previously produced a retry on the next tick; now it takes the routine
out of both the tick filter and the matcher permanently, until a human PATCHes it back, with an error message
naming a connection problem. D9 assumed this catch only sees a normalised `AgentNotRunnableError`.

**N5 — `UpdateRoutineRequest` still declares `description`.** `framework/api-contract/src/core-api-port.ts:506`,
while `InsertRoutineRequest` was renamed to `prompt`. The PATCH schema is `.strict()` and knows only `prompt`,
so a caller following the declared contract gets a 400. The one real caller passes `prompt`, which is not
declared on the type at all and survives only via an unchecked cast in `tool-handlers-bindings.ts:83-85`.
Typecheck sees neither half.

**N6 — D10's deletion list is complete except the archaeology comment it names.**
`layers/agent-orchestration/session-requests/src/service.ts:1079-1097` still describes the trigger config
entity, the Triggers tab, and a product gap this package closed. Everything else in D10 is done, with no orphan
union member, dead export or stale constraint found.

**N7 — the detail pane shows a cron picker for an event routine and silently writes one.**
`RoutineDetailPane.tsx:429-447` renders the schedule select unconditionally; saving an event routine writes a
`trigger_config` cron it never had. Contained — the tick loop skips event routines and the label
short-circuits — but the pane offers a control that means nothing here, and none for `eventType`, which PATCH
accepts and no UI surfaces.

**N8 — the cut-3 admission-failed checkpoint can pass on a broken cut.** The re-point away from waiting on R's
run count is correctly reasoned, but `otherRuns.length >= 1` does not establish that R's would-be fire has
completed, and the matcher starts each fire without awaiting. Ordering by id makes R almost always land first,
which is why this is a note. Waiting on a settled count would remove the dependency.

**N9 — slop and simplification.**
- `O3-service-move-bootstrap.integration.test.ts:323-370` hardcodes all 34 event names in reverse order — a new
  parallel vocabulary in a package whose rationale is removing them. It can import `EVENT_TYPES` and reverse it.
- `routine-scheduler.ts:800` drops the old `unwind`'s try/catch, so one throwing disposer strands the remaining
  33 subscriptions on `stop()`. `.reverse()` also mutates in place.
- `schedule-label.ts:114-122` gives `eventType` a `= null` default, so a future caller that forgets renders
  "On event" for everything instead of failing to compile.
- `RoutineCreateDialog` is mounted only from `WorkTeam.tsx:698` and offers only that team's agents, so a routine
  owned by a team-less or individual agent — the case the nullable-team bundle was built for — cannot be
  authored through the UI at all.

---

## VERIFICATION GAPS AGAINST THE APPROVED §9

- **The two screenshots.** §9 requires a painted-output check of the routine detail page and the create dialog;
  `.claude/rules/visual-regression.md` makes it non-negotiable for a UI change. Component tests assert the DOM,
  which is not a paint check.
- **The `EVENT_TYPES` red-able demonstration record.** The reviewer independently verified the assertion is
  genuinely red-able; only the recorded observation is missing.

---

## WHAT IS RIGHT — CHECKED, NOT ASSUMED

**The founder's ruling is honoured.** `EVENT_TYPES` carries all 34 with nothing excluded; there is no second,
narrowed constant; the endpoint, both schemas and the agent tool all read the same one. No depth counter, cycle
detector, run-chain accounting, rate limit or back-off exists in the new code. The only suppressions in
`registerRoutineEventMatcher` are the two sanctioned ones — the builtin exclusion and cut 3's origin — both
applied to the match set, never the subscription set.

**Cut 3 is correct and fails open.** `originRoutineId` resolves in the three specified steps and returns null
otherwise; everything fires when origin is unknown. Both spellings are pinned as type-level constants, so a
rename in either union breaks the build at the predicate. The match set is resolved before the origin lookup,
so an event with no matching routines pays nothing. All three specified cases have tests.

**The live-read matcher is not a hot query, and it was measured.** With 6,000 routine rows (3,000 event rows on
one hot event name), `ANALYZE`d, `EXPLAIN` on the exact predicate with bound parameters chooses
`Index Scan using routines_event_type_idx`, and keeps choosing it across repeated executions. `canProvision` is
checked synchronously before any database work. Immediate pause and delete are proven by two tests the old
boot-time list provably could not pass. No cache was reintroduced.

**D9 is real.** The unrunnable-owner test asserts the run row's outcome and message, the routine's error state,
and that a second emit produces nothing further; the paired negative asserts a paused routine stays paused with
zero run rows.

**The other three self-reported test edits check out.** The deleted `toHaveLength(0)` was correctly superseded
and its narrower guard survives. The AF17/builtin edits follow from D7 and D5, and the retired premise was
replaced by a genuine assertion rather than deleted. The two settings rewrites are proportionate; N1 is the one
item they dropped without saying so.

**Scope holds in both directions.** Nothing from BA7, BA8 or BA9 leaked in: the `ast-` prefix consumers are
untouched, no event type was added, no plugin distribution appeared, `agentCategory` is untouched, and the four
builtins are still in core. The duplicate vocabulary in `domain-model/src/events.ts` is correctly left alone.
