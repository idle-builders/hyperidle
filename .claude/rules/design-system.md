# Design System

The UI lives in `layers/core-ui/src/`. It is a plain React + CSS design preview — no utility framework, no component library.

## Token contract

- **Source of truth:** `layers/core-ui/src/tokens.css` — the only file allowed to contain raw colour literals.
- Skin: Paper only (`data-skin="paper"` on `<html>`). Two modes: `data-mode="light"` and `data-mode="dark"`.
- Every `var(--name)` a file references must be defined in `tokens.css` or locally in the same CSS file. A dangling token is silent breakage — CRITICAL.
- `npm run lint:design-css` runs the gate; `npm run lint` includes it.

## Adding UI

- Styles go in the component's own CSS block or in `app.css`. Never add raw colour literals outside `tokens.css`.
- No Tailwind, no DaisyUI, no CSS-in-JS.
- Keep demo data (handoff.ts, judge-data.ts, teams.ts) in the source tree — this is a static preview app, not a production route handler.
