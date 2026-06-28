# Visual Regression

TSX is the single design source of truth (AJ1) — each component has exactly one `.tsx`; the `.stories.tsx` story IS the design artifact.

## How visual regression is caught

Visual fidelity is gated by:

1. **Human concept review** — the primary visual gate. For a high-stakes change (`DESIGN-CLASS: novel` or `DOC-CLASS: significant`) the founder opens the chosen variant rendered live in the skill's viewer and annotates it element-by-element; the planner revises the real TSX until approved. See `/pipeline:human-concept-review`.
2. **Token guard** — `npm run token-guard:check` guards token definitions against off-scale / off-grid / re-mapping drift.
3. **Lint** — `npm run lint` (`eslint-plugin-design`) catches off-scale spacing, non-token colors, and AI-aesthetic tells.
4. **Type check** — `npm run check` catches removed / renamed component variants.
5. **Manual paint check** — `npx playwright screenshot http://localhost:<port>/<route>` of the running app in `/pipeline:review` and `/product-deep-review`, then read the PNG.

## Non-negotiable

- Every custom component still has a `.stories.tsx` — the story is the design artifact the human review renders.
- Never claim a UI change is done without looking at the painted output (the human-review render, or a screenshot of the running app). Reading source is not a visual check.
