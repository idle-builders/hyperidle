## Linting & Formatting

```bash
npm run lint                     # biome + eslint (read-only)
npm run lint:biome               # biome only
npm run lint:eslint              # eslint only
npm run lint:fix                 # biome auto-fix
npm run check                    # TypeScript type checking
```

**Biome** is the primary linter/formatter (tabs, 100-char line width). **ESLint** covers gaps: React Compiler safety, React Hooks rules, and Drizzle ORM safety (`enforce-delete-with-where`, `enforce-update-with-where`).

### Domain-specific static gates

Beyond the general linter, some workpackages add committed scripts that enforce invariants the linter cannot catch (e.g. DaisyUI alias classes that pass the arbitrary-value regex but are still forbidden in certain contexts).

| Script | `npm run` command | What it guards |
|---|---|---|
| `scripts/ag7-no-divergent-classes.ts` | `check:ag7-consistency` (chained into `lint`) | Settings files must use design-system primitives only — no raw DaisyUI control classes, no off-grid spacing aliases, no DaisyUI color aliases. See [`docs/ui-design/settings-consistency.md`](../../ui-design/settings-consistency.md). |

These scripts exit non-zero and print `file:line  matched-token` on violation. They run as part of `npm run lint`.

### CI Gate

All three checks must pass before merging to `main`:

```bash
npm run check   # zero type errors
npm run lint    # zero lint errors
npm run test    # all tests green
```

Branch protection on `main` requires the CI status check to pass.
