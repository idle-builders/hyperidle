---
paths:
  - "packages/web/**/*.tsx"
  - "packages/web/**/*.ts"
---

# Frontend Rules

- **Reuse first** (`.claude/rules/reuse-first.md`): the design-system components catalogued in `packages/design-system/DESIGN.md` (live at `/designsystem`, inventory = `packages/design-system/src/index.ts`) are the FIRST choice for any UI element — check there before writing anything. Reach for DaisyUI classes directly only for primitives the design system deliberately doesn't own — and never wrap DaisyUI in thin one-line components. Hand-rolling an equivalent of an existing design-system component is a defect.
- Tailwind utility classes with Hearth theme tokens. Use Hearth spacing tokens (`--space-*`) for all padding. Card padding: `--space-6` (18px). Small element padding: `--space-4` (12px). Component padding uses the 6px grid: `{3, 6, 9, 12, 18, 24, 36, 48}` px.
- Handle all states: empty, loading, error, populated.
- API endpoints in `packages/server/src/routes/`. RESTful naming. Consistent error response format.
- Hono routes follow the project's established patterns — read existing routes before writing new ones.
- Every custom component must have a `.stories.tsx` file next to it rendering key states at `/designsystem`.
- Avoid the AI Aesthetic: no arbitrary purple/indigo palettes, no excessive gradients, no `rounded-3xl` or arbitrary large radii beyond the Hearth 4-value scale, no `p-8`/`p-12` oversized padding, no stock 3-column card grids, no hero sections, no decorative icons on every element. Note: `rounded-2xl` (16px) IS the Hearth default card radius — do not avoid it. HyperIdle uses the Hearth design system — warm earth tones, forest green accent, system-ui fonts. Dense, purposeful, distinctive.
