# The Proposed Call (AL7)

The executable backbone of **plan → review → act**. Approving a review is what makes an agent's work actually *happen* — the refund fires, the deploy lands, the email sends. **HyperIdle executes nothing of its own**: the agent holds its own credentials and runs its own tools; HyperIdle captures the call the agent attempted, routes the consequential ones to a human, and on approve re-engages the **agent's own session** so it does the approved work and continues. HyperIdle is the bookkeeper of the checkpoint; the agent's own tools + creds are the executor (boundary owned by [system boundary](../architecture/system-boundary.md)).

The trust stance is [ETHOS](../../ETHOS.md) §2 (Trust Agents and Humans; Earn Security from Learnings) — read it there; this doc does not restate it. Two consequences bind this doc:

- **"Irreversible" is not, by itself, a reason to gate.** There is no gate-by-default classifier.
- **Review rides AL7 only where a human chose it or a learning earned it.** The gate is a collaboration checkpoint, not a cage, and it fades as trust is earned.

The load-bearing noun **`Staged Operation` is retired; the noun is `Proposed Call`.** This file path is kept stable (code-cited).

## The gate is opt-in machinery, not default behavior

The capture workflow is machinery a caller **attaches** to a session — it is not on by default. No production caller constructs the session-1 "open-work" capture workflow today: ordinary task dispatch provisions with no `sessionWorkflow`, and assistant turns never get one either. The only `sessionWorkflow` producer in production is the session-2 grant path (the task dispatcher, wired in `layers/core-api/src/service-bootstrap.ts`).

So the correct framing of everything below is conditional: **when a review checkpoint is attached** (because a human chose it for this case, or a learning earned it), the workflow router routes irreversible calls to review and lets reversible calls flow.

## The frame: every approve has consequences

A review is a decision point, and a decision moves the world. Even approving a chart resolves its work (closes the task, advances the bet) and may launch the next step. A **consequence** is either **internal** (a HyperIdle state move) or **external** (a call to a connected tool). The question is never *whether* something happens on approve — it is *what*, and *whether it can be undone*.

## The classifier: reversibility, not familiarity

When a checkpoint is attached, the routing line is **reversibility** (`classifyReversibility`, `layers/agent-execution/harness-registry/src/tool-registry.ts`). Reversible calls flow; irreversible calls route to review. A brand-new, never-seen, *reversible* tool just runs — **unknown does not mean gated**. Gating the unfamiliar-but-reversible is the approval fatigue that drowned the first generation of agent tools. A no-signal tool is classified irreversible out of care — surface a consequential-looking call rather than miss one — not out of suspicion of the agent.

## The carrier: HyperIdle's MCP bridge, never a harness-native permission feature

The single shipped carrier of the workflow on every CLI harness is **HyperIdle's production MCP bridge** — `/api/mcp/:token` (`layers/agent-execution/harness-registry/src/mcp/mcp-route.ts`) → `createMcpBridge` (`layers/agent-execution/harness-registry/src/mcp/mcp-bridge.ts`) → the capturing router at `registry.invoke` (`layers/agent-execution/harness-registry/src/tool-registry.ts` — "the router in `invoke` is the uniform record/consume"). The builtin harness is the same router in-process.

No harness-native permission mechanism carries any of this. There is no `canUseTool` (the Agent SDK was removed; claude-code is the real `claude` CLI), no `PreToolUse` hook (the codex hook is a **Stop** hook for return enforcement), and no opencode `permission` config anywhere in the codebase — the claude production adapter runs `--permission-mode bypassPermissions` (`layers/agent-execution/harness-registry/src/adapter-pool.ts`).

**Honest scope (stated once).** On a CLI harness the checkpoint covers the agent's **MCP-routed calls** — the ones that pass through the bridge to `registry.invoke`. The agent is trusted not to route an irreversible op around the bridge (raw shell / direct HTTP / its own creds). This is ETHOS §2, not a defect: the checkpoint is where a human chooses to weigh in, not a wall the agent is tested against.

Per-harness capabilities, probes, and MCP wiring are owned by the [harness capability descriptor](../agent-layer/harness-capability-descriptor.md).

## The two-session loop

HyperIdle sessions are detached one-shots — not pausable — so the review spans **two sessions**:

1. **Session 1 — capture + end.** With the workflow attached, the agent works with its own tools + creds; reversible calls flow. When an irreversible call is attempted, the capturing router records `{toolId, args}` verbatim as a **Proposed Call** (status `captured`) anchored to a review message + subject thread — idempotently per `(originSessionId, identityHash)` (`framework/db/src/schema.ts`) so a retry mints no duplicate — returns `AWAITING_REVIEW`, and HyperIdle ends session 1 via the abort rail (`onAbortSession` → `sessionRunRegistry.abort`).
2. **Review — verdict.** `threads.ts` resolves the verdict (first-verdict-wins, 409 on race, re-open); grammar owned by the [thread primitive](../human-interface-layer/thread-primitive.md). On `approve`/`approve-with-comments`, HyperIdle composes the **tailored grant** — do the approved op (plus reversible work); route any *other* irreversible op back to review — scoped to task id + agent id (session 2's id doesn't exist yet), and emits `proposed_call_granted` (`framework/shared/src/events.ts`), which explicitly re-engages the agent (the task dispatcher). A non-approving verdict leaves the Proposed Call `held`.
3. **Session 2 — resume under the grant + continue.** The task-dispatcher re-provisions session 2 (same task + same agent) with the grant-bearing `sessionWorkflow` (`sessionRole:"grant-bearing"`). The agent **re-does the approved work with its own tools — re-deriving the call is fine** (we trust it intends the approved thing). The grant is consumed once via a single-statement atomic CAS; the real tool return is recorded as the **Outcome**; the agent keeps working — closes the story, updates docs, proceeds.

**Liveness net** (`layers/core-api/review/src/proposed-call-workflow.ts`): if session 2 ends with the grant unconsumed (crash / no-show — never re-derivation or arg drift), HyperIdle re-provisions once; a second miss writes a `failed` Outcome and holds the call. Never a silent hang.

> **Not `assembleContext`, not `SessionConfig.messages`.** Context assembly writes retrieved knowledge to disk and returns only counts. Seeding the call into message history only feeds the LLM as *context* — it does not carry the workflow. The workflow is composed by HyperIdle and carried by the bridge/router.

## Definition

A **Proposed Call** is the exact, fully-bound tool call (tool id + verbatim arguments) that an agent **attempted** and HyperIdle **routed to review**, captured verbatim as the subject a human reviews. A record/snapshot — not an event, not a command HyperIdle will run, not the act of executing. Types: `framework/shared/src/proposed-call.ts`; tables: `proposed_calls` (`schema.ts`), `tailored_grants` (`schema.ts`), Outcome (`schema.ts`).

## Essential properties

- **Tool identity** — the harness/MCP tool name the agent called.
- **Bound arguments** — the exact `input` object, verbatim. No late binding.
- **Reversibility** — `irreversible | reversible` (only irreversible calls are captured).
- **Origin** — the session it came from + the task/thread it anchors.
- **Gate** — the review message that gate-keeps it.
- **Status** — `captured → granted → executed | failed`, or `held` (`PROPOSED_CALL_STATUSES`).
- **Identity hash** *(optional metadata)* — SHA-256 over canonical `{toolId, args}`, consumed only by the arg-pin convenience and the capture-idempotency index; NOT a guard.

It carries no HyperIdle-side executor reference and no capability-allowlist membership.

## Byte-fidelity is a convenience, not a guard

Session 2 is never permitted by matching a hash of the captured bytes. Re-deriving the call is fine. Byte-fidelity survives only as an **optional arg-pin convenience** (`tailoredGrants.argPinned`): where arg-level scope exists, HyperIdle MAY pin "the approved tool with exactly these args." Nothing gates on the hash; there is no deadlock machinery. The name-scoped frontier — the same tool with different args is permitted — is fine, not a hole.

## The gate fades as trust grows

The trust signal is **earned**: an agent's approval rate over its recent verdict history, computed by the policy engine (`layers/core-api/policy/src/policy-engine.ts`, AD4). Cold-start-safe: too few verdicts → everything surfaced. There is no per-tool risk table or allowlist matrix. More autonomy is the goal. Trust surfaces in the UI are owned by the [review primitive](../human-interface-layer/review-primitive.md).

> **Implementation status.** AL7 shipped only the gated arm — an attached checkpoint routes every irreversible Proposed Call to an explicit human approve; staged ops bypass the policy engine today. Wiring the trust signal so reversible calls auto-flow and the lane widens is **AL8** (not built). The vestigial per-skill autonomy data is gone — the `user_skills` table was dropped.

## What it is not

- **Not a security boundary.** No "only path" containment, no credential-withholding, no rogue-agent threat model — see [ETHOS](../../ETHOS.md) §2.
- **Not a Kernel-executed operation.** HyperIdle does not author or re-run the tool — no capability map, no re-implementation, nothing run from its own process (`executeCapability` / `KERNEL_DISPATCHABLE_CAPABILITIES` do not exist in code).
- **Not a curated capability allowlist.** Classification, capture, and grant are generic; HyperIdle never needs to know what a tool *means*.
- **Not a byte-faithful replay gate.** No exact-hash-match-to-permit; arg-pin is an optional convenience.
- **Not a harness-native permission workflow.** The carrier is HyperIdle's MCP bridge + `registry.invoke`, on every harness.
- **Not a live session pause.** Sessions are detached one-shots; the review spans two sessions.
- **Not an agent-authored spec.** There is no `stage_operation` tool; the subject is the *real attempted call*.
- **Not a verdict.** The verdict authorizes; the Proposed Call is authorized.
- **Not a `ToolCallSummary`.** That records a reversible action the assistant *already ran* (AD8b, `framework/shared/src/thread.ts`). A Proposed Call is the not-yet-run irreversible call routed to review.
- **Not the `action_operation` canvas.** The canvas (`ReviewActionOperation.tsx`) renders a *view*; the Proposed Call is the backing captured call.
- **Not a permanent brake.** The checkpoint fades as trust is earned (AD4).

## Lifecycle

```
captured ──(routed to review in session 1; the exact call is recorded; session 1 ends)
   │
   ├── approve verdict ──▶ granted ──(session 2 re-provisioned with the tailored grant)
   │                          │
   │                    ┌─────┴─────┐
   │                 executed     failed   (Outcome written; terminal)
   │
   └── non-approving verdict (request-changes / edit / reject) ──▶ held (never executed)
```

`held` is terminal for this resolution; a re-open + fresh approve mints a new tailored grant **only if the call never executed**. `executed`/`failed` are terminal and never re-run (retry = a new Proposed Call). There is no `executing` state — HyperIdle never holds an in-flight execution; the agent's own session does.

## Outcome

The recorded terminal result — `{ status: ok | failed, receipt | error, executedAt }`. Written from session 2's **real tool return**; immutable once recorded (PK = Proposed-Call id enforces 0..1 and no overwrite, `schema.ts`); surfaced where the Proposed Call's canvas rendered. A failure is an Outcome with `status: failed` and a surfaced error — never missing/silent.

## Authority

The **agent produces** the Proposed Call by attempting the call. The human **verdict** authorizes (commit authority). The **agent's own session executes** in session 2 under the tailored grant. HyperIdle **owns** the capture record, the tailored grant, and the Outcome record — bookkeeper, never executor. Source of truth for "did it happen" is the Outcome.

## The verdict reshape

Grammar unchanged — five decisions, `approve` stays `approve` (owned by the [thread primitive](../human-interface-layer/thread-primitive.md)). An `approve`/`approve-with-comments` on a Subject is the **commit trigger**: it composes the tailored grant for the Subject's Proposed Call(s) and re-engages the agent's session. Non-approving verdicts hold them. A consequence added to an existing action — not a new verdict action, not changed authorization.

## Contracts

- **Cardinality.** Proposed Call → exactly 1 review message (gate) + 1 subject thread (anchor); Proposed Call → 0..1 Outcome; tailored grant → exactly 1 approved Proposed Call, valid in exactly 1 session-2 re-provision.
- **Closure.** The tool/args vocabulary is **OPEN** — any tool the agent can call can be captured; HyperIdle enumerates nothing. Reversibility is **CLOSED** (`irreversible | reversible`).
- **Mutability.** Captured tool id + args are **immutable once captured** (what the human reviewed). Outcome immutable once recorded.
- **Identity.** Opaque stable Proposed-Call id; the identity hash is optional metadata, NOT a guard.

## Hard rules

1. **The gate is attached, never default-on.** Review rides AL7 where a human chose it or a learning earned it ([ETHOS](../../ETHOS.md) §2).
2. **HyperIdle executes nothing of its own.** The agent's own session/tools/creds run the call; HyperIdle classifies, routes, and records at `registry.invoke`.
3. **The carrier is HyperIdle's MCP bridge + capturing router** — uniform on every harness; never a harness-native permission feature.
4. **Re-attempting the approved op in session 2 is fine.** No exact-match-to-permit; arg-pin is at most a convenience.
5. **Two-session async resume, not live pause.**
6. **When attached: reversible flows; irreversible routes to review.** (Reversible auto-flow per trust is AL8.)
7. **A non-approving verdict never executes.** Held Proposed Calls are never granted.
8. **The work continues after the result.** On approve the agent re-engages (`proposed_call_granted` → session 2), runs the approved op, and keeps working — the same session-2 run proceeding after the tool returns, not a second event. Exactly one re-engagement event; the only other re-provision is the liveness net on crash/no-show.
9. **Failure surfaces** as a `failed` Outcome — never silently swallowed.
10. **The gate fades as trust grows** (verdict-history signal, AD4).
11. **DONE is proven LIVE on the real installed harnesses** — never a stub. builtin, claude-code, codex, and opencode are all proven through the production MCP bridge (`AL7-two-session-trust-first.integration.test.ts`); a missing binary hard-fails, never skips.

## Vocabulary

| Term | Definition | Aliases not to use |
|---|---|---|
| **Proposed Call** | The exact captured tool call (id + bound args) routed to review, reviewed as a subject. | staged operation, staged op, `StagedOperationSpec`, dispatchable capability |
| **Review checkpoint** | The attached collaboration moment routing an irreversible call to a human; fades as trust grows. | safety floor, containment fortress, the only path, security boundary |
| **Tailored grant** | Session-2 workflow scope: do the approved op + reversible, route other irreversible to review; consume-once. | one-shot grant, replay grant, exact-hash grant |
| **Arg-pin (convenience)** | Optional pinning of the allow to the approved tool *with these exact args*. | byte-faithful replay, exact-hash-match-to-permit, deterministic registry replay |
| **Two-session resume** | Route to review in session 1 → review → re-provision session 2 with the tailored grant. | pause/resume, suspend, live continuation |
| **Consequence** | What an approve sets in motion (internal state move or external tool call). | side-effect, effect |
| **Reversibility / irreversible** | Whether a consequence can be undone; the routing line when a checkpoint is attached. | risk level, criticality |
| **Trust signal** | The agent's verdict-history approval rate; the gate fades on it (AD4). | graduated autonomy, per-skill autonomy level, per-tool risk table |
| **Outcome** | Recorded terminal result (ok/failed + receipt/error), from session 2's real return. | result (banned Artifact alias), response |

## Scope deferrals

- **Trust-signal auto-flow** for reversible calls + autonomy widening — AL8. AL7 is the gated arm only.
- **Attaching the session-1 capture workflow from a production caller** — the machinery is built and live-proven; the attach point (human choice / earned learning) is future wiring.
- **Arg-pin convenience** beyond name scope — layered where arg-level scope exists.
- **Multi-step transactional rollback** beyond a single Proposed Call's own semantics — out of scope.

Next: [Review primitive](../human-interface-layer/review-primitive.md) · [Thread primitive](../human-interface-layer/thread-primitive.md) · [Harness capability descriptor](../agent-layer/harness-capability-descriptor.md) · [System boundary](../architecture/system-boundary.md).
