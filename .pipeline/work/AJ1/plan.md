# AJ1 — One design source

Shipped. TSX stories are the single design source; `layers/core-ui/src/ds/__tests__/design-source.test.ts`
holds the invariant.

## How we work on this

Visual regression here is deliberately not pixel-based. Playwright `toHaveScreenshot` against
committed golden PNGs was built and reverted (PR #287, reverted by #298): Linux-canonical baselines
make `npm run verify` permanently red on macOS through sub-pixel antialiasing rounding, and the only
way out is Docker, which `verify` must never require. Its replacement, a vitest DOM/className
text-snapshot net, was also later removed. Do not reintroduce either without reopening the
constraint.

`getComputedStyle` under jsdom is a dead end for the same job: it applies no cascade and does no
layout, so Tailwind classes read back empty — a false green, not a weak signal.
