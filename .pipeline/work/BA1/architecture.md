# BA1 — Architecture

Authority: `.pipeline/work/BA1/requirements.md` (refined with the founder 2026-08-24/25). `plan.md` is
the superseded framing and is not an authority here. Probes and their evidence: `feasibility.md`.
Checked against `plan/BA1-refinement`, based on `origin/main` at `115c54764`.

> **Revision 2 — after `architecture-critique.md` (verdict BLOCKED, six items).** Every blocker was
> re-verified against the code before revising; all six hold and none is argued. B1 → D9's cause
> discriminator; B2 → D9 renders `errorMessage`; B3 → D3 decides what `**Purpose:**` becomes; B4 →
> D8's `as const satisfies`; B5 → D5's write-side contract; B6 → §3.1. N1–N8 are corrected in place,
> including the event count (34, not 33) and a fifth event vocabulary.
>
> **Revision 3 — after the founder's ruling on §3.1.** Loops are accepted. The allow-list is deleted,
> all 34 events stay authorable, no loop-prevention mechanism is built, and one narrow cut stands: a
> routine's own run may not re-trigger *that same routine*. §3.1 is now closed and states exactly what
> that cut covers and what it cannot.
>
> **Revision 4 — after the second critique (two new blockers).** NB1: cut 3's step-3 condition tested one
> source-kind vocabulary and there are two, so `agent_run_admission_failed` — the one shape with no agent
> session between iterations — silently fell through. Fixed in §3.1.1, with a test. NB2: a plain
> `z.object` **strips** unknown keys, so "reject `teamId`" needed `.strict()` to be true. Fixed in D5.
> Its four wording/omission findings are corrected in place.
>
> **Revision 1 — after the founder's second answer to requirements question 2.** The boot-time
> subscription list is a **defect this package removes**, not a limitation it documents. That is D2.

**Engineering tier: mvp.** Rigor is set to "the change works and cannot silently regress", not to
"every possible concern becomes a mechanism". No outbox, no retry apparatus, no compatibility shim, no
new observability layer appears below.

---

## 1. What changes, in one paragraph

There is one primitive, a routine, and it fires on a clock or on an event. It carries a prompt where it
used to carry a skill. It declares no scope; it inherits its owner agent's, and an agent now belongs to a
team, to a person, or to neither as a real column. The routines matching an event are read from the
database at the moment that event happens, so a routine created, paused, edited or installed takes effect
on the very next event with no restart anywhere. The trigger-rule entity — a validated shape, a settings
category, a six-name event list and a live-but-unwritten prompt-override read — is deleted outright along
with its stored data. A routine that is global in intent is seeded once instead of once per team. A
routine whose agent cannot run stops pretending it fired, and says why on its own page.

Everything the change reuses already exists: the scheduler, the event bus, the work-intent enqueue, the
run record, the routine detail page. The change boundary is the shape of a routine row, how an event finds
its routines, the three contracts that carry a routine to the agent, and the deletion of the parallel
entity.

---

## 2. Reconciliation — where the approved requirements meet the code

Six disagreements between what the requirements assume and what the code does. The first four were
reported in revision 1 and re-verified by the critique; the last two surfaced while designing D2.

### 2.1 AC4 is not satisfied by the merge — it is real work

`requirements.md` maps "A missing agent fails visibly to whoever configured it" onto "The routine's
`state` goes to `error`; it is visible on the routine's own page."

**No production code has ever written `routines.state = "error"`** (P2). Worse, the failure is not merely
unrecorded: `fireGenericRoutine` runs the `routine_runs` insert and `resolveRoutineRunRequest` inside one
transaction (`layers/core-api/routine/src/routine-scheduler.ts:602-613`), so a non-runnable agent rolls
the run row back too. The routine then re-attempts on the next tick, forever, having written nothing.

**And the page cannot show the reason even once a reason exists** (P17): `RoutineDetailPane.tsx:593-608`
renders each run as an outcome dot, a start time and a duration. `errorMessage` is carried on
`RoutineRunSummary` and by the route, and is rendered nowhere in `layers/core-ui/src` outside an
unrelated feature. So AC4 needs both halves built. D9.

Two of the five ACs are still satisfied by the merge itself (AC2 and AC5); the third (AC4) is not.

### 2.2 The prompt already has a home, and it is `description`

`requirements.md` says a routine carries a prompt without saying which column. `RoutineDetailPane.tsx:18`
already rules that "the prompt IS routine.description", and the pane labels it **Prompt** in both edit and
read modes (P9). So the prompt is not a new field; it is an existing field wearing the wrong name next to
a `skill_id` that never worked. D1 renames rather than adds; D3 decides what the renamed column feeds.

### 2.3 "The Triggers tab" is not a tab

The task brief and `requirements.md` both speak of deleting "the Triggers tab in
`SettingsAgentBehavior.tsx`". There is no such tab (P6). There is one settings section labelled **Agent
behavior** that browses all six configuration kinds, with a trigger-shaped event filter bolted across the
top of it. The trigger kind and the filter retire; the section survives and keeps four kinds. D10 names
every line.

### 2.4 Two smaller corrections, recorded so they are not rediscovered

- The trigger entity's six-name list is worse than the requirement says: two of the six
  (`work.decompose_requested`, `knowledge.action`) are not `EventType` members at all, so they could
  never have matched even with a reader (P7).
- The `ast-<user-id>` convention has about **ten** production consumers, not one (P11). D6 adds the
  column and does not touch them — `.pipeline/BA.md` gives that rewrite to BA7.

### 2.5 The boot-time list already double-fires the one event builtin

`registerEventTriggers` selects `listRoutines(db, { active: true, triggerType: "event" })`
(`routine-scheduler.ts:700`) — **with no builtin exclusion**. `builtin:post-bet-retro:<teamId>` is seeded
with `triggerType: "event"` and `triggerConfig: {eventType:"bet_state_changed"}`
(`routine-scheduler.ts:126-136`), so it is in that set and gets subscribed to `bet_state_changed` →
`fireGenericRoutine`. Meanwhile `registerBuiltinRoutineHandlers` subscribes to the same event →
`fireBuiltinRoutine` (`:499-521`). Both are registered on the same bus in production bootstrap, seven
lines apart (`service-bootstrap.ts:508` and `:515`).

So today every bet state change starts a generic agent session for the post-bet-retro routine, on top of
the in-process builtin retro that runs on completion. The clock path has the branch that prevents this
(`extractBuiltinKind(routine.id)` → builtin vs generic, `:815-828`) and so does the manual-trigger path,
whose `@lore AU20 repair` note records that this exact branch "was lost in the AU20 destroyer pass". The
event path never got it. D2's matcher closes it.

### 2.6 There are five parallel event vocabularies, and BA1 closes three of them

`requirements.md` contrasts the trigger entity's six names with the bus's — which is **34**, not 33
(29 `KernelEvent` + 5 `StrategyEvent`, 34 distinct `type` literals, `framework/event-bus/src/events.ts:611-661`).
The 33 in `requirements.md` and `.pipeline/BA.md` was a miscount; both have since been corrected to 34
upstream, along with the BA8 and BA9 rows, so nothing further is owed here.

| List | Size | Where | After BA1 |
|---|---|---|---|
| `EventType` — the real one | 34 | `framework/event-bus/src/events.ts:611-661` | **survives, becomes the only live source** |
| `TRIGGER_EVENT_TYPES` | 6 | `framework/domain-model/src/trigger.ts:4-11` | deleted (D10) |
| `EVENT_LABELS` (schedule label) | 4 | `layers/core-api/routine/src/schedule-label.ts:27-32` | deleted (D8) |
| `EVENT_LABELS` (settings UI) | 6 | `layers/core-ui/src/settings/SettingsAgentBehavior.tsx:38-46` | deleted (D10) |
| **the full duplicate union** | **34** | `framework/domain-model/src/events.ts:600-647` | **survives — not BA1's** |

The schedule-label one is the urgent one: once D8 makes every event authorable, the 30 outside its
four-name map render as the bare string `"On event"` on every routine card and detail page.

**The fifth is the awkward one and BA1 does not close it.** `framework/domain-model/src/events.ts` holds a
byte-for-byte duplicate of the entire vocabulary — `KernelEvent` at `:600`, `StrategyEvent`, `DomainEvent`
at `:647`, and every event interface beneath them. It is dead except `SessionOutcome`, the one symbol
`index.ts:97` re-exports, which is what keeps the file alive and out of knip's reach. It matters more than
its deadness suggests: `framework/domain-model` has `reach: everyone`, so it is the one copy `core-ui`
*can* import, and therefore the most likely place for a future reader to add an event and expect it to
work. Deleting ~650 lines of dead type declarations in another track's territory is not this package's
job. So the honest statement, which replaces revision 1's claim that "nothing is left to drift": **BA1
reduces five vocabularies to two, and makes the surviving live one mechanically complete. The dead
duplicate remains and should be an AU row.**

**No plan amendment is proposed.** Nothing above adds an outcome; §2.1 corrects the evidence for an
outcome the plan already owns, and §2.5/§2.6 are rubble inside the surface this package rebuilds — which
`.pipeline/BA.md` makes this track's job where it is cheap, and hands onward where it is not.

---

## 3. Decisions

Locked because each is public, cross-cutting, or a schema change. Everything not stated here — helper
placement, local names, test file layout — is the builder's. §3.1 carries the loop ruling and the one
cut that follows from it.

### D1 — One prompt column

`routines.description` is renamed to `routines.prompt`. `routines.skill_id` and
`routines.done_condition` are dropped. `prompt` stays nullable: a routine with no prompt runs the owner
agent on its own persona, which is today's behaviour and is what AC3 protects.

The API length limit for `prompt` is **12 000 characters** on create and update — the limit the retiring
`TriggerRuleValueSchema` allowed (`framework/domain-model/src/trigger.ts:30`), not `description`'s 2 000.
The founder's test for the swap was "nothing is lost"; a prompt truncated to a sixth of what the retiring
entity accepted would lose something.

*Rejected:* adding a second `prompt` column beside `description`. It puts two textareas that mean the same
thing on the same pane and contradicts the AV4 ruling that is already in the code.

### D2 — Event matching reads the database when the event happens

**This is the founder's ruling and the largest single change in the package.** Today
`registerEventTriggers` (`routine-scheduler.ts:695-731`) reads every active event routine once, inside
`startRoutineScheduler`, and closes over the result: one `eventBus.on(<that routine's event>, …)` per row.
The database stops being the source of truth the moment anything changes — a new routine never listens, a
deleted one keeps its subscription, and the `getRoutine` re-read at `:721-724` exists only to paper over
the second case.

It is replaced by `registerRoutineEventMatcher(db, eventBus, ports, config)`, which subscribes **one
handler per event type** and, when an event arrives, queries for the routines that name it.

**Registration shape: one handler per event type, not one wildcard handler.** Both reach every type, so
the choice is about what the subscription set is derived from. The set comes from a compile-time constant
(D8) and therefore **cannot go stale** — which is the whole defect being removed; deriving the
subscription set from anything mutable is how we got here. It also leaves the wildcard slot alone:
`run-orchestration/src/start-runtime.ts:327` already holds it for the runtime's wake signal, and stacking
a database query onto the channel whose one consumer is a cheap in-memory poke would make every event in
the system carry an invisible routine side-effect. Cost of the choice: one `Set` entry per event type
instead of one total, and a new event type must appear in the constant — which `npm run check` forces
once B4's typing is fixed.

**The subscription set is `EVENT_TYPES` — all 34, with nothing excluded.** §3.1's ruling is that every
event stays authorable, so the matcher subscribes to every event. Revision 2 proposed a narrowed
`ROUTINE_AUTHORABLE_EVENT_TYPES`; the founder rejected it, and it is gone from this design. The matcher
does carry one narrow suppression — a routine's own run may not re-trigger that same routine — which is
§3.1.1's `originRoutineId` check applied to the match set, not to the subscription set.

**The query must not scan the table.** `trigger_config` is a JSON text blob
(`framework/db/src/schema.ts:526`), so the event name inside it cannot carry an equality index. The event
type therefore becomes a **real column**, `routines.event_type`, which is the founder's "read what is
needed, not the whole table, and index it" made concrete:

```sql
-- the per-event lookup
SELECT * FROM routines
WHERE trigger_type = 'event' AND event_type = $1
  AND active = true AND deleted_at IS NULL;

-- the index that serves it
CREATE INDEX routines_event_type_idx ON routines (event_type)
  WHERE trigger_type = 'event' AND deleted_at IS NULL;
```

The partial predicate deliberately excludes `active`: pausing a routine would otherwise churn the index on
every toggle. `event_type` becomes the single home for the name — `trigger_config` keeps only `{cron}` /
`{intervalSeconds}` and is no longer read for events, so the two encodings do not both survive.
`listRoutines` gains `eventType?: string` alongside its existing `triggerType`/`active` filters; no foreign
table enters the routine service.

**Immediate pause and delete come from the same query.** `listRoutines` already excludes `deletedAt` by
default (`routine-service.ts:165-172`) and the filter carries `active`, so a routine paused or deleted a
millisecond ago is simply not in the result. `resolveRoutineRunRequest` re-checks `state === "active"`
inside the firing transaction (`:394`) and remains the second gate — see D9 for why that second gate must
no longer be treated as an error. The `getRoutine` re-read at `:721-724` is deleted; it was the cache's
workaround and there is no cache now.

**Builtins are excluded from the matcher** (§2.5). A builtin's event condition is code, not
configuration: the post-bet-retro reaction filters `toState === "completed"` and passes `{betId}` from the
event payload, neither of which a generic match can express — `fireGenericRoutine` takes no args. So the
matcher skips any id for which `extractBuiltinKind` returns non-null, and `registerBuiltinRoutineHandlers`
stays the one event path for builtins. This is a boundary, not a workaround; BA9 relocates the builtins
and can revisit it.

**The matcher honours `canProvision`, matching the clock path.** Revision 1 kept the event path ungated
and justified it as preserving today's behaviour. That justification was false (N4): nobody can author an
event routine today (P5), so the only thing firing on the event path in a `canProvision:false` deployment
is the double-fire this same decision removes. Adopting `if (!canProvision) return;` — exactly the clock
path's gate at `:823` — therefore suppresses nothing that exists and makes the two paths coherent. A
process that cannot provision agent runs should not start them from either direction.

**Cost, stated plainly.** One indexed lookup per emitted event, per process. The events that
fire most (`thread_message_appended`, `tool_call_recorded`) will mostly probe an index and return zero
rows, off the critical path — `emit` is synchronous (`event-bus.ts:88-121`) but the handler is
fire-and-forget, exactly as today. If this ever measurably bites, the fix is a cache invalidated on routine
writes; it is **not** built now, because the founder's rule is explicit and building it preemptively is the
failure mode ETHOS names. What is built now is the index that makes the honest version cheap.

**Registration becomes synchronous.** `registerEventTriggers` is `async` only because of its boot-time
read. With no read, `startRoutineScheduler`'s `await registerEventTriggers(…)` (`:791`) becomes a plain
call, and the disposer shape (`unwind`, returned into `stop()`) is unchanged.

**Consequence for BA9.** Its proof — "installing a plugin and seeing the agents work" — no longer needs a
restart step. A plugin that contributes a routine has it live at the next matching event. `.pipeline/BA.md`'s
BA9 row should lose the restart caveat when BA1 lands; noted, not edited here.

### D3 — One column, one rendering: `**Purpose:**` becomes `### Instruction`

D1 leaves exactly one free-text column on a routine. `buildRoutineTaskSection`
(`run-orchestration/src/context.ts:447-468`) renders that column today as `**Purpose:** <text>`. Revision 1
said the bundle "gains `routine.prompt`" and placed the new block "after `**Name:**`/`**Purpose:**`", which
left two unstated readings — carry both fields and print the same text twice, or drop `description` and
let `**Purpose:**` vanish silently. Neither is acceptable as an accident. The decision:

- **`BakedContextBundle`'s `kind:"routine"` variant carries `prompt: string | null` and no `description`.**
  One column in, one field on the wire.
- **`buildRoutineTaskSection` renders `**Name:**`, then — when `prompt` is non-null — a `### Instruction`
  block, then `### Last Run Summary`.** `**Purpose:**` is removed. There is no second rendering.
- This **is** a one-time prompt change for every existing routine that has text in the column today, and
  it is intended, not silent: the same text moves from `**Purpose: X**` to a heading that says what the
  text now is. A routine with a null prompt renders exactly as it does today minus a line it never had.
- **The knowledge-scoring input follows the rename.** `routine-service.ts:432`'s
  `taskDescription: routine.description ?? routine.name` becomes `routine.prompt ?? routine.name`. This is
  not merely mechanical — it is an improvement worth naming: the scorer now ranks knowledge against the
  instruction the run will actually execute rather than against a description of the routine.

`parseTriggerPrompt` and `triggerPromptOverride` are **deleted**, not reused
(`run-orchestration/src/runtime.ts:110-118,445,475`, `contracts.ts:47`, `provisioner.ts:707,1232-1233`).
They are the read half of the retiring entity and nothing has ever written their input (P3). Reusing them
would also be wrong on the merits: `triggerPromptOverride ?? systemPromptText` *replaces* the agent's
persona. A routine's prompt is an instruction to an agent, not a different agent.

### D4 — The routine bundle is always baked; its team is optional

Today the bundle is produced only when both optional deps are wired **and** a team row comes back
(`routine-service.ts:422-448`); otherwise the provisioner falls through to `assembleTaskFreePrompt`, which
renders no routine section at all (P4). Once scope comes from the agent, a team-less owner would take that
fallback and the prompt would silently vanish. So:

- `BakedContextBundle` `kind:"routine"`: `team` becomes `{ id: string; name: string } | null`.
- `resolveRoutineRunRequest` bakes the bundle whenever `assembleSessionKnowledge` is available, with
  `team: null` when the owner agent has no `teamId`.
- Knowledge assembly needs a team (`assembleSessionKnowledge({ teamId, agentRole, taskDescription })`).
  For a team-less owner the resolver **skips it and bakes `knowledge: []`**. It does not invent a
  global knowledge query — that is not this work package's business.
- `assembleRoutinePrompt` substitutes `product: context.team?.name ?? ""`. The empty string is the right
  fallback: `substituteTemplateVars` (`context.ts:257-262`) leaves `{{product}}` *literal* when a variable
  is absent, and a literal `{{product}}` in a shipped prompt is a visible defect.
- `RoutineSessionContextData.team` and `routineSessionContextDataFromBundle` follow the same nullability.

### D5 — Scope comes from the owner agent, on the read side **and** the write side

`routines.team_id` is dropped, with its FK and its `routines_team_id_idx`.

**Read side.**

| Contract | Today | After |
|---|---|---|
| `BakedRoutineRunRequest.teamId` (`routine-service.ts:291`) | `string` | `string \| undefined` |
| `BakedRoutineRunRequest.sourceCorrelation` | `{routineId, routineRunId, teamId}` | `{routineId, routineRunId, teamId?}` |
| `routineSessionRequestInputSchema` (`domain-model/src/session-request.ts:72-82`) | `teamId` required, `sourceCorrelation.teamId` required | both optional |
| `RoutineInfo.teamId` / `.teamName` (`domain-model/src/routine.ts:93-94`) | `string` | `string \| null` |
| `listRoutines` filter (`routine-service.ts:154-173`) | `teamId?: string` | `ownerAgentIds?: readonly string[]`, plus D2's `eventType?: string` |

The resolver reads the team from the agent row it has already loaded and validated (`agent.teamId`) — no
second read, no new port. It also bakes `userId: agent.ownerUserId ?? undefined`, so the session request
records whose routine ran. (No consumer branches on that value today; `runtime.ts:101` round-trips it
through schema validation. It is a cheap, correct thing to record, not the thing that justifies D6.)

**Write side — the contract this architecture owns, and revision 1 left undecided.** `teamId` is
**removed**, not made optional and ignored:

- `createRoutineSchema` (`routines-routes.ts:47`) drops `teamId`, and the handler drops the `getTeam`
  existence check that goes with it (`:97-101`). A routine has no team; a field that is required, accepted
  and then discarded is precisely the working-looking-but-inert surface this package exists to delete.
- **The schema gains `.strict()`, and without it the removal is a no-op.** `validateBody`
  (`framework/domain-model/src/http.ts:100-108`) is `zValidator("json", schema)`, and a plain `z.object`
  on zod 4 **strips** unknown keys rather than rejecting them. So merely deleting the field would leave a
  caller's `teamId` silently accepted and discarded — the exact inert outcome this decision was raised
  against, and §9's route test would have gone red with no remedy specified. The repository already has
  the precedent and even the same motive: `bets.ts:63` carries `.strict()` under the comment
  *"// Reject old fields"*, and `notifications-routes.ts:37,200` do the same. `createRoutineSchema` and
  `updateRoutineSchema` both take it, so a stale `teamId` on either verb is a 400 rather than a shrug.
- `createRoutineInputSchema` (`tool-definitions.ts:1173`) drops it identically, along with the
  `getTeamById` check at `:1195-1196`.
- `RoutineCreateDialog` loses its `teams` prop, its team `Select`, its `teamId`/`resolvedTeamId` state and
  the `resolvedTeamId` term in its submit guard (`:83`) and payload (`:91`). `WorkTeam.tsx:698` stops
  passing `teams`. The dialog gets **simpler**: the agent picker it already has is now the only scope
  input, which is exactly D5's model — the routine belongs to the agent, and it appears on the team page
  if and only if that agent belongs to the team.

`agent_session_requests.team_id` and `.user_id` are **already nullable**
(`framework/db/src/schema.ts:277-278`) and `baseInput` already declares both optional
(`session-request.ts:37-45`), so no migration and no widening is needed there. `provisionParams.productId
= claimedRequest.teamId ?? "task-free"` (`runtime.ts:457`) already handles the null.

**The routine service must not grow a foreign join.** `routine-service.ts`'s `@lore AU13 §A2/A9` states
it imports zero foreign tables and that a read needing one routes the lookup through the caller. So
`teams-routes.ts` resolves the team's agent ids first and passes them in — both call sites
(`:174` routine count, `:614` the team's routine list).

### D6 — Belonging is a column on the agent row

```
users.owner_user_id  text  references users(id) on delete set null
```
with the exclusivity the requirement states — a team, a person, or neither, never two:
```sql
CHECK (owner_user_id IS NULL OR (kind = 'ai' AND team_id IS NULL))
```
Humans satisfy it trivially (their `owner_user_id` is always null); today no agent has an owner at all, so
the constraint is safe against every existing row (P12).

- **Writer:** `@hyperidle/users`, which owns the table (`tools/governance/table-owners.json`).
  `AgentScaffoldSpec` (`org/src/scaffold-agents.ts:66-72`) gains `ownerUserId?: string`;
  `resolveAgentScaffoldSpecs`'s `user_assistant` case sets it from the `ownerUserId` it already carries
  (`resolve-scaffold-specs.ts:68-80`); `persistScaffoldedAgents` passes it to `insertUser`
  (`scaffold-agents.ts:158-167`). Also mirror the field onto the parallel `AgentScaffoldSpec` declaration
  in `framework/factory-defaults` if `npm run check` demands it — that duplicate is recorded at
  `scaffold-agents.ts:57-64`.
- **`insertUser` only.** `updateUser` is *not* extended to accept `ownerUserId`: BA1 has no caller that
  changes an agent's belonging after creation, and adding a write surface nobody asked for is the habit
  this track is cleaning up. BA7 adds it when it has a reason.
- **Backfill:** existing `ast-<userId>` assistants get the column set from their own id (see T1's SQL).
  This is not populating a new concept; it is writing down the link the id string was already making.
- **"Belongs to neither" is supported and is not populated.** No global agent is seeded. No default is
  written. The founder's answer to question 3 is honoured literally.
- **Out of scope, deliberately:** the ~ten production readers of the `ast-` string prefix (P11) are not
  rewritten. `.pipeline/BA.md`'s BA7 row already claims that ground and says "whichever lands first adds
  it — do not add a second one". BA1 adds it; BA7 consumes it.
- `agentCategory` is untouched. `requirements.md` is explicit that belonging is not a category, and BA9
  owns what happens to `strategy`.

### D7 — A global routine is seeded once

`BuiltinRoutineSpec` (`routine-scheduler.ts:113-123`) gains `scope: "team" | "once"`, derived from what
each builtin's own body reads (P10) — not from who owns it, because `requirements.md` forbids reasoning
from the facilitators:

| Spec | `scope` | Seeded id |
|---|---|---|
| `builtin:post-bet-retro` | `"team"` | `builtin:post-bet-retro:${teamId}` (unchanged) |
| `builtin:portfolio-retro` | `"once"` | `builtin:portfolio-retro` |
| `builtin:knowledge-decay` | `"once"` | `builtin:knowledge-decay` |
| `builtin:knowledge-promotion` | `"once"` | `builtin:knowledge-promotion` |

`provisionTeamRoutines` keeps its existing `onConflictDoNothing`, so the second and every later team's
attempt at a `"once"` spec is a no-op. `extractBuiltinKind` (`:85-99`) already accepts both the bare and
the suffixed form, so nothing downstream needs to change. `registerBuiltinRoutineHandlers`
(`:499-521`) already falls back from `builtin:post-bet-retro:${betTeamId}` to the bare id and keeps that
shape, because post-bet-retro stays per team.

**Named consequence of D5 + D7 landing together.** A `"once"` routine's owner is still resolved by
`ownerByRole[spec.ownerRole] ?? leadAgentId` from whichever team is created first, and after D5 a team's
routine list is derived from its agents' ids. So the three global sweeps will appear on the **first
team's** page and vanish from every listing if that team's agents are removed. That is a user-visible
artifact, it is not a regression against any AC — the routines still fire, and they fired once per team
before — and perfecting owner selection is BA9's, which relocates these four into a plugin. Recorded so it
is not discovered as a surprise.

**No builtin routine is deleted here.** `.pipeline/BA.md` is explicit that removing them from core before
BA9's plugin exists loses the capability.

### D8 — A routine can be authored against any of the 34 events

- `POST /api/routines`: `triggerType` widens from `z.literal("calendar")` to
  `z.enum(["calendar", "event"])`. `calendar` keeps its existing `{cron}` `triggerConfig` requirement
  verbatim. `event` instead takes a top-level `eventType` field, validated against
  `EVENT_TYPES`, written straight to D2's column; it requires no `triggerConfig`. A
  miss is a 400 `VALIDATION_ERROR`, the same shape the bad-cron path already returns.
- `create_routine` (`tool-handlers/src/tool-definitions.ts:1170-1246`): the same widening, returning
  `err("INVALID_INPUT", …)` on a miss, matching its existing cron branch.
- `PATCH /api/routines/:id` gains `eventType` under the same validation, so an event routine cannot be
  edited into an unmatchable one.

**`EVENT_TYPES` must keep its literal type.** Revision 1 specified it "as `readonly string[]`", which makes
the completeness assertion vacuous — `(typeof EVENT_TYPES)[number]` widens to `string`, so
`Exclude<EventType, string>` is `never` for *any* list including an empty one. That is not cosmetic: D2
derives its whole subscription set from this constant on the strength of "it cannot go stale", and §9 sells
the assertion as the thing that stops a second vocabulary. As specified it could not fail. Required form:

```ts
export const EVENT_TYPES = [ /* … every literal … */ ] as const satisfies readonly EventType[];
// completeness: a new EventType not listed above is a compile error here.
type _EventTypesComplete = Exclude<EventType, (typeof EVENT_TYPES)[number]> extends never ? true
  : ["EVENT_TYPES is missing", Exclude<EventType, (typeof EVENT_TYPES)[number]>];
const _eventTypesComplete: _EventTypesComplete = true;
```

`as const` keeps the literal union; `satisfies` rejects a name that is not an event; the assertion rejects
an event that is not named. The builder must **demonstrate it red** — delete one entry, `npm run check`
fails — and §9 makes that a required step, because an assertion nobody has seen fail is indistinguishable
from one that cannot.

There is **one** constant. The two validators, the HTTP endpoint and D2's subscription loop all read
`EVENT_TYPES` directly. Revision 2 introduced a second, narrowed constant for §3.1; the founder rejected
it and it does not exist.

The browser cannot import either constant — `tools/governance/architecture.json` excludes `core-ui` from
`framework/event-bus`'s reach (P8). So `GET /api/routines/event-types` returns
`{ eventTypes }` from `EVENT_TYPES` — all 34 — and `RoutineCreateDialog` fills a `Select` from
that response. One list, one source, two transports.

**The schedule label is derived, not mapped** (§2.6). `humanizeSchedule`'s `triggerType === "event"` branch
(`schedule-label.ts:149-155`) reads D2's `event_type` column instead of the JSON blob, and its four-name
`EVENT_LABELS` map is deleted in favour of deriving the label from the name itself — `bet_state_changed`
→ "On bet state changed". One line, correct for every event, and no *label* map left to drift (§2.6 records the one vocabulary BA1 does not close).
`humanizeSchedule`'s signature grows an `eventType: string | null` parameter; its callers
(`routines-routes.ts:238`, `teams-routes.ts:615-647`) pass the column through.

### D9 — A routine that cannot run says so, and a paused one is not an error

This is the AC4 work §2.1 uncovered, in two halves.

**Half one: discriminate the cause.** `RoutineRunSourceUnavailableError` carries two unrelated causes
(`routine-service.ts:390-396`): `"Routine run is unavailable"` / `"Routine is not eligible to run"` — the
routine was paused, deleted or de-activated between the match and the transaction — and the normalised
`AgentNotRunnableError`, which is the case AC4 is about. Reacting to the class alone would mark a
**deliberately paused** routine as errored and disable it, and D2 makes that race hit on every emission
rather than once per tick. So the class gains a discriminator:

```ts
export type RoutineRunUnavailableReason = "not_eligible" | "agent_not_runnable";
// on the existing class, alongside `message`
readonly reason: RoutineRunUnavailableReason;
```

A discriminator field rather than a subclass, because `routine-service.ts`'s own `@lore` says the
normalisation to **one** recognizable class is deliberate — a subclass would fight that lore for no gain.
Matching on the message string is not acceptable and is not specified anywhere.

- `reason: "not_eligible"` → **today's behaviour, unchanged**: return `{fired:false, reason}`, no run row,
  no state change. Nothing is wrong; someone paused it.
- `reason: "agent_not_runnable"` → the catch, after the rollback and outside any transaction: insert a
  terminal `routine_runs` row (`outcome:"error"`, `startedAt`/`endedAt` = now, `errorMessage` = the
  message), then `updateRoutine` to `state:"error", active:false`. Return `{fired:false, reason}` as before,
  so both callers are unaffected.

Setting `active:false` matches the sync the PATCH route already performs (`routines-routes.ts:295-299`,
via `stateToActive` at `:66`) and is what stops the routine re-attempting — under D2 that matters more,
not less, since a broken routine on a busy event would otherwise fail once per emission. It also removes
the routine from the matcher's own query on the very next event, the same mechanism that gives immediate
pause. Recovery is the `PATCH {state:"active"}` the detail pane already offers.

**Half two: render the reason.** Revision 1 claimed the run history "already renders each run's
`errorMessage`". It does not (P17): `RoutineDetailPane.tsx:593-608` renders an outcome dot, a start time
and a duration, and `errorMessage` is rendered nowhere in `layers/core-ui/src` outside `ThreadSections.tsx`,
a different feature. A red dot with no reason is not "fails visibly to whoever configured it", and AC4's
screenshot evidence could not have been produced.

The fix is one prop on a component that already supports it — `Row` has an optional `subtitle`
(`ds/Row.tsx:64`), and `RoutineRunSummary.errorMessage` is already on the wire
(`domain-model/src/routine.ts:73`) and already populated by the route (`routines-routes.ts:224`):

```tsx
<Row … subtitle={run.errorMessage ?? undefined} … />
```

No new component, no new wire field, no story. This is the whole of D9's UI change and it is now a
truthful basis for AC4's verification.

*Not designed:* a retry policy, a backoff, a notification. None is required by an AC and the tier does not
buy one.

### D10 — The trigger-rule entity retires

Deleted outright. Complete list, so the builder does not have to rediscover it:

| Where | What |
|---|---|
| `framework/domain-model/src/trigger.ts` | whole file |
| `framework/domain-model/src/index.ts:256-264` | the six re-exports |
| `framework/domain-model/src/configuration.ts` | `'trigger'` out of `CONFIGURATION_KINDS` |
| `framework/domain-model/src/agent-behavior-config.ts` | `'trigger'` out of `AgentBehaviorConfigKind` and `AGENT_BEHAVIOR_CONFIG_KINDS`; delete `AgentBehaviorTriggerSummary`, `AgentBehaviorPromptSource`, `AgentBehaviorConfigView.trigger`, and `'trigger-history'` from `AgentBehaviorLinkTarget` |
| `layers/core-api/settings/src/plugin-configuration.ts:18,136` | the import and `ConfigurationValueSchemas.trigger` |
| `layers/core-api/src/routes/agent-behavior-config-impl.ts` | the `trigger` entries in both kind maps (`:59`, `:67`); `triggerSummary` (`:274-288`); `fallbackTriggerConfiguration` (`:336-359`) and its push at `:89-91`; the `trigger` branches of `descriptionFor`, `activeSummaryFor`, `editableFieldsFor`, `linksFor`; `ListAgentBehaviorConfigOptions.occasionKind` and its filter (`:86`) |
| `layers/core-api/src/routes/settings-agent-behavior.ts:33` | the `occasionKind` query param |
| `layers/core-ui/src/settings/SettingsAgentBehavior.tsx` | `CATEGORY_LABELS.trigger` (`:29-36`); `EVENT_LABELS` + `eventLabel` (`:38-51`); `kindTone`'s trigger branch (`:60`); `defaultEvent` (`:69`); the `selectedEvent` state (`:85`); the `events` memo (`:123`); the `visibleItems` trigger filter (`:131`, becomes plain `items`); the event `fieldset` (`:248`); the `selected.trigger` KeyValue block; the two trigger-worded strings at `:269` and `:374` |
| `run-orchestration` | D3's `parseTriggerPrompt` / `triggerPromptOverride` |
| `session-requests/src/service.ts:1091-1097` | the archaeology comment that says the trigger entity "remains fully editable in the UI … flagged for founder attention, not fixed here". BA1 is the fix; the note is now false. |
| DB | `'trigger'` out of `plugin_configuration_defaults_kind_ck` and `configuration_overrides_kind_ck`, after the rows are deleted |

**The stored data is deleted, not migrated** — founder answer 1, verbatim: "we can delete all trigger
data, no relevant instances exist."

`#trigger-history` (`agent-behavior-config-impl.ts:381`) goes with `linksFor`. It was a dead anchor: no
element carries that id anywhere in the tree.

### D11 — `routines.delegation_allowed` goes with the skill

`docs/process-layer/routines-and-retros.md:22` says the scheduler "looks for a delegate with the
routine's skill" when the owner is at its WIP limit. No such code exists: `delegationAllowed` is written
by `provisionTeamRoutines` (`routine-scheduler.ts:205`), projected onto `RoutineInfo`
(`routines-routes.ts:245`), rendered nowhere in production, and read by no scheduler branch. Its only
documented mechanism was skill-based delegation, and the skill is what D1 removes.

This is **added scope** — see §3.2 — justified by track BA's rubble rule and by the doc-vs-code
contradiction. It retires a live eval scenario whose entire subject is this flag
(`tools/eval/src/scenarios/delegation.ts:369`), and that scenario corroborates the deletion rather than
opposing it: its own label reads *"Routine Fires Regardless of delegationAllowed (fire-time no longer
reads it)"*. It is an eval asserting that the flag is inert. Drop the column, the `RoutineInfo` field,
and that scenario.

**Explicitly not taken**, so the builder does not drift: `routines.state_key`,
`routines.autonomy_level`, `routines.stub_task_id`, and the deprecated `routines.active`. None is part of
the skill, the scope, or the trigger story. `autonomy_level` is live in the detail pane's edit form;
`active` is read by the scheduler's due filter and, after D2, by the matcher's own query.

---

## 3.1 Loops are accepted — RESOLVED by founder ruling

Revision 2 raised this as open and offered four options. **The founder rejected all four as framed:**

> *"yeah that makes sense that a routine should not output an event that matches the event of the routine,
> but in reality this is near impossible with an agent working in between and editing whatever he deems
> necessary. So yeah loops can happen and maybe people even find meaningful reasons for loops. This is not
> a deterministic system, it has an AI in the middle. So loops in AI systems are unavoidable and sometimes
> even wanted."*

**What that settles.**

1. **All 34 event types stay authorable.** `ROUTINE_AUTHORABLE_EVENT_TYPES` is **deleted from this
   design** — D2's subscription set, D8's validators and `GET /api/routines/event-types` all read
   `EVENT_TYPES` directly. A narrowed allow-list would be the six-name vocabulary this package exists to
   remove, reintroduced under a nicer name.
2. **No loop prevention of any kind.** No depth counter, no cycle detection, no run-chain accounting, no
   rate limit — and this is not recorded as a "future option", because leaving one invites the next
   author to build it. An agent's actions emit events, and what an agent will choose to do is not
   enumerable in advance, so any such mechanism guesses at behaviour it cannot predict and forbids uses
   the founder considers legitimate. That is the preemptive gate `ETHOS.md` forbids.
3. **One narrow cut, and only this one:** a routine's own run must not directly re-trigger **that same
   routine**. Not "no routine", and not "no event originating from any routine run" — same routine only.
4. **The real control is visibility and a working stop**, not a gate. See §3.1.2.

### 3.1.1 Cut 3, and exactly what it can and cannot cover

The cut needs to know that an event was produced by a run of routine R. **That origin is not uniformly
available, so this is stated as coverage rather than implied as completeness** (P22).

`originRoutineId(db, event)`, in the routine package, resolves in three steps and otherwise gives up:

| # | Condition | Origin from | Cost |
|---|---|---|---|
| 1 | `event.type === "routine_fired"` | `event.routineId` | field read |
| 2 | `isRoutineSourceKind(event.sourceKind)` and `event.sourceCorrelation?.routineId` | that field | field read |
| 3 | `isRoutineSourceKind(event.sourceKind)` and `event.sourceId` | `getRoutineRun(sourceId)?.routineId` — `sourceId` is the run id | one primary-key read |
| — | anything else | `null` — origin unknown, nothing is suppressed | none |

**`isRoutineSourceKind` must accept two spellings, and this is the whole of NB1.** The bus carries *two*
source-kind vocabularies and a routine is spelled differently in each:

- `AgentSessionSourceKind` (`framework/domain-model/src/session-request.ts:9-15`) → **`"routine"`**, used by
  `agent_work_intent_recorded`, `session_started` and `session_ended`;
- `AgentWorkIntentSourceKind` (`framework/event-bus/src/events.ts:45-51`) → **`"routine_run"`**, used by
  `agent_run_admission_failed`, which carries the pre-resolution intent vocabulary verbatim.

`AGENT_SESSION_SOURCE_KINDS` has no `"routine_run"` member, so a condition testing only `=== "routine"`
can never match `agent_run_admission_failed`. Revision 3 specified exactly that and therefore listed an
event as covered that it silently dropped to "origin unknown". The predicate must name both spellings,
and must be pinned so neither vocabulary can rename its member without breaking the build:

```ts
// The two vocabularies spell "a routine run" differently. Both are pinned:
// a rename in either union fails `npm run check` here rather than silently
// reopening the hole NB1 found.
const SESSION_SPELLING: AgentSessionSourceKind = "routine";
const INTENT_SPELLING: AgentWorkIntentSourceKind = "routine_run";
function isRoutineSourceKind(k: string | undefined): boolean {
  return k === SESSION_SPELLING || k === INTENT_SPELLING;
}
```

The matcher fetches its match set **first** and computes the origin only if that set is non-empty, so an
event with no routines on it never pays for the lookup, and step 3's read happens only for events a
routine run itself produced.

**Covered, on every production path:**

| Event | How |
|---|---|
| `routine_fired` | step 1 — `routineId` is a real field |
| `agent_work_intent_recorded` | step 3 — emitted with `sourceKind:"routine"`, `sourceId: runId` (`routine-scheduler.ts:656-665`) |
| `agent_run_lifecycle_changed` | step 3 — `sourceKind`/`sourceId` are required on the type |
| `agent_run_admission_failed` | step 3 — required `sourceKind`/`sourceId`, but **only once `isRoutineSourceKind` accepts `"routine_run"`**; both emitters (`session-requests/src/service.ts:506-514`, `runtime.ts:297-305`) pass the stored intent kind verbatim, and the routine intent is enqueued as `sourceKind:"routine_run"`, `sourceId: runId` (`routine-scheduler.ts:636-638`) |
| `session_started` | step 2 — `runtime.ts:470` sets `requestContext` unconditionally on the durable path, and a routine session is only ever durable |
| `session_ended` from `endSession`/`crashSession` | step 2 (`transition-run.ts:200,273`) |
| `session_ended` from the stale-session reaper | step 3 (`runtime-reapers.ts:201`, `sourceKind:"routine"` + `sourceId`) |

**Not covered, and honestly so:**

- **`session_ended` from `endSessionByCas`** (`session-store.ts:209`) emits **no** `sourceKind`,
  `sourceId` or `sourceCorrelation` at all. It is the one genuine hole in the machinery events — and it
  has **zero production callers**: it is exported from the run-orchestration barrel and reached only by
  its own test (`session-store.integration.test.ts`), which by this repository's own rule makes it dead
  code. So the hole is theoretical today. BA1 does not fix or delete it; it is `run-orchestration`'s and
  belongs to AU's rubble, and it is recorded here so a future caller does not silently open the hole.
- **Every event an agent's own actions cause.** A routine whose agent edits a bet emits
  `bet_state_changed`; one that writes an item emits `item_created`; one that posts emits
  `thread_message_appended`. **None carries any trace of the routine**, and no plumbing exists to give it
  one. So a routine authored against `bet_state_changed` whose agent edits a bet re-triggers itself, and
  cut 3 does not see it. **This is the founder's own point, and it is accepted, not mitigated.** Adding
  that plumbing would mean reshaping the event contracts, which is BA8's row, and the ruling says the
  loop would be acceptable anyway.

**Why the cut is worth its ~20 lines, given that coverage.** The loops differ in how fast they spin, and
the fastest one is the one revision 3 was silently missing:

- **No agent session at all — `agent_run_admission_failed`.** Admission fails *before* a session exists,
  so a routine authored against it re-fires immediately, fails admission again, and spins at event-bus
  speed with no LLM call anywhere in the cycle. Coalescing does not hold it either: the
  admission-failed reaction finalises the run row to `outcome:"error"`
  (`agent-run-admission-reactions.ts:86-90`), so the `running` guard is open. This is the machinery
  re-entering itself with nothing in between, and it is exactly what cut 3 exists to stop. Revision 3's
  broken predicate let it through — which is why NB1 was the worst of the six to miss.
- **One agent session per cycle — `session_ended`, `agent_run_lifecycle_changed`.** Slow and expensive
  rather than tight, but unbounded, and every turn is a real paid run.
- **Already bounded — `routine_fired`, `agent_work_intent_recorded`.** Emitted *during* the run, while the
  row is still `outcome:"running"`, so the existing coalescing guard already rejects the re-entry. Cut 3
  makes that bound explicit rather than incidental.

So the cut removes one unbounded tight loop and one unbounded expensive loop, using a field read and a
primary-key read rather than a policy. That is a good trade even though it cannot see the agent-action
case.

**The finaliser/matcher race no longer matters here.** Revision 2 flagged it as a correctness problem.
Under this ruling nondeterministic re-firing is accepted behaviour, not a bug — and it does not affect cut
3 either way, because `getRoutineRun(runId).routineId` returns the same origin whether the run row is
still `running` or already terminal. Recorded as a property, carried as no blocker.

### 3.1.2 What replaces the gate: visibility and a stop that works

The ruling moves the effort from prevention to control, and both halves are already in this design —
they are now **load-bearing rather than incidental**, so they are named here as the answer to loops:

- **Pause takes effect on the very next event.** This is D2's per-event read. There is no cached
  subscription list to outlive the pause, and `listRoutines`' `active` filter plus
  `resolveRoutineRunRequest`'s `state` re-check both drop the routine immediately. A person who sees a
  loop can stop it, and the stop is real. Under the old boot-time list they would have had to restart the
  app — which is precisely why this ruling and the question-2 ruling belong together.
- **Every firing is visible on the routine's own page.** `routine_runs` records each run with its start,
  duration and outcome, and D9 adds the failure reason. A loop is not silent: it is a run history filling
  up in front of whoever configured it.
- **A person can see what a routine fires on — but not which occurrence fired it.** `routine_runs` records
  *that* it fired, when, for how long and with what outcome; the routine's `event_type` (D2) records the
  event it listens to. Together those answer "this ran because a `bet_state_changed` happened". They do
  **not** identify *which* bet: no run row records the triggering event instance, and revision 3's claim
  that "a person can see what caused a firing" was stronger than the mechanism supports. Withdrawn.

  What would make it true is small and precisely known — one nullable `routine_runs` column holding the
  triggering event's `streamId`, written by the matcher at the same insert that already creates the run
  row. It is **not in scope**: no acceptance criterion asks for it (AC5 is "has it ever fired", which
  `routine_runs` already answers), and this package is large enough. Recorded here so a later package can
  take it as a one-column change rather than rediscover the gap.

Nothing detects a loop *for* the user and nothing is built to. That is the ruling.

## 3.2 Added scope, visible as a choice

Neither is in `requirements.md`'s in-scope list. Both are cheap and defensible; both are listed here so a
reviewer sees them as decisions rather than as derived consequences.

- **D11 — dropping `delegation_allowed`.** Supported by the track's rubble rule and by a documented
  mechanism that does not exist. Retires a live eval scenario. Cut it if a reviewer prefers a smaller diff;
  no AC depends on it.
- **Deleting `framework/db/drizzle/0059_drop_propagation_log.sql`** (§4). A never-journaled, never-executed
  file. Deleting it is what keeps the migration numbering invariant intact; it decides nothing about the
  `propagation_log` table.

---

## 4. Migrations

Two files, hand-authored — the data steps (dedupe, backfill, targeted delete) cannot be generated, and
in this repository they cannot be generated at all: `framework/db/drizzle/meta/` holds snapshots only up
to `0042_snapshot.json` against 59 journal entries, so `npm run db:generate` (drizzle-kit, which diffs
against the latest snapshot) cannot produce a correct migration here. Revision 1 warned the builder not to
let that tool claim a number; the warning was aimed at a tool nobody can run. **Every migration in this
package is written by hand and journalled by hand.**

**Numbering — the decision, replacing revision 1's.** All 59 journal entries satisfy
`filename number == idx`. Revision 1 proposed `0060`/`0061` at indices 59/60, which breaks that invariant
and simply moves the collision one step later (the next author's idx 61 wants filename `0061`, taken).
Instead:

1. **Delete `framework/db/drizzle/0059_drop_propagation_log.sql`.** It is in no journal, has never
   executed and never will (P13). Deleting a file that does nothing is not the same decision as deciding
   whether `propagation_log` should be dropped — that question is untouched and stays open for whoever
   owns it. Recorded as an explicit choice in §3.2.
2. **BA1 takes `0059_BA1_agent_belonging.sql` (idx 59) and `0060_BA1_one_routine_primitive.sql` (idx 60)**,
   invariant intact.

If a reviewer would rather keep the orphan file, then the alternative must be stated plainly in the
journal's own terms: filename and idx diverge permanently from that point on, and every future author
inherits the offset. That is the trade; it is not a detail to leave implicit.

### `0059_BA1_agent_belonging.sql` (journal idx 59)

```sql
ALTER TABLE "users" ADD COLUMN "owner_user_id" text;
--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_owner_user_id_users_id_fk"
  FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE SET NULL;
--> statement-breakpoint
-- Write down the link the `ast-<userId>` id string was already making.
UPDATE "users" a
SET "owner_user_id" = substring(a."id" from 5)
WHERE a."id" LIKE 'ast-%'
  AND a."kind" = 'ai'
  AND a."team_id" IS NULL
  AND EXISTS (SELECT 1 FROM "users" h
              WHERE h."id" = substring(a."id" from 5) AND h."kind" = 'human');
--> statement-breakpoint
-- A team, a person, or neither — never two. Humans satisfy this trivially.
ALTER TABLE "users" ADD CONSTRAINT "users_belonging_ck"
  CHECK ("owner_user_id" IS NULL OR ("kind" = 'ai' AND "team_id" IS NULL));
```

The constraint is added **after** the backfill so a pre-existing row that somehow held both would fail
loudly at migrate time rather than be silently skipped.

### `0060_BA1_one_routine_primitive.sql` (journal idx 60)

Order matters; each step's reason is stated because a later reader will need it.

1. **Rename the prompt into its right name.**
   `ALTER TABLE "routines" RENAME COLUMN "description" TO "prompt";`
2. **Give the event trigger a real, indexable home (D2).**
   ```sql
   ALTER TABLE "routines" ADD COLUMN "event_type" text;
   UPDATE "routines"
   SET "event_type" = ("trigger_config"::jsonb ->> 'eventType')
   WHERE "trigger_type" = 'event'
     AND "trigger_config" IS NOT NULL
     AND "trigger_config" IS JSON OBJECT;
   CREATE INDEX "routines_event_type_idx" ON "routines" ("event_type")
     WHERE "trigger_type" = 'event' AND "deleted_at" IS NULL;
   ```
   The `IS JSON OBJECT` guard is load-bearing: `trigger_config` is plain `text`, and one malformed row
   would otherwise abort the whole migration on the cast. A row that fails the guard keeps
   `event_type = NULL` and simply never matches, which is the safe direction.
   **It requires PostgreSQL 16+.** PGlite `^0.5.4` (`framework/db/package.json:18`) is PG17, so local and
   desktop are fine; a self-hosted server pinned below 16 would fail this statement at migrate time. Say
   so in the migration's comment header.
3. **Collapse each global builtin to one row, keeping its history.** For each of
   `builtin:portfolio-retro`, `builtin:knowledge-decay`, `builtin:knowledge-promotion`, in this order:
   1. insert the bare-id row by copying the lowest-id suffixed row, `ON CONFLICT DO NOTHING`;
   2. `UPDATE routine_runs SET routine_id = '<bare>' WHERE routine_id LIKE '<bare>:%'`;
   3. `DELETE FROM routines WHERE id LIKE '<bare>:%'`.

   The re-point must precede the delete: `routine_runs.routine_id` is `ON DELETE restrict`
   (`schema.ts:613-615`), so a delete before the re-point fails. Copy-then-repoint-then-delete is used
   rather than renaming the survivor's id, because the same FK has no `ON UPDATE CASCADE` and would
   reject the parent-key update.

   `sessions.routine_id` is deliberately left alone. It is a plain text column with no FK
   (`schema.ts:241`) and its one reader only tests it for null (`runtime-reapers.ts:174,183`), so a stale
   value costs nothing and rewriting another service's rows from a routine migration buys nothing.
4. **Drop the routine's own scope.** Drop the FK to `teams` by catalog lookup — the constraint name
   varies with database history, and `0058_AU44_fold_team_members.sql` already carries the `DO $$` pattern
   to copy. Then `DROP INDEX IF EXISTS "routines_team_id_idx"` and
   `ALTER TABLE "routines" DROP COLUMN "team_id"`.
5. **Drop what never worked.**
   `ALTER TABLE "routines" DROP COLUMN "skill_id", DROP COLUMN "done_condition", DROP COLUMN "delegation_allowed";`
6. **Delete the trigger data, then narrow the vocabulary.**
   `DELETE FROM "configuration_overrides" WHERE "kind" = 'trigger';`
   `DELETE FROM "plugin_configuration_defaults" WHERE "kind" = 'trigger';`
   then drop and re-add `configuration_overrides_kind_ck` and `plugin_configuration_defaults_kind_ck`
   without `'trigger'`. Deleting first is required — re-adding the narrowed constraint over surviving
   rows fails.

**Invariant to hold across the whole file:** after it runs, no routine row references a team, every
`triggerType:'event'` row carries its event in `event_type` and is reachable through
`routines_event_type_idx`, exactly one row exists per global builtin, every `routine_runs` row still
points at a live routine, and no configuration row of kind `trigger` survives. §9 says how that is proved
against a database that actually has rows.

---

## 5. Ownership, checked against the enforced boundaries

`npm run lint` is the authority (`tools/governance/README.md`); this is the check, not a restatement.

- **No new table.** `tools/governance/table-owners.json` needs no edit. Both tables BA1 touches are
  already owned: `users` → `users`, `routines`/`routineRuns` → `routine`.
- **D2's matcher stays inside the routine service's boundary.** It queries `routines` through
  `listRoutines`, which is the only module permitted to read that table (AU13), and it fires through
  `fireGenericRoutine` in the same package. It imports `@hyperidle/event-bus`, which
  `routine-scheduler.ts` already depends on for `EventBus`/`EventType` — `architecture.json` grants
  `core-api` reach to that surface, so the two new constants add no edge.
- **`users.owner_user_id` is written only through `@hyperidle/users`.** `@hyperidle/org`'s
  `persistScaffoldedAgents` already reaches `insertUser` through its injected `OrgUserDirectory` port
  (Mechanism C, `scaffold-agents.ts:27-28`). Adding a field to the spec adds no edge.
- **`@hyperidle/routine` gains no dependency.** Its `@lore` at the head of `routine-scheduler.ts` pins it
  to `@hyperidle/db` plus framework packages, with everything else injected through
  `RoutineSchedulerPorts`. D5's team read comes off the `User` row the existing
  `deps.requireRunnableAgent` port already returns — no new port, no new import. D7 touches only the
  local spec table.
- **The routine service still imports zero foreign tables.** D5 moves the team→routines lookup into
  `teams-routes.ts`, honouring `routine-service.ts`'s `@lore AU13 §A2/A9` explicitly.
- **`core-ui` still cannot reach `framework/event-bus`.** D8's HTTP endpoint exists precisely because of
  that rule (P8); no import is added.
- **New surfaces are all in existing packages.** Both constants join a file that already exports the
  union they mirror, so `architecture.json`'s `surfaces` needs no new declaration. Note for the next
  reader: `harness-registry/src/harness-event-normalization.ts:4` already has a module-local, unexported
  `EVENT_TYPES` for a different vocabulary — different package, no conflict, but a tree search finds two.
- **Production may not import development.** Nothing here moves a fixture into a shipping path.
- **No work-package id enters the code.** `BA1` appears in `.pipeline/**` and in migration filenames and
  comments, nowhere else.

---

## 6. Failure behaviour that changes

| Situation | Today | After | Why |
|---|---|---|---|
| **Routine added while the app runs** | **never fires until restart** | **fires on the next matching event** | **D2 / founder answer 2** |
| **Routine paused or deleted while the app runs** | **keeps firing until restart** | **stops on the next event** | **D2** |
| Routine paused in the race window between match and transaction | n/a (no such window per event) | `fired:false`, no run row, **no state change** | D9 half one / B1 |
| Owner agent not runnable | transaction rolls back, nothing written, retried forever | `routine_runs` row `outcome:"error"` + message; routine `state:"error"`, `active:false`; no further attempts | D9 / AC4 |
| A run's error reason | not rendered anywhere | rendered as the run row's subtitle | D9 half two / B2 |
| **Bet state changes** | post-bet-retro fires twice — builtin path *and* generic path | builtin path only | D2 / §2.5 |
| Event routine in a `canProvision:false` process | fires (ungated) | does not fire, matching the clock path | D2 / N4 |
| Routine prompt in the assembled session | `**Purpose:** <text>` | `### Instruction` block with the same text | D3 |
| Knowledge scoring input | the routine's description | the routine's prompt | D3 |
| Routine on an event outside the 4-name label map | card reads `"On event"` | reads a label derived from the name | D8 / §2.6 |
| Owner agent has no team | cannot happen — `routines.team_id` is NOT NULL | bundle baked with `team: null` and `knowledge: []`; prompt still delivered | D4 |
| `POST /api/routines` sends `teamId` | required, written | **400 — rejected by `.strict()`**, not stripped | D5 / NB2 |
| `POST /api/routines` names an unknown event | cannot happen — only `calendar` accepted | 400 `VALIDATION_ERROR` naming the bad `eventType` | D8 |
| A routine's own run emits an event that routine names | n/a (unauthorable) | that routine is dropped from the match set; every other match still fires | §3.1.1 cut 3 |
| A loop through an agent's own actions (agent edits a bet, routine on `bet_state_changed`) | n/a | **fires — accepted, not prevented**; pause stops it on the next event | §3.1 ruling |
| Malformed `trigger_config` on an event routine | throws inside `registerEventTriggers`' try, unwinding **every** subscription at boot | not parsed at all — the event name is a column | D2 |
| A previous run is still `running` | coalesced, `fired:false` | unchanged | AC3 |
| No routine matches an event | nothing happens | unchanged — the query returns zero rows | AC3 |

The restart row is now the *fix*, not the caveat. Nothing in the product needs a restart to pick up a
routine, and no note to that effect is written into the create dialog or the docs.

---

## 7. Security

Reasoned from the surfaces this change actually reaches.

**State-changing endpoints touched.** `POST /api/routines`, `PATCH /api/routines/:id`, and the new
`GET /api/routines/event-types`. The two write endpoints already exist and BA1 does not change who may
call them; it widens what they accept and narrows what they require. The widening is a closed enum on both
axes — `triggerType` is `z.enum(["calendar","event"])`, `eventType` is checked against
`EVENT_TYPES` — so the new input cannot name anything the bus does not carry.
`GET /api/routines/event-types` returns a compile-time constant list of event
names; it reads no row and reveals no tenant data.

**A write now has a per-event read cost (D2).** The abuse case worth naming: a caller who can create
routines could point many of them at the most frequently emitted event, turning each emission into many
firings. Two things bound it, both already present. The query is indexed and returns only that event's
rows, so the *lookup* cost does not grow with unrelated routines; and each matched routine coalesces
against its own in-flight run (`routine-scheduler.ts:579-596`), so a routine cannot stack runs on itself.
What is *not* bounded is the number of distinct routines one caller may create — and that is deliberately
unchanged, because routine creation is already an authenticated, first-party action and inventing a quota
here would be exactly the preemptive wall ETHOS forbids. Note also that the trigger is a **domain event**,
not an HTTP request: an outsider cannot emit one.

**Self-feeding loops are accepted, by founder ruling** — §3.1. They are not treated as an abuse case and
no gate is built for them; the controls are that pause works on the next event and that every firing is
recorded. One narrow cut stands (a routine's own run may not re-trigger that same routine) and §3.1.1
states plainly which events it can see and which it cannot.

**Untrusted input reaching a prompt.** `routines.prompt` is written by a person or by an agent
(`create_routine`) and lands in the assembled instruction an agent executes. That is the *point* of the
feature, and this repository's ethos rules out treating it as an attack: a routine's prompt is an
instruction its owner authored to their own agent, exactly as a system prompt is. The one thing that would
be wrong is letting it silently *replace* the agent's identity, which is why D3 renders it as a bounded
`### Instruction` block rather than reusing `triggerPromptOverride`'s `?? systemPromptText` substitution.
The 12 000-character cap (D1) is a resource bound already applied to the same content by the retiring
entity, carried forward unchanged.

**Data destruction.** `0060` deletes every configuration row of kind `trigger` and every duplicate global
builtin routine. This is irreversible and it is the founder's explicit instruction ("we can delete all
trigger data, no relevant instances exist"). It is bounded by exact `kind`/`id` predicates — no `LIKE`
wildcard reaches beyond the `builtin:` namespace, and no other kind is touched.

**A new foreign key between rows in the same table.** `users.owner_user_id → users.id` is
`ON DELETE SET NULL`, so deleting a human orphans their assistant rather than cascading into it. That is
the conservative direction: an assistant that outlives its owner is inspectable; one that vanished with a
row is not.

**Surfaces this change does not touch.** No credential is read, written, or moved. No filesystem path is
constructed. No outbound request is made. No authentication or authorisation decision changes — BA1 adds
no check and removes none, and `agent_session_requests` gains no new caller. Who may sign in is BA7.

---

## 8. Implementation tasks

T1 must land first — everything reads the columns it creates. T2 and T3 are independent of each other
except for the `framework/domain-model/src/index.ts` barrel, which both edit in different places; the
orchestrator may run them in parallel and accept that one small conflict, or run them in sequence.

### T1 — The routine row and the belonging column

Delete the orphan `framework/db/drizzle/0059_drop_propagation_log.sql`; add migrations `0059` + `0060` and
their journal entries by hand. `framework/db/src/schema.ts`: `users.owner_user_id` + the check constraint;
`routines` gains `event_type` and the partial `routines_event_type_idx`, loses `team_id`, `skill_id`,
`done_condition`, `delegation_allowed` and its `routines_team_id_idx`, and renames `description` →
`prompt`. `@hyperidle/users` `insertUser` accepts and writes `ownerUserId` (**not** `updateUser` — D6).
`org/src/scaffold-agents.ts` + `resolve-scaffold-specs.ts` carry `ownerUserId` for the `user_assistant`
spec (and the `framework/factory-defaults` duplicate declaration if `npm run check` demands it).

### T2 — One primitive: matching, prompt, scope, once, and a visible failure

**The event matcher (D2), which is the largest piece.** Delete `registerEventTriggers` and its
`TriggerConfig` interface (`routine-scheduler.ts:686-731`). Add `registerRoutineEventMatcher(db, eventBus,
ports, config)`: one `eventBus.on(type, …)` per member of `EVENT_TYPES`; on delivery,
return early if `!config.canProvision`, else query
`listRoutines(db, { triggerType: "event", eventType: event.type, active: true })`, skip any id for which
`extractBuiltinKind` is non-null, and `fireGenericRoutine` the rest. No `getRoutine` re-read. Call it
synchronously from `startRoutineScheduler` (`:791`) and keep the `unwind` disposer shape.
`listRoutines` gains `eventType?: string`.

**Cut 3 (§3.1.1)**, in the same module: `originRoutineId(db, event)` — the three-step resolution, `null`
when unknown — and, in the matcher, drop the routine whose id equals the origin from the match set. Order
matters for cost: resolve the match set first and only compute the origin when that set is non-empty. Do
not add a depth counter, a cycle detector or any other loop mechanism (§3.1).

`routine-service.ts`: `listRoutines` filter `teamId` → `ownerAgentIds`; `RoutineRunSourceUnavailableError`
gains its `reason` discriminator (D9) and **all three** throw sites set it — `:390-392` ("run unavailable")
and `:394-396` ("not eligible") are `not_eligible`, the normalising catch at `:397-400` is
`agent_not_runnable`; `resolveRoutineRunRequest` reads
`agent.teamId`/`agent.ownerUserId`, bakes the bundle unconditionally with a nullable team, bakes
`routine.prompt`, bakes `userId`, and passes `routine.prompt ?? routine.name` as `taskDescription`.
`routine-scheduler.ts`: `BuiltinRoutineSpec.scope` and the `provisionTeamRoutines` id split (D7); the D9
failure record in `fireGenericRoutine`'s catch, gated on `reason === "agent_not_runnable"`.
`schedule-label.ts`: `humanizeSchedule` takes `eventType`, derives the label, loses `EVENT_LABELS`.
`framework/domain-model`: `BakedContextBundle` routine variant (`prompt`, no `description`, nullable
`team`), `routineSessionRequestInputSchema` optionality, `RoutineInfo` (`teamId`/`teamName` nullable,
`prompt` replacing `description`, `eventType` added, `delegationAllowed` gone).
`run-orchestration`: **three** structural copies of the routine context shape follow D3's rename and D4's
nullable team, not one — `RoutineSessionContextData` (`context.ts:109-125`),
`routineSessionContextDataFromBundle` (`context.ts:128-135`), and
`SessionLifecycleRoutineSessionContextData` (`provisioner.ts:360-369`), which is a third declaration the
port boundary keeps separate. `buildRoutineTaskSection` drops `**Purpose:**` and renders `### Instruction`;
`assembleRoutinePrompt`'s `product` fallback; delete `parseTriggerPrompt` / `triggerPromptOverride`.

**The rename reaches a file the agent reads, not just a prompt string.** `context.ts:689-693` serialises
the routine bundle into the sandbox as `context/session.toon` via
`buildSessionContextToon(routineSessionContextDataFromBundle(bundle))`, so the key in that file changes
from `routine.description` to `routine.prompt`, and `routine.team.*` becomes absent for a team-less
routine. That is intended and is part of D3/D4, but it is a written artifact and is named so it is not
discovered by a confused agent.
`framework/event-bus/src/events.ts`: `EVENT_TYPES` with `as const satisfies` + the red-able completeness
assertion; export it. No second, narrowed constant (§3.1).
`routines-routes.ts`: drop `teamId` from create + its `getTeam` check and add `.strict()` to both the
create and update schemas (NB2); `prompt` at 12 000 chars;
`triggerType` enum + `eventType` validation on create and patch; `GET /event-types`; `teamName` from the
owner agent's team or null.
`teams-routes.ts`: resolve the team's agent ids before both `listRoutines` calls.
`tool-definitions.ts`: `create_routine` widening; drop `teamId` and its `getTeamById` check.
`core-ui`: `RoutineCreateDialog` loses the team picker and gains a "When" `Select` (schedule / event)
feeding either the existing schedule picker or an event `Select` filled from
`GET /api/routines/event-types`; `WorkTeam.tsx:698` stops passing `teams`; `RoutineDetailPane` follows
`prompt`, adds `subtitle={run.errorMessage ?? undefined}` on the run row; `WorkRoutine.tsx` follows the
nullable team.

**The rename/drop reaches further than production** (N5). `npm run check` catches every one, but they are
named so nobody rediscovers them: `tools/setup/src/demo-world/activity.ts:186-258`,
`tools/setup/src/demo-fixture.ts:219`, `tools/eval/src/seeding.ts:550-570`,
`tools/eval/src/scenarios/delegation.ts:140,251,346` and its `delegationAllowed` scenario at `:369`
(retired, not recompiled — D11), `WorkRoutine.stories.tsx:30`, `RoutineDetailPane.stories.tsx:44`,
`layers/core-ui/__e2e__/time-vocabulary.spec.ts:658`, `layers/core-ui/__e2e__/page-layout.spec.ts:165`,
`WorkRoutine.AA1/AA2.test.tsx`, `RoutineDetailPane.AV4.test.tsx`,
`routine-run-resolver.integration.test.ts:78,91`.

### T3 — Retire the trigger entity

Every row of D10's table, plus the two directly affected test files
(`layers/core-ui/src/pages/__tests__/settings-agent-behavior.test.tsx`,
`layers/core-api/src/routes/__tests__/agent-behavior-settings.integration.test.ts`).

### T4 — Documentation

`docs/process-layer/routines-and-retros.md` — `:6` (seeded per team), `:20` (NOT-NULL team, "always
team-scoped"), `:22` (skill-based delegation, which never existed), `:38` (per-team seeding); and the
event-firing description, which must now say the matching routines are read when the event happens.
`docs/agent-layer/agent-model.md` — `:35` ("null means factory-wide") and `:67` ("Individual | Bound to a
human user (`teamId` null)", the binding that had no field until now).
`docs/process-layer/the-five-primitives.md` and `docs/requirements/functional-requirements.md` — both
mention the retiring vocabulary (`grep -rln "trigger rule\|skillId\|doneCondition" docs/`).
Any doc text that describes an event routine as needing a restart, or that implies loops are prevented,
is false — §3.1 is the ruling to reflect.

---

## 9. Verification

`npm run check` + `npm run lint` + the service integration lane, per `CLAUDE.md`. Tests are written red
before the code, per the first principle. Each AC gets the *cheapest* method that would actually catch a
broken wire.

### The one piece of end-to-end evidence

**Extend `layers/core-api/src/services/__tests__/routine-scheduler-baked-emit.integration.test.ts` to the
event path.** It already proves the clock path from a `routines` row to a baked intent with a real DB and
a real bus. The event path is the wire BA1 makes load-bearing and the one most likely to be broken
silently. The extension: start the scheduler **first**, then insert an event routine carrying a prompt,
then emit that event type on the real `eventBus`, and assert the enqueued intent's
`bakedRequestJson.contextBundle.routine.prompt` equals the configured prompt.

The insert-after-start ordering is the point: it is a single assertion that spans authoring →
matching → firing → resolution → bake **and** proves the founder's ruling, because under today's
boot-time subscription list this test cannot pass. No new harness.

### Per acceptance criterion

| AC | Kind | Method |
|---|---|---|
| A configured rule causes the named agent to run with the given prompt | runtime | the end-to-end test above (service integration lane), plus a unit assertion in `run-orchestration/src/__tests__/context-assembly-prompt.test.ts` that `buildRoutineTaskSection` renders the prompt under `### Instruction`, that `**Purpose:**` no longer appears, and that a null prompt omits the block |
| Several matches are defined and repeatable | runtime + type | integration: two event routines, different owners, same `eventType`; emit once; assert two `routine_runs` rows and two intents with distinct `idempotencyKey`s, and that a second emit produces two more. Type: `NewRoutine` has no `priority` field — there is nothing to arbitrate, and `npm run check` keeps it that way |
| No match leaves today's behaviour unchanged | runtime | integration: emit an event no routine names; assert zero new `routine_runs` and zero new `agent_work_intents`. Plus every existing calendar-path routine test stays green **unmodified except for the `description`→`prompt` rename** — a test that had to be reasoned about to stay green would mean behaviour moved |
| A missing agent fails visibly to whoever configured it | runtime + visual | integration: set the owner agent's `status` to a non-runnable value, fire, assert one `routine_runs` row with `outcome:"error"` and a non-null `errorMessage`, `routines.state === "error"`, `routines.active === false`, and that a **second emit of the same event** produces no further rows. **Paired negative (B1):** pause a routine so the resolver rejects with `reason:"not_eligible"`, and assert `state` is still `"paused"` and **no** run row was written. Visual: `npx playwright screenshot http://localhost:5173/work/routines/<id>` and read the PNG — the StatusChip reads error **and the run row's subtitle carries the message**, which is only true after D9 half two |
| A person can tell whether it has ever fired | visual + regression | the same screenshot shows Recent Runs and Last run; the existing `layers/core-ui/src/pages/__tests__/RoutineDetailPane.AV4.test.tsx` guards the rendering, extended with one assertion that a run's `errorMessage` reaches the DOM |

### The founder's two consequences, tested directly

Neither is an AC, and both are the ruling's substance, so each gets its own assertion in the same
integration lane:

- **No restart.** Covered by the end-to-end test's insert-after-start ordering above.
- **Immediate stop.** Start the scheduler, insert an active event routine, emit once and assert it fired;
  `PATCH` it to `paused`; emit the same event again and assert **no** second run, **and** that its `state`
  is still `"paused"` rather than `"error"`. Then soft-delete a second routine and assert the same. This
  is the case the cached list provably cannot pass, and it is also B1's regression guard.
- **No double-fire** (§2.5). Emit `bet_state_changed` with `toState:"completed"` against a seeded
  `builtin:post-bet-retro:<teamId>` and assert exactly one run row and **zero** `routine_run`-kind work
  intents — the builtin path only.

### Cut 3, and the loops that are deliberately not prevented (§3.1)

- **The cut works.** Two routines, R and S, both authored on `routine_fired`. Fire R once; assert S got a
  run from R's `routine_fired` and **R did not**. That is the whole cut in one assertion, and it also
  proves the cut is narrow — S firing is the control that stops "drop everything on an event a routine
  emitted" from passing.
- **The cut reaches through a run id, not just a field.** Same shape against
  `agent_run_lifecycle_changed`, whose origin resolves via step 3's `getRoutineRun(sourceId)` rather than
  a direct field — otherwise only the easy path is tested.
- **The cut covers the *other* source-kind vocabulary (NB1).** Same shape against
  `agent_run_admission_failed`, emitted with `sourceKind:"routine_run"` rather than `"routine"`. This is
  the case revision 3 claimed to cover and silently did not, and it is the one loop with no agent session
  between iterations — so it gets its own assertion rather than riding on the lifecycle test. A test that
  exercised only `"routine"`-spelled events would have stayed green over the bug.
- **Unknown origin suppresses nothing.** Emit an event with no `sourceKind`/`sourceCorrelation` (e.g. a
  plain `item_created`) against a routine authored on it; assert it fires. This guards the direction that
  would quietly break the feature — an `originRoutineId` bug that returned a wrong id would silently stop
  legitimate routines, and nothing else would catch it.
- **Not tested, by design:** that a loop through an agent's own actions is prevented — it is not, and
  §3.1 accepts it. There is no test for a mechanism that does not exist, and none should be added later
  by someone reading the loop discussion out of context.

### The migration's data steps, proved against a database that has rows

Revision 1 claimed the §4 invariant was "proved by the existing service integration lane running against a
freshly migrated database". That was wrong (N3): a fresh database has no pre-existing rows, so the
`event_type` backfill, the `IS JSON OBJECT` guard, the `ast-` backfill and the three-step builtin dedupe
are all no-ops there — the riskiest half of `0060` would have had no verification at all.

There is an exact precedent to copy: `framework/db/src/__tests__/run-config-relocation-migration.integration.test.ts`
replays the **real** migration SQL file against its own PGlite instance holding real pre-migration rows,
and its `@lore` explains why it allocates its own instance rather than borrowing the pooled fixture (it
does DDL, which would poison a reused instance). One new test in the same shape, seeding before the
migration and asserting after:

| Seeded before | Asserted after |
|---|---|
| an event routine whose `trigger_config` is `{"eventType":"bet_state_changed"}` | `event_type = 'bet_state_changed'` |
| an event routine whose `trigger_config` is `not json at all` | `event_type IS NULL`, and the migration completed — the `IS JSON OBJECT` guard held |
| `builtin:knowledge-decay:t1` and `:t2`, each with two `routine_runs` | exactly one `builtin:knowledge-decay` row, four runs pointing at it, zero suffixed rows |
| a routine with text in `description` | the same text in `prompt` |
| `ast-<u>` with a matching human `<u>`, and `ast-<x>` with no such human | the first has `owner_user_id = <u>`; the second has `NULL` |
| a `configuration_overrides` row of kind `trigger` and one of kind `routine` | the trigger row gone, the routine row untouched |

### Static properties — lint and types, not tests

- **The completeness assertion must be demonstrably red-able (B4).** Before shipping, the builder deletes
  one entry from `EVENT_TYPES` and confirms `npm run check` fails, then restores it. This is a required
  step, not a suggestion: an assertion nobody has watched fail is indistinguishable from one that cannot,
  and revision 1 specified exactly such an assertion. Record the observation in the PR.
- **The event vocabulary is reduced, not closed (§2.6).** After BA1 the live vocabulary is one list with a
  red-able completeness check, and three of the four parallel lists are deleted. The fifth —
  `framework/domain-model/src/events.ts`'s complete duplicate — **survives**, and no check in this package
  detects an addition to it. Recorded as a residual, and proposed as an AU row.
- **The two routine source-kind spellings are pinned (NB1).** `const SESSION_SPELLING:
  AgentSessionSourceKind = "routine"` and `const INTENT_SPELLING: AgentWorkIntentSourceKind =
  "routine_run"` are type-level assertions: if either union renames its routine member, `npm run check`
  fails at the predicate rather than cut 3 quietly reopening. A bare string comparison would not.
- **The trigger entity is gone.** `npm run check` fails on any surviving import of the deleted exports;
  `npm run lint`'s knip passes fail on anything left unreferenced. No bespoke guard is added — a guard
  that scans a deleted path reads as passing forever.
- **Belonging is exactly one answer.** The DB `CHECK` is the enforcement; one integration assertion that
  writing both `team_id` and `owner_user_id` is rejected proves the constraint is live rather than
  declared.
- **`teamId` is gone from the create contract, not ignored (B5/NB2).** One route test asserting that a
  `POST /api/routines` body carrying `teamId` gets a **400**, not a 201 with the field discarded. This
  passes only because of `.strict()` — a plain `z.object` strips unknown keys, so without it the test goes
  red and the "removal" is cosmetic. It is the difference between a removed field and an inert one, which
  typecheck cannot see.

**Not verified by an automated test, deliberately:** that the per-event lookup uses
`routines_event_type_idx`. An `EXPLAIN` assertion against PGlite would encode the planner's current
choice, not a property of the system, and would fail for the wrong reasons. The index exists, its
predicate matches the query, and that is the evidence the tier buys. If firing latency ever becomes a
reported symptom, `EXPLAIN` is the first thing to run by hand.

### One visual check, and why only one

`RoutineCreateDialog` loses a `Select` and gains a `Select`. It reuses the existing `Select`, `Input` and
`Dialog` primitives and adds no component, so `npm run lint`'s design-token pass covers it. Screenshot the
dialog open once and read the PNG; no story is added, because per `.claude/rules/visual-regression.md` a
story is the design artifact for a *custom component*, and this is not one. The routine detail page's
screenshot is already required by AC4 above and covers D9's `subtitle`.
