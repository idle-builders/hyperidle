DESIGN-CLASS: routine  ref=BetCard,TaskCard,PitchCard,KeyValue,Rail  pattern=none

# L17 Design Brief -- Cost + Tokens wired into Work

## Classification rationale

All six affected surfaces already exist with established layouts. The change is a data-type transformation (string cost/appetite values become structured Money + optional TokenUsage), not a layout transformation. Every surface that shows cost today will show the same data in a structured format. No new components, no new interaction patterns, no new pages.

## The user task

The founder scans the Rail to see factory cost posture; drills into a bet to see spend-vs-cap on both Money and Token axes; scans task rows to see per-task cost. The decision they are making: "is this bet/task/factory spending within bounds, and is the token consumption aligned with the model tier I expect?"

## What changes

1. **Rail Cost section** -- Currently 4 string KeyValues. Becomes structured Money values with optional token summary.
2. **BetCard appetite KeyValue** -- Currently "2 weeks" string. Becomes "$500" (Money cap).
3. **BetCard in Bet detail header** -- Needs spend-vs-cap display on Money axis, optional tokens.
4. **TaskCard cost KeyValue** -- Currently string. Becomes formatted Money.
5. **PitchCard appetite KeyValue** -- Currently string. Becomes "$500" or "--" when uncapped.
6. **WorkProduct burn section** -- Currently number cents. Becomes formatted Money.

## Key constraint

Tokens are a SECONDARY axis. Money is ALWAYS shown. TokenUsage is shown on surfaces where the user cares about complexity: bet detail (expanded view) and potentially the Rail. BetCard/TaskCard/PitchCard in list contexts show Money only -- showing both axes on every card would violate density-first (Principle D3: progressive disclosure).

## Components used (all existing)

- KeyValue (Tier 1) -- the universal label+value primitive. All cost displays use it.
- BetCard (Tier 2) -- appetite KeyValue slot already exists.
- TaskCard (Tier 2) -- cost KeyValue slot already exists.
- PitchCard (Tier 2) -- appetite KeyValue slot already exists.
- Rail (Tier 3) -- CostInfo section with KeyValue rows.
- No new components needed. Component budget: 0 new.
