## Coding Conventions

- **TypeScript strict** — no `any`, no `@ts-ignore`, no unsafe `as` casts
- **Explicit return types** on all exported functions
- **camelCase** for variables/functions, **PascalCase** for types/components, **SCREAMING_SNAKE_CASE** for constants
- **No `console.log`** in production code — use the observability adapter
- **All DB queries through Drizzle** — never raw SQL except in migrations
- **Result types** for expected errors; let unexpected errors propagate

See `.claude/rules/` for detailed conventions on TypeScript, frontend, design system, and database patterns.
