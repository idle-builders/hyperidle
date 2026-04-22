---
name: visual-polish
description: "Iteratively improve a component/page's visual fidelity against its reference mockup using pixel comparison and Claude vision evaluation."
argument-hint: "<reference-name|all>"
user-invocable: true
---

# Visual Polish

Iterative visual fidelity improvement loop. Compare the live implementation against reference mockups, identify differences, fix them, and re-compare until the design matches.

## Prerequisites

- Dev server running on `localhost:5173` (`bun dev` from repo root)
- Playwright installed (`cd packages/web && bunx playwright install chromium`)
- Reference mockups in `docs/design-references/`

## Workflow

### 1. Capture & Compare

```bash
cd packages/web && bun run visual:compare <reference-name>
```

This produces in `packages/web/visual-reports/<name>/`:
- `reference.png` — screenshot of the reference HTML mockup
- `implementation.png` — screenshot of the live app
- `diff.png` — pixel diff (magenta = differences)
- `report.json` — structured metrics (matchPercent, diffPixels, totalPixels)

### 2. Evaluate

Read ALL three images. Look at pixels, not code. Identify:
- **Layout differences** — element positions, flex/grid structure, spacing
- **Color differences** — wrong tokens, missing dark theme colors, contrast
- **Typography** — wrong font, size, weight, letter-spacing
- **Missing elements** — icons, badges, indicators not implemented
- **Extra elements** — implementation has things the reference doesn't

Reference the design synthesis docs (`docs/concept/design-synthesis/`) for design intent when differences are ambiguous.

### 3. Fix

Make targeted CSS/component changes. One concern per iteration:
1. Layout structure first (flex, grid, widths, positions)
2. Colors and backgrounds second
3. Typography third
4. Spacing and padding fourth
5. Details last (borders, shadows, icons, badges)

### 4. Re-compare

Run the comparison again. Check if matchPercent improved. If it regressed, revert the last change.

### 5. Convergence

Stop when:
- `matchPercent >= 90%` AND no critical visual differences in Claude vision assessment
- OR 8 iterations reached (cap to prevent context rot)
- OR remaining differences are due to dynamic content (timestamps, counts, avatars)

## Thresholds

| Score | Status | Action |
|-------|--------|--------|
| ≥ 95% | Excellent | Done — commit |
| 90-95% | Good | Review remaining diffs — likely acceptable |
| 80-90% | Needs work | Continue iterating |
| < 80% | Poor | Major layout/structural issues to fix |

## Important Rules

- **Never chase 100%** — dynamic content, font rendering, and anti-aliasing make perfect matches impossible
- **Fix structure before details** — a wrong layout with perfect colors is worse than right layout with slightly off colors
- **Check the design synthesis first** — when reference and implementation disagree on a design decision, the synthesis docs (`docs/concept/design-synthesis/`) are the source of truth
- **One change at a time** — so you can attribute score changes to specific modifications
- **Disable animations** — the comparison script already injects freeze CSS, but verify no animation-dependent layout shifts

## Reference Mapping

The full mapping lives in `packages/web/scripts/visual-compare-map.ts`. Each reference maps to a route + optional setup function.

## Output

After polishing, report:
- Starting fidelity score
- Final fidelity score
- Number of iterations
- Key changes made (file:line summary)
- Remaining known differences (if any) and why they're acceptable
