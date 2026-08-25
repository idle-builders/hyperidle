# BA1 — Final Review

Fresh reviewer, formed from the code at HEAD `20ec1f4d2` on `plan/BA1-refinement`.
Scope: `efd57907b..HEAD`, end state only. Read-only.

Gates (`npm run check`/`lint`/`vitest`/`test:integration:service`) and the live proof were run by the
coordinator and are taken as given; not re-run here.

## Verdict: APPROVED

The implementation is correct across all six lenses. Every one of the ten previously-raised findings is
genuinely fixed in the code, not merely reported fixed. The founder's loop ruling is honored exactly. No
blocking issue found. Three non-blocking coverage gaps and three minor observations below — none changes
runtime behaviour, and each has a stated, defensible reason or a low blast radius.

---

## The ten re-tested claims — all hold

1. **Migration `0060` NOT NULL + idempotency — HOLDS.** Step 3's builtin-dedupe `INSERT`s now carry
   `team_id`, copied from the survivor row (`0060_BA1_one_routine_primitive.sql`, the three INSERT column
   lists) — `team_id` is NOT NULL until step 4 drops it, so the B1 violation is closed. Structural
   statements are guarded (`IF EXISTS`/`IF NOT EXISTS`, the `DO $$` block for the one unguardable
   `RENAME COLUMN`). The idempotency question is moot in practice: `framework/db/src/migrate.ts` uses
   drizzle's pglite migrator, and `node_modules/drizzle-orm/pg-core/dialect.js`'s `migrate()` wraps **all
   pending migrations in one `session.transaction`** — any failure rolls the whole batch back, so
   partial-migration state never persists and a re-run always starts from the pre-batch schema. See minor
   observation M2 for the one place the file's own comment overstates this.

2. **Migration test cannot drift and stays sensitive — HOLDS.**
   `framework/db/src/__tests__/ba1-routine-and-belonging-migration.integration.test.ts` builds the
   pre-BA1 database by filtering the real `meta/_journal.json` to entries before `0059_BA1_` and running
   the real `.sql` files through the real `drizzle-orm/pglite/migrator` (`buildMigrationsFolderUpTo`), then
   exec's the real `0059`/`0060` files by prefix (`readMigrationByPrefix`). It re-declares no schema, so it
   cannot drift. It would still catch a `0060` regression: the builtin-dedupe case seeds real NOT-NULL
   `team_id` rows (line 203-210) — a step-3 INSERT that dropped `team_id` would throw; the malformed-row
   case (line 180) asserts the migration completes with `event_type NULL` — removing the `IS JSON OBJECT`
   guard would abort the cast and fail the test.

3. **`ownerUserId` writer path — HOLDS.** `AgentScaffoldSpec.ownerUserId` (`scaffold-agents.ts:72`), the
   `user_assistant` case sets it (`resolve-scaffold-specs.ts:76`), `persistScaffoldedAgents` passes it to
   `insertUser` (`scaffold-agents.ts:168`). `ba1-owner-user-id-writer.integration.test.ts` drives the real
   `POST /api/users` and asserts `ast-<id>` carries `ownerUserId === humanId`.

4. **Secret-bearing config rejection — HOLDS.**
   `agent-behavior-settings.integration.test.ts:303` asserts a secret-bearing value under the surviving
   `tool` kind returns `422 / SECRET_VALUE_REJECTED`, reaching the same `validateConfigurationValue` guard
   the deleted `trigger` test exercised.

5. **`users_belonging_ck` live assertions — HOLDS.**
   `ba1-users-belonging-check.integration.test.ts`: team+owner together `rejects.toThrow()` (line 33-44),
   belongs-to-neither is accepted and read back null (line 47-62).

6. **`create_routine` tool description — HOLDS.** No longer says a cron is required:
   "Fires on a calendar schedule (a cron expression) or on an event … pick triggerType accordingly."
   (`tool-definitions.ts:1195`). Schema and handler branch cleanly on `triggerType`.

7. **Transient DB failure does not disable a routine — HOLDS.** `runnable-agent.ts:34-39` sets
   `AgentNotRunnableError.name` explicitly; `resolveRoutineRunRequest` normalises to
   `reason:"agent_not_runnable"` **only** when `error.name === "AgentNotRunnableError"`
   (`routine-service.ts:459`), else re-throws. A DB blip inside `findUser` throws a plain `Error`, so it
   propagates past `fireGenericRoutine`'s catch (`routine-scheduler.ts:633,656`) without inserting the
   error run row or setting `state:"error", active:false`. The rolled-back transaction persists nothing;
   the next event retries.

8. **`UpdateRoutineRequest` agrees with its caller — HOLDS.** `core-api-port.ts:513` now declares
   `prompt`, not `description`, matching the route's `.strict() updateRoutineSchema`
   (`routines-routes.ts:69-89`) field-for-field. The `update_routine` handler sets `name/prompt/
   triggerConfig/state/active` (`tool-definitions.ts:1308-1316`), all accepted by the schema. The
   `widenUpdateRoutineInput` cast (`tool-handlers-bindings.ts:83`) is the pre-existing Mechanism-C
   `unknown → T` idiom; it no longer hides a mismatch because the target type is now correct.

9. **Stale archaeology comment — HOLDS.** `session-requests/src/service.ts:1091-1097` now states BA1 D10
   closed the gap by deleting the entity, and explicitly records the note as history, not a live gap.

10. **Detail pane — HOLDS.** `RoutineDetailPane.tsx:474` renders the event `Select` for
    `triggerType === "event"` and the cron picker only otherwise; save writes `eventType` for event
    routines and `triggerConfig` cron only for calendar ones (`:268-271`) — no silent cron write.
    `eventType` is surfaced (`:198,490`). D9's failure reason renders as the run row `subtitle` (`:673`).

---

## Founder's absolute ruling — honored exactly

- **All 34 events authorable, no allow-list.** `EVENT_TYPES` (`framework/event-bus/src/events.ts`) is the
  single source; the matcher subscribes to every member (`routine-scheduler.ts:777`), and both route
  validators + the tool schema read it directly. No narrowed `ROUTINE_AUTHORABLE_EVENT_TYPES` exists.
- **No loop prevention of any kind.** Grep across `layers/core-api/routine/src` finds no depth counter,
  cycle detector, rate limit, or back-off. The only suppression is cut 3.
- **Cut 3 is applied to the match set, never the subscription set, and only the same routine.**
  `registerRoutineEventMatcher` resolves the match set first, computes `originRoutineId` only when the set
  is non-empty, and drops solely `routine.id === origin` (`:786-789`). `originRoutineId` gives up (`null`)
  on unknown origin — suppressing nothing. NB1's two source-kind spellings are pinned and type-checked
  (`:719-720`), and the red-able demonstration in `red-demonstrations.md` shows line 719 fails `check` on a
  rename.

## Six lenses — no defects

- **Architecture:** matcher stays inside the routine service boundary; `listRoutines` gained
  `ownerAgentIds`/`eventType` filters (`routine-service.ts:161-183`); team read comes off the already-loaded
  agent row (no new port). No new package, no work-package id in code.
- **Design:** `RoutineCreateDialog` drops the `teams` prop, adds a "When" (schedule/event) select feeding
  an event `Select` from `GET /api/routines/event-types`, uses ds primitives with aria labels; both
  `.stories.tsx` present.
- **Security:** write endpoints widened to closed enums; event-types endpoint reads a constant, no tenant
  data; the trigger is a domain event an outsider cannot emit; deletes are bounded by exact `kind`/`id`.
- **Adversarial:** no new `as any`/`@ts-*`/`as unknown as` in production code (the only `as unknown as`
  hits are in test files). The matcher's `.catch(() => {})` is safe — `fireGenericRoutine` persists nothing
  on a rolled-back transaction, so a swallowed transient error leaves no orphan and the next event retries.
- **Simplification / slop:** dense `@lore` comments are justified by the cross-cutting seams; no dead code,
  no single-use wrappers introduced. No `.skip`/`.only` added. Net +43 integration assertions.

## Removed tests — each legitimately obsolete or replaced

- `partial event-trigger registration unwinds…` — `registerEventTriggers` deleted; the boot-time
  trigger_config parse it guarded no longer exists.
- `listRoutines / teamId filter` — `teamId` filter replaced by `ownerAgentIds`; the new filter is
  exercised by the teams-routes call sites and the matcher's own query.
- `two teams each get 4 built-in routines (8 total)` / `each routine id contains the team id` — replaced
  by `AF17-team-routines.integration.test.ts:170` "a second team's provisioning does not duplicate global
  builtins" (D7).
- `NOT_FOUND for nonexistent teamId` — create route dropped `teamId` + `getTeam`; obsolete.
- agent-behavior `six kinds` / `trigger edits` — trigger kind retired; secret coverage moved to `tool`
  (claim 4). Legitimate.
- `does not persist a run or an intent when … not runnable` — superseded by D9: a non-runnable owner now
  **does** persist an error run row. The new behaviour is asserted in
  `routine-scheduler-baked-emit.integration.test.ts:536`.

---

## Non-blocking findings

**N1 — §2.5 double-fire regression guard is untested.** The matcher suppresses builtins via
`extractBuiltinKind(routine.id) === null` (`routine-scheduler.ts:786`); this is the only thing preventing
`builtin:post-bet-retro` (a `triggerType:"event"` row on `bet_state_changed`) from firing generically in
addition to the builtin handler. No test runs the **full scheduler** (matcher active) together with
`registerBuiltinRoutineReactions` on `bet_state_changed` and asserts exactly one run row / zero
`routine_run` intents. The existing post-bet-retro test (`builtin-routines.integration.test.ts:300`) uses
only `registerBuiltinRoutineReactions`, so the matcher is not in the picture. §9 explicitly specified this
assertion ("No double-fire (§2.5)"). Failure scenario: a future edit deletes the `extractBuiltinKind`
filter, every bet completion starts a spurious generic agent session on top of the builtin retro, and no
test goes red. Behaviour is correct today — this is a missing guard, not a defect.

**N2 — AC2 (several matches) has no direct test.** §9 specified two event routines with different owners
on the same event both firing, distinct `idempotencyKey`s, repeatable on a second emit. That exact test is
absent; the only evidence is indirect — the cut-3 narrowness control
(`routine-scheduler-baked-emit.integration.test.ts:~636`, `otherRuns.length >= 1`) proves S, a distinct
routine on the same event, fires while R is suppressed. That demonstrates the matcher's fire-all loop works
for one member, but not two simultaneous matches with distinct keys. Adequate but weaker than specified.

**N3 — AC3 (no match) has no direct test.** §9 specified "emit an event no routine names → zero new
`routine_runs` and zero new `agent_work_intents`." No pristine unnamed-event test exists. It is covered
indirectly: the pause and soft-delete tests (`…baked-emit…:394,464`) emit the event and assert no run
because the matcher's `active`/`deletedAt` query returns zero rows — the same zero-match code path — and
the surviving calendar-path tests carry the "today's behaviour unchanged" half. Functionally covered.

## Minor observations (non-blocking)

**M1 — a freshly provisioned `builtin:post-bet-retro:<team>` carries its event name only in
`trigger_config` JSON, not in the `event_type` column.** `provisionTeamRoutines` passes
`triggerConfig: {eventType:"bet_state_changed"}` but no `eventType`, and `insertRoutine`
(`routine-service.ts:102`) does not derive `event_type` from `trigger_config`. Harmless today — builtins
are excluded from the matcher and fired via the builtin handler, which never reads `event_type` — but it is
inconsistent with rows the migration backfilled (which got `event_type` set), and it would silently fail to
match if a future change ever routed builtins through the matcher.

**M2 — `0060`'s header comment overstates re-run safety.** It claims safety "against a database left
mid-migration by an earlier failed attempt," but step 3's INSERT hard-references `team_id`, which step 4
drops; a hypothetical re-run after a failure *past step 4* would fail at step 3. This is unreachable in
practice (the migrator wraps the batch in one transaction, so no partial state ever persists — see claim
1), so the claim is vacuously true, but the comment implies a per-statement guarantee the file does not
actually provide.

**M3 — the create dialog was not screenshotted.** §9 asked for one screenshot of the open dialog;
`live-proof.md` captured the detail page and work overview but not the dialog. The dialog is covered by
`RoutineCreateDialog.test.tsx` + its story, so this is a documentation gap in the proof, not a behavioural
one.
