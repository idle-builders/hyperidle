# work-intent-port — destroyer verdict (framework)

## Where does this package go?

**Verdict: DISSOLVE → `framework/domain-model`**

This package is one source file (361 lines) declaring the payload family of the core→orchestration
work-intent seam — and that family is already scattered across four packages:

1. `framework/work-intent-port` — the "canonical" copy (this package).
2. `framework/domain-model` — owns `AGENT_WORK_INTENT_KINDS` (`src/events.ts:14`), the runtime kind
   list this package's union discriminant is built from. This package's own doc comment
   (`agent-work-intent-recorder.ts:286`) says "see `AGENT_WORK_INTENT_KINDS` **below**" — the const
   isn't below, it's in a different package. The doc is lying because the family was split.
3. `framework/api-contract` — `AgentOrchestrationWorkIntentInput`/`AgentOrchestrationWorkIntentKind`
   (`agent-orchestration-port.ts:130-150`), a hand-typed structural mirror of
   `AgentWorkIntentRecorderInput` with `bakedRequest: unknown`, "duck-type compatible on purpose".
4. `layers/agent-orchestration/session-requests` — the ACTUAL owner of `agent_work_intents` does
   **not import this package at all**. `service.ts:1363-1400+` keeps local mirrors of
   `BakedContextKnowledgeItem` and `BakedContextBundle` with comments pointing back here
   ("local mirror — see `@hyperidle/work-intent-port`").

A "port" package whose one real implementation side refuses to import it and mirrors it instead is
not a shared contract — it is a shrine. The smoking gun for the dissolve target:
`domain-model/src/__tests__/agent-work-intent-recorder.test.ts` imports
`AgentWorkIntentRecorderInput` from this package to pin it against domain-model's own
`AGENT_WORK_INTENT_KINDS` — domain-model carries a devDependency **back-edge** on this package
purely to test one half of a declaration family against the other half. Put them in the same file
and the back-edge, the cross-package test reach, and the lying doc comment all disappear.

Feasibility is total: this package's only dependency is `@hyperidle/domain-model` (it already
imports `AgentSessionSourceKind`/`AgentSessionSourceCorrelation`/`UserRole` from there), and every
one of its 11 production consumers — session-requests, run-orchestration, harness-protocol,
routine, work, review, policy, knowledge, conversation, core-api/src, tools/eval — **already
depends on domain-model**. The move adds zero edges and deletes a package plus a dev back-edge.

Why not the other targets:
- **→ `session-requests`** (the implementing service): impossible — core-api emitters may not
  import an orchestration service; that direction rule is the one real thing the seam enforces.
- **→ `api-contract`**: its convention is zero-dep hand-typed mirrors with opaque `unknown`
  payloads; the baked shapes are domain content, not wire mirrors. And harness-protocol importing
  api-contract for `BakedContextBundle` would be a worse edge than the domain-model one it has.
- **→ inline**: 11 production consumers on both sides of a seam neither may cross. Inlining is
  exactly the disease already visible — two mirrors exist. STAYS SHARED is true of the *types*,
  but not of the *package*: shared types do not earn a package when a shared package that every
  consumer already imports sits right next to them holding the other half of the same family.

The AU31 reshape also hollowed the port's founding story. The package header
(`agent-work-intent-recorder.ts:11-19`) justifies the `TTx` generic with "the write must stay
atomic with the caller's own insert" and "the real concrete recorder (`enqueueWorkIntent`) is
assigned unchanged — no adapter needed." Both claims are now false: the only production
implementation is `buildSeamBackedWorkIntentRecorder` (`agent-orchestration-port-composition.ts:465`),
whose `record` **ignores the executor it is handed** (`_tx`) and does an HTTP round trip
(`port.intents.submit(input)`), with cross-layer atomicity explicitly relinquished (AU31 §3.1).
The port's one load-bearing parameter is a vestigial lie that makes every call site
(`threads.ts:1520 record(db, …)`, work's `AgentWorkIntentRecorder<WriteExecutor>` ports) look
transactional when it is not.

## Consumers (measured, not assumed)

`rg -a -l "@hyperidle/work-intent-port"` — 11 production consumers + 5 test files:

| Consumer | What it imports | Could it own this? |
|---|---|---|
| `layers/core-api/src` (threads.ts, sessions-routes.ts, app.ts, policy-bindings.ts, agent-orchestration-port-composition.ts) | `AgentWorkIntentRecorder`, `AgentWorkIntentRecorderInput`, `BakedWorkIntentRequest` | No — emit side, but orchestration must see the same types |
| `layers/core-api/conversation` | `bakeAgentRunnableConfig`, `BakedAgentRunnableConfig` | No |
| `layers/core-api/work` (ports, session-start-resolver, task-run-resolver, task-state-machine) | recorder type, both bakers, `BakedWorkIntentRequest`, baked types | No |
| `layers/core-api/review` (ports, proposed-call-workflow) | recorder type, both bakers, baked types | No |
| `layers/core-api/knowledge` | both bakers, `BakedAgentRunnableConfig`, `BakedContextBundle` | No |
| `layers/core-api/routine` (routine-service, ports) | both bakers, `BakedWorkIntentRequest`, `SessionKnowledgeItemLike` | No |
| `layers/core-api/policy` (ports) | `BakedWorkIntentRequest` | No |
| `layers/agent-orchestration/run-orchestration` (runtime, context, provisioner) | `BakedAgentRunnableConfig`, `BakedContextBundle`, `BakedContextKnowledgeItem` | No — consume side |
| `layers/agent-orchestration/session-requests` | **nothing** — comment references only; keeps local mirrors | It owns the table but can't be imported by core |
| `framework/harness-protocol` | `BakedAgentRunnableConfig`, `BakedContextBundle` | No — already imports domain-model |
| `tools/eval` | `bakeAgentRunnableConfig` | No |

Genuinely multi-consumer, both sides of a layering seam → the **types** stay shared; the
**package** dies into domain-model, which every consumer above already imports.

## If written today, from scratch

One file in `framework/domain-model` (e.g. `src/work-intent.ts`), sitting next to
`AGENT_WORK_INTENT_KINDS`:

- `BakedWorkIntentRequest`, `BakedAgentRunnableConfig`, `BakedContextBundle`,
  `BakedContextKnowledgeItem` (absorbing `SessionKnowledgeItemLike`)
- `AgentWorkIntentRecorderInput` — derived from a kind→sourceKind table instead of six copy-pasted
  54-line union members that differ only in two string literals
- `bakeAgentRunnableConfig`, `toBakedContextKnowledgeItems`
- **No recorder interface, no reader interface.** Emitters inject a function
  `(input: AgentWorkIntentRecorderInput) => Promise<{ id; idempotencyKey }>` — which is exactly
  what `AgentOrchestrationPort.intents.submit` already is.

Package `framework/work-intent-port`: deleted.

## Kill summary

| Verdict | Count |
|---|---|
| DELETE | 2 |
| MERGE | 1 |
| SIMPLIFY | 1 |
| KEEP | 6 |

Surface: 10 exports → 7 surviving symbols (30% export cut) — and **1 package → 0 packages**,
plus two out-of-package mirror declarations (`session-requests`' local `BakedContextBundle` /
`BakedContextKnowledgeItem`) and two cross-package pin tests die as collateral.

## Feature-level kills

**The DI-port fiction.** `AgentWorkIntentRecorder<TTx>` + `AgentWorkIntentReader<TDb>` are ports
with, respectively, one implementation and zero implementations. The recorder's generic `tx`
parameter is ignored by its only production implementation (post-AU31 the seam is an HTTP call;
atomicity was formally relinquished), so every `record(db, …)` / `record(tx, …)` call site is
cosplay. The reader (`findByKindAndSource`) matches **nowhere** in the repo outside this package —
zero implementations, zero callers, kept alive only by two stale `@lore` comments
(`sessions-routes.ts:100`, `durable-agent-queue.ts:39`). What breaks when both die: nothing at
runtime. Call sites retype their injected dep as the plain submit-function; the two
`agent-work-intent-recorder-shared-type.test.ts` pin tests (work, review) are deleted with the
type they pin.

## Full export audit

| # | Export | Kind | Reach | Verdict | Reason |
|---|---|---|---|---|---|
| 1 | `bakeAgentRunnableConfig` | function | UI:POST /api/threads/:id/messages, /api/tasks/:id/transition, /api/knowledge/:id/flag, /api/routines/:id/trigger, /api/sessions/, /api/reviews/proposed-calls/* (7 production callers incl. tools/eval) | KEEP | Real credential-leak guard: whitelist-picks 4 fields off a full `User` row so name/avatar/credentials never ride into persisted `payloadJson`. Moves to domain-model. |
| 2 | `toBakedContextKnowledgeItems` | function | UI: same resolver doors (task-run, knowledge-action, routine, proposed-call — 4 production callers) | KEEP | One shared field-pick + `layer ?? null` normalize instead of 4 reimplementations. Moves to domain-model. |
| 3 | `BakedWorkIntentRequest` | interface | UI/SCHED: every intent-emitting door (15 UI doors, 2 timers via `enqueueWorkIntent` trace) | KEEP | The seam payload itself — the thing that makes orchestration a zero-read blind executor. Moves to domain-model. |
| 4 | `BakedAgentRunnableConfig` | interface | UI/SCHED: all emitters + run-orchestration `admitSession` + harness-protocol | KEEP | Consumed on both sides of the seam plus harness-protocol. Moves to domain-model. |
| 5 | `BakedContextKnowledgeItem` | interface | UI/SCHED: emitters + run-orchestration `context.ts` | KEEP | Bundle member read on the consume side. Moves; `session-requests`' local mirror of it dies. |
| 6 | `SessionKnowledgeItemLike` | interface | INTERNAL + routine/ports.ts (types the injected `assembleSessionKnowledge`) | MERGE | Same 6 fields as #5, differing only in `layer?` optionality — a duck-type of `@hyperidle/knowledge`'s `KnowledgeItemWithProjection`. Make `layer: string \| null` required at the knowledge boundary and this collapses into #5; the `?? null` in #2 dies too. |
| 7 | `BakedContextBundle` | type | UI/SCHED: emitters + run-orchestration runtime/context/provisioner + harness-protocol | KEEP | The 3-variant context bake the blind executor dispatches on. Moves; `session-requests`' local mirror dies. (Its `kind:"knowledge"` variant is a flagged capability-add per its own `@lore` — architecture reconciliation, not a destroyer kill.) |
| 8 | `AgentWorkIntentRecorderInput` | type | UI/SCHED: every emitter + intake routes + session-requests validation | SIMPLIFY | Six 9-line union members differing only in two string literals — derive from a kind→sourceKind table next to `AGENT_WORK_INTENT_KINDS` in domain-model, so the discriminant and the runtime list stop living in different packages and domain-model's pin test becomes same-file. `api-contract`'s hand mirror (`AgentOrchestrationWorkIntentInput`) stays as the deliberate opaque wire twin — but it now mirrors a neighbor, not a fourth package. |
| 9 | `AgentWorkIntentRecorder` | interface | BOOTSTRAP: `app.ts:405-437` wires `buildSeamBackedWorkIntentRecorder`; injected into threads.ts, work, policy, routine, review | DELETE | Port with one implementation = indirection, and its `TTx`/`tx` parameter is a lie — the sole implementation ignores it (`record: (_tx, input) => port.intents.submit(input)`). It is a second name for `AgentOrchestrationPort.intents.submit`. Replace every injected `AgentWorkIntentRecorder<X>` with the plain function type; delete the two shared-type pin tests with it; fix the false atomicity story in the package header by deleting the package. |
| 10 | `AgentWorkIntentReader` | interface | DEAD | DELETE | Zero implementations, zero callers — `findByKindAndSource` appears nowhere outside this package (`rg -a` across layers/framework/applications/tools). Referenced only by two stale `@lore` comments. Dead on arrival since the AU31 reshape. |

## Types / DI ports

Covered in rows 3-10 above. Net: 6 data shapes survive (5 KEEP + 1 absorbed by MERGE), both DI-port
interfaces die, the input union survives simplified. All survivors relocate to
`framework/domain-model`; the package is deleted.

## Holes this leaves

- **None at runtime for the dissolve itself** — pure relocation into a package every consumer
  already imports; `tsc` re-verifies conformance mechanically. ~30 import-path edits.
- **Row 9 (recorder delete):** every `record(tx, …)` call site loses its executor argument. That
  argument does nothing today, but the edit touches ~10 call sites across threads/work/policy/
  routine/review plus `app.ts`'s `options.agentWorkIntentRecorder` test-override hook, which must
  be retyped to the plain function. The two `agent-work-intent-recorder-shared-type.test.ts` files
  are deleted — they pin a type that no longer exists, which is the point.
- **Row 10 (reader delete):** none. Also delete the two stale `@lore` comments naming it
  (`layers/core-api/src/routes/sessions-routes.ts:100`,
  `layers/agent-orchestration/src/services/durable-agent-queue.ts:39`) or they will resurrect it in
  some future agent's head.
- **Row 6 (merge):** requires `@hyperidle/knowledge` to return `layer: string | null` (required)
  from `assembleSessionKnowledge` — a one-field tightening in one package; routine/ports.ts retypes
  one injected dep.
- **domain-model grows** by ~250 lines of seam types. That is not a hole — it is the family
  reuniting with the kind list, the source-kind types, and the pin test that already live there.
