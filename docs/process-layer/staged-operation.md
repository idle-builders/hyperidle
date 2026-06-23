# Review-gated execution: the Proposed Call (AL7)

> **Noun change (AL7 redo, 2026-06-24).** The first AL7 shipped a **Kernel-held executor** — an agent staged a fully-bound op and HyperIdle's kernel re-ran it via a curated `executeCapability` map gated by a `KERNEL_DISPATCHABLE_CAPABILITIES` allowlist. The founder rejected this as "yet another integration layer." This doc supersedes that model. The load-bearing noun **`Staged Operation` is retired; the noun is now `Proposed Call`.** File path kept stable (cross-refs point here); title and model rewritten. Concept: `plans/AL7/concept.md`.

The executable backbone of **plan → review → act**. Approving a review is what makes an agent's work actually *happen* in the world — the refund fires, the deploy lands, the email sends. But **HyperIdle executes nothing**: it rides the harness's native permission gate, captures the exact call the agent attempted, surfaces it for review, and on approve permits the **agent's own session** to run that one call, once. HyperIdle is the **gate and the bookkeeper**; the agent's own tools + credentials are the **executor** ([system boundary](../architecture/system-boundary.md)).

The whole design rests on one line from [ETHOS](../../ETHOS.md) §3 (User Sovereignty): **never make an irreversible decision without a human — but never put a human in front of a reversible one.**

## The frame: every approve has consequences

A review is a decision point, and a decision moves the world. There is no consequence-free review — even approving a chart at minimum **resolves its work** (closes the task, advances the bet) and may **launch the next step**. A **consequence** is either **internal** (a HyperIdle state move) or **external** (a call to a connected tool). The question is never *whether* something happens on approve — it is *what*, and *whether it can be undone*.

## The classifier: reversibility, not familiarity

The gate exists for **irreversible** consequences. Reversible consequences flow at the agent's earned autonomy and do not interrupt a human ([trust-building](../human-interface-layer/trust-building-slow-cumulative.md) §10). A brand-new, never-seen, *reversible* tool just runs — it can be undone. **Unknown does not mean gated.** Gating the unfamiliar-but-reversible is the approval fatigue that drowned the first generation of agent tools; ETHOS §3 names the real line — *irreversibility*. The dangerous quadrant (irreversible **and** not-yet-trusted) is rare, and surfacing exactly that is the product, not friction.

## The safety mechanism: block at the gate, capture the attempt

HyperIdle does not provision a separate "draft verb" to the agent and hold the "live verb" itself (that was the rejected capability-split-via-kernel model). Instead:

- The **harness's native permission gate** is configured at session init to **allow reversible calls** and **block irreversible ones**.
- When the agent attempts a blocked (irreversible) call, a thin **HyperIdle wrapper** on the uniform tool chokepoint (`registry.invoke`) **intercepts and captures the exact bound call** — the tool id + the verbatim arguments — as a **Proposed Call**, the subject the human reviews.
- The agent still iterates freely against reversible affordances (a git branch, a Stripe test key, a draft) — those calls are allowed at the gate. Only the one irreversible commit verb is captured and routed to review.

The reviewer always sees two things: **the proof** (diff / rendered email / field deltas — which picks the AL2 canvas) and **the one captured commit verb** (the Proposed Call) behind approve.

## The enforcement: ride the native gate, own the one-shot grant

> The agent attempts the call; HyperIdle decides whether it reaches the world.

The irreversible call is **blocked at the harness's native gate** in session 1, so a misbehaving or jailbroken agent cannot fire it early. HyperIdle never re-implements or re-executes the call. On approve, HyperIdle mints a **one-shot grant** and re-provisions **session 2** with that one call permitted — *once, exactly as captured*. The wrapper enforces what no native gate can express ("allow THIS exact call, once"). Layered, primary→backstop:

1. **Native gate at init** (primary) — irreversible calls are blocked by the harness's own permission system (SDK `canUseTool`/`permissionMode`; Codex `approval_policy`; opencode `permission`; builtin via `registry.invoke`).
2. **Sandbox boundary** — no side-door egress (shell, raw HTTP, another MCP server) around the gate.
3. **One-shot grant** (the teeth) — session 2 may run only a call whose **identity** matches an approved Proposed Call, consumed atomically on first match. Any non-matching call is blocked like any other.

Who classifies a verb as gated is **not the agent** — it is resolved from the consequence's *reversibility* (verb, MCP `destructiveHint`/`idempotentHint`, native undo/test affordance) crossed with the agent's **trust signal** (verdict-history approval rate). Both are Kernel/Strategy-owned.

## The single signal: earned trust from verdict history

There is **no per-tool risk table or allowlist matrix** (the enterprise smell HyperIdle rejects — and the reason the first AL7's `KERNEL_DISPATCHABLE_CAPABILITIES` allowlist was wrong). The trust signal is **earned, not configured**: an agent's **approval rate over its recent verdict history**, computed by the policy engine (`packages/fabric/src/services/policy-engine.ts`). It is classification, no-manual-dial, and learning in one. The ratchet is **cold-start-safe** (too few verdicts → everything surfaced), and there is a **floor trust cannot cross** — irreversible consequences stay gated regardless of approval rate.

> **Implementation note (AD4 / AL7 / AL8).** The per-skill autonomy ladder (L1→L4) was removed by **AD4** in favor of the verdict-history approval rate; surviving `autonomyLevel` data is vestigial (removed by **AL9**). **AL7 ships only the gated arm** — every irreversible Proposed Call waits for an explicit human approve. Wiring the trust signal so *reversible* calls auto-flow at the gate (and reconciling reversibility with the policy engine's `riskTier`) is **AL8**.

## Definition

A **Proposed Call** is the exact, fully-bound tool call (tool id + verbatim arguments) that an agent **attempted** and the gate **blocked**, captured verbatim as the subject a human reviews. A record/snapshot — not an event, not a command HyperIdle will run, not the act of executing.

## Essential properties

- **Tool identity** — the harness/MCP tool name the agent called.
- **Bound arguments** — the exact `input` object, verbatim. No late binding.
- **Canonical identity** — a deterministic hash over (tool id, normalized args). The value the one-shot grant matches and consumes; what makes "executed == reviewed" enforceable.
- **Reversibility** — `irreversible | reversible` (only irreversible calls are captured).
- **Origin** — the blocked session it came from + the task/thread it anchors.
- **Gate** — the review message that gate-keeps it.
- **Status** — `captured → granted → executed | failed`, or `held`.

It carries **no** HyperIdle-side executor reference and **no** capability-allowlist membership — those were the rejected model.

## What it is not

- **Not a Kernel-executed operation.** HyperIdle does not run the tool. The agent's own session/tools/credentials do.
- **Not a curated capability allowlist.** No `KERNEL_DISPATCHABLE_CAPABILITIES`. The gate, capture, and grant are all generic; HyperIdle never needs to know what a tool *means*.
- **Not a live session pause / native held "ask."** HyperIdle sessions are detached one-shots, not pausable; the review spans **two sessions** with context reassembly.
- **Not an agent-authored spec.** There is no `stage_operation` tool. The subject is the *real attempted call*, captured at the gate — an agent-authored spec could drift or lie.
- **Not re-derived on approve.** Session 2 **replays** the captured call; it does not re-plan it with the tool now unblocked (re-derivation risks drift — a different PR, a larger refund).
- **Not a verdict.** The verdict authorizes; the Proposed Call is authorized.
- **Not a `ToolCallSummary`.** That records a reversible action the assistant *already ran* (AD8b). A Proposed Call is the not-yet-run irreversible call routed to review.
- **Not the `action_operation` canvas.** The canvas renders a *view*; the Proposed Call is the backing captured call.
- **Not carried by the `thread_resolved` event payload** as execution authority. Events are at-least-once and carry references, not the grant.

## Lifecycle

```
captured ──(blocked at gate in session 1; wrapper records the exact call)
   │
   ├── approve verdict ──▶ granted ──(one-shot grant minted, scoped to session 2)
   │                          │
   │                  session 2 re-provisioned (task-dispatcher rail);
   │                  agent re-attempts the call; wrapper matches identity,
   │                  consumes the grant once, permits it
   │                          │
   │                    ┌─────┴─────┐
   │                 executed     failed   (Outcome written; terminal)
   │
   └── non-approving verdict (request-changes / edit / reject) ──▶ held (never executed)
```

`held` is terminal for this resolution; a re-open + fresh approve may mint a new grant **only if the call never executed**. `executed`/`failed` are terminal and never re-run (retry = a new Proposed Call with a new identity). There is **no kernel `executing` state** — HyperIdle never holds an in-flight execution; the agent's session does.

## Outcome

The recorded terminal result — `{ status: ok | failed, receipt | error, executedAt }`. Written **from session 2's real tool return**, after the agent's tool runs; **immutable once recorded** (PK = Proposed-Call id enforces 0..1 and no overwrite); surfaced where the Proposed Call's canvas rendered. A failure is an Outcome with `status: failed` and a surfaced error — **never** missing/silent.

## Authority

The **agent produces** the Proposed Call by attempting the blocked call (the wrapper captures it). The human **verdict** authorizes (commit authority). The **agent's own session executes** the call in session 2 with its own tools/credentials. HyperIdle **owns** the capture record, the one-shot grant, and the Outcome record — the *bookkeeping of the gate*, never the execution. Source of truth for "did it happen" is the **Outcome**, written from the real tool return.

## The verdict reshape

Grammar unchanged — five decisions, `approve` stays `approve`. An `approve` / `approve-with-comments` on a Subject is the **commit trigger**: it mints the one-shot grant(s) for the Subject's Proposed Call(s) and re-provisions the session. Non-approving verdicts hold them. A consequence added to an existing action — not a new verdict action, not changed authorization.

## Contracts

- **Cardinality.** Proposed Call → exactly 1 review message (gate) + 1 subject thread (anchor); Proposed Call → 0..1 Outcome; one-shot grant → exactly 1 Proposed Call, valid in exactly 1 session.
- **Closure.** The tool/args vocabulary is **OPEN** — any tool the agent can call can be captured; HyperIdle enumerates nothing. Reversibility is **CLOSED** (`irreversible | reversible`).
- **Mutability.** The captured tool id + args + identity hash are **immutable once captured** (they are what the human reviewed — no rebind, no TOCTOU). Outcome immutable once recorded. The trust signal changes only as verdicts accumulate.
- **Identity.** Opaque stable Proposed-Call id; the **canonical identity hash** (tool id + normalized args) is the at-most-once execution identity the grant matches and consumes.

## Hard rules

1. **HyperIdle executes nothing.** The agent's own session/tools/credentials run the call. HyperIdle captures, permits, and records.
2. **Executed == reviewed, once.** Session 2 may run only a call whose identity matches an approved Proposed Call, exactly once (atomic consume, mirroring first-verdict-wins `WHERE resolvedAt IS NULL` in `threads.ts`). A non-matching call is blocked like any other.
3. **Two-session async resume, not live pause.** Block ends session 1; approve re-provisions session 2 via the task-dispatcher rail; the agent re-attempts and the grant permits.
4. **Replay, not re-derive.** Session 2 runs the captured call; it does not recompute it.
5. **Reversible flows; irreversible gates.** Reversible calls are allowed at the gate with no review (auto-flow per trust is AL8). Only irreversible calls are captured → reviewed.
6. **A non-approving verdict never executes.** Held Proposed Calls are never granted.
7. **Verdict grammar unchanged.**
8. **Failure surfaces** as a `failed` Outcome — never silently swallowed.
9. **Done only on a LIVE call** — a real tool call executes LIVE through the agent's own tools AND the agent continues working after the review. No fixture/stub proof.
10. **Gate and bookkeeper, not executor** — HyperIdle gates + records; the agent's tools execute ([system boundary](../architecture/system-boundary.md)).

## Vocabulary

| Term | Definition | Aliases not to use |
|---|---|---|
| **Proposed Call** | The exact captured tool call (id + bound args) the gate blocked, reviewed as a subject. | staged operation, staged op, staged action, `StagedOperationSpec`, dispatchable capability |
| **Permission gate** | Harness-native allow/deny at session init, wrapped by HyperIdle for capture + grant. | dispatcher, executor, kernel dispatch, capability map |
| **One-shot grant** | Session-2 permission to run exactly one Proposed Call, matched by identity, consumed once. | approval token, dispatch claim, execution lock |
| **Two-session resume** | Block in session 1 → review → re-provision session 2 with the grant. | pause/resume, suspend, live continuation |
| **Consequence** | What an approve sets in motion (internal state move or external tool call). | side-effect, effect |
| **Reversibility / irreversible** | Whether a consequence can be undone; the classifier that decides gating. | risk level, criticality |
| **Trust signal** | The agent's verdict-history approval rate; crossed with risk to gate or flow. | graduated autonomy, per-skill autonomy level (removed — AD4), per-tool risk table |
| **Outcome** | Recorded terminal result (ok/failed + receipt/error), from session 2's real return. | result (banned Artifact alias), response |

## How the loop works (as-designed, AL7 redo)

1. **Session 1 — block + capture.** The session's permission policy (carried on `SessionConfig`, translated per adapter) blocks irreversible calls. When the agent attempts one, the wrapper on `registry.invoke` intercepts, computes the identity hash, and writes a **Proposed Call** (status `captured`) anchored to a review message + subject thread. The review canvas (`reviews.ts`) renders it. Session 1 ends — work paused (not suspended).
2. **Review — verdict.** `threads.ts` resolves the verdict (first-verdict-wins, 409 on race, re-open). On `approve`/`approve-with-comments`, mint a **one-shot grant** `{ proposedCallId, identityHash, sessionScope, consumed: false }`. A non-approving verdict leaves the Proposed Call `held`.
3. **Session 2 — resume + replay.** The task-dispatcher rail (`session_ended`/`task_state_changed` → `provisionSession` → `strategy.assembleContext`) re-provisions session 2 with context reassembled, seeded with the approved Proposed Call so the agent re-issues it, and the permission policy now carrying the grant. The agent re-attempts the call; the wrapper hashes it, finds the matching unconsumed grant, **atomically consumes it** (`WHERE consumed = false`), and permits the call **once**. The agent's own tool runs it; the real return is recorded as the **Outcome**. The agent **continues working** in session 2.

## Per-harness implementation surface

| Harness | Native gate | AL7 work |
|---|---|---|
| **builtin (api-gateway)** | none — HyperIdle owns the loop | config: gate at `registry.invoke` (its own dispatch). Block + capture + one-shot grant live here. |
| **Claude Code (Agent SDK)** | `permissionMode` + `allowedTools`/`disallowedTools` at init; `canUseTool(tool,input)` callback; `PreToolUse` hooks | **net-new wiring** — the production `ClaudeAgentSdkAdapter` wires only `permissionMode` today; `canUseTool` is the per-adapter dressing. The capture/grant source of truth is `registry.invoke` (MCP-routed). |
| **Codex** | `approval_policy`/`sandbox_mode` at init; `execCommandApproval`/`applyPatchApproval` JSON-RPC at call-time | **net-new transport** — CLI adapter is stdout-only today; bidirectional app-server transport is required for the native call-time gate. `registry.invoke` covers the MCP path. |
| **opencode** | `permission` allow/ask/deny in config; `permission.asked` SSE + reply | **net-new transport** — SSE reply channel. `registry.invoke` covers the MCP path. |

The **uniform seam is `registry.invoke`** (`tool-registry.ts:274`) — the one chokepoint all tool paths funnel through (builtin internal + all MCP-routed SDK/CLI tools). Native gates are dressing on top (block at the harness edge for UX); `registry.invoke` is the source of truth for capture + one-shot enforcement.

## Scope deferrals (honest)

- **Trust-signal auto-flow** for reversible calls — AL8. AL7 is the gated arm only.
- **Broad per-tool coverage / per-adapter native-gate transports** beyond what the live-proof path needs — AL7 proves the loop + at least one real tool path; Codex app-server and opencode SSE transports are net-new and may be follow-on if the live proof runs through SDK/builtin.
- **Multi-step transactional rollback** beyond a single Proposed Call's own semantics — out of scope.

## Rationale

AL1–AL4 built the *review*; the action-operation canvas approved into the void. The first AL7 gave it teeth the wrong way — HyperIdle's kernel re-executed the agent's operation via a curated capability map, which the founder rejected as "yet another integration layer." The redo inverts ownership: HyperIdle owns the *gate bookkeeping* and rides the harness's native permission system; the agent's own session executes. Because HyperIdle sessions are async and not pausable, the loop spans **two sessions** — block in session 1, review, re-provision session 2 with a one-shot grant. The wrapper exists because native permission systems gate by tool *name*, not by *this exact call once* — without it, an approved "merge PR #42" could become "merge PR #99" in session 2. Replay (not re-derive) + identity-hash-matched single-use grants are what make the human's approval mean exactly what they saw.

Still-valid framing preserved from the original concept: reversibility-not-familiarity as the classifier, the earned verdict-history trust signal (no per-tool risk table), and ETHOS §3's permanent thin gate on the irreversible. What changed is purely the **execution mechanism** — from kernel-executes to ride-the-native-gate-and-grant-once.

Concept: `plans/AL7/concept.md`. Next: [Review primitive](../human-interface-layer/review-primitive.md) · [Harness capability descriptor](../agent-layer/harness-capability-descriptor.md) · [Trust-building](../human-interface-layer/trust-building-slow-cumulative.md) · [System boundary](../architecture/system-boundary.md).
