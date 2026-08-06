# AU28 — Define and hard-lint one canonical interface architecture between every Layer and Service boundary

> **Amended 2026-08-04 (round 2).** The **Acceptance criteria** and **Validation scenarios** sections
> below were rewritten wholesale under **founder Ruling 4.2** (*"fuck the ACs"* — the original set is
> "explicitly released"). The original ACs #5/#6/#7 assumed AU28 performs the cleanup; **Ruling 2**
> settles that it does not (*"lets start with a round of building the rules and the linters and then we
> figure out what we do where"*). This is a founder release, not a silent scope reduction. Everything
> above the AC section is unchanged from the seeded spec and is retained as the historical framing —
> where it conflicts with `founder-rulings.md`, the rulings win. Full reasoning:
> `.pipeline/work/AU28/requirements.md` §8. The contract's content: `.pipeline/work/AU28/rule-matrix.md`.
>
> **Amended 2026-08-04 (round 3) — scope narrowed to step 1 by Ruling 9.** The founder set a
> four-step sequence and put AU28's scope at **step 1 only**: the production/development split — the
> rule, the file moves it requires, the `seed.ts` deletion, and the governance lint that enforces it.
> Steps 2 (`layers/`/`framework/`/`tools/` restructure, blocked on AU26), 3 (layer access patterns per
> world) and 4 (split `shared`, clear remaining violations) are **named successors, not AU28**. The
> **Acceptance criteria** and **Validation scenarios** below are rewritten again to match step 1's real
> deliverable; round 2's set described the whole four-step arc. Round 2's AC text is preserved in git
> history and its substance is inherited by the successors. Technical plan:
> `.pipeline/work/AU28/architecture.md`.

## Work package

**Work package.** As a maintainer, I want ONE canonical, strictly-defined interface architecture governing how every Layer, Service, and cross-boundary construct may communicate with every other one — codified as an explicit, versioned specification (not scattered convention) and mechanically enforced by a linter that warns on every existing violation today and hard-fails on any new one — so that HyperIdle's layering rules stop being re-derived ad-hoc, direction-by-direction, from whichever complaint happens to surface a gap. AU21 built a real, working guard, but it only ever checked ONE of the two possible directions (agent-orchestration reading core-api); this session's investigation found the OTHER direction (core-api reaching directly into agent-orchestration and agent-execution via 38 raw package imports across 19 files) sitting completely unguarded the whole time, plus three separate, independently-discovered bugs in the mechanical detector that fed AU21's own confidence (a type-alias blind spot, three dead configuration entries nobody noticed, and a mixed-provider interface silently collapsing 5-7 real dependencies into one mis-attributed edge). The goal is a symmetric, exhaustive, self-verifying rule — not another one-off patch aimed at whichever direction was complained about most recently.

**Why this matters.** Every boundary this session touched turned out to have a real, previously-invisible gap — not because anyone was careless, but because there was never one canonical definition of what makes a cross-boundary call legal or illegal. AU21's own merge-gating guard is the proof: built with real rigor, verified working, and still only checked half the problem, because "the interface architecture" was never written down as one thing — it was inferred anew, direction by direction, for each specific complaint. Without this workpackage, every future boundary question (the next Layer, the next Service, the next "why does X import Y") repeats the same investigation from scratch, at the same cost, with the same risk of missing the reverse direction again. The founder, verbatim: *"DI imports across layers are absolutely forbidden. zero exceptions and should be linter forbidden. layers can import from only themselves or shared... interfaces between layers must be very strictly defined and no other mechanism should work. hard linted."*

**Type.** backend / infra (architecture specification + tooling; no UI surface).

**What exists today.** `scripts/composition-edge-anti-regrowth-guard.ts` (AU21) mechanically enforces exactly ONE rule — zero `agent-orchestration -> core-api` raw-port or hidden-composition-bundle edges — proven correct via `--fixtures`, wired into `npm run lint`. `scripts/generate-dependency-graph.ts` extracts the as-is dependency graph (Services, port edges, EventBus edges, hidden composition edges) for documentation, not enforcement, and was found this session to have three real bugs (a type-alias blind spot; a mixed-provider-interface collapse hiding real edges behind one mis-attributed vote; three dead `MANUAL_OVERRIDES` entries from past refactors) — all now fixed, with an in-code sanity check that fails loud on any future dead config entry. `scripts/layer-boundary-scan.ts` (built this session during AU21's own investigation, carried into this workpackage) is a new, independently-reliable, fixture-proven, pure-AST scanner for every cross-Layer import (Mechanism 1: `ts.ImportDeclaration`/`ts.ExportDeclaration`/dynamic-`import()` nodes, zero name-voting), reusing the existing EventBus (Mechanism 2) and hidden-composition-bundle (Mechanism 3) detectors — its first real run found **38 `core-api -> agent-orchestration`/`agent-execution` raw imports across 19 files**, none checked by any existing guard. `docs/architecture/runtime-simplification.md` states an aspirational Layer/Service package-dependency rule ("a Service package's dependencies may only ever be `@hyperidle/db` and `@hyperidle/shared`... never another Service package, and never a Layer package") but marks its own enforcement mechanism "AU19's job, not yet built" — today it holds true only by convention at the Service-package level (verified this session: every Service `package.json` is clean) and is violated wholesale at the Layer-package level (`@hyperidle/core-api`'s own `package.json` directly depends on 4 agent-orchestration packages and 1 agent-execution package).

**What's genuinely missing.** (1) A single, explicit, written specification of every legal cross-boundary mechanism — Layer-to-Layer, Service-to-Service, Service-to-Layer, Application-to-Layer, and what's foundation-exempt — that is symmetric (defines and checks BOTH directions of every Layer pair, not just the one direction someone happened to complain about) and names its own enforcement mechanism per rule. (2) A hard-linted guard enforcing that spec, warn-only against the currently-known violations (so landing this workpackage doesn't red CI on pre-existing debt) and hard-fail on any NEW one — the same "warn, then clean up" sequencing the founder explicitly asked for. (3) A tracked, exhaustive violation worklist, using `layer-boundary-scan.ts`'s already-proven, real output, so cleanup is scoped from data, not re-discovered by hand.

**Depends on.**
- **AU21** — this workpackage generalizes and closes the gap in AU21's own boundary-enforcement mechanism; it needs AU21's guard, its Layer/Service model, and its (now-fixed) detector as a foundation. Already merged (PR #457, `75d85687`).

**Complexity.** L

**Engineering tier.** production (matches AU21's own tier — this is foundational, codebase-wide rigor, not a prototype).

**Pre-build gates.**
- **Refinement:** Required — run `/refine` first. The exact taxonomy of "legal mechanism kinds" (foundation import, same-layer import, EventBus, the `CoreApiPort`/`AgentOrchestrationPort` seam, Application-tier composition) needs to be pinned down as a real, named noun set before architecture can design the enforcement mechanism around it. **Done (round 2):** the candidate list was found non-MECE; the settled set is **9 crossing kinds** — see `requirements.md` §4 and `rule-matrix.md` §1.
- **Design:** Not required — backend/infra, no new UI surface.

**Human review gates.** Yes — mandatory for every workpackage, and load-bearing here specifically: this defines a foundational, codebase-wide rule the founder has stated in very strong, repeated terms ("zero exceptions," "hard linted," "no other mechanism should work"). Architecture must go through independent critique and the founder's own review before any enforcement code lands or any cleanup begins — the same discipline already used for AU21 Decision L, not a lighter pass. **Six rulings recorded so far at `.pipeline/work/AU28/founder-rulings.md`; they are binding and supersede this file on conflict.**

**Plan calls.** Architecture must: (a) formally define the interface-architecture spec itself as a first-class artifact (not just a linter's source code) — every legal mechanism kind, every Layer-pair and Service-pair rule, cross-referenced against `docs/architecture/runtime-simplification.md`'s existing (currently unenforced) Layer/Service rules, reconciling or explicitly superseding them rather than adding a second, conflicting source of truth; (b) decide the enforcement shape per rule — some may be an AST-based scanner extended into a merge-gating guard (like `layer-boundary-scan.ts`'s Mechanism 1, already fixture-proven), others may need a `tsc`-enforced package-boundary (structural `package.json` `dependencies` restrictions, matching the already-proposed-but-unbuilt AU19 Service-package-isolation mechanism); (c) sequence warn-then-clean-up explicitly: land the guard WARNING on every currently-known violation first, a real CI-visible signal, before any cleanup lands; (d) scope the cleanup itself using `layer-boundary-scan.ts`'s real, current output (39 Mechanism-1 statements at scan time, `plans/AU19/layer-boundary-scan.json`) as the starting worklist, not a re-derived one — expect this to fan out into several independently-shippable increments (define+spec, warn-mode guard, then cleanup ordered by severity: `agent-execution`/`harness-registry` raw imports first — the most severe, since they violate the even-more-fundamental "only agent-execution invokes a harness" rule from an earlier track — then `agent-orchestration` raw imports, then whatever Service-to-Service interface issues the mixed-provider-interface investigation surfaces). Architecture should also reconcile explicitly with the already-agreed-but-not-yet-built "core-api/remote-server split" direction (each Layer owns its own Hono app; composition moves to the Application tier) — that redesign, once built, closes most of the `core-api -> agent-orchestration` imports as a side effect, but does nothing for the `harness-registry` imports, which need their own, separate resolution regardless. **Amended by Ruling 2:** the cleanup in (c)/(d) is *reported*, not *performed*, in AU28.

**Contracts / constraints.**
- The new interface-architecture spec must be **symmetric** — it must define and check BOTH directions of every Layer pair, not just the one direction a complaint happened to name. This is the literal root cause this workpackage exists to fix.
- Must not weaken or remove `composition-edge-anti-regrowth-guard.ts` — it stays as the enforcement for the one direction it already covers (superseded-and-subsumed or coexisting, architecture decides which); if replaced, replacement must be proven equivalent-or-stronger via the SAME fixture scenarios, not just informally re-tested.
- No cleanup commit may silently downgrade a hard-fail check to a warn/skip to make CI pass — matches the project's own standing "tests must not drive behavior" rule.
- The Application tier (`desktop`, `remote-server`, `remote-worker`) is exempt from the Layer-to-Layer restriction by design (composing multiple Layers is its entire job) — this exemption is itself part of the written spec, not an ad-hoc carve-out discovered later. **Bounded by round 2:** the exemption covers Layer *barrels* only. An Application may not reach past a barrel into a nested Service, may not wire a port across two Layers, and may not touch a table.
- Foundation packages (`@hyperidle/db`, `@hyperidle/shared`, `@hyperidle/api-contract`, `@hyperidle/design-system`) remain importable by every Layer; `@hyperidle/shared` itself must import only itself (no Layer, no Service) — this too is spec, not convention, and must be checked, not assumed. **Superseded by Ruling 3:** foundation importability is **per-Layer**, not blanket; `@hyperidle/db` is ACL'd at **table grain**. The `shared`-imports-nothing rule stands and is verified true today (0 `@hyperidle/*` imports).
- **Ruling 5:** a package's role must derive from its manifest or an explicit registry, **never from its directory path** — a later `layer/<pkg>` / `shared/<pkg>` restructure must change no verdict.
- **Ruling 6:** every table has exactly one owning Service. `UNOWNED_SHARED_TABLES` is abolished as a concept; the four current members are reported as debt, never exempted.

**Out of scope.**
- Re-opening AU26's own domain-**relocation** work (which domain lives where) — AU28 is about HOW boundaries communicate, not WHERE domains live. Cross-reference, don't duplicate.
- The core-api/remote-server composition-root split itself — a related, already-agreed-direction piece of work, but its own investigation/architecture pass, not folded into AU28's spec-definition scope (see Plan calls' reconciliation note).
- **All relocation and cleanup (Ruling 2).** AU28 ships the rules, the linting, and the ratchet. The 26 composition-root crossings, the `shared` split, the `api-contract` re-cut, assigning `sessions` an owner, and the cross-Layer DI dissolution are named successors — see `requirements.md` §9.
- Any UI-facing change — none of this touches `packages/web`. **Exception, per Ruling 4.1:** the dead Hono RPC client (`packages/web/src/api/client.ts` + its manifest deps + its eslint carve-out) is deleted in AU28. Zero call sites, zero behaviour change.

**Effort.** L (~1-2 weeks) — spec + guard design/critique/review is the smaller half; the actual cleanup of 38+ raw imports (especially untangling core-api's composition root from directly booting agent-orchestration's runtime and agent-execution's harness machinery) is the larger, riskier half. **Re-scoped by Ruling 2:** the cleanup half moves to successor WPs; AU28 is the spec + guard + ratchet + the dead-client deletion.

## Acceptance criteria

*(Rewritten 2026-08-04 round 3 under Ruling 9 — step 1 only. Verification method per criterion,
measured baselines and the full move list: `.pipeline/work/AU28/architecture.md` §6, §8.)*

- **AC-1 — The rule is one total, tested function.** `classifyFile(path)` returns a kind **and** the
  clause that decided it, for every path in the repo. The clauses are the founder's four — `__` path
  segment, `.stories.tsx`, wholly-development package, outside `packages/` — plus **clause 5,
  test-runner configs** (`vitest.config.ts`, `vitest.*.config.ts`, `playwright.config.ts`,
  `playwright.*.config.ts`), which architecture found necessary because 35 such files are pinned to
  production paths by their runner's own discovery convention and one of them
  (`web/playwright.config.ts:13`) genuinely imports a development file. Clause 5 is enumerated,
  closed, and floor-checked — the same shape as the `.stories.tsx` clause. *Unit test.*
- **AC-2 — Every file classifies; the census is complete against git.** The census file set equals
  `git ls-files`, not a filesystem walker's output. (A walker returns 2,158 files under `packages/`
  and misses two tracked ones under `packages/desktop/build/`; git returns 2,160.)
  `production + development === total`, with per-clause counts that sum. *Unit test for the totality
  logic; lint rule for the git equality.*
- **AC-3 — A rule matching zero files fails loudly.** Every rule declares its scope and a minimum
  scope size; the runner throws, naming the rule, when a scope falls below it. This is the defect that
  made `au6-agent-boundary-guard.ts` report `PASS` on a deleted directory. *Unit test.*
- **AC-4 — No rule performs its own file discovery.** Rules are pure predicates over the census.
  Mechanically enforced by an ESLint import restriction on `scripts/rules/**` banning `node:fs`,
  `node:child_process` and glob packages. *Lint rule.*
- **AC-5 — A production file never imports a development file.** Zero, repo-wide, hard-fail, from the
  increment that lands the guard onward. No allowlist, no suppression comment, no severity override —
  the committed count is the literal `0`. *Lint rule, plus a real red on a scratch commit; fixtures
  alone are not accepted as proof.*
- **AC-6 — Known misplacement is a shrink-only ledger, enforced in both directions.**
  `scripts/prod-dev-split.ledger.json` lists the paths the rule calls production that are really
  development and cannot move in step 1 (the `llm-cassette` env seam, the two mock-data fallbacks in
  shipping pages, the `/_dev/artifacts` route that two e2e specs navigate to). Every entry names a
  reason and a successor work package, every entry must resolve to a tracked file, the **resolved file
  count** is compared against a committed number, and a live count either above **or below** it fails
  the build. Entries are reported as warnings on every run. *Unit test for the ratchet and integrity
  logic; lint rule for the live comparison.*
- **AC-7 — The files move.** Every development file sitting in a production path moves into a `__`
  folder: `db` 8, `core-api` 6, `shared` 1, `design-system` 2 + `research/` (81 files), `web` 6 +
  `e2e/` (92) + `scripts/` (7), `desktop/scripts/` (4). Two files the brief listed do **not** move
  because a production importer proves them production — `db/src/seed-fixtures.ts`
  (`factory-bootstrap.ts:7`) and `db/src/demo-fixture.ts` (`setup-cli.ts:164`, behind the shipped
  `--demo` flag). *Command: `npm run verify` green after each move increment, with the test count
  compared before and after — not just pass/fail.*
- **AC-8 — The barrels and manifests stop advertising development code.**
  `shared/src/index.ts:333` and `shared/src/harness/index.ts:48` (`MockHarnessAdapter`) and
  `db/src/index.ts:175` (`createTestDb`/`warmPool`/`closeAllInstances`/`TestDbHandle`) are deleted;
  `db/src/index.ts:168` (`seed`) goes with `seed.ts`. `db`'s `./test-fixtures` and `./test-pool`
  subpath exports and git-export's `./testing` are **repointed, not deleted** — the crossing rule now
  catches any production consumer at the import, which is strictly stronger than deleting them and
  rewriting 63 call sites. *Lint rule (AC-5 covers the edges); `npm run knip` for the removals.*
- **AC-9 — `seed.ts` is deleted.** Its real footprint is **four test files and 30 call sites**, not
  the five in one file the brief recorded: `seed.integration.test.ts` (12),
  `U1-schema-migration.integration.test.ts` (10), `X3-agent-config.integration.test.ts` (6),
  `AD8a-category-rename.integration.test.ts` (2), plus the barrel export. All 30 become
  `applyFactoryBootstrap(db)` + `seedDemoWorld(db)` — the exact pair the 3-line wrapper called.
  `scripts/demo-fixture-guard.ts:52-53`'s two now-dead allowlist rows are removed and that guard gains
  an existence assertion on its own allowlist. *Command: `npm run test:integration:service` green,
  `npm run knip` clean.*
- **AC-10 — `au6-agent-boundary-guard.ts` is retired.** Deleted from `scripts/` and from the `lint`
  chain. Verified dead in this worktree: it scans `packages/server/src`, which does not exist; it
  prints `PASS` and exits `0` having visited zero files; it is seventh in the chain. Nothing is
  re-rooted — its remaining rules were file-scoped to a file that is also gone. Every retained guard
  in the chain gains an assertion that its scan root exists and is non-empty. *Lint rule.*
- **AC-11 — Nothing breaks that only running it can prove.** String-path references are not import
  edges and no AST scan finds them: vitest `setupFiles`, playwright `testDir`, the root `projects`
  array, eight `npm run` script paths, knip config, and
  `eslint-plugin-design/src/mock-data-policy.ts:62-66`'s `/e2e/` fragment. *Command: `npm run verify`,
  `npm run test:e2e`, `npm run mock-inventory:check`, and each repointed npm script executed once.*
- **AC-12 — The rule is written where a developer hits it**, in `docs/guides/developer/` and in
  `CLAUDE.md`'s test-file section: the five clauses, the one-direction crossing rule, and what the
  ledger means. *Write-docs gate.*

## Validation scenarios

- Given the guard is in `npm run lint`, when a commit adds an import from a production file to a file
  under a `__` folder, then `npm run lint` fails citing the file, the line, both classifications, and
  the clause that made the target development.
- Given the guard is in `npm run lint`, when a directory a rule scans is deleted or renamed, then the
  run fails naming the rule whose scope collapsed — it does not pass on zero files.
- Given the census, when a tracked file exists that the census did not visit, then the run fails —
  proven by the two `packages/desktop/build/` files a walker-based census silently drops.
- Given the ledger, when a commit adds an entry so its own change can pass, then the build fails.
- Given the ledger, when a commit fixes a ledgered file but leaves the committed count unchanged, then
  the build fails on the stale baseline.
- Given `seed.ts` is deleted, when `npm run test:integration:service` runs, then all four affected
  integration files are green and the total test count is unchanged.
- Given `packages/web/e2e/` has moved to `__e2e__/`, when `npm run test:e2e` runs, then the same specs
  are collected and pass — the move is proven by the runner, not by the guard.
- Given all increments have landed, when `npm run verify` runs, then it is green and the live
  production → development crossing count is zero.

---

## As built (consolidated at ship, 2026-08-07)

The phase artifacts this section replaces are in git history. Everything a future reader needs is here.

### What shipped

**The rule engine.** 15 clauses in `scripts/lib/governance-model.ts`, checked in order, first match wins,
default `forbidden`, total over every crossing. The 124 founder-decided rows in
`governance/decided-rules.json` are its **acceptance test** — the model is correct iff it reproduces all
248 verdicts (124 × 2 worlds) exactly, asserted with an iteration counter so an empty row set cannot pass
vacuously. A mutation test killed 12 of 12 single-clause mutants.

**The three-way split** (`governance/README.md`): clauses are principles in code · registries are facts in
JSON · decided rules are frozen decisions. A clause holds no package name, table name or path.

**Nine crossing kinds** detected by AST over a single census sourced from git: `import` · `manifest` ·
`di` · `api` · `mcp` · `event` · `table:read` · `table:write` · `capability`.

**No warn/error dial.** Every rule is an error; `governance/baseline.json` lists the violations that
existed when the rule landed, and only those warn. The baseline may only ever SHRINK — the generator
refuses to add a group or raise a count, so clearing a group's last site deletes the entry and that rule
is at error from the same commit. Promotion is what fixing the violation does, not a later step.

**Break-testing is a gate.** `npm run lint` runs 47 attacks overlaid onto the live census through the
census's injected `readFile` seam — real repo, nothing written to disk. Four anti-rot properties, the
load-bearing one being that **a registered rule with no POSITIVE attack case fails the build**.

**Twenty inherited guards deleted** against 15 rules added — net −2,007 lines.

### Founder rulings — the binding record

`founder-rulings.md` is retained in full alongside this plan. It is not a phase artifact: Rulings 1-15 are
the decisions the model encodes, several of them overturning earlier ground truth, and the model cannot be
changed safely without them. Ruling 9 narrowed AU28 to step 1; Rulings 13/13a settled the companion rule;
Ruling 14 merged `raw runtime` and `harness` into one door; Ruling 15 closed the harness noun to LLM
harnesses only.

### Acceptance criteria — final state

10 of 12 PASS. **AC-6** closed by `governance/misplaced-files.json` (four production-path files that are
really development, each naming its reason, count failing above and below). **AC-12** closed by stating
the file-placement rule in `CLAUDE.md` and pointing at `governance/README.md` for boundary rules —
reconciling AC-12 against the README's own "never restate a rule", by WHEN each rule is needed.

**AC-11 is the honest residual.** `npm run verify`, `test:e2e` and `test:integration` are not all executed
at every HEAD; the release-gated lanes run at `verify:release`. Local green is a prediction — CI is the
gate (founder: *"green is when CI reports green"*).

### Deferrals and known limits — these outlive the run

- **The swap within one file.** The baseline is keyed `(group, file, count)` and group keys are coarse, so
  substituting one unowned table for another inside one already-baselined file moves nothing. Defeated
  ACROSS file pairs, not within one. Documented at `scripts/lib/crossing-report.ts`; judged gaming rather
  than a different implementation style, so out of scope by the founder's linter bar.
- **Value-flow aliasing** (`const T = { bets }`, a table arriving as a function parameter), **template-
  interpolated specifiers**, **`require(variable)`**, **untracked-file evasion** and **`eslint-disable`**
  are all out of scope by the same bar — hiding, not style.
- **Non-table narrow surfaces by value.** `export const esc = escapeLikePattern` still passes; the
  publication-side resolver handles tables only. A symbol→surface resolver is separate work.
- **CTE over-read.** A read-only SQL template mentioning a write verb in a comment keys as a write. Live
  delta is zero; the asymmetry is deliberate — reading a write as a read loses the rule in development,
  the reverse only tightens.
- **`ownerOf` reads through the prototype chain** (`in`, not `Object.hasOwn`). Fails closed; not a
  plausible-style bypass.
- **`dep-manifest-lint.ts` ships a second census** with its own discovery, contradicting "one census, many
  rules".
- **`mcpRouterHost`** is threaded through five sites and read by nothing.
- **Four database symbols fall to `db:unknown`** on every run — a NOTE, never an error, so a module
  missing from `moduleSurface` stays invisible to the surface rules indefinitely.
- **The harness predicate is near-blind** — its `harness/__tests__/` directory rule matches zero files, so
  the attestation floor sees 1 of 12 harness tests. Broke at AU26, registered as AU27 follow-up N12.

### The 290 violations this leaves, and who clears them

221 production + 67 development, all baselined, none silent. Registered as **AU29** (framework stops
acting) → **AU30** (every table owned) · **AU31** (composition roots only) · **AU32** (fixtures build
producible states) · **AU34** (split `shared`) · **AU35** (delete the `strategy` category) · **AU36**
(reach is permissions, not a harness property). Whichever of the four clearing packages empties the
baseline last deletes the file and the `--adopt` escape hatch.

### Two defects found in AU28's own work, worth remembering

**A red tree was committed while the local gate reported green** — the census read `git ls-files`, which
cannot see unstaged files, so a floor was recomputed against a census missing the files about to be
committed. Fixed at the source; `trackedFiles()` now reads `--cached --others --exclude-standard`.

**CI was broken and every local gate was green** — Ruling 10 deleted a guard and left
`release-guard.yml` invoking it. The local suite cannot see a workflow file.

