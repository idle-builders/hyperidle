DESIGN-CLASS: routine  ref=WorkBet,WorkTask,WorkPortfolio  pattern=BetCard.html

# AC1 Design Brief -- Structured Outcome Fields

## User task

A founder reviewing completed work wants to see at a glance whether bets validated their hypotheses, whether tasks met their done conditions, and how effective sessions were -- then filter the portfolio by these verdicts.

## What the user is deciding

1. On bet detail: "Did my hypothesis hold? Let me record the outcome."
2. On task detail: "Was the done condition actually met?"
3. On portfolio: "Show me only the refuted bets so I can see where predictions failed."

## Smallest UI surface that delivers

Three additions to existing pages:
1. **WorkBet.tsx** -- An "Outcome" section (after stat cards, before pitch) showing bet outcome verdict badge + summary + "Record outcome" action
2. **WorkTask.tsx** -- An "Outcome" cell in the existing meta-strip showing task outcome verdict
3. **WorkPortfolio.tsx** -- A verdict filter added to the existing status filter row

Plus secondary visibility:
4. **WorkBet.tsx task rows** -- Task outcome verdict badge inline on each task row
5. **WorkTask.tsx sessions** -- Effectiveness score shown on each session row

## Primary state analysis

- **Most common state:** "Not evaluated" (null). Most entities will not have outcomes recorded immediately. The UI must NOT draw attention to the absence -- it should be quiet (tertiary text "Not evaluated") not alarming (red badge "Missing!").
- **Populated state:** Less common but the high-value state. When an outcome IS set, it should be clearly visible and scannable.
- **Error state:** Not applicable (outcome fields are simple reads/writes, no complex failure modes).

## Existing component composition

| Surface | Existing pattern | Outcome addition |
|---|---|---|
| Bet detail stat cards row | Three stat cards (Progress, Budget, Team) | No new stat card -- outcome is a separate section below stat cards |
| Bet detail sections | Section title + content pattern (Pitch, Tasks, Artifacts, Discussion) | New "Outcome" section between stat cards and Pitch |
| Task meta-strip | Bordered cell grid (Owner, Status, Started, Cost, Sessions) | New "Outcome" cell in the meta-strip |
| Task row in bet detail | Title + meta line + status badge | Outcome verdict badge added inline |
| Portfolio status filter | Tab-bar-pill segmented control (All, Active, Completed, Draft) | New "Verdict" filter group (separate from status filter) |
| Session row | Title + agent + cost + status | Effectiveness score after cost, before status |

## Rejected directions considered

1. **Outcome as a modal/dialog flow** -- Rejected. Recording a verdict is a single dropdown + optional text field. A modal adds ceremony for a 2-second interaction. Inline editing (click badge to change) or a small inline form matches the bet description editor pattern.

2. **Outcome as a new stat card** -- Rejected. Adding a fourth stat card to the bet detail row would work visually but conflates a categorical verdict (validated/refuted) with numeric metrics (progress %, budget $). Outcome is qualitative judgment, not a number. A dedicated section with the verdict badge + summary text communicates the right thing.

3. **Outcome embedded in existing sections** -- Rejected (for bets). Putting the bet verdict inside the Pitch section or the Discussion section hides it. The whole point is that outcome is a first-class structured signal, not buried in prose. For tasks, embedding in the meta-strip IS correct because the meta-strip is already the task's key-value display.

4. **Separate "Outcomes" page** -- Rejected. AC1 is about fields on existing entities, not a new view. The portfolio filter handles the "query across bets" use case. A dedicated outcomes page would be premature (AC7 adds portfolio metrics later).

5. **Color-coded verdict badges matching status colors** -- Rejected. Verdicts are not statuses. A "refuted" hypothesis is not an error -- it's a valid learning. Using red for "refuted" would make the portfolio look like something is broken. All verdict badges use the default neutral badge style (surface-container background, text-secondary text) to avoid false status signaling. The text content differentiates them, not color.
