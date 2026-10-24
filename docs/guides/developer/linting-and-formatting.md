# Linting & Formatting

Lint/typecheck commands: detailed reference is [commands.md](commands.md). Note `npm run check` runs a fan-out gate (`tools/repo-gates/src/typecheck-gate.ts`), not bare `tsc`.

## What `npm run lint` actually runs

Several steps, in order, all must pass:

```
biome check . --error-on-warnings --max-diagnostics=none
npx eslint . --max-warnings=0
npm run lint:design-css
npx tsx tools/governance/src/governance-lint.ts --fixtures
npx tsx tools/governance/src/governance-lint.ts --attacks
npx tsx tools/governance/src/governance-lint.ts
```

Package boundaries are checked by the governance lint alone; there are no separate guard scripts.

Individual legs: `npm run lint:biome`, `npm run lint:eslint`, `npm run lint:design-css`, `npm run lint:governance`, `npm run lint:governance:fixtures`, `npm run lint:governance:attacks`. `npm run lint:fix` is `biome check --write .`.

## Biome + ESLint split

**Biome** is the primary linter/formatter — tabs, 100-char line width (`biome.json`). **ESLint** covers what Biome can't:

- React Hooks rules (`react-hooks/rules-of-hooks`, `react-hooks/exhaustive-deps`) and React Compiler safety (`react-compiler/react-compiler`) on `layers/core-ui/src/**`
- Drizzle ORM safety on `framework/db/src/**` and `layers/core-api/src/**`: `drizzle/enforce-delete-with-where` and `drizzle/enforce-update-with-where` with `drizzleObjectName: "db"`
- The repo's own rule plugins, `tools/eslint-plugin-design` and `tools/eslint-plugin-authz`
- Playwright rules on every `*.spec.ts`

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

A file is **development** if its name declares it (`.test.ts(x)`, `.spec.ts(x)`), or a path segment starts with `__`, or it belongs to a wholly-development package. Otherwise it is production.

Enforced by `tools/governance/src/rules/no-production-imports-development.ts`.

## Token check (`lint:design-css`)

`tools/repo-gates/src/design-css-gate.ts` checks every CSS and TSX file in `layers/core-ui`. It fails on:

- a raw colour (`#hex`, `rgb()`, `rgba()`, `hsl()`, `hsla()`) outside `layers/core-ui/src/tokens.css`, the one file that holds raw values;
- a `var(--name)` that neither `tokens.css` nor the same file defines.

It also fails when it finds no files to check. The UI is plain CSS — no Tailwind, no DaisyUI, no component library — so this check is the whole styling gate. How tokens and classes are laid out: [interface/ui-design.md](../../interface/ui-design.md).

## eslint-plugin-design

Despite its name, `tools/eslint-plugin-design` holds the repo's own code and test rules, all at **error** (wired in `eslint.config.ts`):

- `design/no-mock-data-import`, `design/no-mock-data-symbol` — on `layers/core-api/src/**`; see the [mock-data policy](mock-data-policy.md)
- `design/no-unknown-cast`, `design/no-ungated-stream-drain`, `design/lore-format` — source files
- `design/no-existence-only-test`, `design/no-repo-introspection-in-test`, `design/no-planning-id-in-test`, `design/no-dom-marker-assert` — tests
