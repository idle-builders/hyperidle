# BC1 — Delete: 22 routes, 8 events, the attention engine, the stale events fork, dead controls

## What we need

**Why this exists.** Every later item has less to move. The founder wants the surface reduced; 22 routes, 8 events, 14 dead UI controls and an entire scoring engine were judged by the audit to have no user, no reader, or no place in the contract (`plans/reviews/ACTIONS.md` § delete, § events). Leaving them in means migrating them.

**What exists today.** The 22 routes are listed with reasons in `ACTIONS.md`. Five of the eight events already have no emitter and exist only in type unions; `knowledge_accessed`, `routine_fired` and `notification` are live (`notification` must stay until BC5 because the queue listens to it). The attention engine is `layers/core-api/knowledge/src/attention-*.ts` + `scoring-config.ts` + the `score_attention` tool + the `attention_score` projection column; it is also one of four weights in the context assembler's relevance formula and is called by the promotion pipeline. `framework/domain-model/src/events.ts` is a stale fork of `framework/event-bus/src/events.ts`; `tools/trace/trace-lib.ts` reads the stale one. `work-state-push-gateway.ts` broadcasts to zero listeners. Dead controls: `plans/reviews/census/ui-actions.md`.

**Missing delta.** All of the above removed, in one change, with a governance rule that names every deleted route, tool and event and fails if one returns. The attention term is removed from the context assembler (a keep) by deleting one weight and one call.

**Depends on.** None.

**Dials (provisional).** complexity: feature · ambiguity: established context · exposure: internal detail

## How it works

## How we work on this

## Confusions

## Proposed items
