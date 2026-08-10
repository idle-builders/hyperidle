# AU38 — Architecture

Plan: `.pipeline/work/AU38/plan.md` (owns outcomes; this artifact creates no scope).
Companion evidence: `feasibility.md` (same folder).

**Measurement base: `c5e1c9b7`** — the branch after merging origin/main `705b28f6` ("Move test
execution into CI and delete the local attestation", PR #472). All counts re-measured on the
post-merge tree; earlier `557cf323` numbers superseded.

Service lane = the `service` vitest project (`vitest.integration.config.ts:50-74`): **329 files**
(342 `*.integration.test.ts` total minus the 13 harness-project patterns; the merge renamed three
unit tests into the service lane and added one harness-lane file). All counts below are measured
on this set unless labelled otherwise; commands in `feasibility.md` §1.

---

## 1. The three decisions

### D1 — Identity: fixture-injected, per-test deterministic UUID derivation (`ids`)

Every fixture-based test gets an `ids` fixture from `framework/db/src/__testing__/test-fixtures.ts`
(`DbFixtures`, inherited by `layers/core-api/src/__testing__/test-fixtures.ts` and therefore by every
fixture file that extends it):

```ts
export interface ScopedIds {
	/** Deterministic per-test UUID for a label. Same label → same id within this test. */
	(label: string): string;
	/** Fresh unique UUID — for tests that need two distinct ids for one role (duplicate-key tests). */
	next(): string;
}
```

Implementation contract (locked):
- Per test, the fixture mints one random token (`crypto.randomUUID()`).
- `ids(label)` = first 16 bytes of `sha256(token + "\u0000" + label)` formatted as a canonical
  RFC-9562 UUID (version/variant bits set to v4 shape). Cached per label within the test.
- `ids.next()` = `ids(<internal counter label>)` — always a fresh value.
- Node `node:crypto` only; no new dependency. Dev-world file (`__testing__/`), never imported by
  production.

Why this shape (full rejection matrix in `feasibility.md` §3):
- **Production ID formats honoured.** All PKs are plain `text` (`framework/db/src/schema.ts` — 36
  `text("id").primaryKey()` tables + 5 single-column FK-derived PKs + 2 true composite PKs
  (`filesystem_injections` `schema.ts:1244`, `hint_progress` `schema.ts:1423`) + one name-PK
  (`server_credentials.name` `schema.ts:1303`); zero serial/identity columns). Exactly ONE production route
  validates id format anywhere: `notifications-routes.ts:385` (`z.string().uuid()` on
  `POST /:id/read`). Production writers emit `crypto.randomUUID()` (prefixed in places, e.g.
  `team-${crypto.randomUUID()}` at `teams-routes.ts:246`). A derived UUID passes every validator
  that exists; a prefix scheme (`test-xyz-t1`) fails the notification route and invents a format
  production never produces.
- **Insert/query parity without variable threading.** 220 files insert literal ids and most repeat
  the same literal across inserts, `.where(eq(...))` filters, URL paths, and assertions (e.g.
  `U2-api-teams-bets.integration.test.ts` uses `"team-1"` in 6+ positions). `ids("t1")` is a
  drop-in replacement at every occurrence with zero threading; same label resolves identically.
  Missing one occurrence fails loudly (query matches nothing, or a raw-literal insert collides and
  the unique constraint throws) — never silently.
- **Per-test token, not per-file.** AC3 forbids collisions between any two tests; two tests in one
  file inserting `"t1"` only avoid collision today because of the per-test truncate. Per-file
  scoping would reintroduce same-file collisions the moment truncate goes.
- **FK graphs.** Work exactly as today: labels carry the graph (`ids("t1-team")`,
  `ids("t1-bet")`), mirroring existing literal conventions (`${id}-team` patterns already used in
  `agent-work-intent-recovery.integration.test.ts`).
- **Composite uniques** (18 unique definitions, mostly `(scopedParentId, x)` —
  `schema.ts:290,330,397,476,522,763,792,853,1531,1738`…; `invite_codes.code` carries both a
  column-level `.unique()` and `invite_codes_code_uq` on the same column — one constraint, two
  declarations) are anchored on scoped PKs and therefore collision-free by construction. The 5
  single-column FK-derived PKs (`team_run_config_defaults`, `agent_run_config`,
  `agent_lifecycle_inbox`, `tailored_grants`, `operation_outcomes`) and both true composite PKs
  are FK-anchored — scoped by their parent.
- **Non-PK uniques:** surface is small — `teams` has no slug column; `users.email` is nullable and
  NOT unique (measured: 0 files hardcode `slug:`, 29 hardcode `email:`). Where a unique non-id
  column exists (invite `code`, `tokenHash`), the same `ids(label)` value serves.

Rejected alternatives:
- **Per-test prefix on existing literals** — breaks `z.string().uuid()` route validation for any
  prefixed id reaching that route; invents a non-production format; the only benefit (readable
  failure output) does not pay for the format risk.
- **Raw `randomUUID()` + variable threading** — same edit footprint minus the label parity: every
  repeated literal becomes a declared variable threaded through seed helpers (some seed helpers are
  called from multiple sites relying on literal equality). Higher miss-rate, no compensating gain.
  Files already doing this (34 use `randomUUID`/`nanoid`) stay as they are.
- **Per-test schema/database** — defeats the point: AC2 and validation scenarios 1–2 require a
  POPULATED shared world (the missing-predicate catch only exists when neighbours' rows are
  present); per-test schemas recreate the empty world. Also: 57 migrations re-applied per schema or
  template-schema plumbing, drizzle schema pinned to `public`. Wrong on intent AND mechanics.

### D2 — Landing: ratchet-guarded batch migration, truncate removed only after the lane proves it needs nothing wiped

Ten increments (§5). Shape: additive helper + lint ratchet first → migrate files in six green
batches while truncate still runs (scoped ids are backwards-compatible with an empty world) →
remove truncate in the commit that also empties the lint waiver list → flip `isolate: false` and
fix the module-state coupling it exposes → proof run. Every intermediate commit is verified green
by `npm run test:integration:service` (§6). The truncate is not removed until the full lane passes
without it (increment 8's commit only lands after the local lane is green without truncate).

### D3 — The `isolate: false` flip lands IN AU38, as the capstone increment

plan.md conflicts with itself and this resolves it (recorded per the architecture skill; concept
gate confirms — `feasibility.md` §7 item 1):

- AC2 ("Every service integration test passes when its file runs against a database already
  populated by other tests' data") and validation scenarios 1–2 ("two test files … run against one
  shared database") are **only verifiable in the lane itself with `isolate: false`** on PGlite.
  With `isolate: true` every file boots its own empty PGlite (`plan.md` measured evidence: setup
  2831s = per-file boot × 324 files); "populated by other tests' data" is then structurally false
  and the ACs become unprovable.
- The sequencing-consequence paragraph ("Do this first, then re-attempt one of the two above")
  orders the attempts — it forbids attempting them BEFORE tests own their state; it does not defer
  the flip out of the work package whose ACs require it. AU38 performing the flip as its final
  increment IS "do this first, then re-attempt attempt 2", with the attempt's measured failure set
  (plan.md attempt 2) as the fix list.
- Out-of-scope check: the excluded follow-ons are "moving the service lane off PGlite" and "one
  out-of-process database across files". The isolate flip is neither; it is a one-line config
  change plus the coupling fixes the ACs already demand.
- Consequence for the increment plan: increments 9–10 exist, and the lane ends on
  `isolate: false` (service project only — the harness project keeps `isolate: true`; its lore
  reasons are independent of this work). The measured prize (setup 2831s → 40.6s) lands as a
  documented consequence, not a new outcome.

---

## 2. AC-to-obligation mapping

| AC | Obligation | Where |
|---|---|---|
| AC1 no truncate in `db` fixture | Remove `truncateAllTables` call from `checkout()` (`framework/db/src/__testing__/test-pool.ts:130`); delete the function; keep fallback allocation (minus wipe). `createTestDb()` (`test-utils.ts`) is a DIFFERENT, explicitly-opted-in pool used by 16 migration-mechanics files — it keeps its wipe and is not the `db` fixture. | increment 8 |
| AC2 passes against populated DB | All fixture-based files migrated to scoped identity + scoped assertions (D1, batches 2–7) AND lane runs `isolate: false` (increment 9) so every file's PGlite carries earlier files' rows. Proven by the final green lane run. | increments 2–9 |
| AC3 no colliding PKs | Per-test token derivation makes cross-test literal collisions impossible; unique violations would fail loudly. Proven by green lane without truncate. | D1 + increment 8 |
| AC4 no absence-of-rows assumptions | Per-pattern recipes §3 (absence class); lint rule R2 forbids unscoped whole-table selects; green populated-DB run proves the rest. | increments 2–9 |
| AC5 lane green, test count ≥ before | Baseline count captured at increment 0 (`--reporter=json` → `numTotalTests`); compared at increment 10. No test deletion anywhere in the migration (plan constraint: assertions re-homed/tightened, never weakened). | increments 0, 10 |
| AC6 repeatable check | Two ESLint rules in a new local plugin (precedent: `tools/eslint-plugin-authz`, `tools/eslint-plugin-design`), scoped to fixture-based `*.integration.test.ts`, enforced by `npm run lint` in every per-merge verify. Ratchet waiver list lands full at increment 1 and shrinks per batch; empty at increment 8 (save documented permanent waivers ≤ a handful). | increments 1, 8 |

Validation scenarios: VS1 and VS2 are demonstrated by the final `isolate: false` lane — every
file runs against rows earlier files left, and every assertion is scoped to arranged ids, so
"neither observes the other's team" is exactly what the green scoped assertions prove (each file
asserts `toHaveLength(1)`/equality on rows selected by its own derived ids). VS3 = increment 8→10
green runs + count comparison. VS4 = a deliberately unscoped new test fails `npm run lint`
(demonstrated once at increment 8; the rules are the repeatable check).

---

## 3. Per-pattern verdicts (measured; commands in feasibility.md §1)

Baseline numbers from plan.md verified, then re-measured post-merge (`c5e1c9b7`): 342 total
files, **220** literal-id files (**29** literal-`t1` — the +1 is the renamed
`create-artifact.integration.test.ts`, createTestDb-based), 36 randomUUID/nanoid files
(35 service + 1 harness), 148→**146** service files with `toHaveLength` (**547** sites), vi.mock
9→**5 total / 3 service** (drift since plan's measurement — four mock usages were cleaned up
elsewhere; the lore on `vitest.integration.config.ts:67` still names the class).

| # | Pattern (service-lane count) | Verdict | Migration recipe |
|---|---|---|---|
| P1 | `toHaveLength(n)` on **unscoped** `db.select().from(x)` — 13 files have selects with no `.where` anywhere; 477 select sites total, 124 files | **BREAKS.** The canonical empty-world assertion. | Scope: `.where(eq(x.teamId, ids("t1-team")))` or select by arranged id. If the point is "my write created N rows", use a before/after count diff on the scoped predicate. Lint rule R2 enforces. |
| P2 | `toHaveLength(n)` on **filtered** results — queries/API responses already scoped by team/user/bet (the large majority of the 547 sites; e.g. `agent-work-intent-recovery` selects by its own ids) | **SAFE — becomes STRONGER.** With neighbours' rows present, passing proves the predicate actually filters (the missing-predicate catch plan.md wants). | Replace literal filter values with `ids(...)`; keep the assertion. Where a list endpoint supports a filter query param the test doesn't use, adding it is permitted but not required — scoping the assertion suffices. |
| P3 | Hardcoded-id inserts — 220 files (`id: "…"` literals); 29 of them literal `"t1"` | **BREAKS** (collisions AC3). | Replace each literal with `ids("<same label>")` at every occurrence (inserts, `.where`, URL path segments, assertion operands). Seed helpers taking an id parameter keep their signature; callers pass `ids(...)`. Duplicate-key tests (2 files: `AL7-proposed-call-capture`, and `framework/db/src/__tests__/migration-l1.integration.test.ts` — fixture-based, imports `@hyperidle/db/test-fixtures`, no createTestDb) use `ids.next()`/raw literals as their logic demands. |
| P4 | Absence assertions — `toHaveLength(0)` 167 sites/66 files; `toBe(404)` 47 files | **BREAKS** when the absence is global ("no rows in the table", "404 because nothing exists"). **SAFE** when already scoped ("no rows for MY team"). | Re-home every global absence onto the test's own scope: `expect(rows-for-my-scope).toHaveLength(0)`, 404 on `GET /x/${ids("nonexistent")}` (a derived id nobody inserted is still absent in a populated world — these stay valid and become stronger). A genuinely global absence claim (e.g. "the reaper deleted everything") becomes a before/after diff within the test's scope. |
| P5 | Ordering/first-row assumptions — `[0]`/positional ~155 sites; `.orderBy` 2 files; `.limit(1)` 36 files; `createdAt` ties | **BREAKS** where position is asserted on an unscoped or globally-sorted list (default-order endpoints, `ORDER BY createdAt` with interleaved same-millisecond rows from other tests). | Assert on the row found by predicate (`rows.find(r => r.id === ids("t1"))`), not position. Where an endpoint's ORDER is the behaviour under test, scope the input set (filter param or own-team scope) so ordering is asserted over only the arranged rows. UUIDs do not sort by insertion time — production ids don't either (`team-${randomUUID}`), so no test may rely on id-sort meaning; none found that do (asserted id lists are either set-sorted, e.g. `factory-state:85`, or query-ordered, e.g. `notifications-completeness:104` — both migrate to variables). |
| P6 | Count assertions on **API list endpoints** — `GET /api/bets` returns ALL bets (`bets.ts:291-295` — no team filter; `work.list` accepts `teamId` but the route doesn't require it); `GET /api/teams` similar | **BREAKS** where the test asserts total counts/lengths of global lists. This is the missing-predicate class the WP exists to expose — but production code may NOT change (plan constraint), and a global list is legitimate product behaviour for a single-tenant app. | The TEST scopes: find its own items inside the response (`body.bets.filter(b => b.teamId === ids(...))`) or use the filter params the endpoint already offers. Asserting "the global list contains my row" is permitted and is the right assertion for a global endpoint; asserting "the global list has exactly my rows" is forbidden unless the test arranged the whole world (it can't). |
| P7 | Tests that DELETE their own data — `db.delete(` 7 files | **SAFE** if the delete is predicate-scoped to arranged ids (verify per file); a delete without `.where` is P1's evil twin. | Scope the predicate; lint R2 does not cover deletes — review discipline + the green populated run catches it (an unscoped delete eats neighbours' rows → their tests fail loudly). |
| P8 | `RESTART IDENTITY` / sequence assertions | **NON-PATTERN.** Zero `serial`/`identity` columns in the schema — `RESTART IDENTITY` in the truncate is already a no-op. Nothing to migrate. | none |
| P9 | Idempotent-creation routes keyed on a **name** — `POST /api/teams` returns 200 if a team with the same NAME exists (`teams-routes.ts:229-238`); ~45 files assert `toBe(201)` | **BREAKS** where two tests POST the same literal name into one world (the stale lore at `U2-api-teams-bets:79` says "must be tested on an empty DB" — false since AF15/AK6 made the guard same-name). | Scope the NAME: `name: \`New Team ${ids("suffix")}\`` (names are not unique-constrained, only idempotency-keyed). Applies to any route whose idempotency key is a test-chosen literal (names, `clientKey`, `idempotencyKey` — the composite uniques are anchored on scoped parents, so only free-standing literal keys need scoping). |
| P10 | **Production-fixed-id clusters** — (a) factory/bootstrap seeding: `applyFactoryCoreState` seeds `idHint` roster ids (`framework/factory-defaults/src/factory-roster.ts`, `layers/core-api/src/bootstrap/factory-state.ts`); 14 service files touch `seed-*` ids (list: `feasibility.md` §1.4b). (b) `server_credentials.name` fixed-catalog PK (`anthropic_api_key` \| `openrouter_api_key` \| `shared_backend_key`): 8 fixture files (`credentials.store`, `AF11-authz:550-595`, `AF15-model-gateway-partial`, `credential-resolver`, `fail-loud-secret`, `credential-runtime-path`, `X4-model-gateway`, `boot-provisioning-wiring`) | **SPECIAL.** The ids are production constants — they can't be scoped without changing production (forbidden). Two files in the same worker both applying factory state share one idempotent row set; whole-table counts around them (e.g. `factory-state.integration.test.ts:87` `toHaveLength(7)` on ALL users) break. Credentials are absorbed in practice — production writes are upserts (`credential-store.ts:92-103`) or absent-only inserts (`server-config.ts:367-368`), so shared fixed-name rows don't collide; assertions must still scope to the credential rows they wrote. | Case-by-case: (a) scope the ASSERTION, not the seed — count users of the factory team / before-after diffs; (b) files that must mutate factory rows assert against the fixed ids explicitly and tolerate prior application (idempotent re-apply); (c) a file needing a pristine factory world arranges its own roster-shaped rows with scoped ids instead of calling the real bootstrap; (d) credential tests keep the fixed names but assert on `encryptedValue`/`validationState` they wrote, never on whole-table counts. Builder audits the clusters against the `feasibility.md` §1.4b lists. |
| P11 | `createTestDb()`-ONLY files — **10 service files**: `db.integration`, `seed-then-migrate`, `pg-migration`, `pg-connection`, `AD1-create-item-routing`, `AD1-idor-fix`, `AD1-session-review-routing`, plus the merge's three renamed unit tests (`builtin-tool-catalog-consistency`, tool-handlers `create-artifact`, `plugin-configuration` — all createTestDb-based, no fixture import) | **EXEMPT.** They check out their own PGlite instance and wipe it themselves (`test-utils.ts:165`) — they already own their isolation and don't share the fixture pool's world. | No migration. Lint rules don't apply (§4.3 import criterion). **WARNING — the other 9 `createTestDb` callers are NOT exempt**: `migration.integration`, `S1-invite-code`, `S1-e2e-flow`, `S1-login-session`, `S1-auth-middleware`, `S1-auth-routes`, `bets.integration`, `notifications.routes`, `hints.integration` import a `test-fixtures` `test` AND use the shared-pool `{ db }` fixture (measured: 3–32 fixture-injected tests each) — they go through `checkout()` and are IN SCOPE with normal P3/P4 recipes (concrete breakage at increment 8 if missed: `bets.integration.test.ts:69-78` global-absence `toHaveLength(0)` on four bet groups; `hints.integration.test.ts:82` `{dismissed: []}`; `migration.integration.test.ts:67` CRUD with literal `test-prod` ids). `typed-routes` never calls createTestDb — plain fixture file, batch 4. |
| P12 | Raw SQL — `db.execute(` 32 files | **MIXED.** Literal ids inside raw SQL strings collide like P3; unscoped raw selects break like P1. Lint can't see inside template strings. | Same recipes (substitute `ids(...)` via `${}` interpolation); builder audits these 32 files explicitly; residual raw-SQL global reads get permanent waivers with reasons if legitimate. |
| P13 | `onConflictDoNothing/Update` — 19 files | **SAFE** once keys are scoped (conflict semantics within the test's own keys are unchanged). | Scope the keys (P3/P9). |

Also quantified for the risk register: `createServer(` boots 5 files; `startTestRuntime` 5 files;
`vi.useFakeTimers` **4 files, ALL fixture-based** (`S1-login-session`, `S1-e2e-flow`,
`S1-auth-middleware` — mixed files using the `{ db }` fixture — plus
`routine-scheduler-completeness`): fake timers × shared pool × the isolate flip is exactly the
coupling class increment 9 exists to fix, so all four ride its audit; `beforeEach` 124 files —
**zero** take fixture args (fixture injection is `test()`-only per
`.claude/rules/testing.md:54`), so `ids` needs no hook support.

---

## 4. Contracts

### 4.1 `ScopedIds` + fixture wiring (framework/db — dev world)

- New file `framework/db/src/__testing__/scoped-ids.ts`: `makeScopedIds(): ScopedIds` per §1 D1.
- `test-fixtures.ts`: `DbFixtures` gains `ids: ScopedIds`; fixture body `async ({}, use) =>
  use(makeScopedIds())`. `wrapForTests` unchanged. Exported subpath `@hyperidle/db/test-fixtures`
  unchanged in shape (additive field).
- `layers/core-api/src/__testing__/test-fixtures.ts` inherits via `dbTest.extend` — no change
  needed beyond the type flowing through `IntegrationFixtures extends DbFixtures`.
- `layers/agent-orchestration/src/__testing__/test-fixtures.ts` (eventBus-only) unchanged — its
  db-using tests import `@hyperidle/db/test-fixtures` directly (existing convention).
- Unit tests for the helper live in `framework/db/src/__tests__/` (determinism within a maker,
  uniqueness across makers/token, UUID-format validity, `next()` freshness) — plain `*.test.ts`,
  no DB needed.

### 4.2 `test-pool.ts` (increment 8)

`checkout()` stops calling `truncateAllTables`; the function and its `pg_tables` query are
deleted. `checkin`, fallback allocation, `closeAll`, disconnect handler unchanged. `checkin` of a
fallback instance still closes it. Comment rewrites are sequenced in §7: increment 8 strips the
truncate claims from the header/within-file comments; the "one PGlite per worker, shared across
all files the worker processes, never wiped — isolation is the tests' job" wording lands with the
flip at increment 9 (it is only true once `isolate: false` lets globalThis span files).

### 4.3 ESLint rules (AC6) — new local plugin `tools/eslint-plugin-test-isolation`

Same shape as `tools/eslint-plugin-authz` (workspace package, registered in `eslint.config.ts`
with a files-glob): applies to `**/*.integration.test.ts` **that import the fixture `test` from a
`test-fixtures` module** — an actual import binding, not a comment mention (counter-example:
`AD1-create-item-routing` references `test-fixtures` only in a comment and is exempt). The
criterion exempts createTestDb-ONLY files and the harness lane's real-binary files automatically;
no path allowlists. The 9 MIXED files (P11 warning) import the fixture `test` and are therefore
IN scope — consistent with them going through `checkout()`.

- **R1 `no-literal-entity-ids`**: in `.insert(<table>).values({...})` object literals, forbid
  string-literal values for keys `id` or `*Id` (covers FK columns too — they must reference
  derived values). Fix: `ids(...)`.
- **R2 `no-unscoped-table-read`**: forbid `db.select().from(<table>)` chains that reach their end
  without a `.where(...)` call. Deliberately syntactic — it is the repeatable author-time check,
  not a semantic oracle (AGENTS.md: static property → lint, not a runtime test).
- Waiver file `tools/eslint-plugin-test-isolation/waivers.md` (precedent:
  `tools/eslint-plugin-design/waivers.md`): generated full at increment 1 (every currently-violating
  file), shrunk by each migration batch, **empty for R1 at increment 8**; R2 may keep ≤ a handful
  of permanent reasoned waivers (legitimate global reads via raw SQL or migration-adjacent checks).
  Adding a waiver is a diff review challenges (count only shrinks, same posture as
  `tools/governance/misplaced-files.json`).

### 4.4 `isolate: false` coupling fixes (increment 9, all dev-world changes)

The attempt-2 failure set (plan.md) plus this audit is the fix list:

**(a) vi.mock cache leakage — 3 service files** (the class the `isolate: true` lore names):
- `layers/agent-orchestration/src/__tests__/factory-run-config.integration.test.ts` — mocks
  `@hyperidle/factory-defaults` (template reader returns null for one role).
- `layers/core-api/src/routes/__tests__/agent-and-team-creation-atomicity.integration.test.ts` —
  mocks `@hyperidle/agent-run-config` writers to throw (atomicity rollback test).
- `layers/core-api/src/__tests__/server-disposal.integration.test.ts` — mocks 5 modules
  (`@hyperidle/agent-orchestration`, `../app.js`, `../routes/ws.js`, `@hono/node-server`,
  `@hyperidle/db`) to instrument shutdown ordering.

Diagnosis: with `isolate: false` the module cache is worker-shared; a module pre-loaded by an
earlier file bypasses a later file's hoisted mock, and a mocked module instance cached during one
file is served to later files (order-dependent both ways — exactly attempt-2's "set changes
between runs").

Fix recipe (locked shape, per-file choice):
1. **Contain-and-reset**: `vi.resetModules()` in `beforeAll` + dynamic `await import(...)` of the
   system-under-test inside the test (fresh module graph → mocks apply), and `vi.resetModules()`
   in `afterAll` so the next file re-evaluates the REAL modules. The db fixture is unaffected
   (pool lives on `globalThis`, not in the module cache).
2. **Prefer real arrangement over mocking where possible** (stronger, and plan forbids weakening):
   the atomicity file can make the REAL `writeAgentRunConfig` fail by arranging a real constraint
   violation (e.g. FK target absent) instead of a mocked throw — no vi.mock needed at all. Builder
   picks per file; a mock that survives uses recipe 1. No production DI seams are added (plan
   constraint: production code unchanged).

**(b) Module-level mutable state shared across files in one worker** (measured inventory):
- `session-run-registry.ts:54` — process-singleton `entries` Map keyed by sessionId. Scoped ids
  make stale-entry collisions impossible (a scoped sessionId never equals a leaked one); teardown
  deregister already exists. **Fixed by D1; no code change.**
- `worker-ingress.ts:104` — `LIVE_WORKER_SOCKETS` keyed by workerId; exercised by
  `AF11-authz` + `agent-orchestration-port` tests. Recipe: scope the worker id literals (P3).
- `llm-client.ts:644` `installedInterceptor` — set only by harness-lane cassette tooling;
  different vitest project, out of scope. No action.
- `event-bus.ts:17` module logger — lazily-created idempotent singleton; harmless. No action.
- `app.ts:208` `APP_DISPOSERS` — WeakMap keyed by app instance; per-instance by construction.
  `disposeApp` already drains the bag (`app.ts:577-600`). No action.
- `nextId` counters (`local-sandbox-adapter.ts:15`, `cli-harness-adapter.ts:325`) — monotonic,
  harmless. No action.

**(c) Leaked timers/loops** — the "changes between runs" interferers: a `setInterval` drain left
running by file N processes file N+1's rows. Audit + fix (test-only):
- `startLifecycleProjectionDrain` callers (3 files: `boot-lifecycle-drain`,
  `agent-lifecycle-projection` — already `stop()`s, `routine-scheduler.au15`) — stop() must ride
  `afterEach`/`finally`, never a bare trailing call.
- `createServer` files (5) — `ServerHandle.dispose()` in `finally`; dispose already stops the
  routine scheduler via the disposer bag (`create-server.ts:416-423`).
- Any file starting a real interval asserts it stops before the test ends (2 files use literal
  `setInterval` in tests).

**(d) EventBus**: instances are per-test (fixture) and registrations are per-instance with
unregister-on-teardown (`core-api test-fixtures.ts:88-108`). No module-level subscription
registry found. No action beyond the increment-9 green run proving it.

### 4.5 Harness lane (out of scope, must stay green)

The harness project (13 files post-merge, including the new
`adapter-pool-real-discovery.integration.test.ts` — no db-fixture usage) keeps `isolate: true`
and its own include set. It shares the `db` fixture, so truncate removal affects it: verified
safe — `assistant-reply-live-harness` seeds per-harness unique ids (`founder-inc8-${harness}`,
5 distinct lanes in one file) and `AU9-assistant-handoff-realbinary` is a single test; the
remaining files don't use the db fixture for inserts. **The harness lane has NO CI job**
(testing.md:71 post-merge text — attestation floors deleted): nothing blocks a merge or release
whose harness matrix never executed, so the builder's own increment-10
`npm run test:integration:harness` run is the ONLY proof, and testing.md's obligation makes it
mandatory because shared fixture plumbing changed.

---

## 5. Increment plan (every commit green)

| # | Increment | Size | Why green / verification |
|---|---|---|---|
| 0 | Baseline: capture lane test count (`--reporter=json` → numTotalTests) + one full green service-lane run recorded | trivial | `npm run test:integration:service` |
| 1 | `scoped-ids.ts` + `ids` fixture + helper unit tests; ESLint plugin with R1+R2 registered and waivers generated full; testing.md NOT yet edited | ~10 files | Additive only; lane untouched → service lane + `npm run lint` + `npm run check` |
| 2–7 | Migrate fixture-based files in 6 batches (~50 files each), grouped by package: (2) `framework/db` (incl. mixed `migration.integration` + fixture-based `migration-l1`) + `layers/agent-orchestration/**`; (3) `layers/core-api/{work,conversation,routine,review,knowledge,settings,policy,credentials}` subpackages (incl. `credential-resolver`); (4) `layers/core-api/src/routes/__tests__` (incl. mixed `notifications.routes`, `hints`, fixture-based `typed-routes`, `credentials.store`, `AF11-authz`, `X4-model-gateway`); (5) `layers/core-api/src/__tests__` A–L (incl. mixed `S1-*` ×5, `bets.integration`, plus `AF15-model-gateway-partial`, `fail-loud-secret`, `credential-runtime-path`); (6) `layers/core-api/src/__tests__` M–Z + `applications/` + `tools/` (incl. `tools/setup` factory files); (7) residue + the 2 harness-lane db-fixture files + P10 clusters (factory per feasibility §1.4b + credentials family). The 9 mixed P11 files ride their package's batch with normal P3/P4 recipes. Each batch shrinks its waivers. | ~313 files total | Truncate still runs → scoped ids are backwards-compatible with the empty world; a half-migrated file still passes. Per batch: `npm run test:integration:service` + `npm run lint` (waiver shrink checked) |
| 8 | Remove truncate (§4.2) + R1 waivers empty + rewrite `test-pool.ts` header/within-file comments + update `.claude/rules/testing.md:117` ("allocates one instance per test file … via `TRUNCATE` (~40ms)") AND fix the fixture examples around testing.md:88-105 — already stale on main (the example inserts `slug: "alpha"` into `teams`, which has no slug column) — replacing literal ids + unscoped reads with the `ids` pattern | ~5 files + the deletion | Commit lands only after a full local service-lane run is green WITHOUT truncate (within-file accumulation now live — same-file collisions/absence assumptions surface here; fix-forward during the increment, commit the green end state). AC1 + AC6 satisfied. VS4 demonstrable. |
| 9 | Flip service project `isolate: false` (§4.4 fixes: vi.mock containment ×3, timer + fake-timer audit incl. the 4 fixture-based fake-timer files, scoped worker ids) + rewrite the two doc sites whose claims the flip inverts: `test-pool.ts`'s `@lore pool-does-not-span-files` block and testing.md's tail paragraph (§7) | 1 config line + ≤ ~10 files + 2 doc sites | The attempt-2 failure set is the expected red; iterate until `npm run test:integration:service` green (×2 runs for order-stability). AC2/VS1/VS2 satisfied. |
| 10 | Proof: full service lane (count ≥ baseline), `npm run test:integration:harness` (builder-run — the lane has NO CI job), `npm run verify`, and the PR's own CI run (`.github/workflows/ci.yml` verify job = `npm ci && npm run verify && npm run test:full && npm run test:integration:service` — direct per-push lane evidence; the AU38-named setup cost in that job is the observable before/after) | none | AC5 satisfied; CI green is the merge gate |

Batch boundaries are the safe-parallel seam: batches 2–7 are independent file sets (no shared
files) and may run as parallel builder leaves if the orchestrator wants; each leaf's done-criterion
is its batch green. Increment 8 depends on all of 2–7; 9 depends on 8; 10 on 9.

---

## 6. Verification story

- Per increment: `npm run test:integration:service` (the lane itself) + `npm run lint` +
  `npm run check` as the fast local loop. Since the post-merge CI move (705b28f6), the PR's OWN
  CI run is the honest per-push lane proof: `.github/workflows/ci.yml`'s verify job runs
  `npm ci && npm run verify && npm run test:full && npm run test:integration:service` on every
  PR — no attestation layer remains (`npm run verify` ends at the builds). Local runs stay the
  iteration loop; CI green is the gate.
- Increment 8 note: with truncate gone but `isolate: true` still set, each file still boots its
  own PGlite — contamination only accumulates WITHIN a file's tests. The populated-world proof
  rides increment 9, where one worker processes ~80 files sequentially against one shared PGlite.
- Increment 10 (final, per AC): service lane green + `numTotalTests` ≥ baseline (AC5); lane runs
  `isolate: false` (AC2/VS1/VS2 — every file executes against earlier files' rows by construction
  of the shared per-worker instance); `checkout()` contains no wipe (AC1 — code inspection + the
  lane's green proves nothing needs it); green without truncate means no unique collision (AC3);
  lint R1/R2 at error with empty waivers (AC6/VS4); harness lane green via the builder's own
  `npm run test:integration:harness` run (no CI job covers it — §4.5); `npm run verify` green
  (merge requirement) and the PR's CI run green.

## 7. Documentation made false by the change

**Increment 8** (truncate removal):
- `.claude/rules/testing.md:117` — "The PGlite pool allocates one instance **per test file** and
  reuses it between the tests in that file via `TRUNCATE` (~40ms). No teardown needed in test
  files." → rewritten: pool pre-warms 1 instance per worker, shared across files, never wiped;
  tests scope their own identity/assertions via the `ids` fixture.
- `.claude/rules/testing.md:88-105` fixture examples — ALREADY stale on main (the example inserts
  `slug: "alpha"` into `teams`, which has no slug column) and they show the literal-`id: "t1"` +
  unscoped-`toHaveLength(1)` pattern AU38 deletes → rewritten to the `ids` pattern with a
  schema-true example row.
- `framework/db/src/__testing__/test-pool.ts` header + within-file comments (§4.2).

**Increment 9** (isolate flip) — two sites carry POST-MERGE (705b28f6) lore that plan.md's founder
authority (written after, citing both failed attempts) settled the OPPOSITE of:
- `framework/db/src/__testing__/test-pool.ts:82-94` `@lore pool-does-not-span-files` — its
  description of isolate:true behaviour is accurate, but its framing dies with the flip: under
  `isolate: false` the pool DOES span files (globalThis survives across files in a worker — that
  is the AU38 design). Rewritten to record: the span is real once tests own their isolation; the
  vi.mock class it cites as load-bearing is 3 service files with a containment fix (§4.4(a)); the
  load-bearing coupling was DB state, not module state.
- `.claude/rules/testing.md` tail paragraph ("It does NOT span files … Fixing that means taking
  PGlite out of process or pointing the lane at a real Postgres") → rewritten: with self-isolating
  tests the service lane runs `isolate: false` and the pool spans files within a worker;
  out-of-process PGlite / real Postgres remains the separately-registered follow-on (plan.md
  out-of-scope), not the precondition that paragraph claims.
- `vitest.integration.config.ts:67-71` lore (isolate:true fixes mock leakage) → updated to record
  the flip and point at the containment recipe.

Any increment: `docs/guides/developer/` — builder greps for TRUNCATE/isolate mentions at
increment 8/9 and updates any hit (none found in this audit — UNVERIFIED for files not grepped).

## 8. Security

This change touches no production code (plan constraint), no endpoint, no input surface, no
credential, no outbound request. All changed files are dev-world (`__testing__/`, test files,
`vitest.integration.config.ts`, one dev-world ESLint plugin under `tools/`). The one credential
adjacency — `HYPERIDLE_API_KEY` stubbing in tests — is unchanged. The new ESLint plugin reads
only test files at lint time. There is nothing here to threat-model; stating that IS the reasoning.

## 9. Technical tasks

Single logical work stream; split only at the real safe-parallel boundary:

1. **T1 — Foundation** (increments 0–1): baseline count, `scoped-ids` + fixture + unit tests,
   ESLint plugin + generated waivers.
2. **T2…T7 — Migration batches 2–7** (parallel-safe, independent file sets; each leaf owns its
   waiver shrink and its batch-green).
3. **T8 — Truncate removal** (increment 8; depends on all of T2–T7).
4. **T9 — Isolate flip + coupling fixes** (increment 9; depends on T8).
5. **T10 — Proof + docs** (increment 10; depends on T9).

The orchestrator may collapse T2–T7 into fewer sequential leaves; the split exists because the
batches are genuinely independent, not to manufacture parallelism.
