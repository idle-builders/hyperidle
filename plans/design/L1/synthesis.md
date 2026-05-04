# L1 Thread primitive — Synthesis recommendation

Phase 4 of `/design`. The comparison (`./comparison.md`) scored Variant B at 78/90, A at 60/90, C at 64/90. This file recommends the synthesis the architect should plan against.

> **Validation of the working hypothesis.** The proposed synthesis (B base + A's collapse for chat-shape + C's canvas-promotion for heavy artifacts; reject A's verdict-in-stream, C's canvas-by-default, and any thread `kind` discriminant) is **validated with one calibration**: the canvas-promotion pull from C is bounded as a *user-triggered expansion* of the embedded artifact slot — not an automatic mode switch — and the seam-toolbar idea is *not* pulled in. The verdict surface stays B's sticky bar in both states. Rationale below in the Pull from C section.

---

## Chosen base — Variant B (linear-shaped)

The base is the issue-shape `ThreadShell` from Variant B: `ThreadHostBanner` + `ThreadHead` + sticky `ReviewVerdictBar` (or `QuestionnaireAnswerBar`) + `CommentStream` + `Composer`.

Rationale, against the concept (HIL §4.5):

- The load-bearing case for the Conversations view is the **blocking review** — an agent is paused waiting on a verdict. The hierarchy must put the substance first, the verdict next-to-hand, and the discussion in support. B's screenshot demonstrates this in seven distinct landing points without crowding.
- The verdict is a *message* per §4.5, not hidden state. B's `ReviewVerdictBar` emits verdict-payload messages and renders resolved verdicts as `CommentRow`s with `StatusChip` — the audit trail lives in the message sequence, exactly as the concept requires.
- B's `ThreadHostBanner` (host attachment + blocking + pinned + resolved) reads off the messages, not off a `kind` column. This is the contract the concept's "reframe note" demands.
- Component coherence is highest. `ThreadHostBanner`, `CommentRow`, and `Composer` are explicitly designed to be reused 1:1 by the chat-shape (collapsed) and heavy-artifact (promoted) states described below — one primitive renders both shapes.

---

## Pull-in 1: from Variant A (slack-shaped) — collapse the HEAD when no substance message exists

**Axis borrowed:** composition + copy register, applied conditionally.

**The pull.** When a thread contains **no unresolved review or questionnaire message** *and* the first message is a plain message, `ThreadHead` does not render and the comment stream takes the full vertical space. The thread renders as A's pure single-column flow: plain messages flow chronologically, sender-grouping rule applies, composer pinned at the floor. `ThreadHostBanner` stays, because the host attachment and pinning are independent of message shape.

**Why it works.** §4.5's reframe is unambiguous: "review thread" / "chat thread" are shorthand for "the thread contains an unresolved review or questionnaire message" / "it does not". The same primitive must render both because the same thread can move between them as messages are appended. B's structural weakness is the chat-shape tax (acknowledged in B's own trade-offs); A's structural strength is its native fit for chat-shape. Pulling A's stream as the *no-substance-message* render path is exactly the "one primitive, two shapes" the concept demands. The decision reads off the messages — never off a `kind` column.

**The transition is data-driven, not modal.** When a chat-shape thread later receives a review or questionnaire message, the thread flips to issue-shape on the next render: `ThreadHead` mounts with the new substance message, the previous plain messages reflow into the `CommentStream`, sticky `VerdictBar` engages. Reverse is impossible by contract — verdicts append, they don't disappear — but if the substance message is somehow retracted, the head collapses. Layout change is announced via `aria-live="polite"`, motion respects `prefers-reduced-motion`. Borrowed wholesale from C's chat-shape transition contract, but applied to the B base instead of the C canvas.

**Concretely:** B's spec explicitly opts the wrong way ("This is the variant's stance: the head **does not collapse**. A plain HEAD is still a HEAD"). The synthesis overrides B on this single point. Everything else in B's HEAD treatment stays.

---

## Pull-in 2: from Variant C (slate-shaped) — promote the artifact to canvas+dock on demand

**Axis borrowed:** action surface (specifically: progressive disclosure on heavy artifacts).

**The pull, bounded.** When `ThreadHead`'s embedded `ArtifactView` slot is filled by a heavy-artifact shape (multi-file `text_diff`, full-page `content_preview`, or `visual_comparison` with multiple variants), the `ArtifactView` slot exposes an **`Open full artifact`** affordance (this affordance is L11's contract — see L11 implementation; L1 only allocates the slot). Clicking it transitions the thread into a canvas+dock mode: the artifact promotes to a left canvas (~68%), the existing `CommentStream` + `Composer` reflow into a right dock (~32%). The sticky `ReviewVerdictBar` remains the verdict surface — *not* slate's CanvasEdgeToolbar — and pins to the top of the dock instead of the page. Closing the canvas (close button on the canvas top-right or `Esc`) returns to the standard issue-shape view; the artifact preview re-collapses into the `ThreadHead`.

**Why this bounding.** Three reasons:

1. **The verdict surface stays the sticky bar.** Slate's seam-toolbar (`CanvasEdgeToolbar`) is rejected — see Reject 1 below. Reusing B's `ReviewVerdictBar` as the verdict surface in both views means one verdict component, not two. The verdict rendering contract does not branch on view mode.
2. **Promotion is *user-triggered*, not automatic.** Auto-promotion requires the renderer to decide, on every artifact, whether to render canvas-default vs. inline-default. That decision is exactly the cost C pays on every thread. By making the canvas a *promoted state of the inline preview*, the cost is paid only when the founder asks for it. ~90% of reviews will resolve from the inline preview without ever promoting; the 10% that need the canvas get it instantly.
3. **The promotion contract belongs to L11, not L1.** L11 owns the artifact embedding contract — including the "complex artifacts promote to a companion pane" behavior the concept already describes (§4.1, "Inline vs. companion pane"). L1 exposes the slot and the surrounding shell affordances (close button, dock reflow, sticky bar reattach); L11 fills the slot and decides when to surface the `Open full artifact` link. This is exactly where the layer boundary already sits.

**Mobile.** The promotion path on mobile is C's two-tab segmented control (`Artifact` | `Discussion (N)`), already specified in C's spec. The synthesis adopts this pattern — but only when promotion is active, not as the default thread shape on mobile. Default mobile thread = single column (B's mobile adaptation, with HEAD or no-HEAD per Pull-in 1).

---

## Rejected ideas (locked here so `/architecture` does not re-litigate)

### Reject 1: Variant A's claim that "density beats separation" for review threads
A's thesis puts the verdict inline at the bottom of the rich message and explicitly does not pin it. A's own screenshot disproves the thesis: the verdict is buried under 35 collapsed diff lines, two replies, an overflow row, and a resolved-state demo before the composer. On a long review thread, the founder must scroll *up* from the composer to act — exactly the friction the sticky bar exists to remove. The "UNRESOLVED REVIEW · acting required ↑" rule above the composer is an admission, not a fix. **The verdict in the synthesis is always the sticky bar, never inline.**

### Reject 2: Variant C's "canvas + dock" as the default render
C requires the renderer to decide on every thread whether to render canvas-default or collapse-to-single-column. ~40% of threads collapse, paying the full decision cost for nothing. C's spec admits the variant requires ≥1100px viewport; the auto-density system targets ≤1024px as the comfortable floor. **The default render is always the issue-shape (HEAD or no-HEAD); the canvas is a promoted, user-triggered state of the artifact slot.**

### Reject 3: Variant C's `CanvasEdgeToolbar` — the seam-toolbar idea
Slate's signature ("verdict on the seam between artifact and discussion") is genuinely original, but it forks the verdict surface: there are now two places to render the verdict (sticky bar in default mode, seam toolbar in canvas mode), and they have to stay in sync as messages append. The cost is two verdict components, two focus orders, two keyboard contracts, two mobile adaptations. **The synthesis pulls in the canvas geometry but reuses B's `ReviewVerdictBar` in both modes.** The verdict surface does not branch on layout mode.

### Reject 4: Any thread `kind` discriminant
The shape decision (HEAD or no-HEAD; inline or promoted artifact) reads off the messages — specifically, whether an unresolved review/questionnaire message exists, and whether the embedded artifact is heavy. The `Thread` row carries no `kind` column. This is locked by §4.5 and re-locked here.

### Reject 5: All five entries on the founder filter
No keyboard verb shortcuts, no optimistic-UI bragging, no emoji reactions, no customizable dashboards/view kits, no drag-reorder of threads. None of these appear in any variant; the synthesis ratifies their exclusion explicitly.

---

## Three open questions for the architect

1. **Render contract for the head-collapse decision.** What's the boolean predicate, expressed in TypeScript, that decides whether `ThreadHead` mounts? Provisional spec: `messages.some(m => (m.type === 'review' || m.type === 'questionnaire') && !m.resolvedAt)`. Edge cases the architect must resolve: (a) does a *resolved* review still mount the HEAD (read-only), or does the thread re-collapse to chat-shape once verdict lands? Concept implies HEAD stays for audit visibility, but this needs a confirmed contract. (b) When a thread has multiple unresolved review messages — possible if a re-open is allowed per §4.5.5 — which one is HEAD? Provisional answer: the most recent unresolved.

2. **Data shape and ordering of the inline `ArtifactView` slot.** L1 exposes the slot inside `ThreadHead`, but the architect must define: (a) the prop contract for the slot (does L1 pass the artifact `ref` and let L11 fetch, or does L1 fetch and pass the rendered preview?); (b) where the `Open full artifact` affordance is rendered (L1's responsibility for the close button and dock reflow on promotion, L11's for the in-slot link); (c) the focus return contract on canvas close (return to the `ThreadHead` artifact slot? to the `ReviewVerdictBar`?). The boundary needs a one-line contract per side.

3. **Mobile fallback when canvas is requested.** On a phone, `Open full artifact` triggers the two-tab segmented control (Artifact | Discussion). But: (a) does the sticky `ReviewVerdictBar` ride into the Artifact tab as the bottom action bar, or is the verdict only available from the Discussion tab? Provisional: bottom action bar on the Artifact tab, with binding verdicts horizontally laid out (C's mobile spec). (b) Does `Open full artifact` exist at all on mobile, or does the artifact always promote on mobile because there's no inline-vs-companion distinction at phone widths? The Submenu/Rail/IconRail constraints don't apply on mobile, but the artifact preview height does — needs an architect call.

---

## Predicted `/design-critique` score on the synthesis

The synthesis is B's strengths × patched on B's two named weaknesses (chat-shape tax, heavy-artifact ceiling), with C's rejected costs avoided and A's rejected weakness avoided.

Scoring against the 9-dim rubric:

| Dim | B baseline | Synthesis delta | Predicted |
|---|---:|---|---:|
| Hierarchy | 9 | unchanged for review case; better for chat-shape (no head-tax) | **9** |
| Spacing & density | 8 | unchanged | **8** |
| Typography | 9 | unchanged (label register, mono caps, tabular-nums) | **9** |
| Color | 9 | unchanged (one accent, danger only on Reject) | **9** |
| Component coherence | 9 | +0 reusable (HEAD-collapse path uses existing `Composer`+`CommentStream`); −0 net from canvas mode (ArtifactView already exists, dock = reflow not new component) | **9** |
| States | 9 | +1 — explicit head-mounts/collapses + canvas-promoted state defined; richer state coverage than B alone | **9** (capped) |
| Accessibility | 8 | +0 — `aria-live` on shape transition specified; focus return on canvas close needs architect contract (open question 2c) | **8** |
| Anti-slop | 9 | unchanged | **9** |
| Premium polish | 8 | +0 — same details (tabular numerals, letter-spacing on caps, motion tokens, focus rings) | **8** |
| **Total** | **78** | | **78 / 90** |

Predicted score is the same as B's baseline — the synthesis isn't more polished than B; it's *equally* polished while covering the two cases B couldn't cover alone. The score does not rise because the rubric measures rendered visual quality, not architectural completeness, and B's rendered quality is already the ceiling. The synthesis's win is *coverage* (one primitive, two shapes, one promotion path) rather than higher polish on the primary case.

If anything pushes the score up to 8.5+ across the board, it is unblocking open question 2c (focus return on canvas close) and codifying the head-collapse predicate in the type contract — both architect work, not designer work.
