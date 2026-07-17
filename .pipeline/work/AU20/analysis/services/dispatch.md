# dispatch — Service-as-Product Audit (AU20)

**Layer:** agent-orchestration · **Owned tables:** none · **Current public exports:** 59 · **Target:** ~8

---

## 0. What the number actually is

59 exports for a service whose entire *external* demand is **2 consumers, 4 requests**
(`run-orchestration → executeAssistantRequest`; `tool-handlers → nextCronMatch, parseCron,
provisionTeamRoutines`). The gap is the finding.

Breakdown of the 59:

| Bucket | ~Count | Product surface? |
|---|---|---|
| **DI port-type mirrors** (`Dispatch*Accessor` + their input/result/config mirror types: `DispatchWorkAccessor`, `DispatchRoutineAccessor`, `DispatchConversationAccessor`, `DispatchModelGatewayAccessor`, `DispatchRunOrchestrationAccessor`, `DispatchKnowledgeAccessor`, `DispatchReviewAccessor`, `DispatchToolHandlersAccessor`, `DispatchProvisionDeps`, `DispatchConsumeOptions`, `DispatchProvisionResult`, `DispatchAgentWorkIntentInput/Record`, `DispatchCreatePracticeMeeting*`, `DispatchServerConfigSnapshot`, `DispatchRecentLayeredKnowledgeItem`, `DispatchAttentionRecomputeOutcome`, … 33 more) | ~34 | **No** — Mechanism-C inbound wiring. Not a product surface for anyone; pure composition-root plumbing. |
| **Builtin-routine config** (`BUILTIN_ROUTINE_IDS`, `BUILTIN_SPECS`, `extractBuiltinKind`, `isBuiltinRoutineId`, `BuiltinRoutineId`, `BuiltinSpec`) | 6 | **No** — internal data of the routine-firing path; no external consumer. |
| **Test-only / internal helpers** (`mapErrorToNotice`, `isAssistantThread`, `ThreadLike`) | 3 | **No** — exported for `__tests__`; tests may import internals. |
| **Job-entry deps types** (`TaskDispatcherDeps`, `AssistantTurnDeps`, `RoutineSchedulerConfig`, `RoutineScheduler`, `FireResult`, `ReapStaleSessions`, `PostBetRetroArgs`, `RunBuiltinResult`) | 8 | Config surface — collapsible to one. |
| **Cron math** (`parseCron`, `nextCronMatch`, `computeNextRunAt`) | 3 | Real — but **leaks** to run-orchestration/tool-handlers; not dispatch's product. |
| **Bound ops + factory + ports bundle** (`DispatchOps`, `createDispatchOps`, `DispatchPorts`) | 3 | **Yes** — the real contract. |
| **Queue observability** (`getDispatchQueueSnapshot`, `DispatchQueueSnapshot`, `DispatchQueueEntry`) | 3 | Real — a status route reads it. |

So **~34 of 59 exports are DI-type mirrors** — the DI equivalent of "a bespoke method per call
site" the frame condemns: here it is *a bespoke exported type per outbound edge*. That single
anti-pattern is 58% of the surface.

---

## 1. Existence / Consolidation verdict — **STANDALONE**

**Product purpose (infra/platform):** dispatch is the **agent-work admission front** — the single
place where every *trigger* is turned into a *provisioned agent session*. Four trigger sources feed
one convergent path:

- a **task** becoming ready (`registerTaskDispatcher`),
- a **user message** to an assistant (`registerAssistantDispatcher` / `executeAssistantRequest`),
- a **routine coming due** on cron or event (`startRoutineScheduler` / `checkAndFireRoutine`),
- a **builtin routine payload** firing (`runBuiltinRoutine`, e.g. portfolio-retro).

All four resolve a model + context and hand off to `run-orchestration.executeAgentRunRequest`. That
is **one coherent product**, not five: "turn a trigger into a session-run request." Its customers are
other *services*, so it is a **platform/infra product** — held to the same bar, and it clears it: it
delivers the trigger→dispatch capability that `run-orchestration` (the executor) and the routine
tooling depend on.

**The trigger/execute seam is real.** dispatch decides *when/whether* a session starts; run-orchestration
takes *custody* of the running session. Keeping them apart is the correct division of one pipeline into
admission vs execution.

### Candidate-cluster evaluation

- **`dispatch + tool-handlers` (bidirectional coupling)** — **REJECT merge.** tool-handlers is 21
  tool-*body* factories (the implementations of tools agents call). That is a different product from
  "trigger admission." The bidirectional edge is two legitimate cross-product calls: (a) dispatch
  building a draft-tool registry via tool-handlers for the assistant turn, and (b) tool-handlers'
  `create-team`/`create-routine` tools calling `provisionTeamRoutines` + the cron helpers. Merging
  would produce a ~60-export mega-service bundling 5 dispatch jobs **plus** 21 tool bodies — strictly
  worse. The *real* smell inside the coupling is the **cron-helper leak** — fixed below by moving cron
  math to `@hyperidle/shared`, which severs 2 of tool-handlers' 3 requests on dispatch outright.

- **`dispatch + run-orchestration`** — **REJECT merge.** Trigger vs execution is the seam. Noted
  layering smell (not this WP's remit): there is a `dispatch ↔ run-orchestration` cycle around
  `executeAssistantRequest` — run-orchestration calls *back into* dispatch's assistant-turn engine
  (`agent-work-assistant.ts`), which then calls run-orchestration's `executeAgentRunRequest`. The
  assistant-turn engine is conceptually execution-side; a future decomposition could move it into the
  session-runtime cluster, breaking the cycle. dispatch stays standalone regardless.

---

## 2. The deliberate target public API (~8 exports, down from 59)

The product is **one bound-ops object + its dependency contract**, parameterized by trigger and by
intent — never a method (or type) per call site.

### 2.1 `createDispatchOps(ports: DispatchPorts): DispatchOps` — the factory *(1 fn + 1 type)*

`DispatchOps` collapses the current 10 methods to **4**, parameterized by intent:

| Target method | Shape | Subsumes (current) |
|---|---|---|
| `start(config): Disposer` | one lifecycle that wires **all** trigger sources (task, assistant, routine scheduler, builtin handlers) and returns a single disposer | `registerTaskDispatcher`, `registerAssistantDispatcher`, `startRoutineScheduler`, `registerBuiltinRoutineHandlers` (4→1) |
| `runAssistantTurn(deps, request)` | execute one conversational turn; failure persistence is internal to this path | `executeAssistantRequest`, `persistTurnFailure` (2→1) |
| `fireRoutine(routine, opts?)` | fire a routine by identity — builtin vs generic is an internal branch on the spec, not a caller choice | `runBuiltinRoutine`, `checkAndFireRoutine` (2→1); `getRoutineMonthlySpend` becomes **internal** (scheduler-only budget read) |
| `provisionTeamRoutines(db, opts)` | seed a team's routines — the one routine op a real external consumer (tool-handlers `create-team`) needs | `provisionTeamRoutines` (kept) |

**Why one bundle, not four registrars:** every trigger source is the *same* capability ("subscribe a
trigger, converge on session-provisioning"). A new trigger source is an internal module wired inside
`start()`, not a new public method.

### 2.2 `DispatchPorts` — the dependency contract *(1 type)*

The ~34 `Dispatch*Accessor`/mirror types collapse to **one** exported `DispatchPorts` interface; every
sub-accessor and every input/result mirror becomes an **inline, non-exported** member. The composition
root satisfies `DispatchPorts` **structurally** — it never needs the sub-types by name. This alone is
~34 → 1.

### 2.3 `DispatchConfig` — the `start()` config *(1 type)*

`TaskDispatcherDeps` + `AssistantTurnDeps` + `RoutineSchedulerConfig` + runtime deps → **one**
`DispatchConfig` supplied by boot wiring. ~5 → 1.

### 2.4 `getQueueSnapshot(): DispatchQueueSnapshot` — observability read *(1 fn + 1 type)*

Kept: a real status route reads the in-flight dispatch queue. `DispatchQueueEntry` folds into the
snapshot type. 3 → 2.

### 2.5 Removed from dispatch entirely — cron math → `@hyperidle/shared`

`parseCron` / `nextCronMatch` / `computeNextRunAt` are pure cron arithmetic with **three** importers
(dispatch, run-orchestration, tool-handlers). They are not dispatch's product. Move them to
`@hyperidle/shared`; all three import from shared. dispatch stops being a util-provider and
tool-handlers loses 2 of its 3 requests on dispatch. −3.

### 2.6 Dropped from the surface (internal or test-only)

Builtin config (`BUILTIN_*`, `extractBuiltinKind`, `isBuiltinRoutineId`, 6) → internal data of
`fireRoutine`. `mapErrorToNotice` / `isAssistantThread` / `ThreadLike` (3) → internal; tests import
internals. **−9.**

**Target surface:** `createDispatchOps`, `DispatchOps`, `DispatchPorts`, `DispatchConfig`,
`getQueueSnapshot`, `DispatchQueueSnapshot` (+ at most a `FireResult`/`Disposer` return type) ≈ **8**.

---

## 3. Inside lens — staying clean/evolvable

- **Four internal trigger-source modules** (task / assistant / routine-scheduler / builtin) sit behind
  one `start()`; each is free to change shape without touching the public surface.
- **DI as one structural contract:** `DispatchPorts` grows by *one field* when a new downstream
  dependency appears — no new exported type per edge.
- **Builtin routines are a data-driven internal registry:** add a `BUILTIN_SPECS` entry + a handler;
  `fireRoutine` dispatches by id — no API change.
- **Cron math externalized:** dispatch no longer owns/ships a utility; one less concern, one less leak.
- **Error handling is path-local:** `persistTurnFailure`/`mapErrorToNotice` live inside the
  assistant-turn path, not the barrel.

---

## 4. Scaling argument (sub-linear)

Apply the test — "add dozens more services, hundreds more calls; do we add hundreds of methods?"

- **New trigger source** (e.g. webhook-dispatch): today = new `registerWebhookDispatcher` + its Deps
  type + its port mirrors (**method + N types per trigger** — linear/super-linear). Target = an
  internal module wired inside `start()`. **Zero new public exports.**
- **New builtin routine:** today = touches config + a handler, all already exported. Target = one
  internal `BUILTIN_SPECS` entry, fired by the existing `fireRoutine`. **Zero new exports.**
- **New downstream dependency:** today = a whole new exported `Dispatch*Accessor` + input/result
  mirrors (**≈3 exported types per edge**). Target = **one field** on `DispatchPorts`. Sub-linear.
- **New consumer that wants to fire a routine:** composes `fireRoutine(routine, opts)` — no new method.

The current shape fails the test precisely on the port-mirror axis: it grows ~3 exported types per new
outbound edge and a registrar per new trigger. The parameterized target (`start` over trigger sources,
`fireRoutine` over routine identity, `DispatchPorts` as one structural contract) absorbs all four
growth axes without new surface.

---

## 5. Key collapses

1. **~34 DI port-type mirrors → 1 `DispatchPorts`** (sub-accessors + input/result mirrors go inline,
   non-exported; composition root binds structurally). The single biggest reduction — 58% of the surface.
2. **10 ops methods → 4** (`start` subsumes 4 registrars; `runAssistantTurn` subsumes
   execute+persistFailure; `fireRoutine` subsumes builtin+generic firing; `getRoutineMonthlySpend`
   goes internal; `provisionTeamRoutines` kept).
3. **3 cron helpers → moved to `@hyperidle/shared`** — removes the leak that couples dispatch to
   run-orchestration + tool-handlers, and eliminates 2 of tool-handlers' 3 requests on dispatch.
4. **~9 config/predicate/test-only exports → internal** (builtin registry, `mapErrorToNotice`,
   `isAssistantThread`, job-deps types folded into one `DispatchConfig`).

Net: **59 → ~8 (~86% reduction)**, with the *external* demand (4 requests) fully served and the
trigger/execute product boundary preserved.
