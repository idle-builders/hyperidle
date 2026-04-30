# L11 — Render rich messages inline; remove the ThreadActionBar abstraction

**Phase 0 brief.** The interrogated story plus the locked context this design pass cannot violate.

---

## 1. The user task

A Founder (CEO or CPO) opens a thread that contains a rich message — a **review message** (artifact + decision) or a **questionnaire message** (constrained answers) — and decides what to do.

The decision the human is making in this surface is *exactly one*:
- on a review message: pick a binding verdict (`approve` / `approve-with-comments` / `request-changes` / `edit` / `reject`).
- on a questionnaire message: pick exactly one of the constrained answers.

Everything else (reply text, inline comments, snooze, escalate) is L1b territory — out of scope here.

The decision unblocks an agent waiting on a response. L7's response-as-event path is the dispatch mechanism (already shipped, PR #40).

## 2. What's wrong with what exists today

The current `packages/web/src/shell/ReviewHeader.tsx:153-178` ships:
- a top-of-detail-pane header with verb buttons (Approve / Request changes / Reject / Snooze plus a "More" overflow with 6 secondary verdicts);
- 7 hardcoded keyboard shortcuts (A / R / X / S / C / I / E) bound to a global `keydown` listener inside the header;
- a **ThreadActionBar abstraction** — chrome above the message stream that pretends to be "the thread's action bar" while structurally being a per-message affordance.

Three things it gets wrong:
1. **Levels.** A review *message* needs an action — but the header is at the *thread* level. When a thread has multiple review messages (legitimate per the L1 concept), the top bar can only address one at a time. When a thread has zero unresolved reviews, the bar still renders chrome.
2. **Ergonomics.** Keyboard verb shortcuts (A / R / X / S) are on TRACK-L's rejection list — founder filter "no keyboard verb shortcuts."
3. **Conceptual fit.** The L1 concept doc §4.5 says **rich messages render via a typed dispatch — the message owns its own inline UI**. The action surface is a property of the *message*, not of the thread chrome.

## 3. The locked concept this design pass MUST respect

This is *not* a `/concept` pass. The primitive shapes are fixed:

- **Thread** (L1): container of typed messages, no shape itself. `ThreadHostBanner` + optional `ThreadHead` + `CommentStream` + `Composer` already shipped.
- **Message** types (closed enum): `plain` / `review` / `questionnaire` / `verdict`. Rich = review or questionnaire.
- **Review message payload:** `{ title, reasoning[], artifact: ArtifactRef }` plus the verdict-affordance hint.
- **Questionnaire message payload:** `{ question, options[] }` plus the answer-slot hint.
- **Verdict** is **itself a message** appended on commit (a `verdict`-payload message with `resolvesMessageId` pointing at the review/questionnaire message it terminates). It is not hidden state on the original.
- **Artifact** (L3): five embedded "output" layouts (`text_diff` / `content_preview` / `visual_comparison` / `action_summary` / `data_metrics`). Already shipped — the `ArtifactView` component takes a discriminated-union prop and renders the right layout.
- **Response dispatch** (L7): committing a verdict / answer hits the response-as-event path; the agent waiting on the message is unblocked. Already shipped.

The L1-approved design currently mounts `ThreadHead` for the substance message and `ReviewVerdictBar` (sticky to the head's lower edge) as a *thread-level* action surface. **L11 changes that.** The substance moves into a **rich-message renderer** that owns its own inline action surface. The `ThreadHead` slot for the substance message is gone — it becomes a normal `MessageRow` with a richer payload.

## 4. The hard constraints (non-negotiable)

From the story spec + the SHARED.md contract + the founder filter:

- **Inline placement is non-negotiable.** Founder direction: *"ThreadActionBar inline with the messages, not on top — it's part of the thread."*
- **No separate action-bar component.** The verdict/answer buttons render inside the message that owns the decision.
- **Top header is reduced or eliminated.** It becomes a thin presentation header (title + sender + back-to-queue) or it goes away. The ThreadHostBanner already exists for host context — anything beyond it must justify its weight.
- **No keyboard verb shortcuts.** Removed.
- **No emoji reactions** anywhere; pre-formatted actions only.
- **No emojis** in code or comments.
- **A binding verdict commits a `verdict` message** *and* dispatches via L7. The original review message becomes resolved; the verdict shows up below it as the next message in the stream.
- **The "embedded output" Artifact layout** (the L3 contract for artifacts inside a review message) is what mounts inline. Promotion to a full canvas view is a future surface, not L11.

## 5. The component budget question

L1 + L2 already burned through the existing budget; L11 should add as little as possible. The current candidates the renderer can compose from:

- `CommentRow` (Tier 2, exists) — the row primitive every message uses.
- `ArtifactView` (Tier 3, exists) — the embedded "output" layout for the artifact.
- `Tag`, `StatusChip`, `KeyValue` (Tier 1, exist) — labels, status, structured fields.
- `Composer` (Tier 2, exists) — the reply textarea.

What L11 needs to introduce — at most one new shape, and only if `CommentRow` cannot stretch:

- A **rich message renderer** that takes a `Message` of type `review | questionnaire` and produces an inline message with its action surface attached. Provisional name: `MessageRow` (extends or replaces `CommentRow`) or `RichMessageView` (a sibling).

What L11 explicitly **deletes**:

- `ReviewHeader.tsx:153-178` and its 7-shortcut keydown listener.
- The "ThreadActionBar" pattern (the thread-level action surface). The L1-approved `ReviewVerdictBar` becomes a *property of the rich message renderer*, not a sibling of it.

## 6. Variant axes (where the spread must live)

The three variants must differ on at least 3 of these axes per pair:

| Axis | What it means here |
|---|---|
| **Hierarchy** | Where does the eye land first? The artifact, the verdict surface, the sender, or the question? |
| **Density** | How much of the message + artifact fits in one viewport without scroll, when the artifact is dense (e.g. a `text_diff` with 10 hunks)? |
| **Action-surface placement** | Inline buttons under the artifact / inside an "actions footer" of the message bubble / next to the artifact in a side rail / inside a per-message popover? Each is *inline* in the sense the founder asked for; they differ on which inline shape. |
| **Resolved-state strategy** | Does the message collapse on verdict, get a strikethrough, get replaced by the verdict message, get a stamp overlay, or stay expanded with a `RESOLVED` chip? |
| **Composition** | Reuses `CommentRow` with extra slots / introduces a sibling `RichMessageRow` / introduces a "message bubble" container that wraps both plain and rich messages? |
| **Top-header strategy** | Reduces ReviewHeader to title+sender / eliminates it entirely (host banner alone carries context) / replaces it with a thin "thread title" strip. |
| **Surface treatment** | Is the rich message visually distinct from plain messages (different surface, border, padding) or visually identical (same row chrome, the action surface is what differs)? |

## 7. Constraint-and-thesis pairings for the three variants

Because L11 *extends an existing primitive* (the rich message is a kind of `MessageRow`), the variants explore the **application** of the inline pattern, not the shape of a new primitive.

### Variant A — "Thread-flow" (minimal scaffold; founder reframe taken at face value)
**Constraint.** Use `CommentRow` as-is for plain messages; introduce **one** new variant of it for rich messages. The rich variant adds three slots: `richHeader` (title + reasoning), `richBody` (the `ArtifactView` mounted inline), `richActions` (the verdict/answer buttons — primary buttons in a flex row directly under the artifact). No top header at all — the `ThreadHostBanner` carries context. No bubble, no surface lift; the rich message is just a row with more slots. Verdict on commit appends a `verdict` message *immediately below* it in the same stream; the original review message stays expanded with a `RESOLVED` `StatusChip` next to its sender.
**Thesis.** The least-clever shape. Treats "rich" as just "more slots on the row primitive." The fact that you can't tell where the message ends and the action surface begins IS the point — they're one thing.

### Variant B — "Message-card" (power-density; the rich message becomes a contained card)
**Constraint.** Plain messages stay as `CommentRow` rows; rich messages render as a **bordered card** inset into the stream (left-aligned, indented to align with `CommentRow`'s body column). The card has its own internal hierarchy: a one-line metadata strip (sender · role · timestamp · `REVIEW` or `QUESTION` Tag), a title, a collapsed-by-default `REASONING` block (reveal on click), the `ArtifactView` (always expanded), and a footer-aligned action row. The card uses `--surface-2` against the stream's `--surface-1`, with `--r2` corners and a left border that goes `--danger` when the message is the blocking one in the thread. Top header is eliminated; back-to-queue moves into the `ThreadHostBanner`'s left edge as a back chevron. Verdict on commit collapses the card to a single-line `RESOLVED — APPROVED · 2 min ago` summary that the user can click to re-expand.
**Thesis.** Optimise for the most common power-user task: scan the artifact, decide. Compress reasoning behind a click, expand artifact by default, lock the action row in the footer so the user's eye never has to leave the card to find the verdict. Distinct surface treatment makes "things you can act on" visually distinct from "things to read."

### Variant C — "Anchored-strip" (reference-borrowed: GitHub PR review-comment block)
**Constraint.** Borrow the GitHub PR-review-comment grammar — a quoted artifact preview at the top, the actor's reasoning as a quoted note below it, the action surface as a compact horizontal strip *anchored to the bottom edge of the artifact* (not the bottom of the message bubble). The strip is sticky-within-message: while the artifact is in view, the strip is anchored to its lower edge; when the user scrolls past the message, the strip detaches and scrolls with the content. The artifact gets a left gutter rule (a 2px line in `--text-lo` that becomes `--danger` when blocking) — the rule visually claims the artifact and the strip as one unit. Top header is preserved but reduced to a single line: `BACK · {host title} · sender@time`. On commit, the message renders a thin `VERDICT — APPROVED · A. Founder · 2 min ago` strip above where the action bar was; original message stays.
**Thesis.** A proven interaction grammar (GitHub review comments) reduces the founder's learning curve. The artifact is the centre of gravity; the verdict surface is anchored to it, not floating in chrome.

## 8. Anti-convergence check

The three variants differ on:

- **Surface treatment.** A: identical to plain rows. B: distinct card with `--surface-2` lift. C: identical to plain rows but with a left-edge gutter rule on the artifact only.
- **Action-surface placement.** A: simple flex row right under the artifact. B: footer-locked at the bottom of the card, separated by a divider. C: anchored to the artifact's lower edge with sticky-within-message.
- **Reasoning visibility.** A: always inline above the artifact. B: collapsed-by-default reveal-on-click. C: a quoted note below the artifact.
- **Resolved-state strategy.** A: `StatusChip` next to the sender, message stays expanded. B: card collapses to a one-line summary. C: the action strip is replaced by a thin `VERDICT` strip; original message stays.
- **Top-header strategy.** A: eliminated. B: eliminated; back-chevron in `ThreadHostBanner`. C: preserved but reduced to a single line.

Five of seven axes differ. Anti-convergence requirement met.

## 9. Open questions parked for the variants to answer

- **Reasoning length.** Some review messages carry 1-line reasoning, others carry 5+ numbered steps. Do all three variants handle the long case gracefully?
- **Multiple rich messages in one thread.** A thread may have a review message, get an `approve-with-comments` verdict, then receive a follow-up questionnaire message. Does each rich message render its own inline action surface independently? (Concept says yes — design must demonstrate.)
- **Scrolling behaviour during decision.** When the artifact is taller than the viewport, where do the verdict buttons land relative to the user's scroll position? Each variant answers differently.
- **Resolved messages mixed with unresolved ones.** A thread can carry one resolved review and one fresh review. Does the unresolved one stay visually distinct so the user can find it?

## 10. Mobile note

Mobile renders Conversations as a single tab. The rich message must work in a 360px-wide column. The variants differ on what falls back: A is already narrow-friendly; B's card needs to keep its left border but lose the indent; C's anchored strip wraps to two rows on small screens.

## 11. Reference list

- L11 spec: `docs/work-packages/TRACK-L.md` § L11 (lines 375–405).
- L1 Thread concept: `docs/concept/HUMAN_INTERFACE_LAYER.md` § 4.5.
- L1 approved design: `docs/design-explorations/L1/approved.md`.
- L3 Artifact spec: `docs/work-packages/TRACK-L.md` § L3.
- SHARED.md Thread contract: `docs/work-packages/SHARED.md` § "Thread primitive (L1)".
- Existing Thread primitives: `packages/design-system/html/ThreadShell.html` / `CommentRow.html` / `ReviewVerdictBar.html`.
- Existing artifact renderer: `packages/web/src/shell/ArtifactView.tsx`.
- The thing being deleted: `packages/web/src/shell/ReviewHeader.tsx:145-273`.
- Founder filter (TRACK-L scope rules): no keyboard-verb shortcuts, no optimistic-UI bragging, no sidebar drag-reorder, no emoji reactions, no cycles UI, no search-modifier mini-language, no customizable dashboards.
