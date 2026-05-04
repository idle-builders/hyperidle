# L11 — Synthesis

Phase 4. Pick a base, pull what's worth pulling, write the rejection
list. The picker (per autonomous-mode rules) optimises:

1. Highest critique score.
2. Lowest component-budget cost.
3. Best fit with the founder filter.

Scores: B 70 > A 68 > C 65. Component cost: A 0 < B 1 < C 2.
Founder-filter fit: A and B eliminate the top header; C reduces it
but keeps a thin one.

---

## 1. The base — Variant B (message-card), with two structural fixes

**Why B wins despite costing one new component.**

The founder direction has *two* parts. The literal one — "ThreadActionBar
inline with the messages, not on top — it's part of the thread" — is
about **placement**, and all three variants honour it. The structural
one underneath is about **decision-making time**: the user opens a
review, scans an artifact, and picks a verdict. The screen they see
during that decision is the screen that matters.

B wins on the screen the user actually decides on:
- The card surface lift creates an immediate "this is the
  decision" recognition. On a thread with 30 plain replies, the
  unresolved review is impossible to miss.
- The artifact gets the most vertical space (reasoning collapsed
  by default).
- The action footer is locked in a known position the eye can
  find without scanning.
- The blocking signal (danger left-border) is honest — it doesn't
  need to compete with chrome elsewhere.
- The resolved-state collapse is the right behaviour: once you've
  decided, the artifact gets out of the way.

A's "rich is just more slots" argument is structurally elegant but
loses on hierarchy when threads grow past 5 messages. C's gutter rule
is beautiful but adds two components and keeps a top header.

**The two structural fixes B needs.**

### Fix 1 — Drop the `box-shadow: 0 1px 0 rgba(0,0,0,0.2)`

The card uses surface lift (`--surface-2` against `--surface-1`)
*and* a 1px drop shadow. Pick one. The design system rule (AQ-012)
is "cards use the surface ladder, not shadow." The shadow is
borderline because it's 1px, but it's still chrome the surface ladder
is supposed to replace. **Drop the shadow; keep the surface lift +
1px `--border-default` outline + the optional 2px `--danger`
left-border when blocking.**

### Fix 2 — Reasoning expands inline when ≤1 line

The collapsed-by-default reasoning toggle (`> 3 reasons`) is right
when reasoning is a multi-line numbered list. When reasoning is a
single paragraph or one bullet, the toggle is more chrome than
content. **Render reasoning inline (no toggle) when its rendered
height is ≤ 1 line at the card's content width; render the toggle
otherwise.** This is a runtime decision; the architect picks the
exact predicate (e.g. "≤ 80 character single-line string =>
inline").

---

## 2. Pulled-in elements

### From A — `richHeader` slot model on `CommentRow` for **multiple-rich-message threads**

When a thread has multiple unresolved rich messages stacked, B's
cards stack visually. That's fine for two cards; for three or more,
the visual chrome gets heavy. The compromise:

- **First unresolved rich message in the thread renders as a
  `RichMessageCard` (B's shape).** This is the user's primary
  decision point — earns the surface lift.
- **Subsequent unresolved rich messages render as A's
  rich-row-with-slots inside `CommentRow`.** They get the same
  inline action surface (flex row of buttons under the artifact)
  but no card chrome. They're still actionable, but they don't
  compete with the primary one for attention.

This pull-in introduces a **promotion rule**: at most one rich
message in a thread renders as a card; the rest render as rich rows.
Practically, this is the "blocking" message (per the L1 concept's
derived `blocking` field). If multiple rich messages are blocking,
the oldest unresolved one gets the card; the others get the row
treatment. The rule is **deterministic**: derived from
`(blocking desc, createdAt asc)`.

The architect picks the implementation. The visual contract is: one
card per thread max; the rest are rich rows.

### From C — sticky-within-message action footer for long artifacts

B's card max-height + internal scroll behaviour leaves the action
footer one scroll-back away when the artifact is taller than the
card cap. C's `position: sticky; bottom: 0` inside the anchor frame
keeps the action surface always visible while the artifact is in
view. **Pull the sticky-within-message behaviour into B's card
footer.**

Concretely: the card's `.card__actions` footer becomes
`position: sticky; bottom: 0` inside the card. The card itself has
an internal `max-height: min(70vh, content)`. When the artifact
fills the card, the footer stays anchored to the visible bottom edge
of the card; when the user scrolls the whole card past, the
sticky behaviour ends naturally.

This costs B one piece of new behaviour (the sticky-within-message
positioning) but solves its biggest weakness (long-artifact action
surface findability).

### Not pulled — C's left gutter rule

The gutter rule is a beautiful unifier in C, but B's card already
unifies the artifact + footer through surface lift and the divider
rule. Adding the gutter rule on top would be over-signalling. The
danger left-border on a blocking card already plays the gutter
rule's role.

### Not pulled — A's "always render reasoning inline"

Already handled by Fix 2 (inline when ≤ 1 line). The general case
stays collapsed.

---

## 3. The rejection list (load-bearing for `/architecture` and `/write-code`)

These are explicitly out of scope. Re-litigation is a defect.

### From the design space

1. **Top header with verb buttons.** No top toolbar with action
   buttons. `ReviewHeader.tsx:153-178` is deleted; the 7 keyboard
   shortcuts are gone.
2. **Thin top presentation header.** Even reduced to one line, no
   top header on the detail pane. `ThreadHostBanner` carries host
   context + back-chevron. (C's thin header is rejected.)
3. **Keyboard verb shortcuts.** No `A` for approve, no `R` for
   reject, no `X`, no `S`, no `C`, no `I`, no `E`. Buttons are
   tab-and-Enter only.
4. **Emoji reactions.** No `:thumbsup:` / `:eyes:` / any reaction
   shape. Pre-formatted actions only.
5. **Emojis in code or comments.** None. (TRACK-L scope rule.)
6. **Card with drop shadow.** No `box-shadow` on the card. Surface
   lift only (Fix 1 above).
7. **Reasoning ALWAYS collapsed.** Fix 2 above — inline when
   short.
8. **Reasoning ALWAYS expanded.** Same.
9. **A's "no surface differentiation at all."** The first
   unresolved rich message gets card chrome — that's the
   founder-direction-and-hierarchy compromise.
10. **C's left gutter rule.** Over-signalling on top of the card
    surface.
11. **C's `AnchorFrame` and `AnchoredActionStrip` as separate
    components.** The card *is* the anchor frame; the footer *is*
    the action strip. One component (`RichMessageCard`), not two.
12. **Optimistic-UI bragging.** No "Approving..." countdown
    animation, no checkmark celebration on commit. The footer
    swaps to a `Saving…` strip in `--text-lo` for a minimum 80ms,
    then to the `RESOLVED` strip on confirm. Failure: alert with
    `Retry`. (TRACK-L scope rule.)
13. **Per-message overflow popover.** No `…` menu inside the
    rich message that hides the secondary verdicts. All five
    binding verdicts (`approve`, `approve-with-comments`,
    `request-changes`, `edit`, `reject`) render visibly in the
    footer. (`More` overflow is ReviewHeader.tsx's pattern that we
    are deleting.)
14. **Composer-level verdict shortcuts.** No "type `/approve` to
    approve" shortcut. The Composer is for plain replies; verdicts
    are buttons.
15. **A separate `AnchorFrame` component.** Already covered in #11
    — explicit because it was C's idea and an architect might be
    tempted to reintroduce it.

### From the L1 + L3 concept (already locked, restated for safety)

16. New rich message types beyond `review` / `questionnaire` /
    `verdict` / `plain`. Closed enum.
17. New ArtifactView shapes beyond the five (`text_diff` /
    `content_preview` / `visual_comparison` / `action_summary` /
    `data_metrics`). Closed enum.
18. The `ReviewVerdictBar` Tier 2 component as a thread-level
    surface. It's deleted; its 5-button shape is absorbed into
    `RichMessageCard.actions`.

---

## 4. Why this synthesis specifically

The synthesis takes B's strongest signal (the user finds the decision
instantly), pulls A's elegance (no card chrome on secondary rich
messages — just the row primitive with slots), and pulls C's
robustness (sticky-within-message for long artifacts). It rejects:

- B's drop shadow (anti-slop fix).
- B's always-collapsed reasoning (replaced by predicate-based
  collapse).
- C's two-component anchor frame (folded into `RichMessageCard`).
- C's top header (eliminated).
- A's flat hierarchy on multi-message threads (B's card lifts the
  primary one).

The result is one new Tier 2 component (`RichMessageCard`) with
clear behaviour for the primary unresolved rich message, plus a
`CommentRow` rich-row variant for secondary unresolved rich
messages. Two shapes — one for the centre of attention, one for the
"yes also this" — sharing the same action grammar (5 buttons under
the artifact) and the same dispatch path (L7 response-as-event).

Phase 5 writes this up as the locked design contract.
