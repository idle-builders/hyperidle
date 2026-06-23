# Staged Operation primitive (AL7)

The executable backbone of **plan → review → act**. Approving a review is what makes an agent's work actually *happen* in the world — the refund fires, the deploy lands, the email sends — through the connected tool, at-most-once, with the result returning to the review. HyperIdle is the **trigger and the gate**; the connected system is the **executor** ([system boundary](../architecture/system-boundary.md)). Today approve records a verdict and fires nothing (`ReviewActionOperation.onApprove` is a no-op). AL7 gives it teeth.

The whole design rests on one line from [ETHOS](../../ETHOS.md) §3 (User Sovereignty): **never make an irreversible decision without a human — but never put a human in front of a reversible one.**

## The frame: every approve has consequences

A review is a decision point, and a decision moves the world. There is no consequence-free review — even approving a chart at minimum **resolves its work** (closes the task, advances the bet) and may **launch the next step** (a follow-up session, a handoff). A **consequence** is either **internal** (a HyperIdle state move) or **external** (a call to a connected tool). The question is never *whether* something happens on approve — it is *what*, and *whether it can be undone*.

## The classifier: reversibility, not familiarity

The gate exists for **irreversible** consequences. Reversible consequences flow at the agent's earned autonomy and do not interrupt a human ([trust-building](../human-interface-layer/trust-building-slow-cumulative.md) §10: "reversible items approve with lower friction"). A brand-new, never-seen, *reversible* tool just runs — it can be undone. **Unknown does not mean gated.** Gating the unfamiliar-but-reversible is the approval fatigue that drowned the first generation of agent tools; ETHOS §3 names the real line — *irreversibility*. The dangerous quadrant (irreversible **and** not-yet-trusted) is rare, and surfacing exactly that is the product, not friction.

## The safety mechanism: shrink the irreversible surface to one verb

Most "irreversible" work isn't, if the agent has a reversible place to work. The agent iterates freely in a **draft space**; only one **commit verb** crosses into the irreversible world, and that verb is the **Staged Operation**. Three archetypes:

- **A · Native draft / branch** — git branch, Gmail draft, Figma branch, preview deploy, Notion draft. Agent iterates freely; the gated verb is the tool's own commit (**merge / send / publish / promote**). The code/Figma case: the diff is reversible, only the **landing** is sharp.
- **B · Test / sandbox credential** — no draft object but a test mode (Stripe test keys). Agent iterates against **non-live** credentials; the gated verb is the **live-credential** call. Safety = credential split.
- **C · No draft, no test mode** — ledger writes, one-shot admin. The agent cannot safely touch the real system; the **proposal it assembles in HyperIdle is the only draft**. Nothing reaches the real system until approve. **C executes exactly like A and B** — the operation model is archetype-uniform, with no special dry-run-proof requirement. *Avoiding C — whether a draft/test space exists at all — is the **connector/setup's** responsibility, not the operation model's: a connector that can offer a branch or test key SHOULD, pushing toward A/B; where it genuinely cannot, C is the honest floor (founder, 2026-06-23).*

The reviewer always attaches two things: **the proof** (diff / rendered email / field deltas — which picks the AL2 canvas) and **the one gated commit verb** behind approve.

## The enforcement: capability split

> The agent holds the request slip, never the button.

The live commit verb / live credential lives with the **Kernel**, never in the agent's session. A gated tool is provisioned to the agent only in its **draft form** (`create-branch`, `draft-email`, `test-mode-refund`, `propose-write`); the live form (`merge`, `send`, `live-refund`, `apply-write`) is absent. A misbehaving or jailbroken agent **cannot** fire early because the capability isn't in its hands. **Self-policing is not safety** — the existing pattern where the agent itself chooses to post a review (AD8b) may only *raise* caution, never be the thing holding the gate. Layered, primary→backstop:

1. **Provisioning** (primary) — live verb/credential never in the agent's toolbox; Kernel-held.
2. **Sandbox boundary** — no side-door egress (shell, raw HTTP, another MCP server) to the capability.
3. **Interception** (backstop) — a pre-call hook refuses anything gated requested directly.

Who classifies a verb as gated is **not the agent** — it is resolved from the consequence's *reversibility* (verb, MCP `destructiveHint`/`idempotentHint`, native undo/test affordance) crossed with the agent×skill **autonomy level**. Both are Kernel/Strategy-owned.

## The single dial: graduated autonomy

There is **no separate policy engine** — no thresholds matrix, no allowlists, no per-tool risk table (the enterprise smell HyperIdle rejects). There is **one dial already in the system**: autonomy level per agent per skill, L1 (human in every loop) → L4 (autonomous unless blocked) ([trust-building](../human-interface-layer/trust-building-slow-cumulative.md) §10). It is at once:

- **Classification** — the level × reversibility decides whether an irreversible commit surfaces now or flows.
- **Customization** — the human moves one thing, the level; even that mostly arrives as a system-proposed review item ("Builder landed this 20× clean — promote to L3?"). The system owns *how* gating works; the human owns the trust level.
- **Learning** — the level graduates off the review track record (clean approvals propose a raise; rejections/edits hold or drop it). The review history *is* the training signal, per agent × skill × product. No ML subsystem.

The ratchet is **asymmetric**: the system may **auto-tighten** but may only **propose** loosening; a human always grants autonomy. And there is a **floor autonomy cannot cross** — irreversible **and** high-blast-radius consequences (large money, mass customer sends, prod data deletion) stay *blocked* even at L4. That permanent thin gate is the reason the product exists.

## Definition

A **Staged Operation** is the irreversible commit verb, frozen and parked: a deferred, fully-bound command to a connected capability, captured at the moment the agent decided to commit and held for the gate. A record/spec — not an event, not the act of executing.

## Essential properties

- **Target capability** — which tool/MCP + which harness runs it (resolved via the [harness capability descriptor](../agent-layer/harness-capability-descriptor.md), not a hardcoded map).
- **Operation** — the verb/call.
- **Fully-bound params** — deterministic; no late binding.
- **Idempotency key** — the at-most-once identity the tool/MCP + Kernel dedupe on.
- **Reversibility descriptor** — undo path, or "irreversible".
- **Attachment** — the consequence it commits, within a Subject.
- **Execution status** — `pending → executing → executed | failed`, or `held`.

## What it is not

- **Not a verdict.** The verdict triggers; the staged operation is triggered. Approve releases a frozen spec, not a live one.
- **Not a `ToolCallSummary`.** That records a low/medium-risk action the assistant *already executed* (AD8b). A staged operation is the not-yet-executed commit that routes to review — and the agent never auto-runs it.
- **Not a Task or Bet.** One commit, no assignment/cost/decomposition lifecycle.
- **Not the `action_operation` canvas.** The canvas renders a *view*; the staged operation is the backing executable spec.
- **Not carried by the `thread_resolved` event payload.** The event is at-least-once and carries references, not params; it is never the execution authority.
- **Not something the agent may execute itself.** The live verb is Kernel-held.
- **Not gated because it is unfamiliar.** The gate keys on irreversibility.

## Lifecycle

```
pending ──approve verdict on Subject──▶ executing ──tool ok──▶ executed
   │                                       └──tool errors──▶ failed
   └── non-approving verdict (request-changes / edit / reject) ──▶ held (un-executed)
```

`held` is terminal for this resolution; a re-open + fresh approve may re-enter `executing` **only if the op never reached `executing`/`executed`**. `executed`/`failed` are terminal and never re-run (retry = a new staged op with a new idempotency key).

## Operation Outcome

The recorded terminal result — `{ status: ok | failed, payload | error, executedAt }`. Written by the Kernel after the tool returns; **immutable once recorded**; surfaced where the staged operation's canvas rendered. A failure is an Outcome with `status: failed` and a surfaced error — **never** missing/silent.

## Authority

The agent/harness **stages** (authors the frozen spec). The human **verdict** triggers (commit authority). The **Kernel** executes — resolves capability, runs durably through the tool, enforces at-most-once, records the Outcome. The **tool/MCP** performs the side-effect. State of truth lives in HyperIdle, never in the tool.

## The verdict reshape

Grammar unchanged — five decisions, `approve` stays `approve`. An `approve` / `approve-with-comments` on a Subject is the **commit trigger**: it fires all of the Subject's consequences, executing each staged operation (the verdict resolves the whole Subject). Non-approving verdicts hold them. A consequence added to an existing action — not a new verdict action, not changed authorization, not per-artifact verdicts.

## Contracts

- **Cardinality.** Staged Operation → exactly 1 consequence it commits; Subject → 0..N consequences, 0..N staged operations; approve → fires all of its Subject's consequences; Staged Operation → 0..1 Operation Outcome, exactly 1 idempotency key.
- **Closure.** Executable tools/operations are **OPEN** (resolved via the harness capability descriptor). The reversibility axis and the L1–L4 autonomy ladder are **CLOSED**. AL7 proves the loop + at least one real tool path; broad coverage is follow-on.
- **Mutability.** The staged-operation **spec is immutable once staged** (no rebind between approve and execution — no TOCTOU). Only status mutates. Outcome immutable once recorded. The autonomy level changes only via a Kernel/Strategy path (a review item), never by the agent.
- **Identity.** Opaque stable id; the **idempotency key** is the at-most-once execution identity.

## Hard rules

1. **At-most-once per approval** — a persisted conditional transition on the idempotency key / status (`WHERE status='pending'`, mirroring first-verdict-wins in `packages/server/src/routes/threads.ts`), **independent of the at-least-once event bus**. A re-delivered `thread_resolved`, a re-opened review, or a re-rendered canvas must never double-execute.
2. **Never irreversible without a human** (ETHOS §3). Reversible consequences may flow per the agent×skill autonomy level.
3. **The agent never holds the live verb** — Kernel-held; agent gets only the draft form. Enforced by provisioning + sandbox + interception, not self-policing.
4. **Gate keys on irreversibility, not familiarity.** Unknown-but-reversible flows.
5. **The trust ratchet is one-way-safe** — auto-tighten allowed; loosening only proposed, human grants. Irreversible + high-blast-radius stays blocked even at L4.
6. **No consequence-free review** — every approve fires ≥1 consequence.
7. **Verdict grammar unchanged.**
8. **Failure surfaces** as a `failed` Outcome — never silently swallowed.
9. **The approved spec is what executes** — params frozen at staging.
10. **Trigger, not executor** — HyperIdle triggers and gates; the tool/MCP executes ([system boundary](../architecture/system-boundary.md)).

## Vocabulary

| Term | Definition | Aliases not to use |
|---|---|---|
| **Consequence** | What an approve sets in motion (internal state move or external tool call). | side-effect, effect |
| **Staged Operation** | The irreversible commit verb, fully-bound and parked un-executed behind the gate. | staged action, pending action, queued command, bare "operation" |
| **Reversibility / irreversible** | Whether a consequence can be undone; the classifier that decides gating. | risk level, criticality (name the parts: irreversibility × blast-radius) |
| **Draft space** | The reversible place the agent iterates so only one verb is irreversible. | staging environment (only archetype-deploy is literally an env) |
| **Capability split** | Agent holds draft verbs only; live verb/credential is Kernel-held. | permission, RBAC |
| **Graduated autonomy** | The single trust dial: per agent × skill, L1→L4. | policy, ruleset, threshold matrix, allowlist |
| **execute / Execution** | The durable Kernel act of carrying a staged op out through its tool. | dispatch (collides with `task-dispatcher`), fire, run |
| **Operation Outcome** | Recorded terminal result (ok/failed + payload/error). | result (banned Artifact alias), response, receipt |
| **Idempotency key** | The at-most-once identity; tool/MCP + Kernel dedupe on it. | nonce, request id, dedup token |

## As-built implementation (AL7)

### Data model (`packages/db/src/schema.ts`)

Two tables: `staged_operations` and `operation_outcomes`.

**`staged_operations` key fields:**
- `review_message_id` (FK → `messages.id`, `onDelete: restrict`) — the **dispatch key**. Verdict resolution is per-message (`threads.ts` first-verdict-wins); staged ops are keyed to the exact review message whose `approve` will fire them. This prevents a bet's reused host thread from firing one review's ops when a different review is approved (C1 correctness).
- `subject_thread_id` (FK → `threads.id`) — the bet host thread. Used as a **loader/index anchor only** — never the dispatch key.
- `status` text column: `"pending" | "executing" | "executed" | "failed"`. No `"held"` value is stored — a non-approving verdict simply does not dispatch; the op stays `"pending"`. `"held"` is the conceptual label for that state.
- `idempotency_key` UNIQUE index — an **anti-fork guard**: prevents two rows for the same key (forked commits). This is NOT the at-most-once execution guard (that is the `WHERE status='pending'` conditional UPDATE claim in the dispatcher).
- `params` stored as JSON text; the dispatcher `JSON.parse`s before calling `executeCapability`.

**`operation_outcomes`:** `staged_operation_id` is the PK (enforces 0..1 per staged op and immutability — a duplicate write throws on PK conflict rather than overwriting).

### Dispatcher (`packages/server/src/services/staged-operation-dispatcher.ts`)

`resolveStagedOperations(deps, reviewMessageId)`:
1. Selects all `status='pending'` rows for the given `reviewMessageId`.
2. For each: conditional UPDATE `status='pending' → 'executing'` (the at-most-once claim — mirrors `threads.ts` first-verdict-wins). If 0 rows updated, already claimed — skip.
3. Passes the **frozen spec** (params JSON-parsed, idempotencyKey forwarded) to `deps.executeCapability`. On success writes `operation_outcomes` row `status='ok'` + sets staged op `status='executed'`. On error writes `status='failed'` with verbatim error message — never silenced.
4. Emits `operation_executed` event with `streamId = subjectThreadId` for the UI.

`sweepStrandedOperations(deps)`: runs on **server boot**. Finds any `status='executing'` row with no `operation_outcomes` row (crash-stranded between claim and outcome write). Writes a `failed` Outcome: `"Operation interrupted: process crashed during execution. Manual inspection required."` — honest surfacing, not re-execution (cannot know if the side-effect already landed).

### Kernel-held-verb gate (`KERNEL_DISPATCHABLE_CAPABILITIES`)

At **stage time**, the `stage_operation` tool validates `(capabilityTool, operation)` against `KERNEL_DISPATCHABLE_CAPABILITIES` — a `ReadonlySet` in the dispatcher module. Currently: `"fixture:staged-op/echo"` (deterministic in-process) and `"github/merge_pr"` (real archetype-A forge path).

**What this IS and is NOT:**
- It enforces: "the staged capability must be a verb the kernel can dispatch."
- It does NOT enforce: "this specific agent was provisioned this capability."
- Per-agent capability provisioning is **deferred**: AL8 (tool grant / trust tier) owns the provisioning surface; AM2 (harness capability descriptor, OPEN vocab) owns the descriptor lookup that will eventually replace this closed allowlist. Until those land, `buildToolRegistry` gates by ROLE only, and per-agent external-capability grants do not exist.

### Verdict path wiring (`packages/server/src/routes/threads.ts`)

After the resolution transaction commits, **only** for `approve` / `approve-with-comments`, dispatch is called keyed on the resolved review message id (`resolvesMessageRow.id`). Awaited inline (not fire-and-forget). `dispatchDeps` is non-optional in the live boot — an absent dep in the approve branch surfaces as an error, never a silent no-op.

### Reviews loader (`packages/server/src/routes/reviews.ts`)

`createReviewRoutes(db)` now takes a `db` dependency (was unwired; `app.ts` previously called it with no args). The loader queries `staged_operations LEFT JOIN operation_outcomes WHERE review_message_id = ?`, humanizes `executedAt` (stored ISO → relative display string via `relativeLong`), and nests `stagedOperation` on the matching artifact in the response. Field names: `stagedOperationId` (not `id`), `outcome.receipt` (extracted tool-identity string, not raw payload object). The `rev-1` stub fixture is preserved for design/demo.

### Scope deferrals (honest — not overclaimed)

These are explicitly NOT built in AL7:
- **Per-agent capability provisioning** — AL8 (tool grant / trust tier) + AM2 (harness capability descriptor). The `KERNEL_DISPATCHABLE_CAPABILITIES` allowlist is a stopgap until those land.
- **Graduated-autonomy auto-flow path** — the reversible-consequence path that bypasses review entirely at high autonomy levels. AL7's loop is the *gated* arm only.
- **Broad per-tool dispatch coverage** — `executeCapability` is a 2-entry map (fixture + GitHub merge). Additional connectors land in AL8.
- **Multi-step transactional rollback / retry engine** — the narrow boot sweep (stranded `executing` → `failed`) is in scope; the broad rollback engine is not.

## Rationale

AL1–AL4 built the *review*; the action-operation canvas approves into the void. AL7 is the **act**. The founder deep-dive (2026-06-22/23) reshaped it away from two flaws worth recording so they are never reintroduced: (1) "descriptive artifacts do nothing on approve" — wrong, a review that changes nothing should not exist; replaced by *every approve fires consequences*, classified by **reversibility**. (2) "unknown defaults to gated, via a multi-layer policy waterfall" — wrong twice: gating the unfamiliar-but-reversible is approval fatigue, and a thresholds/allowlists policy engine is the enterprise product HyperIdle is not; replaced by ETHOS §3's line (**irreversibility**) and the existing single dial, **graduated autonomy per agent×skill**, which is classification, customization, and learning in one. The load-bearing safety idea is the **capability split**: the agent works freely in a reversible draft space and never holds the one irreversible commit verb, which the Kernel exercises only on a human approve.

Parked unbiased in `plans/AL1/design/review-system.md` §4 (2026-06-17); shaped + locked as concept (2026-06-22/23); implementation shipped as AL7. Framed by `plans/AL8/boundary-concept.md`.

Next: [Review primitive](../human-interface-layer/review-primitive.md) · [Artifact primitive](./artifact-primitive.md) · [Harness capability descriptor](../agent-layer/harness-capability-descriptor.md) · [Trust-building](../human-interface-layer/trust-building-slow-cumulative.md) · [System boundary](../architecture/system-boundary.md).
