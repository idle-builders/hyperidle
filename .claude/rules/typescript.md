---
paths:
  - "**/*.ts"
  - "**/*.tsx"
---

# TypeScript Rules

- Strict mode everywhere. No `any`, no `@ts-ignore`, no unsafe `as` casts.
- Explicit return types on all exported functions.
- Use workspace imports: `@hyperidle/db`, `@hyperidle/server`, `@hyperidle/shared`, etc.
- No barrel files except a package's own `src/index.ts`.
- camelCase for variables/functions, PascalCase for types/components, SCREAMING_SNAKE_CASE for constants.
- File names match their primary export.
- Use result types for expected errors. Let unexpected errors propagate — no swallowing with try-catch.
- No `console.log` in production code. Use the observability adapter.
- All database queries through Drizzle ORM. Never raw SQL except in migration files.
- Source-driven development: when using framework APIs (Hono, Drizzle, React, BullMQ), verify patterns against official docs — don't rely on training data. Flag unverified patterns with `⚠️ UNVERIFIED`. Cite doc URLs for non-obvious usage.
