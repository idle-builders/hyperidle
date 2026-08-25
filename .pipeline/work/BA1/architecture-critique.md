# BA1 — Architecture critique

Reviewed: `.pipeline/work/BA1/architecture.md` + `feasibility.md`, against `requirements.md` (authority),
`plan.md` (record), `.pipeline/BA.md`, `CLAUDE.md`, `ETHOS.md`, `tools/governance/README.md`.
Every load-bearing factual claim is checked against the code on `plan/BA1-refinement`. The author's account
of its own revisions is treated as claims to test, never as fact.

| Round | Architecture | Verdict |
|---|---|---|
| 1 | revision 1 | **BLOCKED — six items** (§A) |
| 2 | revisions 2 + 3 | **BLOCKED — two items** (§B) |
| 3 | revision 4 | **APPROVED** (§C) |

---

# Round 3 verdict: APPROVED

Both round-2 blockers are fixed, and the fixes are real in the code's terms, not only in the document's.
The four round-2 non-blocking items are addressed at their substance. The founder's loop ruling still
holds exactly as ruled, and nothing new was smuggled in across four revisions.

**The builder is cleared to implement the architecture as written** — T1 through T4, in the stated order
(T1 first; T2 and T3 in parallel or sequence, accepting the one barrel conflict), with §9's verification
written red before the code, and with these three steps treated as required rather than optional:

1. **Watch `EVENT_TYPES`' completeness assertion fail** (delete one entry, `npm run check` must go red,
   restore, record it in the PR). It is the mechanism D2's subscription safety rests on.
2. **Prove cut 3 on the `"routine_run"` spelling specifically** (§9's third cut-3 bullet), not by riding
   on the `agent_run_lifecycle_changed` test. That is the case that was silently broken twice.
3. **Run the migration test against pre-migration rows** (§9's seed/assert table). A fresh database
   exercises none of `0060`'s data steps.

One optional pickup is noted in §D; it does not gate anything.

---

## §C — Round 3: what was claimed, and what is true

### NB1 — cut 3 missed `agent_run_admission_failed` → **FIXED**

**The two vocabularies are genuinely disjoint.** Confirmed:
`AGENT_SESSION_SOURCE_KINDS = ["task","assistant","routine","knowledge","proposed_call"]`
(`framework/domain-model/src/session-request.ts:9-15`);
`AgentWorkIntentSourceKind = "thread_message" | "explicit_session_start" | "knowledge_action" |
"routine_run" | "task_dispatch_attempt" | "proposed_call"` (`framework/event-bus/src/events.ts:45-51`,
exported, carrying the `@lore` that states the distinction and names `AgentRunAdmissionFailedEvent` as the
event that carries the pre-resolution vocabulary verbatim). Neither union contains the other's routine
spelling. §3.1.1's revised citation is correct — the type is in `event-bus`, and also in the dead
domain-model duplicate §2.6 already records.

**The predicate now matches the event in question.** Both emitters pass the stored intent kind through
unchanged (`session-requests/src/service.ts:510`, `runtime.ts:301`), and a routine intent is enqueued as
`sourceKind:"routine_run", sourceId: runId` (`routine-scheduler.ts:636-638`). So
`isRoutineSourceKind("routine_run")` now opens the gate, and step 3's `getRoutineRun(sourceId).routineId`
resolves because `sourceId` is the run's primary key on that path. The event is genuinely covered.

**The pinning achieves what it claims.** `const SESSION_SPELLING: AgentSessionSourceKind = "routine"`
type-checks only while `"routine"` is a member of that union; rename it and the string literal is no
longer assignable, so `npm run check` fails at that line rather than cut 3 quietly reopening. Same for
`INTENT_SPELLING` against `AgentWorkIntentSourceKind`. Neither import adds a package edge —
`@hyperidle/routine` already depends on `@hyperidle/domain-model` and `@hyperidle/event-bus`, and both
types are exported from their package roots.

*Limit, stated for the record and not a defect:* pinning catches a **rename** of either member, not the
**addition** of a third routine spelling in some future vocabulary. The document does not claim otherwise.

**The dedicated test is right, and its reason is right.** §9's third cut-3 bullet gives
`agent_run_admission_failed` its own assertion instead of letting it ride on the lifecycle test, with the
correct justification: a test exercising only `"routine"`-spelled events would have stayed green over this
exact bug. That is the lesson the failure taught, applied.

### The corrected three-tier justification — checked independently, and it holds

This is the author marking its own earlier argument wrong, so it was re-derived from the code rather than
read.

- **Tier 1, no session at all — `agent_run_admission_failed`.** The claim that coalescing is open is
  **true**: `layers/core-api/src/services/agent-run-admission-reactions.ts`'s `reactToAdmissionFailure`,
  case `"routine_run"`, calls `routineService.updateRoutineRun(db, event.sourceId, {outcome:"error",
  endedAt, errorMessage}, {onlyIfRunning: true})` — the run row is finalised on the admission failure, so
  `fireGenericRoutine`'s `listRoutineRuns({routineId, running:true})` guard finds nothing on the next
  attempt. So revision 3's blanket "every terminal loop costs a session per cycle" was indeed false, and
  the correction is the honest one. This is the tightest loop the design can produce and the one cut 3
  now actually stops.
  *One shade looser than stated:* `TARGET_AGENT_NOT_RUNNABLE` and the `session-requests` failure path are
  strictly pre-session, but a late `PROVISIONING_FAILED` (`runtime.ts:296-308`) can be raised after
  `session_started` has already been emitted at provisioner phase 7 (`provisioner.ts:1080`). "No LLM call
  anywhere in the cycle" holds in every case; "before a session exists" is exact for the dominant case
  and approximate for late provisioning failures. The tier is unaffected.
- **Tier 3, already coalesced — `routine_fired`, `agent_work_intent_recorded`.** Both are emitted after
  the transaction has committed the `outcome:"running"` row and before any finaliser can touch it
  (`routine-scheduler.ts:656-665`, `:673-679`), so the guard is closed at emit time. Correct. The handler
  race is already recorded as accepted behaviour under the ruling.
- **Tier 2, one session per cycle — `session_ended`, `agent_run_lifecycle_changed`.** These arrive after
  the run row is finalised, so unbounded but slow and individually visible. Correct.

The three tiers are a better argument than the one they replace, and they are the argument cut 3 should
rest on: it removes one unbounded tight loop and one unbounded expensive loop for a field read plus a
primary-key read, and leaves the agent-action case the founder named as unavoidable. **Cut 3 earns its
lines.**

### NB2 — "rejected as an unknown field" was not what the code would do → **FIXED**

**The schemas are the ones the route uses.** `validateBody(createRoutineSchema)` at
`routines-routes.ts:93` and `validateBody(updateRoutineSchema)` at `:264`.

**`.strict()` has the effect claimed, on the version this package resolves.** Verified empirically against
`layers/core-api/node_modules/zod` (the resolution `layers/core-api` actually gets), not from memory:

- plain `z.object({…}).safeParse({name, ownerAgentId, teamId})` → `success: true`, `teamId` **silently
  dropped** — the inert outcome NB2 named;
- the same schema `.strict()` → `success: false`, `issues: [{code:"unrecognized_keys", keys:["teamId"]}]`.

**The 400 assertion is correct.** `validateBody` is `zValidator("json", schema, validationHook)`, and
`validationHook` (`framework/domain-model/src/http.ts:62-74`) returns
`c.json({error:"Validation failed", code: VALIDATION_ERROR, details}, 400)` on a failed parse. So §9's
route test asserting 400 is truthful.

**The precedent is real, with the same motive.** `bets.ts:61-63` carries `.strict()` under the comment
`// Reject old fields`; `notifications-routes.ts:37` and `:200` do the same.

**Blast radius of adding `.strict()` to the *update* schema — checked, and it is nil.** The only
production PATCH caller of `/api/routines/:id` is `RoutineDetailPane`, which sends `name`, `description`
(→ `prompt`), `silent`, and conditionally `autonomyLevel` and `triggerConfig` (`:227-238`), plus `{state}`
from the pause toggle (`:261-264`). Every key is a member of `updateRoutineSchema`, so strictness rejects
nothing that exists today. `useRoutine.ts:38` is a GET; trigger and delete are other verbs; everything
else is a test or an e2e mock.

D5 now carries the decision with the reasoning and the precedent (`:322-329`), §6's row says
"400 — rejected by `.strict()`, not stripped", T2 assigns it, and §9 explains that the test passes *only*
because of it. Consistent across all four places.

### The four round-2 non-blocking items — all addressed

| Item | State |
|---|---|
| Three throw sites, not "both" | **Fixed.** T2 now enumerates all three with the mapping: `"run unavailable"` and `"not eligible"` → `not_eligible`, the normalising catch → `agent_not_runnable`. *(Nit: the third is cited `:397-400`; the `throw` itself is at `:411`, inside the catch that opens around `:399`. The description is unambiguous.)* |
| Third context copy | **Fixed.** T2 names all three structural copies — `RoutineSessionContextData` (`context.ts:109-125`), `routineSessionContextDataFromBundle` (`:128-135`) and `SessionLifecycleRoutineSessionContextData` (`provisioner.ts:360-369`) — and says the port boundary is why the third exists. Verified: it is a separate declaration at `provisioner.ts:360-368`, used at `:404`. |
| `context/session.toon` key rename | **Fixed.** T2 names `context.ts:689-693` and states that the sandbox file's key moves from `routine.description` to `routine.prompt` and that `routine.team.*` becomes absent for a team-less routine. Verified: `buildSessionContextToon(routineSessionContextDataFromBundle(bundle))` at `:692` writes `context/session.toon`. Correctly framed as a written artifact an agent reads, not just a prompt string. |
| §3.1.2 overclaim | **Fixed properly.** Now: "A person can see what a routine fires on — but not which occurrence fired it", with the old sentence explicitly withdrawn. The remedy (one nullable `routine_runs` column holding the triggering event's `streamId`, written at the insert that already happens) is specified **and marked out of scope**, with the reason (no AC asks for it; AC5 is "has it ever fired", which `routine_runs` already answers). That is the right shape: named precisely enough that a later package takes it as a one-column change, and declined here rather than smuggled in. |

### Drift check — none

Four revisions is where a rejected mechanism returns under a new name. It did not.

- **The ruling is intact.** All 34 events stay authorable; `ROUTINE_AUTHORABLE_EVENT_TYPES` appears only
  as deleted (`:13`, `:191`, `:569-571`); "no loop prevention of any kind — no depth counter, no cycle
  detection, no run-chain accounting, no rate limit" stands at `:573-577` and is repeated as an
  instruction to the builder at `:969`. A tree-wide scan for `depth counter`, `cycle detect`, `rate
  limit`, `allow-list`, `throttle`, `quota` finds only those refusals and the pre-existing "no quota"
  paragraph in §7.
- **The one cut is still one cut**, and it is still applied to the **match set**, not the subscription
  set (D2 `:183-187`, T2 `:966-969`). A subscription-level filter would be an allow-list in disguise; it
  is not there.
- **Added scope is still exactly two items** (§3.2: D11, and deleting the orphan `0059`), both with
  "cut it if you prefer" framing on the one that has no AC behind it.
- **Everything revision 4 adds is:** two pinned constants and a two-spelling predicate, `.strict()` on two
  existing schemas, one test, and prose. No new mechanism, no new endpoint, no new column, no new package
  dependency, no new abstraction.
- **Boundaries unchanged and still correct:** no new table; `users` writes stay behind `@hyperidle/users`;
  the routine service still imports zero foreign tables; `core-ui` still reaches the event list over HTTP
  because the enforced rule says it must; `originRoutineId`'s `getRoutineRun` read stays inside the
  routine package.
- **BA7 / BA8 / BA9 lines still respected:** no `ast-` reader rewritten, no event type added, no builtin
  deleted, per-team duplication fixed at its cause as BA9's row asks.

---

## §D — One optional pickup (does not gate)

`updateRoutineSchema.description` is `z.string().optional()` (`routines-routes.ts:59`), which rejects
`null`, while `RoutineDetailPane` sends `description: description || null` (`:229`). So clearing the text
today produces a 400 and a "Failed to save routine" toast. Pre-existing, not caused by BA1, and outside
every AC — but BA1 rewrites that exact line (rename to `prompt`, 12 000-character cap), and D1's own
decision is that "`prompt` stays nullable". Declaring it `z.string().max(12000).nullish()` on the update
verb would make D1 true on the write path for the cost of one word while the line is open. The builder may
take it or leave it; nothing depends on it.

---

# §A — Round 1 record: six blockers, all since fixed

Against revision 1. Each was verified against the code before being raised, and each was verified fixed in
round 2.

1. **D9 would mark a paused routine as errored.** `RoutineRunSourceUnavailableError` carried two unrelated
   causes and D9 reacted to the class. → Fixed by the `reason` discriminator.
2. **D9's "No new UI" was false.** `RoutineDetailPane.tsx:593-608` renders a dot, a time and a duration;
   `errorMessage` was rendered nowhere. AC4's own screenshot evidence could not have been produced. →
   Fixed by `Row`'s existing `subtitle`.
3. **D3 left the assembled prompt ambiguous** — the same text twice, or `**Purpose:**` vanishing
   silently. → Fixed: one column, one field, one rendering, with the one-time change stated as intended.
4. **`EVENT_TYPES`' completeness assertion could not fail** — declared `readonly string[]`, so
   `Exclude<EventType, string>` is `never` for any list. → Fixed by `as const satisfies`, plus a required
   watch-it-fail step.
5. **The write side of D5 was undecided** — the route, the tool and the dialog still required `teamId`. →
   Fixed by removing it from all three (and, in round 3, by making the removal real with `.strict()`).
6. **D8 made self-feeding routines authorable with the risk unnamed.** → Taken to the founder; closed by
   ruling.

# §B — Round 2 record: two blockers, both now fixed

Against revisions 2 + 3. All six round-1 blockers verified fixed; the loop ruling verified implemented as
ruled (no allow-list, no prevention mechanism, cut applied to the match set); all eight round-1
non-blocking findings verified addressed — the event count corrected to 34 upstream in `requirements.md`
and `.pipeline/BA.md`, the fifth duplicate vocabulary acknowledged with the old claim withdrawn, the
migration proof replaced with a pre-migration-rows replay on a verified precedent, the `canProvision` gate
adopted, and the orphan `0059` deleted so `filename == idx` holds.

1. **NB1 — §3.1.1 claimed coverage of `agent_run_admission_failed` that its predicate could not produce.**
   That event carries the pre-resolution vocabulary (`"routine_run"`), not `"routine"`, so
   `sourceKind === "routine"` never matched it — and it is the one loop shape with no agent session
   between iterations. → Fixed in round 3.
2. **NB2 — "rejected as an unknown field" was not what the specified code did.** zod strips unknown keys;
   without `.strict()` a stale `teamId` would have been accepted and discarded, which is the inert
   outcome round 1's B5 existed to prevent, and §9's mandated test would have gone red with no specified
   remedy. → Fixed in round 3.

Also recorded in round 2 and carried without objection: the covered/uncovered split for cut 3 was verified
line by line against every emit site (`provisioner.ts:1078-1093`, `transition-run.ts:198-212`, `:271-285`,
`runtime-reapers.ts:200-210`, `routine-scheduler.ts:656-665`, `:673-679`), `endSessionByCas`
(`session-store.ts:207-217`) was confirmed to emit no origin fields and to have zero production callers,
and `bet_state_changed` / `item_created` / `thread_message_appended` were confirmed to carry no origin
field of any kind.
