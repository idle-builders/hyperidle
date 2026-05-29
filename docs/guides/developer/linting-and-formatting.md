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
