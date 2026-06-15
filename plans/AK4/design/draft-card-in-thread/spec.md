# Variant — "Draft card in thread" (the only variant; routine class)

**User task.** A founder converses with the Assistant; when a draft bet is authored, a glanceable draft-bet card appears beneath the reply, click-through to WorkBet to edit/commit, and the same card updates in place as the founder iterates in chat.

## Component composition
- **Reply bubble** — existing assistant `plain` message bubble (`AssistantOverlay`). Carries the substantive text answer (AC1).
- **Tool-call summary row** — existing `ToolCallRow` (`payload.toolCalls`), one per `create_bet`/`edit_bet` call. Copy: `create_bet → "Drafted a bet"`, `edit_bet → "Updated the draft"`. This is the *signal* a structured action happened.
- **Draft-bet card** — `BetCard` from the design system, rendered in the existing `renderRefEmbedsForAssistant` slot (the `flex flex-col gap-1 mt-1` container under the bubble). Props: `title` = bet goal (first line / `description` heading), `status="draft"` (renders `--status-info` accent + progress fill), `description` = body excerpt (first ~140 chars of `description`), `onClick` = navigate to `/work/bets/:id` (WorkBet). No new component.
- **WorkBet** — existing page, unchanged. The draft is mutable (`BET_DESCRIPTION_MUTABLE_STATUSES` includes `draft`), edited via `BodyEditor` (AG3 blocks), committed via the existing human-only commit affordance.

## Information hierarchy (the assistant message, top to bottom)
1. **Reply text** — the Assistant's substantive answer / what it shaped and why (primary; this is where the eye lands).
2. **Tool-call row** — "Drafted a bet" / "Updated the draft" (tertiary, tinted, 13px, the existing row style).
3. **Draft-bet card** — `BetCard`, status badge `DRAFT`, goal as title, body excerpt, budget badge if appetite set (secondary; the actionable artifact). Whole card is the click target → WorkBet.

## States
- **Empty (pre-draft):** ordinary text reply, no tool-call row, no card. The conversation is still shaping. Copy: normal Assistant prose.
- **Populated (draft created):** reply text + one `create_bet` row + one `BetCard(status="draft")`.
- **Iterated (draft updated):** a *new* assistant message with reply text + one `edit_bet` row + the *same* `BetCard` re-rendered with updated title/excerpt. The earlier card (in the prior message) remains in history showing the prior state — the thread is a log; the latest message carries the current card. (One draft, one bet id, updated in place server-side; the timeline shows the progression.)
- **Loading:** existing "Thinking…" indicator (AH3 §1.7b) while the turn runs — unchanged. A drafting turn may take longer (tool-use loop); the same indicator covers it.
- **Error:** existing notice cards (`missing_key` / `missing_harness` / `provider_error`). If `create_bet` fails (e.g. no team), the turn still replies; the reply text explains it couldn't draft (e.g. "I couldn't create the draft — you don't have a team yet."). No card. Honest, never silent.
- **Overflow:** long goal → `BetCard` title truncates (its existing behavior); body excerpt is capped at ~140 chars with ellipsis.

## Behavior
- **Hover** on the draft-bet card: existing `BetCard` hover (cursor pointer, `--shadow-default` lift) when `onClick` set.
- **Focus / keyboard:** card is a button-role click target (BetCard already wires `clickableProps`); Enter/Space activates → navigate to WorkBet. Tab order: reply text is static, card is the focusable element in the message.
- **Click:** navigate to WorkBet for that bet id (closes/keeps overlay per existing navigation pattern — reuse whatever ref-embed click does today; BlockRefEmbed already navigates).
- **Transitions:** the card appears with the message via the existing message-append render — no bespoke motion. Reuse the overlay's existing append behavior (`--motion-default` if any; default is fine, no new motion budget).

## Mobile adaptation
The Assistant overlay is already a mobile-aware surface (one of the three tabs hosts the assistant entry). `BetCard` is full-width responsive; in the overlay it renders at the message column width on mobile, same as `BlockRefEmbed`. Click-through navigates to the WorkBet tab. No special-casing.

## Signature
**The draft is a first-class card in the conversation, not a modal or a separate pane.** The thread stays a single timeline; the bet appears *in* the conversation, glanceable, one tap from the AG3 editor. The Assistant's reasoning (text) and its artifact (card) sit together in one message.

## Trade-offs (what this variant is bad at)
- You can't edit the bet *without leaving* the overlay — editing is always a click-through to WorkBet. (Deliberate: concept rule, avoids a second editor. The mitigation is that *conversational* iteration — "make the appetite 2 weeks" — updates the draft without leaving chat; hand-editing is the click-through.)
- A long iteration chain leaves multiple historical cards in the timeline (one per drafting message). Acceptable: the thread is a log; only the latest reflects current state, and the bet id is stable so there's no ambiguity about which bet.
