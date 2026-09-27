---
paths:
  - "**/*.ts"
  - "**/*.tsx"
---

# TypeScript

## Enforced — a tool stops you

- **Strict mode, no escape hatches.** No `any` (biome `noExplicitAny`, error), no non-null `!`
  (`noNonNullAssertion`, error), no unused imports or variables, `const` over `let`, `import type` /
  `export type` for type-only imports, no parameter reassignment.
- **No `console`** anywhere biome lints (`noConsole`, error). Production code logs through the
  observability adapter.
- **Drizzle for every query**, raw SQL only in migration files. `drizzle/enforce-delete-with-where`
  and `enforce-update-with-where` are errors in `framework/db` and `layers/core-api`.
- **Naming** — camelCase functions and variables, PascalCase types and components,
  SCREAMING_SNAKE_CASE constants (biome `useNamingConvention`). It is wired at `error`: biome fails
  the build on it.
- **Types must be clean.** `npm run check` typechecks every package it discovers by scanning, against
  `typecheck-debt.json`. That file is currently empty — no package is allowed to have a type error,
  and a stale entry fails the gate rather than being ignored.
- **What may import what is not decided here.** Cross-package imports use the workspace name
  (`@hyperidle/<package>`), never a relative path into another package — but whether the crossing is
  allowed at all is governance's call. `npm run lint` is the source of truth;
  `tools/governance/README.md` is the written account. Never infer a boundary from the code around
  you: an existing import may be a violation nobody has caught yet.

## Convention — nothing checks these, so they are on you

- Explicit return types on exported functions.
- No barrel files except a package's own `src/index.ts`.
- File name matches its primary export.
- Result types for expected errors. Let unexpected errors propagate — no swallowing in a try/catch.
- Run `ls layers/ layers/*/ framework/ applications/ tools/` for the live package set. Never work from
  a remembered list, and never hardcode a package path in a script, guard or config — discover by
  scanning, and hard-fail when the scan finds nothing.

## No fabricated content in production code

Not as a fallback, not as a placeholder, not as a convenience. A shipping code path may never invent a
value it does not have — no hardcoded sample rows served from a route, no
`if (!isValid(payload)) return SAMPLE` substitution, no invented names, amounts or vendors standing in
for real ones. **Prefilling a database with demo rows is fine** — that is data, and the demo world is
the place for it. The line is code versus data: seed rows freely, fabricate in code never. When a real
value is missing, say so in the interface — an honest empty state, an explicit "no preview available",
a fallback that renders nothing invented. A fabricated fallback is worse than a blank one, because to
the person reading it, it is indistinguishable from the truth.

## Verify framework APIs against source

When using Hono, Drizzle, React or another framework's API, check the pattern against that project's
own current docs rather than recalling it. Flag anything you could not verify with `⚠️ UNVERIFIED` and
cite the doc URL for non-obvious usage.
