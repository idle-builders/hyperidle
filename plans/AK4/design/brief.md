DESIGN-CLASS: routine  ref=BetCard,BlockRefEmbed,AssistantOverlay-toolCallRows,WorkBet-BodyEditor  pattern=AssistantOverlay+BetCard

# AK4 — Design brief: surface an Assistant-drafted bet

## The user task
A founder talks an idea through with the Assistant in the overlay thread. At the moment the conversation has enough shape, the Assistant authors a **draft bet** and the founder must (a) see that a draft was created, (b) read its goal + body without leaving the conversation, (c) click through to edit/commit it in the normal bet surface, and (d) keep iterating in chat to refine the draft. The decision the founder is making: *is this draft close enough to commit, or does it need another conversational pass / hand-edit?*

## Classification rationale (routine)
- **Existing component reference:** YES — `BetCard` (already renders `draft` status with `--status-info` accent), `BlockRefEmbed` (the embed-card pattern in assistant replies), the `payload.toolCalls` summary rows (AD8b B3.1), `WorkBet` + `BodyEditor` (AG3 authoring), the universal verdict grammar.
- **Pattern match:** YES — assistant reply with an embedded ref card is a live, shipped pattern (`renderRefEmbedsForAssistant`). A draft-bet card is the same pattern with a bet payload.
- Both axes match → **routine**. One variant + a rejected-directions list. Concept (`plans/AK4/concept.md`) forbids a new content dialect, a draft mode, a proposal/approval modal, and a second runtime — those would be concept changes, so they are correctly out of the variant space.

## Reuse inventory (hard gate)
| Visual element needed | Renders via | New? |
|---|---|---|
| "Assistant created/updated a draft" signal in the reply | existing `payload.toolCalls` summary row (`ToolCallRow`) — reuse copy, no new shape | reuse |
| Draft-bet card embedded in the reply (goal + status + open affordance) | **`BetCard`** with `status="draft"`, `title=goal`, `description=body excerpt`, `onClick → navigate to WorkBet` | reuse |
| Embed placement in the assistant message | `renderRefEmbedsForAssistant` slot pattern (the `flex flex-col gap-1 mt-1` container under the bubble) | reuse |
| Click-through to edit/commit | existing `WorkBet` page route + `BodyEditor` (AG3), draft-mutable per `BET_DESCRIPTION_MUTABLE_STATUSES` | reuse |
| Commit gate | existing WorkBet commit affordance (human-only) | reuse |
| Iteration ("draft updated") feedback | second `payload.toolCalls` row reading `edit_bet` + the *same* `BetCard` re-rendered with new content | reuse |

**Zero NEW components.** The whole surface is recombination. This is the strongest possible outcome for the component budget.

## Probes (settled — no open questions worth a round-trip)
- *Where does the founder land first?* The reply bubble text (the substantive answer), then the draft-bet card directly beneath it. The card is the artifact; the text is the rationale. Settled by the AH3 "never silent" invariant + the existing embed-under-bubble pattern.
- *In-thread editing or click-through?* Click-through to WorkBet. Concept hard-rule: no new content dialect / no in-overlay block editor. The overlay shows a read-only card; editing is the AG3 surface. Settled.
- *Most common state?* Populated (a draft exists). Empty = a normal text reply with no card (pre-draft conversation). Settled.
- *How does iteration read?* Same card, updated in place (one draft per conversation, concept cardinality contract). A new `edit_bet` tool-call row signals "I updated the draft." Settled.

## Rejected directions (not regenerated as variants)
- **Inline block editor inside the overlay** — rejected: violates the "no new content dialect / edit in AG3" concept rule; duplicates WorkBet; doubles the editing surface area.
- **A proposal/approval modal that blocks before the draft is created** — rejected: a draft is already reversible; the irreversible gate is commit. A pre-creation modal contradicts concept hard-rule #3 (draft = the review surface) and adds a verdict-message round-trip for a non-irreversible action.
- **A dedicated "draft pane" / split view in the overlay** — rejected: new shape, new component, breaks the single-thread timeline the overlay is built around (AD8b "keep the timeline clean").
- **Full bet body rendered inline as AG3 blocks in the reply** — rejected: the reply card should be a glanceable summary (BetCard), not a second full bet renderer; full blocks live in WorkBet. Keeps the timeline dense.
- **A verdict-message (Approve/Reject) on the draft inside the thread** — rejected for v1: the commit button in WorkBet IS the human gate; a thread verdict would create two commit paths. (Noted as a possible later enhancement, not this WP.)
