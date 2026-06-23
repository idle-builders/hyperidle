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

Who classifies a verb as gated is **not the agent** — it is resolved from the consequence's *reversibility* (verb, MCP `destructiveHint`/`idempotentHint`, native undo/test affordance) crossed with the agent's **trust signal** (verdict-history approval rate). Both are Kernel/Strategy-owned. The classifier is **fail-closed**: a tool with **no reversibility signal at all** defaults to `irreversible` (gated) — "unknown does not mean gated" applies to a *known-reversible* tool, not to one carrying no signal, which must never auto-fire without review.

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
- **Not re-derived on approve.** Session 2 runs the recorded call **byte-faithfully — never by trusting the LLM to reproduce the args** (an LLM is not a deterministic replayer; re-derivation risks drift — a different PR, a larger refund — which would deadlock the approved work on a hash mismatch). The recorded bytes are forced **per harness**: on **builtin**, the run loop invokes the agent's own per-session registry directly with the recorded `{toolId, args}`; on the **SDK** (production), the `canUseTool` callback returns `{behavior:"allow", updatedInput: <recorded args>}`, overwriting the LLM's args before the agent's own SDK session executes the tool. (The earlier idea of seeding the call into `SessionConfig.messages` is rejected — that seed only feeds the LLM as context; it does not force the emitted call.)
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
   │                  `proposed_call_granted` re-dispatches session 2;
   │                  session 2 runs the recorded call byte-faithfully
   │                    (builtin: direct registry.invoke of recorded args;
   │                     SDK: canUseTool updatedInput override);
   │                  wrapper matches identity, consumes the grant once, permits it
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

1. **HyperIdle executes nothing of its own.** The agent's own session/tools/credentials run the call. The builtin deterministic replay drives the agent's **own per-session registry** (`registry.invoke` — same tools + creds); the SDK `canUseTool` allows the agent's **own SDK tool** (HyperIdle only forces the recorded args via `updatedInput`). HyperIdle captures, permits, forces the recorded bytes, and records — never calls a tool from its own process or creds.
2. **Executed == reviewed, once.** Session 2 may run only a call whose identity matches an approved Proposed Call, exactly once (atomic consume, mirroring first-verdict-wins `WHERE resolvedAt IS NULL` in `threads.ts`). A non-matching call is blocked like any other.
3. **Two-session async resume, not live pause.** Block ends session 1; approve re-provisions session 2 via the task-dispatcher rail; the agent re-attempts and the grant permits.
4. **Byte-faithful replay, not re-derive.** Session 2 runs the captured call exactly; it never trusts the LLM to reproduce the args. Builtin: direct `registry.invoke` of the recorded args. SDK: `canUseTool` `updatedInput` override.
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

1. **Session 1 — block + capture + end.** The session's permission policy (carried on `SessionConfig`, translated per adapter) blocks irreversible calls. When the agent attempts one, the wrapper on `registry.invoke` intercepts, computes the identity hash, and writes a **Proposed Call** (status `captured`) anchored to a review message + subject thread — **idempotently per `(origin session, identity)`** so a retry mints no duplicate. The review canvas (`reviews.ts`) renders it. On first capture the wrapper **terminates session 1 via the abort rail** (`sessionRunRegistry.abort` → `stopSession` → the builtin loop's `aborted` flag), so a blocked call cannot loop and retry with drifted args. Work paused (not suspended).
2. **Review — verdict.** `threads.ts` resolves the verdict (first-verdict-wins, 409 on race, re-open). On `approve`/`approve-with-comments`, mint a **one-shot grant** `{ proposedCallId, identityHash, taskScope, agentScope, consumed: false }` (scoped to task id + agent id — session 2's id does not exist yet) and emit a **`proposed_call_granted`** event that **explicitly re-dispatches** session 2 (the task-dispatcher's same-owner resume is not triggered by the owner-change `session_ended` path). A non-approving verdict leaves the Proposed Call `held`.
3. **Session 2 — resume + byte-faithful replay (per harness).** The task-dispatcher re-provisions session 2 (same task + same agent); its permission policy carries the grant role plus the recorded `{toolId, args}`. The recorded call runs **byte-faithfully — HyperIdle never hopes the LLM reproduces it** (an LLM is not a deterministic replayer; arg drift would deadlock the approved work):
   - **builtin:** the run loop invokes the agent's own per-session registry directly — `registry.invoke(recordedToolId, recordedArgs)` — *before* the LLM gets a turn, then appends the recorded result to the message history so the LLM continues.
   - **SDK (production):** the agent attempts the call; HyperIdle's `canUseTool` callback returns `{behavior:"allow", updatedInput: <recorded args>}`, overwriting any LLM-drifted args before the SDK executes the tool with the agent's own creds.

   Either way the wrapper hashes the call, finds the matching unconsumed grant, **atomically consumes it in a single conditional statement** (`UPDATE … WHERE consumed = false RETURNING *`), and permits the call **once**. The agent's own tool runs it; the real return is recorded as the **Outcome**. The agent **continues working** in session 2. **Fallback:** if session 2 ends without consuming the grant, HyperIdle re-provisions once more; a second miss surfaces a `failed` Outcome and holds the call — never a silent hang.

> **Not `assembleContext`, not `SessionConfig.messages`.** Context assembly writes retrieved knowledge to disk and returns only counts; it cannot force a call. Seeding the call into the message history only feeds the LLM as *context* — builtin would still execute the call the model returns, and the production SDK adapter ignores `messages` entirely. Byte-faithful replay must force the emitted call: a direct `registry.invoke` on builtin, a `canUseTool` `updatedInput` override on the SDK.

## Per-harness implementation surface

| Harness | Native gate | AL7 work |
|---|---|---|
| **builtin (api-gateway)** | none — HyperIdle owns the loop | config + new replay step: gate at `registry.invoke` (block + capture + one-shot consume); session-1 termination via `sessionRunRegistry.abort`→`stopSession`; **replay = the run loop drives `registry.invoke(recordedToolId, recordedArgs)` on the agent's own registry** before the LLM execute loop. |
| **Claude Code (Agent SDK)** | `permissionMode`/`allowedTools` at init; `canUseTool(tool,input)` callback; `PreToolUse` hooks | **net-new `canUseTool` (REQUIRED for replay)** — the production adapter wires only `permissionMode` today. Capture + one-shot consume is `registry.invoke` (MCP-routed); **arg-fidelity replay is `canUseTool` returning `{allow, updatedInput: recordedArgs}`** — not optional dressing, it is the only way to force the recorded args on the production harness. |
| **Codex** | `approval_policy`/`sandbox_mode`; `execCommandApproval`/`applyPatchApproval` JSON-RPC | **net-new transport** — CLI adapter is stdout-only. `registry.invoke` covers block+capture+consume on the MCP path; **arg-override replay is deferred per-adapter work**. |
| **opencode** | `permission` allow/ask/deny; `permission.asked` SSE + reply | **net-new transport** — SSE reply channel. `registry.invoke` covers block+capture+consume; **replay deferred**. |

The **uniform seam for capture + one-shot enforcement is `registry.invoke`** (`tool-registry.ts:274`) — the one chokepoint all tool paths funnel through (builtin internal + all MCP-routed SDK/CLI tools). But **byte-faithful replay is per-harness and load-bearing, not optional dressing**: the wrapper cannot force the recorded args into the call the harness emits — builtin forces it by driving its own registry, the SDK forces it via `canUseTool` `updatedInput`. AL7's live proof runs end-to-end on **both builtin and SDK**; Codex/opencode replay is deferred.

## Scope deferrals (honest)

- **Trust-signal auto-flow** for reversible calls — AL8. AL7 is the gated arm only.
- **Per-adapter arg-override replay for Codex/opencode** — AL7 proves the loop end-to-end on **both builtin (deterministic registry replay) and SDK (`canUseTool` arg-override)**. Codex app-server and opencode SSE transports (and their replay channels) are net-new and deferred; their MCP-routed calls are still captured + one-shot-consumed by the wrapper, only the arg-fidelity replay is follow-on.
- **Multi-step transactional rollback** beyond a single Proposed Call's own semantics — out of scope.

## Rationale

AL1–AL4 built the *review*; the action-operation canvas approved into the void. The first AL7 gave it teeth the wrong way — HyperIdle's kernel re-executed the agent's operation via a curated capability map, which the founder rejected as "yet another integration layer." The redo inverts ownership: HyperIdle owns the *gate bookkeeping* and rides the harness's native permission system; the agent's own session executes. Because HyperIdle sessions are async and not pausable, the loop spans **two sessions** — block in session 1, review, re-provision session 2 with a one-shot grant. The wrapper exists because native permission systems gate by tool *name*, not by *this exact call once* — without it, an approved "merge PR #42" could become "merge PR #99" in session 2. **Byte-faithful replay** (builtin: direct `registry.invoke` of the recorded args; SDK: `canUseTool` `updatedInput` override — never trusting the LLM to reproduce the args) + identity-hash-matched single-use grants are what make the human's approval mean exactly what they saw.

Still-valid framing preserved from the original concept: reversibility-not-familiarity as the classifier, the earned verdict-history trust signal (no per-tool risk table), and ETHOS §3's permanent thin gate on the irreversible. What changed is purely the **execution mechanism** — from kernel-executes to ride-the-native-gate-and-grant-once.

Concept: `plans/AL7/concept.md`. Next: [Review primitive](../human-interface-layer/review-primitive.md) · [Harness capability descriptor](../agent-layer/harness-capability-descriptor.md) · [Trust-building](../human-interface-layer/trust-building-slow-cumulative.md) · [System boundary](../architecture/system-boundary.md).
