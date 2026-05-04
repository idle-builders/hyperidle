## Laptop

Single-machine development. SQLite file, local workspace adapter, no
external services.

**Prerequisites**
- Bun ≥ 1.1
- Node 20+ (for Playwright binaries)

**Setup**
```
bun install
bun run setup --profile laptop
bun dev
```

The setup command:
1. Creates `./hyperidle.db` (configurable via `--db-path`).
2. Runs the SQLite migrations from `packages/db/drizzle/`.
3. Seeds initial data (products, agents, routines).
4. Prints a ready banner. `bun dev` then starts server + web.

**Verification**
```
bun run test
```
