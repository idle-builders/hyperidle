# AU38 — Feasibility evidence

All measurements RE-TAKEN on worktree `.worktrees/AU38` @ **`c5e1c9b7`** (branch
`chore/AU38-test-self-isolation` after merging origin/main `705b28f6` "Move test execution into
CI and delete the local attestation"), 2026-08-11; earlier `557cf323` numbers superseded.
Service lane = `service` vitest project: all `*.integration.test.{ts,tsx}` under
`layers|framework|applications|tools` minus the harness project's include patterns
(`vitest.integration.config.ts:20-43`).

---

## 1. Measured terrain

### 1.1 File census (commands reproducible)

```bash
rg --files -g '*.integration.test.ts' -g '*.integration.test.tsx' layers framework applications tools | sort   # → 342
# minus harness patterns (harness-registry __tests__, 4 named core-api real-binary files, *-real.integration.test.ts):
#   → 329 service / 13 harness
# post-merge delta: +3 service (unit tests renamed to .integration.test.ts: builtin-tool-catalog-consistency,
# tool-handlers create-artifact, plugin-configuration — all createTestDb-based) + +1 harness (adapter-pool-real-discovery)
```

| measure | count | command (run on the service set) |
|---|---|---|
| service-lane files | **329** | census above |
| fixture-based (import a `test-fixtures`) | 313 | `xargs rg -l 'from ".*test-fixtures'` |
| `createTestDb()` callers | 19 — but ONLY 10 are createTestDb-ONLY (P11 exempt); the other 9 are MIXED (import the fixture `test` AND use the shared-pool `{ db }` fixture — IN SCOPE, see architecture P11 warning) | `xargs rg -l 'createTestDb\(\)'` + per-file fixture-import check |
| `toHaveLength` | 146 files / **547 sites** | `xargs rg -l/-c 'toHaveLength'` |
| — `toHaveLength(1)` sites | 300 | `xargs rg -c 'toHaveLength\(1\)'` |
| — `toHaveLength(0)` sites (absence) | 66 files / 167 sites | `xargs rg -c 'toHaveLength\(0\)'` |
| literal `id: "…"` inserts | **220 files** | `xargs rg -l 'id:\s*"[A-Za-z0-9_-]+"'` |
| — literal `id: "t1"` | 29 files (plan.md's 28 + the renamed `create-artifact`, createTestDb-based) | `xargs rg -l 'id:\s*"t1"'` |
| `randomUUID`/`nanoid` already | 35 service (36 all — plan.md said 36 ✓) | `xargs rg -l 'randomUUID\|nanoid'` |
| `.id).toBe("literal")` assertion sites | 77 | `xargs rg -c '\.id\)\.toBe\("'` |
| `db.select().from(` | 124 files / 477 sites | `xargs rg -l/-c 'select\(\)\.from\('` |
| — files with selects and NO `.where` anywhere | 13 | loop: `rg -q '\.where\(' $f \|\| echo` |
| positional `[0]` array access (rough) | ~155 sites | `xargs rg -c '\)\[0\]\|rows\[0\]\|…'` |
| `db.execute(` raw SQL | 32 files | `xargs rg -l 'db\.execute\('` |
| `toBe(404)` absence-via-API | 47 files | `xargs rg -l 'toBe\(404\)'` |
| `toBe(201)` creation | 45 files | `xargs rg -l 'toBe\(201\)'` |
| `db.insert(` | 252 files | `xargs rg -l 'db\.insert\('` |
| `app.request(` | 139 files | `xargs rg -l 'app\.request\('` |
| `onConflict*` | 19 files | `xargs rg -l 'onConflict'` |
| duplicate-key-expectation tests | 2 files (`AL7-proposed-call-capture`, `framework/db/src/__tests__/migration-l1*`) | `xargs rg -l '23505\|unique violation\|duplicate key\|UNIQUE constraint'` (*FIXTURE-based — imports `@hyperidle/db/test-fixtures`, no createTestDb; gets `ids.next()` treatment, NOT exempt) |
| `db.delete(` | 7 files | `xargs rg -l 'db\.delete\('` |
| `.orderBy(` / `.limit(1)` | 2 / 36 files | `xargs rg -l` |
| `createServer(` boots | 5 files | `xargs rg -l 'createServer\('` |
| `startTestRuntime` | 5 files | `xargs rg -l 'startTestRuntime'` |
| `vi.useFakeTimers` | 4 files — **ALL fixture-based** (`S1-login-session`, `S1-e2e-flow`, `S1-auth-middleware` are MIXED files using the `{ db }` fixture; plus `routine-scheduler-completeness`). Fake timers × shared pool × isolate flip is increment-9 coupling class | `xargs rg -l 'useFakeTimers'` |
| `beforeEach` | 124 files, **0** with fixture args | `xargs rg -c 'beforeEach\(async \(\{'` → 0 |
| hardcoded `slug:` / `email:` | 0 / 29 files | `xargs rg -l 'slug:\s*"'\|'email:\s*"'` |
| big seeders | 2 files: `dependency-watcher.perf` (~500 rows), `attention-service` | `xargs rg -l 'i < [0-9]{3,}\|Array\.from\(\{ length: [0-9]{3,}'` |

plan.md's "9 of 342 use vi.mock" re-measured: **5 total / 3 service** — the class shrank since the
plan's measurement (drift, not error in the plan's conclusion).

### 1.2 vi.mock file list (service lane — the isolate-flip fix list)

1. `layers/agent-orchestration/src/__tests__/factory-run-config.integration.test.ts` — mocks
   `@hyperidle/factory-defaults` (`readSystemPromptTemplateForRole` → null for one role; mutable
   `nullTemplateRole` module var in the test file).
2. `layers/core-api/src/routes/__tests__/agent-and-team-creation-atomicity.integration.test.ts` —
   mocks `@hyperidle/agent-run-config` (`writeAgentRunConfig`/`writeTeamRunConfigDefaults` throw;
   tests rollback atomicity).
3. `layers/core-api/src/__tests__/server-disposal.integration.test.ts` — mocks 5 modules
   (`@hyperidle/agent-orchestration`, `../app.js`, `../routes/ws.js`, `@hono/node-server`,
   `@hyperidle/db`) to instrument shutdown phase ordering.

(2 further vi.mock files live in the harness project — out of scope, project keeps isolate:true.)

### 1.3 Module-level mutable state inventory (production modules the lane imports)

| site | kind | verdict |
|---|---|---|
| `layers/agent-orchestration/session-requests/src/session-run-registry.ts:54` | `entries` Map keyed by sessionId — deliberate process singleton (AF7 lore) | scoped session ids ⇒ no stale-entry collision; deregister exists. Fixed by D1. |
| `layers/agent-orchestration/run-orchestration/src/worker-ingress.ts:104` | `LIVE_WORKER_SOCKETS` Map keyed by workerId (survives across connection managers by design) | scope worker-id literals in the 2 exercising files (`AF11-authz`, `agent-orchestration-port`). |
| `layers/agent-execution/harness-registry/src/llm-client.ts:644` | `installedInterceptor` | set only by harness-lane cassette tooling; different project. No action. |
| `framework/event-bus/src/event-bus.ts:17` | lazy module logger | idempotent singleton. Harmless. |
| `layers/core-api/src/app.ts:208` | `APP_DISPOSERS` WeakMap | keyed by app instance; `disposeApp` drains (`app.ts:577-600`). Safe. |
| `local-sandbox-adapter.ts:15`, `cli-harness-adapter.ts:325` | `nextId` counters | monotonic; harmless. |
| `applications/remote-server/src/index.ts:37` | `shutdownPromise` | application entrypoint, not imported by service tests (they use `create-server`). No action. |

Timer/loop starters the lane drives (leak audit for increment 9):
`startLifecycleProjectionDrain` (setInterval, returns stop) — 3 caller files
(`boot-lifecycle-drain` stops at 10ms poll, `agent-lifecycle-projection` stops in teardown at
line 66, `routine-scheduler.au15`); `createServer`'s routine scheduler — stopped via the disposer
bag on `ServerHandle.dispose()` (`create-server.ts:416-423`).

### 1.4 Schema facts that shape D1

- **36** tables with `text("id").primaryKey()` (re-measured; the earlier 41 conflated the
  FK-derived PKs); 5 SINGLE-COLUMN FK-derived PKs (`team_run_config_defaults.teamId`,
  `agent_run_config.agentUserId`, `agent_lifecycle_inbox.requestId`,
  `tailored_grants.proposedCallId`, `operation_outcomes.proposedCallId`); 2 TRUE composite PKs —
  `filesystem_injections (agentUserId, filesystemId)` (`schema.ts:1244`) and
  `hint_progress (userId, hintId)` (`schema.ts:1423`); 1 name-PK — `server_credentials.name`
  (`schema.ts:1303`, fixed catalog — see §1.4b). **Zero** `serial`/`identity` columns
  (`rg 'serial\(|bigserial\(|\.primaryKey\(\)' framework/db/src/schema.ts`) ⇒
  `RESTART IDENTITY` in the current truncate is already a no-op; no sequence-ordering patterns
  exist (P8 non-pattern). All composites/FK-PKs are FK-anchored ⇒ scoped by their parent.
- Unique definitions (18 — re-measured): `sessions_request_id_uq`,
  `agent_session_requests_idempotency_uq`, `agent_work_intents_identity_uq` +
  `_request_id_uq`, `explicit_session_starts_requester_key_uq`,
  `task_dispatch_attempts_task_ordinal_uq`, `threads_direct_key_uq`, `messages_idempotency_uq`,
  `org_edges_unique`, `knowledge_app_projection.knowledgeItemId`, `task_planning_signals.taskId`,
  `plugin_config_defaults_..._uq`, `configuration_overrides_kind_key_uq`, `tokenHash`,
  `invite_codes.code` (column-level `.unique()` at `schema.ts:1467` AND `invite_codes_code_uq`
  at `schema.ts:1476` — same column declared twice, one constraint), `proposed_calls_capture_uq`,
  `service_connections_...` — all anchored on a parent PK or a test-chosen literal; scoped
  parents ⇒ collision-free.
- `teams` has NO slug column; `users.email` nullable, NOT unique. The non-PK-unique surface is
  small (invite codes, token hashes, composite keys).
- Production id format: `crypto.randomUUID()` everywhere (`rg -l 'randomUUID\(\)'` → 20+ route/service
  files), sometimes prefixed (`team-${crypto.randomUUID()}` — `teams-routes.ts:246`). Exactly ONE
  format validator in all production code: `notifications-routes.ts:385` `z.string().uuid()`
  (`rg 'z\.string\(\)\.uuid'` → 1 hit). No id length/charset checks anywhere
  (`rg 'id\.length|maxLength'` → nothing id-related).

### 1.4b Production-fixed-id clusters (P10 scope lists)

**Factory/bootstrap cluster — 14 service files** touching `applyFactoryCoreState` / `seed-*`
roster ids (`xargs rg -l 'applyFactoryCoreState|seed-agent|"seed-'` on the service set):
`AF11-idor-regression`, `AF17-propagation-bootstrap`, `M3-threads-coach-auth`,
`af9-attention-population`, `af9-promotion-routine`, `builtin-routines`,
`notifications/dispatcher`, `bootstrap/__tests__/factory-state`, `routes/__tests__/coach.routes`
(core-api), plus `tools/setup`: `AD8a-category-rename`, `AF17-factory-bootstrap`,
`AF17-factory-isolation`, `X3-agent-config-bootstrap`, `factory-and-demo`.

**Credentials cluster — 8 fixture files** inserting the fixed-catalog `server_credentials.name`
PKs (`anthropic_api_key` | `openrouter_api_key` | `shared_backend_key`):
`credentials.store`, `AF11-authz` (:550-595), `AF15-model-gateway-partial`,
`credential-resolver`, `fail-loud-secret`, `credential-runtime-path`, `X4-model-gateway`,
`boot-provisioning-wiring`. Absorbed in practice: production writes are upserts
(`credential-store.ts:92-103`) or absent-only inserts (`server-config.ts:367-368`) — no
collision risk; assertions still scope to the rows they wrote (architecture §3 P10).

### 1.5 Harness-lane exposure to truncate removal

13 files post-merge (adds `adapter-pool-real-discovery` — no db-fixture usage); only 2 insert
via the db fixture: `assistant-reply-live-harness` (5 tests, seeds
`founder-inc8-${harness}` — distinct per lane, collision-free without truncate) and
`AU9-assistant-handoff-realbinary` (1 test). The harness project keeps `isolate: true` ⇒ fresh
PGlite per file anyway. **No harness migration needed; increment 10 proves the lane green —
builder-run, since the harness lane has NO CI job (testing.md:71 post-merge).**

---

## 2. Probes — three nasty files, migrated far enough to prove the recipe

### Probe A — `U2-api-teams-bets.integration.test.ts` (P3 + P5 + P6 + P9 combined)

Today: literal `"team-1"`/`"tm-1"` in inserts, URL (`/api/teams/team-1`), assertions
(`body.team.id).toBe("team-1")`); `POST /api/teams` asserting 201 with a stale lore comment
claiming an empty DB is required (false — the idempotency guard is same-NAME since AF15/AK6,
`teams-routes.ts:229-238`).

Migrated shape:

```ts
test("GET /api/teams/:id returns 200 with team detail", async ({ db, app, ids }) => {
  await db.insert(teams).values({ id: ids("team-1"), name: `Growth ${ids("team-1")}`, phase: "build", createdAt: NOW });
  await db.insert(teamMembers).values({ id: ids("tm-1"), teamId: ids("team-1"), capacity: 3, activeBets: 0, formedAt: NOW });
  const res = await app.request(`/api/teams/${ids("team-1")}`, { method: "GET", headers: authHeaders() });
  const body = (await res.json()) as { team: { id: string }; teamMembers: { id: string } };
  expect(body.team.id).toBe(ids("team-1"));
  expect(body.teamMembers.id).toBe(ids("tm-1"));
});
test("POST /api/teams creates a team and returns 201", async ({ app, ids }) => {
  const res = await app.request("/api/teams", { method: "POST", headers: authHeaders(),
    body: JSON.stringify({ name: `New Team ${ids("new")}` }) });   // scoped NAME — idempotency key is the name
  expect(res.status).toBe(201);
});
```

Every occurrence is a mechanical substitution; the 201 test works in a populated world because the
guard matches on name. The `toMatch(/^team-/)` format assertion stays untouched — it asserts on
the route-GENERATED id, which production still prefixes. ✔ recipe holds.

### Probe B — `knowledge.knowledge-action-baked-emit.integration.test.ts` (baked-emit family, attempt-2 failure)

Today: DB patterns ALREADY scoped — `.where(eq(agentWorkIntents.sourceId,
"knowledge:item-au21-knowledge-emit-1"))` etc. — but on file-unique LITERAL labels; the file
failed under attempt 2 despite scoped DB reads. Diagnosis: its coupling is module-state (vi.mock
cache / shared singletons), not data. Migration = literals → `ids("knowledge:item-…-1")` at seed
and filter sites (mechanical, ~10 sites); the attempt-2 red is handled by increment 9's
containment fixes, confirming the two-track design (data scoping ≠ module scoping; both needed).
✔ recipe holds; this file is evidence the isolate flip needs fixes beyond data isolation.

### Probe C — `factory-state.integration.test.ts` (P10 — production-fixed ids)

Today: `applyFactoryCoreState(db)` seeds the roster with production `idHint` ids; asserts
`byId.get("seed-agent-cos")` and `allUsers).toHaveLength(7)` over the WHOLE users table.

Migrated shape:

```ts
test("is idempotent — a second call leaves the same rows and refs", async ({ db }) => {
  const before = await db.select().from(users).then((r) => r.length);   // or scope by factory teamId
  const first = await applyFactoryCoreState(db);
  const second = await applyFactoryCoreState(db);
  expect(second.map((r) => r.id).sort()).toEqual(first.map((r) => r.id).sort());  // unchanged — set equality over own output
  const after = await db.select().from(users).then((r) => r.length);
  expect(after - before).toBe(0);   // idempotency proven as a diff, not a global count
});
```

Fixed `seed-*` ids are shared by design (production bootstrap constants); files in one worker
re-apply idempotently. The whole-table count becomes a diff; the roster assertions already read
the returned refs, not the table. The first-call test (`expect(refs).toHaveLength(7)`-shaped)
uses the same diff or filters users by the factory team. ✔ recipe holds; the 14 factory-cluster
files (§1.4b) get this treatment case-by-case (architecture §3 P10).

---

## 3. Identity-mechanism rejection matrix (D1 evidence)

| candidate | production format honoured? | FK graph | assertion impact | blast radius | verdict |
|---|---|---|---|---|---|
| per-test PREFIX on literals (`τ<t1>` etc.) | ✗ invents a format production never emits; fails the one real validator (`z.string().uuid()`, notifications route) if a prefixed id reaches it | labels carry graph, good | `.toBe("t1")` → `.toBe(pref("t1"))`, mechanical | ~220 files | rejected: format risk for zero compensating gain |
| generated UUID + variable threading | ✓ | variables carry graph | every repeated literal becomes a declared variable threaded through seed helpers; miss = silent-ish rework | ~220 files, larger diff | rejected: same footprint as chosen, higher miss-rate, no label parity |
| fixture-injected deterministic derivation `ids(label)` (CHOSEN) | ✓ canonical UUIDs | labels carry graph exactly as literals do today | drop-in substitution at every occurrence; per-test token ⇒ cross-test AND same-file collision-free | ~220 files, mechanical | **chosen** |
| per-test schema/database | ✓ | intact | empty-world assertions all survive — which is precisely what the ACs forbid | would touch the pool + every fixture | rejected: defeats AC2/VS1-VS2 (populated world) and the missing-predicate goal; 57-migration re-apply or template plumbing; drizzle pinned to `public` |

Helper cost check: `sha256` per label is µs-scale against ~ms-scale inserts; cache per test makes
repeated labels free. UUID-v4-shaped output (version/variant bits set) passes zod `.uuid()` on any
version-tolerant or v4-strict reading. (zod's `.uuid()` regex accepts any version in zod 3; the
repo pins zod via drizzle-zod — UNVERIFIED which zod major the lockfile resolves; v4-shaped output
is safe under both.)

---

## 4. Risk register

| risk | trigger | likelihood | mitigation |
|---|---|---|---|
| Intermediate commit red | a batch migrates a file whose pattern was misclassified | medium | truncate still runs during batches ⇒ scoped ids are backwards-compatible; per-batch full lane run before commit; misclassified files fixed in-batch |
| Silent assertion weakening (plan forbids) | migration "fixes" a test by deleting/loosening an expect | medium | rule of the migration: every `expect(` survives or is replaced by a STRICTER scoped equivalent; review compares expect-counts per file (`rg -c 'expect\('` before/after per batch — cheap automated diff check the builder runs); lint R1/R2 force scoping rather than deletion |
| Within-file contamination surfaces only at increment 8 | batches run WITH truncate, hiding same-file cross-test assumptions | high (expected, bounded) | increment 8 is explicitly the expose-and-fix step; its commit lands only after the local lane is green without truncate; per-test tokens already kill same-file id collisions, so residue is absence/ordering assumptions only |
| isolate flip red beyond the known set | unknown module-state coupling (attempt-2 saw ≥8 files, order-dependent) | high (expected) | increment 9 iterates with the failure set as input; the known inventory (§1.3) + vi.mock trio covers every mechanism identified; NO allowlist against the failure set (plan forbids the flaky-by-construction shortcut) — every failure gets a real fix |
| PGlite memory growth, un-truncated, per worker | ~80 files/worker accumulate rows for the whole run | low | measured seeders are bounded (max ~500 rows, 2 files); est. tens of thousands of small rows ≈ low tens of MB — negligible for in-memory PGlite; builder watches the increment-10 run for drift; a future pathological seeder is caught by its own test time |
| query slowdown on growing tables | unscoped scans get slower as the worker's world grows | low | lint R2 deletes the unscoped-scan class; scoped selects are indexed-path |
| createdAt ordering ties across tests | list endpoints ORDER BY createdAt; interleaved same-ms rows disturb positional asserts | medium | P5 recipe: predicate-find instead of position; where ORDER is the behaviour under test, scope the input set |
| leaked timers process a later test's rows | `stop()`/`dispose()` missing or racing teardown | medium | §1.3/§4.4(c) audit; stop in `afterEach`/`finally`; the increment-9 green run is the proof; PGlite serializes concurrent queries internally, so a racing drain is a correctness (not corruption) risk — caught by red tests |
| harness lane regression | shared `db` fixture changed | low | §1.5: only 2 files insert, already collision-free; increment 10 runs `npm run test:integration:harness` — mandatory builder run: post-merge the harness lane has NO CI job and no attestation floor (testing.md:71), so nothing downstream catches a regression |
| fake timers × shared pool × isolate flip | 4 fixture-based fake-timer files (S1 ×3 mixed + routine-scheduler-completeness): fake timers gate real drain/scheduler intervals; under a shared unwiped pool a gated timer from one test can fire against the next test's rows | medium | increment-9 audit treats all four as coupling candidates: timers restored (`vi.useRealTimers`) in `afterEach`, drains stopped, assertions scoped; the ×2 order-stability runs catch residue |
| parallel work on main adds old-pattern tests during the migration | AU38 branch is long-lived; other WPs add integration tests | medium | lint ratchet lands at increment 1: new old-pattern tests fail `npm run lint` on main immediately, forcing the author to use `ids` — the tail guards itself from day 1 |
| `db.execute` raw-SQL literals evade lint | template strings opaque to R1/R2 | medium | 32 files audited explicitly in batches; permanent reasoned waivers only for legitimate global raw reads |
| test count drops (AC5) | a file merges tests during migration | low | baseline `numTotalTests` captured increment 0; compared increment 10; merges forbidden unless count-neutral assertion coverage is shown |

## 5. Verification per increment → final AC proof

| increment | green-proof command |
|---|---|
| 0 | `npm run test:integration:service` (baseline + `numTotalTests` via `--reporter=json`) |
| 1 | service lane + `npm run lint` + `npm run check` (additive; waivers full ⇒ lint passes) |
| 2–7 | `npm run test:integration:service` + `npm run lint` per batch |
| 8 | full local service lane green WITHOUT truncate (run twice: stability) + lint with R1 waivers empty |
| 9 | `npm run test:integration:service` green at `isolate: false` (repeat ×2 for order-stability) |
| 10 | service lane (AC5 count ≥ baseline) + `npm run test:integration:harness` (builder-run; no CI job) + `npm run verify` + the PR's own CI run — post-merge (705b28f6) `.github/workflows/ci.yml`'s verify job runs `npm ci && npm run verify && npm run test:full && npm run test:integration:service` on every PR, so CI is the direct per-push lane proof (its AU38-named setup cost is the observable before/after); `verify:release` = `verify` + `test:full` + `test:integration` + `test:e2e:full`; no attestation anywhere |

Final-state AC mapping: AC1 by code inspection of `checkout()` + lane green that never wipes;
AC2/VS1/VS2 by the increment-9/10 lane — with `isolate: false` each worker's single PGlite
accumulates every file's rows, so every file provably runs against a populated database and every
green scoped assertion proves non-observation of neighbours' data; AC3 by green-without-truncate
(any collision = unique violation = red); AC4 by recipes P1/P4/P6 + lint R2 + populated green;
AC5 by count comparison; AC6/VS4 by R1/R2 at error severity in `npm run lint` (per-merge verify
runs it) — demonstrated at increment 8 by adding a scratch unscoped test, observing the lint
failure, deleting the scratch.

## 6. Open items for the concept gate

1. **Isolate flip in-scope (architecture D3).** plan.md's outcome/AC2/VS1-VS2 require it;
   plan.md's sequencing-consequence paragraph can read as deferring it. Architecture resolves:
   flip lands as AU38's capstone (the ACs are otherwise unverifiable; the paragraph orders, not
   defers). Founder confirmation requested — this is the one reading conflict in the plan.
2. **AC6 is enforced statically (lint R1/R2), as a syntactic approximation** of "reads a table
   without scoping to its own arranged data" — per AGENTS.md's static-property→lint rule. A
   semantic runtime enforcer (fixture tracks inserts vs reads) was rejected as over-engineering
   with false positives (companion rows, FK graphs, projection reads). Confirm the approximation
   is accepted.
3. **Harness-lane incidental touch**: none required (verified §1.5) — noted, no ruling needed.
