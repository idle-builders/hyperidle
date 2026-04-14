---
paths:
  - "packages/web/**/*.tsx"
  - "packages/web/**/*.ts"
---

# Frontend Rules

- Only the 19 custom components from `UI_DESIGN.md`. Use DaisyUI primitives directly — never wrap them.
- Tailwind utility classes with factory-dark theme tokens. 8-12px padding default.
- Handle all states: empty, loading, error, populated.
- API endpoints in `packages/server/src/routes/`. RESTful naming. Consistent error response format.
- Hono routes follow the project's established patterns — read existing routes before writing new ones.
