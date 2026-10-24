# Design System

The UI lives in `layers/core-ui/src/`: plain React + CSS, no utility framework, no component library. Design decisions live in `plans/design-restart/` (`information-architecture.md`, `journey-map.md`, `cutover-plan.md`); the studio on branch `design/studio-recovery` is the visual reference.

## Token contract

- **Source of truth:** `layers/core-ui/src/tokens.css` — the only file allowed to contain raw colour literals.
- Skin: Paper only (`data-skin="paper"` on `<html>`). Two modes: `data-mode="light"` and `data-mode="dark"`.
- Every `var(--name)` a file references must be defined in `tokens.css` or locally in the same CSS file. A dangling token is silent breakage — CRITICAL.
- `npm run lint:design-css` runs the gate; `npm run lint` includes it.

## Adding UI

- Styles go in the component's own CSS block or in `app.css`. Never add raw colour literals outside `tokens.css`.
- No Tailwind, no DaisyUI, no CSS-in-JS.
- No made-up data in production code. Screens read the backend through `call` / `useAction`; the demo world (`tools/setup/src/demo-world`) holds the story.
