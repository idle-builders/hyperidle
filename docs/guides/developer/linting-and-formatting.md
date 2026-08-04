# Linting & Formatting

Lint/typecheck commands: detailed reference is [commands.md](commands.md). Note `npm run check` runs a fan-out gate (`scripts/typecheck-gate.ts`), not bare `tsc`.

## Biome + ESLint split

**Biome** is the primary linter/formatter — tabs, 100-char line width (`biome.json`). **ESLint** covers what Biome can't:

- React Hooks rules (`react-hooks/rules-of-hooks`, `react-hooks/exhaustive-deps`) and React Compiler safety (`react-compiler/react-compiler`) — `eslint.config.ts:38-44`
- Drizzle ORM safety on `packages/db` + `packages/server`: `drizzle/enforce-delete-with-where` and `drizzle/enforce-update-with-where` with `drizzleObjectName: "db"` — `eslint.config.ts:58-59`

## Lint-chained guards

`npm run lint` chains a series of domain guard scripts after biome + eslint (`package.json` `lint`) — see the `lint` script for the exact, current chain:

| Script | What it guards |
|---|---|
| `scripts/ag7-no-divergent-classes.ts` (also `npm run check:ag7-consistency`) | Settings files use design-system primitives only — no raw DaisyUI control classes, no off-grid spacing aliases, no DaisyUI color aliases. Exists because eslint-plugin-design only flags *arbitrary-value* utilities (`gap-[16px]`); the divergent *alias* utilities (`gap-4`) pass it. Exits non-zero printing `file:line token`. Subject matter: [settings-consistency](../../ui-design/settings-consistency.md). |
| `scripts/honest-harness-guard.ts --check` | Fails the build when a harness-facing integration test stubs/scripts/mocks the harness it should exercise against the real binary, or gates itself with `skipIf`-on-absent. |
| `scripts/au18-kv-shape-guard.ts` | Guards the AU18 key-value shape invariant. |
| `scripts/table-ownership-guard.ts` | Guards per-table service ownership (reads and writes) — run once against its own fixtures (`--fixtures`), once against the real tree. |
| `scripts/execution-boundary-guard.ts` | Guards the agent-execution boundary — run once against its own fixtures (`--fixtures`), once against the real tree. |
| `scripts/composition-boundary-guard.ts` | Guards the composition-root boundary — run once against its own fixtures (`--fixtures`), once against the real tree. |
| `scripts/composition-edge-anti-regrowth-guard.ts` | Guards against re-adding a forbidden orchestration↔core composition edge (AU21 AC #2) — run once against its own fixtures (`--fixtures`), once against the real tree. |

## eslint-plugin-design — AI7 page-anatomy rules

`packages/eslint-plugin-design` houses custom design-system enforcement rules, registered in `eslint.config.ts` and run via `npm run lint:eslint`. Two rules enforce the page-anatomy standard:

**`design/no-handrolled-page-header`** — error on `packages/web/src/pages/**` (`eslint.config.ts:195-196`; `SettingsPage.tsx` and `SetupFlow.tsx` exempt pending their own migration, `eslint.config.ts:184-185`). Flags the literal class combination `text-[20px]` + `font-[600]` + `tracking-[-0.01em]` on any JSX element that is not `PageHeader`. Pages with an editable title `<input>` compose `pageTitleClassName` (from `@hyperidle/design-system`) as an identifier reference — compliant because the rule inspects only string literals (`rules/no-handrolled-page-header.ts:21-24,64`).

**`design/no-undefined-font-heading`** — error on `packages/web/src/pages/**`, warn on the rest of `packages/web/src/**` (`eslint.config.ts:222`). Flags two things: `font-heading` (an undefined Tailwind utility that silently does nothing) and `tracking-wider` inside `pages/**` (Tailwind's 0.05em default is off the Hearth caps scale — use `SectionLabel`, which applies `tracking-[var(--tracking-caps-sm)]` = 0.06em).
