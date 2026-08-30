# BA1 — One routine primitive: what fires, what it runs, and who it belongs to

**Status: built, reviewed, approved, proven on the running app. Awaiting merge.**

## What this is

**Outcome.** Someone writes down "when this happens, run that agent with this prompt" and it
happens. The product presented a working-looking control surface that did nothing: the Triggers tab
accepted, saved and displayed rules no code ever read. Extension-by-configuration is the premise of
the plugin idea, so this had to be real before BA9 or AY2 could stand on it.

**The reversal refinement produced.** Registered as "build the missing read path for the
trigger-rule entity", the decision came out the opposite way: **the entity retires and routines
absorb it.** The product had two ways to say one sentence: a trigger rule with a settings tab, six
event names and no reader, and a routine with an event trigger that subscribed to all 34 event types
and fired.

## Founder rulings (binding — do not re-litigate)

1. **A routine is the umbrella noun**, firing on a clock or an event; the "trigger" primitive is the
   event-fired case of one. It **carries a prompt, not a skill** — the prompt can reference a skill
   and the agent reaches it.
2. **Scope comes from the owning agent, never from the routine.** An agent belongs to a team, a
   person, or neither, as a real field on the agent row; the org map draws from it rather than
   storing it.
3. **Delete all trigger data**, with no migration path — *"no relevant instances exist"* — and **no
   caching, no restart**: *"routines should always be loaded from database when needed."*
4. **No loop prevention of any kind.** All 34 event types stay authorable: no allow-list, no depth
   bound, no cycle detection, no rate limit. *"This is not a deterministic system, it has an AI in
   the middle. So loops in AI systems are unavoidable and sometimes even wanted."* The one permitted
   cut is narrow — a routine's own run must not directly re-trigger **that same routine**. Anything
   wider, or any mechanism amounting to loop prevention under another name, is a regression.

## As built

**One primitive.** `registerRoutineEventMatcher` replaces the boot-time `registerEventTriggers`: one
handler per event type, subscribed from `EVENT_TYPES`, a compile-time constant with a completeness
assertion so the subscription set cannot go stale — deriving it from anything mutable is how the
original defect happened.

**The database is the source of truth at fire time.** Matching routines are read when the event
happens, which forced the event name out of the `trigger_config` blob into a real `event_type`
column with a partial index — you cannot index a field inside a blob. The predicate deliberately
excludes the paused flag so pausing and resuming does not churn it, and pause and delete then take
effect on the next event for free.

**The narrow self-trigger cut, and its limits.** `originRoutineId` resolves an event's origin three
ways — a direct field, a correlation field, or one primary-key read on `routine_runs` — and
otherwise returns null, **failing open**. Both source-kind spellings are pinned as type-level
constants so a rename in either union breaks the build at the predicate; a bare string comparison
created the original bug. Origin is recoverable for events the routine machinery emits and **not**
for events an agent's own actions cause, so a routine whose agent edits a bet re-triggers itself
invisibly — accepted by ruling, since closing it means reshaping event contracts.

**Visible failure, and the entity's removal.** Two causes previously shared one error class, so a
paused routine would have been marked broken; a `reason` field discriminates them, and only a
genuinely unrunnable agent writes a terminal error run. The trigger entity is gone with its
`CONFIGURATION_KINDS` member, its check constraint and the settings surface, and create/update
schemas are `.strict()` so a stray field returns 400 rather than being silently stripped — without
that the removal would have been cosmetic. **Belonging** is `users.owner_user_id` plus a
`users_belonging_ck` constraint, written at registration.

## What went wrong on the way

**A migration that passed its own test and broke every real upgrade.** `0060` inserted a replacement
row omitting `team_id` while that column was still `NOT NULL`. Every gate stayed green because a
fresh database has no builtin rows, so the failing insert was a no-op — and its test passed because
it **hand-wrote its own pre-migration schema** with `team_id` nullable. **A hand-written stand-in
for the thing under test proves nothing.**

**A column with no writer.** The belonging field, its constraint and its reader all shipped; nothing
wrote it. Type-checking and 8,000 tests could not see it: the column is nullable and nothing
asserted it was populated.

**A live double-fire.** `builtin:post-bet-retro` is seeded as an event routine, so the boot-time
list and the builtin handler both subscribed it on the same bus — every bet state change ran the
in-process retro plus a generic agent session on top — the clock and manual paths had guards, the
event path never did.

## Known limitations

- **Freshly provisioned builtins leave `event_type` null**, so `Post-bet retro` renders as "On
  event"; a custom cron likewise renders as the bare word "Calendar".
- **The create dialog is reachable only from a team page and offers only that team's agents**, so a
  routine owned by an individual or team-less agent — the case the nullable-team work exists for —
  cannot be authored in the UI.
- **~10 consumers of the `ast-<user-id>` id convention remain.** BA1 populates the real field;
  rewriting those readers is BA7's.

**Cross-package.** **BA7** needs exactly the belonging field this added — do not add a second one.
**BA8**: once this lands all five of its events are attachable. BA9d later found this plan's claim
that per-team duplication of global sweeps was fixed here to be **wrong** — that guarantee came from
a `scope` field on the builtin specs.

## Acceptance criteria

A configured rule causes the agent it names to run with the prompt it specifies; when several match
the outcome is defined and repeatable; when none matches the default eligible agent runs as today;
one naming a missing agent fails visibly; and a person can tell whether it has ever fired. **Out of
scope:** plugin distribution, new event types (BA8), conditional or chained routines, BA7 and BA9.
