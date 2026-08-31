# Visual Regression

TSX is the single design source of truth (AJ1) — each component has exactly one `.tsx`; the `.stories.tsx` story IS the design artifact.

## How visual regression is caught

Visual fidelity is gated by:

1. **Founder review of the live render** — the primary visual gate, and the one to place in the plan whenever a change is visually novel or high-exposure. The founder opens the variant rendered live in the design viewer (`skills/design/viewer/launch.mjs`) and annotates it element-by-element; the real TSX is revised until approved.
2. **Design token lint** — `npm run lint:design` (`eslint-plugin-design`) catches off-scale spacing, non-token colors, off-scale font sizes/radii, and AI-aesthetic tells in `layers/core-ui/` and `framework/design-system/`.
3. **Lint** — `npm run lint` runs the full lint suite including the same `eslint-plugin-design` rules across all files.
4. **Type check** — `npm run check` catches removed / renamed component variants.
5. **Manual paint check** — `npx playwright screenshot http://localhost:<port>/<route>` of the running app in `/pipeline:review` and `/product-deep-review`, then read the PNG.

## Non-negotiable

- Every custom component still has a `.stories.tsx` — the story is the design artifact the human review renders.
- Never claim a UI change is done without looking at the painted output (the human-review render, or a screenshot of the running app). Reading source is not a visual check.
