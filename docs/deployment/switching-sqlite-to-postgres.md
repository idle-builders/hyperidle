## Switching SQLite → Postgres

**Status (H4): partially ready.** The Postgres adapter, migrations, and
pool configuration are in place. The Drizzle schema is driver-agnostic:
the Postgres schema at `packages/db/src/schema.pg.ts` mirrors the SQLite
schema table-for-table (pinned by the `pg-schema.test.ts` parity test).
The pg migrations apply cleanly on pglite (`pg-migration.test.ts`) and a
real cluster (operator smoke via `DATABASE_URL`).

**Known constraint — follow-up required before production PG.**
`drizzle-orm/postgres-js` is async-only (no `.run()`/`.get()`/`.all()`
terminal methods), while `@hyperidle/server` today uses the synchronous
better-sqlite3 query API across 800+ call sites. Flipping `DATABASE_URL`
to a Postgres URL on the current server will crash at the first query.
Before a production Postgres deployment, a follow-up story must:

1. Migrate the 800+ `.run()` / `.get()` / `.all()` server call sites to
   `await` on the Drizzle builder directly.
2. Convert the SQLite `seed()` function to a dialect-agnostic async form
   (or duplicate it onto `schema.pg.ts`).
3. Re-run `bun run test:pg` with a real `DATABASE_URL` and confirm a
   full-suite pass.

The `packages/db/src/__tests__/pg-call-site-audit.test.ts` test records
the current synchronous-call-site count so regressions are visible.

Until that work lands, `HYPERIDLE_PROFILE=laptop` (SQLite) remains the
supported production-grade default; `vps` and `cloud` run the Postgres
driver against the DB layer only (migrations + `db:seed:pg` smoke seed).
