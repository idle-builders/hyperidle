# AM1 Conversation — Variant B: "Quiet Turns"

REDO v2 embodiment of the locked Part model. Files: `packages/web/src/components/Am1ConversationTwoPane.tsx` + `.stories.tsx` (filename retained to avoid churn; the design is single-column now).

> **Dropped per founder feedback.** The v1 "Two-Pane / embeds open to the side" is gone. The founder rejected all three v1 variants as *"too busy, too misaligned, not structured enough."* A second region (the right contextual panel) reads as busy; the t3code reference is single-column. B is now a **single calm reading column** — structure comes from soft, borderless turn blocks + whitespace, not chrome.

## User workpackage
The founder reads and steers a deliberate thread with their agents, deciding *"do I follow this, and do I approve the proposed change?"* They scan turn-by-turn down one calm column, glance at restrained embeds (a diff, a plan, a session), and deliver a verdict — without a busy second pane pulling focus.

## Restraint taken from the reference (`Screenshot …22.15.49.png`)
1. **Narrow centered column (~720px)** with generous left/right margins and vertical rhythm. It breathes; it does not fill the width.
2. **Near-zero per-message chrome.** No avatar, no role badge, no per-line timestamp. Sender named **once per turn**, quietly (`--text-secondary`, 12px).
3. **One restrained embed treatment.** A subtle `--surface-elevated` block, modest padding, aligned to the column's left edge — used identically for the diff, the referenced block, and the session reference. No heavy bordered/shadowed cards.
4. **Structure from soft blocks + whitespace,** not borders/shadows/accent-rails/badges. Agent turns carry a faint `--surface-container` tint; the founder's turns sit untinted — that contrast alone groups the conversation.
5. **Quiet section labels for agent work.** `RESPONSE · WORKED FOR 1M 12S` in `--text-tertiary` + `--tracking-caps` + optional "Show" — the Fold device, not a heavy fold card.
6. **One alignment grid.** Every turn, embed, and the composer share one centered 720px column and one left edge. No ragged insets.
7. **One clean composer** at the bottom: a rounded `--r-default` elevated input, generous padding, subtle shadow that deepens on focus. No model/effort pills (those are the AM3 dial-in).

## Component composition (production reuse mapping)
Hand-rolled here for render reliability; each slot maps to a catalogued component the builder wires in green:

| Slot (this file) | Production component | Notes |
|---|---|---|
| `Turn` (sender named once + body, borderless soft-tint block) | `CommentRow` (`packages/design-system`) | The Part renderer for `plain`/`verdict`. Sender-grouped; drop avatar/timestamp chrome to match the calm reading. |
| `Prose` | `CommentRow` body slot | 15px / 1.6 line-height body. |
| `WorkFold` (uppercase work-label + Show/Hide) | generalized Fold device (NEW small) | Lift `RichMessageCard`'s reasoning fold to any Part. UI-local state, never persisted. Marks the agent work-turn and the review reasoning. |
| `Embed` (one `--surface-elevated` aligned card) | `ArtifactEmbed` / `BlockRefEmbed` + session-reference Embed (NEW small) | ONE treatment, three contents. `onOpen` opens the target off-column (diff detail, the plan, the AM3 dial-in). |
| `DiffLine` (`auth/passkey.ts · +124 −18`) | compact diff Embed (NEW small) → `kinds/code-renderer` | Compact `+N/−M` stat; opens fuller detail elsewhere, never a wall. |
| `BlockRefLine` (title + one line) | `BlockRefEmbed` → `Block` + `renderPayload` | Referenced knowledge item as one calm line. |
| `SessionRefLine` (`Session · Atlas · Opus 4.8 · $0.42 · 14 tool calls`) | session-reference Embed (NEW small) | Composes `Avatar`+`KeyValue` shapes into one line; opens the dial-in. **Never** an inlined work-log. |
| `ReviewPart` (uppercase label + title + folded reasoning + verdict bar) | `RichMessageCard` | `state.phase` idle/saving/error; `resolved` echo; `verdictDecisionLabel`/`verdictDecisionToStatus`. |
| `VerdictButton` (Approve / Request changes / Reject) | `Button` (verdict variants) | The universal verdict set, calm. |
| `VerdictEcho` (founder's resolution line) | `CommentRow` (`verdict` payload) | Resolution echo in the column. |
| `Composer` | `Composer` (`packages/design-system`) | textarea + Cmd/Enter. No model/effort pills. |

No NEW component beyond the concept-mandated set (Fold generalization, session-reference Embed, compact diff Embed). The contextual panel and reference-chip from v1 are **removed**.

## Information hierarchy (numbered)
1. **The thread heading** — `Task · Passkey login`. Quiet eyebrow + 20px title; orients without chrome.
2. **The turns, top-to-bottom** — the conversation is the page. Tint groups agent turns; whitespace separates.
3. **The pending decision** — the review's title + verdict bar carries the heaviest type weight in the column (15px semibold), drawing the eye to the action.
4. **Embeds** — present but recessive (`--surface-elevated`, smaller type); scannable, never shouting.
5. **Folded detail** — agent work prose + review reasoning collapse by default; the column stays short and scannable until the reader opts in.

## Behavior
- **Hover.** Interactive embeds lift their trailing arrow from 60% → 100% opacity and shift background `--surface-elevated` → `--surface-container` (`--motion-fast`). Turn blocks do not react to hover (calm).
- **Focus.** Every interactive element (embeds, verdict buttons, fold toggles, composer) shows a 2px `--accent-primary` focus ring. Tab order follows reading order top-to-bottom.
- **Keyboard.** Embeds and verdict buttons are real `<button>`s (Enter/Space). Fold toggles carry `aria-expanded`. Composer sends on Cmd/Enter (production `Composer`).
- **Fold.** `WorkFold` is collapsed by default; "Show"/"Hide" toggles UI-local state. Never persisted; never part of the data model. The collapsed work-label always reads as a calm summary (`Worked for 1m 12s`, `Reasoning · 3 lines`).
- **Embed open.** `onOpen` routes the reader to the target's own surface: the diff to fuller detail, the plan to the knowledge item, the session reference to the AM3 dial-in. Never expands a work-log inline.

## Mobile adaptation
- The 720px column collapses to full-width with `--space-4` (12px) side gutters; turn padding eases to 12px.
- Sender line, embeds, and verdict buttons keep the single left edge; verdict buttons wrap to a row that stays ≥44px touch targets.
- Composer pins to the bottom; textarea font-size ≥16px (AQ-005) to defeat iOS zoom.
- No second pane to reconcile — the single-column design is already the mobile shape, which is the point.

## Signature
**Soft borderless turn-blocks.** Each turn is a generously-padded block with at most a faint `--surface-container` tint and zero border/shadow/rail. The agent's tint vs. the founder's untinted turns is the *only* grouping device — gentle structure that reads cleanly without a single line of chrome. One embed treatment, one left edge, one column.

## Trade-offs vs. siblings
- **vs. A "Quiet prose"** (no containers, purely typographic): B adds the soft tint blocks. Cost — a faint surface fill per agent turn; benefit — clearer turn boundaries and faster scanning when a thread runs long, without resorting to borders.
- **vs. C "Editorial"** (full-bleed embeds, larger body type): B keeps embeds compact and recessive. Cost — the diff/plan don't render in full inline; benefit — the column stays short and the *decision* stays the focal point, not the artifact.
- **Cost of the tint.** A reader who dislikes any fill will find A calmer; B bets that one faint tint buys enough structure to be worth it. Concretely: one `background` token per agent turn, zero added DOM, zero new component.
- **Dropped the side panel.** Removes a whole region, its tab bar, its open/close state, and the column↔panel sync — the v1 busyness the founder rejected. The full diff/plan/session now lives on its own surface, reached via the embed's `onOpen`.
