# L1 Thread primitive — Variant B: linear-shaped

> Issue-shaped thread shell. One HEAD message + a comment stream below. Substance first, conversation second. The verdict / answer affordance lives at the head, sticky-pinned. Built for PR-review-style sign-off.

## Signature

The eye lands on the **substance message** as a fully-expanded HEAD region with reasoning, embedded artifact, and a sticky **VerdictBar**; everything else is a quieter `CommentRow` stream beneath it. The audit trail (verdicts + comments) is condensed under the substance, not interleaved with it. The HEAD never scrolls past the verdict bar — the bar pins to the top of the viewport once you scroll past the artifact preview, so the binding actions stay one click away no matter how deep the comment stream gets.

## User story

A founder receiving a blocking review opens the thread, reads the proposer's reasoning and the embedded diff in one glance, scans the discussion for relevant pushback, and renders a binding verdict (or leaves a non-binding comment) without losing the substance from the screen.

## Component composition

The thread is rendered by a single `ThreadShell` that dispatches its first rich message to a HEAD region and the remainder to a comment stream. New L1 components are named precisely below; existing DS primitives are reused where they fit.

| Component | Tier | Slot / props | Composes |
|---|---|---|---|
| `ThreadShell` | 3 (region) | `{ thread, messages, currentUser }`. Carries the host attachment label, participants summary, blocking + pinned + resolved indicators. Decides which message becomes the HEAD. | `ThreadHostBanner`, `ThreadHead`, `CommentStream`, `Composer` |
| `ThreadHostBanner` | 2 (block) | `{ host: { kind, label, href }, blocking, pinned, resolvedAt, participants }`. Top strip — “On bet: Pricing overhaul (Nimmly)” + status indicators. | `StatusChip`, `Tag` |
| `ThreadHead` | 2 (block) | `{ message: ReviewMessage \| QuestionnaireMessage \| PlainMessage, mode: "review" \| "questionnaire" \| "plain" }`. Renders sender, role tag, title (the message's first line / `payload.title`), structured **Reasoning** list, embedded **Artifact** preview slot. | `KeyValue`, `Tag`, `ArtifactView` (slot — filled by L11) |
| `ReviewVerdictBar` | 2 (block) | `{ verdicts: 5, actions: 3, sidecar: 2, onAct }`. Sticky-pinned beneath the head. Five binding `verdicts` get full visual weight (filled `btn`); three message-emitting `actions` are ghost buttons; two sidecar workflow operations are tertiary text-only links separated by a divider. | DaisyUI `btn`, `btn-ghost`, divider |
| `QuestionnaireAnswerBar` | 2 (block) | `{ options: string[], multiplicity: "one-of" \| "any-of", onAnswer }`. Same slot as `ReviewVerdictBar` but renders the constrained answer set as radio-style buttons + a confirm. | DaisyUI `btn`, `radio` |
| `CommentStream` | 2 (block) | `{ messages: Message[], headId }`. Filters out the HEAD message, renders the rest as condensed rows with `(date-grouped)` separators. | `CommentRow` |
| `CommentRow` | 1 (primitive, new) | `{ message, isVerdict, isInline }`. One condensed comment: 24 px avatar, sender, 1-line snippet (clamps after 2), timestamp. Verdicts get a `StatusChip` instead of a snippet (e.g., `APPROVED`). | `StatusChip`, `Tag` |
| `Composer` | 2 (block) | `{ placeholder, onSend, disabled }`. Plain reply box at the bottom. When the head is a review and the user has not yet rendered a verdict, the composer carries a hint label `Reply (non-binding) — verdict bar above for binding actions`. | DaisyUI `textarea`, `btn` |

`ThreadHostBanner`, `CommentRow`, `Composer` are reused 1:1 by the `slack-shaped` and `slate-shaped` variants. `ThreadHead` + `ReviewVerdictBar` + `QuestionnaireAnswerBar` are unique to this variant.

## Information hierarchy

Numbered in landing order — what the eye is meant to find first:

1. **Host attachment + blocking indicator** (top strip) — answers *what is this thread about? do I need to act now?*
2. **HEAD title + proposer** — answers *who is asking and for what?*
3. **VerdictBar / AnswerBar (sticky)** — answers *where do I act?*
4. **Reasoning bullets** (3-5 lines, structured) — answers *why are they asking?*
5. **Artifact preview** (embedded `ArtifactView` — diff, image, etc.) — answers *what would I be approving?*
6. **Comment stream** (condensed `CommentRow` list, latest at the bottom) — answers *what has already been said?*
7. **Composer** — answers *how do I add a non-binding reply?*

The HEAD region (1-5) takes ~60% of the initial viewport on a 1280×800 desktop. The comment stream begins around the fold; scrolling it does not displace the verdict bar.

## All states

### Empty
A thread with zero messages should not exist (every thread is opened with an initiating message). If somehow rendered: the host banner shows; the HEAD region renders an `EmptyState` with copy *"This thread has no messages yet."* and the composer is enabled.

### Loading
- Host banner skeleton: monospace pill placeholders for status chips.
- HEAD skeleton: 1 line for proposer, 1 line for title (60% width), 3 reasoning bullet skeletons, a 6-line `<pre>` skeleton for the artifact.
- VerdictBar shows disabled buttons (no skeleton — preserves spatial grammar).
- Comment stream renders 3 placeholder rows (avatar dot + 1-line text skeleton).

### Error
`ErrorState` replaces the HEAD region. Host banner stays. Composer disabled. Copy: *"Couldn't load this thread. [Retry]"*.

### Populated — review (canonical state)
HEAD = the unresolved review message. VerdictBar mounted. Comments below are: any `plain` comments + any `verdict` comments rendered as `CommentRow` with a `StatusChip` ("APPROVED-WITH-COMMENTS", "REQUEST-CHANGES", etc.).

### Populated — questionnaire
HEAD = the unresolved questionnaire message. `QuestionnaireAnswerBar` replaces `ReviewVerdictBar`. Comments stream same as review.

### Populated — plain (chat-shape thread, no rich head)
There is no rich message yet. The **first plain message** is promoted to the HEAD slot — proposer + title (auto-derived: first 80 chars) + body (no Reasoning bullets, no Artifact, no VerdictBar). Subsequent plain messages render as `CommentRow`s. The Composer carries the default placeholder (no verdict-bar disclaimer).

> This is the variant's stance on chat-shape threads: the head **does not collapse**. A plain HEAD is still a HEAD — just lighter. The thread always has a "thing it is about", even when that thing is "Backend Builder asked a question".

### Populated — resolved
The verdict / answer message has landed. The VerdictBar/AnswerBar swaps to a single read-only summary row: `Resolved · Approved with comments by CPO · 2 hours ago` with a tertiary `[Re-open]` link (re-opening clears `resolvedAt` per §4.5.5). The HEAD's reasoning + artifact stay expanded — auditors land on the substance the verdict was rendered against. Comments below remain editable (composer enabled).

### Overflow — long history (50+ messages)
The CommentStream collapses everything between the HEAD and the most recent N=10 comments behind a single row: `[Show 47 earlier comments]`. Date-grouped separators (`Today`, `Yesterday`, `Apr 12`) split the visible portion. The HEAD never collapses on overflow.

### Overflow — long reasoning (more than 5 bullets)
Reasoning truncates to 5 bullets with a tertiary `[Show 3 more]` toggle. The artifact preview always renders fully (the ArtifactView slot decides its own overflow per L11).

### Overflow — long artifact preview
The embedded ArtifactView caps at 320 px height with a fade-out and `[Open full artifact]` affordance. This contract belongs to L11; this variant only allocates the slot height.

## Behavior

### Sticky verdict bar
- The VerdictBar attaches to the bottom of the HEAD reasoning block at rest.
- Once the user scrolls **past the artifact preview**, the bar lifts off and pins to the **top of the scrollable region** (sticky, not fixed — it does not cover the host banner). The host banner stays at the very top above the sticky bar.
- The bar releases (un-pins) when the user scrolls back up past the artifact preview.
- Threshold rule: pin engages when the bar's natural position would scroll above the host banner's bottom edge. No flicker; CSS `position: sticky; top: <host-banner-height>`.
- On resolved threads, the read-only summary row never sticks (no action needed → no need to pin).

### Verdict button activation
- Clicking a binding verdict opens a confirmation popover in-place above the button: title `Approve and post verdict?` + optional 1-line note input + `[Confirm]` / `[Cancel]`. No global modals.
- `Approve with comments` and `Request changes` require the note (composer-style); the popover textarea is the input. Empty submission is rejected with a `--danger` border on the textarea.
- `Edit` opens the composer pre-populated with `[edit]` prefix; this is a message-emitting verdict that records the founder's edit as a `verdict-payload` message of type `edit` with the proposed change in payload.
- `Reject` requires the note. Rejection is destructive — the confirm button is `--danger` tinted.
- Sidecar `Snooze` opens a small inline picker (`1h / 4h / Tomorrow / Custom`); does not emit a message in the stream (per §4.5.8).
- Sidecar `Escalate` confirms in-place (`Escalate to Chief of Staff?`); does not emit a message — creates a back-referenced thread on the coach configuration.

### Hover / focus
- HEAD region: no hover treatment (it is the canvas, not a row).
- `CommentRow`: `background: var(--surface-3)` on hover; reveals an `Inline-comment` ghost button on the right edge (only on review-thread comment rows where the artifact has anchors).
- All interactive elements: 1px `--primary` outline on `:focus-visible`, offset −1px, matching `ThreadRow`.

### Transitions
- HEAD reasoning expand / collapse: `200ms` height transition (GPU-friendly via `transform: scaleY`).
- Sticky bar pin: no transition — instantaneous, otherwise it feels jelly-like.
- New `CommentRow` insertion: `150ms` opacity fade-in, no slide. The audit trail must not feel like a chat ticker.
- Verdict popover: `80ms` fade + 4px translate. Closes on outside click or `Esc`.

### Keyboard / focus management
- Tab order: host banner controls → verdict buttons (left to right, binding first) → message-emitting actions → sidecar actions → comment stream → composer.
- `Esc` closes any open verdict popover and returns focus to the triggering button.
- The HEAD's `[Show N more]` reasoning toggle and the comment stream's `[Show 47 earlier]` are standard buttons in tab order.
- **No keyboard verb shortcuts** (per founder filter / TRACK-L scope).

### Scroll memory
On re-entering a thread the user previously scrolled, restore the prior scroll position. If the user is mid-comment-stream and a new comment arrives, do not auto-scroll; surface a `[1 new comment ↓]` pill above the composer.

## Mobile adaptation

Three regions stack:

1. **Host banner** — full width, sticky at the top of the viewport.
2. **HEAD region** — full width, no max width. Reasoning bullets wrap. The artifact preview switches to its mobile shape (per L11 — likely a horizontally scrollable diff strip or a "tap to expand" tile).
3. **VerdictBar** — switches from sticky-top to **fixed-bottom**, above the keyboard. Five binding verdicts collapse into a primary `[Approve ▾]` split-button (single tap → approve; long-press / tap chevron → menu of five). Message-emitting actions and sidecar move into a `[⋯ More]` menu (text-labelled, no emoji icons — three vertical dots are an icon, not an emoji).
4. **Comment stream** — same condensed rows as desktop; date separators stay.
5. **Composer** — slides above the verdict bar on focus (the verdict bar tucks under the keyboard when the composer is active; on blur, verdict bar restored).

Knowledge view is desktop-only per the concept; this variant therefore renders for review/chat/coach threads on mobile but never for knowledge-item attachments.

## Trade-offs (what this variant is bad at)

- **Long conversations feel cramped.** When a thread accumulates 30+ comments, the comment stream becomes the dominant region but is rendered as condensed rows — power users who want to read 200 messages of discussion are better served by the `slack-shaped` variant.
- **Multi-artifact threads strain the head.** A review message that legitimately embeds two or three artifacts has to choose one for the HEAD slot; the rest must surface as inline references in the reasoning. The `slate-shaped` variant handles this better via its full canvas.
- **Sticky bar competes with the host banner on short viewports.** On a 600 px tall window, the pinned verdict bar + host banner can consume 30% of the viewport. The fix is graceful: the host banner collapses to a single line under 720 px height.
- **Plain-only ("chat-shape") threads pay a hierarchy tax.** Promoting the first message to a HEAD costs vertical space that a flat `slack-shaped` stream would not. Acceptable for review-heavy threads; awkward for high-frequency chat.
- **Resolved threads bury the verdict.** The summary row is short by design, so the audit trail of who voted what reads off the comment stream — fine for one verdict, but if a review collected three approvals over a re-open cycle, the timeline is condensed.

## Anti-convergence audit (vs. A and C)

| Axis | This variant (linear) | A (slack) | C (slate) |
|---|---|---|---|
| Hierarchy | HEAD on top, verdict pinned below it, comments after | latest message at bottom; composer dominates | artifact canvas dominates; dock secondary |
| Density | medium (HEAD expanded, comments compact) | high (single column of tight rows) | low primary + medium secondary |
| Action surface | sticky verdict bar attached to HEAD | composer-anchored | canvas-edge toolbar |
| Composition | HEAD + stream + composer (3 regions) | 1 stream + 1 composer | canvas ∥ dock + composer |
| Copy register | structured, issue-shape ("Reasoning", "Artifact", "Verdict") | terse, chat-shape | label-driven, document-shape |

This variant differs from A on **hierarchy / composition / copy register / action surface** (4 axes) and from C on **hierarchy / density / composition / action surface** (4 axes). Both pairs clear the 3-axis anti-convergence floor.

## Tokens & rules audit

- All paddings consume density tokens (`--density-pad-*`, `--density-card-pad`, `--density-card-gap`, `--density-page-gutter`). No raw `p-[Npx]`.
- All colors are semantic tokens — `--surface-{0..6}`, `--text-{hi,mid,lo}`, `--ok`, `--warn`, `--danger`, `--primary`. No hardcoded hex.
- All radii on the closed scale: `--r1` (4px) for buttons, `--r2` (8px) for cards, `--r3` (12px) reserved for the artifact preview frame, `--r-pill` for chips.
- No `rounded-2xl` / `rounded-3xl` (AQ-101).
- No purple/indigo gradients (AQ-102) — `--primary` is the only accent and is used flat.
- No emoji as iconography (AQ-105) — the three sidecar/menu indicators (`⋯`, `▾`, `↓`) are typographic glyphs, not emoji codepoints.
- Spacing on the 4 px grid; the only off-grid value is the StatusChip's internal 2 px (allowed sub-grid per AESTHETICS.md).
- No keyboard verb shortcuts (founder filter).
- No optimistic-UI bragging — the comment stream simply fades new rows in; no toast says "Posted!".
- No drag-reorder (founder filter).
- Lucid Dark is the canonical screenshot; the file renders correctly in Lucid Light via the same tokens.
