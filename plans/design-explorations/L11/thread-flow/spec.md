# Variant A — Thread-flow

> Slug: `thread-flow`. Constraint: minimal scaffold; treat "rich" as just
> "more slots on the row primitive." Thesis: the founder reframe taken
> at face value — rich messages render INLINE inside the message stream,
> visually identical to plain messages, with the action surface as a
> simple flex row directly under the artifact.

---

## 1. User story

A Founder reading a thread with a `review` or `questionnaire` message
sees the rich content (artifact, decision affordance) inline as part of
the same single-column flow as plain text messages. The verdict
buttons live directly below the artifact, not in a header, not in a
card footer, not in a sticky bar. After committing a verdict, the
verdict appears as the next message in the stream and the original
review stays expanded with a `RESOLVED` chip.

## 2. Component composition

Reuses the existing 19-component budget. **Adds zero new components.**

| Where | Component | What L11 changes |
|---|---|---|
| Each row in the stream | `CommentRow` (Tier 2, exists) | Extends with three optional slots: `richHeader`, `richBody`, `richActions`. Plain messages render the existing `text` slot; rich messages render the three rich slots instead. |
| Inside `richBody` | `ArtifactView` (Tier 3, exists) | Mounted with the embedded "output" layout. Always-expanded by default. |
| Inside `richActions` | DaisyUI `<button>` primitives | 5 binding verdicts for review (`approve`, `approve-with-comments`, `request-changes`, `edit`, `reject`); 1 button per option for questionnaire. |
| Resolved indicator | `StatusChip` (Tier 1, exists) | Inline next to sender on a resolved review message. |
| Top of pane | `ThreadHostBanner` (Tier 3, exists) | Carries host context, blocking indicator, back-chevron in its left edge. |

**ReviewHeader.tsx is deleted.** The thin presentation header the L11
spec offers as a fallback is rejected — `ThreadHostBanner` already
carries title + sender of the host entity + a back-chevron is sufficient.

## 3. Information hierarchy (a rich message row)

```
1. Avatar + sender header   (CommentRow's existing header slot)
2. richHeader               REVIEW · 18 min ago · #2 in thread
                            Approve deploy of v2.4 to staging
                            REASONING
                            1. Schema migration adds two columns; backfill verified.
                            2. All 142 contract tests pass; integration suite green.
                            3. Cost cap reduced 8%; budget headroom OK.
3. richBody                 [ArtifactView · embedded "output" layout]
4. richActions              [Approve] [Approve with comments] [Request changes] [Edit] [Reject]
```

Indented under the avatar column at 28px + 8px gap (matches existing
`CommentRow` indent). The action row is a `flex flex-wrap gap-2` of
DaisyUI buttons — `btn btn-sm btn-primary` for the dominant verdict
(`approve`), `btn btn-sm btn-ghost` for the rest, `btn btn-sm btn-error
btn-outline` for `reject`.

## 4. States

### 4.1 Empty
Not applicable — a rich message renders only when the message exists.

### 4.2 Loading
The `ArtifactView` already handles its own loading skeleton. The verdict
buttons render disabled + a `Skeleton` component covering the action
row until the message metadata is fetched.

### 4.3 Error
Two failure modes:
- Artifact failed to fetch — `ArtifactView` renders its existing
  error state inside `richBody`. The action row stays interactive
  but warns with `Cannot decide without seeing the artifact.` in
  `--text-lo` above the buttons.
- Verdict commit failed — the action row replaces with an
  `<div role="alert">` that says `Could not commit verdict — retry`
  with a single `Retry` button that re-issues the L7 dispatch.

### 4.4 Populated (the canonical state)
As shown in §3.

### 4.5 Resolved
The action row is replaced by an inline strip:
```
RESOLVED · APPROVED · A. Founder · 2 min ago
```
in `--text-lo` mono caps for the labels and `--text-mid` for the values.
The original message stays expanded. The verdict itself appears as the
next `verdict`-payload message immediately below in the stream — a
`StatusChip done` followed by the verdict label and any note.

### 4.6 Overflow
- **Long reasoning (>5 numbered steps).** The list renders all of them;
  the row grows. We do not truncate substance.
- **Long artifact.** `ArtifactView` itself owns its overflow (long diff
  scrolls horizontally; long content_preview gets a `max-h-[480px]
  overflow-y-auto`). The action row is *always* immediately below the
  artifact — when the artifact has internal scroll, the action row
  stays at its natural position in the row flow. No sticky behaviour.
  This is intentional: the founder filter says "no optimistic-UI
  bragging" — sticky chrome is bragging.
- **Multiple rich messages in one thread.** Each renders its own
  `richHeader`/`richBody`/`richActions` independently. Two unresolved
  reviews → two action rows. The user's eye finds the unresolved ones
  by scanning for action rows; resolved ones have only the
  `RESOLVED` strip.

## 5. Behavior

### 5.1 Hover
- Action buttons: DaisyUI's default hover (background tint shift on
  ghost; saturation lift on primary). No custom hover.
- `richBody` artifact: no hover treatment in the row; if the artifact
  has its own affordances (copy a hunk, expand an image), those are
  the artifact's concern.

### 5.2 Focus
- Tab order: avatar → richHeader (read-only, no focus stop) →
  richBody focusable parts (artifact internals) → richActions buttons
  (left-to-right). Standard browser focus ring on all buttons.
- A focused button shows the design system's `:focus-visible` ring
  (`outline: 2px solid var(--primary); outline-offset: 2px`).

### 5.3 Keyboard
**No keyboard verb shortcuts.** This is the deletion the story
mandates. The buttons are tab-and-Enter only. The keyboard escape
hatches that survive: Tab to navigate, Enter or Space to activate,
Shift+Tab to back out.

### 5.4 Click → commit
A click on a verdict button (or a questionnaire answer) dispatches via
L7's response-as-event path. The action row immediately renders a
`Saving…` row in `--text-lo` (replacing the buttons) until the server
confirms; then collapses to the `RESOLVED` strip and the new
`verdict`-payload message appears below. There is no optimistic-UI
celebration — the row simply changes shape.

If the dispatch fails, the buttons re-render and the alert from §4.3
appears.

### 5.5 Transitions
- Buttons → `Saving…` row: opacity crossfade, 80ms (`--motion-fast`).
- `Saving…` row → `RESOLVED` strip + new verdict message below:
  150ms (`--motion-medium`) opacity fade. The verdict message slides
  in from the natural append position — uses the existing
  `CommentStream` insert animation (no per-L11 motion budget).
- Honors `prefers-reduced-motion`: all transitions become
  `transition: none`.

## 6. Mobile adaptation

Single-column already. At 360px:
- The avatar shrinks per the existing `CommentRow` rule (no change).
- `richActions` wraps to two rows automatically (`flex flex-wrap`).
  Order is preserved; the dominant verdict is always first.
- `ArtifactView`'s `visual_comparison` shape stacks the before/after
  panes vertically on narrow screens (existing behaviour).

The Conversations tab is already the only place rich messages render.
No special mobile shape — same row primitive, narrower column.

## 7. Component mapping summary

```
RichMessageRow (an extended CommentRow — same component, more slots)
├── Avatar + sender header                ← CommentRow
├── richHeader: tag + title + reasoning   ← Tag (Tier 1) + h3 + ol
├── richBody: <ArtifactView ... />        ← ArtifactView (Tier 3)
└── richActions: <div role="toolbar">     ← DaisyUI buttons
        ├── <button class="btn btn-sm btn-primary">Approve</button>
        ├── <button class="btn btn-sm btn-ghost">Approve with comments</button>
        ├── <button class="btn btn-sm btn-ghost">Request changes</button>
        ├── <button class="btn btn-sm btn-ghost">Edit</button>
        └── <button class="btn btn-sm btn-ghost text-[var(--danger)]">Reject</button>
```

When resolved:
```
RichMessageRow (same row, different state)
├── Avatar + sender header + StatusChip(RESOLVED)
├── richHeader: tag + title + reasoning  (still expanded)
├── richBody: <ArtifactView ... />       (still expanded)
└── (action row replaced by RESOLVED strip)
```

The verdict message that follows is a normal `CommentRow` with a
`type: "verdict"` payload (already supported by `CommentRow.html`'s
verdict branch).

## 8. The signature

**One thing makes this variant unmistakably itself:** rich messages
render with the *same row chrome* as plain messages. There is no
visual lift, no card, no sticky surface — just more slots inside the
existing row primitive. The eye reads the thread top-to-bottom as one
continuous stream. The fact that some rows have artifacts and verdict
buttons attached is data about the message, not chrome.

## 9. Trade-offs

**What this variant is good at.**
- Zero new components. Smallest possible diff. Easiest to ship.
- "Inline" in the most literal sense the founder asked for. The action
  surface is a property of the message; the message is a row in the
  stream; same chrome as everything else.
- Naturally handles N rich messages in a thread — N action rows, no
  contention.
- Mobile-friendly by default; no special wrap rules.

**What this variant is bad at.**
- **Hierarchy is flat.** When the user opens a thread with a single
  unresolved review and 30 plain replies above it, the unresolved
  review row looks visually identical to the replies. Only the
  presence of an action row distinguishes it. The user has to scan
  for action buttons to find the decision they need to make.
- **No visual centre of gravity.** Power-density variants put the
  artifact at the visual centre of the screen; this one puts it in
  the row flow. For artifact-heavy reviews (a 600-line diff), the row
  reads as one giant paragraph.
- **Action surface unfindable when the artifact is taller than the
  viewport.** No sticky behaviour means the user must scroll to the
  bottom of the artifact to find the verdict buttons. For a
  multi-screen artifact, this is a real cost.
- **Resolved-state ambiguity.** Leaving the resolved review expanded
  with the same chrome as the unresolved one risks the user
  misreading the screen. The `RESOLVED` chip + `StatusChip` next to
  the sender is the only signal. (We mitigate this by rendering the
  verdict message immediately below — but the original message
  itself is unchanged.)

## 10. Open questions for the architect

- The `richHeader` / `richBody` / `richActions` slot extension to
  `CommentRow` — is that an extension of the existing component, or a
  sibling renderer dispatched by message type? **Designer call: the
  rendering is one component (`CommentRow`) with a typed dispatch
  inside its body — same primitive, the slots are conditional on
  `message.type`.** Architect picks the prop shape.
- The `Saving…` interim state — debounce window (designer suggests
  150ms minimum-show so the state is visible even on a fast network).
- The verdict-message row that appears below — is its `StatusChip`
  the same colour family as the original review's blocking chip
  inverted, or a fresh palette? Designer: same family, inverted —
  `--ok` tint when approved, `--warn` tint when changes requested,
  `--danger` tint when rejected.
