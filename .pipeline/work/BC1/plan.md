# BC1 — Delete: 22 routes, 8 events, the attention engine, the stale events fork, dead controls

## What we need

**Why this exists.** Every later item has less to move. The founder wants the surface reduced; 22 routes, 8 events, 14 dead UI controls and an entire scoring engine were judged by the audit to have no user, no reader, or no place in the contract (`plans/reviews/ACTIONS.md` § delete, § events). Leaving them in means migrating them.

**What exists today.** The 22 routes are listed with reasons in `ACTIONS.md`. Five of the eight events already have no emitter and exist only in type unions; `knowledge_accessed`, `routine_fired` and `notification` are live (`notification` must stay until BC5 because the queue listens to it). The attention engine is `layers/core-api/knowledge/src/attention-*.ts` + `scoring-config.ts` + the `score_attention` tool + the `attention_score` projection column; it is also one of four weights in the context assembler's relevance formula and is called by the promotion pipeline. `framework/domain-model/src/events.ts` is a stale fork of `framework/event-bus/src/events.ts`; `tools/trace/trace-lib.ts` reads the stale one. `work-state-push-gateway.ts` broadcasts to zero listeners. Dead controls: `plans/reviews/census/ui-actions.md`.

**Missing delta.** All of the above removed, in one change, with a governance rule that names every deleted route, tool and event and fails if one returns. The attention term is removed from the context assembler (a keep) by deleting one weight and one call.

**Depends on.** None.

**Dials (provisional).** complexity: feature · ambiguity: established context · exposure: internal detail

## How it works

One change, nothing new. Every deletion below was ruled by the founder in `plans/reviews/ACTIONS.md`.

**Routes.** The 22 routes go together with whatever only they called: the two coach/hints handlers
and their table; the inbox rollup and the items marker lookup; the two attention routes; sweep;
triage-count; the eight team/org seams and the scaffold request; the two notification-config
routes; the two run-count routes. Where a UI control called one of them, the control goes too (the
triage badge, the org-chart team editor, the settings notification-config form). Where a tool called
one (`score_attention`, `run_knowledge_sweep`), the tool goes.

**Events.** Five of the eight are already dead — nothing emits them; they are removed from the type
union and the list. `knowledge_accessed` stops being emitted from the knowledge read route.
`routine_fired` stops being emitted by the scheduler; nothing subscribes to it. `notification`
stays alive in this item on purpose: the notification queue is built on it and is replaced whole in
BC5. Removing it here would mean rewiring the queue twice.

**The attention engine.** The scorer, the classifier, the recompute service, the attention half of
the scoring config, the projection column, and the tool. Two places outside the engine touch it:
the context assembler multiplies one of its four relevance weights by the attention score, and the
promotion pipeline recomputes scores before promoting. Both lose that one term. The assembler keeps
its other three weights; the promotion pipeline promotes without scoring first. Nothing else in
context assembly changes — it is a deliberate keep.

**The stale events fork.** `framework/domain-model/src/events.ts` duplicates the event-bus file and
is read by nothing except the trace tool. It goes; the trace tool is pointed at the real file. The
one type still exported from it (`SessionOutcome`) moves next to its only consumer.

**Dead controls and dead push.** The controls that render and do nothing are removed. The work-state
push gateway broadcasts to a topic no screen subscribes to; it goes.

**The rule.** A governance rule lists every deleted route path, tool name and event name and fails
if one appears in the production tree again. Same shape as the existing
`artifact-is-not-a-storage-concept` rule: symbols, not words.

**Why first.** Everything after this item moves code. Less code to move, and the rule's plumbing
list becomes the real sixteen before BC2's lint rule is written against it.

**Left simple.** Migrations drop the two tables and the column outright — no backfill, nothing reads
them. If a later item needs the attention history it is in git.

## How we work on this

## Confusions

## Proposed items
