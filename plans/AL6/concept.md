# AL6 — Concept: Harness review-return hooks (v2 — forcing enforcement)

**Concept act.** AL6 introduces four load-bearing nouns into the agent-runtime/harness layer: the **accepted-return set**, the **return action**, the **internal-extraction drain** (an exempt non-turn), and the reshaped **not-returned** turn outcome. This v2 revision **reshapes only the enforcement model** — what "a turn cannot end without returning" means *operationally*. The v1 noun work (Turn, return action, accepted-return set, extraction-drain exemption, forwarding relays, closed-set membership) was sound and is carried forward unchanged. v1's **mistake was at one decision point only: the response policy.** v1 picked the weak arm — *flag* (a passive `session_not_returned` event after the fact, turn settles regardless). The founder rejected it: AC1/AC3 require a turn ending without a return to be **"not accepted as complete"** — the spec's *primary* arm is **redirect** ("redirected to return"), and "surfaced as not-yet-returned" is only the fallback. **v2 makes forcing the primary mechanism and defines a hard fallback for harnesses that cannot natively force.**

> **History.** v1 shipped (`packages/server/src/harness/return-gate.ts` — a read-only `ReturnGate` observer threaded into the two drain loops; emits `session_not_returned` at exhaust; never writes back, never continues the agent). Founder verdict: **not done.** Three gaps: (1) flag-only ≠ enforcement; (2) it didn't use the purpose-built hook mechanism (the Claude Agent SDK `Stop` hook); (3) no live-agent eval. v2 addresses all three. The v1 observer is **kept as the detection core** (the single bit "did a return tool fire this turn?") but is **re-tasked**: instead of emitting-then-settling, it drives a forcing decision.

The thesis (Track AL): "review for anything / pull the human in where it matters" is only real if agent work actually reaches the review surface. AL6 makes returning to HyperIdle the **mandatory last step of any turn**, drawn from a **closed** set — and now *actually mandatory*, not merely audited.

---

## 1. The load-bearing nouns (carried from v1; §1.4 reshaped)

### 1.1 Turn

**A turn is one bounded run of an *agent acting on the user's behalf* through a harness, from start until its event stream exhausts.** In this codebase a turn = one harness session run — the span between `harness.startSession(config)` and the moment the adapter's `streamEvents` iterable is exhausted. Re-grepped (`for await … streamEvents`, non-test): **five** loops — **three turn drains** (`session-provisioning.ts` Phase 10; `assistant-turn.ts` `drainStreamEvents`; `bet-decomposition.ts` `drainForCompletion`) and **two forwarding relays** (`isolated-session-worker.ts`, `desktop-worker-client.ts`). Two turn drains are **enforced** (sites A, B); the third is an **internal-extraction drain — exempt** (§1.5). Relays are **not enforcement sites** (§1.6).

A turn is **NOT**: a single LLM round-trip (the builtin loop runs many per session); a single tool call; a task or bet (work primitives a turn operates *on*); a thread/message (the review substrate a return *writes into*).

**Why "until the stream exhausts" is the right boundary.** It is the one event structurally identical across *every* adapter, because every adapter implements `HarnessAdapter.streamEvents(): AsyncIterable<HarnessEvent>`. Any harness-internal notion of "turn" (the builtin's `runChatTurn`, the CLI's `result` line) would be adapter-specific and violate AC4.

> **SHARED-contract note.** "Turn" is a runtime span, not a persisted entity. No DB table. Verdict grammar and thread model stay unchanged (explicit constraint). **v2 changes nothing here** — see §7 for the SHARED-contract reconciliation.

### 1.2 Return action

**A return action is a tool invocation, from a fixed closed set, that hands the turn's work back to HyperIdle so a human can see and gate it.** The defining property is "**surfaces this turn's output into a HyperIdle surface a human reviews**" — not "writes to the DB," not "is the last tool called."

A return action is **NOT**: a state-mutation tool (`write_memory`, `create_artifact`, `edit_block`, `log_task` — they produce work but don't surface it for review; an artifact written but never submitted is exactly the silent escape AL6 closes); a read/query tool (`read_inbox`, `query_practice`, `score_attention`, `route_item`); a planning/bookkeeping tool (`write_session_notes`, `create_task`, `create_bet`).

### 1.3 Accepted-return set

**The closed, enumerable set of tool names that count as a valid turn ending.** A single source-of-truth constant in `packages/shared` referenced by the tool layer, every adapter, and the enforcement hook. Properties: **closed** (membership fixed in code; adding a member is a deliberate one-constant edit), **enumerable** (AC2 — read the constant to answer "which actions count?"), **harness-agnostic** (AC4 — same set gates every adapter).

### 1.4 Not-returned (turn outcome) — RESHAPED in v2

**`not-returned` is the state of a turn whose agent attempted to end without invoking a return action.** In v1 this was a *terminal, after-the-fact* outcome (detect → emit → settle as `completed`). **In v2 it is an *interceptable, pre-settlement* state**: the turn is caught at the moment the agent attempts to stop, and the system **acts on it** before the turn is allowed to complete.

The reshaped invariant (the load-bearing change): **a not-returned turn is never accepted as a clean, complete, reviewed-loop turn — and "not accepted" now means the turn is actively prevented from settling as complete.** On a not-returned attempt the system does one of (priority order):

1. **Redirect (force-continue)** — the primary arm. The agent is blocked from ending and re-prompted with a forcing message; the turn does not settle until a return lands or the redirect budget is spent.
2. **Reject-the-turn (fallback)** — on a harness with no native force-continue, the turn's completion is **not accepted as a successful/complete outcome**: it settles with a distinct **non-completed** outcome (`not_returned`), the agent's would-be-final result is *not* treated as a clean turn end, and the escape is surfaced. Strictly stronger than v1's flag: v1 left `outcome: "completed"` and merely added a side event; v2 **changes the turn's outcome** so a not-returned turn can never be counted as completed anywhere downstream.

`not-returned` is **NOT**: a crash (`crashed` — different failure mode); a `stopped`/aborted turn (handoff/PATCH cut it short — exempt §3.3); a `budget_exhausted` turn (cap cut it; exempt §3.3); an internal-extraction-drain end (§1.5 — not a turn).

### 1.5 Internal-extraction drain (NOT a turn) — exempt

A session run is an **internal-extraction drain — exempt — when ALL hold:** (1) **no tools** — `SessionConfig.tools` is `[]` (structurally cannot invoke a return; enforcing one is impossible, not merely skipped); (2) **deterministic structured-output contract** — caller parses the completion programmatically, never surfaces it as "the agent's reviewed work"; (3) **not acting on the user's behalf** — platform-internal extraction (decompose/classify/summarise-for-machine). `bet-decomposition.ts`'s PM turn satisfies all three and is exempt; any future extraction turn satisfying the predicate is covered automatically. Exempting (not wiring as a third return site) is the only coherent option: a tool-less turn has *no* return action it could ever call.

### 1.6 Forwarding relay (NOT an enforcement site)

A relay consumes a `streamEvents` iterable only to re-emit each event verbatim to another process/transport (`isolated-session-worker.ts` `process.send({type:"event"})`, `desktop-worker-client.ts`); it terminates no turn, parses no completion. The turn it carries is gated *once*, at the parent's enforced drain (site A) after events arrive via the isolated/remote adapter. A relay must **not** force or flag — doing so would double-handle the same turn.

---

## 2. The closed accepted-return set (re-derived)

A return action must **surface this turn's output into a human-attended HyperIdle surface.** Applying that test to `ALL_TOOL_DEFINITIONS`:

| Tool | In set? | Why |
|---|---|---|
| `submit_review` | **YES** | Canonical return: posts a review/plain message to the bet's host thread for a verdict. IS "submit for review." |
| `handoff_to` | **YES** | Hands the task to another agent/role/human reviewer; ends the session, transfers ownership with status+artifacts+remaining-work to a HyperIdle inbox/escalation. "Close a task / hand back." |
| `send_message` | **YES** | Posts to a human-or-agent thread; the turn's output reaches a thread a human can read. The spec's named "send a message." |
| `update_task_status` → `done`/`cancelled` | **deferred (path B)** | Terminal transition is conceptually "close a task," but membership is argument-gated, complicating the "closed set of tool *names*" property. v1 deferred it; v2 keeps it deferred. The per-tool predicate seam is pre-wired so adding it later is a one-tool edit, never a model change. |

Everything else in `ALL_TOOL_DEFINITIONS` is **NOT** a return (legitimate mid-turn tools; AC5).

**The v2 lock is `{ submit_review, handoff_to, send_message }`** — exactly the spec's named trio. **Re-derivation under the forcing lens:** because the redirect arm re-prompts the agent to "return via one of {…}", each set member must be *a single tool call the agent can make to satisfy the gate immediately* — all three are (one call, unconditionally terminal). An argument-gated member (`update_task_status`→`done`) would make the forcing message ambiguous ("call it with which args?"), reinforcing the deferral. The set stays a closed list of tool *names*; argument-gating is a per-tool predicate refinement, never an open-ended "any tool with the right args."

---

## 3. Enforcement — operational meaning of "a turn cannot end without returning"

### 3.1 The detection rule (unchanged from v1)

> As the stream is consumed, the enforcement hook records whether any consumed `tool_call` named a member of the accepted-return set (passing its per-tool predicate). The single bit "was a return seen?" is the detection core (the v1 `ReturnGate`, kept).

What v2 adds is **what happens at the stop attempt** when that bit is still false.

### 3.2 The agnostic seam + the forcing layer above it

Detection sits at the one agnostic seam: consumption of `harness.streamEvents()`, observed via the existing `tool_call` event contract — no new adapter method, no new event the adapters must emit. **Forcing sits one layer up and is harness-class-specific** (§3.4): it requires the ability to *re-prompt the agent and continue the turn*, which is not uniform across adapters. The concept locks the **guarantee** as uniform (no turn settles as complete without a return); the **mechanism** degrades from force → reject across harness classes.

### 3.3 What counts as "the turn ending" — and the exemptions

A turn "ends" when its `streamEvents` iterable exhausts on the **normal** path. The forcing/reject decision fires **only** on that normal completion. Exempt: **crashed** (an `error` event broke the loop / `startSession` threw); **aborted/stopped** (handoff/PATCH cut it short — intentional; note a `handoff_to` *is itself* a return, so the gate is already satisfied before abort); **budget_exhausted** (the cap cut it); **internal-extraction drain** (§1.5 — not a turn; known at drain construction, exempt-by-construction). Rationale: AL6 governs an agent that *chose to stop* without returning, not one *prevented* from finishing.

### 3.4 What happens on a not-returned attempt — FORCE (primary) → REJECT (fallback)

This is the v2 reshape. The response is a **two-tier guarantee** keyed to a per-harness capability (`canForceReturn`):

**Tier 1 — Redirect / force-continue (where the harness can re-prompt and continue the turn).**
On the agent's stop attempt with no return seen, the system **blocks the stop and re-injects a forcing message**, then lets the turn continue. The turn is not allowed to settle until a return tool fires.
- **Forcing (re-injection) message** (canonical text, single source in `packages/shared`):
  > *"You have not yet returned your work to HyperIdle. Before this turn can end you must call exactly one of: `submit_review` (submit work for review), `handoff_to` (hand the task to another agent or a human), or `send_message` (send your result to a thread). Choose the one that fits and call it now."*
- **Refusal bound — N attempts.** The redirect is **bounded at N = 2** force-continues per turn (≤ 2 re-injections). If the agent still ends without a return after the budget is spent, the system **stops forcing and falls through to Tier 2 reject** for that turn — it does NOT loop forever and does NOT crash the session. *Why fall-through-to-reject rather than hard-fail:* a hard crash would lose the agent's mid-turn work (artifacts, memory writes) — a worse outcome than a recorded, surfaced not-returned turn; falling through preserves side-effects, records the escape, and keeps the invariant intact. N=2 matches the builtin's existing bounded-retry discipline (one nudge, one recovery) and the project's universal max-retry ethos; it is a single named constant the architecture can tune.

**Tier 2 — Reject-the-turn (where the harness cannot natively force-continue).**
The turn's outcome is set to a distinct **non-completed** value `not_returned` (a new `SessionOutcome` member, NOT `completed`). The agent's would-be-final result is **not accepted as a clean, complete turn**; downstream consuming `SessionOutcome` sees a non-completed turn. The `session_not_returned` event still emits (surfacing). This is the AC3 fallback arm ("surfaced as not-yet-returned") **plus** the AC1 teeth v1 lacked: the outcome itself is no longer `completed`.

**Why a two-tier guarantee, not one uniform mechanism.** True force-continue requires re-prompting the *same* agent loop and resuming it — possible only where HyperIdle controls the loop or the harness exposes a turn-end hook that can inject a reason. Two harness classes can force; three cannot (§5). Forcing all uniformly would need per-adapter protocol surgery (out of scope: "No new harness types"). The **guarantee is uniform** (no not-returned turn is ever accepted as complete); the **mechanism degrades deterministically** (force where possible, reject where not). Nothing silently escapes in either tier — the AC1/AC3/AC4 invariant.

### 3.5 AC5 — mid-turn non-terminal tool use unaffected (unchanged)

The gate constrains only the *ending*. Mid-turn an agent calls `read_inbox`, `write_memory`, `create_artifact`, etc. freely — none blocked, none ends the turn. The detection observer only *reads* the `tool_call` stream; it never intercepts a mid-turn invoke. The forcing decision is evaluated **at the stop attempt**, not per-call. A turn that calls ten non-terminal tools then `submit_review` passes; ten then stop triggers force→(maybe)reject. **v2 note:** the force-continue re-injection happens *after* the stop attempt, so it never interferes with legitimate mid-turn tool use — the re-prompt is just another round the agent answers with a return tool.

---

## 4. The mechanism the founder asked for — the SDK Stop hook (concept-level)

The founder's "why not use hooks which were built for that?" is correct for the SDK harness. The installed `@anthropic-ai/claude-agent-sdk` exposes a **`Stop` hook** (`query({ options: { hooks: { Stop: [...] } } })`) whose callback can return `{ decision: "block", reason }` to **prevent the agent from stopping and continue the conversation with `reason` as guidance** (verified against the SDK type `SyncHookJSONOutput` and the Claude Code hooks docs — architecture §1). This is *exactly* the redirect arm, native, no re-prompt round-trip we invent. The architecture wires the AL6 forcing message as the `Stop` hook's `reason` when no return was seen. For the **HyperIdle-owned builtin loop**, the equivalent point is the loop's own stop-decision (`while(true) … break`): HyperIdle re-injects a user message and continues the loop. For CLI/remote/isolated (subprocess/transport, tools via MCP, no reachable turn-end hook), Tier 2 reject applies.

---

## 5. Per-harness force vs fallback (concept-level; architecture details mechanism)

| Harness class | Adapter | Owns the agent loop? | Native turn-end intercept? | Tier | `canForceReturn` |
|---|---|---|---|---|---|
| **SDK / builtin-SDK** | `claude-agent-sdk-adapter.ts` | No (SDK owns it) | **Yes — SDK `Stop` hook** (`decision:block + reason`) | **1 — force** | true |
| **Builtin (HyperIdle loop)** | `builtin-harness-adapter.ts` | **Yes** (`runChatTurn`/`runLoop`) | **Yes — our own loop break** | **1 — force** | true |
| **CLI** | `cli-harness-adapter.ts` | No (subprocess; ndjson stdout) | No reachable hook; tools via MCP | **2 — reject** | false |
| **Remote** | `remote-harness-adapter.ts` | No (worker transport) | No | **2 — reject** | false |
| **Isolated** | `isolated-harness-adapter.ts` | No (worker; relay-fed) | No | **2 — reject** | false |

The eval (DoD) runs the **builtin** harness (`packages/eval/provision-harness.ts` registers `BuiltinHarnessAdapter`) — a **Tier 1 force** path — so the live eval proves real forcing, not just rejection. The SDK `Stop`-hook Tier 1 path is proven by a behavioral test (the SDK isn't easily driven in the eval harness; see architecture §6).

---

## 6. Vocabulary

| Term | Definition | Aliases not to use |
|---|---|---|
| **Return action** | A tool call from the closed accepted-return set that surfaces the turn's work into a human-attended HyperIdle surface. | terminal action, finish tool, exit tool |
| **Accepted-return set** | The closed, enumerable set of tool names that count as a valid turn ending. | return list, terminal set, allow-list |
| **Force-continue (redirect)** | Blocking the agent's stop attempt and re-injecting the forcing message so the turn continues until a return lands. | retry, nudge, re-ask |
| **Reject-the-turn** | Setting a not-returned turn's outcome to the non-completed `not_returned` value (the no-native-force fallback). | flag, mark, annotate |
| **`not_returned`** | The non-completed turn outcome of an agent that attempted to end without a return (after force budget spent, or on a no-force harness). | not-returned-flag, escape, incomplete |
| **Internal-extraction drain** | A tool-less, deterministic, platform-internal session run that is NOT a turn and is exempt. | extraction turn, internal turn |
| **`canForceReturn`** | Per-harness capability bit: true iff the harness can natively block a stop and continue the turn. Drives Tier 1 vs Tier 2. | forceable, hookable |

---

## 7. Contracts

- **Cardinality.** A completed turn ends with ≥1 return action (the gate needs at least one; firing two — `send_message` then `submit_review` — still satisfies).
- **Closure.** The accepted-return set is **closed**: membership is a fixed list of tool names in one `packages/shared` constant. Adding a member requires a concept-doc + constant edit.
- **Mutability.** The set, the forcing message, and N (redirect budget) are frozen constants. A turn's `not_returned` outcome, once settled, is immutable.
- **Identity.** A turn has no persistent identity (runtime span). The accepted-return set's identity is the constant itself.
- **Hard rules.**
  1. **No turn settles as `completed` without a return** (the AC1 teeth). On every enforced drain, a normal-completion turn that saw no return is EITHER force-continued until it returns OR settled with outcome `not_returned` (never `completed`).
  2. **The forcing mechanism may degrade but the guarantee may not.** A no-force harness rejects; it never silently completes.
  3. **Force is bounded** at N=2 re-injections; after the budget, fall through to reject — never loop forever, never hard-crash and lose mid-turn side-effects.
  4. **Detection is observation-only and never blocks a mid-turn tool** (AC5). Only the *stop attempt* triggers forcing.
  5. **Internal-extraction drains and relays are never forced or rejected** (§1.5, §1.6).

---

## 8. SHARED-contract impact of the force-vs-flag reframe

The v2 reframe **does touch one SHARED contract** v1 left alone: **`SessionOutcome`**. v1's flag kept `outcome: "completed"` and bolted on a side event; v2's reject arm requires a **new non-completed `SessionOutcome` member `not_returned`** so a not-returned turn cannot be counted as completed by any `SessionOutcome` consumer. This is an **additive** union change (new member, existing members untouched), but it IS a SHARED-contract change: every `switch (outcome)` consumer must handle the new arm (the architecture enumerates them and adds a `check`-time exhaustiveness guarantee). Everything else stays as v1 promised: **verdict grammar unchanged, thread model unchanged, no new DB table, no new `HarnessAdapter` method** (the `Stop` hook is wired *inside* the SDK adapter via the SDK's own `options.hooks`, not as a new `HarnessAdapter` method — though an additive `canForceReturn` bit joins `HarnessCapabilities`). The `session_not_returned` event is kept (now emitted in both tiers as the surfacing channel).

---

## 9. Rationale

The founder's reframe: **flag-only is not enforcement.** A review system whose guarantee is "we log it when an agent escapes" reviews only what agents *happen* to submit — exactly the bypass AL6 exists to close. The spec's primary verb is "redirected to return," and the purpose-built mechanism (the SDK `Stop` hook returning `decision: block + reason`) was already in the installed SDK, unused. v2's shape — **force where the harness supports it, reject (non-completed outcome) where it does not, bounded retry, surfaced in both tiers** — is the minimal design that gives AC1/AC3 real teeth while keeping AC4's guarantee uniform across a heterogeneous adapter fleet without inventing new harness protocols. The v1 detection observer survives as the "did a return fire?" core; only the response policy is rebuilt.

---

## Required reading (downstream: `/architecture`, builder)

- `.pipeline/work-packages/TRACK-AL.md` §AL6 (lines 206–244) — spec + ACs + constraints.
- This concept (`plans/AL6/concept.md`).
- `packages/server/src/harness/claude-agent-sdk-adapter.ts` — the `query({options})` call site where `hooks.Stop` is wired.
- `packages/server/node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts` — `SyncHookJSONOutput`, `StopHookInput`, `HookCallback`, `Options.hooks` (the verified hook API).
- `packages/server/src/harness/builtin-harness-adapter.ts` — `runChatTurn`/`runLoop` (the HyperIdle-owned-loop force point).
- `packages/server/src/services/session-provisioning.ts` (Phase 10 drain), `assistant-turn.ts` (`drainStreamEvents`), `bet-decomposition.ts` (`drainForCompletion`, exempt).
- `packages/server/src/harness/return-gate.ts` — the v1 observer to re-task.
- `packages/eval/src/provision-harness.ts`, `packages/eval/src/scenarios/submit-review.ts`, `packages/eval/src/judges.ts` — the live-eval harness/shape for the AC1/AC3 eval.
