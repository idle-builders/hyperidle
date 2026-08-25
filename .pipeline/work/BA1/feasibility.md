# BA1 — Feasibility probes

Every probe below is a read of the repository at `plan/BA1-refinement` (based on `origin/main` at
`115c54764`). No probe needed live deployed state: this work package's premises are all statements about
what code exists and what reads what, and the repository is the authority for those. Where a probe
contradicts `requirements.md`, the verdict says so and `architecture.md` carries the design consequence.

---

## P1 — Is `routines.skill_id` written by the builtin specs and read by nothing?

**Why it matters.** `requirements.md` §1 rests on it: "this is not a swap of one field for another; it
removes a column that never worked." If something read it, removing it would be a behaviour change, not a
cleanup. The task brief asked for this to be verified rather than trusted.

**Method.**
```
grep -rn "skillId\|skill_id" layers framework applications tools \
  --include="*.ts" --include="*.tsx" --include="*.sql" | grep -v "/dist/"
```

**Result.** Every hit is a write, a type declaration, or an archived migration:

| Site | What it is |
|---|---|
| `framework/db/src/schema.ts:527` | the column declaration |
| `layers/core-api/routine/src/routine-scheduler.ts:119,132,143,154,165,203` | `BuiltinRoutineSpec.skillId` + the four builtin values + the `insertRoutine` write |
| `tools/setup/src/demo-world/activity.ts:186-257` | demo seeding — declares, sets, and passes it straight to the insert |
| `tools/eval/src/seeding.ts:550,569` | eval seeding — `opts.skillId ?? null` into the insert |
| `tools/eval/src/scenarios/*.ts` | eval scenarios setting the seed value |
| `layers/core-api/routine/src/__tests__/routine-run-resolver.integration.test.ts:79,92` | test fixture |
| `framework/db/drizzle*/**` | archived and current migration DDL |

No production read anywhere. `routine-service.ts` never selects it into a decision;
`routines-routes.ts` never projects it onto `RoutineInfo`; `resolveRoutineRunRequest` never consults it;
`fireGenericRoutine` and `fireBuiltinRoutine` never branch on it.

**Verdict.** Confirmed. `skill_id` is write-only. Removing it changes no behaviour.

**Same probe, same answer, for `routines.done_condition`**
(`grep -rn "doneCondition" layers/core-api/routine/src/`): written by `BUILTIN_SPECS`
(`routine-scheduler.ts:120,133,144,155,166,204`) and the two seeders, read by nothing. The other
`doneCondition` hits in the tree belong to bets and tasks, not routines.

---

## P2 — Does a routine whose agent cannot run go to `state: "error"`?

**Why it matters.** This is the *only* evidence `requirements.md` offers for acceptance criterion 4 ("A
missing agent fails visibly to whoever configured it"). It is one of the three ACs the refinement claims
the merge satisfies for free.

**Method.**
```
grep -rn 'state: "error"' layers --include="*.ts" --include="*.tsx" | grep -v dist
```
then read the failure path end to end: `routine-scheduler.ts:594-631` (`fireGenericRoutine`),
`routine-service.ts:379-400` (`resolveRoutineRunRequest`), `users/src/runnable-agent.ts:34-40`
(`requireRunnableAgent`).

**Result.** Four hits, none of them production:
`core-ui/src/ds/__tests__/ArtifactGalleryCard.test.tsx:135`,
`core-ui/src/__tests__/WorkTeam.AA1.test.tsx:73`,
`core-ui/src/pages/WorkRoutine.stories.tsx:96`,
`core-api/src/__tests__/routines-aa1.integration.test.ts:310`. The last is a human explicitly
`PATCH`ing the state; the other three are fixtures.

Reading the path is worse than "no state change". In `fireGenericRoutine` the `routineRuns` insert and
`resolveRoutineRunRequest` are **inside the same transaction** (`routine-scheduler.ts:602-613`). When the
owner agent is not runnable, `requireRunnableAgent` throws, the resolver normalises it to
`RoutineRunSourceUnavailableError` (`routine-service.ts:392-399`), and the `catch` at
`routine-scheduler.ts:626-628` returns `{ fired: false }`. The transaction has already rolled back, so
**no `routine_runs` row survives either**. On the event path the caller is
`fireGenericRoutine(...).catch(() => {})` (`routine-scheduler.ts:723-725`); on the clock path it is the
same (`:824-826`). Nothing is written, nothing is logged at the routine, and the scheduler retries on
every tick forever.

**Verdict. CONTRADICTS `requirements.md`.** A routine naming an agent that cannot run fails completely
silently today — no state, no run row, no message. AC4 is *not* satisfied by the merge; it is real work.
`architecture.md` D9 specifies it.

---

## P3 — Is there a live read path for a per-run prompt override?

**Why it matters.** `requirements.md` says "the prompt becomes the instruction it bakes" without saying
where. If a prompt seam already exists, extending it beats inventing one.

**Method.** `grep -rn "triggerPromptOverride" layers framework applications tools | grep -v dist`, then
read each site.

**Result.** Five sites, and they form a complete read half with no writer:

- `run-orchestration/src/runtime.ts:110-118` — `parseTriggerPrompt(request)` reads
  `request.payloadJson.trigger.prompt`.
- `runtime.ts:445,475` — the parsed value rides onto `provisionParams.requestContext.triggerPromptOverride`.
- `run-orchestration/src/contracts.ts:47` and `provisioner.ts:707` — the field on both contracts.
- `provisioner.ts:1232-1233` —
  `const effectiveSystemPromptText = params.requestContext?.triggerPromptOverride ?? systemPromptText;`

The writer would have to put `trigger.prompt` into `payloadJson`. The only builder of that column is
`session-requests/src/service.ts:598-614`, which writes exactly five keys — `transcript`,
`contextBundle`, `agentConfig`, `harnessDisabled`, `callingThreadId`. There is no `trigger` key. Nothing
in the repository writes one.

**Verdict.** Confirmed dead-on-arrival: a live read of a payload nothing writes. It is the read half of
the retiring trigger entity, so it retires with it (`architecture.md` D3/D10). It is **not** reused,
because `?? systemPromptText` makes it *replace* the agent's persona rather than instruct it — see D3.

---

## P4 — Does the routine context bundle survive an agent with no team?

**Why it matters.** `requirements.md` §2 removes `routines.teamId` and takes scope from the owner. An
agent may belong to a person or to nobody, so a team row may not exist. If the bundle depends on one, the
prompt disappears at exactly the moment the refinement makes possible.

**Method.** Read `routine-service.ts:415-448` and `provisioner.ts:1236-1281`.

**Result.** The bundle is conditional twice over:
```ts
if (getTeamById && assembleSessionKnowledge) {
    const team = await getTeamById(db, routine.teamId);
    if (team) { contextBundle = { kind: "routine", …, team: { id, name }, … }; }
}
```
`BakedContextBundle`'s `kind:"routine"` variant declares `team: { id: string; name: string }` —
required, not nullable (`framework/domain-model/src/work-intent.ts:245-256`). Downstream,
`provisioner.ts:1236` only takes the routine branch when `params.contextBundle?.kind === "routine"`;
otherwise it falls through to `assembleTaskFreePrompt` (`:1272-1281`), which renders no routine section
at all. `assembleRoutinePrompt` also reads `context.team.name` for the `{{product}}` template variable
(`context.ts:487`).

**Verdict.** Confirmed hazard. Removing `routines.teamId` without also making `team` optional and baking
the bundle unconditionally would make a team-less routine's prompt silently vanish. `architecture.md` D4
makes both changes; it is a blocker, not an optional improvement.

---

## P5 — Can anyone actually configure an event-fired routine today?

**Why it matters.** AC1 requires "a configured rule causes the named agent to run". `requirements.md`
says the routine path already works, which is true of *firing* — but only if a row can be created.

**Method.** Read the three authoring surfaces: `layers/core-api/src/routes/routines-routes.ts:40-49`,
`layers/agent-orchestration/tool-handlers/src/tool-definitions.ts:1170-1177`,
`layers/core-ui/src/pages/work/RoutineCreateDialog.tsx:84-96`.

**Result.** All three hard-code the calendar case:
- `createRoutineSchema`: `triggerType: z.literal("calendar")`, and the handler rejects a
  `triggerConfig` without a `cron` field (`routines-routes.ts:130-140`).
- `createRoutineInputSchema` for the `create_routine` tool: the same `z.literal("calendar")` and the same
  cron requirement.
- `RoutineCreateDialog` posts a fixed `triggerType: "calendar"`.

`registerEventTriggers` (`routine-scheduler.ts:695-731`) subscribes every active `triggerType:"event"`
routine to the event named in its config and fires it — so the *firing* half is real. The only rows that
reach it are the one builtin (`builtin:post-bet-retro`) and anything seeded directly into the database by
`tools/eval` or `tools/setup`.

**Verdict.** Confirmed gap. Widening the two create schemas is required for AC1 to be reachable by a
person or an agent. `architecture.md` D8.

---

## P6 — Is `SettingsAgentBehavior.tsx` a "Triggers tab"?

**Why it matters.** The task brief and `requirements.md` both describe deleting "the Triggers tab". If it
is really one section showing six kinds, a delete would take five working surfaces with it.

**Method.** Read `layers/core-ui/src/settings/settings-types.ts:28,60`,
`layers/core-ui/src/pages/SettingsPage.tsx:91-92`, and `SettingsAgentBehavior.tsx` in full.

**Result.** There is one settings section, id `agent-behavior`, label **"Agent behavior"**. There is no
tab named Triggers anywhere. Inside it, `CATEGORY_LABELS` (`:29-36`) counts all six configuration kinds,
and the trigger-specific machinery is: the `trigger` entry in `CATEGORY_LABELS`, `EVENT_LABELS` +
`eventLabel` (`:38-50`), `kindTone`'s `trigger` branch (`:59-66`), `defaultEvent` (`:68-70`), the
`selectedEvent` state (`:84`), the `events` memo (`:123-129`), the `visibleItems` filter (`:131-141`),
the event `fieldset` (`:246-262`), the `selected.trigger` KeyValue block (`:302-311`), and two
trigger-worded empty strings (`:266-270`, `:363`).

**Verdict.** The brief's description is imprecise; the *content* is right. What retires is the trigger
kind and its event filter, not the section. The section keeps browsing agents, skills, routines, tools
and MCP servers. `architecture.md` D10 lists the exact edits.

---

## P7 — How many event types does the bus actually carry?

**Why it matters.** `requirements.md` contrasts the trigger entity's six names with the bus's, and
`.pipeline/BA.md` repeats the figure. It is load-bearing for the claim that the merge widens the
vocabulary rather than narrowing it, and it is a number quoted to the founder.

**Method.** Count the members of `KernelEvent` (`framework/event-bus/src/events.ts:611-647`) and
`StrategyEvent` (`:649-655`), whose union is `DomainEvent` (`:658`) and whose `["type"]` is `EventType`
(`:661`); then resolve each member interface to its `type` literal and count the distinct literals.

```
python3 - <<'EOF'
import re,io
s=io.open('framework/event-bus/src/events.ts',encoding='utf-8').read()
kern=re.search(r'type KernelEvent =(.*?);\n',s,re.S).group(1)
strat=re.search(r'type StrategyEvent =(.*?);\n',s,re.S).group(1)
k=re.findall(r'\|\s*([A-Za-z]+Event)',kern); st=re.findall(r'\|\s*([A-Za-z]+Event)',strat)
print("kernel",len(k),"strategy",len(st),"total",len(k)+len(st))
lits={re.search(r'(?:interface|type)\s+'+n+r'\b.*?type:\s*"([a-z_.]+)"',s,re.S).group(1) for n in k+st}
print("distinct type literals:",len(lits))
EOF
```

**Result.** `kernel 29 strategy 5 total 34`, and `distinct type literals: 34`.

**Verdict. CORRECTED — the number is 34, not 33.** Revision 1 of this file reported "28 + 5 = 33"; the
kernel count was short by one (`ProposedCallGrantedEvent`, the union's last member, was missed by reading
a truncated view). `requirements.md` and `.pipeline/BA.md` also carry 33 and should be corrected —
`architecture.md` T4 lists that.

The contrast the requirement draws survives and widens: `TRIGGER_EVENT_TYPES` is 6
(`framework/domain-model/src/trigger.ts:4-11`), and two of its six —
`work.decompose_requested` and `knowledge.action` — are not `EventType` members at all, so they could
never have matched anything even if a reader had existed.

---

## P8 — Is there a runtime list of event types, and can the browser reach it?

**Why it matters.** D8 needs to validate a submitted `eventType` on the server and offer a choice in the
browser, without creating the second vocabulary this work package exists to kill.

**Method.** `grep -n "as const" framework/event-bus/src/events.ts`; read
`framework/event-bus/src/index.ts`; read the `framework/event-bus` entry in
`tools/governance/architecture.json` `surfaces`.

**Result.** `EventType` is a *type* only — the single `as const` in `events.ts` is at `:33` and belongs to
`AGENT_WORK_INTENT_KINDS`, not the event vocabulary. There is no value-level list to validate against.

`architecture.json` declares `framework/event-bus` reach as
`["core-api", "agent-execution", "agent-orchestration", "service", "application"]` — **`core-ui` is
excluded**, with the stated reason "a browser has no in-process bus". (The same entry adds "it reaches the
event types in `framework/domain-model`", which is now stale: `framework/event-bus/src/index.ts:2-3`
records that the vocabulary was dissolved out of domain-model in AU44 batch 8. The *rule* stands; only
its explanation is out of date. Flagged, not changed — editing a governance registry's prose is not this
work package's business.)

**Verdict.** Two consequences, both in D8: (a) a runtime `EVENT_TYPES` const has to be added beside the
union, with a type-level completeness assertion so it cannot drift; (b) the browser must receive the list
over HTTP, not by import.

---

## P9 — What is `routines.description` already used for?

**Why it matters.** It decides whether the prompt is a new column or a rename, and that is a schema
decision that cannot be quietly reversed later.

**Method.** Read `layers/core-ui/src/pages/work/RoutineDetailPane.tsx`; then
`grep -rn "routine\.description" layers framework tools | grep -v dist`.

**Result.** `RoutineDetailPane.tsx:18` carries an explicit ruling:
`@lore AV4: The "prompt" IS routine.description — ground truth from …`. The pane labels the field
**"Prompt"** in both modes — `aria-label="Prompt"` on the textarea (`:396`) and
`<KeyValue label="Prompt" value={routine.description || "—"} …>` when read-only (`:481`). It saves
through `PATCH /api/routines/:id` with `description` in the body (`:229`).

Production consumers of the column: `routine-service.ts:432` (as the knowledge-scoring
`taskDescription`), `:439` (onto the context bundle), `routines-routes.ts:233` (onto `RoutineInfo`),
`context.ts:450-451` (rendered as `**Purpose:**` in the routine section), the create dialog, the two
stories files, plus `tools/setup` and `tools/eval` seeding.

**Verdict.** The product already calls this field the prompt. Adding a second column would put two
textareas meaning the same thing on the same pane — the exact confusion this work package removes.
`architecture.md` D1 renames rather than adds.

---

## P10 — Are the built-in routines that get copied per team actually global?

**Why it matters.** "A global routine must run once, not once per team" needs a defensible answer to
*which* of the four builtins are global. `requirements.md` forbids reasoning from the facilitators, so the
answer has to come from what each routine's body reads and writes.

**Method.** Read each `fireBuiltinRoutine` body (`routine-scheduler.ts:215-437`) and the two knowledge
sweeps it calls (`layers/core-api/knowledge/src/promotion-pipeline.ts:422-437`, `:522-533`).

**Result.**

| Builtin | What its body touches | Scope |
|---|---|---|
| `builtin:post-bet-retro` | `getBetById(args.betId)`, then a thread on that bet; `registerBuiltinRoutineHandlers` looks the routine up as `builtin:post-bet-retro:${betTeamId}` (`:499-521`) | **per team** |
| `builtin:portfolio-retro` | `listRecentByLayers(db, ["L3","L4"], cutoff)` — no team predicate; writes a thread with `hostKind:"factory"`, `hostId:"portfolio"` (`:340-352`) | **global** |
| `builtin:knowledge-decay` | `runStaleSweep` → `findStaleItems(db, …)` over `knowledge_items`, no team predicate | **global** |
| `builtin:knowledge-promotion` | `runAutoPromotionSweep` → `select().from(knowledgeItems).where(eq(status,"provisional"))`, no team predicate | **global** |

All four are seeded per team by `provisionTeamRoutines` as `${spec.id}:${teamId}`
(`routine-scheduler.ts:177-212`). So with N teams, three global sweeps run N times a day; runs 2..N find
their work already done by run 1.

**Verdict.** Confirmed, and derived without touching the facilitators — the split falls out of what each
body reads. `architecture.md` D7.

---

## P11 — What actually links a human to their own assistant?

**Method.** Read `layers/core-api/src/routes/users.ts:130-145`,
`layers/core-api/org/src/resolve-scaffold-specs.ts:68-80`,
`layers/core-api/org/src/scaffold-agents.ts:132-183`; then
`grep -rn 'ast-' layers framework applications tools | grep -v dist | grep -v __tests__`.

**Result.** At registration, `resolveAgentScaffoldSpecs({trigger:"user_assistant", ownerUserId: id, …})`
returns one spec carrying `idHint: \`ast-${request.ownerUserId}\``
(`resolve-scaffold-specs.ts:75`). `persistScaffoldedAgents` uses that id when it is free
(`scaffold-agents.ts:76-84`) and inserts the row with `teamId: teamId` — which the caller passes as
`null` (`users.ts:144`). No other column records the owner.

The string convention has roughly ten production readers, including
`conversation/src/assistant-turn-resolver.ts:100`, `core-api/src/routes/assistant.ts:146,218`,
`core-api/src/routes/threads.ts:404,498,514,641,1404`, `core-api/src/routes/agents.ts:339`, and three UI
sites (`SettingsAgents.tsx:254,541`, `AgentEditor.tsx:185`, `AssistantOverlay.tsx:401`).

**Verdict.** `requirements.md` is right that the id string is the only link. It undercounts the
*consumers* of that convention — there are about ten, not one. `architecture.md` D6 therefore adds the
column and populates it, and deliberately does **not** rewrite the ten string checks: `.pipeline/BA.md`
gives that to BA7, and rewriting them here would be a second work package hiding inside this one.

---

## P12 — Where does an agent's belonging have to be enforced, and does the current data allow it?

**Method.** Read `framework/db/src/schema.ts:46-67` (`users`), `tools/governance/table-owners.json`, and
`scaffold-agents.ts:158-167`.

**Result.** `users` carries `kind`, `teamId` (nullable FK to `teams`), `role`, `status`,
`agentCategory`. `tools/governance/table-owners.json` names `users` as owned by the `users` service, so
every write goes through `@hyperidle/users`. Team agents are inserted with a non-null `teamId`; the
per-user assistant is inserted with `teamId: null` (`users.ts:144` passes `null`). Humans also live in
this table with their own `teamId`.

**Verdict.** A mutual-exclusion `CHECK` is safe against today's rows — no agent has both a team and an
owner, because no agent has an owner at all yet. The constraint must exempt humans, whose `owner_user_id`
is simply always null. `architecture.md` D6 states the exact predicate.

---

## P13 — Migration numbering

**Why it matters.** The builder will run `npm run db:generate` or hand-author, and either way needs to
know the next free number.

**Method.**
```
ls framework/db/drizzle/
python3 -c "import json;d=json.load(open('framework/db/drizzle/meta/_journal.json'));print(len(d['entries']), max(e['idx'] for e in d['entries']))"
```

**Result.** The folder contains `0000_*` … `0059_drop_propagation_log.sql`. The journal contains 59
entries with a maximum `idx` of **58**, whose tag is `0058_AU44_fold_team_members`. The only journal entry
mentioning propagation is `0016_L20_propagation_log`.

So **`framework/db/drizzle/0059_drop_propagation_log.sql` exists on disk and is not in the journal**. It
has never been applied and never will be. It arrived with `23c160242` ("AU44 — fold the packages and
shrink what survived", #507).

**Verdict.** Pre-existing defect, **outside BA1's scope**, but it is a live trap: the next generated
migration wants to be `0059_*` and that filename is taken. `architecture.md` T1/T2 pin BA1's migrations at
`0060_*` and `0061_*` with journal indices 59 and 60, and leave the orphan alone. Reported separately —
whether `propagation_log` should actually be dropped is not this work package's call.

---

## P14 — What are the bus's delivery mechanics, and is the wildcard slot free?

**Why it matters.** The founder's ruling ("loaded from database when needed, not cached") forces a choice
of registration shape, and the choice depends on how `emit` behaves and whether `on("*")` is already
spoken for.

**Method.** Read `framework/event-bus/src/event-bus.ts` in full; then
`grep -rn '\.on("\*"' layers framework applications tools --include="*.ts" --include="*.tsx" | grep -v dist`.

**Result.** Four properties matter:

1. **`emit` is synchronous** (`event-bus.ts:88-116`) — it returns only after every handler has been
   called. So a handler that awaited a database read would extend the emitting write's call stack. The
   existing routine handlers avoid this with `void (async () => { … })()`, and the replacement must keep
   that shape.
2. **Handlers are stored per type** in a `Map<EventType, Set<…>>` (`:34`), with wildcard handlers in a
   separate `Set` delivered *after* the type-specific ones (`:109-119`).
3. **A throwing handler is caught and logged**, not propagated (`:100-106`) — so a failed routine lookup
   cannot break delivery to other subscribers.
4. **The wildcard slot is already in production use**: `run-orchestration/src/start-runtime.ts:327` —
   `deps.eventBus?.on("*", () => void wake())`. Every other `on("*")` in the tree is a test collector.

**Verdict.** Both shapes work. `architecture.md` D2 picks one handler per event type over a wildcard, for
two reasons this probe supplies: the wildcard channel's one production consumer is a cheap in-memory
poke, and a per-type set can be derived from the compile-time `EVENT_TYPES` constant — so unlike the
boot-time list being removed, it cannot go stale.

---

## P15 — Does the boot-time list already double-fire the one event-triggered builtin?

**Why it matters.** D2 replaces `registerEventTriggers` wholesale, so whatever that function does today
becomes this package's to get right.

**Method.** Read `registerEventTriggers` (`routine-scheduler.ts:695-731`), `BUILTIN_SPECS`
(`:125-173`), `registerBuiltinRoutineHandlers` (`:499-521`), the clock path's dispatch branch
(`:815-828`), and the production wiring in `service-bootstrap.ts:505-520`.

**Result.** `registerEventTriggers` selects
`listRoutines(db, { active: true, triggerType: "event" })` (`:700`) with **no builtin exclusion**, and
subscribes each result to `fireGenericRoutine`. `builtin:post-bet-retro` is seeded with
`triggerType: "event"` and `triggerConfig: { eventType: "bet_state_changed" }` (`:126-136`), so it is in
that set.

Separately, `registerBuiltinRoutineHandlers` subscribes to `bet_state_changed` and calls
`fireBuiltinRoutine` when `toState === "completed"` (`:505-520`). Both are registered on the same
`eventBus` in production, eleven lines apart — `service-bootstrap.ts:508`
(`registerBuiltinRoutineReactions`) and `:515` (`startRoutineScheduler`).

The clock path does have the guard the event path lacks: `extractBuiltinKind(routine.id)` → builtin vs
generic (`:815-828`). So does the manual-trigger path, whose `@lore AU20 repair` note in
`routine-scheduler-bindings.ts:159-166` records that this branch "was lost in the AU20 destroyer pass"
and had to be restored. The event path was never given it.

Note also the asymmetry in gating: the clock path skips generic firing when `canProvision` is false
(`:823`); the event path does not consult `canProvision` at all.

**Verdict. Live defect, pre-existing.** Every `bet_state_changed` emission starts a generic agent session
for the post-bet-retro routine, in addition to the in-process builtin retro on completion. It is inside
the surface BA1 rebuilds, and `.pipeline/BA.md` makes rubble in a package's own feature that package's
job. `architecture.md` §2.5 and D2 close it by excluding builtins from the matcher; the `canProvision`
asymmetry is recorded and deliberately left as-is.

---

## P16 — How many event-name vocabularies are there, and can the event name be indexed?

**Why it matters.** The founder's second consequence — "read only what is needed and index it, do not
scan the routines table per event" — is only satisfiable if the event name can carry an index. And D8
makes all 34 events authorable, which exposes every display path that only knows a subset.

**Method.** Read `framework/db/src/schema.ts:525-526` for the storage shape; then
`grep -rn "eventType" layers/core-api/routine/src/ --include="*.ts" | grep -v __tests__`, and read
`layers/core-api/routine/src/schedule-label.ts:26-32,149-155` and
`layers/core-ui/src/settings/SettingsAgentBehavior.tsx:38-51`.

**Result — indexability.** An event routine's event name lives inside `routines.trigger_config`, declared
`text("trigger_config")` — a plain text column holding `JSON.stringify({ eventType })`. A plain text blob
cannot serve an equality index on a field inside it. The options are an expression index over a
`::jsonb` cast, or a real column. The cast index is fragile (one malformed row breaks the build) and
unreadable; a real column is neither.

**Result — vocabularies.** Four lists of event names exist:

| List | Size | Where |
|---|---|---|
| `EventType` (the real one) | 34 | `framework/event-bus/src/events.ts:611-661` |
| `TRIGGER_EVENT_TYPES` | 6 | `framework/domain-model/src/trigger.ts:4-11` |
| `EVENT_LABELS` (schedule label) | 4 — `bet_state_changed`, `task_state_changed`, `session_started`, `session_ended` | `layers/core-api/routine/src/schedule-label.ts:27-32` |
| `EVENT_LABELS` (settings UI) | 6 | `layers/core-ui/src/settings/SettingsAgentBehavior.tsx:38-46` |
| **the full duplicate union** | **34** | `framework/domain-model/src/events.ts:600-647` — added by P21; this probe missed it |

`humanizeSchedule` returns the bare string `"On event"` for any event outside its four
(`schedule-label.ts:154`). Today that is nearly invisible, because the only event routine anyone has
is `bet_state_changed`. Once D8 makes every event authorable, the 30 outside the map render as `"On event"` on every
routine card and detail page.

**Verdict.** Two design consequences, both in `architecture.md`: D2 adds `routines.event_type` as a real
indexed column (which the founder's instruction requires and the JSON blob forbids), and D8 replaces the
four-name label map with a derivation from the name itself. The settings UI's map dies with the section's
event filter (D10). Recorded as §2.6.

**Amended by P21.** This probe counted four lists and concluded "there is no list left to drift". That
conclusion was wrong: it missed a fifth, complete duplicate of the vocabulary in
`framework/domain-model/src/events.ts`, which BA1 does not delete. The corrected statement is that BA1
takes five vocabularies to two. See P21.

---

## P17 — Does the routine page render a run's `errorMessage`?

**Why it matters.** Revision 1's D9 asserted it did, and AC4's screenshot evidence depended on it. The
critique challenged the claim.

**Method.** Read `layers/core-ui/src/pages/work/RoutineDetailPane.tsx` run-history section; then
`grep -rn "errorMessage" layers/core-ui/src --include="*.tsx" --include="*.ts" | grep -v __tests__ | grep -v stories`.

**Result.** `RoutineDetailPane.tsx:593-608` renders one `Row` per run with exactly three things: a
`RowDot` toned by `outcome`, `title={absoluteDateTime(run.startedAt)}`, and a single numeric cell holding
the duration. `errorMessage` is not among them.

Repo-wide, `errorMessage` appears in `layers/core-ui/src` only in `components/ThreadSections.tsx`
(`:186,211,220,224,281,285`) and `pages/Conversations.tsx:719` — a different feature. `WorkRoutine.tsx`
delegates its whole body to this pane, so there is no second renderer.

The data is present and unused: `RoutineRunSummary.errorMessage` is declared
(`framework/domain-model/src/routine.ts:73`) and the route populates it
(`routines-routes.ts:224`). The pane simply drops it.

**Verdict. CONTRADICTS revision 1's D9**, and the critique is right. A red dot with no reason is not
"fails visibly to whoever configured it", and AC4's stated proof could not have been produced. The fix is
one prop — `Row` already declares an optional `subtitle` (`layers/core-ui/src/ds/Row.tsx:64`), so
`subtitle={run.errorMessage ?? undefined}` is the whole change. `architecture.md` D9 half two.

---

## P18 — Does `RoutineRunSourceUnavailableError` distinguish a paused routine from an unrunnable agent?

**Why it matters.** Revision 1's D9 reacted to the error class. If the class carries more than one cause,
D9 would convert a deliberate pause into a permanent error state — a regression introduced by this change,
against the very AC it serves.

**Method.** Read `resolveRoutineRunRequest` (`layers/core-api/routine/src/routine-service.ts:388-400`)
and every `throw` of that class.

**Result.** Three throw sites, two distinct causes, one class:

| Site | Message | Cause |
|---|---|---|
| `:390-392` | `"Routine run is unavailable"` | the run row is not `running` |
| `:394-396` | `"Routine is not eligible to run"` | routine deleted, `active=false`, or `state !== "active"` — i.e. **paused** |
| `:397-400` (catch) | the normalised `AgentNotRunnableError` message | the agent cannot run — **this is AC4's case** |

The class carries no discriminator; only the message differs. D2 makes the race materially more likely,
because matching now happens per emitted event rather than once per scheduler tick, so the window between
the matcher's read and the resolver's re-check is entered on every emission. And the recovery affordance
D9 itself points at — `PATCH {state:"paused"}` — is exactly the action that would trip it.

Note also `routine-service.ts`'s own `@lore` on the catch: normalising to **one** recognizable class is
deliberate, so the fix is a discriminator field on the existing class, not a subclass.

**Verdict. CONTRADICTS revision 1's D9.** The critique is right. `architecture.md` D9 half one adds
`reason: "not_eligible" | "agent_not_runnable"` and errors the routine only on the second. Matching the
message string is explicitly ruled out.

---

## P19 — Which events does a routine's own run emit, and does coalescing bound a self-trigger?

**Why it matters.** D8 makes every event authorable. If a routine's own firing emits an event, a routine
named against it re-triggers itself.

**Method.** Read `fireGenericRoutine`'s emit sites (`routine-scheduler.ts:656-679`) and its coalescing
guard (`:579-596`); read the run-lifecycle finaliser
(`layers/core-api/src/services/routine-run-session-end-reactions.ts`); check registration order in
`service-bootstrap.ts`.

**Result.** A routine run emits, directly: `agent_work_intent_recorded` (`:656-665`) and `routine_fired`
(`:673-679`). The session it starts goes on to emit `session_started`, `session_ended` and
`agent_run_lifecycle_changed`.

The coalescing guard rejects a second run only while the previous one is still `outcome:"running"`
(`listRoutineRuns({routineId, running:true, limit:1})`, `:579-583`). That splits the five:

- `routine_fired` and `agent_work_intent_recorded` are emitted **during** the run, while the row is still
  `running` — so a routine named against them self-coalesces. Bounded.
- `session_ended` and `agent_run_lifecycle_changed` arrive **after** `finalizeRoutineRun` has moved the row
  to a terminal outcome — so the guard is open. Unbounded.

Registration order does not rescue it. `registerRoutineRunSessionEndReactions` registers at
`service-bootstrap.ts:286` and the scheduler at `:515`, so the finaliser's handler runs first — but both
handlers are fire-and-forget async (`void reactToSessionEnded(db, event)?.catch(…)`), so whether the
matcher's query observes a `running` row is a race between two in-flight promises.

**Verdict. Real. Resolved by founder ruling, and not in the direction this probe recommended.**

The facts above stand: a routine named against a terminal run-lifecycle event re-triggers itself, and the
finaliser/matcher ordering is a race rather than a bound. This probe recommended excluding the five
run-lifecycle events from the authorable set. **The founder rejected that and every other option framed
here** — loops are accepted as an unavoidable and sometimes wanted property of a system with an AI in the
middle, all 34 events stay authorable, and no loop-prevention mechanism is built.

Two consequences for this probe's findings:

- **The race is no longer a correctness problem.** Nondeterministic re-firing is accepted behaviour, so
  it is recorded as a property rather than carried as a defect. It also does not affect the one cut that
  survives: `getRoutineRun(runId).routineId` returns the same origin whether the run row is still
  `running` or already terminal (P22).
- **The `routine_fired` / `agent_work_intent_recorded` half of this probe's split still matters**, but as
  an explanation rather than a bound: those two are emitted while the run row is `running`, so the
  existing coalescing guard already limits them, and cut 3 now makes that explicit.

`architecture.md` §3.1 carries the ruling; §3.1.1 carries the one narrow cut — a routine's own run may
not re-trigger *that same routine* — and P22 establishes what that cut can and cannot see.

---

## P20 — Is the migration toolchain usable, and what does the numbering invariant require?

**Why it matters.** Revision 1 warned the builder not to let `npm run db:generate` claim a number, and
chose `0060`/`0061` at journal indices 59/60.

**Method.** `ls framework/db/drizzle/meta/`; compare snapshot coverage against the journal's entry count;
check every entry for `filename number == idx`.

**Result.** `meta/` holds 26 files, with snapshots stopping at **`0042_snapshot.json`**, against **59**
journal entries. drizzle-kit generates by diffing the schema against the latest snapshot, so
`npm run db:generate` cannot produce a correct migration in this repository today — it is already
unusable, and revision 1's warning was aimed at a tool nobody can run. Every migration here is
hand-authored and hand-journalled; `0058` and the orphan `0059` are both plainly hand-written.

All 59 journal entries satisfy `filename number == idx`. Revision 1's `0060`-at-idx-59 breaks that and
repeats the collision one step later: the next author's idx 61 wants filename `0061`, which BA1 would have
taken.

**Verdict.** Two corrections in `architecture.md` §4: drop the `db:generate` warning as aimed at a dead
tool, and keep the invariant by **deleting the never-journalled, never-executed
`0059_drop_propagation_log.sql`** and taking `0059`/`0060`. Deleting a file that has never run and never
will is a different decision from deciding whether `propagation_log` should be dropped; that question
stays open and untouched. Recorded as an explicit choice in `architecture.md` §3.2.

---

## P21 — Is `framework/domain-model/src/events.ts` a second complete event vocabulary?

**Why it matters.** Revision 1 claimed that after BA1 "there is nothing left to drift" and that "a second
list cannot grow back". The critique reported a fifth vocabulary the census missed.

**Method.** Read `framework/domain-model/src/events.ts:596-650`; then
`grep -n "events.js" framework/domain-model/src/index.ts`.

**Result.** The file holds a **byte-for-byte duplicate** of the whole vocabulary: `KernelEvent` at `:600`
with the same 29 members in the same order and with the same comments, `StrategyEvent` with the same 5,
and `export type DomainEvent = KernelEvent | StrategyEvent` at `:647`, plus every event interface beneath
them.

It is dead except for one symbol: `framework/domain-model/src/index.ts:97` re-exports
`SessionOutcome` from it, which is what keeps the module reachable and out of knip's reach.

It matters more than its deadness suggests. `tools/governance/architecture.json` gives
`framework/domain-model` `reach: "everyone"` — so this is the one copy `core-ui` *can* import, and
therefore the most inviting place for a future reader to add an event and expect it to work. `EVENT_TYPES`
lives in `framework/event-bus` and does nothing about it.

**Verdict. Revision 1's claim was false and is withdrawn.** BA1 takes the vocabulary count from five to
two: it deletes `TRIGGER_EVENT_TYPES` and both `EVENT_LABELS` maps, and makes the live one mechanically
complete. Deleting ~650 lines of dead type declarations in another track's territory is not this
package's job. `architecture.md` §2.6 states the residual plainly and proposes it as an AU row.

---

## P22 — Does an event reliably carry the routine run that produced it?

**Why it matters.** The founder's loop ruling permits exactly one cut: a routine's own run must not
re-trigger *that same routine*. Implementing it requires knowing that an event came from a run of
routine R. If that origin is not reliably present, the cut silently misses cases — and a mechanism that
silently misses cases is worse than a stated gap. This probe establishes the coverage rather than
assuming it.

**Method.** Read every event interface a routine run can produce
(`framework/event-bus/src/events.ts`), then every emit site for those types, then check whether the
fields the origin depends on are populated at each site.

```
for n in AgentWorkIntentEvent RoutineFiredEvent SessionStartedEvent SessionEndedEvent \
         AgentRunLifecycleChangedEvent AgentRunAdmissionFailedEvent; do
  awk "/export interface $n /,/^}/" framework/event-bus/src/events.ts
done
grep -rn 'type: "session_started"\|type: "session_ended"\|type: "agent_run_lifecycle_changed"' \
  layers --include="*.ts" | grep -v dist | grep -v __tests__
```

**Result — the type level.**

| Event | Origin-bearing fields | Optional? |
|---|---|---|
| `routine_fired` | `routineId` | **no — a real, required field** |
| `agent_work_intent_recorded` | `sourceKind`, `sourceId` | no, both required |
| `agent_run_lifecycle_changed` | `sourceKind`, `sourceId` | no, both required |
| `agent_run_admission_failed` | `sourceKind`, `sourceId` | no, both required — **but a different vocabulary, see below** |
| `session_started` | `sourceKind?`, `sourceId?`, `sourceCorrelation?` | **yes, all three optional** |
| `session_ended` | `sourceKind?`, `sourceId?`, `sourceCorrelation?` | **yes, all three optional** |

Where `sourceCorrelation` is present and the kind is `routine`, it carries `routineId` as a **required**
field (`framework/domain-model/src/session-request.ts:78-82`). Where only `sourceId` is present, it is
the **run** id, so the routine is one primary-key read away (`routine_runs.routineId`).

**Correction — there are two source-kind vocabularies, and this probe originally conflated them.** A
routine is spelled differently in each:

| Union | Routine member | Events using it |
|---|---|---|
| `AgentSessionSourceKind` (`framework/domain-model/src/session-request.ts:9-15`) | `"routine"` | `agent_work_intent_recorded`, `session_started`, `session_ended` |
| `AgentWorkIntentSourceKind` (`framework/event-bus/src/events.ts:45-51`) | `"routine_run"` | `agent_run_admission_failed` |

`AGENT_SESSION_SOURCE_KINDS` has **no** `"routine_run"` member, so a predicate testing only
`sourceKind === "routine"` can never match `agent_run_admission_failed`. Both of that event's emitters
pass the stored intent value verbatim (`session-requests/src/service.ts:506-514`, `runtime.ts:297-305`),
and `fireGenericRoutine` enqueues the intent as `sourceKind:"routine_run"`, `sourceId: runId`
(`routine-scheduler.ts:636-638`). The verdict below originally listed this event as covered; it would not
have been. `architecture.md` §3.1.1 now names both spellings and pins each to its own union so a rename
breaks the build.

**Result — the emit sites, which is where the optionality resolves.**

| Site | Populates origin? |
|---|---|
| `provisioner.ts:1080` (`session_started`) | yes, when `params.requestContext` is set |
| `transition-run.ts:200` (`endSession`) | yes, when `context.requestContext` is set |
| `transition-run.ts:273` (`crashSession`) | yes, same condition |
| `runtime-reapers.ts:201` (stale-session reaper) | yes — hardcodes `sourceKind:"routine"` + `sourceId` |
| `session-store.ts:209` (`endSessionByCas`) | **no — emits no `sourceKind`, `sourceId` or `sourceCorrelation` at all** |
| `routine-scheduler.ts:656-665` (`agent_work_intent_recorded`) | yes — `sourceKind:"routine"`, `sourceId: runId` |
| `routine-scheduler.ts:673-679` (`routine_fired`) | yes — `routineId` directly |

Two findings resolve the optionality:

1. **`requestContext` is set unconditionally on the durable path.** `runtime.ts:470` builds it inside
   `consumeAgentSessionRequest` with no guard, and a routine session is only ever durable — it arrives
   through `fireGenericRoutine` → `enqueueWorkIntent` → drain → session request. So `session_started` and
   the two `transition-run.ts` `session_ended` emitters always carry the correlation for a routine
   session.
2. **`endSessionByCas` has zero production callers.** It is exported from the run-orchestration barrel
   (`index.ts:71`) and the only call sites in the tree are in its own test
   (`session-store.integration.test.ts`). By this repository's own rule, test-only reachability is not
   production reachability, so the one origin-less emitter is not on any live path today.

**Result — the case no field can cover.** Events caused by the *agent* during a routine's run —
`item_created`, `knowledge_updated`, `bet_state_changed`, `thread_message_appended`, `artifact_created`,
`task_state_changed` — carry **no routine origin of any kind**, and no plumbing exists to give them one.
A routine authored against `bet_state_changed` whose agent edits a bet re-triggers itself, and no
inspection of the event can tell.

**Verdict. Cut 3 is implementable honestly, with stated coverage — it is not complete and is not
presented as complete.** (Amended: the covered set holds only once the predicate accepts both spellings
above. `agent_run_admission_failed` also turns out to be the *most* important member of that set — it
fires before any session exists, so a routine looping on it spins with no LLM call in the cycle, and the
admission reaction has already finalised the run row (`agent-run-admission-reactions.ts:86-90`) so the
coalescing guard is open.) It covers every event the routine *machinery* emits, on every production path,
via three resolution steps (a direct field, a correlation field, or one primary-key read on
`routine_runs`). It does not cover events produced by the agent's own actions, which is precisely the
case the founder named as unavoidable — *"this is near impossible with an agent working in between"* —
and which the ruling accepts rather than mitigates. No new plumbing is required for the covered set, and
none is added for the uncovered one. `architecture.md` §3.1.1 states the coverage table; §3.1.2 states
what stands in its place.

One note for a future author rather than for this package: if `endSessionByCas` ever gains a production
caller without also emitting `sourceKind`/`sourceCorrelation`, it opens a real hole in cut 3. Deleting it
or fixing its emit belongs to `run-orchestration` and to AU's rubble pass, not here.

---

## P23 — Does `validateBody` reject an unknown field, or strip it?

**Why it matters.** D5 removes `teamId` from `POST /api/routines`. Revision 3 claimed a body still
carrying it would be "rejected as an unknown field", and §9 mandated a route test asserting exactly that.
If the validator strips instead of rejecting, the removal is cosmetic — the field is accepted and
discarded, which is the inert surface B5 was raised against — and the mandated test fails with no remedy
in the design.

**Method.** Read `validateBody` (`framework/domain-model/src/http.ts:100-108`), check the schema kind at
`routines-routes.ts:41-49`, check the zod major, and look for existing precedent in the repository.

**Result.**

```ts
export function validateBody<T extends z.ZodTypeAny>(schema: T): MiddlewareHandler<…> {
	return zValidator("json", schema as never, validationHook) as MiddlewareHandler<…>;
}
```

It is `zValidator` over the supplied schema and nothing more — no unknown-key policy of its own.
`createRoutineSchema` is a plain `z.object({…})` with no `.strict()`, and both `framework/domain-model`
and `layers/core-api` are on `zod@^4.3.6`. A plain object schema **strips** unrecognised keys on parse;
it does not error. So a `POST` body carrying `teamId` would return 201 with the field silently dropped.

The repository already solves this, with the same motive spelled out in a comment:

| Site | Shape |
|---|---|
| `layers/core-api/src/routes/bets.ts:63` | `.strict()` under the comment `// Reject old fields` |
| `layers/core-api/src/routes/notifications-routes.ts:37` | `.strict()` on the body schema |
| `layers/core-api/src/routes/notifications-routes.ts:200` | `validateBody(z.object({ muted: z.boolean() }).strict())` |

`bets.ts` is the exact precedent: a field removed from a contract that must be *rejected* rather than
quietly ignored.

**Verdict. CONTRADICTS revision 3's D5.** The claim was false as written. `architecture.md` D5 now
specifies `.strict()` on both the create and update schemas and says plainly that without it the removal
is a no-op; §9's route test now asserts a 400 and names `.strict()` as the reason it can pass.
