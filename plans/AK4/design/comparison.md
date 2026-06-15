# AK4 — Design comparison

DESIGN-CLASS: routine → one variant ("Draft card in thread") + a rejected-directions list (see `brief.md`). No multi-variant board: the spec names existing components and a live shipped pattern (assistant reply + embedded ref card), and the concept forbids the alternative shapes (new dialect, draft mode, approval modal, second runtime) at the concept level — they are not legal variants, they are concept violations.

| Dimension | "Draft card in thread" |
|---|---|
| Signature (one tell) | The draft bet is a first-class `BetCard` *inside* the conversation timeline — not a modal, not a pane. |
| Component count | **0 new.** `BetCard` + existing `ToolCallRow` + existing embed slot + existing `WorkBet`/`BodyEditor`. |
| Density | High — glanceable card (goal + status + budget + excerpt) in the message column; full body lives one click away in WorkBet. |
| Primary action surface | The card itself (click → WorkBet to edit/commit); conversational composer for iteration. |
| State strategy | Distinct shapes per state: text-only reply (pre-draft), reply+row+card (drafted), reply+edit-row+updated-card (iterated), notice cards (error). One canonical card for the populated case. |
| Motion budget | Zero new — reuses the overlay's existing message-append render. |
| Best at | Component-budget cost (zero), single-timeline cleanliness, no second editor, honest never-silent states. |
| Worst at | No in-overlay hand-editing (deliberate — click-through to AG3); historical cards accumulate in a long iteration chain. |
| Self-critique score | 9/10 (see below) |

## Self-critique (9-dim rubric, abbreviated for routine)
- **Anti-slop:** 10 — no AI-aesthetic tells; reuses warm-toned BetCard, no gradients/hero/3-col grid.
- **Hierarchy:** 9 — reply text first, card second, tool-row as tertiary signal. Clear eye path.
- **States:** 9 — empty/populated/iterated/loading/error all named with copy, including the create_bet-fails-honestly case.
- **Reuse / budget:** 10 — zero new components; the strongest possible budget outcome.
- **Density:** 9 — glanceable card, full content deferred to WorkBet.
- **Interaction grammar:** 9 — single click target, reuses ref-embed navigation; iteration via the composer (the conversation IS the grammar).
- **Motion:** 8 — no new motion; acceptable, nothing to animate beyond message append.
- **Mobile:** 8 — BetCard is responsive; click-through to WorkBet tab. No special-casing needed.
- **Copy:** 9 — "Drafted a bet" / "Updated the draft" terse and honest; error copy explains why no draft.

The single point off: the historical-card accumulation in long chains is a real (if minor) timeline-noise cost. Accepted — the thread is a log and the bet id is stable.
