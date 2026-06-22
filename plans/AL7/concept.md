# AL7 — Review execution loop · Concept

**Level:** per-workpackage. Inherits the locked Review/Verdict/Artifact concepts + the system boundary (`plans/AL8/boundary-concept.md`) as fixed inputs.

**Mode:** founder-shaped (interactive deep-dive, 2026-06-22/23). This doc is the locked output of that shaping.

---

## What this is, in one breath

Approving a review is what makes the agent's work actually *happen* in the world — the refund fires, the deploy lands, the email sends — through the connected tool, at-most-once, with the result returning to the review. HyperIdle is the **trigger and the gate**; the connected system is the **executor** (`plans/AL8/boundary-concept.md`). Today approve records a verdict and fires nothing (`ReviewActionOperation.onApprove` → no-op). AL7 gives it teeth.

The whole design rests on one principle from `ETHOS.md` §3 (User Sovereignty): **never make an irreversible decision without a human — but never put a human in front of a reversible one.** Everything below is the machinery that makes that true without burying anyone in approvals.

---

## Required reading (downstream `/architecture`, `/pipeline` must read)

- `plans/AL8/boundary-concept.md` + `docs/architecture/system-boundary.md` — **trigger-not-executor**; ride git / integrate infra via MCP / replace the collaboration layer. AL7's outer frame.
- `ETHOS.md` §3 (User Sovereignty) — "never make irreversible decisions without human approval"; surface decisions, present trade-offs. The criterion is **irreversibility**, not unfamiliarity.
- `docs/human-interface-layer/trust-building-slow-cumulative.md` §10 — **graduated autonomy per agent per skill (L1→L4)** is *the* trust dial; reversibility cues; reasoning + cost transparency.
- `plans/AL1/design/review-system.md` §4 — the parked, unbiased execution-loop sketch this concept resolves.
- `docs/human-interface-layer/review-primitive.md` — Subject = a set of artifacts, one verdict resolves the whole Subject.
- `docs/human-interface-layer/verdict-actions.md` + `packages/shared/src/thread.ts` (`VERDICT_DECISIONS`, `VerdictPayload`) — the 5 binding verdicts.
- `packages/server/src/routes/threads.ts` §1204–1375 — the verdict-resolution transaction: first-verdict-wins (`WHERE resolvedAt IS NULL`), `thread_resolved` emission. **The trigger seam.**
- `docs/architecture/event-bus-guarantees.md` — **at-least-once** delivery. Load-bearing for at-most-once execution.
- `docs/agent-layer/harness-capability-descriptor.md` — Kernel-owned declaration of what a tool/harness can run; capability is resolved here, not from a hardcoded tool map. Strategy reads, cannot mutate.
- `packages/web/src/pages/review/ReviewActionOperation.tsx` — the pre-commit receipt canvas with the dead `onApprove`.
- `packages/server/src/tools/tool-registry.ts` — how agent tool calls are validated + invoked today (role-gated). The execution path is the *human-gated, durable* sibling of this.

---

## Phase 0 — The nouns

| Noun | Classification | One-line working definition |
|---|---|---|
| **Consequence** | **New** (central frame) | What an approve sets in motion. Every review has ≥1. Internal (close task, launch session, hand off) or external (a tool call). A review that fires nothing does not exist. |
| **Staged Operation** | **New primitive** (central) | The *irreversible* consequence — one fully-bound commit through a connected tool — parked un-executed behind the gate. The subset of consequences a human must clear. |
| **Reversibility** | **New axis** (the classifier) | Whether a consequence can be undone. Reversible flows; irreversible is where the human gate lives. This — not familiarity — is what decides whether something is gated. |
| **Draft space** | **New** (safety mechanism) | The reversible place an agent iterates freely so that only one verb is irreversible. Three archetypes (Phase 1). |
| **Capability split** | **New invariant** (the enforcement) | The agent holds only the draft/safe verbs; the live commit verb (or live credential) is Kernel-held. Approval is the only bridge. |
| **Graduated autonomy** | **Stable** (input — the trust dial) | Per agent × skill, L1→L4, already in `trust-building` §10. Decides how much reversible work flows unwatched and proposes its own promotions. AL7 reads it; does not redefine it. |
| **Operation Outcome** | **New** (satellite) | The recorded terminal result (ok/failed) of an executed staged operation, surfaced against the review. |
| **Execution** | **New act** (satellite) | The durable Kernel act of carrying a staged operation out through its tool on approve, at-most-once, and recording the Outcome. |
| **Verdict** | **Reshaped** | Existing 5-decision resolution. Unchanged grammar; `approve` gains consequences. |
| Subject / Artifact / Tool | Stable (input) | The set under one verdict; the L3 artifact (`kind`=renderer, `label`=domain); the MCP/tool a harness can invoke. |

**Human-design-review forecast:** unchanged at **No**. Runtime/data primitives + the Outcome surface *extend* the existing `ReviewActionOperation` canvas; no new base component. `/design`'s `DESIGN-CLASS` stays authoritative.

---

## Phase 1 — Essence

### The frame: every approve has consequences

A review is a decision point, and a decision moves the world. There is no consequence-free review — even approving a chart at minimum **resolves its work** (closes the task / advances the bet) and may **launch the next step** (a follow-up session, a handoff). So the old "descriptive artifacts do nothing on approve" framing is wrong and is retired. The real question is never *whether* something happens — it's *what* happens and *whether it can be undone*.

A consequence is **internal** (a HyperIdle state move: resolve task, launch session, hand off, promote knowledge) or **external** (a call to a connected tool). Both ride the same machinery. Internal state moves are almost always reversible. The external commits are where irreversibility — and the gate — concentrate.

### The classifier: reversibility, not familiarity

The gate exists for **irreversible** consequences. Reversible consequences flow at the agent's earned autonomy; they do not interrupt a human (`trust` §10: "reversible items approve with lower friction"). A brand-new, never-seen, *reversible* tool just runs — there is nothing to fear, it can be undone. **Unknown does not mean gated.** Gating the unfamiliar-but-reversible is exactly the approval fatigue that drowned the first generation of agent tools, and `ETHOS.md` §3 names the real line: *irreversible*. The dangerous quadrant — irreversible **and** not-yet-trusted — is rare, and surfacing precisely that is the product, not friction.

### The safety mechanism: shrink the irreversible surface to one verb (Draft space + the three archetypes)

Most "irreversible" work isn't, if you give the agent a reversible place to work. The agent iterates freely in a **draft space**; only a single **commit verb** crosses into the irreversible world, and that verb is the staged operation. How the draft space is realized has three archetypes:

- **A · Native draft / branch.** The tool ships a non-destructive draft object — git branch, Gmail draft, Figma branch, preview deploy, Notion draft. The agent commits, pushes, re-renders, runs CI freely; the gated verb is the tool's own commit (**merge / send / publish / promote**). *Best case — agent gets the widest room, the gate is one narrow door.* This is the code/Figma shape: the diff is reversible, only the **landing** is sharp.
- **B · Test / sandbox credential.** No draft object, but a test mode exists — Stripe test keys, sandbox APIs. The agent iterates against **non-live** credentials; the gated verb is the **live-credential** call. *Safety = credential split, not a draft object.*
- **C · No draft, no test mode.** Ledger writes, one-shot record changes, irreversible admin. No reversible iteration space exists, so the **proposal the agent assembles inside HyperIdle is the only draft** (the field deltas, the exact call); nothing reaches the real system until approve. **C executes exactly like A and B** — the operation model is archetype-uniform; it stages, gates, and executes the same way regardless. *Whether a system even ends up in C — i.e. whether a draft/test space exists at all — is the responsibility of the **connector/setup** to that external system, not of the operation model (founder, 2026-06-23). A connector that can offer a branch or a test key SHOULD, pushing the system toward A or B; where it genuinely cannot, C is the honest floor and the operation model treats it no differently.*

The reviewer always attaches the same two things: **the proof** (diff / rendered email / field deltas — which picks the AL2 canvas) and **the one gated commit verb** behind the approve button.

### The enforcement: capability split (the agent never holds the button)

> The agent holds the request slip, never the button. Like a junior who can *draft* a wire transfer but physically cannot *send* one.

The live commit verb / live credential lives with the **Kernel**, never in the agent's session. A gated tool is provisioned to the agent only in its **draft form** (`create-branch`, `draft-email`, `test-mode-refund`, `propose-write`); the live form (`merge`, `send`, `live-refund`, `apply-write`) is absent. So a misbehaving or jailbroken agent **cannot** fire early — not because it's well-behaved, but because the capability and credential aren't in its hands. **Self-policing is not safety**: the existing pattern where the agent *itself* decides "this is risky, I'll post a review" (AD8b) is allowed only to *raise* caution, never to be the thing that holds the gate.

Enforcement is layered, primary-to-backstop:
1. **Provisioning** (primary) — the live verb / credential is never in the agent's toolbox or session. Kernel-held.
2. **Sandbox boundary** — no side-door egress (shell, raw HTTP, another MCP server) to the capability.
3. **Interception** (backstop) — a pre-call hook refuses anything gated that was somehow requested directly.

**Who classifies a verb as gated is not the agent.** It is resolved from the consequence's *reversibility* (the capability's nature — verb, MCP `destructiveHint`/`idempotentHint`, native undo/test affordance) crossed with the **graduated-autonomy level** of this agent×skill. Both are Kernel/Strategy-owned, never agent-editable.

### The single dial: graduated autonomy (classification + customization + learning, all one thing)

There is **no separate policy engine** — no thresholds matrix, no allowlists, no per-tool risk table (that is the enterprise smell AL7 explicitly rejects; HyperIdle targets solo founders / small teams, `project_positioning_2026_06`). There is **one dial already in the system**: autonomy level per agent per skill, L1 (human in every loop) → L4 (autonomous unless blocked), `trust` §10. It is simultaneously:

- **Classification** — the level, crossed with reversibility, decides whether a given irreversible commit surfaces now or flows.
- **Customization** — the human moves *one* thing, the level, and even that mostly arrives as a **system-proposed review item** ("Builder has landed this skill 20× clean — promote to L3?"). Linear-like: the system owns *how* gating works; the human owns the trust level and the *what*.
- **Learning** — the level graduates off the **review track record**. Clean approvals propose a raise; rejections/edits hold or drop it. The review history *is* the training signal, per agent × skill × product. No ML subsystem; the loop tunes itself.

**The trust ratchet is asymmetric:** the system may **auto-tighten** (raise the gate after rejections/failures — the safe direction) but may only **propose** loosening; a human always grants autonomy. And there is a **floor autonomy cannot cross**: irreversible **and** high-blast-radius consequences (large money, mass customer-facing sends, prod data deletion) stay *blocked* even at L4 — L4 means "autonomous unless blocked," and these are what stays blocked. That permanent thin gate is not a trust deficit; it is the reason the product exists.

### Staged Operation (the central primitive, precisely)

The irreversible commit verb, frozen and parked. **Identity:** a deferred, fully-bound command to a connected capability, captured at the moment the agent decided to commit and held for the gate — a record/spec, not an event, not the act of executing. **Essential properties:** target capability (resolved via the harness capability descriptor); the operation/verb; **fully-bound params** (deterministic, no late binding); an **idempotency key** (the at-most-once identity the tool + Kernel dedupe on); a **reversibility descriptor**; attachment to its consequence within a Subject; an **execution status** (`pending → executing → executed | failed`, or `held`).

**Lifecycle.**
```
pending ──approve verdict on Subject──▶ executing ──tool ok──▶ executed
   │                                       └──tool errors──▶ failed
   └── non-approving verdict (request-changes / edit / reject) ──▶ held (un-executed)
```
`held` is terminal for this resolution; a re-open + fresh approve may re-enter `executing` **only if the op never reached `executing`/`executed`**. `executed`/`failed` are terminal and never re-run (retry = a new staged op, new idempotency key).

**Authority.** The agent/harness *stages* (authors the frozen spec). The human *verdict* triggers (holds commit authority). The **Kernel** executes (resolves capability, runs through the tool durably, enforces at-most-once, records the Outcome). The **tool/MCP** performs the side-effect. State of truth lives in HyperIdle, never in the tool.

### Operation Outcome (satellite)

The recorded terminal result of one executed staged operation — `{ status: ok | failed, payload | error, executedAt }`. Written by the Kernel after the tool returns; **immutable once recorded**; surfaced where the staged operation's canvas rendered. A failure is an Outcome with `status: failed` and a surfaced error — **never** a missing/silent Outcome.

### Verdict (reshape)

Grammar **unchanged** — 5 decisions, `approve` stays `approve`. The reshape: an `approve` / `approve-with-comments` on a Subject is the **commit trigger** — it fires all of the Subject's consequences, executing each staged operation (the verdict resolves the whole Subject). `request-changes` / `edit` / `reject` hold them. A consequence added to an existing action — not a new verdict action, not changed authorization, not per-artifact verdicts.

---

## Phase 2 — Rejection list (what these are NOT)

**A Staged Operation is NOT:**
1. **…a Verdict.** The verdict triggers; the staged operation is triggered. Approve releases a *frozen* spec, does not contain a live one. — *Reason: keeps human authority separable from agent-authored command; the human approves exactly what runs.*
2. **…a `ToolCallSummary`** (`packages/shared/src/thread.ts`). That records a low/medium-risk action the assistant *already executed* (AD8b). A staged operation is the *not-yet-executed* commit that routes to review. — *Reason: preserves the two-tier split; AL7 is the high-stakes arm, and the agent never auto-runs it.*
3. **…a Task or Bet.** One commit bound to one consequence — no assignment, cost, or decomposition lifecycle. — *Reason: it is a single irreversible verb, not a unit of planned work.*
4. **…the `action_operation` canvas.** The canvas renders a *view*; the staged operation is the backing executable spec. AL2 shipped the receipt with a dead `onApprove`. — *Reason: separating render from execution is the entire gap.*
5. **…carried by the `thread_resolved` event payload.** The event signals "resolved," carries references not params, and is **at-least-once** — so it can never be the execution authority. — *Reason: a double-delivered event must not double-spend.*
6. **…something the agent may execute itself.** The live verb is Kernel-held; the agent only ever stages. — *Reason: self-policing is not safety; the capability split is.*

**A review is NOT consequence-free.** Every approve fires ≥1 consequence (at minimum resolving its work). The retired idea was "descriptive artifacts do nothing." — *Reason: a review that changes nothing should not exist; if approve had no effect, the review was theatre.*

**"Gated" is NOT "unfamiliar."** The gate keys on **irreversibility**, not on whether we have seen the tool. — *Reason: gating the unknown-but-reversible is the approval-fatigue trap ETHOS §3 steers away from.*

**The trust dial is NOT a policy engine.** No thresholds/allowlists/risk-tables. One graduated-autonomy level per agent×skill. — *Reason: thresholds-and-allowlists is the enterprise product we are explicitly not building; the system decides *how*, the human decides the trust level.*

**A descriptive artifact's *landing* IS an operative staged op (the pair).** *(founder, 2026-06-22, `plans/AL8/boundary-concept.md`)* A code change is a **descriptive diff + an operative landing pair**: approve accepts the diff (reversible, on a branch) and triggers the landing's staged op (merge/deploy — the irreversible verb) through the forge/CI tool. The diff staying descriptive is unchanged; the landing gains teeth. — *Reason: locates the single irreversible verb (landing) precisely, archetype A.*

---

## Phase 3 — Vocabulary lock

| Term | Definition | Aliases NOT to use |
|---|---|---|
| **Consequence** | What an approve sets in motion (internal state move or external tool call); every review has ≥1. | side-effect (too low-level), effect |
| **Staged Operation** | The irreversible commit verb, fully-bound and parked un-executed behind the gate. | staged action, pending action, queued command, bare "operation" (ambiguous with verdict actions) |
| **Reversibility / irreversible** | Whether a consequence can be undone; the classifier that decides gating. | risk level, criticality (criticality ≈ irreversibility × blast-radius — name the parts, not a blended score) |
| **Draft space** | The reversible place the agent iterates so only one verb is irreversible (3 archetypes). | staging environment (overloaded — only archetype-deploy is literally an env), sandbox-only |
| **Capability split** | Agent holds draft verbs only; live commit verb / credential is Kernel-held. | permission, RBAC (enterprise smell) |
| **Graduated autonomy** | The single trust dial: per agent × skill, L1→L4; classification + customization + learning. | policy, ruleset, threshold matrix, allowlist |
| **execute / Execution** | The durable Kernel act of carrying a staged op out through its tool on approve. | dispatch (collides with `task-dispatcher`), fire, run |
| **Operation Outcome** | Recorded terminal result (ok/failed + payload/error) of an executed staged op. | result (banned Artifact alias), response, receipt (the receipt is the pre-commit view) |
| **Idempotency key** | The at-most-once identity; tool/MCP + Kernel dedupe on it. | nonce, request id, dedup token |

Authoritative language: English. The AL2 canvas kind stays `action_operation` (it renders a Staged Operation; noun and canvas-kind deliberately distinct).

---

## Phase 4 — Contracts

- **Cardinality.** Staged Operation → exactly **1** consequence it commits; a Subject → **0..N** consequences, **0..N** staged operations. An approve → fires **all** of its Subject's consequences (resolves the whole Subject). Staged Operation → **0..1** Operation Outcome, exactly **1** idempotency key.
- **Closure.** Executable tools/operations are **OPEN** — capability resolved via the harness capability descriptor; a never-special-cased tool still works once its harness declares it (mirrors open artifact-kind vocab). The **reversibility** axis and the **autonomy** ladder (L1–L4) are **CLOSED**. AL7 proves the loop + **at least one real tool path** (one archetype end-to-end); broad per-tool coverage is explicit follow-on.
- **Mutability.** A staged operation's **spec is immutable once staged** (capability, operation, bound params, idempotency key, reversibility) — the human approves exactly what executes; no rebind between approve and execution (no TOCTOU). Only execution status mutates. The Operation Outcome is immutable once recorded. The autonomy level is mutable but only via a Kernel/Strategy path (a review item), never by the agent.
- **Identity.** Opaque stable id; the **idempotency key** is the at-most-once execution identity (deterministic, agent-authored, stable across re-opens).
- **Hard rules.**
  1. **At-most-once per approval.** Guarded by a persisted conditional state transition on the idempotency key / op status (`WHERE status='pending'`-style claim, mirroring `threads.ts` first-verdict-wins), **independent of the at-least-once event bus**. A re-delivered `thread_resolved`, a re-opened review, or a re-rendered canvas must **never** double-execute.
  2. **Never irreversible without a human.** An irreversible consequence cannot execute without a binding approve from an authorized human (ETHOS §3). Reversible consequences may flow per the agent×skill autonomy level.
  3. **The agent never holds the live verb.** Gated commit verbs / live credentials are Kernel-held; the agent is provisioned only the draft-space form. Enforced by provisioning + sandbox + interception, not by agent self-policing.
  4. **Gate keys on irreversibility, not familiarity.** Unknown-but-reversible flows; the gate is reserved for irreversible consequences.
  5. **The trust ratchet is one-way-safe.** The system may auto-tighten autonomy; loosening is only ever proposed and requires a human. Irreversible + high-blast-radius consequences stay blocked even at L4.
  6. **No consequence-free review.** Every approve fires ≥1 consequence (at minimum resolving its work).
  7. **Verdict grammar unchanged.** Approve gains consequences, not a new action; authorization untouched.
  8. **Failure surfaces.** An execution failure produces a `failed` Operation Outcome visible against the review — never silently swallowed.
  9. **The approved spec is what executes** — params frozen at staging; the Kernel runs the frozen spec.
  10. **Trigger, not executor.** HyperIdle triggers and gates; the connected tool/MCP executes (`plans/AL8/boundary-concept.md`). HyperIdle never reimplements the tool's side-effect.

---

## Rationale

The founder's core loop is **plan → review → act** (`project_positioning_2026_06`; `review-system.md` §4, parked 2026-06-17). AL1–AL4 built the *review*; the action-operation canvas approves into the void. AL7 is the **act** — and the founder deep-dive (2026-06-22/23) reshaped it away from a first draft that had two flaws worth recording so they are never reintroduced:

1. **"Descriptive vs operative; descriptive does nothing."** Wrong — a review that changes nothing should not exist. Replaced by: *every approve fires consequences*, internal or external; the real axis is **reversibility**. (The descriptive/operative pairing survives only as *where the irreversible verb sits* — the diff+landing pair.)
2. **"Unknown defaults to gated," classified by a 4-layer policy waterfall.** Wrong twice: gating the unfamiliar-but-reversible *is* the approval fatigue that sank first-gen agent tools, and a thresholds/allowlists/risk-table policy engine is the enterprise product we explicitly are not (`positioning`). Replaced by ETHOS §3's actual line — **irreversibility** — and the system's *existing* single dial, **graduated autonomy per agent×skill** (`trust` §10), which is classification, customization, and learning in one and tunes itself through the review loop.

The load-bearing safety idea is the **capability split**: the agent works freely in a reversible **draft space** (branch / test key / in-app proposal) and never holds the one irreversible **commit verb**, which the Kernel exercises only on a human approve. This is what lets agents iterate hard without doing harm — the gate shrinks to a single verb, and that verb is the only thing a human ever sees, less and less often as trust graduates.

These are expensive to change once architecture binds them to schema, provisioning, and dispatch — hence locked here, before `/architecture`.

---

## Phase 6 — Self-critique

- **Aligned with ETHOS / positioning / trust docs?** Yes, and re-grounded after the deep-dive: criterion = irreversibility (ETHOS §3), one dial not a policy engine (positioning, anti-enterprise), graduated autonomy is the existing trust mechanism (`trust` §10), trigger-not-executor (`plans/AL8/boundary-concept.md`).
- **Rejection list distinct?** Nine rejections, each a different adjacent concept with its own reason; no overlap.
- **Term collisions?** "dispatch" → `task-dispatcher` (avoided); "result" banned (→ Operation Outcome); "policy/RBAC/threshold" deliberately rejected as enterprise smell; "staging environment" disambiguated (only archetype-deploy is literally an env).
- **Contracts complete?** Cardinality/closure/mutability/identity pinned; at-most-once tied to a concrete persisted-claim independent of the at-least-once bus; the one scope cut (one real tool path; broad coverage follow-on) stated.
- **Archetype-C question — RESOLVED (founder, 2026-06-23).** C executes exactly like A and B; the operation model is archetype-uniform and carries no special dry-run-proof requirement. Avoiding C — providing a draft/test space — is the **connector/setup's** responsibility, not the operation model's. So there is no per-archetype branch in the staged-operation lifecycle or schema.
- **Right files touched?** This doc; ground truth → `docs/process-layer/staged-operation.md` (rewritten) + canonical-shapes entry; cross-reference in `review-primitive.md`. No other concept doc redefines these nouns.

**Concept LOCKED.** Downstream explores inside it; it does not reshape it.
