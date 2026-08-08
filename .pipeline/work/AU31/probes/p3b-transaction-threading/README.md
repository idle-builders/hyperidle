# P3b — the transaction-threading sweep (replaces P3's name-based grep)

P3 concluded there were "exactly two" cross-boundary transactional pairs. That conclusion was
wrong, and it was wrong because of the method, not a slip: P3 searched for the literal spellings
`enqueueWorkIntent(`, `createSessionRequest(`, `agentWorkIntentRecorder.record(` and
`tx as HyperIdleDb` inside `layers/core-api/src`. Most of these sites never write any of those
names — the orchestration function arrives as an injected dependency (`deps.workIntents.record(tx, …)`)
in a file that does not import the orchestration package at all — and several of them open their
transaction one or two frames below the call site that a reader inspects.

## What this probe does

It keys on the transaction handle instead of on a name. A write can only run inside a transaction
if the handle reached it, so enumerating the handle's reach is complete by construction.

1. Find every `.transaction(` in the shipping roots (`layers/`, `framework/`, `applications/`),
   production files only (test/spec and `__*__` paths excluded).
2. Brace-match the callback body. (The callback's return-type annotation can contain a `{`, so the
   match starts after the `=>`, not at the first brace — getting this wrong silently drops
   `task-state-machine.ts`, which is one of the sites P3 missed.)
3. Collect every local alias of the handle inside the body (`const knowledgeDb = tx as HyperIdleDb`).
4. Report every call whose first argument is the handle or one of its aliases, with the callee
   expression as written — so `deps.workIntents.record` is reported exactly as it appears.

Callbacks with an expression body (no braces) are reported as needing a manual read; there are
**four** — three are matches inside comments (`work-service.ts:12`, `attention-service.ts:21`,
`write-executor.ts:5`) and the fourth (`session-requests/src/service.ts:609`) is an
orchestration-internal call.

## Run it

```
node .pipeline/work/AU31/probes/p3b-transaction-threading/find-tx-threaded-calls.mjs
```

from the repository root. `output.txt` is the recorded run at base `d96bcdcf`.

## Reading the output

**A body with zero threaded calls prints nothing** (`find-tx-threaded-calls.mjs:97-101` only emits a
block when there is at least one hit), so in `output.txt` a genuinely clean body and a body the
brace-matcher failed on look the same. Four bodies are silent for the clean reason and were read by
hand: `knowledge-repository.ts:407,:1244` and `promotion-pipeline.ts:378,:602`, all inline
`tx.select/update/insert` with no callee at all. If you re-run this, add a "0 threaded calls" line
per body or compare the number of `.transaction(` matches against the number of printed blocks —
do not read silence as clean.

The script reports where the handle goes; it does not know which package owns the callee. That
second step is manual and short: for each reported callee, resolve the implementation — following
an injected port to the composition root that wires it (`policy-bindings.ts`,
`routine-scheduler-bindings.ts`, `service-bootstrap.ts`, `threads.ts`'s inline wiring). Ten of the
25 reported bodies reach an `agent-orchestration` write; the corrected inventory is
`architecture.md` §3.1.

## The second frame

A callee can take the handle and pass it on, so a seam call can sit one frame below what this script
reports. That frame is checked in `find-frame2-forwarding.mjs` (recorded run `frame2-output.txt`,
write-up `frame2.md`): it lists which production core-api files can name an orchestration function at
all, then re-applies the first-argument rule inside every callee this script reported. Exactly one
frame-2 call reaches orchestration — `resolveRoutineRunRequest`'s
`deps.agentSelection.isAtCapacity` — and it is a read, not a write.

The same sweep also answers the read question, which P3 never asked: a seam call from inside an
open transaction deadlocks the shared PGlite connection whether it reads or writes, so the
in-transaction *reads* of orchestration state matter too. There are two, both in the routine path
(`isAgentAtCapacity` and, inside it, `readAgentRunConfig` — wired at
`routine-scheduler-bindings.ts:153,:159` through `concurrencyBoundReader`, reached from
`resolveRoutineRunRequest` at `routine-scheduler.ts:606`).
