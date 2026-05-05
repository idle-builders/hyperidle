DESIGN-CLASS: routine-low-conf  ref=BetCard.actions  pattern=BlockActionsPopover.html

# Design Brief — L14

## Interrogated brief

**Who and what:** The founder (human) is on the WorkBet detail page and needs to act on a running bet — pause it, kill it, adjust its appetite, or comment to unblock — without accidentally committing a destructive action and without confusion about what the action entails.

**User task in one sentence:** As a founder reviewing a bet, I want to act on it (pause / kill / adjust appetite / unblock) with a clear preview of consequences before any destructive action commits, so I stay in control without doing agent-level work.

**Key question 1: Where do actions live?**
The BetCard already has an `actions?: ReactNode` prop slot. The WorkBet page renders BetCard at the top. This is the natural anchor for action affordances — they travel with the bet identity (title, status, appetite). Alternative: a separate action strip below the BetCard. Decision: **use the BetCard `actions` slot** — avoids inventing a new component and keeps the bet identity and its affordances visually coupled.

**Key question 2: How many actions and at what visual weight?**
Four actions: pause, kill, adjust-appetite, unblock/comment. Kill is destructive (red). Pause is reversible but still disruptive. Adjust-appetite and unblock are non-destructive. The actions are infrequent — this is not a primary use case on every visit. Decision: **secondary weight buttons in the actions slot, with kill as danger-variant**.

**Key question 3: Is the consequence preview a modal or an inline expansion?**
The spec says "non-skippable" — this means the user cannot dismiss it without making a choice (confirm or cancel). A modal (DaisyUI `dialog`) enforces non-skippability cleanly. An inline expansion can be scrolled past. Decision: **DaisyUI `dialog` modal** — the only HTML primitive that correctly implements focus trapping and non-skippability.

**Key question 4: Adjust appetite — inline edit in card or small form in dialog?**
Appetite is a closed 3-value enum ("1 week" / "2 weeks" / "6 weeks"). It's a non-destructive change requiring a reason for the revision log. Decision: **a dialog with a select + reason field** — keeps the pattern consistent with kill (which also requires a reason). Non-destructive, so no consequence preview body, just a confirmation.

**Key question 5: Unblock/comment — new affordance or reuse HostThreadSection?**
L18 provides the HostThreadSection with a Composer at the bottom of WorkBet. The unblock use-case is posting a message to the bet's thread for the agent to read. Decision: **scroll-to and focus the existing HostThreadSection Composer** — no new component needed. The "Unblock" action is a shortcut to the thread, not a separate affordance.

**Primary state:** A running bet (`in_progress`, `behind`, `blocked`). The action bar is visible whenever the bet is in a state that allows any of the four actions.

**Component budget impact:** The ConsequencePreview dialog uses DaisyUI `dialog` (not a custom component). The action bar is a `div` with DaisyUI `btn` elements rendered into the BetCard `actions` slot — zero new components. Net: 0 new custom components.

## State-sensitive action visibility

| Bet status | Pause | Resume | Kill | Adjust appetite | Unblock |
|---|---|---|---|---|---|
| in_progress | yes | no | yes | yes | yes |
| behind | yes | no | yes | yes | yes |
| blocked | yes | no | yes | yes | yes |
| paused | no | yes | yes | yes | yes |
| committed | no | no | yes | no | no |
| shaped | no | no | yes | yes | no |
| review | no | no | yes | no | no |
| shipped | no | no | no | no | no |
| killed | no | no | no | no | no |

## Rejected directions

- **Command palette / keyboard-first invocation:** explicitly rejected by TRACK-L L14 ("no keyboard shortcuts — founder demoted").
- **Inline action row below pitch:** separates the action affordances from the bet identity. The BetCard actions slot keeps them coupled.
- **Custom Confirm/Alert component:** DaisyUI `dialog` is the right primitive for focus trapping. A 20th custom component that wraps a dialog is not justified.
- **Drag-to-kill / swipe-to-pause:** mobile gestures, not a desktop-primary affordance. Rejected.
- **Dropdown menu for all four actions:** collapses the distinction between destructive and non-destructive. Parallel-visible buttons with danger coloring are clearer.
