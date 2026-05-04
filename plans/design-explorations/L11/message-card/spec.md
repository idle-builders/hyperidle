# Variant B — Message-card

> Slug: `message-card`. Constraint: optimise for the most common
> power-user task — scan the artifact, decide. Cut everything else
> from the primary view; push it behind a click. Thesis: density and
> speed beat completeness. Show what the user actually does 80% of the
> time at maximum information density. Distinct surface treatment for
> rich messages tells the eye "this is something you can act on."

---

## 1. User story

A Founder opens a thread containing a `review` or `questionnaire`
message. The rich message is rendered as a **bordered card** inset
into the stream — visually distinct from plain messages, with the
artifact at the visual centre, a one-line metadata strip above, and
the action surface locked to the card's footer separated by a divider.
The reasoning is collapsed behind a click ("3 reasons" → expand).
After a verdict commits, the card collapses to a one-line summary the
user can re-expand if they want to see what they decided on. The
verdict appears as the next `verdict`-payload message in the stream
(a normal `CommentRow`, not a card).

## 2. Component composition

Adds **one** new shape: `RichMessageCard` (Tier 2 sibling of `CommentRow`).
Reuses everything else from the existing budget.

| Where | Component | What L11 changes |
|---|---|---|
| Plain messages | `CommentRow` (Tier 2, exists) | Unchanged. |
| Rich messages | **`RichMessageCard`** (Tier 2, new) | Bordered card with metadata strip + title + collapsed reasoning + ArtifactView + footer-locked actions. |
| Inside `RichMessageCard` body | `ArtifactView` (Tier 3, exists) | Embedded "output" layout. |
| Inside `RichMessageCard` actions | DaisyUI `<button>` primitives | 5 binding verdicts / N answer options. |
| Resolved state | Same `RichMessageCard` collapsed mode | Single-line summary with re-expand. |
| Top of pane | `ThreadHostBanner` (Tier 3, exists) | Carries host context + a back-chevron at its left edge. ReviewHeader is deleted. |

**Component-budget justification.** `RichMessageCard` is used in two
contexts: review messages and questionnaire messages — both rich
shapes that share the same internal hierarchy (metadata strip, title,
collapsible details, body, footer-locked actions). It earns its slot
as a Tier 2 block. `CommentRow` is *not* extended because the row
primitive's slot model (avatar + sender + text) does not bend to the
internal complexity rich messages need without becoming a worse
abstraction. Two components is cleaner than one component with three
mode flags.

**ReviewHeader.tsx is deleted.** No top header. Back-chevron lives in
the `ThreadHostBanner`.

## 3. Information hierarchy (a rich message card)

```
1. Card surface lift             --surface-2 against stream's --surface-1
                                 --r2 corners, --border-default,
                                 left-border 2px --danger when blocking
2. Metadata strip (one line)     [REVIEW] Maya · Product Manager · 18m · #2
3. Title                         Approve deploy of v2.4 to staging
4. Reasoning (collapsed)         > 3 reasons    ← click to expand
5. ArtifactView (always open)    [embedded "output" layout]
6. Divider rule                  1px --border-subtle
7. Footer actions                [Approve] [Approve with comments] [Request changes] [Edit] [Reject]
```

The card aligns its left edge with the `CommentRow` body column (28px
+ 8px gap from the stream's left edge). Its right edge sits at the
stream's content right edge minus 16px. Internal padding =
`var(--density-card-pad)` (12px default).

The metadata strip is one line, mono caps for labels, terse: a single
`REVIEW` `Tag`, the sender, the role, the relative time, the
position-in-thread `#N`. No avatar inside the card — the metadata
strip is the message's identity. This frees the artifact to use the
full card width.

## 4. States

### 4.1 Empty
Not applicable.

### 4.2 Loading
Card renders the metadata strip and title (server-side known) plus a
`Skeleton` for the reasoning toggle, the ArtifactView, and the action
row. The action buttons render disabled-style ghost buttons with
their labels — so the user knows what verdict shapes are coming.

### 4.3 Error
Two failure modes:
- ArtifactView failed to fetch — the artifact slot shows the
  ArtifactView error state. The action footer renders a warning
  strip above the buttons: `Cannot decide without seeing the
  artifact.` with a `Retry artifact load` link.
- Verdict commit failed — the action footer is replaced by an
  inline `<div role="alert">` reading `Could not commit — Retry`.

### 4.4 Populated (the canonical state)
As shown in §3.

### 4.5 Resolved
The card collapses to a single-line summary:
```
[VERDICT] APPROVED · Approve deploy of v2.4 to staging · A. Founder · 2 min ago         ▸ Re-expand
```
in `--text-mid` with the verdict label coloured per outcome
(`--ok` for approved, `--warn` for changes-requested, `--danger` for
rejected). The chevron at the right is interactive; clicking it
re-expands the card to show what was decided on (artifact + reasoning
+ action footer replaced by `RESOLVED` strip).

The verdict-payload message that follows in the stream is a normal
`CommentRow` (verdict branch).

### 4.6 Overflow
- **Long reasoning.** Collapsed by default. The toggle reads `> N
  reasons` where N is the count. On expand, the numbered list renders
  inline above the artifact. The toggle becomes `v Hide reasoning`.
- **Long artifact.** ArtifactView's internal overflow rules apply
  (long diff scrolls horizontally; long content_preview gets
  `max-h-[480px] overflow-y-auto`). The action footer is **always
  visible at the card's bottom edge** — even when the artifact has
  internal scroll, the footer is at the natural bottom of the card,
  not sticky-pinned. (This is intentional. The artifact's max-height
  caps how tall the card can grow; once the cap is hit, the artifact
  becomes scrollable and the footer is one scroll-back away.)
- **Multiple rich messages in one thread.** Each renders its own
  card. Cards stack with the stream's natural row gap. Two
  unresolved cards = two action footers; the user picks which to
  resolve.

## 5. Behavior

### 5.1 Hover
- Card body: no hover treatment (it's not a list item).
- Reasoning toggle: `--surface-3` background tint on hover; chevron
  rotates 90° on expand state change (150ms `--motion-medium`).
- Action buttons: DaisyUI default hover (background tint shift on
  ghost; saturation lift on primary).
- Resolved-state re-expand chevron: same hover as reasoning toggle.

### 5.2 Focus
- Tab order: metadata strip (read-only, no stop) → reasoning toggle
  → artifact internals → action buttons (left-to-right). When the
  card is in resolved mode, the re-expand chevron is the only focus
  stop.
- `:focus-visible` ring on every interactive element using
  `outline: 2px solid var(--primary); outline-offset: 2px`.

### 5.3 Keyboard
**No keyboard verb shortcuts.** Tab + Enter/Space only on the
buttons. The reasoning toggle responds to Enter / Space.

### 5.4 Click → commit
Click on a verdict button (or questionnaire answer) dispatches via
L7. The footer replaces with a `Saving…` strip in `--text-lo` until
the server confirms. On confirm, the card animates the collapse
(150ms `--motion-medium` height fade); the verdict-payload
`CommentRow` slides in below the card from the natural append
position. On error, the footer re-renders with the alert from §4.3.

### 5.5 Reasoning toggle
Click the `> 3 reasons` row → reasoning expands inline (a numbered
`<ol>` between the title and the artifact). The toggle text becomes
`v Hide reasoning`. Click again → collapses. State is per-message; not
persisted across reloads.

### 5.6 Transitions
- Reasoning expand/collapse: 150ms `--motion-medium` height +
  opacity. Honors `prefers-reduced-motion`.
- Verdict commit: footer crossfade 80ms → card collapse 150ms.
- Re-expand: 150ms reverse.

## 6. Mobile adaptation

At 360px width:
- Card loses its right margin; spans the column with 8px gutters.
- Card retains its left border (the blocking signal).
- Metadata strip wraps to two lines if it overflows
  (sender+role on line 1, time+#N on line 2).
- Action footer wraps `flex-wrap`. Dominant verdict stays first.
- ArtifactView's `visual_comparison` stacks panes vertically (existing
  behaviour).

Conversations is the only place this card appears. No special mobile
shape beyond the wrap rules above.

## 7. Component mapping summary

```
RichMessageCard (NEW Tier 2 block)
├── .card surface (--surface-2, --r2, --border-default,
│                  optional --danger left-border when blocking)
├── .card__strip      (REVIEW tag + sender + role + time + #N)
├── .card__title      (h3, --density-text-h2 weight 600)
├── .card__reasoning-toggle  (chevron + "N reasons" / "Hide reasoning")
├── .card__reasoning  (ol, conditional)
├── .card__body       <ArtifactView ... />
├── .card__divider    (1px --border-subtle)
└── .card__actions    DaisyUI buttons row
        ├── btn-primary  Approve
        ├── btn-ghost    Approve with comments
        ├── btn-ghost    Request changes
        ├── btn-ghost    Edit
        └── btn-danger   Reject
```

When resolved, the card body is replaced entirely by the resolved-strip
mode (one line summary with re-expand chevron). Re-expand restores the
full body with the action footer replaced by a `RESOLVED · APPROVED ·
A. Founder · 2 min ago` mono strip.

## 8. The signature

**One thing makes this variant unmistakably itself:** rich messages
get their own surface. They lift off the stream. The card chrome
(`--surface-2`, `--r2`, optional danger left-border) tells the user
"this is the decision; everything else is conversation around it."
Reasoning is collapsed by default — the artifact is the centre of the
screen. The action footer is locked to the card's bottom edge,
divided from the artifact by a rule, so the user's eye knows where to
land after they finish reading.

## 9. Trade-offs

**What this variant is good at.**
- **Clear hierarchy.** The card surface immediately signals "this is
  actionable." Plain messages don't compete for attention.
- **Density on the artifact.** Reasoning collapsed → more vertical
  space for the artifact. Most users skim reasoning anyway.
- **Action surface findable.** The footer is always at the card's
  bottom edge, separated by a rule. Even when the artifact has
  internal scroll, the user knows where to look.
- **Resolved state is honest.** Collapsing the card to a one-line
  summary is the right behaviour — you don't need the full artifact
  visible after you've already decided. Re-expand is one click away.
- **Multiple-rich-message threads work cleanly.** Each card is a
  self-contained unit; two unresolved cards stack naturally.

**What this variant is bad at.**
- **One new component.** Adds a Tier 2 block to a budget that L1+L2
  already strained. The design-critique gate must accept the
  justification (used in 2+ contexts: review and questionnaire).
- **Surface treatment risk.** Card chrome adds visual weight. On a
  thread with 3 cards stacked, the eye has to parse where one ends
  and the next begins. Mitigated by the inter-card stream gap; still
  more chrome than Variant A.
- **Reasoning hidden by default.** A user who relies on reasoning to
  decide must always click. For high-trust review messages this is
  fine; for novel ones the click is friction.
- **Card-vs-row visual ambiguity.** Plain messages are rows; rich
  messages are cards. The contrast works *because* it's strong, but
  if a future message shape can't decide which it is, the system has
  no clear answer.

## 10. Open questions for the architect

- The collapsed-by-default reasoning toggle — when should it default to
  expanded? Designer suggests: never. The footer link
  `Why this decision?` is for cases where reasoning is genuinely
  long-form (a paragraph, not a bullet list).
- The card's blocking left-border — is the 2px `--danger` rule the
  only signal, or do we also tint the card's left edge background?
  Designer: just the rule; tinting the surface would over-signal.
- The resolved-collapse one-line summary — does it include the verdict
  note (`— Good to ship`)? Designer: yes if it fits on one line at
  desktop width; truncate with ellipsis at narrower widths.
- The verdict-message that appears below — same as Variant A. Normal
  `CommentRow` with the verdict branch. No card.
