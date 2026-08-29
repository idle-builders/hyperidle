---
paths:
  - "**/*.ts"
  - "**/*.tsx"
---

# TypeScript Rules

- Strict mode everywhere. No `any`, no `@ts-ignore`, no unsafe `as` casts.
- Explicit return types on all exported functions.
- Use workspace imports (`@hyperidle/<package>`), never a relative path into another package. Run `ls layers/ layers/*/ framework/ applications/ tools/` for the live set — never work from a remembered list.
- No barrel files except a package's own `src/index.ts`.
- camelCase for variables/functions, PascalCase for types/components, SCREAMING_SNAKE_CASE for constants.
- File names match their primary export.
- Use result types for expected errors. Let unexpected errors propagate — no swallowing with try-catch.
- No `console.log` in production code. Use the observability adapter.
- **No demo, fixture or fabricated content in production code.** Not as a fallback, not as a placeholder, not as a convenience. A shipping code path may never invent a value it does not have — no hardcoded sample rows served from a route, no `if (!isValid(payload)) return SAMPLE` substitution, no invented names, amounts or vendors standing in for real ones. **Prefilling a database with demo rows is fine** — that is data, and the demo world is the place for it. The line is code versus data: seed rows freely, fabricate in code never. When a real value is missing, say so in the interface — an honest empty state, an explicit "no preview available", an unknown-shape fallback that renders nothing invented. A fabricated fallback is worse than a blank one, because it is indistinguishable from the truth to the person reading it.
- All database queries through Drizzle ORM. Never raw SQL except in migration files.
- Source-driven development: when using framework APIs (Hono, Drizzle, React, BullMQ), verify patterns against official docs — don't rely on training data. Flag unverified patterns with `⚠️ UNVERIFIED`. Cite doc URLs for non-obvious usage.
