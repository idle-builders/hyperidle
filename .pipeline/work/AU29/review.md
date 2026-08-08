# AU29 — Implementation review

Reviewer: independent, read-only. Branch `pipeline/AU29`, HEAD `9d5c5e51`, integrated diff `bbe82e9a..HEAD`.
Every claim below was produced by running the command shown, in this worktree, not by reading the builder's notes.
The tree was left clean (`git status --porcelain` empty) after every probe.

## Verdict

**BLOCKED — 1 blocking finding.**

All seven plan ACs are met on the default path, independently re-verified. The single blocking item is a
demonstrated, change-caused regression in the relocated `setup` CLI: the `--root` flag now also relocates
the migrations folder, which it never did before, so `npm run setup --root <path>` on the laptop profile
hard-fails. One line, no design question.

---

## AC verification (re-run, not read)

### AC 1 — every `framework/db` export resolves to a named database surface; zero `db:unknown`

**PASS.** `npx tsx scripts/governance-lint.ts` →
`governance-lint: PASS — 3310 tracked files (788 production, 2522 development), 34 packages, 8189 crossings, 19 rules, 191 production + 66 development known violation(s) at warn.`
`grep -c "db:unknown"` over the full lint output = **0**. The `db-symbols-all-placed` rule (below) produces
zero findings on the clean tree, which is the machine-checked form of the same statement — the old non-fatal
NOTE is gone and nothing silently replaces it.

`framework/db/src` now holds exactly `connection.ts`, `index.ts`, `migrate.ts`, `migrate-pg.ts`, `pg-ssl.ts`,
`schema.ts`, `write-executor.ts`, `zod-schemas.ts` (+ `__testing__` / `__tests__`). The barrel exports only
the connection block, `applyMigrations`/`isDowngrade`/`MigrationResult`, `export * as schema`, the table +
row-type block, and `WriteExecutor`. No re-export shim of any moved symbol.

### AC 2 — no package outside `framework/db` can reach a no-database function through the database package

**PASS.** All five modules physically left the package; there is no shim. `framework/db/package.json`'s
`exports` map exposes `.`, `./zod-schemas`, and the three pre-existing `__testing__` subpaths — none of which
reach a relocated module. `rg` over the repo for the moved paths returns only `@lore` provenance comments and
governance-fixture strings, no live import.

### AC 3 — first-boot state established by a composition root; the database package writes no service-owned table

**PASS.** `rg "\.(insert|update|delete)\(" framework/db/src` excluding tests/`__testing__` returns exactly one
hit — `pg-ssl.ts:39 parsed.searchParams.delete(key)`, a URLSearchParams call, not a table write.
`framework/db/src/factory-bootstrap.ts` is deleted. The two faces (`layers/core-api/src/bootstrap/factory-state.ts`,
`layers/agent-orchestration/src/factory-run-config.ts`) route every write through the owning services
(`insertUserIfAbsent` / `setAgentCategoryForRole` / `listFactoryAgents` / `ensureFactoryKnowledgeSeed` /
`writeAgentRunConfig`). Desktop and the three tool CLIs are the only invokers; the CLIs share one runner so
they cannot diverge.

Line-by-line equivalence against `git show bbe82e9a:framework/db/src/factory-bootstrap.ts` holds, including
the two places it could have silently drifted:
- the `categoryByRole` backfill now runs *before* `listFactoryAgents`, where the original ran it *after* the
  prompt backfill — safe, because the backfill only writes `agentCategory` and the roster query filters on
  `role`/`kind`, neither of which it touches;
- `ensureFactoryKnowledgeSeed` deliberately does **not** reuse `knowledge-repository.create()`, which would
  have added a `knowledgeEditLog` row and changed first-boot state. The comment says so and the AC-7 diff proves it.

### AC 4 — the framework neither publishes to nor subscribes to the event bus

**PASS.** `rg "eventBus\.(emit|on)\(|bus\.on\(|\.emit\(" framework/` outside tests returns only comment text.
The lint reports no `framework → EventBus` group in either world. The two emit sites are inlined at
`run-orchestration/src/runtime.ts:285` and `session-requests/src/service.ts:751`, the dispatcher lives at
`layers/core-api/src/observability/dispatcher.ts`, and `events.ts` (types only) stays in shared as intended.

Break-test, validation scenario 4 — I added a real `eventBus.emit({ type: "task_state_changed", … })` to a new
`framework/shared/src/probe-emit.ts`:

```
ERROR  [crossing-event] framework/shared/src/probe-emit.ts:4: framework → EventBus [event] production —
emits `task_state_changed` (bus). the framework provides the bus. …
governance-lint: FAIL — 1 error(s).
```

Reverted; lint back to PASS. The rule names the file and the event type, exactly as the scenario requires.

### AC 5 — every `framework → *` and `* → db:util` / `* → db:unknown` production entry gone; covering rules at error

**PASS, re-derived site-by-site** (structural diff of `governance/baseline.json` at `bbe82e9a` vs HEAD):

| group removed | sites | files |
|---|---|---|
| `application → db:util [import] production` | 1 | `applications/remote-server/src/create-server.ts` |
| `layer → db:util [import] production` | 6 | `routes/{assistant,search,teams-routes,threads}.ts`, `routes/users.ts` ×2 |
| `layer → db:unknown [import] production` | 1 | `layers/core-api/src/routes/agents.ts` |
| `framework → db:table (other) [table:read] production` | 2 | `demo-fixture.ts`, `factory-bootstrap.ts` |
| `framework → db:table (other) [table:write] production` | 15 | `demo-fixture.ts` ×9, `factory-bootstrap.ts` ×6 |
| `framework → db:table (unowned) [table:write] production` | 2 | `demo-fixture.ts`, `factory-bootstrap.ts` |
| `framework → EventBus [event] production` | 2 | `agent-run-admission.ts`, `observability/dispatcher.ts` |
| `framework → layer [di] production` | 1 | `tool-provider-bindings.ts` |
| `application → db:unknown [import] development` | 1 | `applications/desktop/__tests__/migrate.test.ts` |

**30 production + 1 development sites, 9 groups. Zero groups added, zero group counts raised.** Totals move
221 → 191 production and 67 → 66 development, matching the lint summary exactly. The only surviving
`framework → *` group is `framework → db:table (other) [table:write] development` (10 sites, 4 files) — AU32's,
untouched. (Note: `architecture.md` §4.2 says "Ten groups, 31 sites"; its own enumeration lists nine. An
arithmetic slip in the plan artifact, not in the work.)

Break-test that the promoted rules bite — I added `framework/db/src/probe-write.ts` doing `db.insert(users)`:

```
ERROR  [crossing-table-write] framework/db/src/probe-write.ts:5: framework → db:table (other) [table:write]
production — `insert(users)` — writes the table. users is owned by users — go through it
```

Reverted; lint back to PASS.

### AC 6 — baseline-emptiness contingency

**Correctly does not trigger.** 29 groups remain (23 production + 6 development), 257 violations.
`governance/baseline.json` and the `--adopt` path stay, as they should.

### AC 7 — `npm run verify` green, and first boot on a clean database produces the same state as today

**PASS, both legs, and I re-derived the control rather than trusting the committed one.**

`npm run verify` re-run from scratch: **exit 0**. `typecheck-gate: PASS — all 35 packages checked`,
`governance-lint: PASS` (all three passes; `--fixtures` 63 cases, `--attacks` 49 break-tests), knip and
knip:production clean, deps:check, mock-inventory:check, core-ui build, desktop build, attestation
`scope=affected, status=passed` over 307 integration files / 2685 tests.

First-boot equivalence:

1. **Control is genuine.** I reconstructed `origin/main`'s real `applyFactoryBootstrap` (plus `seed-fixtures.ts`
   and `system-prompt-templates.ts`) from `git show bbe82e9a:…` into a scratch module, ran it against a clean
   PGlite database, and diffed the dump against the committed
   `.pipeline/work/AU29/probes/first-boot-control.json` → **empty**. The committed control is not fabricated or stale.
2. **Composition-root leg** — `first-boot-capture.ts --bootstrap` (migrations + `applyFactoryCoreState` +
   `applyFactoryRunConfigDefaults`, the exact statements `main.ts:453-460` runs) → diff vs control **empty**.
3. **CLI leg** — `npm run setup -- --db-path <scratch>` on a clean directory, then `--data-dir` capture →
   diff vs control **empty**.

**On the Electron caveat: AC 7 is genuinely met.** `main.ts`'s bootstrap block is `createPgliteDb(dbPath)` plus
the two face calls inside one try/catch; the migration step immediately above is the same `applyMigrations`.
There is no other write on the desktop first-boot path, so launching the shell could only add rows the probe
would then be missing — and the probe matched the pre-change control exactly, in both directions. The caveat
is disclosed and immaterial to database state.

### AC 8 (validation scenario 3) — `db-symbols-all-placed` fires by name

**PASS.** I appended a no-database module + barrel re-export to `framework/db`:

```
ERROR  [db-symbols-all-placed] framework/db/src/index.ts: probeNoDb — re-exported from
./probe-nodb.ts, a module governance/architecture.json does not name
governance-lint: FAIL — 1 error(s).
```

Removed both edits; `git status --porcelain` empty; `governance-lint: PASS`.

The finding names an architectural fact (an unplaced symbol and the registry that does not name its module).
It carries no count, no ledger number, no ratchet. The rule is registered in both `buildRules` and `runLive`,
carries an attack case plus an isolated control twin, and its `scope` is the `framework/db/src` file population
(`minScope: 5`) so it cannot die quietly on a clean tree.

---

## Founder rulings — honored

1. **`db:bootstrap` surface entry deleted.** `governance/architecture.json` no longer has the entry, and
   `moduleSurface` maps zero modules to it. Deleted, not emptied.
2. **The six `decided-rules.json` rows deleted.** Exactly six: `{application,tooling,layer} → db:bootstrap` and
   `{layer,service,application} → db:util`. `rows` 124 → 118; the four verdict-split literals move 68→65,
   56→53, 114→110, 10→8, which is arithmetically exactly those six rows and nothing else. No surviving row's
   verdict changed. `governance-model.test.ts` counts move in step and the model still derives all 236 answers.
3. **`totals.differ` removed, not chased.** The literal is gone; a `differNote` records why. I confirmed by
   `rg` that **no code anywhere reads `totals.differ`** — it was a pure hand-maintained number with no consumer,
   so deleting it removes a staleness trap and costs nothing. No scope was invented to preserve it and no
   counting exercise appears anywhere in the diff.

---

## BLOCKING

### B1 — the relocated `setup` CLI's `--root` flag now breaks laptop migrations

`tools/setup/src/setup-cli.ts:197`

```ts
const migrationsFolder = path.resolve(root, "framework", "db", "drizzle");
```

At `bbe82e9a`, `framework/db/src/setup-cli.ts:197` read:

```ts
const migrationsFolder = path.resolve(Dirname, "..", "drizzle");
```

The original anchored the migrations folder on **the CLI file's own location**, so `--root` could not affect it.
The new line anchors it on **`root`**, which is `parsed.root ?? defaultRoot(ctx.cwd)` (`:269`). Passing `--root`
therefore now redirects the migrations lookup. Reproduced:

```
$ npx tsx tools/setup/src/setup-cli.ts --root /tmp/fakeroot --db-path /tmp/rootdb
Error: ENOENT: no such file or directory, open '/tmp/fakeroot/framework/db/drizzle'
    at applyMigrations (framework/db/src/migrate.ts:59:9)
    at applyLaptopMigrations (tools/setup/src/setup-cli.ts:154:8)
    at runLaptop (tools/setup/src/setup-cli.ts:200:2)
```

The same invocation worked before this change. This also contradicts the flag's own contract, which the file
states two lines from the parser (`setup-cli.ts:41`): `--root <path>  Repo root override (used to locate
docker-compose.yml).` Nothing in the plan or `architecture.md` authorized widening it — §2.6 specifies the tool
package's contents are "moved verbatim except import specifiers and the bootstrap call", and while *some* change
to this line was forced by the new path depth, an equivalence-preserving one was available.

**Governing authority:** concrete regression, plus `architecture.md` §2.6's verbatim-move constraint.
**Impact:** `npm run setup --root <path>` (laptop profile) hard-fails where it previously succeeded. Also reachable
programmatically: `runSetup(argv, io, { cwd })` sets `root = cwd`, so any caller passing `ctx.cwd` inherits the
same redirection.
**Fix:** anchor on the file, as before — `path.resolve(Dirname, "..", "..", "..", "framework", "db", "drizzle")`
— and drop the `@lore` block that justifies the root-relative form.
**Honest scope:** narrow. The default path (`npm run setup`, `deploy/bin/setup`, `npm run db:bootstrap:pg`) is
unaffected and I proved it end-to-end; no in-repo caller passes `--root` with the laptop profile; the failure is
loud, not silent. It blocks because it is a demonstrated regression on a documented flag with a one-line fix,
not because it is dangerous.

---

## NON-BLOCKING DEFECTS

### N1 — `governance:new-cells` now reports 20+ cells for two surfaces that no longer exist

`scripts/governance-new-cells.ts:55-56` still lists `db:bootstrap` and `db:util` in `TARGETS_BY_KIND.import`.
Running `npx tsx scripts/governance-new-cells.ts` prints `FORBID layer → db:bootstrap [import]`,
`FORBID service → db:util [import]`, and so on, for every source role — verdicts about surfaces AU29 deleted.
This is precisely the "zero-match rot" that `architecture.md` §4.3 cites as the reason to delete the
`db:bootstrap` entry rather than empty it, left in place one file over. `scripts/lib/db-surfaces.ts:23-24`
keeps both members in the `DbSurface` union for the same reason.
Non-blocking: `governance:new-cells` is an explicitly-labelled report, not a gate (`scripts/governance-new-cells.ts:9`),
it is in no npm gate chain, and its header count was already stale before AU29 ("125 decided rows" vs 124).

### N2 — `docs/system-prompts/assistant.md:38` points at a call site AU29 deleted

> Tool availability is registry-generated, not declared here — see
> `layers/agent-orchestration/tool-handlers/src/tool-definitions.ts` and the
> `toolsForRole("assistant")` call (`framework/shared/src/tool.ts`).

`toolsForRole` no longer exists in `framework/shared/src/tool.ts` (§2.7 dissolved it). This is a shipped system
prompt an agent reads, and `architecture.md` §8 explicitly says "Sweep the whole repo, not only `docs/`" — the
sweep's `rg` pattern was path-based, so symbol-name references like this one slipped through.

### N3 — `framework/shared/src/factory-roster.ts` documents a function that no longer exists

Lines 5, 11, 60, 83 describe `applyFactoryBootstrap(db, roster?)`, "the db leaf (`framework/db`) … the bootstrap
writer", and "This is the value `applyFactoryBootstrap(db)` uses when called with no second arg". The optional
`roster` parameter died in AU28; the function itself died in this change. AU29 added a fresh `@lore AU29` block
to line 92 of this same file while leaving the surrounding prose describing a deleted API. A reader landing here
is told to look in `framework/db` for a writer that is now in two layer faces.

### N4 — `tools/setup/vitest.config.ts` comment is false

```ts
// No unit tests today — the relocated factory suites are all
// *.integration.test.{ts,tsx}, picked up by vitest.integration.config.ts's "service" project
include: ["src/**/*.test.{ts,tsx}"],
```

`tools/setup/src/__tests__/setup-cli.test.ts` exists and matches that glob. The config is correct; only the
comment is wrong. (The claim it makes about the integration lane *is* right — `vitest.integration.config.ts:63`
already globs `tools/**`, which is why `vitest.integration.config.ts` needed no edit despite `architecture.md`
§2.6 asking for one. I confirmed the relocated suites actually execute: 9 files / 92 tests green.)

### N5 — knip immediately calls the three new `tools/setup` entries redundant

`npm run knip` output lists `src/setup-cli.ts!`, `src/bootstrap-pg.ts!`, `src/seed-pg-cli.ts!` under
"Remove redundant entry pattern". Harmless (knip exits 0, and `applications/desktop`, `tools/eval` and
`framework/db` carry the same pre-existing hints), but the entries added in this change were unnecessary.

---

## FOLLOW-UP / NOTES

- **`node:fs` in `framework/shared` is safe here — verified, not assumed.** `system-prompt-templates.ts` is the
  first `fs.readFileSync` in shared production code, and shared is a direct dependency of the browser package
  `layers/core-ui`. `npm run build` emits the expected externalization warnings for `node:fs` / `node:path`, but
  the emitted bundle contains **zero** matches for `readSystemPromptTemplateForRole`, `system-prompts`,
  `readFileSync`, `node:fs`, or `browser-external` — rolldown tree-shakes the module out entirely because no
  core-ui file names any of its exports. The precedent already existed on `main`: `framework/shared/src/tool.ts`
  imports `node:crypto` and produces the same warning at `bbe82e9a`. If a future core-ui file ever imports the
  reader, the failure is a loud throw at call time, not a silent break. Requirements §3.3 settled this
  deliberately; nothing new to decide.
- **The traversal defense survived the move byte-for-byte.** `SYSTEM_PROMPT_TEMPLATE_FILES` is unchanged, the
  `role`-not-in-map early return still precedes any filesystem access, and no regex or dynamic filename was
  introduced. `readSystemPromptTemplate` became module-internal (the only diff in the function body is
  `export ` removed). `escapeLikePattern` moved with its `@lore I2 V4` and `ESCAPE '\\'` contract intact.
- **The `content !== null` skip survived and is genuinely tested.** `factory-run-config.ts:50`
  (`if (content === null) continue;`). I sanity-broke it — deleting that line turns
  `factory-run-config.integration.test.ts`'s third test red (`1 failed | 2 passed`), and restoring it turns it
  green. The test is not vacuous.
- **The two new integration tests test behavior, not shape.** Both drive real writes against the real PGlite
  fixture db and read rows back. `factory-run-config.integration.test.ts` does `vi.mock("@hyperidle/shared")`,
  but only to force one pure file-reader call to return `null` — the integration point under test
  (`agent_run_config` through `writeAgentRunConfig`) is never stubbed, and the file explains this at the top.
  Legitimate under `.claude/rules/testing.md`'s "no stub of *it*" framing.
- **No production export landed that only tests consume.** Every new barrel export has a production consumer:
  the four owner writers ← the two faces; the two faces ← `applications/desktop/src/main.ts`;
  `FactoryAgentRef` / `COMMUNITY_DISPLAY_NAMES` ← the faces; the moved substrate ← the repointed routes and
  services. `knip:production` is clean. `PROFILE_DEFAULTS` and friends stay module-level and un-barrelled, as
  §2.2 designed.
- **No test coverage was lost in the relocations.** `U1-schema-migration.integration.test.ts` shrank by 186
  lines, but all 11 of its AC6/AC7 assertions moved intact to the new `framework/db/src/__tests__/U1-schema-exports.test.ts`
  (they needed the whole `schema`/`zod-schemas` namespace, which is only legal as a same-package import). The X3
  suite split three ways along the same logic. Relocated + new suites: 9 files / 92 tests green.
- **No scope drift into AU30, AU32 or AU34.** AU30: no table owner was assigned and no general write was
  rerouted — the new writers live *inside* the tables' existing owners, which requirements §4 explicitly permits,
  and the `agentRunConfig` path reuses the already-baselined `writeAgentRunConfig` so no new crossing site
  appears. AU32: the `framework → db:table (other) [table:write] development` group still holds its 10 sites
  across the same 4 files. AU34: `framework/shared` gained 8 barrel exports and lost 3 — the "plain named
  exports" landing requirements §6 authorizes, with the audience-narrowing left to the split WP.
- **Behavioural nuance, not a defect.** The inlined emit in `session-requests/src/service.ts:761` uses
  `timestamp: now.getTime()` where the deleted helper used `Date.now()` at emit time; the `run-orchestration`
  site uses `Date.now()`. Both are within milliseconds of the original and the service's variant is arguably
  more coherent (it matches the timestamp the row is written with). No consumer depends on the difference.
- **Attestation.** The committed attestation is for `2fb23990`; HEAD is `9d5c5e51` (two `.pipeline/` +
  `.verify-attestations/` commits later). My own `npm run verify` regenerated a passing attestation for
  `9d5c5e51`; I deleted it and restored the committed file so the tree is exactly as I found it. Whether the
  committed attestation still validates against HEAD's tracked source is `/ship`'s call — `VERIFY_SECRET` is
  not set locally, so I could not check the signature.
