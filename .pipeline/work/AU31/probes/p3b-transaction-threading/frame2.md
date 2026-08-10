# Frame 2 — does a callee pass the transaction handle on again?

`find-tx-threaded-calls.mjs` answers one question: which calls receive the transaction handle as
their first argument. That is a single frame. A callee can take the handle and pass it on, so a
seam call can sit one frame further down and the first sweep would not name it.

This second frame was originally done by hand and left unrecorded, which meant the next reader had
to redo it to trust the inventory. Redoing it is also what surfaced the two hoisted routine reads.
It is recorded here so nobody repeats it.

## Re-run it

```
node .pipeline/work/AU31/probes/p3b-transaction-threading/find-frame2-forwarding.mjs
```

from the repository root. Recorded run: `frame2-output.txt`. The inventory itself is unchanged —
9 cross-boundary transactions, 10 orchestration writes (`architecture.md` §3.1).

## What was checked, and over what set

**Part 1 — which files can name an orchestration function at all.** Every production file under
`layers/core-api/` that imports one of the eight agent-orchestration packages. Result: **23 files,
all of them inside `layers/core-api/src/`.** No core *service* package (`work/`, `policy/`,
`routine/`, `review/`, `knowledge/`, `users/`, `settings/`, `org/`, `conversation/`) imports an
orchestration package. So a service-package callee can only reach the seam through a function
handed to it — which reduces the whole second frame to two things: the calls a callee makes with
its own executor, and the provenance of any injected dependency among them. The script hard-fails
if this scan matches nothing, because a guard that quietly matches zero files reads as passing
forever.

**Part 2 — the onward hop, for all 56 callees the first frame reported.** 29 are plain names, 27
are injected (`deps.x.y`) forms. For each plain name the script finds the production definition
(following an `import { create as createKnowledgeItem }` alias when the local name has no
definition of its own), brace-matches the body, and applies the same first-argument rule to find
every call that receives that function's own executor. For the injected forms there is no
definition to find by name; those are resolved at the composition root, which is the manual step
the README already describes and §3.1 records per site.

The script is deliberately over-inclusive: an alias like `get` or `list` matches several unrelated
functions, so the output carries extra candidates (including one `core-ui` hook whose body it
cannot parse). Over-reporting is safe here — the question is whether anything reaching
orchestration is *missed*.

## Result

Across every frame-2 body, the distinct onward callees receiving an executor are:

`assembleSessionKnowledge`, `bakeTaskContextBundle`, `deps.agentSelection.isAtCapacity`,
`deps.getTaskById`, `deps.readServerConfig`, `deps.requireRunnableAgent`,
`deps.resolveOrCreateCallingThread`, `findMessage`, `findProposedCall`, `get`, `getBetById`,
`getItemForTransition`, `getProjectionRow`, `getRoutine`, `getRoutineRun`, `getTeamById`,
`insertIntentInternal`, `insertRequestInternal`, `insertStartInternal`, `insertUser`,
`listMessages`, `readServerConfig`, `resolveOrCreateCallingThread`, `taskDispatchAttemptStore.get`,
`upsertProjectionLayer`, `work.get`.

**Exactly one of them reaches agent-orchestration:**
`resolveRoutineRunRequest` (`layers/core-api/routine/src/routine-service.ts:352`) calls
`deps.agentSelection.isAtCapacity(db, …)` at `:366`, wired at
`routine-scheduler-bindings.ts:152-153` to `isAgentAtCapacity` with `concurrencyBoundReader` — the
`sessions` read plus the `agent_run_config` read inside it. That is the pair §3.1 hoists above the
transaction. Nothing else in the second frame crosses.

The rest resolve as follows:

- **Core-owned by package, no crossing possible.** `assembleSessionKnowledge`,
  `bakeTaskContextBundle`, `findMessage`, `findProposedCall`, `getBetById`, `getItemForTransition`,
  `getProjectionRow`, `getRoutine`, `getRoutineRun`, `getTeamById`, `insertUser`, `listMessages`,
  `readServerConfig`, `resolveOrCreateCallingThread`, `upsertProjectionLayer`, `work.get`,
  `taskDispatchAttemptStore.get`, and the aliased knowledge-repository entry points (`get`,
  `list`, `create`, `update`, `transition`) — all live in core service packages, which Part 1 shows
  import no orchestration package.
- **Injected, resolved at the composition root, core-owned.** `deps.requireRunnableAgent` is
  `@hyperidle/users`' `requireRunnableAgent` (`routine-scheduler-bindings.ts:164`,
  `task-run-resolver-bindings.ts:23`, `service-bootstrap.ts:471`);
  `deps.readServerConfig` is `@hyperidle/settings` (`routine-scheduler-bindings.ts:143-150`);
  `deps.resolveOrCreateCallingThread` is core's own thread resolver
  (`knowledge.ts:928`); `deps.getTaskById` binds to `@hyperidle/work`'s
  `work.get(exec, "task", id)` (`service-bootstrap.ts:226`, `policy-bindings.ts:48`,
  `agent-run-admission-reactions.ts:118`).
- **Orchestration-internal, so not a crossing.** `insertIntentInternal`,
  `insertRequestInternal`, `insertStartInternal` are private helpers inside
  `layers/agent-orchestration/session-requests/src/service.ts`, reached from that package's own
  transactions (`service.ts:874`, `:1022`) — already recorded as orchestration-only in §3.1.
- **One unresolved name, and why it does not matter.** `createRequest` (reported inside
  `session-requests/src/service.ts:874`) has no definition or alias the script can find by name.
  That transaction is orchestration-owned end to end, so whatever `createRequest` forwards stays
  inside the layer.

## Verdict

The second frame adds **one** finding to the first: the two orchestration reads on the routine
path. It adds no write. The nine-transaction / ten-write inventory stands.
