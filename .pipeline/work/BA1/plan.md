# BA1 — One routine primitive: what fires, what it runs, and who it belongs to

**Status: built, reviewed, approved, proven on the running app. Awaiting merge.**
Consolidated handover — the phase artifacts (requirements, architecture, feasibility, the two critiques,
the two reviews, the red-phase records and the live-proof notes) were folded in here and removed. Git
history keeps them; nothing below depends on reading them.

---

## What this work package is

**Outcome.** Someone writes down "when this happens, run that agent with this prompt" and it happens.

**Why it mattered.** The product presented a working-looking control surface that did nothing: the
Triggers tab accepted, saved and displayed rules that no code ever read. Someone could configure a trigger,
see it saved, and wait for an agent that would never run. Extension-by-configuration is the premise of the
whole plugin idea, so this substrate had to be real before BA9 or AY2 could stand on it.

**The reversal that refinement produced.** This was registered as "build the missing read path for the
trigger-rule entity". The decision is the opposite: **the entity retires and routines absorb it.** The
product had two ways to say the same sentence — a trigger rule with a settings tab, six event names and no
reader, and a routine with an event trigger that subscribed to any of the 34 event types and actually
fired. Rather than build a read path for the dead one, the live one absorbed it.

Three of the five acceptance criteria are satisfied by that merge rather than by new code: several matches
are defined and repeatable because each routine is its own row; a missing agent fails visibly because the
routine's state goes to `error`; and "has it ever fired" was already answered by `routine_runs`.

---

## Founder rulings (binding — do not re-litigate)

1. **A routine is the umbrella noun**, and a routine fires either on a clock or on an event. What the code
   called a separate "trigger" primitive is the event-fired case of a routine.
2. **A routine carries a prompt, not a skill.** `skillId` was written by the builtin specs and read by
   nothing. *"The prompt can anyway reference a skill and the agent will be able to access that skill, so
   nothing is lost."*
3. **Scope comes from the owning agent, never from the routine.** An agent belongs to a team, to a person,
   or to neither, as a real field on the agent row — *"let's start with the agent row, we can always get
   more complex later."* The org map draws from it rather than storing it.
4. **Delete all trigger data.** *"No relevant instances exist."* No migration path, no compatibility window.
5. **No caching, no restart.** The first answer accepted a restart; on seeing the mechanism the founder
   overturned it: *"routines should always be loaded from database when needed, not cached for the entire
   run duration."*
6. **No loop prevention of any kind.** All 34 event types stay authorable; there is no allow-list, no depth
   bound, no cycle detection, no rate limit. *"This is not a deterministic system, it has an AI in the
   middle. So loops in AI systems are unavoidable and sometimes even wanted."* The single permitted cut is
   narrow: a routine's own run must not directly re-trigger **that same routine**. Anything wider, or any
   mechanism that amounts to loop prevention under another name, is a regression against this ruling.

---

## As built

**One primitive.** `registerRoutineEventMatcher` replaces the boot-time `registerEventTriggers`. One
handler per event type, subscribed from `EVENT_TYPES` — a compile-time constant with a completeness
assertion, so the subscription set cannot go stale. Deriving it from anything mutable is how the original
defect happened. The wildcard was not used: that slot belongs to the runtime wake-hint, and hanging a
database query off it would give every event in the system an invisible routine side-effect.

**The database is the source of truth at fire time.** Matching routines are read when the event happens.
This forced the event name out of the `trigger_config` text blob into a real `event_type` column with a
partial index — you cannot index a field inside a blob. The index predicate deliberately excludes the
paused flag so pausing and resuming does not churn it. Pause and delete then take effect on the very next
event for free, and the re-read that existed to work around the cache is gone.

**The narrow self-trigger cut**, and its honest limits. `originRoutineId` resolves an event's origin three
ways — a direct field, a correlation field, or one primary-key read on `routine_runs` — and returns null
otherwise. It **fails open**: unknown origin fires everything. Both source-kind spellings are pinned as
type-level constants (`SESSION_SPELLING`, `INTENT_SPELLING`) so a rename in either union breaks the build
at the predicate; a bare string comparison is what created the original bug.

*Coverage is partial and stated as partial.* Origin is recoverable for events the routine machinery emits
(`routine_fired`, `agent_work_intent_recorded`, `agent_run_lifecycle_changed`, `agent_run_admission_failed`,
`session_started`, `session_ended`). It is **not** recoverable for events an agent's own actions cause —
`bet_state_changed`, `item_created`, `thread_message_appended`. A routine whose agent edits a bet
re-triggers itself and the cut cannot see it. That is the founder's point, accepted rather than mitigated;
closing it would mean reshaping event contracts, which is BA8's.

**Visible failure.** Two distinct causes previously shared one error class, so a paused routine would have
been marked broken. They are now discriminated by a `reason` field: only a genuine unrunnable agent writes
a terminal error run and sets `state:"error", active:false`. Anything else — including a transient database
failure inside the agent lookup — behaves as before and retries. The error message renders on the run row
through `Row`'s existing optional subtitle.

**The trigger entity is gone**: `framework/domain-model/src/trigger.ts`, its barrel exports, the `trigger`
member of `CONFIGURATION_KINDS` and its database check constraint, and the settings surface. Create and
update schemas are `.strict()`, so a removed field or a stray `teamId` returns 400 rather than being
silently stripped — without that, the removal would have been cosmetic.

**Belonging.** `users.owner_user_id` plus a `users_belonging_ck` constraint: an agent belongs to a team, to
a person, or to neither. "Neither" is supported and deliberately not populated by us — *"that's something
that users and plugins will define for themselves."* The writer runs at registration, so a human's own
assistant now carries the link instead of only the `ast-<user-id>` id string.

**Migrations** `0059_BA1_agent_belonging` and `0060_BA1_one_routine_primitive`, hand-authored and
hand-journalled. `0060` renames `description` to `prompt`, lifts the event name into its own column, dedupes
the three global builtins to one row each, and drops `team_id`, `skill_id` and `delegation_allowed`. Every
structural statement is idempotent. The orphan `0059_drop_propagation_log.sql` — on disk, never journalled,
never executed — was deleted so numbering stays consistent; whether `propagation_log` should actually be
dropped is untouched and still open.

---

## What went wrong on the way, and why it matters to the next reader

**A migration that passed its own test and broke every real upgrade.** `0060` inserted a replacement row
with a column list that omitted `team_id`, while that column was still `NOT NULL` and not dropped until 45
lines later. Every gate stayed green because a fresh database has no builtin rows, so the failing insert was
a no-op. Its test passed because the test **hand-wrote its own version of the pre-migration schema** and
made `team_id` nullable — every other column matched; the one that differed was the one the migration
depended on. The test now migrates through the real journalled migrations and replays the real files
forward, so it cannot drift again. **A hand-written stand-in for the thing under test proves nothing.**

**A column with no writer.** The belonging field, its constraint and its reader all shipped; nothing ever
wrote it. Type-checking and 8,000 tests could not see it because the column is nullable and nothing asserted
it was populated. It was found by registering a human on the running app and looking at the response.

**A live double-fire, pre-existing and now fixed.** `builtin:post-bet-retro` is seeded as an event routine,
so the boot-time list subscribed it *and* the builtin handler subscribed it — both on the same bus, eleven
lines apart. Every bet state change ran the in-process retro and started a generic agent session on top. The
clock path had a guard, the manual path had one restored after an earlier pass lost it; the event path never
had one. The matcher now excludes builtins.

**An assertion that could never fail.** The completeness check protecting the subscription set was typed so
that it collapsed to `never` unconditionally. It is now genuinely red-able, and was **watched failing** —
delete an entry, `npm run check` fails naming it, restore. An assertion nobody has seen fail is
indistinguishable from one that cannot.

**Five event vocabularies, not two.** Beyond the domain union and the six-name trigger list, there are a
schedule-label map, a settings map, and a complete byte-for-byte duplicate union in
`framework/domain-model/src/events.ts` — which, because that package is reachable by everyone, is the copy
`core-ui` is allowed to import. This work removed the six-name list and the two maps; the duplicate union
remains and is proposed as an AU row.

---

## Known limitations and accepted residuals

Each of these is deliberate. None blocks merge; all outlive this run.

- **Cut 3 cannot see agent-caused loops** (above). Accepted by ruling.
- **Freshly provisioned builtins leave `event_type` null.** Harmless mechanically — the matcher excludes
  builtins — but the schedule label reads from that column, so `Post-bet retro` renders as **"On event"**
  rather than naming its event. The one builtin that fires on an event is the one that cannot say which.
- **A custom cron renders as the bare word "Calendar."** Presets humanise; a custom expression falls
  through to the trigger type.
- **The create dialog is reachable only from a team page and offers only that team's agents.** So a routine
  owned by an individual or team-less agent — the case the nullable-team work exists for — cannot be
  authored in the UI. Judged out of proportion for this pass and recorded in a `@lore` rather than left
  unmentioned.
- **The double-fire guard is not tested with the full scheduler running**, and two acceptance criteria
  ("several matches", "no match") have only indirect coverage.
- **No run row records which event instance triggered it.** A person can see what a routine fires *on*, not
  which occurrence fired it. One nullable column would fix it; out of scope, since the criterion was "has it
  ever fired".
- **`endSessionByCas` emits no origin fields.** Zero production callers, so theoretical today. AU's rubble.
- **~10 consumers of the `ast-<user-id>` id convention remain.** BA1 adds and populates the real field;
  rewriting those readers is BA7's.

---

## Cross-package consequences

- **BA7** needs exactly the belonging field this added, to answer which agents are a given human's.
  It is added and populated here — do not add a second one. The invite/login-session symbols it will remove
  are still deliberately standing.
- **BA8** — once this lands, all five of its events are attachable, because a routine can name any of the
  34. Shipping BA8 first would mean five announcements nothing can attach to; choose the order deliberately.
- **BA9** — the plugin contributes **routines**, not triggers (`CONFIGURATION_KINDS` already carries a
  `routine` kind). Its per-team duplication of global sweeps is fixed here at its cause, and its proof no
  longer needs a restart step: an installed routine matches on the next event.

---

## Acceptance criteria

- A configured rule against something that happens causes the agent it names to run, with the prompt it
  specifies.
- When several rules match the same occurrence, the outcome is defined and repeatable rather than arbitrary.
- When none matches, the default eligible agent runs exactly as it does today.
- One naming a missing agent surfaces as a visible failure to whoever configured it.
- A person can tell, from the product, whether it has ever fired.

## How each was proven

Gates, unpiped: `npm run check` 0 (39 packages) · `npm run lint` 0 · `npx vitest run` 0 (536 files, 5 740
tests) · `npm run test:integration:service` 0 (292 files, 2 358 tests).

**On the running app**, twice — once through the HTTP API, once through the interface:

| what | how |
|---|---|
| A routine created **after startup** fires | created in the New routine dialog, then fired — no restart |
| The clock path still works | custom-cron routine created in the dialog, fired on the tick |
| The event path works | routine on `knowledge_created`, fired seconds after a knowledge item was written in the UI |
| Pause takes effect on the next event | paused, event re-emitted, no second run |
| The vocabulary really collapsed | the dialog's event picker offers **34**, `bet_state_changed` among them |
| `.strict()` rejects rather than strips | posting a removed field, or `teamId`, returns 400 |
| Belonging is written | a newly registered human's assistant carries `ownerUserId` |
| **The upgrade path** | a real pre-BA1 database — every real journalled migration, seeded with two teams and their per-team builtins — upgraded cleanly: 7 routine rows to 4, globals deduped, the per-team retro keeping its team with its event name lifted out of the blob |

**What the rendered output showed**, read from the live DOM rather than filed as images — no screenshots are
committed, per the standing rule that visual evidence in this repo is text, not PNGs:

- The team's routine list, after both UI-created routines had fired:
  `UI event routine · On knowledge created · just now` and `UI timer routine · Calendar · just now`,
  against the four builtins still reading `Never`.
- The three global builtins carry unsuffixed ids (`builtin:knowledge-decay`, `builtin:knowledge-promotion`,
  `builtin:portfolio-retro`) while `builtin:post-bet-retro:<teamId>` stays team-suffixed — D7's
  global-versus-per-team split, visible in the hrefs.
- The New routine dialog renders `Name`, a **Prompt** field placeheld *"Instruction for the agent when this
  routine fires"*, an owning-agent picker, and a **When** control offering *On a schedule* / *On an event* —
  with no team picker. Selecting *On an event* replaces the schedule control with an event picker whose
  option list is exactly 34 entries and includes `bet_state_changed` and `team_created`.
- The routine detail page for an event routine renders the field as **PROMPT**, the schedule as
  *"On bet state changed"* rather than a bare "On event", **TRIGGER TYPE** as *Event*, **NEXT RUN** as
  *"On next event"*, and **no cron control at all**. Its owning agent is an individual, team-less assistant —
  the nullable-team case, end to end.

**Trap for whoever verifies this next:** the routine route is singular — `/work/routine/:routineId`. The
plural path renders the "Page not found" card, and the architecture's own verification section cited the
plural form. Anyone following it verbatim, without reading what came back, would have filed a 404 as proof.

---

## Constraints that still bind

- No new runtime path for a routine-triggered run. It is an ordinary agent run; the routine decides which
  agent and what prompt, nothing more.
- When nothing matches, behaviour is unchanged — the default eligible agent, no event-specific prompt.
- A routine naming a missing agent fails visibly to whoever configured it, never silently.

**Out of scope.** A plugin distribution mechanism. New event types or emitting facts that do not announce
themselves (BA8). Conditional or chained routines. Signing humans in (BA7). The plugin install path (BA9).
