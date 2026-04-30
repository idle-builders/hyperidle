# Variant C — Anchored-strip

> Slug: `anchored-strip`. Constraint: borrow a proven interaction
> grammar — GitHub PR review-comment block. Embody it cleanly without
> copying chrome. Thesis: a familiar grammar shortens the founder's
> learning curve. The artifact is the centre of gravity; the verdict
> surface is anchored to it (not floating in chrome, not in a card
> footer).

---

## 1. User story

A Founder reading a thread sees a `review` or `questionnaire` message
rendered like a GitHub PR review comment: the artifact is the visual
anchor, with a left **gutter rule** (a 2px line in `--text-lo` that
becomes `--danger` when blocking) that visually claims the artifact
and its action surface as one unit. The actor's reasoning sits below
the artifact as a **quoted note**. The action surface is a **compact
horizontal strip anchored to the artifact's lower edge** — sticky
*within the message* (while the artifact is in view, the strip stays
pinned to the artifact's bottom; once the user scrolls past the
message, the strip detaches and scrolls with the content). The thin
top header is preserved but reduced to a single line:
`< back · {host title} · {sender} @ {time}`.

After commit, the action strip is replaced by a thin
`VERDICT — APPROVED · A. Founder · 2 min ago` strip in the same place.
Original message stays expanded; nothing collapses.

## 2. Component composition

Adds **one** new shape: `AnchoredActionStrip` (Tier 2). The rest
reuses existing components.

| Where | Component | What L11 changes |
|---|---|---|
| Plain messages | `CommentRow` (Tier 2, exists) | Unchanged. |
| Rich messages | `CommentRow` (Tier 2, exists) | Reuses the row primitive. The artifact + action strip render as the message body. |
| Inside the body | `ArtifactView` (Tier 3, exists) | Wrapped by an `.anchor-frame` div that adds the left gutter rule + the bottom-anchored action strip. |
| Action strip | **`AnchoredActionStrip`** (Tier 2, new) | A horizontal strip of buttons anchored to the artifact's bottom. Used for both verdicts and questionnaire answers. |
| Quoted reasoning | A `<blockquote>` styled per the design system | Reasoning sits below the artifact as a quoted note (border-left + indent). |
| Top of pane | **Thin presentation header** (replaces ReviewHeader) | One line: `< back chevron · {host title} · {sender} @ {time}`. ThreadHostBanner is still the surface above the stream; this thin header only exists on the detail-pane top edge. |

**Component-budget justification.** `AnchoredActionStrip` is used in
three contexts: review verdict bar, questionnaire answer bar, and
(future) the per-block-discussion action strip from L26. Three
contexts is well above the 2+ minimum. The existing `ReviewVerdictBar`
shipped in L1 is *retired* — its 5-button shape is absorbed into
`AnchoredActionStrip`'s default mode.

**ReviewHeader.tsx is deleted.** Replaced by a one-line thin header
that carries `back-chevron + host-title + sender@time`.

## 3. Information hierarchy (a rich review message)

```
┌─────────────────────────────────────────────────────────────────┐
│ Avatar │ Maya · Product Manager · 18 min ago · #2 in thread        │
│        │                                                            │
│        │ Approve deploy of v2.4 to staging                          │
│        │                                                            │
│        │ ┌▎ artifact-frame (left gutter rule, --danger when block) │
│        │ │ ┌──────────────────────────────────────────────────────┐ │
│        │ │ │ [ArtifactView · embedded "output" layout]            │ │
│        │ │ │  text_diff · in review · 2h SLA · staging            │ │
│        │ │ │   @@ -42,7 +42,9 @@                                  │ │
│        │ │ │   + cost_cap_cents …                                 │ │
│        │ │ │   …                                                  │ │
│        │ │ └──────────────────────────────────────────────────────┘ │
│        │ │ ┌──── AnchoredActionStrip ──────────────────────────────┐ │
│        │ │ │ Approve · Approve+comments · Request changes · Edit · │ │
│        │ │ │ Reject                                                │ │
│        │ │ └───────────────────────────────────────────────────────┘ │
│        │ └────────────────────────────────────────────────────────── │
│        │                                                            │
│        │ > REASONING                                                │
│        │ > 1. Schema migration adds two columns; backfill verified. │
│        │ > 2. All 142 contract tests pass; suite green.             │
│        │ > 3. Cost cap reduced 8%; budget headroom OK.              │
└─────────────────────────────────────────────────────────────────┘
```

The **left gutter rule** is the visual signature. It's 2px wide,
runs from the top of the artifact to the bottom of the action strip,
and tells the eye "this artifact and this action surface are one
unit." The rule is `--text-lo` by default; it becomes `--danger`
when the message is the blocking one. This is the same rule pattern
GitHub uses on review-comment blocks, but with the design system's
monochrome treatment instead of GitHub's coloured backgrounds.

The **anchor frame** (`<div class="anchor-frame">`) wraps the
ArtifactView and the AnchoredActionStrip. The frame has the gutter
rule on its left edge and a 1px subtle outline on the right/top/bottom.
Internal padding 8px.

The **action strip** sits at the bottom of the artifact frame, inside
the frame, with a 1px `--border-subtle` divider above it.

The **reasoning blockquote** sits below the anchor frame as a
GitHub-style quoted note: `border-left: 2px solid --border-default;
padding-left: 12px; color: --text-mid; font-size: 13px`. The label
`REASONING` is mono caps, then the numbered list.

## 4. States

### 4.1 Empty
Not applicable.

### 4.2 Loading
The anchor frame renders with a `Skeleton` for the artifact body and a
disabled-style `AnchoredActionStrip` showing button labels (so the
verdict shapes are visible during load). Reasoning blockquote shows a
2-line skeleton.

### 4.3 Error
- Artifact failed: ArtifactView's error state renders inside the
  anchor frame. The action strip shows the buttons but with a
  warning above the strip: `Cannot decide without seeing the
  artifact — Retry artifact load`.
- Verdict commit failed: action strip is replaced by a single-line
  alert `Could not commit verdict — Retry`.

### 4.4 Populated (the canonical state)
As shown in §3.

### 4.5 Resolved
The action strip is replaced **in the same place** by a thin verdict
strip:
```
[ ] VERDICT · APPROVED · A. Founder · 2 min ago · "Good to ship."
```
in the same horizontal slot inside the anchor frame, with a
`--ok` `StatusChip` at the left, the verdict label in `--ok` mono
caps, the actor in `--text-mid`, the time + note in `--text-lo`.

The artifact + reasoning stay expanded — the user can re-read what
they decided on. The original review message is unchanged otherwise.

The verdict-payload message that follows in the stream is a normal
`CommentRow` (verdict branch, same as the other variants).

### 4.6 Overflow
- **Long reasoning.** Renders all of it inside the blockquote. We
  don't truncate substance.
- **Long artifact.** Two cases, controlled by ArtifactView's
  internal max-height:
  - When the artifact's natural height fits the viewport: the action
    strip simply sits at its bottom edge inside the anchor frame.
  - When the artifact has internal scroll: the action strip is
    `position: sticky; bottom: 0` *inside the anchor frame*. As the
    user scrolls the artifact, the strip stays pinned to the
    bottom edge of the frame. Once the user scrolls the **whole
    message** off-screen, the sticky behaviour ends naturally (the
    frame leaves the viewport).
- **Multiple rich messages in one thread.** Each renders its own
  anchor frame + action strip. The sticky behaviour is scoped to
  each message individually (via `position: sticky` inside each
  frame, not at the document level).

## 5. Behavior

### 5.1 Hover
- Action strip buttons: DaisyUI default hover.
- Anchor frame: no hover treatment.
- Gutter rule: no hover.

### 5.2 Focus
- Tab order: top-of-thread back chevron → host banner participants →
  per-message: artifact internals → action strip buttons → reasoning
  links (if any). The reasoning blockquote text is not focusable.
- `:focus-visible` ring on every interactive element.

### 5.3 Keyboard
**No keyboard verb shortcuts.** Tab + Enter/Space only.

### 5.4 Click → commit
Click on a verdict button dispatches via L7. The action strip swaps
to a `Saving…` state in `--text-lo` for 80ms minimum, then to the
verdict strip on confirm. The verdict-payload `CommentRow` slides in
below the message. Failure: action strip swaps to the alert from §4.3.

### 5.5 Sticky-within-message
The action strip uses `position: sticky; bottom: 0` inside its anchor
frame. The frame itself has `overflow: hidden; border-radius: var(--r2)`
and a max-height equal to `min(60vh, content)`. When the artifact
exceeds the max-height, the artifact body becomes
`overflow-y: auto` and the strip stays anchored to the frame's bottom
edge. Honors `prefers-reduced-motion` (sticky has no motion to honor;
it's a positioning rule). On mobile, sticky-within-message is preserved
— the frame's max-height drops to `min(50vh, content)` to leave
breathing room for the next message.

### 5.6 Transitions
- Action strip → verdict strip: 80ms `--motion-fast` opacity
  crossfade.
- Verdict-payload row insert: existing `CommentStream` insert motion.
- Honors `prefers-reduced-motion`.

## 6. Mobile adaptation

At 360px:
- The thin top header wraps to two lines if necessary
  (`back · host title` on line 1, `sender · time` on line 2).
- The anchor frame loses its right margin; spans the column.
- The action strip wraps `flex-wrap`. Sticky behaviour is preserved.
- Reasoning blockquote stays.

## 7. Component mapping summary

```
ThinHeader        (replaces ReviewHeader; one line: back · host · sender@time)
ThreadHostBanner  (existing — host context summary)
CommentStream     (existing — list of CommentRow)
  └── CommentRow (rich message variant)
       ├── avatar + sender header
       ├── title (h3)
       ├── AnchorFrame (NEW Tier 2 — wraps the artifact + action strip)
       │    ├── ArtifactView (embedded "output" layout)
       │    └── AnchoredActionStrip (NEW Tier 2)
       │         ├── btn-primary    Approve
       │         ├── btn-ghost      Approve with comments
       │         ├── btn-ghost      Request changes
       │         ├── btn-ghost      Edit
       │         └── btn-danger     Reject
       └── ReasoningBlockquote (styled <blockquote>)

(Resolved state)
  AnchorFrame contents:
    ├── ArtifactView (still expanded)
    └── VerdictStrip (replaces AnchoredActionStrip in the same slot)
```

`AnchoredActionStrip` is one component; in resolved state it
re-renders as a non-interactive `VerdictStrip` (same slot, same
chrome). One slot, two shapes.

`AnchorFrame` is a thin layout wrapper — could arguably be a CSS
class on the rich message body rather than a component. Designer
decision: it's a component because the gutter rule + sticky-strip
positioning is non-trivial layout that the design system should
encapsulate, not require every consumer to re-implement.

## 8. The signature

**One thing makes this variant unmistakably itself:** the **left
gutter rule** that runs the full height of the artifact + action
strip, claiming them as one unit. It's the GitHub PR review-comment
visual grammar transplanted into HyperIdle's monochrome system. The
sticky-within-message action strip means the verdict surface is
*always* visible while the artifact is on screen — no scrolling to
the bottom of a 600-line diff to find the buttons.

## 9. Trade-offs

**What this variant is good at.**
- **Familiar grammar.** Anyone who has used GitHub PR reviews
  recognises the shape immediately. Lower learning curve than a
  novel pattern.
- **Action surface always findable.** Sticky-within-message is the
  best of both worlds — the strip is anchored to the artifact (so
  the user always knows where it is) and it doesn't follow you down
  the thread (so it doesn't fight other rich messages).
- **Hierarchy clear without surface lift.** The gutter rule + the
  thin outline do the same job a card surface does in Variant B,
  but with less chrome.
- **Reasoning placement matches mental model.** Reasoning *as a
  quoted note below the artifact* matches how a code-review
  reasoner thinks: "here's what I reviewed, here's why I'm asking."

**What this variant is bad at.**
- **One new component (`AnchoredActionStrip`).** Same
  component-budget cost as Variant B. Justified by 3-context reuse
  (review, questionnaire, future per-block discussion) but it's
  still a budget hit.
- **Sticky-within-message has known cross-browser edge cases.** On
  iOS Safari, `position: sticky` inside a scroll container can fail
  silently in older versions. The mitigation (a polyfill or a fixed
  bottom-of-frame strip when sticky isn't supported) adds complexity
  the architect must absorb.
- **Reasoning below the artifact.** Some users expect reasoning
  *before* they see the artifact (so they read why first, then look
  at what). This variant inverts that — read the artifact, then
  read the why. Defensible, but a trade-off.
- **The thin top header is still chrome.** Even reduced to one
  line, it's a header — and the founder direction was to push
  toward elimination. This variant keeps it; A and B don't.
- **Gutter rule depth implies rendering chrome the design system
  must keep stable.** If the artifact's max-height changes, the
  rule's height has to track it. Layout fidelity is harder to test
  than card chrome.

## 10. Open questions for the architect

- Sticky-within-message: pure CSS or a `react-intersection-observer`
  fallback for browsers that struggle with nested sticky? Designer
  prefers pure CSS with a graceful fallback to non-sticky if the
  browser doesn't support it (the strip simply lives at the bottom
  edge of the frame; user scrolls to find it). Architect picks the
  feature-detection approach.
- The `AnchorFrame` max-height ceiling — `min(60vh, content)` is the
  designer suggestion. Architect can tune.
- The thin top header — is it a new component or just inline JSX
  inside the existing detail-pane shell? Designer: inline, no new
  component for it.
- The reasoning blockquote style — designer suggests `<blockquote>`
  semantics, `border-left: 2px solid --border-default; padding-left:
  12px; color: --text-mid`. The "REASONING" label is a mono-caps
  span at the top of the blockquote, not a separate row.
