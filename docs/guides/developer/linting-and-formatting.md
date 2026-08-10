# Linting & Formatting

Lint/typecheck commands: detailed reference is [commands.md](commands.md). Note `npm run check` runs a fan-out gate (`tools/repo-gates/src/typecheck-gate.ts`), not bare `tsc`.

## What `npm run lint` actually runs

Four steps, in order, all must pass:

```
biome check . --reporter=summary
npx eslint . --quiet
npx tsx tools/governance/src/governance-lint.ts --fixtures
npx tsx tools/governance/src/governance-lint.ts
```

There are no domain guard scripts in the chain. The governance lint replaced them.

Individual legs: `npm run lint:biome`, `npm run lint:eslint`, `npm run lint:governance`, `npm run lint:governance:fixtures`. `npm run lint:design` runs just the design rules over `layers/core-ui/src/**/*.tsx` and `framework/design-system/src/**/*.tsx`. `npm run lint:fix` is `biome check --write .`.

## Biome + ESLint split

**Biome** is the primary linter/formatter — tabs, 100-char line width (`biome.json`). **ESLint** covers what Biome can't:

- React Hooks rules (`react-hooks/rules-of-hooks`, `react-hooks/exhaustive-deps`) and React Compiler safety (`react-compiler/react-compiler`)
- Drizzle ORM safety on `framework/db/src/**` and `layers/core-api/src/**`: `drizzle/enforce-delete-with-where` and `drizzle/enforce-update-with-where` with `drizzleObjectName: "db"`
- The repo's own rule plugins, `tools/eslint-plugin-design` and `tools/eslint-plugin-authz`

`eslint . --quiet` **discards warnings entirely.** A rule set to `warn` in `eslint.config.ts` enforces nothing in the gate. Set a rule to `error` or accept that it is advisory only.

## Architectural governance lint

`tools/governance/src/governance-lint.ts` is the architectural boundary gate: what may cross which boundary in this repo, and why. It runs twice in `npm run lint` — first `--fixtures`, which self-tests the detectors against a synthetic tree, then against the live tree.

**The rules themselves are documented in [`tools/governance/README.md`](../../../tools/governance/README.md), and that file forbids restating any of them anywhere else** — a second copy drifts from the enforced one and then agents follow the wrong copy. Read it there.

What is useful to know here is the shape:

- **One census, many rules.** One pass builds the connection graph and classifies every tracked file; each rule in `tools/governance/src/rules/` is a declarative predicate over it. No rule does its own file discovery — `tools/governance/src/governance-lint.ts` is the only file in the stack allowed to touch the filesystem or spawn a process.
- **Every file must classify**, and **a rule matching zero files fails loudly** (`DeadRuleError`). Both exist because the previous guard set contained scripts that scanned a directory deleted two tracks earlier and printed PASS.
- **One severity per rule: `error`, unconditionally.** There is no severity dial and no severity file — a new rule lands with its violations already fixed in the same pull request.
- **Warnings print one line per site**, never aggregated — the next thing that happens after a rule lands at warn is a work package that clears it, and that work package needs the sites. `--errors-only` gives you the gate without the debt.
- `npm run governance:new-cells` lists the verdicts the model produced for combinations nobody was explicitly asked about, grouped by the clause that produced them, so they can be challenged rather than discovered later.

### Production vs development files

The governance lint classifies every file as production or development, and enforces one crossing rule: **a production file may never import a development file.** One direction, no exceptions.

A file is **development** if its name declares it (`.stories.tsx`, `.test.ts(x)`, `.spec.ts(x)`), or a path segment starts with `__` (`__tests__/`, `__e2e__/`, `__preview__/`, `__testing__/`, `__fixtures__/`), or it belongs to a wholly-development package. Otherwise it is production.

Two mechanisms, both deliberate: a file whose **name** declares it development is development wherever it sits, and a folder whose **name** declares it development makes everything inside it development. The suffix clauses are checked before the `__` clause. That is why a `.stories.tsx` may sit beside its component — the story is the design artifact under the TSX-first rule — without the component's directory becoming development.

Enforced by `tools/governance/src/rules/no-production-imports-development.ts`, with `tools/governance/src/rules/classification-total.ts` making an unclassified file a build error and `tools/governance/src/rules/pattern-live.ts` failing any clause that matches zero files.

## eslint-plugin-design

`tools/eslint-plugin-design` houses the repo's design-system enforcement rules, registered in `eslint.config.ts` and run via `npm run lint:eslint` (or `npm run lint:design` for just the UI surface). They cover token scales (color, spacing, radius, font size, tracking, duration), page anatomy, mock-data policy, and a set of AI-aesthetic tells. Rules are at **error** across `framework/design-system/src/**` and mostly at **warn** across `layers/core-ui/src/**`.

Two rules enforce the page-anatomy standard:

**`design/no-handrolled-page-header`** — error on `layers/core-ui/src/pages/**/*.tsx`. Flags the literal class combination `text-[20px]` + `font-[600]` + `tracking-[-0.01em]` on any JSX element that is not `PageHeader`. `SettingsPage.tsx` and `SetupFlow.tsx` are exempted via block `ignores` pending their own migrations. Pages with an editable title `<input>` compose `pageTitleClassName` (from `@hyperidle/design-system`) as an identifier reference — compliant, because the rule inspects only string literals.

**`design/no-undefined-font-heading`** — error on `layers/core-ui/src/pages/**/*.tsx`, warn on the rest of `layers/core-ui/src/**`. Flags two things: `font-heading` (an undefined Tailwind utility that silently does nothing) and `tracking-wider` inside `pages/**` (Tailwind's 0.05em default is off the Hearth caps scale — use `SectionLabel`, which applies `tracking-[var(--tracking-caps-sm)]` = 0.06em).

The mock-data rules (`design/no-mock-data-import`, `design/no-mock-data-symbol`) are documented in the [mock-data policy](mock-data-policy.md).
