DESIGN-CLASS: novel  ref=none  pattern=none

# AL1 — Review Experience · Design Brief

**Story:** The Review surface — the dual-anchored experience of judging a **Subject** (a task/bet's output, a set of ≥1 Artifacts) against its **Intent**, with the agent's **Rationale** in view, resolved by one **Verdict**. Inputs (LOCKED): `plans/AL1/concept.md`, `plans/AL1/review-information-architecture.md`, `docs/human-interface-layer/review-primitive.md`. Evidence: `AL1-review-experience-dossier.md`, `AL1-voice-of-the-user.md`.

**Why novel (hard rule):** This is a net-new load-bearing primitive surface. No existing component family renders it; the live catalog has no analogous pattern. Both Phase-0a axes = no → `novel` → 3 radically different variants + per-variant critique + `/human-design-review`.

---

## The one job (carried from the IA)
Let a reviewer (human or agent) answer **"can this be approved, or must something happen first?"** — and act on it. Every element earns its place by serving that question.

## The load-bearing design question (handed down from concept §1.5)
**Examine vs. converse, on one screen.** A review must let you *examine* a potentially large Subject (many artifacts, big diffs, the Intent, the Rationale — a lot of surface that wants space and focus) **and** *converse* (anchored comments, replies, the verdict — a channel that wants to stay pinned to what you're looking at). Concept fixed: **one conversation over the Subject** (one Thread) with **many anchored inline comments** inside it. Design resolves: the layout (split-pane / overlay / inline rail), how renderer and thread share the viewport, how navigation across artifacts preserves comment context, and — the deeper question the research forces — **what lands first.**

## The inversion that makes this "beyond what anyone has seen"
Every shipped review tool (GitHub, GitLab, Graphite, Gerrit, Figma, Frame.io, Reviewable) **leads with the diff/artifact.** The IA's flow of understanding (§F) and the research's #1 finding both say the diff is *evidence, not the lead*: for agent work, *"the prompt is the real unit of review, not the diff"*, and *missing reasoning is the #1 problem* (Qodo: 65% cite missing context). The lead is **does the result meet the ask, and what needs me** — orient → triage → judge ask-vs-result → (only then) examine evidence → decide. The three variants below explore three different answers to *what becomes the spine* when the diff is demoted to drill-down.

---

## Phase 0 — Interrogation (settled from the locked inputs; only genuinely-open items listed)

The concept + IA answer most probes. Resolved reads, with evidence:

1. **Who / what decision?** A reviewer (human first-line *or* trusted agent) deciding approve-or-block on a completed **task's** output (default grain) or a **bet** at ship (human reviewer required). Decision = one of 5 binding verdicts over the whole Subject. *(concept Phase 1, hard rule 5)*
2. **Primary state to design for?** **Populated, awaiting-verdict, blocking** — the live case where action is owed. Empty/loading/error/resolved are secondary states each variant must still specify. *(IA §A1 standing)*
3. **Smallest surface that delivers the outcome?** The single **Review surface** (one Subject). The **Review queue** is a real but *secondary* surface (IA §C) — designed lighter, shown once, not the variant focus. The examine-vs-converse resolution is the headline.
4. **New primitive or extension?** New primitive — variants explore the **shape of the whole experience**, not a tweak to an existing component.
5. **What overflows when dense?** A Subject can be 1–N artifacts and a big diff. The Subject navigator/progress and per-artifact reviewed-state absorb scale; the verdict + needs-attention must never scroll out of reach. *(IA §A6, research "per-file tracking is the killer feature")*
6. **Live vs. async?** Async work-product review is the unit here (the live session dial-in already exists and is upstream). The surface is async-first; "reviewer presence" (human/agent) is shown, not live multiplayer. *(dossier §7: live→steer→async continuum; this surface is the async end)*

No Phase-0 question would change a variant *constraint* that the locked concept hasn't already fixed — so per the skill ("few, important questions; the bar is *will the answer change a variant constraint*"), the open layout question is explored **across the three variants** rather than asked. The founder picks at Phase 3 (synthesis) and annotates in `/human-design-review`.

---

## Phase 0b — Reuse inventory (HARD GATE)

Barrel: `packages/design-system/src/index.ts`. Every visual element the Review surface needs → existing component, one-prop extension, or `NEW` (with why-extension-fails).

| Element the review needs | Maps to | Status |
|---|---|---|
| Artifact content: code diff | `CodeRenderer` (`CodePreview`) | **reuse** |
| Artifact content: prose/doc | `TextRenderer` (`TextPreview`) | **reuse** |
| Artifact content: data/metrics/table | `DataRenderer` (`DataPreview`) | **reuse** |
| Artifact content: visual/screenshot | `ImageRenderer` (`ImagePreview`) | **reuse** |
| Artifact content: action/operation, url, fallback | `HtmlRenderer` / `UrlRenderer` / `FallbackRenderer`, `getRenderer(kind)` | **reuse** |
| Cost (token + money) | `ArtifactCostChip` (`ArtifactCostFromSession`) | **reuse** |
| Artifact kind label | `ArtifactKindBadge` | **reuse** |
| Verdict affordance (5 binding) | `RichMessageCard` verdict footer **OR** `Button` set | **reuse** (variants choose card vs. bespoke bar) |
| Standing / kind / status pills | `StatusChip`, `Tag` | **reuse** |
| Conversation comments / replies | `CommentRow`, `Composer`, `ThreadShell` | **reuse** (Bench/Brief embed; Ledger uses inline) |
| Reviewer/author/participants | `Avatar`, `AvatarGroup` (agent-distinct per AQ-012), `LiveDot` | **reuse** |
| Subject host context | `ThreadHostBanner` | **reuse** |
| Per-artifact list rows + reviewed state | `Row` / `ItemList`, `RowDot`, `Checkbox` | **reuse** |
| Empty / error / loading states | `EmptyState`, `ErrorState`, `Skeleton`/`SkeletonList` | **reuse** |
| Key-value orientation facts | `KeyValue` | **reuse** |
| Coverage / review progress | `Progress` | **reuse** |
| Intent-item ↔ fulfilment checklist | **`NEW` (story-local)** — no component pairs a checkable spec item with addressed / NOT-addressed state + a jump-to-evidence affordance. Extension fails: `Checkbox`/`Row` render the row but not the addressed↔gap semantics + anchor link. Composed from `Row`+`RowDot`+`StatusChip`+`Tag` in-story; promoted to a real component only at build. |
| Rationale decision card (decision · discarded alts · confidence · anchor link) | **`NEW` (story-local)** — the structured-why has no analog. `KeyValue`/`CommentRow` can't express decision+alternatives+confidence+anchor as one unit. Composed in-story; the differentiator, so it earns a new shape. |
| Needs-attention panel (derived gaps + risk flags + blocking comments) | **`NEW` (story-local)** — a *view onto* other groups by priority; no existing aggregator. Composed from `StatusChip`+`Row`+`Tag`. |
| Anchored-comment gutter on a renderer | **`NEW` (story-local, Bench variant)** — concept-confirmed not-yet-built; `CommentRow.inlineAnchor` renders the label only. The interactive gutter is a Bench-variant exploration. |

**Net:** the surface is ~80% reuse (every renderer, cost, verdict, thread, status, list, state primitive already exists). The only `NEW` shapes are the three things the research says no tool has — **intent-fulfilment checklist, structured Rationale, needs-attention** — plus the Bench's anchored gutter. These are story-local compositions for design; real-component promotion is a build (`/architecture`/`/write-code`) decision, not a design one.

---

## The three variants (constraint-and-thesis spread)

| | **A — Verdict Brief** | **B — Examination Bench** | **C — Reasoning Ledger** |
|---|---|---|---|
| Constraint | Smallest surface for a *responsible fast read*; reuse budget, near-zero new shapes | Optimise the *power slow-read* across many artifacts; density wins | Lead with the one thing no tool has — structured Rationale × Intent |
| Thesis | The review is a **briefing that reads top-down and ends in a decision**; examine nests inside converse | **Examine and converse side-by-side, persistent**; the gutter joins them; per-artifact tracking | **The *why* is the unit of review**; read reasoning against spec sorted by confidence, spot-check the diff |
| Reference borrowed | (none — minimal scaffold) | IDE / Reviewable / Frame.io workbench | Linear's calm issue-view + Graphite's inbox + the intent-contract |
| Spine / lands first | Needs-attention briefing (triage) | The active artifact's content (examine) | The confidence-sorted decision ledger (why) |
| Examine↔converse | Nested inline, one column, evidence expands in place | Split three-pane, persistent | Ledger-primary, evidence one click away |
| Density | Medium / document | High / three-column | Medium / list |
| Verdict surface | Pinned bottom bar | Right-rail header | Sticky top |
| Reading mode served | Fast read (the 80%) | Slow read (deep) | Reasoning-first read |
| Composition cost | Lowest | Highest | Medium |

Anti-convergence check: spine, layout, density, action surface, and primary reading mode all differ across every pair. A is a *document*, B is a *workbench*, C is a *ledger*. Pass.

**Shared realistic fixture (AQ-009):** one agent-produced Subject — agent **Atlas** completed task *"Handle Stripe refund webhooks"* — 4 artifacts (code diff `billing/refund-webhook.ts`; data/test-metrics; a prose migration note; an action/operation = deploy the webhook endpoint), 4 intent items (1 NOT-addressed = the gap), 5 rationale decisions (1 low-confidence risk = partial-refund handling), one conversation with 2 anchored comments, cost $2.14 · 312k tokens, reviewer = human (Robin) over agent author (Atlas), standing = awaiting verdict, blocking. Same data in all three so the comparison is apples-to-apples.
