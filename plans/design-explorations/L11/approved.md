# L11 — Render rich messages inline; remove the ThreadActionBar abstraction
## Approved design

**Status.** Locked. Input contract for `/architecture L11`. The
architect does NOT re-decide visual hierarchy, component vocabulary,
or interaction grammar — they decide types, schemas, endpoints, and
ordered tasks. The adversary uses §11 (rejection list) to refuse
re-litigation.

**Sources.** Story spec: `docs/work-packages/TRACK-L.md` § L11 (lines
375–405). Concept: `docs/concept/HUMAN_INTERFACE_LAYER.md` §4.5
(Thread primitive). L1 approved design:
`docs/design-explorations/L1/approved.md`. Variants: `thread-flow/`,
`message-card/`, `anchored-strip/`. Comparison + scores:
`comparison.md` (B 70 / A 68 / C 65). Synthesis:
`synthesis.md`.

---

## 1. Chosen base + pulls

**Base — Variant B (`message-card`),** with two structural fixes:
- **Fix 1.** Drop the 1px box-shadow on the card; surface lift +
  `--border-default` outline + optional `--danger` left-border are
  enough.
- **Fix 2.** Reasoning collapsed-by-default applies only when
  reasoning content exceeds 1 rendered line at the card width;
  short reasoning renders inline without a toggle.

**Pull-in 1 (from A — Variant `thread-flow`).**
**Promotion rule.** At most one rich message in a thread renders as
a `RichMessageCard`. Subsequent unresolved rich messages render as
A's rich-row variant of `CommentRow` (`richHeader` + `richBody` +
`richActions` slots inside the row body column). Selection rule:
**oldest unresolved blocking message becomes the card; everything
else is a row.** The rule is deterministic — a derived projection
over the thread's messages, no flag stored.

**Pull-in 2 (from C — Variant `anchored-strip`).**
**Sticky-within-message footer.** The `RichMessageCard.actions`
footer uses `position: sticky; bottom: 0` inside the card. The card
has `max-height: min(70vh, content)`; when the artifact fills the
card, the artifact body becomes `overflow-y: auto` and the footer
stays anchored to the card's visible bottom edge. When the user
scrolls the whole card past the viewport, sticky behaviour ends
naturally.

---

## 2. Components

### 2.1 What's added

**`RichMessageCard`** — Tier 2 (new).

- Rendered for the **promoted** rich message (per the promotion rule
  above).
- Supports both `review` and `questionnaire` message types via a
  `kind` discriminant prop.
- Internal hierarchy (top → bottom):
  1. **Metadata strip** (one line): `Tag(REVIEW|QUESTION)` ·
     sender · role · `#N in thread` · time. Tag tinted
     `color-mix(in oklab, var(--primary) 18%, transparent)`.
  2. **Title** (`<h3>`, 16px weight 600, `--text-hi`).
  3. **Reasoning toggle** (visible only when reasoning content >
     1 rendered line) — `> N reasons` chip in `--surface-3`,
     hover `--surface-4`, chevron rotates 90° on expand. When
     reasoning is short, renders inline above the artifact with no
     toggle.
  4. **Reasoning** (`<ol>`, conditional based on toggle / short).
     Padded `0 12px 8px 36px`, font-size 13px, `--text-mid`.
  5. **Body** — `<ArtifactView>` (the embedded "output" layout).
     The card's body has `padding: 0 12px 12px 12px`; the artifact
     keeps its own internal `--surface-1` background, `--r2`
     corners, `--border-subtle` outline.
  6. **Divider** — 1px `--border-subtle` rule.
  7. **Actions footer** — sticky-within-card, `padding: 10px 12px`,
     `--surface-2` background, `flex flex-wrap gap-8px`. Buttons:
     for `review`, the 5 binding verdicts as `btn-primary` /
     `btn-ghost` (4×) / `btn-danger`; for `questionnaire`, one
     `btn-primary` (the recommended option) and `btn-ghost` for
     the rest.

- **Surface.** `--surface-2` background. `--r2` corners. `1px solid
  --border-default` border. **Optional 2px `--danger` left-border
  when the message is the blocking one.** **No drop shadow.**
- **Indent.** `margin-left: 36px` (avatar 28px + gap 8px) to align
  with the `CommentRow` body column.

### 2.2 What's extended

**`CommentRow`** — Tier 2 (existing). Add three optional slots used
by the **rich-row** variant for non-promoted unresolved rich
messages:
- `richHeader` — title + meta-strip + (always-inline) reasoning.
- `richBody` — `<ArtifactView>` mounted inline (no card chrome).
- `richActions` — flex-wrap row of buttons, same DaisyUI variants
  as the card's footer.

The rich-row variant uses the **same row chrome** as plain rows;
distinction comes only from the slot content.

### 2.3 What's deleted

- **`packages/web/src/shell/ReviewHeader.tsx` (entire file).**
- The 7-key global `keydown` listener it ships.
- Its 6-action overflow `More` menu.
- The thread-level `ReviewVerdictBar` Tier 2 abstraction (its
  5-button shape is absorbed into `RichMessageCard.actions` and
  the rich-row's `richActions` slot).

### 2.4 Component-budget accounting

- **Adds.** `RichMessageCard` (Tier 2, new). Used in 2 contexts
  (review + questionnaire) — clears the 2+ minimum.
- **Deletes.** `ReviewHeader` (Tier 3) + `ReviewVerdictBar` (Tier 2).
- **Net.** −1 net component. Budget improves.

---

## 3. The promotion rule (load-bearing)

Given a thread's messages, pick the rich message that gets the card:

```
candidates = messages
  .filter(m => m.type in {"review", "questionnaire"})
  .filter(m => isUnresolved(m, thread))
  .filter(m => m.blocking === true)

promoted = candidates.sort(
  (a, b) => a.createdAt.compareTo(b.createdAt)  // oldest first
)[0]  // null if no candidate
```

If `promoted` is null (no blocking unresolved rich message), the card
slot is empty — the thread renders as a normal CommentStream. If
multiple unresolved-non-blocking rich messages exist, all of them
render as rich rows.

The rule is **derived** at render time. No `promoted` flag is stored.
The architect picks where the derivation lives (server projection,
client render-time computation, or a memoised React hook); the
contract is "exactly one rich card per thread, deterministically
chosen."

---

## 4. States

### 4.1 Empty

A thread with no rich messages renders as the existing
`CommentStream` of plain `CommentRow`s. `RichMessageCard` does not
mount.

### 4.2 Loading

`RichMessageCard` renders the metadata strip + title (server-side
known fields) plus a `<Skeleton>` for the reasoning toggle, the
ArtifactView, and the action footer. The five action-footer buttons
render disabled-style ghost variants with their labels visible (so
the verdict shape is communicated during load).

The rich-row variant of `CommentRow` mirrors this: header + title
visible, artifact body skeleton, action row in disabled-ghost mode.

### 4.3 Error

Two failure modes:

- **Artifact failed to fetch.** `ArtifactView` renders its existing
  error state inside the card body. The action footer stays
  interactive but warns above the buttons:
  `Cannot decide without seeing the artifact — Retry`.
- **Verdict commit failed.** The action footer is replaced by an
  inline `<div role="alert" class="alert">` reading
  `Could not commit verdict — Retry`. The Retry button re-issues
  the L7 dispatch; the buttons re-render on success.

### 4.4 Populated (canonical)

As described in §2.1.

### 4.5 Resolved

The card collapses to a single-line summary in the same vertical
position:

```
RESOLVED   APPROVED   Approve deploy of v2.4 to staging   — A. Founder · 2 min ago        [Re-expand ▸]
```

- Tag `RESOLVED` mono caps.
- Verdict label `APPROVED` / `REQUESTED CHANGES` / `REJECTED` /
  `EDIT` / `APPROVED WITH COMMENTS` in mono caps, coloured per
  outcome (`--ok` for approve, `--warn` for changes, `--danger`
  for reject).
- Original review title (truncate with ellipsis past content
  width).
- Actor + relative time in `--text-lo`.
- `Re-expand ▸` chevron at the right margin (button, focusable).

Re-expand restores the full card with the action footer **replaced
by a non-interactive `RESOLVED · APPROVED · A. Founder · 2 min ago`
mono strip**. The artifact + reasoning are re-shown.

The verdict-payload message (the `verdict`-typed message that this
verdict creates) renders **as a normal `CommentRow`** in the next
position in the stream — the verdict branch already exists in the
row primitive (`CommentRow.html` lines 174–181). It is NOT a card.

### 4.6 Overflow

- **Long reasoning.** Collapsed-by-default toggle reads `> N reasons`
  where N is the count. Expanded toggle reads `v Hide reasoning`.
  Short reasoning (≤ 1 rendered line at content width) renders
  inline without a toggle (Fix 2).
- **Long artifact.** `RichMessageCard` has `max-height: min(70vh,
  content)`. When the artifact fills the card, the artifact body
  becomes `overflow-y: auto` and the action footer stays
  sticky-within-card at the bottom edge. ArtifactView's per-shape
  internal overflow rules (long diff scrolls horizontally) still
  apply inside.
- **Multiple rich messages.** Promotion rule (§3): one card max,
  rest are rich rows. Three unresolved blocking rich messages =
  one card + two rich rows.
- **Long card-collapsed summary.** The original review title
  truncates with ellipsis at the content right edge before the
  `Re-expand ▸` chevron.

---

## 5. Behavior

### 5.1 Hover

- Card body: no hover treatment.
- Action footer buttons: DaisyUI default (background tint shift on
  ghost, saturation lift on primary).
- Reasoning toggle: `--surface-4` background on hover; chevron
  rotates 90° on toggle (150ms `--motion-medium`).
- Resolved-state `Re-expand ▸` chevron: same hover as reasoning
  toggle.

### 5.2 Focus

- Tab order through a card: metadata strip (read-only, no stop) →
  reasoning toggle → ArtifactView focusable internals → action
  footer buttons (left-to-right). Resolved card: only the
  `Re-expand ▸` button focusable.
- Tab order through a rich row: same as a plain row + ArtifactView
  internals + action row buttons.
- `:focus-visible` ring: `outline: 2px solid var(--primary);
  outline-offset: 2px`.

### 5.3 Keyboard

**No keyboard verb shortcuts.** Tab + Enter / Space only on
buttons. Reasoning toggle is also Enter / Space.

### 5.4 Click → commit

Click on a verdict button (or questionnaire answer) dispatches via
**L7's response-as-event path** (the response endpoint shipped in
PR #40). Behaviour:

1. The action footer immediately replaces with a
   `Saving…` strip in `--text-lo`. **Minimum-show: 80ms** (so the
   state is perceivable on a fast network).
2. On server confirm:
   - Card animates the height collapse (150ms `--motion-medium`
     opacity + height) into the resolved single-line summary.
   - The verdict-payload `CommentRow` slides in at the natural
     append position below the card (existing CommentStream
     insert motion).
   - Any other unresolved rich messages re-evaluate the
     promotion rule — if the resolved one was the promoted one
     and another unresolved blocking rich message exists, that
     one promotes to a card.
3. On error: action footer re-renders with the alert from §4.3.

The dispatch is **idempotent** per the L1 SHARED contract — the
client sends a `clientKey`; the server treats `(threadId, sender,
clientKey)` as the unique constraint. Retries do not double-commit.

### 5.5 Reasoning toggle

Click the `> N reasons` chip → reasoning expands inline (numbered
`<ol>` between the title and the artifact). Toggle text becomes
`v Hide reasoning`. State is per-message, per-session — not
persisted.

### 5.6 Re-expand

Click the resolved-state `Re-expand ▸` chevron → card restores its
full body. Action footer replaced by the non-interactive
`RESOLVED · …` strip. Click again (chevron flips to `▾`) → collapses
back. Per-session state.

### 5.7 Sticky-within-message

The action footer uses `position: sticky; bottom: 0` inside the
card. The card has `max-height: min(70vh, content)`. The footer
stays anchored to the visible bottom of the card while the artifact
is in view. When the user scrolls the whole card past the viewport,
sticky behaviour ends naturally.

**iOS Safari fallback** (cross-browser concern from variant C):
when nested-sticky is unsupported, the footer lives at the natural
bottom of the card (no sticky), and the user scrolls down to find
it. The graceful degradation is a `@supports (position: sticky)`
guard in the CSS — architect picks the feature-detection
implementation.

### 5.8 Transitions

- Reasoning toggle expand/collapse: 150ms `--motion-medium` height
  + opacity.
- Action footer → `Saving…` strip: 80ms `--motion-fast` opacity
  crossfade.
- Card collapse on resolve: 150ms `--motion-medium` height +
  opacity.
- Re-expand: 150ms reverse.
- All honour `prefers-reduced-motion`: transitions become
  `transition: none`; positional changes happen instantly.

---

## 6. Top-of-pane chrome

**ReviewHeader is deleted.** No top toolbar with verb buttons. No
keyboard shortcuts. No `More` overflow menu.

The detail-pane top edge uses **only `ThreadHostBanner`** (Tier 3,
existing). The banner carries:
- A back-chevron at its left edge (link to the queue / submenu
  that brought the user here).
- The host attachment label (`BET · Pricing overhaul (Nimmly)`).
- The blocking `StatusChip` if the thread is blocking.
- Up to 3 participant avatars + `+N`.
- A single `MoreActions` overflow button (snooze, escalate,
  archive — sidecar workflow ops).

No second header above the banner. This is the founder-direction
elimination of the top action chrome.

---

## 7. Mobile adaptation

At ≤ 768px width:

- `RichMessageCard` loses its right margin; spans the column with
  8px gutters left and right.
- Card retains its left border (the blocking signal) — that signal
  is most important on mobile where queue chrome is minimised.
- Metadata strip wraps to two lines if it overflows
  (sender + role on line 1, time + #N on line 2).
- Action footer wraps `flex-wrap`. Dominant verdict stays first.
- Sticky-within-card uses `max-height: min(60vh, content)` (more
  breathing room).
- Reasoning toggle's collapsed pill is full-width so the touch
  target is ≥ 44px (per AQ-015).
- ArtifactView's `visual_comparison` shape stacks before/after
  panes vertically (existing behaviour).

The promotion rule still applies — at most one card; the rest are
rich rows.

The Conversations tab is the only place rich messages render on
mobile. There is no special mobile shape beyond the wrap rules.

---

## 8. Accessibility

- `<RichMessageCard>` is a `<section aria-labelledby={titleId}>`.
  The title `<h3>` carries the `id`.
- Action footer is `role="toolbar" aria-label="Verdict actions"`
  (or `"Answer options"` for questionnaire).
- Each verdict button has `aria-label` — `Approve` is
  `aria-label="Approve verdict"` so screen readers don't read it
  as a thumb-up.
- Resolved-state `Re-expand ▸` button is `aria-expanded={false}`
  when collapsed, `aria-expanded={true}` when expanded; controls
  the card's body via `aria-controls={cardBodyId}`.
- Reasoning toggle is `aria-expanded={...}` with `aria-controls`
  pointing at the reasoning `<ol>`'s id.
- The blocking `--danger` left-border is **not the only signal** —
  the `ThreadHostBanner`'s `StatusChip blocked` (already shipped in
  L1) carries the redundant text indicator.
- `Saving…` strip is `aria-live="polite"`.
- Error alert is `role="alert"` (assertive announcement).
- Touch targets ≥ 44px on mobile per AQ-015.
- All text contrast ≥ 4.5:1 against the surface it sits on per
  AQ-010.
- Tabular numerals on timestamps per AQ-006.

---

## 9. Open questions for the architect

These are concept-shaped, not visual:

1. **The promotion rule placement.** Server projection vs client
   computation vs a memoised React hook. The visual contract is
   "exactly one card per thread, deterministically chosen by
   `(blocking desc, createdAt asc)`." The architect picks the
   placement.
2. **Sticky-within-message browser support.** The CSS uses
   `position: sticky; bottom: 0` inside a `max-height` container.
   Architect picks the feature-detection (`@supports` query, JS
   fallback, polyfill, or accept the iOS edge case as graceful
   degradation).
3. **The "short reasoning predicate" for Fix 2.** Designer
   suggestion: render reasoning inline when its serialised text
   length is ≤ 80 characters AND it has no list structure (single
   string). Architect picks the exact threshold and computation
   path.
4. **`max-height: min(70vh, content)` token.** Designer suggestion
   to add `--card-max-h: 70vh` to `tokens.css`. Architect picks
   whether to introduce the token or hardcode.
5. **The L7 `clientKey` generation strategy.** SHARED.md says
   `(threadId, sender, clientKey)` is the unique constraint;
   architect picks the client-side generator (UUID v4, ULID,
   timestamp+nonce).
6. **Action-row label for `approve-with-comments`.** "Approve with
   comments" is long. Designer is OK with truncation behaviour
   (the button width grows to fit the label up to a max, then
   truncates with ellipsis); architect can also propose a shorter
   surface label like "Approve+comments" if width testing shows
   wrap problems on common viewports — keep the `aria-label` as
   the full `"Approve with comments"` either way.

---

## 10. Validation — how the L11 acceptance criteria map to this design

| L11 AC | Design contract |
|---|---|
| Rich messages render their affordances inline as part of the message stream | Rich messages render as `RichMessageCard` (promoted) or rich `CommentRow` (others), in-stream, with their action surface attached to the message. |
| The current top header at `ReviewHeader.tsx:153-178` is reduced to a thin presentation header or eliminated entirely; keyboard shortcuts removed | **Eliminated.** `ReviewHeader.tsx` deleted entirely. No keyboard verb shortcuts. |
| Review messages embed the L3 Artifact primitive (using the embedded "output" layout) and the decision affordance inline | `RichMessageCard.body` mounts `<ArtifactView>` (the existing component); `RichMessageCard.actions` is the inline decision affordance. |
| Questionnaire messages embed the constrained answer set inline | `RichMessageCard` with `kind="questionnaire"` renders the constrained answers as buttons in the same `actions` slot. |
| There is no separate action-bar component | `RichMessageCard.actions` is part of the card; no thread-level action bar exists. |
| Action invocation in a review message dispatches to L7's response-as-event path; the agent waiting on the response is unblocked | `onClick` on each action button dispatches via L7's response endpoint (PR #40). |
| Vitest tests cover: each rich message type renders its inline affordance; invoking a review-message decision dispatches via L7 | Test cases the architect plans must include: card mount with review payload renders the 5 buttons; card mount with questionnaire payload renders N answer buttons; click on Approve dispatches an L7 event with the right `messageId`. |
| Playwright e2e: open a review thread → the artifact and decision affordance render inline → invoke the decision → response persists and unblocks the waiting agent | E2E flow: navigate to a review thread → assert `RichMessageCard` is rendered with `<ArtifactView>` and verdict footer → click `Approve` → assert verdict-payload `CommentRow` appears below → assert the underlying agent's task moves out of `blocked`. |

---

## 11. Rejection list (load-bearing)

`/architecture L11` and `/write-code` MUST refuse re-introduction of
any of the following:

1. A top header with verb buttons. ReviewHeader.tsx is gone.
2. Any thin top presentation header. ThreadHostBanner is the only
   chrome above the stream.
3. Keyboard verb shortcuts (A / R / X / S / C / I / E / Enter /
   ArrowUp). No global keydown listener for verdicts.
4. Emoji reactions. Pre-formatted action buttons only.
5. Emojis in code or comments.
6. Drop-shadow on `RichMessageCard`. Surface lift +
   `--border-default` only.
7. Always-collapsed reasoning. Short reasoning renders inline.
8. Always-expanded reasoning. Long reasoning is collapsed by
   default.
9. Card chrome on every rich message. Promotion rule says one card
   per thread max.
10. The left gutter rule from variant C. The card surface lift +
    optional `--danger` left-border already plays that role.
11. A separate `AnchorFrame` / `AnchoredActionStrip` / generic
    `MessageContainer` component. The card *is* the container. Two
    Tier 2 shapes (`RichMessageCard` + extended `CommentRow`)
    cover the design surface.
12. Optimistic-UI bragging — no checkmark celebrations, no
    countdowns, no animated progress on commit.
13. A `…` overflow popover hiding secondary verdicts. All five
    binding verdicts visibly render in the action footer.
14. Composer-level verdict shortcuts (`/approve` etc.).
15. The thread-level `ReviewVerdictBar` Tier 2 surface. Deleted.
16. New rich message types beyond `review` / `questionnaire` /
    `verdict` / `plain`. Closed enum.
17. New ArtifactView shapes beyond the five
    (`text_diff` / `content_preview` / `visual_comparison` /
    `action_summary` / `data_metrics`). Closed enum.
18. Verdict-message rendering as a card. The verdict-payload
    `CommentRow` is a normal row using the existing verdict
    branch.

---

## 12. Critique pass on the approved design

Final critique against the 9-dimension rubric (this is the gate
before `/architecture` consumes the design):

| Dimension | Score | Notes |
|---|---|---|
| Visual hierarchy (V) | 9 | Card lifts the primary decision; rich rows for secondary; eye finds the centre of attention immediately. |
| Spacing / density (S) | 8 | Density tokens honoured throughout; reasoning collapsed-by-default for the long case; sticky footer keeps action surface anchored. |
| Typography (T) | 8 | Mono caps on Tags / labels; title 16px weight 600; tabular-nums on timestamps. |
| Color / contrast (C) | 8 | All tokens; danger left-border is the blocking signal; verdict strip uses `--ok`/`--warn`/`--danger` tints. |
| Coherence (Co) | 8 | One new component (`RichMessageCard`); rich-row variant of `CommentRow` already in the budget; net −1 component (deletes `ReviewHeader` + `ReviewVerdictBar`). |
| States completeness (St) | 9 | Empty / loading / error / populated / resolved / re-expanded / overflow / multi-rich-message all designed. |
| Accessibility (A) | 8 | aria-labelledby + aria-expanded + aria-controls + role=toolbar + aria-live + aria-pressed not needed; redundant text signal for blocking; tabular-nums; touch targets. |
| Anti-slop (As) | 9 | No emoji, no purple gradients, no oversized padding, no card drop shadow (Fix 1), no glass, no decorative icons, closed radius scale, closed motion scale. |
| Concept fit (F) | 9 | Inline rich-message rendering with the action surface as a property of the message; ThreadActionBar abstraction deleted; L7 dispatch; verdict-payload as a normal CommentRow. Top header eliminated. |

**Total: 76 / 90 (avg 8.4).**

Above the ≥ 7 gate. Design contract locks here.

---

## 13. Cross-references

- Story: `docs/work-packages/TRACK-L.md` § L11.
- Concept: `docs/concept/HUMAN_INTERFACE_LAYER.md` § 4.5 (Thread).
- L1 design: `docs/design-explorations/L1/approved.md`.
- L3 spec: `docs/work-packages/TRACK-L.md` § L3.
- SHARED contract: `docs/work-packages/SHARED.md` § "Thread primitive (L1)".
- Existing code being deleted: `packages/web/src/shell/ReviewHeader.tsx`.
- L7 dispatch path: PR #40 (response-as-event endpoint).
- Variants:
  - `docs/design-explorations/L11/thread-flow/` (variant A).
  - `docs/design-explorations/L11/message-card/` (variant B — the base).
  - `docs/design-explorations/L11/anchored-strip/` (variant C).
- HTML mockups: `packages/design-system/html/L11-thread-flow/`,
  `L11-message-card/`, `L11-anchored-strip/`.
