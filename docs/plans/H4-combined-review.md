# H4 — Combined Adversary Review

Scope: H4 worktree. Read-only review covering simplification, slop, and adversary attack on the AC claims.

---

## Simplification

### Over-abstraction / duplication

- **`setup-cli.ts:107–139` `applyLaptopMigrations`** — The Bun branch and the Node branch are near-duplicates; the only real delta is the driver import and `exec` vs `pragma`. The runtime fork exists because of one known Bun/Node quirk but the entire body (open → pragma/exec → drizzle → migrate → seed → close) is copy-pasted. This doubles the surface area the tests don't cover (the test harness only exercises the Node path — the Bun branch is completely unproven). Extract a single `openSqliteDb(path)` shim that each branch returns; share the rest.
- **`seed-pg-cli.ts` vs `seed.ts`** — Two seed implementations now exist: the real one in `seed.ts` (SQLite, ~30 rows across ~12 tables with G1/G4 metadata) and a three-row "smoke seed" in `seed-pg-cli.ts` that inserts a product and a single factory setting. They drift silently, directly contradicting AC4 ("config change, no code changes"). Either make `seed.ts` accept a driver-abstract Drizzle handle and reuse it, or delete `seed-pg-cli.ts` and point operators at `db:migrate:pg`-only bring-up until the server actually uses PG.
- **`pg-test-runner.ts`** — 46 lines of process glue for what is effectively `exit 0 unless DATABASE_URL`. The `spawnSync("vitest", ...)` path is never exercised (no test, no CI evidence it works); the no-op branch is. Collapse into a one-line npm script with `|| true`, or delete the "test:pg" script entirely until a real Postgres runner exists.
- **`redact(url)` duplicated** — Same 3-line regex appears in `setup-cli.ts:201` and `pg-test-runner.ts:41`. Not critical, but both will rot independently. Move to `@hyperidle/shared`.
- **`createPgDb` itself is dead code** — exported from `@hyperidle/db`, not imported by `@hyperidle/server`, `@hyperidle/fabric`, or `@hyperidle/web`. Only the CLI seed script uses it. A full factory + pool + close lifecycle for a feature no caller actually exercises. The whole pg-connection module is currently speculative infrastructure.

### Naming

- `PgDbHandle.client` is "exposed for pool introspection in tests" but no test in H4 introspects the pool; rename to `_client` or drop the comment.
- `runPgMigrations` is exposed on `PgTestDbHandle` solely so one test can call it twice for idempotency. That's a test-only hook leaking into the production type. Move to a test-utility function.

---

## Slop

### Banner comments / decorative headers

- `profiles.ts:1–9`, `pg-connection.ts:1–8`, `pg-test-utils.ts:1–10`, `pg-test-runner.ts:1–15`, `seed-pg-cli.ts:1–14`, `setup-cli.ts:1–9` — every H4 file opens with a 5-10 line "H4: …" banner. Some carry real lore; most restate what the filename says. Strip the filler, keep only the `@lore` bits that explain non-obvious decisions (the Bun/Node fork, pglite-for-tests, postgres pool.max location are legit lore; the "H4 AC3:" header is not).
- Section banners inside `schema.pg.ts` (`// --- Core tables ---`, `// --- Messaging ---`, …) mirror `schema.ts` — justified only because the file is a mirror; otherwise decorative.

### Tautological / low-value test names

- `pg-connection.test.ts:6` — `"exposes a documented default pool size of 10"` asserts `DEFAULT_PG_POOL_SIZE === 10`. That's testing a literal; it proves nothing about whether `postgres(url, { max })` actually honors it. The real test (does `createPgDb({ url, maxConnections: 3 })` produce a client whose pool is size 3?) is missing.
- `pg-connection.test.ts:10` — `"parsePgPoolSize returns default when undefined"` is the function definition restated.
- `profiles.test.ts:26` — `"each profile has server and web port defaults"` iterates over the hard-coded `DEFAULT_PORTS` constant; the same constant backs both the test and the implementation.
- `deployment-docs.test.ts:16` — asserts headings exist. Tests the existence of `## Laptop` etc. without proving any of the commands underneath work.
- `docker-compose.test.ts:15–21` — `"docker-compose.yml exists at repo root"` then `"parses as valid YAML"` then `"defines the three required services"` — three tests where one (parse + shape) would do. The file-exists check is redundant with the parse check.

### Dead / unused code

- `HYPERIDLE_DB_DRIVER=postgres` set by `pg-test-runner.ts:35` — **not read anywhere**. Grep confirms zero readers. It's cargo-cult env-mutation with no effect.
- `PG_POOL_SIZE` env var set by `docker-compose.yml:41` and documented in `DEPLOYMENT.md:98,130` — **not read anywhere**. Nothing in the H4 code path threads it into `createPgDb`. Operators who raise it will be surprised to find it does nothing.
- `pg-connection.ts:27` `PgDbHandle.client` exposed for tests that don't use it.
- `seed-pg-cli.ts` entire file — currently unreachable from any spec'd user flow (AC1 = laptop; AC2 = "print instructions"; AC3 = pglite + optional real-PG runner; AC4/5 = config; AC6 = docs). The one test that references it is a docs grep.

### Numbered-step narration in stdout

- `setup-cli.ts:174–177` prints `"1. Copy .env.example → .env …", "2. Run: docker compose up -d", "3. Run migrations: …", "4. Seed: …"` — this is a README baked into the CLI. If the steps ever change, docs and CLI drift. Print one-liner pointing to `docs/DEPLOYMENT.md § VPS` instead.

### Defensive try/catch

- `seed-pg-cli.ts:26–47` — wraps `insert/insert/insert` in try/finally only to call `close()`. The CLI exits the process on return, so the `close()` is cosmetic. Keep it or drop the try/finally; don't pretend it's defensive.
- `setup-cli.ts:262–265` — `main().catch(err => process.stderr.write(…))` swallows the stack trace and exits 2. For a CLI that runs migrations, the full trace is the single most useful artifact on failure. Let it propagate.

---

## Adversary

### CRITICAL

- **AC4 is false.** "Switching SQLite → Postgres is a config change (no code changes)" is contradicted by the codebase: every server call site (`packages/server/src/routes/bets.ts`, `tasks.ts`, `skill-tools/*`, `services/policy-engine.ts`, etc., 175+ occurrences across 20 files) uses `.run()`, `.get()`, `.all()` — the **synchronous** better-sqlite3 query API. `drizzle-orm/postgres-js` is **async-only**: there is no `.get()`/`.run()`/`.all()` terminal; you must `await` the Drizzle builder. Flipping `DATABASE_URL` to postgres will explode at runtime on the first route. The pg-schema parity test proves only that column NAMES match. It proves NOTHING about the query API surface. This is a production-breaking lie in the docs.
- **AC5 is false in practice.** `DEFAULT_PG_POOL_SIZE = 10` exists as a constant and `parsePgPoolSize` is tested, but (a) `PG_POOL_SIZE` env var is set by docker-compose yet **never read by any code** (grep confirms zero readers); (b) no server code path calls `createPgDb` at all. "Pool size 10 default honored" is only asserted by a test that reads the constant back. The real `postgres(url, { max })` call is not verified to receive the resolved value — the pg-connection test never constructs a real connection and asserts pool size.
- **AC3 is overstated.** "All tests pass against PostgreSQL (or gracefully skip)" — the `test:pg` runner `spawnSync("vitest", …)` path is never exercised in sandbox (DATABASE_URL is unset), and when exercised it sets `HYPERIDLE_DB_DRIVER=postgres` which nothing reads. The default `bun run test` uses `createTestDb()` → better-sqlite3. The only PG exercise is the two-test pglite migration suite, which proves migrations *apply* but not that the server *works* on PG. The claim is "gracefully skips" which is technically true, but the "real-Postgres smoke run" is not a skip; it's a no-op that pretends to be a run.
- **`docker-compose.yml:40` environment leak via default.** `DATABASE_URL: ${DATABASE_URL:-postgres://hyperidle:hyperidle@postgres:5432/hyperidle}` hard-codes the default user/password `hyperidle:hyperidle` and **ignores** `${POSTGRES_USER}` / `${POSTGRES_PASSWORD}` from the same compose file. An operator who follows the doc and only sets `POSTGRES_PASSWORD` will create a DB with password X but the server will connect with password `hyperidle` and fail. Either template the URL from `POSTGRES_USER/POSTGRES_PASSWORD` or drop the default entirely and require operators to set it.

### WARNINGS

- **`docker-compose.yml:22–23` — Postgres port 5432 published to host.** `ports: "5432:5432"` on a VPS deployment exposes the DB to the public internet if the host firewall doesn't block it. This is the classic Docker footgun. Should be `expose: ["5432"]` (intra-compose-network only) unless an explicit `--with-external-pg` flag is set.
- **`docker-compose.yml:44,57` — server + web bind to 0.0.0.0 in VPS mode.** Same footgun; dev-mode Vite on 5173 with `--host 0.0.0.0` on a public VPS serves the entire frontend unauthenticated. At minimum, the VPS profile should front these with nginx + auth (H1 already ships an API key middleware; web should be gated too).
- **`setup-cli.ts:129` — `new BetterSqlite(dbPath)` with no validation.** `--db-path` accepts any path. No traversal check, no writability check, no "don't clobber an existing non-sqlite file" check. `bun run setup --profile laptop --db-path /etc/passwd` will at minimum attempt to open that file as a SQLite DB (and fail loudly, but still — the CLI could validate up front). The `mkdirSync(parent, recursive: true)` on line 154 will even create directories without consent. Add a minimal check: reject absolute paths outside `cwd`, or at least reject paths containing `..` and require an explicit `--force` to overwrite an existing non-SQLite file.
- **Migration idempotency is claimed but only tested on pglite.** `pg-migration.test.ts:45` runs migrations twice on an in-memory DB. The SQLite path (`applyLaptopMigrations`) has no "run twice" test. Run `bun run setup --profile laptop` on an existing DB that has *already been seeded*: seeds use `onConflictDoNothing` (good), but the migrator itself on better-sqlite3 will re-read `_journal.json` and skip applied migrations — this works, but it's not asserted. Add a "run setup twice in a row, DB still valid" test to lock it.
- **`redact(url)` is incomplete.** `/(:)([^:@/]+)(@)/` only redacts the password. A URL with the password encoded in the query string (`?password=…`) or placed after `@` (bare host `h:5432/db?password=…`) is not redacted. The pg connect string shape Drizzle/`postgres` accepts is broader than the regex. Either lean on `new URL()` and rewrite `.password`, or accept that this is best-effort and document it.
- **`setup-cli.ts:252–255` entrypoint detection is fragile.** `import.meta?.url === \`file://${bunRuntime.main}\`` — on Windows Bun the URL scheme is `file:///C:/...` with triple-slash; on some Bun versions `Bun.main` is a relative path. The whole `import.meta.main` idiom is supported on Bun natively (`import.meta.main`). Using it avoids the string reconstruction.
- **`seed-pg-cli.ts` exits 0 on success but 2 on catch, 1 on missing URL.** Three exit codes for two error conditions. `setup-cli.ts` also uses 2 for uncaught, 1 for expected. This is inconsistent across the two CLIs that ship in the same package and is undocumented.
- **`pg-test-utils.ts:33` — `__dirname` in an ES module.** Works under tsx/Bun because of the `"type": "module"` + CJS interop, but if the package is ever built to strict ESM this breaks. Use `new URL("../drizzle-pg", import.meta.url)`.
- **`setup-cli.ts:119` — `seed(db as unknown as Parameters<typeof seed>[0])`** — this is a double cast through `unknown`, exactly the TypeScript hole the rules prohibit (`.claude/rules/typescript.md`: "no unsafe `as` casts"). The Bun driver really does produce a type-compatible Drizzle instance for the SQLite schema; fix the type of `seed` to accept `BetterSqlite3Database<T> | BunSQLiteDatabase<T>` (both are Drizzle `SQLiteAsyncDatabase`/`SQLiteSyncDatabase` variants) instead of casting.

### OBSERVATIONS

- **Tests validate shape, not behavior.** `deployment-docs.test.ts` asserts headings exist. `docker-compose.test.ts` asserts services + port strings. None of these tests prove the commands printed in the docs actually work. This is the same trap that let AC4 ship as broken: parity of names is not parity of behavior.
- **The H4 design is speculative.** PG adapter, pg seed CLI, pg test runner, pool-size constant — all exist, all exported, none actually used by the running server. The Ethos "Boil the Lake" cuts both ways: shipping the full problem is good; shipping infrastructure for a problem no one has yet is YAGNI. If H4 wants to claim PG-ready, it should wire `createPgDb` into `app.ts` behind a driver switch and prove a single route works on PG. Otherwise, trim to "profile resolver + laptop setup CLI + compose file" and defer PG adapter to the first story that actually needs it.
- **The `cloud` profile is untested end-to-end.** Every cloud-profile test is a CLI-output assertion. No test connects to a real managed PG, so "cloud" is documentation, not a deployment profile.
- **`bin/setup` uses `git rev-parse --show-toplevel`** — breaks in any environment without git (Docker image build, tarball deploy). Fine for a developer CLI; should not be the production setup path.

---

## Verdict

**STOP.**

Two of the six acceptance criteria are false as written. AC4 ("config-only swap") is contradicted by 175+ synchronous SQLite query calls across the server; switching `DATABASE_URL` to Postgres will crash at runtime. AC5 ("pool size 10 honored") is a constant being read back by a test; the server never calls `createPgDb` and the `PG_POOL_SIZE` env var that the compose file and docs tell operators to set is read by nobody.

The compose file ships with a hard-coded `DATABASE_URL` default that ignores `POSTGRES_PASSWORD`, and publishes Postgres port 5432 and Vite dev-mode web 5173 on 0.0.0.0 — three independent ways to footgun a VPS operator who follows the docs literally.

Before this ships:

1. Either wire `createPgDb` into the server runtime behind a driver switch AND migrate the synchronous query surface to async, OR reduce the AC4 claim to "PG schema migrates cleanly; server remains SQLite for now."
2. Read `PG_POOL_SIZE` somewhere, or remove it from compose and docs.
3. Fix the compose `DATABASE_URL` default to interpolate `POSTGRES_PASSWORD`, drop the public port binding on `postgres`, and gate web on localhost/reverse proxy.
4. Delete dead code: `HYPERIDLE_DB_DRIVER` env mutation, unused `client` handle, unused `PgHandle.runPgMigrations` on the production type.
5. Validate `--db-path` writability/traversal or document that it's trusted.

Once those are fixed, REVISE on the remaining slop (banner comments, tautology tests, duplicated redact, unsafe cast on line 119) and it can proceed.
