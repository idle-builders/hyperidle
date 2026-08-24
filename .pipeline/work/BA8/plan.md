# BA8 — Things that happen announce themselves

## Work package

**Outcome.** Five facts the system already recognises actually announce themselves when they occur, so a
plugin or a person can hang a trigger on them. Today each is a named, typed, dispatcher-handled event
that nothing ever emits.

**Why this matters.** Everything launching an event is how this product is extended: plugins and people
attach their own actions to what happens. An event that is declared but never fired is a promise the
extension surface does not keep — someone builds a trigger against it and it never runs, with no error
to explain why. Because listeners can live outside this repository, nobody inside it notices.

**What exists today.** Five event types are defined and cased in the dispatcher with no emitter
anywhere: a dependency being met, a bet being revised, a thread being archived, work selection being
requested, and a proposed call being executed. Four of the five describe facts that already occur in
code and simply go unannounced. The fifth does not: **thread archiving does not exist** — there is no
archive column and no route — so that event describes an operation that was typed and never built.

**Missing delta.** Emit the four facts that already happen at the points where they happen, and build
thread archiving so the fifth has a fact to announce.

**Cross-reference (measured 2026-08-24, BA9 refinement).** Emitting is necessary and not sufficient. A
trigger rule may name only **6** event types (`TRIGGER_EVENT_TYPES`, `framework/domain-model/src/trigger.ts`)
against the bus's **33**, and of this package's five, only `proposed_call.granted` is adjacent to that
list — the other four cannot be named by a trigger even after they fire. The vocabulary is BA1's to
settle; note it here so this package does not ship five announcements nobody can attach to and call the
extension surface kept.

**Depends on.**
- BA2 — the proposed-call-executed fact only occurs once the approval loop runs; emitting it is part of
  wiring that loop.
- BA6 — the dependency-met fact only occurs once dependencies have a writer and the watcher matches
  real rows.

**Complexity.** M

**Engineering tier.** mvp

**Pre-build.** Not required for the four emissions. Thread archiving is a small user-facing addition and
should follow the existing thread-resolution pattern rather than inventing one.

**Constraints.**
- An event must be emitted where the fact becomes true, not where it is convenient. An announcement that
  fires without the fact having happened is worse than silence — one such false emission already exists
  in the code, firing with a fabricated identifier for a row that does not exist.
- Bet revision announces every revised field, not only one.

**Out of scope.** New event types. A plugin that consumes these events. Changing how subscriptions work.
Retrofitting events onto facts not named here.

## Acceptance criteria

- When a task's dependencies are met, that fact is announced.
- When any field of a bet is revised, that fact is announced.
- When a proposed call is executed, that fact is announced.
- When work selection is requested, that fact is announced.
- A thread can be archived, and archiving one announces that fact.
- No announcement fires for a fact that did not occur.

## Validation scenarios

- Given a task whose last dependency finishes, when it stops waiting, then the dependency-met
  announcement carries that task and the task that completed.
- Given a bet whose owner changes a field other than its done condition, when the change is saved, then
  the bet-revised announcement fires.
- Given a thread, when someone archives it, then it is archived and the archived announcement fires.
