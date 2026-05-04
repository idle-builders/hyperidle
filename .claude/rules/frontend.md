---
paths:
  - "packages/web/**/*.tsx"
  - "packages/web/**/*.ts"
---

# Frontend Rules

- Only the 19 custom components catalogued in `packages/design-system/DESIGN.md` (and rendered live at `/designsystem`). Use DaisyUI primitives directly — never wrap them.
- Tailwind utility classes with Lucid theme tokens. 8-12px padding default.
- Handle all states: empty, loading, error, populated.
- API endpoints in `packages/server/src/routes/`. RESTful naming. Consistent error response format.
- Hono routes follow the project's established patterns — read existing routes before writing new ones.
- Every custom component must have a `.stories.tsx` file next to it rendering key states at `/designsystem`.
- Avoid the AI Aesthetic: no arbitrary purple/indigo palettes, no excessive gradients, no `rounded-2xl` everywhere, no `p-8`/`p-12` oversized padding, no stock 3-column card grids, no hero sections, no decorative icons on every element. HyperIdle uses the Lucid design system — precision instrument aesthetic with monochrome status signals and red-only danger indicators. Dense, purposeful, distinctive.
