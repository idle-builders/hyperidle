## Useful Commands Reference

| Command | Purpose |
|---------|---------|
| `npm install` | Install dependencies |
| `npm run dev` | Start dev server with hot reload (API + frontend) |
| `npm run build` | Build frontend for production |
| `npm run start` | Start production server (serves built frontend + API) |
| `npm run setup` | Initialize database |
| `npm run test` | Run all tests |
| `npm run test:coverage` | Tests with coverage |
| `npm run test:e2e:ah6` | AH6 real-interaction lane (key-free, offline — replays committed cassettes) |
| `npm run smoke:ah6` | AH6 live refresh — re-records cassettes against a real OpenRouter model (requires `OPENROUTER_API_KEY`, local only) |
| `npm run check` | TypeScript type check — per-package fan-out gate (see `typecheck-debt.json` for the quarantine list) |
| `npm run lint` | Biome + ESLint |
| `npm run lint:fix` | Auto-fix lint issues |
| `npm run db:generate` | Generate migration from schema changes |
| `npm run db:migrate` | Apply SQLite migrations |
| `npm run db:migrate:pg` | Apply PostgreSQL migrations |
| `bin/service install` | Install and start as macOS background service |
| `bin/service stop/start` | Stop or start the background service |
| `bin/service logs` | Tail the server log |
