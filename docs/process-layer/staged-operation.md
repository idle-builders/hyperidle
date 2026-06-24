# Review-gated execution: the Proposed Call (AL7)

> **Model change (AL7 redo, 2026-06-24).** This doc supersedes three earlier models. (1) The first AL7 shipped a **Kernel-held executor** (HyperIdle re-ran the agent's op via a curated `executeCapability` map) — rejected as "yet another integration layer." (2) A redo made **byte-faithful replay** (exact-hash-match-to-permit) the load-bearing gate — deadlocks on LLM arg drift. (3) A reshape made **per-harness native allow/deny the safety floor** — infeasible on Codex (no per-op grammar, no external approval event in `codex exec`) and unreliable on opencode (headless `run` may auto-approve). **The safety mechanism is now HyperIdle's own broker chokepoint at `registry.invoke` — a uniform floor across every harness;** harness-native allow/deny is demoted to per-harness defense-in-depth tightening, and byte-fidelity to an optional optimization. The load-bearing noun **`Staged Operation` is retired; the noun is `Proposed Call`.** File path kept stable. Concept: `plans/AL7/concept.md`.

The executable backbone of **plan → review → act**. Approving a review is what makes an agent's work actually *happen* — the refund fires, the deploy lands, the email sends. But **HyperIdle executes nothing**: it brokers the credential, captures the exact call the agent attempted at its own chokepoint, surfaces it for review, and on approve re-provisions the **agent's own session** so it can run the approved op and nothing else irreversible. HyperIdle is the **gate, broker, and bookkeeper**; the agent's own tools + the HyperIdle-held credential are the **executor** ([system boundary](../architecture/system-boundary.md)).

The whole design rests on one line from [ETHOS](../../ETHOS.md) §3 (User Sovereignty): **never make an irreversible decision without a human — but never put a human in front of a reversible one.**

## The frame: every approve has consequences

A review is a decision point, and a decision moves the world. Even approving a chart **resolves its work** (closes the task, advances the bet) and may **launch the next step**. A **consequence** is either **internal** (a HyperIdle state move) or **external** (a call to a connected tool). The question is never *whether* something happens on approve — it is *what*, and *whether it can be undone*.

## The classifier: reversibility, not familiarity

The gate exists for **irreversible** consequences. Reversible consequences flow at the agent's earned autonomy and do not interrupt a human ([trust-building](../human-interface-layer/trust-building-slow-cumulative.md) §10). A brand-new, never-seen, *reversible* tool just runs — it can be undone. **Unknown does not mean gated.** Gating the unfamiliar-but-reversible is the approval fatigue that drowned the first generation of agent tools; ETHOS §3 names the real line — *irreversibility*.

## The safety mechanism: HyperIdle's own broker floor at `registry.invoke`

Irreversible LIVE operations are **HyperIdle-brokered**. The live credential is **HyperIdle-held and never present in the agent's sandbox** (the capability split + AN sandbox provisioning). So the only way an irreversible live op can happen is through the **brokered tool** — and every brokered / MCP-routed tool call funnels through the **same per-session chokepoint, `registry.invoke`** (`tool-registry.ts:274`). HyperIdle gates allow/deny + captures there.

This is the **uniform safety floor**: the gate lives in HyperIdle's own code on the one path the brokered irreversible call must take, so it holds **on every harness — builtin, Claude, Codex, opencode — regardless of the harness's native permission grammar.** A harness with no per-op permission system (Codex) still cannot reach an unapproved irreversible op: there is no credential in its sandbox to do it with, and its brokered call hits the floor.

- **Session 1** — the broker floor allows reversible calls and **denies irreversible ones**. When the agent's brokered/MCP-routed irreversible call reaches `registry.invoke`, the floor denies it and records the exact bound call — tool id + verbatim args — as a **Proposed Call**, the subject the human reviews.
- **Session 2 (on approve)** — the session is re-provisioned with a **tailored broker policy** consumed at the floor: **allow the approved operation (plus reversible work) and nothing else irreversible.** That narrowing IS the guarantee. The agent re-attempts; the floor permits only the approved scope. The policy is consumed once at `registry.invoke`.

The reviewer always sees two things: **the proof** (diff / rendered email / field deltas — which picks the AL2 canvas) and **the one captured commit verb** (the Proposed Call) behind approve.

### The broker floor is NOT the v1 kernel executor

The v1 executor had a **hardcoded capability map** and re-ran the call **from HyperIdle's own process as a HyperIdle action**. The broker floor has **no capability map**, re-implements **no tool**, and runs **nothing of its own**. It sits on the path the agent's *own* brokered call already takes: it attaches the HyperIdle-held credential (the AN injection model) and decides allow/deny/capture. The executor is still the agent's harness emitting the call; the tool's own handler runs it. Gating the agent's own call at a chokepoint is the gate-and-bookkeeper role HyperIdle already plays at `registry.invoke` — not re-execution.

## Native allow/deny is defense-in-depth tightening, not the floor

Each harness's *own* permission grammar is added **on top of** the broker floor where it exists — a bonus layer, never the safety mechanism:

| Harness | Broker floor (the safety mechanism) | Native tightening (defense-in-depth, where the grammar expresses it) |
|---|---|---|
| **builtin** | `registry.invoke` IS the floor (HyperIdle owns the loop, `:741`) | n/a — the floor is the gate |
| **Claude (Agent SDK)** | brokered MCP call funnels through `registry.invoke` (`mcp-bridge.ts:132`) | `allowedTools`/`disallowedTools` + `canUseTool` (arg-level) — verified |
| **Codex** | brokered MCP call funnels through `registry.invoke`; the live credential is never in the Codex sandbox | **none usable** — only coarse global `--sandbox` (`read-only`/`workspace-write`/`danger-full-access`); no per-op allowlist; no external-readable approval event in `codex exec` |
| **opencode** | brokered MCP call funnels through `registry.invoke` | `opencode.json`/frontmatter `permission` allow/ask/deny (last-match-wins) — **bonus only**; docs indicate non-interactive `run` may auto-approve, so not relied upon |

Because the floor is the broker chokepoint, AL7 needs **none** of the net-new async-approval transports (Codex app-server JSON-RPC, opencode SSE). Capture is **synchronous deny+record** at `registry.invoke`, the one place the tailored policy is consumed once.

## Byte-fidelity is an optimization, not the gate

An earlier redo made session 2 re-run the captured call **byte-faithfully** — permitting exactly the captured bytes via a SHA-256 match. That is **demoted**: a hash-match gate deadlocks the approved work on any LLM arg drift (`42` vs `42.0`) and is fragile.

The gate is the **tailored broker policy at `registry.invoke`**, which forbids *other* irreversible ops regardless of arg drift. Byte-fidelity survives only as an **optional arg-pin**: tighten "the approved tool" to "the approved tool with exactly these args" where a layer expresses arg-level scope — builtin checks args in-process at `registry.invoke`; Claude pins args in a `canUseTool` hook. There is **no exact-hash-match-to-permit**, so **no deadlock**.

## The residual — the optimization frontier (stated plainly)

The **safety floor** is: *session 2 cannot execute any irreversible op other than the approved one.* Where the allow check scopes only by tool **name** (not exact args), session 2 could permit the **same approved tool with different args** (approve "refund $10", a drifted "refund $50" on the same tool would also pass a name-scoped allow). This is the **optimization frontier**, not a hole in the floor: the floor still holds (no *other* irreversible op runs; an *unrelated* irreversible op is denied + re-captured), and the arg-pin tightens it where arg-level scope exists. **Acceptable per founder direction** — surfaced openly, not hidden.

## The single signal: earned trust from verdict history

There is **no per-tool risk table or allowlist matrix** (the enterprise smell HyperIdle rejects — and why the first AL7's `KERNEL_DISPATCHABLE_CAPABILITIES` allowlist was wrong). The trust signal is **earned**: an agent's **approval rate over its recent verdict history**, computed by the policy engine (`packages/fabric/src/services/policy-engine.ts`). Cold-start-safe (too few verdicts → everything surfaced), with a **floor trust cannot cross** — irreversible consequences stay gated regardless of approval rate.

> **Implementation note (AD4 / AL7 / AL8).** The per-skill autonomy ladder (L1→L4) was removed by **AD4** in favor of the verdict-history approval rate; surviving `autonomyLevel` data is vestigial (removed by **AL9**). **AL7 ships only the gated arm** — every irreversible Proposed Call waits for an explicit human approve. Wiring the trust signal so *reversible* calls auto-flow at the floor (and reconciling reversibility with the policy engine's `riskTier`) is **AL8**.

## Definition

A **Proposed Call** is the exact, fully-bound tool call (tool id + verbatim arguments) that an agent **attempted** and the broker floor **denied**, captured verbatim as the subject a human reviews. A record/snapshot — not an event, not a command HyperIdle will run, not the act of executing.

## Essential properties

- **Tool identity** — the harness/MCP tool name the agent called.
- **Bound arguments** — the exact `input` object, verbatim. No late binding.
- **Reversibility** — `irreversible | reversible` (only irreversible calls are captured).
- **Origin** — the denied session it came from + the task/thread it anchors.
- **Gate** — the review message that gate-keeps it.
- **Status** — `captured → granted → executed | failed`, or `held`.
- **Identity hash** *(optional metadata)* — a deterministic hash over (tool id, normalized args), consumed only by the arg-pin optimization; NOT the safety gate.

It carries **no** HyperIdle-side executor reference and **no** capability-allowlist membership — those were the rejected v1 model.

## What it is not

- **Not a Kernel-executed operation, and the broker floor is not the v1 executor.** HyperIdle does not author or re-run the tool — no capability map, no re-implementation, nothing run from its own process as a HyperIdle action. The broker floor sits on the path the agent's *own* brokered call already takes: attach the HyperIdle-held credential, decide allow/deny/capture. The agent's harness is still the executor.
- **Not a curated capability allowlist.** No `KERNEL_DISPATCHABLE_CAPABILITIES`. The floor, capture, and tailored policy are all generic; HyperIdle never needs to know what a tool *means*.
- **Not a live session pause / native held "ask."** HyperIdle sessions are detached one-shots; the review spans **two sessions**. Enforcement is the broker floor at session run time, not a held call-time ask — no net-new async transport required.
- **Not an agent-authored spec.** There is no `stage_operation` tool. The subject is the *real attempted call*, captured at the broker floor.
- **Not a byte-faithful replay gate.** Session 2 is NOT permitted by matching a hash of the captured bytes. The gate is the tailored broker policy at `registry.invoke`; byte-fidelity is an optional arg-pin.
- **Not a floor that depends on harness-native allow/deny.** Codex has no per-op grammar; opencode headless may auto-approve. The floor is HyperIdle's own chokepoint, independent of harness grammar. Native allow/deny is tightening, never the floor.
- **Not Claude-only, and not silently all-four.** Live-proven on builtin + Claude now; Codex + opencode are named net-new adapter tasks (supported-pending-adapter), not silently dropped, not falsely green.
- **Not a verdict.** The verdict authorizes; the Proposed Call is authorized.
- **Not a `ToolCallSummary`.** That records a reversible action the assistant *already ran* (AD8b). A Proposed Call is the not-yet-run irreversible call routed to review.
- **Not the `action_operation` canvas.** The canvas renders a *view*; the Proposed Call is the backing captured call.

## Lifecycle

```
captured ──(denied at the broker floor in session 1; the exact call is recorded)
   │
   ├── approve verdict ──▶ granted ──(session 2 re-provisioned; tailored broker policy:
   │                          │        allow the approved op + reversible work, deny other irreversible)
   │                  `proposed_call_granted` re-dispatches session 2;
   │                  agent re-attempts; the broker floor permits only the approved scope;
   │                  the tailored policy is consumed once at registry.invoke
   │                          │
   │                    ┌─────┴─────┐
   │                 executed     failed   (Outcome written; terminal)
   │
   └── non-approving verdict (request-changes / edit / reject) ──▶ held (never executed)
```

`held` is terminal for this resolution; a re-open + fresh approve mints a new tailored policy **only if the call never executed**. `executed`/`failed` are terminal and never re-run (retry = a new Proposed Call). There is **no kernel `executing` state** — HyperIdle never holds an in-flight execution; the agent's brokered call does.

## Outcome

The recorded terminal result — `{ status: ok | failed, receipt | error, executedAt }`. Written **from session 2's real tool return**, after the agent's brokered tool runs; **immutable once recorded** (PK = Proposed-Call id enforces 0..1 and no overwrite); surfaced where the Proposed Call's canvas rendered. A failure is an Outcome with `status: failed` and a surfaced error — **never** missing/silent.

## Authority

The **agent produces** the Proposed Call by attempting the denied call (the broker floor records it). The human **verdict** authorizes (commit authority). The **agent's own session executes** the call in session 2 through its own brokered call, with the HyperIdle-held credential attached at the floor. HyperIdle **owns** the capture record, the tailored policy, the credential brokering, and the Outcome record — the *gate, broker, and bookkeeper* role, never authoring or re-executing the tool. Source of truth for "did it happen" is the **Outcome**.

## The verdict reshape

Grammar unchanged — five decisions, `approve` stays `approve`. An `approve` / `approve-with-comments` on a Subject is the **commit trigger**: it composes the tailored broker policy for the Subject's Proposed Call(s) and re-provisions the session. Non-approving verdicts hold them. A consequence added to an existing action — not a new verdict action, not changed authorization.

## Contracts

- **Cardinality.** Proposed Call → exactly 1 review message (gate) + 1 subject thread (anchor); Proposed Call → 0..1 Outcome; tailored policy → exactly 1 approved Proposed Call, valid in exactly 1 session-2 re-provision.
- **Closure.** The tool/args vocabulary is **OPEN** — any tool the agent can call can be captured; HyperIdle enumerates nothing. Reversibility is **CLOSED** (`irreversible | reversible`).
- **Mutability.** The captured tool id + args are **immutable once captured** (what the human reviewed — no rebind, no TOCTOU). Outcome immutable once recorded.
- **Identity.** Opaque stable Proposed-Call id; the (tool id, normalized args) hash is **optional metadata** for the arg-pin optimization, NOT the safety gate.

## Hard rules

1. **HyperIdle executes nothing of its own.** The agent's own session/tools/brokered-credential run the call. HyperIdle gates + captures + brokers the credential + records the Outcome at `registry.invoke` — never authoring, re-implementing, or running a tool from its own process. (The broker floor is distinct from the v1 executor — see above.)
2. **The safety floor is the broker chokepoint, uniform on every harness.** `registry.invoke` denies every irreversible op except the approved one, because the irreversible call's credential is HyperIdle-held and the brokered call must pass through this seam — independent of any harness's native permission grammar, including Codex.
3. **Native allow/deny is defense-in-depth tightening, not the floor.** Added where the grammar expresses it (Claude, opencode, builtin); never the safety mechanism; AL7 does not depend on it for correctness.
4. **Session 2 cannot execute any irreversible op other than the approved one.** Enforced at the broker floor — the safety floor. (Arg-level exactness is the optimization frontier.)
5. **Two-session async resume, not live pause.** Deny ends session 1; approve re-provisions session 2 via the task-dispatcher rail with the tailored policy.
6. **Reversible flows; irreversible gates.** Reversible calls pass the floor with no review (auto-flow per trust is AL8). Only irreversible calls are captured → reviewed.
7. **A non-approving verdict never executes.** Held Proposed Calls are never granted a tailored policy.
8. **Verdict grammar unchanged.**
9. **Failure surfaces** as a `failed` Outcome — never silently swallowed.
10. **DONE is per-harness honest.** AL7 is DONE when the uniform broker floor is proven LIVE (real irreversible brokered call, real return, agent continues) on every harness whose adapter exists and routes to the floor (builtin + Claude). Codex + opencode are named net-new adapter tasks with explicit terminal states (the per-harness matrix below); they are `net-new-adapter-pending`, not silently dropped and not falsely green. No fixture/stub proof.
11. **Broker floor, not async hold.** Enforcement is synchronous deny+record at `registry.invoke`; no net-new async-approval transport for the AL7 floor.

## Vocabulary

| Term | Definition | Aliases not to use |
|---|---|---|
| **Proposed Call** | The exact captured tool call (id + bound args) the broker floor denied, reviewed as a subject. | staged operation, staged op, `StagedOperationSpec`, dispatchable capability |
| **Broker-gate floor** | HyperIdle's own uniform chokepoint at `registry.invoke` — allow/deny/capture/consume for every brokered + MCP-routed irreversible call, on every harness. | kernel executor, dispatcher, capability map, native permission gate (the native gate is *tightening*) |
| **Native tightening** | The harness's own allow/deny grammar added on top of the broker floor where it exists; defense-in-depth, not the safety mechanism. | the gate, the floor, the safety mechanism |
| **Tailored broker policy** | Session-2 policy consumed at the broker floor: allow the approved op + reversible, deny other irreversible; consume-once. | one-shot grant (retired as mechanism), replay grant, exact-hash grant |
| **Arg-pin (optimization)** | Optional tightening of the allow to the approved tool *with these exact args*. | byte-faithful replay, deterministic registry replay (techniques, not the gate) |
| **Two-session resume** | Deny in session 1 → review → re-provision session 2 with the tailored broker policy. | pause/resume, suspend, live continuation |
| **Consequence** | What an approve sets in motion (internal state move or external tool call). | side-effect, effect |
| **Reversibility / irreversible** | Whether a consequence can be undone; the classifier that decides gating. | risk level, criticality |
| **Trust signal** | The agent's verdict-history approval rate; crossed with risk to gate or flow. | graduated autonomy, per-skill autonomy level (removed — AD4), per-tool risk table |
| **Outcome** | Recorded terminal result (ok/failed + receipt/error), from session 2's real return. | result (banned Artifact alias), response |

## How the loop works (as-designed, AL7 redo)

1. **Session 1 — deny + capture + end (at the broker floor).** The agent's brokered/MCP-routed irreversible call reaches `registry.invoke`; the floor classifies it irreversible, denies it, and records `{toolId, args}` as a **Proposed Call** (status `captured`) anchored to a review message + subject thread — **idempotently per `(origin session, identity)`** so a retry mints no duplicate. The review canvas (`reviews.ts`) renders it. On first capture the floor **terminates session 1 via the abort rail** (`sessionRunRegistry.abort` → `stopSession` → the builtin loop's `aborted` flag), so a denied call cannot loop and retry with drifted args. Work paused (not suspended).
2. **Review — verdict.** `threads.ts` resolves the verdict (first-verdict-wins, 409 on race, re-open). On `approve`/`approve-with-comments`, compose the **tailored broker policy** for the approved Proposed Call (allow the approved op + reversible; deny other irreversible), record it scoped to task id + agent id (session 2's id does not exist yet), and emit a **`proposed_call_granted`** event that **explicitly re-dispatches** session 2 (the task-dispatcher's same-owner resume is not triggered by the owner-change `session_ended` path). A non-approving verdict leaves the Proposed Call `held`.
3. **Session 2 — resume under the tailored broker policy.** The task-dispatcher re-provisions session 2 (same task + same agent). The **broker floor** at `registry.invoke` consumes the policy via a single-statement atomic CAS: it allows the approved op once + reversible work, denies every other irreversible op. Each adapter MAY *additionally* apply native tightening at init (builtin: the floor itself; Claude: `allowedTools`/`disallowedTools`+ optional `canUseTool` arg-pin; opencode: `opencode.json` permission; Codex: coarse `--sandbox` backstop) — defense-in-depth, never the consume point. The agent re-attempts the work; the floor permits **only the approved scope**. The agent's own brokered tool runs the approved call (HyperIdle-held credential attached at the floor); the real return is recorded as the **Outcome**; the policy is consumed once; the agent **continues working** in session 2. **Fallback:** if session 2 ends without the approved op executing, HyperIdle re-provisions once more; a second miss surfaces a `failed` Outcome and holds the call — never a silent hang.

> **Not `assembleContext`, not `SessionConfig.messages`.** Context assembly writes retrieved knowledge to disk and returns only counts. Seeding the call into the message history only feeds the LLM as *context* — it does not narrow the permission scope. The guarantee is the tailored broker policy consumed at `registry.invoke`.

## Per-harness implementation surface + DONE matrix

| Harness | Broker floor (the safety mechanism) | Adapter exists + routes to floor? | Native tightening (defense-in-depth) | DONE state |
|---|---|---|---|---|
| **builtin (api-gateway)** | `registry.invoke` IS the floor — HyperIdle owns the loop (`:741`); deny+record+consume here | YES — direct (`mcpSupport:false`, calls `registry.invoke` directly, `:336`) | n/a — the floor is the gate (+ optional in-process arg-pin) | **green** — full live proof now |
| **Claude Code (Agent SDK)** | brokered MCP call funnels through `registry.invoke` (`mcp-bridge.ts:132`) | YES — SDK adapter wired; small net-new MCP-route assertion | `allowedTools`/`disallowedTools` + `canUseTool` arg-pin (verified) | **green** — full live proof now |
| **Codex** | brokered MCP call funnels through `registry.invoke`; live credential never in the Codex sandbox → only path is the brokered MCP call | **NO — net-new.** No `codex` registration in `CLI_TOOL_CONFIGS` (`adapter-pool.ts:324-353`). Build the Codex adapter + wire `{{mcpUrl}}` so the brokered call reaches the floor. | coarse global `--sandbox` backstop only (no per-op grammar, no external approval event in `codex exec`) | **net-new-adapter-pending** — supported + live-proven once the adapter exists; not silently dropped |
| **opencode** | brokered MCP call funnels through `registry.invoke` | **NO — net-new.** Registered adapter is `--dir`-only text-mode, no permission surface, **no `{{mcpUrl}}`** (`adapter-pool.ts:344-352`). Wire `{{mcpUrl}}` + `opencode run -f json` so the brokered call reaches + records at the floor. | `opencode.json`/frontmatter `permission` allow/ask/deny (last-match-wins) — bonus only; non-interactive `run` may auto-approve | **net-new-adapter-pending** — supported + live-proven once the adapter routes to the floor |
| **cursor-agent** | — | — | — | **skipped** (`unavailable`, `harness-capability-descriptors.ts:11`) |

The **uniform safety mechanism is `registry.invoke`** — the broker chokepoint, identical on every harness because the irreversible brokered call must pass through it. The native allow/deny is per-adapter *tightening*, translated from one `SessionPermissionPolicy` on `SessionConfig` where the grammar supports it. AL7's live proof runs end-to-end on builtin + Claude now; Codex + opencode each gain a live-proof lane once their net-new adapter/MCP-routing task lands. A pipeline terminates per the matrix — no lane loops forever on a harness whose adapter does not yet exist.

## Scope deferrals (honest)

- **Trust-signal auto-flow** for reversible calls — AL8. AL7 is the gated arm only.
- **Codex + opencode adapters/MCP-routing** — named net-new build tasks. AL7's broker floor is feasible on both (the credential is HyperIdle-held, never in the sandbox; the brokered call routes through `registry.invoke`), but their adapters do not yet exist/route to the floor. They are `net-new-adapter-pending`, live-proven once built — not silently dropped, not falsely green.
- **Native tightening on Codex** — not usable (global `--sandbox` only). Codex relies on the broker floor alone, which is sufficient (no credential in sandbox).
- **Arg-pin tightening** beyond name scope — layered where arg-level scope exists; the documented optimization frontier (name-scoped allow could permit the same tool with different args) is acceptable per founder direction.
- **Codex app-server JSON-RPC / opencode SSE async transports** — NOT required for the AL7 floor (enforcement is the broker chokepoint).
- **Multi-step transactional rollback** beyond a single Proposed Call's own semantics — out of scope.

## Rationale

AL1–AL4 built the *review*; the action-operation canvas approved into the void. The first AL7 gave it teeth the wrong way — HyperIdle's kernel re-executed via a curated capability map (rejected as "yet another integration layer"). The byte-faithful redo correctly inverted ownership but bet the guarantee on deterministic replay — a hash-match gate that deadlocks on LLM arg drift. The tailored-native-allow/deny reshape dissolved the deadlock but bet the guarantee on each harness's native grammar — false on Codex (no per-op allowlist, no external approval event in `codex exec`), unreliable on opencode (headless `run` may auto-approve).

The locked model puts the guarantee where HyperIdle already controls it on **every** harness: **its own broker chokepoint at `registry.invoke`.** Because irreversible live ops are brokered (the credential is HyperIdle-held, never in the sandbox), the only path to such an op is the brokered call, which funnels through the one per-session `registry.invoke` seam — so the floor holds uniformly, including on Codex, with zero dependence on the harness's permission grammar. Native allow/deny becomes a *bonus* defense-in-depth layer where the grammar supports it. This is **not** the v1 executor: there is no capability map, HyperIdle re-implements no tool, and the executor is still the agent's own brokered call — HyperIdle only gates, captures, brokers the credential, and records. Because HyperIdle sessions are async and not pausable, the loop spans **two sessions** — deny in session 1, review, re-provision session 2 with the tailored policy. This dissolves the replay-fidelity/deadlock problem (no exact-match-to-permit), needs no net-new async transport, keeps byte-fidelity as an honest optional optimization, and defines DONE per-harness honestly — live-proven on builtin + Claude now, Codex + opencode named as net-new adapter tasks.

Still-valid framing preserved: reversibility-not-familiarity as the classifier, the earned verdict-history trust signal (no per-tool risk table), and ETHOS §3's permanent thin gate on the irreversible. What changed is the **execution mechanism** — from kernel-executes (v1) and byte-faithful-replay (v2) and native-allow/deny-floor (v3) to **the broker chokepoint at `registry.invoke` as the uniform floor**, with native allow/deny demoted to defense-in-depth tightening.

Concept: `plans/AL7/concept.md`. Next: [Review primitive](../human-interface-layer/review-primitive.md) · [Harness capability descriptor](../agent-layer/harness-capability-descriptor.md) · [Trust-building](../human-interface-layer/trust-building-slow-cumulative.md) · [System boundary](../architecture/system-boundary.md).
