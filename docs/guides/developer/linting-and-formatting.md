# Linting & Formatting

Lint/typecheck commands: detailed reference is [commands.md](commands.md). Note `npm run check` runs a fan-out gate (`tools/repo-gates/src/typecheck-gate.ts`), not bare `tsc`.

## What `npm run lint` actually runs

Several steps, in order, all must pass:

```
biome check . --error-on-warnings --max-diagnostics=none
npx eslint . --max-warnings=0
npm run lint:design-css
npm run lint:design-profiles
npx tsx tools/governance/src/governance-lint.ts --fixtures
npx tsx tools/governance/src/governance-lint.ts --attacks
npx tsx tools/governance/src/governance-lint.ts
```

There are no domain guard scripts in the chain. The governance lint replaced them.

Individual legs: `npm run lint:biome`, `npm run lint:eslint`, `npm run lint:governance`, `npm run lint:governance:fixtures`, `npm run lint:governance:attacks`, `npm run lint:design-css`, `npm run lint:design-profiles`. `npm run lint:fix` is `biome check --write .`.

## Biome + ESLint split

**Biome** is the primary linter/formatter — tabs, 100-char line width (`biome.json`). **ESLint** covers what Biome can't:

- React Hooks rules (`react-hooks/rules-of-hooks`, `react-hooks/exhaustive-deps`) and React Compiler safety (`react-compiler/react-compiler`)
- Drizzle ORM safety on `framework/db/src/**` and `layers/core-api/*/src/**`: `drizzle/enforce-delete-with-where` and `drizzle/enforce-update-with-where` with `drizzleObjectName: "db"`
- The repo's own rule plugins, `tools/eslint-plugin-design` and `tools/eslint-plugin-authz`

`eslint . --max-warnings=0` **prints every warning and fails on any of them.** Every rule is `error` or `off` — none are left at `warn`.

## Architectural governance lint

`tools/governance/src/governance-lint.ts` is the architectural boundary gate. It runs three times in `npm run lint` — `--fixtures` (self-tests the detectors against a synthetic tree), `--attacks` (break-tests every rule against the live tree), then against the live tree for real.

**The rules themselves are documented in [`tools/governance/README.md`](../../../tools/governance/README.md)** — do not restate them here.

What is useful to know here:

- **One census, many rules.** One pass builds the connection graph; each rule in `tools/governance/src/rules/` is a declarative predicate over it.
- **Every file must classify**, and **a rule matching zero files fails loudly** (`DeadRuleError`).
- **One severity, `error`, unconditionally** — a new rule lands with its violations already fixed in the same PR.

### Production vs development files

The governance lint classifies every file as production or development, and enforces one crossing rule: **a production file may never import a development file.** One direction, no exceptions.

A file is **development** if its name declares it (`.stories.tsx`, `.test.ts(x)`, `.spec.ts(x)`), or a path segment starts with `__`, or it belongs to a wholly-development package. Otherwise it is production.

Enforced by `tools/governance/src/rules/no-production-imports-development.ts`.

## eslint-plugin-design

`tools/eslint-plugin-design` houses the repo's design-system enforcement rules. They cover token scales (color, spacing, radius, font size, tracking, duration), page anatomy, mock-data policy, and a set of AI-aesthetic tells. Rules are at **error** across `framework/design-system/src/**` and `layers/core-ui/src/**`.

Two rules enforce the page-anatomy standard:

**`design/no-handrolled-page-header`** — error on `layers/core-ui/src/pages/**/*.tsx`. Flags the literal class combination `text-[20px]` + `font-[600]` + `tracking-[-0.01em]` on any JSX element that is not `PageHeader`. `SettingsPage.tsx` and `SetupFlow.tsx` are exempted via block `ignores` pending their own migrations. Pages with an editable title `<input>` compose `pageTitleClassName` (exported from `layers/core-ui/src/ds/PageHeader.tsx`) as an identifier reference — compliant, because the rule inspects only string literals.

**`design/no-undefined-font-heading`** — error across `layers/core-ui/src/**`. Flags two things: `font-heading` (an undefined Tailwind utility that silently does nothing) and `tracking-wider` inside `pages/**` (Tailwind's 0.05em default is off the Hearth caps scale — use `SectionLabel`, which applies `tracking-[var(--tracking-caps-sm)]` = 0.06em).

The mock-data rules (`design/no-mock-data-import`, `design/no-mock-data-symbol`) are documented in the [mock-data policy](mock-data-policy.md).
