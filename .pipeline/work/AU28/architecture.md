# AU28 — Architecture: step 1, the production/development split

Scope: **Ruling 9 step 1 only** — the production/development rule, the file moves it requires, the
`seed.ts` deletion, and the governance lint that enforces it.

Steps 2–4 are named successors and are **not** designed here: the `layers/`/`framework/`/`tools/`
restructure (blocked on AU26), the layer access patterns for each world, splitting `shared`, and the
73 `core-api → agent-orchestration/agent-execution` import violations.

**Carried, not dropped:** Ruling 4.1 put the dead Hono RPC client (`packages/web/src/api/client.ts`,
its `@hyperidle/core-api` + `hono` manifest deps, and its `eslint.config.ts:481-483` carve-out) inside
AU28. It is not a production/development question and is not in step 1's four-item scope, so it is not
planned here — it rides whichever later AU28 step or successor touches `packages/web`'s manifest, and
must not be silently lost.

Binding inputs, in precedence order: `.pipeline/work/AU28/founder-rulings.md` (wins on any conflict),
then `plan.md`, `requirements.md`, `rule-matrix.md`, `foundation-inventory.md`.

Engineering tier: **production** (fixed input from `plan.md`).

---

## 1. Context

Two worlds share one tree. Test helpers, benches, fixtures, seeds and mocks sit in the same `src/`
directories as shipping code, are re-exported from public barrels, and are advertised in
`package.json` `exports` maps. Nothing today can state, let alone enforce, which world a file belongs
to — so the question "may production code call this?" has no mechanical answer.

Ruling 8.1 measured the crossing rule as already ~true, which makes step 1 cheap to adopt and pure
regression protection. This document confirms that at file grain and quantifies the residue.

The step-1 deliverable is therefore three things: a classifier, the moves that make the classifier's
verdict match reality, and a guard that keeps it that way.

---

## 2. Constraints

| # | Constraint | Source |
|---|---|---|
| C1 | The four-clause rule is settled. Implement it; do not redesign it. | Ruling 9 |
| C2 | A production file may never import a development file. One direction, no exceptions. | Ruling 8.1, Ruling 9 |
| C3 | `.stories.tsx` stays beside its component. | TSX-first (AJ1) |
| C4 | Package **role** never derives from a directory path. File **kind** must, because there is no per-file manifest — the safeguard is a closed, contract-enumerated pattern set. | Ruling 5, Ruling 8.3 |
| C5 | One census, many rules. Every file classifies. A rule matching zero files fails loudly. No rule does its own file discovery. | Ruling 9 |
| C6 | Known violations warn, new ones hard-fail, the count only shrinks — mechanically, in both directions. | Ruling 2, Ruling 9 |
| C7 | Static codebase properties are enforced by lint or the type system, never by a test that reads files. Runtime behaviour gets real unit tests that import and assert. | `CLAUDE.md` |
| C8 | Tests live only in `packages/`. | `CLAUDE.md` |
| C9 | `npm run verify` passes. Only new errors block. | `CLAUDE.md` |
| C10 | No relocation of packages, no layer-access rules, no `shared` split. | Ruling 9 |

---

## 3. Measured baseline

All figures recomputed in this worktree, not inherited. Method: `git ls-files` for the file set;
TypeScript AST (`ImportDeclaration` + `ExportDeclaration` + dynamic `import()`) with real module
resolution for the edges.

| Measure | Value |
|---|---|
| Tracked files, repo-wide | 3,214 |
| Tracked files under `packages/` | **2,160** |
| Tracked files outside `packages/` (all development by clause 4) | 1,054 |
| Under `packages/`: development by the settled 4-clause rule | **1,137** |
| Under `packages/`: production by the settled 4-clause rule | **1,021** |
| — of which by `__` path segment | 874 |
| — of which by `.stories.tsx` | 135 |
| — of which by wholly-development package | 128 |
| Live production → development import edges, **today** | **2** |
| Projected production → development edges **after the moves**, before fixes | **9** |
| Relative import specifiers that genuinely change under the moves | **305**, across **280** files |

**Discrepancy resolved.** The brief's 1,183 / 977 came from an earlier candidate scheme; the split
above is the settled 4-clause rule applied literally. The brief's 2,160 is `git ls-files`; a naive
filesystem walk returns 2,158 because it skips `build/`, hiding two tracked production files
(`packages/desktop/build/entitlements.mac.plist`, `packages/desktop/build/icon.icns`). That two-file
gap is the whole reason §5.1 sources the census from `git ls-files` rather than a walker.

### 3.1 The two live crossings

Both are `.test.ts` files sitting outside a `__` folder, so the rule calls them production:

```
packages/web/src/e2e-support/review-trust.test.ts:13   -> scripts/validation-composition.ts
packages/web/src/preview/MockProviders.test.tsx:19     -> packages/web/src/pages/__fixtures__/work-bet-fixtures.ts
```

Both vanish when the file moves into a `__` folder. Ruling 8.1's "zero production source files import
test or tooling code" therefore holds under the new rule as well, once these two stragglers move.

### 3.2 The nine projected crossings, and what each really is

These appear only *because* of the moves. Each is a distinct situation, not one pattern:

| # | Edge | What it actually is | Disposition |
|---|---|---|---|
| 1–2 | `harness-registry/src/llm-client.ts:651,656` → `llm-cassette.ts` | `LLM_CASSETTE_MODE`-gated dynamic import; record/replay for the e2e + harness lanes | **Ledger.** The fix is an inversion seam; it touches the cassette lane, which per-merge verify does not run. Successor WP. |
| 3 | `core-api/src/app.ts:71` → `routes/test-routes.ts` | Production Hono app statically imports test routes, registers them behind `NODE_ENV !== "production"` | **Fix (invert)** — Increment 4 |
| 4 | `db/src/index.ts:175` → `test-utils.ts` | Public barrel exports `createTestDb`/`warmPool`/`closeAllInstances`/`TestDbHandle` | **Fix (drop the line)** — Increment 3 |
| 5 | `shared/src/harness/index.ts:48` → `mock-harness-adapter.ts` | Public barrel exports `MockHarnessAdapter`, re-exported again at `shared/src/index.ts:333` | **Fix (drop both lines)** — Increment 5 |
| 6 | `web/playwright.config.ts:13` → `e2e/known-pre-existing-failures.ts` | A test-runner config, pinned to the package root by the runner's own discovery | **Rule gap — see §4.1** |
| 7 | `web/src/pages/KnowledgeDetail.tsx:67` → `fixtures/knowledge-data.ts` | A shipping page falls back to mock data when the API returns nothing | **Ledger.** Removing the fallback is a product change. Successor WP. |
| 8 | `web/src/pages/review/ReviewPage.tsx:23` → `review-composition.fixture.ts` | Same shape; `ReviewPage.tsx:217` re-exports the fixture constant | **Ledger.** Successor WP. |
| 9 | `web/src/router.tsx:112` → `pages/_dev/ArtifactDemo.tsx` | `import.meta.env.DEV` route, self-described "L3 throwaway"; **two e2e specs navigate to `/_dev/artifacts`** | **Ledger.** Deleting it requires retargeting `artifact-aggregation.spec.ts` and `artifact-embed-no-chrome.spec.ts` at the shipped L11/L12 surfaces. Successor WP. |

After Increments 3–7, the live production → development edge count is **0** and stays there. There is
no warn mode for crossings and no exception state — see §5.4.

---

## 4. What does not work in the settled rule

Two findings. Both are reported as findings, not as unilateral redesigns; §4.1 proposes the minimal
closed extension and §4.2 proposes an instrument, and both are flagged for the critique gate.

### 4.1 Test-runner configs are development, pinned to production paths, and one of them imports a development file

The four clauses classify **35 config files as production**:

- 31 × `vitest.config.ts` — one at each workspace package root, every one of them named in the root
  `vitest.config.ts` `projects` array by directory path
- 4 × `playwright.config.ts` / `playwright.ah{1,5,6}.config.ts` at `packages/web/`

They cannot move into a `__` folder: vitest and playwright discover their config by convention at the
package root, and the root `projects` list resolves each project by directory. Relocating them means
rewriting the project list, adding a `root: ".."` to every config so `include: ["src/**"]` still
resolves, and re-pointing four `--config` flags in `packages/web/package.json` — churn with no
architectural gain.

This is not academic: `packages/web/playwright.config.ts:13` statically imports
`./e2e/known-pre-existing-failures.js`. Once `e2e/` becomes `__e2e__/`, that is a hard crossing
violation on a file that is unambiguously development.

**Proposed clause 5 — test-runner configs.** A file is development if its filename matches the closed
set `vitest.config.ts`, `vitest.*.config.ts`, `playwright.config.ts`, `playwright.*.config.ts`.

Why this is a clause and not an exception, in the exact terms Ruling 8.3 set: it is enumerated,
closed, written into the contract, and hard-fails if it matches zero files — identical in shape to the
`.stories.tsx` clause, and earned by the identical reason. `.stories.tsx` gets a clause because the
TSX-first ruling pins a story beside its component; these get a clause because the test runner's own
discovery convention pins the config at the package root. In both cases the file is pinned to a
production path by a decision outside this rule's authority.

**Deliberately excluded from clause 5:** `vite.config.ts` (it builds the shipping bundle — production)
and `vite.ah{1,5,6}.config.ts` (they build the e2e app — development in nature, but they import
nothing developmental, so they go on the ledger rather than widening the pattern to `vite.ah*`, which
is the kind of shape that drifts).

### 4.2 The rule cannot express "this file is development but cannot move yet"

Four files (§3.2 rows 1–2, 7, 8, 9) are unambiguously development but have a production importer whose
fix is a real product or runtime change, out of a governance work package's scope. Under the rule as
stated the only options are (a) move them and break the build, or (b) leave them classified production
and count zero — which is a silent lie of exactly the shape that made `au6-agent-boundary-guard.ts`
report PASS on an empty directory.

**Proposed instrument — the misplacement ledger.** `scripts/prod-dev-split.ledger.json`: a committed
list of paths (file or directory prefix) that the rule classifies production and that we assert are
actually development. It does **not** change any verdict. The guard enforces four things about it:

1. Every listed path resolves to at least one tracked file. A stale entry is a hard error — the au6 lesson.
2. Every entry carries a `reason` and a `successor` (a work-package id).
3. The **resolved file count** — not the entry count — is compared against a committed number.
   Live above committed → hard fail (new debt). Live below committed → hard fail (stale baseline, lower it).
   Counting resolved files means a directory prefix cannot hide growth inside itself.
4. Entries are reported as warnings on every run, so the debt is visible rather than filed away.

This is the mechanism C6 demands, and it is the only place in the design where known debt lives.

---

## 5. Design

### 5.1 One census, many rules

Three modules, a hard structural boundary between them.

**`scripts/lib/repo-census.ts`** — the census. Pure, injectable, no I/O of its own.

```ts
export type FileKind = "production" | "development";
export type ClassificationClause =
  | "outside-packages" | "dunder-segment" | "stories-suffix"
  | "development-package" | "test-runner-config" | "default-production";

export interface FileRecord {
  readonly path: string;            // repo-relative, forward slashes
  readonly kind: FileKind;
  readonly clause: ClassificationClause;
}

export interface ImportEdge {
  readonly from: string;            // repo-relative
  readonly line: number;
  readonly specifier: string;       // as written
  readonly to: string;              // resolved, repo-relative
}

export interface Census {
  readonly files: readonly FileRecord[];
  readonly byPath: ReadonlyMap<string, FileRecord>;
  readonly edges: readonly ImportEdge[];
  readonly clauseCounts: Readonly<Record<ClassificationClause, number>>;
}

/** The classifier. Total: every path returns a kind. */
export function classifyFile(repoRelativePath: string): FileRecord;

/** Builds the census from an injected file list + reader. No fs, no git, no glob. */
export function buildCensus(input: {
  readonly files: readonly string[];
  readonly readFile: (path: string) => string;
  readonly exists: (path: string) => boolean;
}): Census;
```

The injected `files`/`readFile`/`exists` seam is what makes every unit test synthetic and what keeps
`buildCensus` free of discovery. The CLI supplies `git ls-files` and `node:fs`; nothing else may.

**`scripts/rules/*.ts`** — the rules. Each exports:

```ts
export interface Rule {
  readonly id: string;
  readonly description: string;
  /** The files/edges this rule is *about*. If this is empty the rule is dead. */
  readonly scope: (census: Census) => readonly string[];
  /** Minimum scope size. Below it, the runner throws. */
  readonly minScope: number;
  readonly evaluate: (census: Census) => readonly Finding[];
}
```

Rules receive the census. They never read the filesystem — enforced by an ESLint
`no-restricted-imports` on `scripts/rules/**` banning `node:fs`, `node:path`'s directory readers,
`node:child_process`, and any glob package. That turns C5's third bullet from a convention into a
mechanical property.

**`scripts/prod-dev-split-guard.ts`** — the runner. Calls `git ls-files`, builds the census once,
runs every rule, asserts each rule's `scope().length >= minScope`, prints findings, exits non-zero on
any error-severity finding.

### 5.2 Why a new script, not `layer-boundary-scan.ts`, and not an ESLint rule

**Not ESLint.** Three disqualifiers, each independently fatal:
1. ESLint processes files independently. Census completeness ("the file set equals `git ls-files`"),
   classification totality, and the ledger ratchet are whole-repo properties with no reliable
   end-of-run hook under caching and incremental linting.
2. ESLint only visits files its config matches. A file excluded from the ESLint config would silently
   escape the census — precisely the `au6` failure mode this design exists to make impossible.
3. `npm run lint` runs `eslint . --quiet`, which suppresses warnings. The ledger's whole value is that
   its entries are *visible* every run.

The one thing ESLint is genuinely good at here — a per-file import restriction — is used for exactly
that, and only that: the `scripts/rules/**` no-filesystem restriction in §5.1.

**Not `layer-boundary-scan.ts`.** It is the right *kind* of tool (whole-repo, pure AST,
fixture-proven) and the founder's "one census" points at consolidating on it. But: it is 618 lines
organised entirely around Layer-pair semantics; it is report-only and not in the `lint` chain; and its
role assignment is path-inferred, which Ruling 5 forbids and which step 3 must rewrite regardless.
Extending it now couples step 1's shipping schedule to a file step 3 has to restructure.

**Decision: a new script over a shared census library.** It matches every other guard in `scripts/`
(boring technology, no framework, no rule DSL — `requirements.md` §1 names a configurable
architecture-lint framework as an explicit non-goal), it is chainable into `npm run lint` today, and
`scripts/lib/repo-census.ts` is deliberately the general artifact: step 3's layer rules become
additional `Rule` modules over the same census, and `layer-boundary-scan.ts` gets re-rooted onto it
then. Step 1 ships the census that steps 3–4 consume; it does not ship a framework for rules that do
not exist yet.

### 5.3 The rule set

| Rule id | Property | Severity | Anti-rot |
|---|---|---|---|
| `census-complete` | The census file set is exactly `git ls-files` minus nothing. | error | Compares against git, not against its own walker — the check that catches the `build/` gap in §3 |
| `classification-total` | `production + development === files.length`; every record carries a clause. | error | Total by construction; the rule asserts it rather than trusting it |
| `clause-live` | Each of the six clauses matches at least its declared floor (`outside-packages` ≥ 1000, `dunder-segment` ≥ 800, `stories-suffix` ≥ 100, `development-package` ≥ 100, `test-runner-config` ≥ 30, `default-production` ≥ 900). | error | **The au6 fix.** A clause that stops matching — because its directory was deleted or renamed — fails loudly instead of passing on nothing |
| `no-production-imports-development` | Zero edges where `from` is production and `to` is development. | error | Scope = all production files, floor 900. Cannot pass by scanning nothing |
| `ledger-sound` | Every ledger path resolves to ≥1 tracked file; every entry has `reason` + `successor`. | error | Stale entry = hard fail |
| `ledger-ratchet` | Resolved ledger file count `=== committed`. | error | Bidirectional: above fails as new debt, below fails as a stale baseline |
| `ledger-visible` | Emit one warning per ledger entry with its reason and successor. | warn | Debt is reported every run, never filed away |

Guard reconciliation — every rule above is a step-1 rule; the layer rules that the other guards
enforce are step 3's and are untouched here.

### 5.4 No exception state

There is no allowlist for `no-production-imports-development`, no `--skip`, no per-file suppression
comment, and no severity override. The ledger is not an exception mechanism: a ledgered file is
classified production by the rule, so it produces no crossing to exempt. The two mechanisms cannot be
confused because they operate on different objects — the ledger holds *files*, the crossing rule holds
*edges*, and the crossing rule's committed count is the literal constant `0`.

---

## 6. The move list

Complete, recomputed. `git mv` throughout; `git log --follow` preserves history.

### 6.1 Moves — `packages/db` (7 files)

| From | To | Notes |
|---|---|---|
| `src/test-utils.ts` | `src/__testing__/test-utils.ts` | barrel line 175 deleted |
| `src/test-fixtures.ts` | `src/__testing__/test-fixtures.ts` | `exports` map `./test-fixtures` repointed |
| `src/test-pool.ts` | `src/__testing__/test-pool.ts` | `exports` map `./test-pool` repointed |
| `src/pg-test-runner.ts` | `src/__testing__/pg-test-runner.ts` | root script `test:pg` repointed |
| `src/seed-pg-cli.ts` | `src/__testing__/seed-pg-cli.ts` | root script `db:seed:pg` repointed |
| `src/vitest-setup.ts` | `src/__testing__/vitest-setup.ts` | `vitest.config.ts` `setupFiles` string repointed |
| `src/vitest-integration-setup.ts` | `src/__testing__/vitest-integration-setup.ts` | integration config `setupFiles` repointed |
| `scripts/strip-public-schema.ts` | `__scripts__/strip-public-schema.ts` | package script `generate` repointed |

**Deleted:** `src/seed.ts` — see §6.6.

**Correction to the brief — two files on its db list are production and must NOT move:**

- **`src/seed-fixtures.ts` is production.** `packages/db/src/factory-bootstrap.ts:7` imports
  `COMMUNITY_DISPLAY_NAMES` and `FACILITATOR_TOOLS` from it. Factory bootstrap is production by the
  brief's own statement; the name is misleading, the content is factory reference data.
- **`src/demo-fixture.ts` is production.** `setup-cli.ts:164` calls `seedDemoWorld` behind the shipped
  `--demo` flag. That flag is a user-facing onboarding affordance, not a test hook. This is the same
  resolution the session already reached for `shared/src/artifact-preview.ts`. If the founder wants
  `--demo` removed, that is a product decision and a separate work package; step 1 must not delete a
  shipped CLI flag to satisfy a lint. Flagged for critique.

`db/src/index.ts:19`'s `export { seedDemoWorld }` therefore stays — it is a production → production
edge.

### 6.2 Moves — `packages/core-api` (5 files)

| From | To | Notes |
|---|---|---|
| `src/test-utils.ts` | `src/__testing__/test-utils.ts` | 15 importer files |
| `src/test-fixtures.ts` | `src/__testing__/test-fixtures.ts` | **240 import statements** — 136 × `"../test-fixtures.js"`, 104 × `"../../test-fixtures.js"` |
| `src/vitest-setup.ts` | `src/__testing__/vitest-setup.ts` | `setupFiles` string |
| `src/routes/test-routes.ts` | `src/__testing__/test-routes.ts` | + the `app.ts` inversion, §6.7 |
| `git-export/src/testing.ts` | `git-export/src/__testing__/index.ts` | `exports` map `./testing` repointed; 0 importers |
| `src/middleware/validate.route-boundary.test.ts` | `src/middleware/__tests__/validate.route-boundary.test.ts` | straggler test |

### 6.3 Moves — `packages/shared`, `packages/design-system`, `packages/agent-execution`

| From | To | Notes |
|---|---|---|
| `shared/src/harness/mock-harness-adapter.ts` | `shared/src/harness/__testing__/mock-harness-adapter.ts` | drop `harness/index.ts:48` **and** `src/index.ts:333`; repoint 2 test files |
| `design-system/src/test-setup.ts` | `design-system/src/__testing__/test-setup.ts` | `setupFiles` string; 0 importers |
| `design-system/research/` (81 files: 15 `.md`, 66 `.png`) | `design-system/__research__/` | zero code, zero imports — one `git mv` |
| `design-system/scripts/inspect-page.ts` | `design-system/__scripts__/inspect-page.ts` | root script `ds:inspect` repointed |

`agent-execution/harness-registry/src/llm-cassette.ts` does **not** move — ledgered (§3.2 rows 1–2).

### 6.4 Moves — `packages/web`

| From | To | Notes |
|---|---|---|
| `src/test-setup.ts` | `src/__testing__/test-setup.ts` | `setupFiles` string |
| `src/preview/` (3 files) | `src/__preview__/` | includes `MockProviders.test.tsx` — closes live crossing #2 |
| `src/e2e-support/` (2 files, both `.test.ts`) | `src/__tests__/` | closes live crossing #1 |
| `src/pages/review/source-link-guard.test.ts` | `src/pages/review/__tests__/` | straggler test |
| `src/pages/work/sortTeamsByAttention.test.ts` | `src/pages/work/__tests__/` | straggler test |
| `src/shell/DesktopTitleBar.test.tsx` | `src/shell/__tests__/` | straggler test |
| `e2e/` (92 files: 91 `.ts`, 1 `.json`) | `__e2e__/` | `playwright*.config.ts` `testDir`; `.gitignore`/knip path fragments |
| `scripts/` (7 files) | `__scripts__/` | step 2 relocates these into `tools/`; `__scripts__` is the step-1 holding position |

`src/fixtures/knowledge-data.ts` and `src/pages/review/review-composition.fixture.ts` and
`src/pages/_dev/ArtifactDemo.tsx` do **not** move — ledgered (§3.2 rows 7–9).

### 6.5 Moves — `packages/desktop`

`scripts/` (4 files: `build-local.sh`, `bundle.ts`, `check-native.ts`, `release.sh`) →
`__scripts__/`. Root scripts `build:desktop:local` and `check:native` repointed.

### 6.6 `seed.ts` deletion — the brief's footprint is wrong

The brief states "only callers are 5 in `db/src/__tests__/X3-agent-config.integration.test.ts`."
Measured: **four test files, 30 call sites, plus the barrel export.**

| File | `seed(` call sites | Lines |
|---|---|---|
| `db/src/__tests__/seed.integration.test.ts` | 12 | 275 |
| `db/src/__tests__/U1-schema-migration.integration.test.ts` | 10 | 706 |
| `db/src/__tests__/X3-agent-config.integration.test.ts` | 6 | 282 |
| `db/src/__tests__/AD8a-category-rename.integration.test.ts` | 2 | 51 |
| `db/src/index.ts:168` | — | export |

Plan: replace `await seed(db)` with `await applyFactoryBootstrap(db); await seedDemoWorld(db);` at all
30 sites — `seed()` is a 3-line wrapper around exactly that pair, so the substitution is
behaviour-identical by inspection. `seed.integration.test.ts` is a test *of the wrapper*; its
assertions are about the combined post-state ("produces factory layer + demo world"), which the pair
still produces, so it is renamed `factory-and-demo.integration.test.ts` and kept rather than deleted —
it is the only coverage of the combined bootstrap.

`scripts/demo-fixture-guard.ts:52-53` lists `packages/db/src/seed.{ts,js}` in `PERMITTED_SUFFIXES` and
has **no stale-entry detection** — after the deletion those two entries become permanently dead
allowlist rows nobody will notice. Both are removed in the same increment, and the guard gains an
existence assertion on its own allowlist (a five-line change, and exactly the class of rot AU28 exists
to end).

### 6.7 The three inversions that the moves force

**`core-api/src/app.ts`.** Delete the `registerTestRoutes` import and the
`if (process.env.NODE_ENV !== "production")` block. The only consumer is
`src/__tests__/api-scaffold.integration.test.ts`, which gets `app` from the `test-fixtures.js` fixture.
The fixture builds the app, so `registerTestRoutes` moves into the fixture's app construction, behind
an opt-in fixture option — development registering into production, which is the legal direction.

**`db/src/index.ts:175`.** Delete the line. Eight files import `createTestDb`/`warmPool`/
`closeAllInstances`/`TestDbHandle` from `"@hyperidle/db"`; they move to a new
`"@hyperidle/db/testing"` subpath export pointing at `src/__testing__/test-utils.ts`. Seven further
importers already use a relative path and only need the path updated.

**`shared/src/harness/index.ts:48` and `shared/src/index.ts:333`.** Delete both lines. The only two
consumers are `shared/src/__tests__/harness-adapter.test.ts` and
`shared/src/__tests__/money-harness.test.ts`; both switch to the direct `__testing__` path.

### 6.8 Import-path churn, quantified

| Package | Relative specifiers that genuinely change |
|---|---|
| `packages/core-api/src` | **259** |
| `packages/web/src` | 20 |
| `packages/db/src` | 13 |
| `packages/agent-execution/harness-registry` | 5 |
| `packages/shared/src` | 5 |
| `packages/core-api/git-export` | 2 |
| `packages/web/playwright.config.ts` | 1 |
| **Total** | **305 specifiers across 280 files** |

Two things this number deliberately excludes, both load-bearing:

- **63 imports of `@hyperidle/db/test-fixtures` need zero change.** They resolve through the
  `exports` map, so repointing one manifest entry covers all 63. Same for `./test-pool` and
  git-export's `./testing`. Ruling 9 calls these public entry points a breach — and they are, but the
  breach is that a *production* file could import them, which the crossing rule now catches directly.
  Keeping the subpaths (repointed) and letting the crossing rule police their consumers is strictly
  stronger than deleting them and rewriting 63 call sites.
- **String-path references are not import edges** and no AST scan will find them: vitest `setupFiles`,
  playwright `testDir`, the root `vitest.config.ts` `projects` array, `.gitignore`, knip config, the
  eight `npm run` script paths in §6.1/6.3/6.5, and `PERMITTED_SURFACE_PATH_FRAGMENTS` in
  `packages/eslint-plugin-design/src/mock-data-policy.ts:62-66` (which contains `/e2e/` and must
  become `/__e2e__/`). Each is enumerated in the increment that moves its target, and each is
  proven by the corresponding command actually running — not by the guard.

---

## 7. Existing guards: subsumed, retained, retired

| Guard | Disposition | Why |
|---|---|---|
| `au6-agent-boundary-guard.ts` | **Retired — deleted from `scripts/` and from the `lint` chain** | Verified dead in this worktree: `SOURCE_ROOTS = ["packages/server/src"]`, that directory does not exist, `npx tsx scripts/au6-agent-boundary-guard.ts --check` prints `PASS` and exits `0` having visited zero files, seventh in the chain. Its two remaining rules are file-scoped to `packages/server/src/services/routine-scheduler.ts`, also gone, and its `ALLOWED_DIRECT_CONSUMER_IMPORTS` set is already empty. There is nothing to re-root. `clause-live` makes the failure mode impossible for every AU28 rule. |
| `demo-fixture-guard.ts` | **Retained, repaired** | Not subsumed — it enforces a mock-data rule, not a prod/dev rule. Two stale allowlist entries removed with `seed.ts`; gains an existence assertion on its own allowlist. |
| `test-naming-guard.ts` | **Retained, verified** | Adjacent (test-file naming) and does its own discovery over `packages/`, which the moves change. Not subsumed in step 1; its scan must stay green through every move increment. |
| `mock-inventory.ts` + `eslint-plugin-design` mock-data rules | **Retained, path fragments updated** | `PERMITTED_SURFACE_PATH_FRAGMENTS` hardcodes `/e2e/`; the `__e2e__` move requires updating it. Overlaps AU28 conceptually; consolidating is step 3's call, not step 1's. |
| `table-ownership-guard.ts` | **Retained untouched** | A layer/ownership rule. Its 57-violation scan-scope hole is real and is step 3/4's, per Ruling 2. |
| `execution-boundary-guard.ts`, `composition-boundary-guard.ts`, `composition-edge-anti-regrowth-guard.ts` | **Retained untouched** | Layer rules; `plan.md`'s constraint forbids weakening the anti-regrowth guard, and step 1 does not touch it. |
| `layer-boundary-scan.ts` | **Retained untouched; scheduled** | Report-only, not in `lint`. Step 3 re-roots it onto `repo-census.ts` — recorded here so the successor is named, not designed. |

Net change to the `lint` chain: `au6-agent-boundary-guard.ts` out, `prod-dev-split-guard.ts` in.

---

## 8. Acceptance criteria and verification

Verification method per C7: a **unit test** for runtime behaviour (imports the module, asserts on
return values, synthetic inputs); a **lint rule** for static codebase properties; a **command** for
things only running the real thing proves. No acceptance criterion is verified by a test that reads
source files off disk.

| AC | Criterion | Verification |
|---|---|---|
| **AC-1** | `classifyFile` implements the settled rule plus clause 5, is total (every path returns a kind and a clause), and applies the clauses in a fixed, tested precedence. | **Unit test** — `packages/db/src/__tests__/au28-file-classifier.test.ts` imports `classifyFile` from `scripts/lib/repo-census.ts` and asserts each clause, the default, precedence between overlapping clauses, and that `__generated__/x.ts` is development with no special case (Ruling 9: `__` means development, full stop). |
| **AC-2** | `buildCensus` classifies every file it is given, with no residue, and returns per-clause counts. | **Unit test** — synthetic file list in, `production + development === files.length`, `clauseCounts` sums to the total. |
| **AC-3** | The runner throws when a rule's scope is empty or below its floor. | **Unit test** — construct a `Rule` with `minScope: 1` whose `scope` returns `[]`, assert `runRules` throws naming the rule id. This is the au6 defect, asserted directly. |
| **AC-4** | The ledger ratchet fails in **both** directions. | **Unit test** — pure `compareLedger(committed, live)`: `live > committed` → error; `live < committed` → error naming the stale baseline; equal → ok. |
| **AC-5** | The ledger rejects a stale entry and an entry missing `reason`/`successor`. | **Unit test** — synthetic census + synthetic ledger. |
| **AC-6** | No production file imports a development file, repo-wide. | **Lint rule** — `no-production-imports-development` in `npm run lint`. Committed count is the literal `0`; no allowlist exists. |
| **AC-7** | The census file set equals `git ls-files`. | **Lint rule** — `census-complete`. Regression-proven by the `build/` gap in §3: a walker-based census misses two tracked files, a git-based one does not. |
| **AC-8** | No rule performs its own file discovery. | **Lint rule** — ESLint `no-restricted-imports` on `scripts/rules/**` banning `node:fs`, `node:child_process`, and glob packages. Static property, so lint, not a test. |
| **AC-9** | The guard runs in `npm run lint`, warns on every ledger entry, and hard-fails on a new crossing. | **Command + real red.** Add a scratch commit with `import { MockHarnessAdapter } from "../harness/__testing__/mock-harness-adapter.js"` inside a production `shared/src` file; `npm run lint` fails citing file, line, both classifications, and the clause that made the target development. Revert. Fixture-only proof is not accepted. |
| **AC-10** | `packages/db/src/seed.ts` is deleted, all 30 call sites use `applyFactoryBootstrap` + `seedDemoWorld`, and the barrel export is gone. | **Command** — `npm run test:integration:service` green (all four affected files are integration tests). `npm run knip` shows no new unused export. |
| **AC-11** | `au6-agent-boundary-guard.ts` is deleted and out of the `lint` chain, and no other chain entry visits a directory that does not exist. | **Lint rule** — the `clause-live` floors cover AU28's own rules; for the retained guards, the increment that lands `prod-dev-split-guard.ts` asserts each retained guard's scan root exists and is non-empty (a six-line shared assertion in `scripts/lib/`). |
| **AC-12** | Every move preserves behaviour: no test lost, no script broken. | **Command** — `npm run verify` green at the end of every increment, plus `npm run test:e2e` on the increment that moves `e2e/`, and `npm run db:seed:pg`/`npm run test:pg`/`npm run ds:inspect`/`npm run check:native` each executed once on the increment that repoints them. Test *count* compared before and after each move increment, not just pass/fail. |
| **AC-13** | The developer-facing rule is written down where a developer will hit it. | The prod/dev rule, the five clauses, and the ledger's meaning land in `docs/guides/developer/` and in `CLAUDE.md`'s test-file section. Verified by the write-docs gate, not mechanically. |

### 8.1 Definition of done

`npm run verify` green; `npm run test:e2e` green; the four repointed npm scripts each executed;
AC-9's real-red performed and reverted with the output pasted into the PR; ledger count committed and
matching; test count unchanged across the whole work package.

---

## 9. Ordered increments

Each is independently shippable and independently verifiable. Crossings are hard-zero from Increment 2
onward, so every later increment must fix what its own moves expose, in the same increment.

**Increment 1 — the census library (red first).**
`scripts/lib/repo-census.ts` with `classifyFile`, `buildCensus`, `compareLedger`, and the `Rule` type.
Unit tests first: `packages/db/src/__tests__/au28-file-classifier.test.ts` and
`au28-census.test.ts` (the established home — eleven guard-logic tests already live there and import
from `scripts/lib/`). No wiring, no behaviour change.
*Proves:* AC-1, AC-2, AC-4, AC-5. *Verify:* `npm run test`.

**Increment 2 — the guard, in the chain, crossings at zero.**
`scripts/prod-dev-split-guard.ts` + `scripts/rules/*.ts` + `scripts/prod-dev-split.ledger.json`.
Move the two live crossings (`web/src/e2e-support/` → `src/__tests__/`,
`web/src/preview/` → `src/__preview__/`) so the crossing count is 0 at landing. Add clause 5. Add the
ESLint restriction on `scripts/rules/**`. Delete `au6-agent-boundary-guard.ts` and its chain entry;
add the scan-root assertion for the retained guards. Seed the ledger with the full known-misplaced set
as directory-prefix entries.
*Proves:* AC-3, AC-6, AC-7, AC-8, AC-9, AC-11. *Verify:* `npm run lint`; the AC-9 real-red.

**Increment 3 — `packages/db`.**
Seven moves; delete `seed.ts` and rewrite its 30 call sites; drop barrel line 175; add the
`./testing` subpath and repoint 8 barrel importers; repoint `./test-fixtures` + `./test-pool`;
repoint `test:pg`, `db:seed:pg`, `generate`, and two `setupFiles` strings; repair
`demo-fixture-guard.ts`; shrink the ledger.
*Proves:* AC-10. *Verify:* `npm run test:integration:service`, `npm run db:seed:pg`, `npm run test:pg`, `npm run verify`.
*Note:* `seed-fixtures.ts` and `demo-fixture.ts` stay production (§6.1).

**Increment 4 — `packages/core-api`.**
Five moves plus the straggler middleware test; the `app.ts` inversion; **259 specifier rewrites**
(mechanical, two distinct patterns: `"../test-fixtures.js"` → `"../__testing__/test-fixtures.js"` and
`"../../test-fixtures.js"` → `"../../__testing__/test-fixtures.js"`); git-export `exports` repointed.
Largest increment by churn, smallest by risk — the rewrite is uniform and `tsc` catches every miss.
*Verify:* `npm run check` then `npm run verify`; test count unchanged.

**Increment 5 — `shared`, `design-system`, `agent-execution`.**
`mock-harness-adapter` move + both barrel lines dropped + two test files repointed;
`design-system/src/test-setup.ts`; `research/` → `__research__/`; `scripts/` → `__scripts__/` with
`ds:inspect` repointed. `llm-cassette.ts` stays and is ledgered with its successor.
*Verify:* `npm run verify`.

**Increment 6 — `packages/web` source.**
`src/test-setup.ts`; the three straggler tests. `fixtures/knowledge-data.ts`,
`review-composition.fixture.ts` and `pages/_dev/` stay and are ledgered with successors.
*Verify:* `npm run verify`.

**Increment 7 — `e2e/` and the remaining `scripts/` directories.**
`web/e2e/` → `web/__e2e__/` (92 files, one `git mv`); `web/scripts/` → `web/__scripts__/`;
`desktop/scripts/` → `desktop/__scripts__/`. Repoint four playwright `testDir`s, the
`playwright.config.ts:13` import, `build:desktop:local`, `check:native`, and
`mock-data-policy.ts`'s `/e2e/` fragment. Highest string-path risk of any increment — nothing here is
an import edge, so `tsc` proves nothing and only running the lanes does.
*Verify:* `npm run test:e2e`, `npm run mock-inventory:check`, `npm run build:desktop:local`, `npm run verify`.

**Increment 8 — the written rule + ledger finalisation.**
The rule, the five clauses and the ledger's meaning into `docs/guides/developer/`; `CLAUDE.md`'s
test-file section updated; ledger committed at its final count with every successor named. Steps 2–4
recorded in `.pipeline/AU.md` as named successors.
*Proves:* AC-13. *Verify:* `npm run verify`; write-docs gate.

---

## 10. Trade-offs

**Clause 5 widens the founder's rule.** Four clauses became five. The alternative is 35 config files
permanently misclassified plus one unfixable crossing, or a large mechanical churn through the vitest
project list for no architectural gain. Clause 5 is closed, enumerated, floor-checked, and earned by
the same reasoning that earned `.stories.tsx` its clause. **Flagged for critique.**

**The ledger is a human-maintained assertion.** The guard can prove an entry's path exists, that the
count only shrinks, and that a successor is named — it cannot prove the claim "this file is really
development." Accepted: the alternative is either breaking four working subsystems inside a governance
work package, or leaving the debt invisible. Anti-rot is the four mechanical checks in §4.2.

**`demo-fixture.ts` and `seed-fixtures.ts` classified production.** Both contradict the brief's list.
The evidence is a production importer in each case (`setup-cli.ts:164` behind the shipped `--demo`
flag; `factory-bootstrap.ts:7`). The counter-argument — that a file named `demo-fixture` obviously
belongs to the development world — is real, and the resolution is a product decision about whether
`--demo` should exist at all. **Flagged for critique.**

**`web/scripts/` goes to `__scripts__/` rather than a tools package.** Open question 7 recommends
relocating it into a Tooling package, and that is right — but it is a package relocation, which
Ruling 9 puts in step 2. `__scripts__/` is the step-1 holding position that makes the classification
honest today and costs one extra `git mv` at step 2.

**Keeping `db`'s `./test-fixtures` and `./test-pool` subpath exports.** Ruling 9 names them as
breaches. Deleting them means rewriting 63 call sites for no enforcement gain, because the crossing
rule now catches any production consumer directly at the import. Retaining and repointing is strictly
stronger and 63 edits cheaper. **Flagged for critique** — it is a deliberate partial departure from
the ruling's framing, though not from its rule.

**Increment 4 is 259 rewrites in one commit.** Splitting by directory would make the intermediate
states inconsistent (half the tests importing a moved fixture, half not) without reducing risk. The
rewrite is uniform, and `tsc` catches every miss before anything runs.

## 11. Open questions for the critique gate

1. Clause 5 — accept, or accept a narrower/wider pattern set?
2. `demo-fixture.ts` production, or is `--demo` itself the thing to remove (successor WP)?
3. Retain the `db` development subpath exports, or delete them and rewrite 63 call sites?
4. Is the four-entry ledger the right landing state, or should any of the four inversions be pulled
   into step 1 — most plausibly `llm-cassette.ts`, whose fix is a registration seam rather than a
   product change?
