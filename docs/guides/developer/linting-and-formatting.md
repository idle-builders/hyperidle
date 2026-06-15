## Linting & Formatting

```bash
npm run lint                     # biome + eslint (read-only)
npm run lint:biome               # biome only
npm run lint:eslint              # eslint only
npm run lint:fix                 # biome auto-fix
npm run check                    # TypeScript type checking
```

**Biome** is the primary linter/formatter (tabs, 100-char line width). **ESLint** covers gaps: React Compiler safety, React Hooks rules, and Drizzle ORM safety (`enforce-delete-with-where`, `enforce-update-with-where`).

### CI Gate

All three checks must pass before merging to `main`:

```bash
npm run check   # zero type errors
npm run lint    # zero lint errors
npm run test    # all tests green
```

Branch protection on `main` requires the CI status check to pass.

### eslint-plugin-design — UI gates

`packages/eslint-plugin-design` houses custom design-system enforcement rules. They are registered in `eslint.config.ts` and run as part of `npm run lint:eslint`.

Two rules enforce the page-anatomy standard (AI7):

**`design/no-handrolled-page-header`** — Error on `packages/web/src/pages/**` (SettingsPage.tsx and SetupFlow.tsx are exempt, pending their own migration). Flags the literal class combination `text-[20px]` + `font-[600]` + `tracking-[-0.01em]` on any JSX element that is not `PageHeader`. Pages with an editable title `<input>` must compose `pageTitleClassName` (imported from `@hyperidle/design-system`) as a className reference — that is compliant because the rule inspects only string literals, not identifier expressions.

**`design/no-undefined-font-heading`** — Error on `packages/web/src/pages/**`, warn on the rest of `packages/web/src/**`. Flags two things: `font-heading` (an undefined Tailwind utility that silently does nothing) and `tracking-wider` inside `pages/**` (Tailwind's 0.05em default is off the Hearth caps scale — use `SectionLabel` which applies `tracking-[var(--tracking-caps-sm)]` = 0.06em).
