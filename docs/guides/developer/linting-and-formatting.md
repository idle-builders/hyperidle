## Linting & Formatting

```bash
bun run lint                     # biome + eslint (read-only)
bun run lint:biome               # biome only
bun run lint:eslint              # eslint only
bun run lint:fix                 # biome auto-fix
bun run check                    # TypeScript type checking
```

**Biome** is the primary linter/formatter (tabs, 100-char line width). **ESLint** covers gaps: React Compiler safety, React Hooks rules, and Drizzle ORM safety (`enforce-delete-with-where`, `enforce-update-with-where`).

### CI Gate

All three checks must pass before merging to `main`:

```bash
bun run check   # zero type errors
bun run lint    # zero lint errors
bun run test    # all tests green
```

Branch protection on `main` requires the CI status check to pass.
