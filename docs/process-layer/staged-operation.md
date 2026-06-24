# Review-gated execution: the Proposed Call (AL7)

> **Model change (AL7 trust-first redo, 2026-06-24).** This doc supersedes four earlier models, the last three cut off by the founder for **spiralling into paranoia**. (1) A **Kernel-held executor** (HyperIdle re-ran the agent's op via a curated `executeCapability` map) — rejected as "yet another integration layer." (2) **Byte-faithful replay** (exact-hash-match-to-permit) — deadlocks on LLM arg drift. (3) **Per-harness native allow/deny as the safety floor** — infeasible on Codex, unreliable on opencode headless. (4) **Broker-floor-as-fortress** — made HyperIdle's `registry.invoke` chokepoint a *containment fortress* ("the only path"), with a load-bearing **AN credential-containment** dependency and a **native-tool-bypass threat model**. **That paranoia is purged.** The model is now re-anchored on **`ETHOS.md` §4 "Trust Agents"**: the review gate is a **collaboration checkpoint on the consequential/irreversible, carried by the harness's native permission mechanism (ask/allow/deny) as a workflow — not a security boundary policing the agent — and it fades as trust is earned.** The load-bearing noun **`Staged Operation` is retired; the noun is `Proposed Call`.** File path kept stable. Concept: `plans/AL7/concept.md`.

The executable backbone of **plan → review → act**. Approving a review is what makes an agent's work actually *happen* — the refund fires, the deploy lands, the email sends. **HyperIdle executes nothing of its own**: the agent holds its own credentials and runs its own tools (like a real employee with broad self-permission). HyperIdle captures the call the agent attempted, routes the consequential ones to a human, and on approve re-engages the **agent's own session** so it does the approved work and continues. HyperIdle is the **bookkeeper of the checkpoint**; the agent's own tools + creds are the **executor** ([system boundary](../architecture/system-boundary.md)).

The whole design rests on two lines from [ETHOS](../../ETHOS.md): §3 (User Sovereignty) — **never make an irreversible decision without a human, but never put a human in front of a reversible one** — and §4 (Trust Agents) — **we trust the agent; the gate is a collaboration checkpoint, not a cage, and it fades as trust grows.**

## We trust the agent (ETHOS §4)

The agent holds its own credentials, runs its own tools, and does real work. **Creds are present in the sandbox, and that is correct** — a tool or MCP server that can't authenticate is useless. We do **not** withhold credentials, do **not** build "the broker is the only path", and do **not** design against a hypothetical rogue agent. The agent *could* perform an irreversible op with its own creds — **we trust it not to route around the collaboration checkpoint**, exactly as we trust an employee not to route around a teammate's sign-off. The checkpoint is where a human *chooses* to weigh in on the consequential — not a wall the agent is tested against.

## The frame: every approve has consequences

A review is a decision point, and a decision moves the world. Even approving a chart **resolves its work** (closes the task, advances the bet) and may **launch the next step**. A **consequence** is either **internal** (a HyperIdle state move) or **external** (a call to a connected tool). The question is never *whether* something happens on approve — it is *what*, and *whether it can be undone*.

## The classifier: reversibility, not familiarity

The gate exists for **irreversible** consequences. Reversible consequences flow at the agent's earned autonomy and do not interrupt a human ([trust-building](../human-interface-layer/trust-building-slow-cumulative.md) §10). A brand-new, never-seen, *reversible* tool just runs — it can be undone. **Unknown does not mean gated.** Gating the unfamiliar-but-reversible is the approval fatigue that drowned the first generation of agent tools; ETHOS §3 names the real line — *irreversibility*. (A no-signal tool is classified irreversible **out of care** — surface a consequential-looking call to the human rather than miss one — not out of suspicion of the agent.)

## The review checkpoint: route the consequential to a human, via the harness's native permission as a workflow

The review checkpoint is a **collaboration moment**, not a guard. HyperIdle composes one simple workflow — **route the irreversible to review; let the reversible flow** — and the harness's own permission mechanism (ask/allow/deny) carries it:

- **Session 1** — the agent works with its own tools + creds. Reversible calls flow. When the agent attempts an **irreversible** call, it is routed to review and HyperIdle records the exact bound call — tool id + verbatim args — as a **Proposed Call**, the subject the human reviews. Session 1 then **ends** (HyperIdle sessions aren't pausable).
- **Session 2 (on approve)** — the session is re-provisioned with a **tailored grant**: **do the approved operation (plus reversible work); route any *other* irreversible op back to review.** The agent simply **re-does the approved work with its own tools** — re-attempting / re-deriving the call is fine (we trust it intends the approved thing). The agent then **continues working** — closes the story, updates docs, proceeds.

The reviewer always sees two things: **the proof** (diff / rendered email / field deltas — which picks the AL2 canvas) and **the one captured commit verb** (the Proposed Call) behind approve.

### Where the workflow is carried, per harness

Where a harness exposes an **externally-answerable** native ask (Claude `canUseTool` → allow / ask / deny), that native mechanism carries the route-to-review workflow directly. Where a harness has no externally-answerable headless ask (Codex `exec`, opencode headless `run` may auto-approve), the *same workflow* is carried at the point where HyperIdle already participates in the agent's brokered call (`registry.invoke`). **This is workflow plumbing for a missing native channel — not a security floor, not "the only path", and not a credential-containment claim.** It is simply where HyperIdle hangs the "ask a human" step when the harness has nowhere to hang it.

## The checkpoint is NOT a containment fortress

We do **not** build "the broker is the only path to an irreversible op." We do **not** depend on a Track-AN "no live-op credential in the sandbox" guarantee. We do **not** model a rogue agent bypassing the checkpoint via native shell / raw HTTP / ambient creds. ETHOS §4: *"When you catch yourself designing against a hypothetical rogue agent, stop. That is paranoia, and it is not the product."* The agent has its creds; we trust it. The checkpoint is a collaboration moment; its job is to let a human steer the consequential, not to cage the agent.

## Byte-fidelity is a convenience, not a guard

An earlier redo made session 2 re-run the captured call **byte-faithfully** — permitting exactly the captured bytes via a SHA-256 match. **Deleted as a guard.** We trust the agent intends the approved op; **re-deriving the call is fine.** Byte-fidelity survives only as an **optional arg-pin convenience**: where a harness expresses arg-level scope (builtin in-process; Claude `canUseTool` `updatedInput`), HyperIdle MAY pin "the approved tool with exactly these args." There is **no exact-hash-match-to-permit and no deadlock machinery** — nothing gates on the hash. If a harness can't scope a permission to exactly one op, that is acceptable.

## The gate fades as trust grows

The trust signal is **earned**: an agent's **approval rate over its recent verdict history**, computed by the policy engine (`packages/fabric/src/services/policy-engine.ts`, AD4). A trusted agent's reversible work already flows, and over time more flows without review — **more autonomy is the goal.** There is **no per-tool risk table or allowlist matrix** (the enterprise smell HyperIdle rejects — and why the first AL7's `KERNEL_DISPATCHABLE_CAPABILITIES` allowlist was wrong). Cold-start-safe (too few verdicts → everything surfaced).

> **Implementation note (AD4 / AL7 / AL8).** The per-skill autonomy ladder (L1→L4) was removed by **AD4** in favor of the verdict-history approval rate; surviving `autonomyLevel` data is vestigial (removed by **AL9**). **AL7 ships only the gated arm** — every irreversible Proposed Call waits for an explicit human approve. Wiring the trust signal so *reversible* calls auto-flow and the lane widens with trust is **AL8**.

## Definition

A **Proposed Call** is the exact, fully-bound tool call (tool id + verbatim arguments) that an agent **attempted** and HyperIdle **routed to review**, captured verbatim as the subject a human reviews. A record/snapshot — not an event, not a command HyperIdle will run, not the act of executing.

## Essential properties

- **Tool identity** — the harness/MCP tool name the agent called.
- **Bound arguments** — the exact `input` object, verbatim. No late binding.
- **Reversibility** — `irreversible | reversible` (only irreversible calls are routed to review + captured).
- **Origin** — the session it came from + the task/thread it anchors.
- **Gate** — the review message that gate-keeps it.
- **Status** — `captured → granted → executed | failed`, or `held`.
- **Identity hash** *(optional metadata)* — a deterministic hash over (tool id, normalized args), consumed only by the arg-pin convenience; NOT a guard.

It carries **no** HyperIdle-side executor reference and **no** capability-allowlist membership — those were the rejected v1 model.

## What it is not

- **Not a containment fortress, and the checkpoint is not "the only path."** *(Rejects the v4 paranoia — ETHOS §4.)* We do not build "the broker is the only path", do not model a rogue-agent native-tool bypass, and do not depend on credential containment. The checkpoint is where a human chooses to weigh in — not a wall.
- **Not credential-withholding.** Creds are present in the sandbox and that is correct (tools need them to auth). No AN credential-containment dependency.
- **Not a Kernel-executed operation.** HyperIdle does not author or re-run the tool — no capability map, no re-implementation, nothing run from its own process. The agent's own session runs the approved work with its own tools + creds.
- **Not a curated capability allowlist.** No `KERNEL_DISPATCHABLE_CAPABILITIES`. The classification, capture, and grant are generic; HyperIdle never needs to know what a tool *means*.
- **Not a byte-faithful replay gate.** Session 2 is NOT permitted by matching a hash of the captured bytes. Re-deriving the call is fine; byte-fidelity is an optional arg-pin convenience; no deadlock.
- **Not a re-implementation of the harness's permission system.** We build on the harness's native ask/allow/deny as the workflow carrier where externally answerable; HyperIdle's participation point only fills the gap where a harness has no headless ask.
- **Not a live session pause / native held "ask."** HyperIdle sessions are detached one-shots; the review spans **two sessions**. Enforcement of the workflow is at session run time, not a held call-time ask.
- **Not an agent-authored spec.** There is no `stage_operation` tool. The subject is the *real attempted call*, captured when routed to review.
- **Not Claude-only, and not silently all-four.** Live-proven on builtin + Claude now; Codex + opencode are named net-new adapter tasks (supported-pending-adapter), not silently dropped, not falsely green.
- **Not a verdict.** The verdict authorizes; the Proposed Call is authorized.
- **Not a `ToolCallSummary`.** That records a reversible action the assistant *already ran* (AD8b). A Proposed Call is the not-yet-run irreversible call routed to review.
- **Not the `action_operation` canvas.** The canvas renders a *view*; the Proposed Call is the backing captured call.
- **Not a permanent brake.** The checkpoint fades as trust is earned (AD4); more autonomy is the goal.

## Lifecycle

```
captured ──(routed to review in session 1; the exact call is recorded; session 1 ends)
   │
   ├── approve verdict ──▶ granted ──(session 2 re-provisioned; tailored grant:
   │                          │        do the approved op + reversible work, route other irreversible to review)
   │                  `proposed_call_granted` re-engages the agent (session 2);
   │                  agent re-does the approved work with its own tools (re-deriving is fine);
   │                  the tailored grant is consumed once; the agent continues working
   │                          │
   │                    ┌─────┴─────┐
   │                 executed     failed   (Outcome written; terminal)
   │
   └── non-approving verdict (request-changes / edit / reject) ──▶ held (never executed)
```

`held` is terminal for this resolution; a re-open + fresh approve mints a new tailored grant **only if the call never executed**. `executed`/`failed` are terminal and never re-run (retry = a new Proposed Call). There is **no kernel `executing` state** — HyperIdle never holds an in-flight execution; the agent's own session does.

## Outcome

The recorded terminal result — `{ status: ok | failed, receipt | error, executedAt }`. Written **from session 2's real tool return**, after the agent's own tool runs; **immutable once recorded** (PK = Proposed-Call id enforces 0..1 and no overwrite); surfaced where the Proposed Call's canvas rendered. A failure is an Outcome with `status: failed` and a surfaced error — **never** missing/silent.

## Authority

The **agent produces** the Proposed Call by attempting the call (HyperIdle records it when routing it to review). The human **verdict** authorizes (commit authority). The **agent's own session executes** the call in session 2 with its own tools + creds under the tailored grant. HyperIdle **owns** the capture record, the tailored grant, and the Outcome record — the *bookkeeper of the checkpoint* role, never authoring or re-executing the tool. Source of truth for "did it happen" is the **Outcome**.

## The verdict reshape

Grammar unchanged — five decisions, `approve` stays `approve`. An `approve` / `approve-with-comments` on a Subject is the **commit trigger**: it composes the tailored grant for the Subject's Proposed Call(s) and re-engages the agent's session. Non-approving verdicts hold them. A consequence added to an existing action — not a new verdict action, not changed authorization.

## Contracts

- **Cardinality.** Proposed Call → exactly 1 review message (gate) + 1 subject thread (anchor); Proposed Call → 0..1 Outcome; tailored grant → exactly 1 approved Proposed Call, valid in exactly 1 session-2 re-provision.
- **Closure.** The tool/args vocabulary is **OPEN** — any tool the agent can call can be captured; HyperIdle enumerates nothing. Reversibility is **CLOSED** (`irreversible | reversible`).
- **Mutability.** The captured tool id + args are **immutable once captured** (what the human reviewed). Outcome immutable once recorded.
- **Identity.** Opaque stable Proposed-Call id; the (tool id, normalized args) hash is **optional metadata** for the arg-pin convenience, NOT a guard.

## Hard rules

1. **We trust the agent.** No designing against a rogue agent, no credential-withholding, no "only path" containment. The checkpoint is a collaboration moment. (ETHOS §4.)
2. **HyperIdle executes nothing of its own.** The agent's own session/tools/creds run the call. HyperIdle classifies, routes-to-review, and records at `registry.invoke` — never authoring, re-implementing, or running a tool from its own process.
3. **The checkpoint routes the consequential to a human, via the harness's native permission as a workflow.** Reversible flows; irreversible routes to review. Built on the harness's native ask/allow/deny where externally answerable; HyperIdle's participation point fills the headless-ask gap as plumbing.
4. **Re-attempting the approved op in session 2 is fine.** No exact-match-to-permit; byte-fidelity is at most a convenience; no deadlock. (Arg-level exactness is the optional convenience frontier.)
5. **Two-session async resume, not live pause.** Route-to-review ends session 1; approve re-provisions session 2 with the tailored grant.
6. **Reversible flows; irreversible routes to review.** (Reversible auto-flow per trust is AL8.) Only irreversible calls are captured → reviewed.
7. **A non-approving verdict never executes.** Held Proposed Calls are never granted.
8. **The work continues after the result.** On approve the agent re-engages (`proposed_call_granted` → session 2), runs the approved op, and **keeps working** (closes the story / updates docs / proceeds) — this is the *same* session-2 run proceeding after the tool returns, **not a second event**. There is exactly one re-engagement event; the only other re-provision is the liveness net on crash/no-show. (Folded in; was AL10.)
9. **Failure surfaces** as a `failed` Outcome — never silently swallowed.
10. **The gate fades as trust grows** (verdict-history signal, AD4); more autonomy is the goal.
11. **DONE is proven LIVE on the real installed harnesses.** The trust-first loop (agent proposes irreversible op → review → approve → agent executes with its own tools → continues) is integration-tested against the real installed harness per supported harness — never a stub. builtin + Claude green now; Codex + opencode are named net-new adapter tasks.

## Vocabulary

| Term | Definition | Aliases not to use |
|---|---|---|
| **Proposed Call** | The exact captured tool call (id + bound args) routed to review, reviewed as a subject. | staged operation, staged op, `StagedOperationSpec`, dispatchable capability |
| **Review checkpoint** | The collaboration moment routing a consequential/irreversible call to a human, carried by the harness's native permission as a workflow; fades as trust grows. | broker-gate floor, the safety mechanism, the safety floor, containment fortress, the only path, security boundary |
| **Tailored grant** | Session-2 workflow scope: do the approved op + reversible, route other irreversible to review; consume-once. | tailored broker policy, one-shot grant, replay grant, exact-hash grant, the cage |
| **Arg-pin (convenience)** | Optional pinning of the allow to the approved tool *with these exact args*, where arg-level scope exists. | byte-faithful replay, exact-hash-match-to-permit, deterministic registry replay |
| **Two-session resume** | Route to review in session 1 → review → re-provision session 2 with the tailored grant. | pause/resume, suspend, live continuation |
| **Consequence** | What an approve sets in motion (internal state move or external tool call). | side-effect, effect |
| **Reversibility / irreversible** | Whether a consequence can be undone; the classifier that decides routing. | risk level, criticality |
| **Trust signal** | The agent's verdict-history approval rate; the gate fades on it (AD4). | graduated autonomy, per-skill autonomy level (removed — AD4), per-tool risk table |
| **Outcome** | Recorded terminal result (ok/failed + receipt/error), from session 2's real return. | result (banned Artifact alias), response |

## How the loop works (as-designed, AL7 trust-first redo)

1. **Session 1 — the agent works; route the irreversible to review + end.** The agent works with its own tools + creds; reversible calls flow. When an irreversible call is attempted, HyperIdle classifies it irreversible, routes it to review, and records `{toolId, args}` as a **Proposed Call** (status `captured`) anchored to a review message + subject thread — **idempotently per `(origin session, identity)`** so a retry mints no duplicate. The review canvas (`reviews.ts`) renders it. On first route-to-review HyperIdle **ends session 1 via the abort rail** (`sessionRunRegistry.abort` → `stopSession`), since sessions aren't pausable. Work paused (not suspended).
2. **Review — verdict.** `threads.ts` resolves the verdict (first-verdict-wins, 409 on race, re-open). On `approve`/`approve-with-comments`, compose the **tailored grant** for the approved Proposed Call (do the approved op + reversible; route other irreversible to review), record it scoped to task id + agent id (session 2's id does not exist yet), and emit a **`proposed_call_granted`** event that **explicitly re-engages** the agent's session 2 (the task-dispatcher's same-owner resume is not triggered by the owner-change `session_ended` path). A non-approving verdict leaves the Proposed Call `held`.
3. **Session 2 — resume under the tailored grant + continue.** The task-dispatcher re-provisions session 2 (same task + same agent). The agent **re-does the approved work with its own tools** — re-deriving the call is fine. HyperIdle permits the approved op (consuming the grant once via a single-statement atomic CAS) + reversible work, and routes any *other* irreversible op back to review (a fresh human decision). Where a harness exposes an externally-answerable native ask (Claude `canUseTool`), that carries the workflow; elsewhere HyperIdle's participation point carries it. The agent's own tool runs the approved call (its own creds); the real return is recorded as the **Outcome**; the agent **continues working** — closes the story, updates docs, proceeds. **Fallback:** if session 2 ends without the approved op executing, HyperIdle re-provisions once more; a second miss surfaces a `failed` Outcome and holds the call — never a silent hang. (Triggers on crash/no-show, never on re-derivation/arg drift.)

> **Not `assembleContext`, not `SessionConfig.messages`.** Context assembly writes retrieved knowledge to disk and returns only counts. Seeding the call into the message history only feeds the LLM as *context* — it does not carry the route-to-review workflow. The workflow is composed by HyperIdle and carried by the harness's native permission / HyperIdle's participation point.

## Per-harness native-permission routing + DONE matrix

| Harness | Native permission carrier (the workflow) | Adapter routes into the workflow? | DONE state |
|---|---|---|---|
| **builtin (api-gateway)** | HyperIdle owns the loop; `registry.invoke` (`:741`) is the router — classify + route-to-review + record + consume here | YES — direct (`mcpSupport:false`, `:336`) | **green** — full live proof now |
| **Claude Code (Agent SDK)** | `canUseTool` (allow / ask / deny, `updatedInput`) + `allowedTools`/`disallowedTools` — externally-answerable native ask used as the workflow carrier (verified) | YES — SDK adapter wired; small net-new MCP-route assertion | **green** — full live proof now |
| **Codex** | `--ask-for-approval` (untrusted/on-request) + `--sandbox`; `codex exec` (non-interactive) has no externally-answerable ask → the route-to-review step is carried at HyperIdle's participation point (`registry.invoke`) as plumbing | **NO — net-new.** No `codex` registration in `CLI_TOOL_CONFIGS` (`adapter-pool.ts:324-353`). Build the adapter + wire `{{mcpUrl}}` so the brokered call routes into the workflow. | **net-new-adapter-pending** — supported + live-proven once the adapter exists |
| **opencode** | `opencode.json`/frontmatter `permission` allow/ask/deny (last-match-wins); non-interactive `run` may auto-approve → the route-to-review step is carried at HyperIdle's participation point as plumbing | **NO — net-new.** Registered adapter is `--dir`-only text-mode, no `{{mcpUrl}}` (`adapter-pool.ts:344-352`). Wire `{{mcpUrl}}` + `opencode run -f json`. | **net-new-adapter-pending** — supported + live-proven once the adapter routes into the workflow |
| **cursor-agent** | — | — | **skipped** (`unavailable`, `harness-capability-descriptors.ts:11`) |

The workflow router (`registry.invoke`) is identical on every harness; the native carrier is added where the harness exposes an externally-answerable ask (Claude). For headless harnesses (Codex `exec`, opencode `run`) the route-to-review step is carried at HyperIdle's own participation point — **plumbing for a missing native channel, not a security floor.** AL7's live proof runs end-to-end on builtin + Claude now; Codex + opencode each gain a live-proof lane once their net-new adapter task lands. A pipeline terminates per the matrix.

## Scope deferrals (honest)

- **Trust-signal auto-flow** for reversible calls + the autonomy-widening — AL8. AL7 is the gated arm only.
- **Codex + opencode adapters/MCP-routing** — named net-new build tasks. Their adapters do not yet route the agent's call into the workflow. `net-new-adapter-pending`, live-proven once built — not silently dropped, not falsely green.
- **Externally-answerable native ask on Codex / opencode headless** — not available; the route-to-review workflow is carried at HyperIdle's participation point instead (plumbing). The Codex app-server JSON-RPC / opencode SSE async transports are **not** required.
- **Arg-pin convenience** beyond name scope — layered where arg-level scope exists. The name-scoped frontier (the same tool with different args is permitted) is **fine — we trust the agent's intent**, not a hole.
- **Multi-step transactional rollback** beyond a single Proposed Call's own semantics — out of scope.

## Rationale

AL1–AL4 built the *review*; the action-operation canvas approved into the void. The first AL7 gave it teeth the wrong way (kernel re-execute via a curated capability map — "yet another integration layer"). The byte-faithful redo correctly inverted ownership but bet the guarantee on deterministic replay (deadlocks on arg drift). The native-allow/deny reshape bet it on each harness's grammar (infeasible on Codex, unreliable on opencode headless). The fourth — broker-floor-as-fortress — fixed feasibility but **spiralled into paranoia**: a *containment fortress* ("the only path"), an unbuilt **AN credential-containment** dependency, a **rogue-agent native-tool bypass** threat model, and an *exact-hash-match* guard. The founder cut that off.

The trust-first model re-anchors on **ETHOS §4: Trust Agents.** We trust the agent — it holds its own creds (correct — tools need them to auth), runs its own tools, and does real work like a real employee with broad self-permission. The review gate is a **collaboration checkpoint on the consequential/irreversible**, carried by the harness's **native permission mechanism (ask/allow/deny) as a workflow** — never a security boundary. The agent re-attempting the approved op is fine; byte-fidelity is at most a convenience; there is no deadlock machinery, no "only path", no credential-containment dependency, and no native-tool-bypass residual to confess — because we are not building a fortress. The gate **fades as trust grows** (verdict-history signal, AD4); more autonomy is the goal. This is **much simpler** than the fortress, and that simplicity is the point. Because HyperIdle sessions are async and not pausable, the loop spans **two sessions** — route-to-review in session 1, review, re-provision session 2 with the tailored grant, then the agent continues. DONE is proven LIVE on the real installed harnesses (builtin + Claude green now; Codex + opencode named net-new adapter tasks), never a stub.

Still-valid framing preserved: reversibility-not-familiarity as the classifier, the earned verdict-history trust signal (no per-tool risk table), and ETHOS §3's permanent thin gate on the irreversible. What changed is the **frame** — from a containment fortress that designs against the agent to a **collaboration checkpoint that trusts it** and fades as trust is earned.

Concept: `plans/AL7/concept.md`. Next: [Review primitive](../human-interface-layer/review-primitive.md) · [Harness capability descriptor](../agent-layer/harness-capability-descriptor.md) · [Trust-building](../human-interface-layer/trust-building-slow-cumulative.md) · [System boundary](../architecture/system-boundary.md).
