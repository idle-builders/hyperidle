---
name: visual-polish
description: "Iteratively improve a component/page's visual fidelity against its reference story using the live TSX viewer and golden baseline comparison."
argument-hint: "<component-name|all>"
user-invocable: true
min_tool_calls: 18
---

# Visual Polish

Iterative visual fidelity improvement loop. Compare the live implementation against the TSX story in the viewer, identify differences, fix them, and re-compare until the design matches.

## Prerequisites

- Dev server running on `localhost:5173` (`npm run dev` from repo root) for app-level polish
- Design system viewer running on `localhost:8098` (`npm run ds:serve`) for component-level polish
- Playwright installed (`npx playwright install chromium`)
- Reference: the approved design at `plans/<workpackage-id>/design/approved.md`

## Workflow

### 1. Open the story

For design-system components:

```bash
npm run ds:serve
# open http://localhost:8098/#<ComponentName>
```

For app-level pages: use `http://localhost:5173/<route>`.

### 2. Capture a screenshot and evaluate

```bash
npx playwright screenshot "http://localhost:8098/#<ComponentName>" /tmp/polish-<name>.png --wait-for-timeout=2000
```

Read the PNG. Look at pixels, not code. Identify:
- **Layout differences** — element positions, flex/grid structure, spacing
- **Color differences** — wrong tokens, missing dark theme colors, contrast
- **Typography** — wrong font, size, weight, letter-spacing
- **Missing elements** — icons, badges, indicators not implemented
- **Extra elements** — implementation has things the reference doesn't

Reference the approved design (`plans/<workpackage-id>/design/approved.md`) for design intent when differences are ambiguous.

### 3. Run the visual regression gate

```bash
npm run ds:sync
```

This diffs the live TSX story against committed golden PNG baselines at ≤5%. If the gate fails, the component has drifted from the last blessed state.

### 4. Fix

Make targeted CSS/component changes. One concern per iteration:
1. Layout structure first (flex, grid, widths, positions)
2. Colors and backgrounds second
3. Typography third
4. Spacing and padding fourth
5. Details last (borders, shadows, icons, badges)

### 5. Re-compare

Re-run the comparison (`npm run ds:sync`). Check if the diff improved. If it regressed, revert the last change.

### 6. Convergence

Stop when:
- `npm run ds:sync` passes AND no critical visual differences in visual assessment
- OR 8 iterations reached (cap to prevent context rot)
- OR remaining differences are due to dynamic content (timestamps, counts, avatars)

After an intentional visual change, re-bless the baseline:

```bash
npm run ds:bless  # on Linux/CI for canonical baselines — see .claude/rules/visual-regression.md
```

## Thresholds

| Score | Status | Action |
|-------|--------|--------|
| Gate passes | Excellent | Done — commit + re-bless if intentional change |
| Gate fails <5 components | Needs work | Continue iterating |
| Gate fails many | Major | Layout/structural issues to fix |

## Important Rules

- **Never raise the 5% threshold** — fix the component or re-bless deliberately
- **Fix structure before details** — a wrong layout with perfect colors is worse than right layout with slightly off colors
- **Check the approved design first** — when story and reference disagree, the approved design at `plans/<workpackage-id>/design/approved.md` is the source of truth
- **One change at a time** — so you can attribute regression to specific modifications
- **Disable animations** — add freeze CSS before screenshot so no animation-dependent layout shifts

## Output

After polishing, report:
- Starting state (gate pass/fail, which components diffed)
- Final state (gate passes)
- Number of iterations
- Key changes made (file:line summary)
- Remaining known differences (if any) and why they're acceptable

## Target

$ARGUMENTS
