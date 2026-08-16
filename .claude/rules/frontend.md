---
paths:
  - "layers/core-ui/**/*.tsx"
  - "layers/core-ui/**/*.ts"
---

# Frontend Rules

- Design-system components first (`framework/design-system/src/index.ts` is the live inventory; catalogued in `DESIGN.md`). Use DaisyUI primitives directly only where the design system deliberately doesn't own the shape — never wrap them, never hand-roll an equivalent of an existing component.
- Tailwind utility classes with Hearth theme tokens. Use Hearth spacing tokens (`--space-*`) for all padding. Card padding: `--space-6` (18px). Small element padding: `--space-4` (12px). Component padding uses the 6px grid: `{3, 6, 9, 12, 18, 24, 36, 48}` px.
- Handle all states: empty, loading, error, populated.
- Each layer hosts its own Hono app and owns its routes under `<layer>/src/routes/`. RESTful naming. Consistent error response format.
- Hono routes follow the project's established patterns — read existing routes before writing new ones.
- Every custom component must have a `.stories.tsx` file next to it rendering key states.
- Avoid the AI Aesthetic: no arbitrary purple/indigo palettes, no excessive gradients, no `rounded-3xl` or arbitrary large radii beyond the Hearth 4-value scale, no `p-8`/`p-12` oversized padding, no stock 3-column card grids, no hero sections, no decorative icons on every element. Note: 16px IS the Hearth default card radius — do not avoid it — but spell it `rounded-[var(--r-default)]`, never `rounded-2xl` (AQ-011's one-spelling-per-value rule, AZ7). HyperIdle uses the Crème Lemon token system on the Hearth design system — warm lemon-cream tones, lemon drop fill accent (`--accent-primary`), cocoa text accent (`--accent-deep`), system-ui fonts. No forest green (replaced by CL1). Dense, purposeful, distinctive.
