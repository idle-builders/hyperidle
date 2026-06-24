# Review-gated execution: the Proposed Call (AL7)

> **Model change (AL7 redo, 2026-06-24).** The first AL7 shipped a **Kernel-held executor** (HyperIdle re-ran the agent's op via a curated `executeCapability` map) — the founder rejected it as "yet another integration layer." A second pass correctly inverted ownership but made **byte-faithful replay** (an exact-hash-match-to-permit) the load-bearing gate, which deadlocks on LLM arg drift and is harness-specific. **This doc supersedes both.** The safety mechanism is now a **tailored native allow/deny list applied to session 2 at init**; byte-fidelity is demoted to an optional per-harness optimization. The load-bearing noun **`Staged Operation` is retired; the noun is `Proposed Call`.** File path kept stable. Concept: `plans/AL7/concept.md`.

The executable backbone of **plan → review → act**. Approving a review is what makes an agent's work actually *happen* — the refund fires, the deploy lands, the email sends. But **HyperIdle executes nothing**: it rides each harness's native permission gate, captures the exact call the agent attempted, surfaces it for review, and on approve re-provisions the **agent's own session** with the native allow/deny **tailored** so it can run the approved op and nothing else irreversible. HyperIdle is the **gate and the bookkeeper**; the agent's own tools + credentials are the **executor** ([system boundary](../architecture/system-boundary.md)).

The whole design rests on one line from [ETHOS](../../ETHOS.md) §3 (User Sovereignty): **never make an irreversible decision without a human — but never put a human in front of a reversible one.**

## The frame: every approve has consequences

A review is a decision point, and a decision moves the world. Even approving a chart **resolves its work** (closes the task, advances the bet) and may **launch the next step**. A **consequence** is either **internal** (a HyperIdle state move) or **external** (a call to a connected tool). The question is never *whether* something happens on approve — it is *what*, and *whether it can be undone*.

## The classifier: reversibility, not familiarity

The gate exists for **irreversible** consequences. Reversible consequences flow at the agent's earned autonomy and do not interrupt a human ([trust-building](../human-interface-layer/trust-building-slow-cumulative.md) §10). A brand-new, never-seen, *reversible* tool just runs — it can be undone. **Unknown does not mean gated.** Gating the unfamiliar-but-reversible is the approval fatigue that drowned the first generation of agent tools; ETHOS §3 names the real line — *irreversibility*.

## The safety mechanism: tailored native allow/deny at init

Every harness gates tool calls (allow / deny) via permission config set **at session init**. HyperIdle rides that config; it does not build its own gate and does not re-execute the call.

- **Session 1** — the native permission config is tailored to **allow reversible calls** and **deny irreversible ones**. When the agent attempts a denied (irreversible) call, the harness's **deny-with-record hook** captures the exact bound call — tool id + verbatim args — as a **Proposed Call**, the subject the human reviews.
- **Session 2 (on approve)** — the session is re-provisioned with the native allow/deny **tailored so the agent can execute the approved operation (plus reversible work) and nothing else irreversible.** That narrowing IS the guarantee. The agent re-attempts the work; the harness's own permission system permits only the approved scope. The policy is applied once and reverted (**consume-once**).

The reviewer always sees two things: **the proof** (diff / rendered email / field deltas — which picks the AL2 canvas) and **the one captured commit verb** (the Proposed Call) behind approve.

## Why init-time config, not a held async "ask"

HyperIdle sessions are **detached one-shots** — not pausable; on end the sandbox + history are destroyed; only *abort* exists. There is no turn to hold open. So enforcement is **allow/deny at session *init***, not a held call-time ask — and the init-time permission config exists on **every** harness:

| Harness | Init-time permission config | Deny-with-record (capture) |
|---|---|---|
| **builtin** | the `registry.invoke` gate (HyperIdle owns the loop) | deny + record at `registry.invoke` |
| **Claude (Agent SDK)** | `permissionMode` + `allow`/`deny` tool lists (settings) | `canUseTool`/`PreToolUse` deny + log the attempted call |
| **Codex** | `approval_policy` + `sandbox_mode` + allow flags (spawn args) | record from the native approval signal (auto-deny irreversible at init) |
| **opencode** | `permission` allow/ask/deny config (spawn args) | record from the native permission decision |

Because enforcement is init-time config, AL7 does **not** require the net-new async-approval transports (Codex app-server JSON-RPC, opencode SSE). Capture is **synchronous deny+record**, not an async hold. `registry.invoke` (`tool-registry.ts:274`) remains the universal in-process record point for HyperIdle-registered + MCP-routed tools and the one place the tailored policy is consumed once.

## Byte-fidelity is an optimization, not the gate

The earlier redo made session 2 re-run the captured call **byte-faithfully** — permitting exactly the captured bytes via a SHA-256 match. That is **demoted**. A hash-match gate deadlocks the approved work on any LLM arg drift (a re-summarized PR number, `42` vs `42.0`) and is fragile and harness-specific.

The gate is now the **narrowed native allow/deny scope**, which forbids *other* irreversible ops regardless of arg drift. Byte-fidelity survives only as an **optional per-harness arg-pin**: tighten the allow from "the approved tool" to "the approved tool with exactly these args" wherever the harness expresses arg-level scope — builtin checks the args in-process at `registry.invoke`; Claude pins/checks args in a `PreToolUse`/`canUseTool` hook; Codex/opencode where their permission grammar supports arg/command-pattern matching. There is **no exact-hash-match-to-permit**, so **no deadlock**.

## The residual — the optimization frontier (stated plainly)

The **safety floor** is: *session 2 cannot execute any irreversible op other than the approved one.* Where a harness's allow-list scopes only by tool **name/pattern** (not exact args), session 2 could permit the **same approved tool with different args** (approve "refund $10", a drifted "refund $50" on the same tool would also pass a name-scoped allow). This is the **optimization frontier**, not a hole in the floor: the floor still holds (no *other* irreversible op runs; an *unrelated* irreversible op is denied + re-captured), and the arg-pin tightens it where each harness expresses arg-level scope. This is **acceptable per founder direction** — surfaced openly, not hidden.

## The single signal: earned trust from verdict history

There is **no per-tool risk table or allowlist matrix** (the enterprise smell HyperIdle rejects — and why the first AL7's `KERNEL_DISPATCHABLE_CAPABILITIES` allowlist was wrong). The trust signal is **earned**: an agent's **approval rate over its recent verdict history**, computed by the policy engine (`packages/fabric/src/services/policy-engine.ts`). Cold-start-safe (too few verdicts → everything surfaced), with a **floor trust cannot cross** — irreversible consequences stay gated regardless of approval rate.

> **Implementation note (AD4 / AL7 / AL8).** The per-skill autonomy ladder (L1→L4) was removed by **AD4** in favor of the verdict-history approval rate; surviving `autonomyLevel` data is vestigial (removed by **AL9**). **AL7 ships only the gated arm** — every irreversible Proposed Call waits for an explicit human approve. Wiring the trust signal so *reversible* calls auto-flow at the gate (and reconciling reversibility with the policy engine's `riskTier`) is **AL8**.

## Definition

A **Proposed Call** is the exact, fully-bound tool call (tool id + verbatim arguments) that an agent **attempted** and the gate **denied**, captured verbatim as the subject a human reviews. A record/snapshot — not an event, not a command HyperIdle will run, not the act of executing.

## Essential properties

- **Tool identity** — the harness/MCP tool name the agent called.
- **Bound arguments** — the exact `input` object, verbatim. No late binding.
- **Reversibility** — `irreversible | reversible` (only irreversible calls are captured).
- **Origin** — the denied session it came from + the task/thread it anchors.
- **Gate** — the review message that gate-keeps it.
- **Status** — `captured → granted → executed | failed`, or `held`.
- **Identity hash** *(optional metadata)* — a deterministic hash over (tool id, normalized args), consumed only by the arg-pin optimization; NOT the safety gate.

It carries **no** HyperIdle-side executor reference and **no** capability-allowlist membership — those were the rejected model.

## What it is not

- **Not a Kernel-executed operation.** HyperIdle does not run the tool. The agent's own session/tools/credentials do.
- **Not a curated capability allowlist.** No `KERNEL_DISPATCHABLE_CAPABILITIES`. The gate, capture, and tailored policy are all generic; HyperIdle never needs to know what a tool *means*.
- **Not a live session pause / native held "ask."** HyperIdle sessions are detached one-shots; the review spans **two sessions**. Enforcement is allow/deny at session *init*, not a held call-time ask — no net-new async transport required.
- **Not an agent-authored spec.** There is no `stage_operation` tool. The subject is the *real attempted call*, captured at the gate.
- **Not a byte-faithful replay gate.** Session 2 is NOT permitted by matching a hash of the captured bytes. The gate is the narrowed native allow/deny scope; byte-fidelity is an optional arg-pin optimization.
- **Not Claude-only.** The tailored allow/deny is designed + tested on all four supported harnesses (builtin, Claude, Codex, opencode); cursor-agent is `unavailable` and skipped.
- **Not a verdict.** The verdict authorizes; the Proposed Call is authorized.
- **Not a `ToolCallSummary`.** That records a reversible action the assistant *already ran* (AD8b). A Proposed Call is the not-yet-run irreversible call routed to review.
- **Not the `action_operation` canvas.** The canvas renders a *view*; the Proposed Call is the backing captured call.

## Lifecycle

```
captured ──(denied at gate in session 1; deny-with-record hook captures the exact call)
   │
   ├── approve verdict ──▶ granted ──(session 2 re-provisioned; native allow/deny TAILORED:
   │                          │        allow the approved op + reversible work, deny other irreversible)
   │                  `proposed_call_granted` re-dispatches session 2;
   │                  agent re-attempts; the native gate permits only the approved scope;
   │                  the tailored policy is consumed once
   │                          │
   │                    ┌─────┴─────┐
   │                 executed     failed   (Outcome written; terminal)
   │
   └── non-approving verdict (request-changes / edit / reject) ──▶ held (never executed)
```

`held` is terminal for this resolution; a re-open + fresh approve mints a new tailored policy **only if the call never executed**. `executed`/`failed` are terminal and never re-run (retry = a new Proposed Call). There is **no kernel `executing` state** — HyperIdle never holds an in-flight execution; the agent's session does.

## Outcome

The recorded terminal result — `{ status: ok | failed, receipt | error, executedAt }`. Written **from session 2's real tool return**, after the agent's tool runs; **immutable once recorded** (PK = Proposed-Call id enforces 0..1 and no overwrite); surfaced where the Proposed Call's canvas rendered. A failure is an Outcome with `status: failed` and a surfaced error — **never** missing/silent.

## Authority

The **agent produces** the Proposed Call by attempting the denied call (the deny-with-record hook captures it). The human **verdict** authorizes (commit authority). The **agent's own session executes** the call in session 2 under the tailored native allow/deny, with its own tools/credentials. HyperIdle **owns** the capture record, the tailored policy, and the Outcome record — the *bookkeeping of the gate*, never the execution. Source of truth for "did it happen" is the **Outcome**.

## The verdict reshape

Grammar unchanged — five decisions, `approve` stays `approve`. An `approve` / `approve-with-comments` on a Subject is the **commit trigger**: it composes the tailored allow/deny for the Subject's Proposed Call(s) and re-provisions the session. Non-approving verdicts hold them. A consequence added to an existing action — not a new verdict action, not changed authorization.

## Contracts

- **Cardinality.** Proposed Call → exactly 1 review message (gate) + 1 subject thread (anchor); Proposed Call → 0..1 Outcome; tailored policy → exactly 1 approved Proposed Call, valid in exactly 1 session-2 re-provision.
- **Closure.** The tool/args vocabulary is **OPEN** — any tool the agent can call can be captured; HyperIdle enumerates nothing. Reversibility is **CLOSED** (`irreversible | reversible`).
- **Mutability.** The captured tool id + args are **immutable once captured** (what the human reviewed — no rebind, no TOCTOU). Outcome immutable once recorded.
- **Identity.** Opaque stable Proposed-Call id; the (tool id, normalized args) hash is **optional metadata** for the arg-pin optimization, NOT the safety gate.

## Hard rules

1. **HyperIdle executes nothing of its own.** The agent's own session/tools/credentials run the call. HyperIdle tailors the native allow/deny at init, captures the deny, records the outcome — never calls a tool from its own process or creds.
2. **Session 2 cannot execute any irreversible op other than the approved one.** The tailored native allow/deny enforces this — the safety floor. (Arg-level exactness is the optimization frontier.)
3. **Two-session async resume, not live pause.** Deny ends session 1; approve re-provisions session 2 via the task-dispatcher rail with the tailored policy.
4. **Tailored native scope is the gate; byte-fidelity is an optional arg-pin.** No exact-hash-match-to-permit. No deadlock on arg drift.
5. **Reversible flows; irreversible gates.** Reversible calls are allowed at the gate with no review (auto-flow per trust is AL8). Only irreversible calls are captured → reviewed.
6. **A non-approving verdict never executes.** Held Proposed Calls are never granted a tailored policy.
7. **Verdict grammar unchanged.**
8. **Failure surfaces** as a `failed` Outcome — never silently swallowed.
9. **Done only on a LIVE call, on ALL four supported harnesses** — a real irreversible tool call executes LIVE through the agent's own tools + adapter + sandbox AND the agent continues working, on builtin, Claude, Codex, and opencode. No fixture/stub proof. An adapter that genuinely cannot express the tailored allow/deny is a build finding, not a silent deferral.
10. **Gate and bookkeeper, not executor** — HyperIdle gates + records; the agent's tools execute ([system boundary](../architecture/system-boundary.md)).
11. **Init-time permission config, not async hold** — enforcement is the init-time allow/deny config every harness has; no net-new async-approval transport for the AL7 floor.

## Vocabulary

| Term | Definition | Aliases not to use |
|---|---|---|
| **Proposed Call** | The exact captured tool call (id + bound args) the gate denied, reviewed as a subject. | staged operation, staged op, `StagedOperationSpec`, dispatchable capability |
| **Permission gate** | Harness-native allow/deny at session init, with a deny-with-record hook for capture. | dispatcher, executor, kernel dispatch, capability map |
| **Tailored allow/deny policy** | Session-2 init policy narrowed to allow the approved op + reversible work, deny other irreversible; consume-once. | one-shot grant (retired as mechanism), replay grant, dispatch claim, exact-hash grant |
| **Arg-pin (optimization)** | Optional per-harness tightening of the allow to the approved tool *with these exact args*. | byte-faithful replay, deterministic registry replay, canUseTool arg-override (techniques, not the gate) |
| **Two-session resume** | Deny in session 1 → review → re-provision session 2 with the tailored policy. | pause/resume, suspend, live continuation |
| **Consequence** | What an approve sets in motion (internal state move or external tool call). | side-effect, effect |
| **Reversibility / irreversible** | Whether a consequence can be undone; the classifier that decides gating. | risk level, criticality |
| **Trust signal** | The agent's verdict-history approval rate; crossed with risk to gate or flow. | graduated autonomy, per-skill autonomy level (removed — AD4), per-tool risk table |
| **Outcome** | Recorded terminal result (ok/failed + receipt/error), from session 2's real return. | result (banned Artifact alias), response |

## How the loop works (as-designed, AL7 redo)

1. **Session 1 — deny + capture + end.** The session's init permission policy (carried on `SessionConfig`, translated per adapter) denies irreversible calls. When the agent attempts one, the harness's deny-with-record hook captures `{toolId, args}` and writes a **Proposed Call** (status `captured`) anchored to a review message + subject thread — **idempotently per `(origin session, identity)`** so a retry mints no duplicate. The review canvas (`reviews.ts`) renders it. On first capture the wrapper **terminates session 1 via the abort rail** (`sessionRunRegistry.abort` → `stopSession` → the builtin loop's `aborted` flag), so a denied call cannot loop and retry with drifted args. Work paused (not suspended).
2. **Review — verdict.** `threads.ts` resolves the verdict (first-verdict-wins, 409 on race, re-open). On `approve`/`approve-with-comments`, compose the **tailored allow/deny policy** for the approved Proposed Call (allow the approved op + reversible; deny other irreversible), record it scoped to task id + agent id (session 2's id does not exist yet), and emit a **`proposed_call_granted`** event that **explicitly re-dispatches** session 2 (the task-dispatcher's same-owner resume is not triggered by the owner-change `session_ended` path). A non-approving verdict leaves the Proposed Call `held`.
3. **Session 2 — resume under the tailored native policy (per harness).** The task-dispatcher re-provisions session 2 (same task + same agent); each adapter translates the policy to its native allow/deny + sandbox scope at init (builtin: the `registry.invoke` gate; Claude: `permissionMode` + allow/deny lists, optionally a `PreToolUse` arg-pin; Codex: `approval_policy`/`sandbox_mode`/allow flags at spawn; opencode: `permission` config at spawn). The agent re-attempts the work; the native gate permits **only the approved scope**. The agent's own tool runs the approved call; the real return is recorded as the **Outcome**; the policy is consumed once; the agent **continues working** in session 2. **Fallback:** if session 2 ends without the approved op executing, HyperIdle re-provisions once more; a second miss surfaces a `failed` Outcome and holds the call — never a silent hang.

> **Not `assembleContext`, not `SessionConfig.messages`.** Context assembly writes retrieved knowledge to disk and returns only counts. Seeding the call into the message history only feeds the LLM as *context* — it does not narrow the permission scope. The guarantee is the tailored native allow/deny at init, applied through the adapter.

## Per-harness implementation surface

| Harness | Init allow/deny (the gate) | Capture (deny+record) | Arg-pin (optional optimization) |
|---|---|---|---|
| **builtin (api-gateway)** | the `registry.invoke` gate — HyperIdle owns the loop; allow reversible + (session 2) the approved op, deny other irreversible | deny + record at `registry.invoke` | in-process arg check at `registry.invoke` |
| **Claude Code (Agent SDK)** | `permissionMode` + `allow`/`deny` tool lists in settings, narrowed at init | `canUseTool`/`PreToolUse` deny + log the attempted call | pin/check args in `PreToolUse`/`canUseTool` |
| **Codex** | `approval_policy` + `sandbox_mode` + allow flags injected as spawn template args | record from the native approval signal (auto-deny irreversible at init) | arg/command-pattern match where the permission grammar supports it |
| **opencode** | `permission` allow/ask/deny config injected as spawn template args | record from the native permission decision | command/arg pattern in the permission config where supported |

cursor-agent is `unavailable` (`harness-capability-descriptors.ts:11`) and skipped. The **uniform in-process record point + tailored-policy consume is `registry.invoke`**; the **gate itself is per-adapter native allow/deny at init**, translated from one `SessionPermissionPolicy` on `SessionConfig`. AL7's live proof runs end-to-end on **all four** supported harnesses, each through its own adapter + sandbox.

## Scope deferrals (honest)

- **Trust-signal auto-flow** for reversible calls — AL8. AL7 is the gated arm only.
- **Arg-pin tightening** beyond name/pattern scope — layered per harness where arg-level scope exists; the documented optimization frontier (name-scoped allow could permit the same tool with different args) is acceptable per founder direction.
- **Codex app-server JSON-RPC / opencode SSE async transports** — NOT required for the AL7 floor (enforcement is init-time config). If any adapter genuinely cannot express the tailored allow/deny at init for the live proof, that surfaces as a build finding.
- **Multi-step transactional rollback** beyond a single Proposed Call's own semantics — out of scope.

## Rationale

AL1–AL4 built the *review*; the action-operation canvas approved into the void. The first AL7 gave it teeth the wrong way — HyperIdle's kernel re-executed via a curated capability map (rejected as "yet another integration layer"). The byte-faithful redo correctly inverted ownership but bet the guarantee on deterministic replay — a hash-match gate that deadlocks on LLM arg drift and is harness-specific. The locked model puts the guarantee where every harness already has it: **the native allow/deny permission config set at session init.** On approve, session 2 is re-provisioned with that config **tailored** to the approved op + reversible work, denying everything else irreversible; the agent's own session executes within the narrowed scope. Because HyperIdle sessions are async and not pausable, the loop spans **two sessions** — deny in session 1, review, re-provision session 2 with the tailored policy. This dissolves the replay-fidelity/deadlock problem (no exact-match-to-permit), works through the same init-time config on all four supported harnesses (no net-new async transport), and keeps byte-fidelity as an honest optimization where a harness expresses arg-level scope.

Still-valid framing preserved: reversibility-not-familiarity as the classifier, the earned verdict-history trust signal (no per-tool risk table), and ETHOS §3's permanent thin gate on the irreversible. What changed is the **execution mechanism** — from kernel-executes (v1) and byte-faithful-replay (v2) to **tailor-the-native-allow/deny-at-init**, byte-fidelity demoted to an optimization.

Concept: `plans/AL7/concept.md`. Next: [Review primitive](../human-interface-layer/review-primitive.md) · [Harness capability descriptor](../agent-layer/harness-capability-descriptor.md) · [Trust-building](../human-interface-layer/trust-building-slow-cumulative.md) · [System boundary](../architecture/system-boundary.md).
