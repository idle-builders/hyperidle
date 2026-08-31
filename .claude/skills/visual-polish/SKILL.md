---
name: visual-polish
description: "Iteratively improve a component/page's visual fidelity against its reference story using the live TSX viewer and snapshot net."
argument-hint: "<component-name|all>"
user-invocable: true
min_tool_calls: 18
---

# Visual Polish

Iterative visual fidelity improvement loop. Compare the live implementation against the TSX story in the viewer, identify differences, fix them, and re-compare until the design matches.

## Prerequisites

- Dev server running on `localhost:5173` (`npm run dev` from repo root) for app-level polish
- Design system viewer running on `localhost:8098` (`npm run ds:serve`) for component-level polish
- Reference: the approved design in `.pipeline/work/<id>/plan.md`

## Workflow

### 1. Open the story

For design-system components:

```bash
npm run ds:serve
# open http://localhost:8098/#<ComponentName>
```

For app-level pages: use `http://localhost:5173/<route>`.

### 2. Evaluate visually

Navigate to `http://localhost:8098/#<ComponentName>` in the browser or via agent visual assessment of the live viewer. Look at pixels, not code. Identify:
- **Layout differences** — element positions, flex/grid structure, spacing
- **Color differences** — wrong tokens, missing dark theme colors, contrast
- **Typography** — wrong font, size, weight, letter-spacing
- **Missing elements** — icons, badges, indicators not implemented
- **Extra elements** — implementation has things the reference doesn't

Reference the approved design in `.pipeline/work/<id>/plan.md` for design intent when differences are ambiguous.

### 3. Check the snapshot net

```bash
npm run test -- catalog-snapshot
```

The vitest snapshot net flags structural/class drift (DOM elements, className composition, data-ds-* markers, aria attrs). If it fails, the component has changed from the last blessed state — review the text diff to understand what changed.

For *painted-pixel* comparison (colors, spacing, layout rendered): use the live TSX viewer (`npm run ds:serve` → `http://localhost:8098/#<ComponentName>`) and inspect visually in the browser or via agent visual assessment. The snapshot net does not check painted pixels (jsdom does not lay out or apply the cascade — that is the accepted trade for zero-Docker verify; see `.claude/rules/visual-regression.md`).

### 4. Fix

Make targeted CSS/component changes. One concern per iteration:
1. Layout structure first (flex, grid, widths, positions)
2. Colors and backgrounds second
3. Typography third
4. Spacing and padding fourth
5. Details last (borders, shadows, icons, badges)

### 5. Re-compare

Open (or refresh) `http://localhost:8098/#<ComponentName>` in the live viewer. Check if the visual diff improved. If it regressed, revert the last change.

### 6. Convergence

Stop when:
- Snapshot net passes (`npm run test -- catalog-snapshot`) AND no critical visual differences in visual assessment
- OR 8 iterations reached (cap to prevent context rot)
- OR remaining differences are due to dynamic content (timestamps, counts, avatars)

After an intentional visual change, re-bless the snapshot baseline:

```bash
npm run ds:bless  # or: npx vitest run -u — see .claude/rules/visual-regression.md
```

Commit the updated `.snap` in the same PR as the component change. Read the diff before committing — never blind re-bless.

## Thresholds

| Score | Status | Action |
|-------|--------|--------|
| Snapshot net passes + visual match | Excellent | Done — commit + re-bless if intentional change |
| Snapshot net fails <5 variants | Needs work | Continue iterating |
| Snapshot net fails many | Major | Layout/structural issues to fix |

## Important Rules

- **Never blind re-bless** — always read the `.snap` diff before running `vitest -u`. Blind re-bless degrades the net to noise.
- **Fix structure before details** — a wrong layout with perfect colors is worse than right layout with slightly off colors
- **Check the approved design first** — when story and reference disagree, the approved design in `.pipeline/work/<id>/plan.md` is the source of truth
- **One change at a time** — so you can attribute regression to specific modifications

## Output

After polishing, report:
- Starting state (snapshot net pass/fail, which variants diffed; visual assessment)
- Final state (snapshot net passes)
- Number of iterations
- Key changes made (file:line summary)
- Remaining known differences (if any) and why they're acceptable

## Target

$ARGUMENTS
