# Visual Regression: TSX is the Design Source of Truth

TSX is the single design source of truth. The HTML reference files in `packages/design-system/html/` have been deleted (AJ1). The TSX story is what you read, edit, and compare against.

## Gate

`npm run ds:sync` runs the Playwright visual regression gate. It:
1. Boots the live TSX viewer at `:8098` (via `npm run -w @hyperidle/design-system serve`).
2. Enumerates all catalogued components at runtime from the catalog DOM (auto-covers new stories).
3. Screenshots every `.demo-section` in each component's TSX story.
4. Diffs each screenshot against a committed golden PNG baseline at ≤5% (`maxDiffPixelRatio: 0.05`).
5. Also asserts interactive hover/focus states for 12 INTERACTIVE_COMPONENTS.

## Baseline location

`packages/design-system/src/__tests__/visual-regression.test.ts-snapshots/` — committed to git, NOT gitignored.

## Canonical baseline platform

CI/Linux is the blessing authority. Baselines are Linux-rendered. Local Mac `verify` tolerates the 5% ratio against the Linux baselines. Do NOT commit Mac-rendered PNGs as canonical baselines.

## When to re-bless

Intentional visual change → review the diff in the Playwright HTML report, then re-bless:

```bash
npm run ds:bless
```

This runs `playwright test --config playwright.config.ts --update-snapshots`. For canonical (Linux) baselines, run this in a Linux environment (CI container or `mcr.microsoft.com/playwright:v<version>`). Commit the updated PNGs in the same PR as the component change.

## Non-negotiable rules

- **Never raise the 5% ratio** to make a diff pass. Fix the component or re-bless deliberately on Linux.
- **Never weaken the gate** — the 5% ceiling matches the retired HTML-vs-TSX pixelmatch gate; it is not a weakening.
- The threshold absorbs cross-platform AA/font-rendering jitter (Mac vs Linux). A real restyle moves far more than 5%.

## Wiring

- **Local:** `npm run verify` includes `npm run ds:sync` as a first-class step.
- **CI:** the `Visual regression (TSX baselines)` CI step runs `npm run ds:sync` explicitly after the build step, after installing Playwright chromium.
