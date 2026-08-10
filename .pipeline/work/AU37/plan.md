# AU37 — Dissolve `scripts/`: repo tooling lives under `tools/` like every other tool

## Work package

**Outcome.** `scripts/` stops existing. Every tool that was in it lives in a real workspace — under `tools/` alongside the other tooling packages, or inside the package it serves — and anything in it that nothing reaches is deleted rather than relocated. A developer looking at the repo root sees four roots (`layers/`, `framework/`, `applications/`, `tools/`) and no fifth folder that fits none of them.

**Why this matters.** The founder's framing, and the reason this is worth doing: *"generally the scripts folder makes no sense under our current architecture"* — and, on governance specifically, *"it is a tool like the other lint rules and not a top level folder."* `scripts/` predates the four-root split and is the last thing that did not follow it.

The cost of leaving it is not aesthetic. Because `scripts/` is not a workspace, everything in it is special-cased by hand, and each special case is a place the repo lies to itself:

- `scripts/typecheck-gate.ts:87` carries `EXTRA_PROJECTS = ["scripts"]`, threaded through the error regex (`:96`), the project loop (`:129`) and the artifact sweep (`:586`), purely because the folder it lives in is not a package.
- `knip.json:37` declares *every* `scripts/*.ts` and `scripts/lib/**` file a forced entry point. That means knip — the tool that answers "is this dead?" — structurally cannot report a dead script. Nobody can tell whether `obs.ts` is still used, and nobody has been able to for as long as that line has existed.
- Five `@opentelemetry/*` packages sit in the root `devDependencies` for exactly one consumer, `scripts/obs.ts`, which nothing but three npm aliases mentions.
- `.gitignore` carries the same four-line `scripts/**` compiled-artifact block **twice** (lines 56-60 and 101-105), because `scripts/` is typechecked only as a side effect of tests in `framework/db` and `framework/api-contract` reaching four directories up into it, which drags it into a composite build that emits `.js` next to the `.ts`. That hazard is documented in the `.gitignore` lore and in `no-stale-build-artifacts.ts`.

Who benefits: every agent and developer who has to work out where a tool lives, whether it is alive, and why the typecheck gate has a branch for one directory.

**Type.** infra.

**What exists today.** The four roots are real npm workspace globs (`package.json:9-15`: `layers/*`, `layers/*/*`, `framework/*`, `applications/*`, `tools/*`), and `tools/` already holds `eslint-plugin-authz`, `eslint-plugin-design`, `eval`, `setup` and now `governance`. The governance classification model already treats `tools/` as the one wholly-development role root (`repo-census.ts`, `DEVELOPMENT_ROOTS = ["tools"]`), so a tool that moves there stays in the same world it was in — `scripts/` classifies as `outside-production-roots`, which is development too.

**The move has a worked example, already on `main`.** Commit `08f7db16`, merged as part of PR #467 (`d9fdd3df`), moved `governance/` — the five data records plus the whole engine (`governance-lint.ts`, `governance-context.ts`, `governance-floors.ts`, `governance-new-cells.ts`, the governance-owned half of `scripts/lib/`, and all of `scripts/rules/`) — into `tools/governance/`. That commit is the pattern to follow, not to re-derive. What it established: `tools/governance/` is a real workspace with `package.json` + `tsconfig.json`; `typecheck-gate.ts`'s existing package discovery picks it up with no new special case; `no-per-file-allowances`'s closed-set anchor had to follow the code and was scoped to the package root so `src/` reads as source; and the `framework/db` acceptance tests were **repointed, not moved**, with a stated reason (they test real `PgTable` ownership and would lose that outside `framework/db`).

**What `scripts/` holds now**, verified against `main` at `d9fdd3df` rather than from memory: `verify-attest.ts`, `check-attestation.ts`, `typecheck-gate.ts`, `dep-manifest-lint.ts`, `mock-inventory.ts`, `knip-production-test-files.mjs`, `ah6-smoke-local.ts`, `obs.ts`, `trace-collector.ts`, `validation-composition.ts`, `lib/` (`attestation-floor.ts`, `attestation-scope.ts`, `dep-manifest-verdict.ts`, `honest-harness-predicate.ts`, `mock-inventory-types.ts`, `typecheck-verdict.ts`), `tsconfig.json`, `typecheck-debt.schema.json`.

**Live references that must follow the code:** root `package.json` (11 script lines), `.github/workflows/ci.yml:120` and `release-guard.yml:111`, `knip.json:37-38`, `biome.json:163` and `:227`, `.gitignore` (two blocks), `typecheck-debt.json:2` (`$schema`), and named paths in `docs/agent-layer/harness-coverage-enforcement.md`, `docs/guides/developer/testing.md`, `docs/guides/developer/linting-and-formatting.md`, `docs/guides/developer/mock-data-policy.md` and `docs/guides/developer/commands.md`. Tests reach in from `framework/api-contract/src/__tests__/` (2 files), `framework/db/src/__tests__/` (5 files) and `layers/core-ui/src/__tests__/review-trust.test.ts`, all by four-level relative path. `eslint.config.ts` no longer names `scripts/` at all — its one clause went with governance.

**One reference that is not a reference:** `tools/governance/src/lib/governance-fixtures.ts:90` contains the string `"../../../scripts/outside.js"` inside a synthetic fixture census. It is an invented path used to prove a rule fires, not a path on disk. Rewriting it would change what the fixture tests. Leave it.

**A gap the governance move left open, which this work package closes:** `.gitignore`'s compiled-artifact blocks are still anchored on `scripts/**`, and `tools/*/src/**` is ignored only for `.js.map` / `.d.ts.map`, not for `.js` / `.d.ts`. So the exact hazard the lore describes is currently unprotected at governance's new location. The `no-stale-build-artifacts` rule itself is census-wide and does cover it, but the ignore patterns lag the code.

**Nothing in production reaches into `scripts/`.** Verified by import scan: every importer is a `.test.ts` file or sits under a `__`-prefixed path segment, so every one is already development. There is no existing violation to fix and none to carry across.

**Missing delta.** Each surviving tool needs a home that is a workspace, and the tools that nothing reaches need deleting instead. Neither has been decided, and the decision is per file, not one blanket answer.

**What the build must settle.** Four genuinely open questions. Each needs a stated verdict, not an assumption:

1. **Grouping.** One `tools/repo-tooling` package, or several small ones split by job (attestation, typecheck, dependency lint, diagnostics)? The governance move suggests cohesion counts for more than package count, but this is a real choice with a real trade-off, and it should be argued rather than inherited.
2. **Three destinations per file, not two.** A tool can move to a `tools/` package, move *into the package it serves*, or be deleted. Two files point at the third destination on inspection and need a verdict either way: `ah6-smoke-local.ts` orchestrates a lane whose other pieces already live in `layers/core-ui/__scripts__/` and `layers/core-ui/playwright.ah6.config.ts`; `validation-composition.ts` is 20 lines that import `layers/core-ui/__e2e__/support/*` and are consumed by exactly one test in the same package.
3. **What is actually dead.** `obs.ts`, `trace-collector.ts`, `ah6-smoke-local.ts` and `validation-composition.ts` are the candidates. Deleting a dead tool beats relocating it. Knip is the tool that answers this — **but not as configured**: `knip.json:37` forces every `scripts/*.ts` to be an entry point, so knip is blind here today and will stay blind if the new packages inherit a blanket entry glob. Getting an honest answer is part of the work, not a precondition for it.
4. **`scripts/lib/`** — six files, consumed by the tools beside them and by eight test files in `framework/db`, `framework/api-contract` and `layers/core-ui`. Whether `lib/` is a shared surface with its own home or dissolves into whichever tool owns each file, and whether those tests move or are repointed. The governance move repointed and gave a reason; apply the same test per file rather than defaulting either way.

**Depends on.** None. AU31 merged as `d9fdd3df` (PR #467) and took the governance half of `scripts/` with it, so the tree this work package starts from already exists on `main`.

**Complexity.** M

**Engineering tier.** production — the code being moved is development-world tooling, but four of these files *are* the gate that proves every change in this repo, so a defect here does not break a feature, it breaks the ability to tell whether anything works. (`pipeline.config.yml` declares no project-level `engineering.tier`; this is a WP-level assignment, matching Z9's note.)

**Pre-build.** Architecture required. Refinement not required — the outcome is settled and the destination model already exists and has been exercised once; nothing here is an unresolved concept. Architecture must produce a **per-file verdict table** covering every remaining file — destination, or deletion with the evidence for it — plus the package grouping and its argument, plus the answer on `lib/` and on where the tests that consume it live. A blanket "move everything to one package" answer without per-file reasoning is the failure mode. Design not required — no user-facing surface.

**Constraints.**

- **The verify path is the load-bearing risk and the plan's shape follows from it.** `verify-attest.ts`, `check-attestation.ts`, `typecheck-gate.ts` and `dep-manifest-lint.ts` are wired into `npm run verify` and into the CI job that gates every pull request in this repo. Moving them changes the thing that proves changes work, and this is a demonstrated hazard, not a hypothetical one — the branch that did the governance move lost a CI cycle to attestation drift. **The honest proof is that CI itself goes green on this work package's own pull request, through the relocated attestation writer and checker.** A green local `npm run verify` does not prove it, because a local run is exactly what an attestation-path defect leaves working.
- This is also why the work is its own package rather than a tail on the governance move: it must land on a branch where breaking verify does not simultaneously destroy the evidence for unrelated work.
- Every destination under `tools/*` is an npm workspace and needs `package.json` + `tsconfig.json`.
- `tools/` sits outside the shipping roots, so everything there is the development world. A production file may never import it — one direction, no exceptions, no allowlist.
- Behavior is unchanged. Every tool does after the move exactly what it did before; this is placement, not a rewrite.
- No governance rule is weakened to make a move work. No rule gains an exemption, no per-file allowance is added, and `misplaced-files.json` gains no entry. Any rule anchor or ignore pattern that names `scripts/` follows the code to its new location, or is deleted because the hazard it covered no longer exists — it is never left pointing at a folder that is gone, which is a guard matching zero files and reading as passing forever.
- No work package identifier in any rule id, JSON key, filename or package name, and none under `tools/governance/`. Those belong in `.pipeline/` only.

**Out of scope.**

- The governance move itself — already merged. This package starts from the tree it left behind.
- Changing what any tool does, what it checks, or how strictly. Placement only.
- Rehoming `tools/eval`, `tools/setup`, `tools/governance`, `tools/eslint-plugin-authz`, `tools/eslint-plugin-design`, or reorganising the `__scripts__/` folders that already exist inside packages.
- Restructuring the CI workflows beyond making their paths resolve.
- The stale `scripts/check-version-sync.ts` reference in `docs/deployment/releases.md`, which names a file that does not exist. Correct it if the same doc sweep touches that page; do not go hunting for its peers here.

## Acceptance criteria

- `scripts/` does not exist at the repo root — no file, no directory.
- Every tool that survives lives either in a workspace under `tools/` with its own `package.json` and `tsconfig.json`, or inside the package it serves. Nothing survives outside a package.
- Every live reference to a moved file resolves at its new path: root `package.json`, both GitHub workflows, `knip.json`, `biome.json`, `.gitignore`, `typecheck-debt.json`'s `$schema`, and every `docs/` page that names one.
- The typecheck gate finds the relocated tooling through its ordinary package discovery. Its `scripts` special case is deleted, not repointed at a new folder.
- CI passes on this work package's own pull request, running the relocated attestation writer and checker end to end.
- Everything that survives is reached by something real — an npm script, a CI job, a test, or another tool. Anything unreached is deleted in this package, together with any root dependency that existed only for it.
- Knip can report an unreachable tool as unused: no workspace declares a blanket entry-point glob covering its whole source tree.
- No governance rule is weaker than before: no exemption added, no per-file allowance added, no new `misplaced-files.json` entry, and no rule anchor or ignore pattern left naming a path that no longer exists.
- The compiled-artifact ignore patterns cover every relocated tool's source directory, `tools/governance/src` included, with no duplicated block.
- No production file under `layers/`, `framework/` or `applications/` imports anything under `tools/`.
- No work package identifier appears in any moved filename, package name, rule id or JSON key.

## Validation scenarios

- Given a fresh clone, when `npm run verify` runs, then it passes and no step in it names a path under `scripts/`.
- Given this work package's pull request, when CI runs, then the attestation check job passes using the relocated checker — the gate proving it survived its own move.
- Given a deliberate type error introduced into a relocated tool, when `npm run check` runs, then the gate fails and attributes the error to the tool's new package.
- Given an unreferenced file added to a relocated tooling package, when `npm run knip` runs, then it is reported as unused.
- Given a search for `scripts/` across tracked files, excluding `.pipeline/` and `plans/`, when it runs, then no hit is a path that any command, config, test or current documentation page depends on.
- Given a compiled `.js` planted beside a source file in a relocated tooling package, when the governance lint runs, then `no-stale-build-artifacts` fails and names it; and when the same file is created untracked, then `git status` does not offer it for commit.
