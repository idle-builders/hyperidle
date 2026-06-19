# AL1 — Concept: The Review Experience

**Workpackage:** AL1 (Track AL). Founder-led concept act, run after the AL1 research (`AL1-review-experience-dossier.md`, `AL1-voice-of-the-user.md`).
**Date:** 2026-06-15
**Status:** LOCKED (founder forks resolved 2026-06-15). Downstream `/design` + `/architecture` explore *inside* this concept; they do not reshape it.

> **Why this concept act exists.** HyperIdle already had a review concept (`docs/product/human-ai-collaboration.md` §"Review threads use the GitHub PR model") — a good start, but written *before* the AL1 research. The research changed what we know: the loudest, most-upvoted, most-viral pain in the space is that **the diff is no longer enough to review agent work** — reviewers can't see *why*, can't trust green tests, and drown in volume. This act reshapes the review concept to that depth and locks the load-bearing nouns **and the parts of the reviewing experience**.

> **The concept question this act answers** is two-sided: (1) *what are the nouns* (Subject, Intent, Rationale, Reviewer, Anchor, Verdict)? and (2) *what are all the parts of a nice reviewing experience* — the things on screen that let you **examine** the work and **converse** about it at the same time? The first is fully locked below. The second is enumerated (§1.5) as the brief `/design` must satisfy — concept names the parts and the central tension; design lays them out.

---

## Required reading (downstream `/design`, `/architecture`, `/pipeline` must read these)

- `.pipeline/work-packages/TRACK-AL.md` — AL1 spec.
- `plans/AL1/AL1-review-experience-dossier.md` — competitive map (docs/vendor-sourced).
- `plans/AL1/AL1-voice-of-the-user.md` — forum/VoC, confidence-tiered (§5.5 = how to treat the Reddit inputs).
- `docs/human-interface-layer/thread-primitive.md` — the conversation container the *feedback* part reuses. `review`/`verdict` are message types.
- `docs/human-interface-layer/verdict-actions.md` — the 10 verdict-grammar actions (5 binding + non/​sidecar).
- `docs/product/human-ai-collaboration.md` — the prior review concept this act deepens (+ autonomy L1–L4, **five artifact renderers**, cost-per-thread).
- `docs/process-layer/teams-persistent-product-bound.md` — **Reviewer already exists as a team role.** Reshaped here.
- `docs/process-layer/lifecycle-propagation.md` — reviews fire at **task completion** and at **bet ship-confirmation** (the two natural review units).
- `docs/process-layer/artifact-primitive.md`, `docs/process-layer/canonical-shapes.md` — Artifact + Money/TokenUsage the review carries.
- New ground truth from this act: `docs/human-interface-layer/review-primitive.md`.

---

## Phase 0 — The nouns

| Noun | Classification | One-line working definition |
|---|---|---|
| **Review** | **Reshaped** (composite) | The dual-anchored experience of judging a **Subject**: examine *what was produced* against *what was asked*, converse about it, render a Verdict. |
| **Subject** | **New** | The work product under review — the output of a **task** (default) or **bet** (ship-confirmation): a **set of one or more Artifacts**. The thing you examine. |
| **Intent** | **New** (satellite) | The captured "what was asked" the Subject is judged against — the done-condition / spec / prompt, snapshotted. |
| **Rationale** | **New** (primitive) | The agent's structured, searchable account of *why* — decisions, alternatives discarded, confidence — spanning the Subject and linked to spots in it. |
| **Reviewer** | **Reshaped** | The party that renders the Verdict — **human or agent team-member**. A review always happens; *who* renders it is the live axis. |
| **Anchor** | **Reshaped** | The content-following pin binding a comment or Rationale entry to a precise spot in the Subject (line / paragraph / step / region / cell), across artifacts. |
| **Verdict** | **Stable** (input) | The binding decision terminating a Review (5 binding + non-binding). Resolves the **Subject as a whole**. Unchanged except *who* may issue it. |
| **Artifact** | **Stable** (input) | One produced thing; one of five renderer types. A Subject contains ≥1. Unchanged. |
| **Thread** | **Stable** (input) | The append-only container the *conversation* part reuses. Unchanged. |

Only the **New** and **Reshaped** nouns get concept work below. Stable nouns are inputs.

---

## Phase 1 — Essence (founder forks resolved)

### Subject — the unit of review (the cardinality fix)
**Identity.** The Subject is the **work product of a unit of work**, not a single file. Default grain = a **task's** output; at ship time = a **bet's** accumulated output. Either way it is a **set of one or more Artifacts** judged together. You do not approve 20 files one-by-one; you render one Verdict on the task/bet output, with inline feedback on individual spots underneath.

**Grounding.** This is the founder correction ("you review the output of a task or maybe a bet… a set of artifacts or maybe one") and it matches the existing lifecycle: reviews already fire at task-completion and at bet ship-confirmation (`lifecycle-propagation.md`). The VoC is blunt about the cost of getting this wrong — forcing per-artifact verdicts on agent changes ("300-file PR", "five AI PRs a day") is the review-fatigue that makes maintainers quit.

**Composition.** A Subject contains ≥1 Artifacts (each with its own renderer); carries one Rationale spanning the set; is anchored to one Intent; carries the producing session's Cost.

**Grain (locked).** The **default Subject is a task's output** — *every* completed task gets a Review (rendered by a human or a trusted agent per autonomy). The **bet** is reviewed at ship-confirmation, and a **bet review requires a human Reviewer** (the agent reviewer cannot ship a bet; `lifecycle-propagation.md` already makes bet→shipped human-confirmed). A finer **session-level** Subject is a deliberate **future** grain — add it only when a need appears, not now. Whether a Reviewer may re-group artifacts within a Subject is a `/design` exploration; the *unit of the binding Verdict is the Subject*, never the individual Artifact.

### Review — the dual-anchored experience
**Founder fork (locked):** *the unit of review is **dual-anchored** — Intent + Subject, both first-class.* The Verdict answers two questions at once: "did it do what we asked?" (Intent) and "is the output sound?" (Subject). From the research: *"the prompt is the real unit of review, not the diff"* (corroborated by arXiv intent-contracts, Jules/Devin plan-review) — but the output still matters because *"a slop PR refactors a function to look 'cleaner' while silently changing its behavior."* Diff-only misses intent; intent-only misses silent behavior change.

**Lifecycle.** `open → (comment / inline-comment / request-changes ↺) → resolved` by a binding Verdict — the Thread/verdict semantics already in `thread-primitive.md`. No new lifecycle.

### Intent — the first anchor
The snapshot of *what was asked* (done-condition / task spec / prompt), frozen at review-open so the Reviewer judges against a fixed target and can see what the Subject does *not* address (the "⚠ refund events NOT addressed" case). Produced by whoever set the work; immutable in the review.

### Rationale — the structured "why" (the differentiator)
**Founder fork (locked):** *structured primitive — not freeform text, not merely a transcript link.* Per-decision: the decision, alternatives discarded, confidence, and a map to the spots (Anchors) it touches and the Intent items it serves. Searchable ("show me the low-confidence decisions"). Produced by the producing agent; immutable once the review opens. This *is* the "missing context" reviewers name as the #1 problem with AI code.

### Reviewer — human or agent
**Founder fork (locked):** *a review always happens; the live axis is whether the Reviewer is a human or another agent/team-member* — **not** a within-diff risk filter. Already latent: teams include "a Reviewer for the product's primary artifact type." The first-line Reviewer may be a trusted agent; humans hold final judgment, pulled in by autonomy level (L1–L4) and `escalate`. **No self-review** — the reviewing agent is a distinct party from the producer (research white-space #5: same author = same blind spots). This reshapes "Agents execute, humans validate" into "the reviewer role may be delegated to a trusted agent; humans hold final judgment."

### Anchor — robust, content-following
Binds a comment or Rationale entry to a precise spot — **across the Subject's artifacts** — via **block identity** (`PlainPayloadWithBlockId`), never a coordinate or character offset. Robustness is make-or-break per the research: Frame.io's content-following anchors are *loved*; Figma's coordinate anchors and Word's anchor-deletion are *hated*.

---

## Phase 1.5 — The reviewing experience: what are all the parts

The founder's core note: the concept must do the *thought space* on the experience, not just declare "it's a thread." The thread is **one part** (the conversation channel); a review is a composite of parts that must coexist on screen. Concept enumerates the parts and the tension; `/design` resolves the layout.

**The parts (concept-level inventory):**

1. **Subject** — the set of Artifacts under review. The thing examined.
2. **Examination surface** — how each Artifact is made legible: the **five renderers** (`text_diff`, `content_preview`, `visual_comparison`, `action_summary`, `data_metrics`). Where you "look at stuff." A Subject of mixed types needs more than one.
3. **Intent panel** — what was asked, shown alongside, with the addressed / NOT-addressed mapping.
4. **Rationale** — the agent's why, navigable per-decision, each entry linked to its spot(s) in the Subject and its Intent item.
5. **Conversation / feedback channel** — the Thread: comments, replies, threaded discussion, resolve. Where you "give feedback like in a thread." (This is the part that reuses Thread — alignment, not the definition.)
6. **Anchors** — bind comments and Rationale entries to precise spots across the Subject; the join between *examining* and *conversing*.
7. **Verdict affordance** — the binding decision, always reachable; resolves the whole Subject.
8. **Cost** — token + money of the producing session.
9. **Navigation & progress** — moving across N Artifacts; per-Artifact "reviewed" state (the research's named "killer feature" for large changes); what's unresolved; what's blocking.
10. **Reviewer presence** — who is reviewing (human / agent); the heterogeneous case (an agent reviewer's pass that a human can override on escalation).

**The central tension (the concept question for the experience).** A review must let you **examine** — the Subject can be large (many artifacts, big diffs, rendered previews, the Intent and the Rationale: a lot of surface that wants space and focus) — *and* **converse** — anchored comments, replies, and the verdict, a persistent channel that wants to stay pinned to whatever you're looking at — **at the same time, on one screen**. "Examine vs. converse" is the load-bearing tension. Naming it and the ten parts is concept. **Resolving it is `/design`**: split-pane vs. overlay vs. inline thread rail; one conversation over the Subject vs. anchored sub-threads per spot; how the renderer and the thread share the viewport; how navigation across artifacts preserves comment context.

**One part-relationship the concept does fix:** there is **one Review conversation over the Subject** (one Thread), with **anchored inline comments** providing per-spot threading inside it — the GitHub-PR shape (one PR discussion + inline threads), not a separate thread per file. Design decides how that's surfaced; concept fixes that it's one conversation, many anchors.

---

## Phase 2 — Rejection list (what these are NOT)

**Review is NOT:**
- **…per-artifact approval.** The Verdict is over the **Subject** (task/bet output), not each file. Forcing per-file verdicts is the review-fatigue the research warns kills adoption.
- **…a chat thread with a verdict button.** It is dual-anchored (Intent + Subject) with an examination surface — not a static diff discussed in a side chat.
- **…the examination surface alone, or the thread alone.** It is the *composite* of the §1.5 parts. Reducing it to "the diff" or to "the thread" is the failure.
- **…per-tool-call approval.** That gates one action (a solved, different thing), not a work product.

**Subject is NOT:**
- **…a single Artifact** (the cardinality fix). It is the work product of a task/bet — a set.
- **…the bet itself or the task itself.** It is their *output*, snapshotted for judgment.

**Rationale is NOT:** the session transcript / live dial-in (raw), a prose summary above the diff (rejected fork), or an AI PR description (narrates *what*, not *why / alternatives / confidence* at decision grain).

**Reviewer is NOT:** always human; nor the producing agent (no closed-loop self-review); nor a within-diff risk filter (founder rejected hiding parts of the diff by risk — routing is *who reviews*).

**Anchor is NOT:** a coordinate/offset (the Figma/Word failure mode); nor a new content dialect (reuses `PlainPayloadWithBlockId`).

**Verdict is NOT reopened.** Five binding + non-binding actions, verbatim. Only the issuer widens to human|agent, and it resolves the Subject (not each Artifact).

---

## Phase 3 — Vocabulary lock

| Term | Definition | Aliases not to use |
|---|---|---|
| **Review** | Dual-anchored experience of judging a Subject against Intent, with Rationale, resolved by a Verdict. | review thread (= the Thread hosting the conversation), PR, approval, sign-off |
| **Subject** | The work product under review — task/bet output; a set of ≥1 Artifacts. | the artifact, the diff, the PR, the change (singular forms hide the set) |
| **Intent** | Snapshot of what was asked (done-condition / spec / prompt). | spec, prompt, ticket (sources *of* Intent) |
| **Rationale** | Agent's structured, searchable account of *why*. | reasoning, explanation, summary, PR description, transcript. *(Collides with the prose "**Rationale:**" section convention — here it is a typed primitive, not a header.)* |
| **Reviewer** | Party rendering the Verdict; human or agent. | approver, validator (implies human-only) |
| **Anchor** | Content-following pin via block identity, across artifacts. | pin, coordinate, position, offset |

---

## Phase 4 — Contracts

- **Cardinality.** A Review judges **one Subject**; a Subject contains **one or more Artifacts**. A Review has **one** Intent anchor, **one** Rationale spanning the Subject (may be empty for human-authored work), **one** Reviewer-of-record per binding Verdict, and is terminated by **one** binding Verdict that resolves the **whole Subject**. Inline comments/Anchors: **many** per Subject.
- **Closure.** Verdict actions **closed** (per `thread-primitive.md`). Anchor target kinds **closed** `{line, paragraph, step, region, cell}`. Reviewer kind **closed** `{human, agent}`. Subject membership is **open** (a task/bet may produce any number of artifacts).
- **Mutability.** Intent + Rationale **immutable** at review-open (audit invariant). The Subject's artifact *set* is fixed at review-open (re-submission opens a new review round). The binding Verdict **terminates** the Review. Anchors re-resolve as content changes but their block identity is stable.
- **Identity.** Review = `review`-message id. Subject = the task/bet output bundle id. Anchor = block id (`PlainPayloadWithBlockId`). Rationale entry = opaque id referencing Anchor(s) + Intent item.
- **Hard rules.**
  1. **The Verdict resolves the Subject, never an individual Artifact.** Per-artifact verdicts are forbidden (the review-fatigue failure mode).
  2. **Dual anchor mandatory.** A Review always carries an Intent snapshot; a Review with no Intent is a bare diff.
  3. **Rationale is the agent's, immutable, decision-grained, searchable.** Degrading it to prose or a transcript link breaks the concept.
  4. **Anchors bind to block identity, not geometry.** A comment lost when content changes under it means the concept is broken.
  5. **A review always happens.** Every completed **task** gets a Review (human|agent per autonomy); the variable is *who*, never *whether*. A **bet** review (ship-confirmation) **requires a human Reviewer**. Session-level review is a deferred future grain.
  6. **No self-review.** Reviewer agent ≠ producing agent.
  7. **One conversation per Subject** (one Thread), many anchored inline comments inside it.
  8. **Verdict grammar untouched.**

---

## Phase 5 — Ground-truth updates

- `plans/AL1/concept.md` — this file (per-WP concept lock).
- `docs/human-interface-layer/review-primitive.md` — **new** ground-truth primitive doc (sibling to `thread-primitive.md`).
- `docs/product/human-ai-collaboration.md` §"Review threads" — deepened to reference the primitive (Subject + dual-anchor + Rationale + Reviewer-can-be-agent), without reopening verdicts or renderers.

---

## Phase 6 — Self-critique (1 round)

- **Cardinality now right?** Yes — Subject (set of ≥1 Artifacts) is the unit; Verdict resolves the set; per-artifact verdicts explicitly forbidden. Fixes the founder's correction.
- **Did we do the experience thought-space?** Yes — §1.5 enumerates ten parts and names the **examine-vs-converse** tension as the load-bearing concept question, with the concept/design boundary drawn explicitly (parts + the one-conversation-per-Subject relationship are concept; layout is design).
- **Not dogmatic about the Thread?** Yes — the Thread is named as *one part* (the conversation channel) it reuses, not the definition of the experience.
- **Rejection list distinct?** Yes — Review (a composite experience), Subject (a set), Rationale (an object), Reviewer (a party), Anchor (a binding) are distinct; each rejection names a real temptation.
- **Vocabulary collisions?** **Rationale** vs. the prose "**Rationale:**" header convention (flagged; no primitive clash). **Reviewer** intentionally aligns with the team role. **Subject** — grep shows no conflicting primitive use.
- **Contracts complete?** Cardinality/closure/mutability/identity/hard-rules pinned, including the new Subject. Deferred to `/architecture`: the Rationale and Subject-bundle schemas, and to `/design`: the examine-vs-converse layout. Both correctly out of concept scope.
- **Right files?** review-primitive.md (new) + human-ai-collaboration.md (deepened); thread-primitive.md + verdict-actions.md correctly unchanged.

## Revision: AL1 deliverable decomposition (2026-06-18)

AL1's scope evolved from "research only" (per original track spec) to a composite: research dossier + concept lock + founder-approved design + TSX components. The founder drove 4 rounds of `/human-design-review` against rendered TSX, converging on one composition and 9 building-block canvases. Three composition variants were explored and rejected — they are deleted from the source tree; the record of what was tried and why it didn't win lives in `design/approved.md` §Rejection list and the design screenshots.

### Deliverable inventory — components in `packages/web/src/pages/review/`

All TSX in this directory is production code. AL2–AL5 extend and wire these same files with real data and server integration — they are not throwaway prototypes. The design is locked; downstream WPs may not re-litigate canvas shapes or composition layout.

**Composition (1):**

| File | Role |
|---|---|
| `ReviewCompositionRefined` (+ stories) | Center column + right pane, dual-anchor, verdict in header, one global thread with reference chips |

**Building-block canvases (9):**

| File | Proof family |
|---|---|
| `ReviewOutcomeSummary` | Frame lead (function-agnostic) |
| `ReviewFieldChangeSet` | Record/field change-set |
| `ReviewActionOperation` | Action/operation receipt |
| `ReviewRenderedInContext` | Rendered-in-context (email/docs) |
| `ReviewMetricsMoved` | Metrics/data-diff |
| `ReviewVisualDiff` | Visual before→after |
| `ReviewCodeDiff` | Code diff (must-win) |
| `ReviewBatch` | Batch/per-item container |
| `ReviewBrowserPreview` | Basic browser view |

**Shared (2):**

| File | Role |
|---|---|
| `ToolLogo` | Mini provider logos (monogram fallback; prod → simple-icons/Logo.dev) |
| `CanvasSourceHeader` | App name + "Open in <app> ↗" link |

**Fixture (1):**

| File | Role |
|---|---|
| `review-subject.fixture.ts` | `ReviewSubject` shape consumed by the composition |

### Deleted — superseded composition variants

These 3 composition variants were explored during human-design-review before converging on `ReviewCompositionRefined`. Per `design/approved.md` §Rejection list they are rejected. They are **deleted from the source tree** — the record of what they were and why they lost is in `design/approved.md`, `design/comp/*.png` screenshots, and the design critique documents. Dead code is not a record.

| Deleted file | Why rejected |
|---|---|
| `ReviewCompositionBriefing` (+ stories) | Pinned/floating verdict bar |
| `ReviewCompositionStage` (+ stories) | Result-burying sidebar |
| `ReviewCompositionFocus` (+ stories) | One-at-a-time examine that loses the whole |

The 3 earliest variants (Verdict Brief / Examination Bench / Reasoning Ledger) were deleted earlier in the design phase and never committed.

### Handoff to AL2–AL5

| WP | Builds | Reads |
|---|---|---|
| AL2 | Extends and wires the 9 canvases with real data, server integration | `design/approved.md` §2 + `components-brief.md` + the canvas `.tsx`/`.stories.tsx` files |
| AL3 | Extends and wires the composition surface | `design/approved.md` §1 + `ReviewCompositionRefined.tsx` |
| AL4 | Inline anchored comments | Own concept + design (AL1 only handles the reference-chip UI) |
| AL5 | Tool-tailored / community canvas overrides | 3-tier resolution model from `design/approved.md` |

The `.stories.tsx` files are the visual acceptance baseline.

**Concept LOCKED** (original: 2026-06-15; revision: 2026-06-18 — added deliverable inventory, deleted superseded compositions, classified remaining components).

**Concept LOCKED** (with §1.5 examination layout and the Subject-grain regrouping handed to `/design`/`/architecture` as named, bounded explorations).
