# Architecture Critique: AU28 — step 1, the production/development split

ARCHITECTURE-SCORE: 6/10  rounds=1  score-line: SA:7 IM:4 LI:8 AC:6 DM:5 N:8 MD:8 FMC:5 S:8 V:7 FE:5

**Verdict: REVISE.** Below the 7 ship threshold. The *design* is sound — the census/rules/runner
split, the per-rule floors, the ESLint no-filesystem restriction on `scripts/rules/**`, and the
CLAUDE.md-correct validation split are all genuinely good, and materially better than the guards
they replace. What fails is the **evidence base and the increment sequencing**: three of the plan's
load-bearing measurements are wrong, and two of the eight increments cannot land green in the stated
order. Both are fixable inside the plan without redesign. No structural rework needed.

Scope discipline: **clean.** No step 2/3/4 substance is smuggled in. `repo-census.ts` is named as the
artifact steps 3–4 will consume, but nothing is built for them. `web/scripts/` → `__scripts__/` as a
"step-1 holding position" is correct and, per Finding C1 below, *more* necessary than the plan knows.

Engineering tier: **production**. Rigor is correctly calibrated — see S:8.

Baseline verified in this worktree: `npm run check` → `typecheck-gate: PASS — all 34 packages
checked`, exit 0. `approvals.requirements` is set in `progress.json`. No `feasibility.md` exists;
acceptable here (no new library, no external API, no perf claim — everything is pattern-following),
but see FE:5.

---

## Ruling on the central question: is the misplacement ledger an allowlist wearing a different name?

**No. It is not an allowlist — and the plan is right that the two mechanisms cannot be confused.**
But the plan's landing claim is stated dishonestly, and the real zero-exceptions hole is somewhere
else entirely.

### Why it is not an allowlist

An allowlist filters findings. `composition-edge-anti-regrowth-guard.ts:457,469` is the reference
shape: `if (DEFERRED_FOLLOWUP.has(...)) continue;` — an edge is *detected* and then *skipped*. The
ledger does nothing of the sort. A ledgered file is classified `production` by the rule
(`architecture.md` §5.4), so the edge into it is production→production, which is legal on its own
terms. There is no finding to suppress. The crossing rule's committed count is the literal constant
`0`, there is no `--skip`, no suppression comment, no severity override. Verified against the design:
the ledger holds *files*, the crossing rule holds *edges*, and no ledger read appears anywhere in the
crossing rule's evaluation path.

**A developer cannot add a ledger row to make their own change pass.** Adding a row raises the
resolved-file count above the committed number and hard-fails (`ledger-ratchet`). And even if they
also edited the committed number, it would buy them nothing — the ledger gates no edge.

### Where it falls short of the founder's bar

Judged against the four properties the brief specifies:

| Property | Verdict |
|---|---|
| Dated | **NO.** Schema is `path` + `reason` + `successor`. No date field. The `DEFERRED_FOLLOWUP` precedent's honesty came from a hand-maintained doc-comment history; a JSON file has none. |
| Individually listed | **NO.** §4.2 permits "file or directory prefix" and Increment 2 explicitly says *"Seed the ledger with the full known-misplaced set as **directory-prefix entries**"*. A prefix is a standing wildcard. The resolved-file-count mitigation caps growth but does not make the entry named. |
| Warns every run | **YES.** `ledger-visible`, severity warn, one line per entry. Stronger than `DEFERRED_FOLLOWUP`, which silently `continue`s. |
| Named closing WP | **PARTIAL.** `ledger-sound` asserts the `successor` *field is present*. It does not assert the WP exists or is registered in `.pipeline/AU.md`. `successor: "TBD"` passes. |
| Shrink-only both ways | **PARTIAL.** `live === committed` is a two-sided equality, not a ratchet. Nothing pins the committed number to a monotonically-decreasing history; a single commit can raise both together. |

The decisive difference from the accepted precedent: **`DEFERRED_FOLLOWUP` is empty**
(`composition-edge-anti-regrowth-guard.ts:417`, `new Set([])`). The founder accepted the *shape* of
an honestly-open gap set at a moment when it held nothing. AU28 proposes to land the same shape
holding four live entries. That is a real difference in kind, and the plan should say so out loud
rather than citing the precedent as if it were equivalent.

### The dishonest claim

`architecture.md` §3 asserts *"the live production → development edge count is **0** and stays
there"* and §5.4 asserts *"No exception state."* Both are true only **because four development files
are deliberately counted as production**. The honest statement is:

> Crossings: 0, conditional on N ledgered misclassifications. The unconditional count is N.

Stated the plan's way, a future reader sees a clean zero and never learns the debt exists. Stated
honestly, the ledger's warnings and the number reconcile.

### The actual zero-exceptions hole, which is not the ledger

**A developer *can* make their own change pass — by adding a `__` segment.** File kind is a
self-service path label with no ratchet:

- Blocked by a crossing? Move the *importer* into a `__` folder. The crossing vanishes. Nothing
  reviews the reclassification.
- The only backstop is `clause-live`'s `default-production ≥ 900` floor against a live production
  count of **1,023** (measured, §C2 below) — **123 files of slack** before the floor bites, with no
  per-diff signal.
- Worse, the rule structurally cannot see the class of debt it ledgers. A *new*
  `KnowledgeDetail`-style mock-data fallback added tomorrow is production→production and legal. The
  ratchet protects nothing about the pattern it names; it only fires if someone voluntarily files a
  row.

I am **not** recommending more machinery here — a ratchet against deliberate relabeling is designing
for a rogue agent, which `ETHOS.md` forbids. I am recommending the plan **stop claiming an
unconditional zero** and state the trust boundary explicitly.

### Required changes to the ledger (W2–W5 below)

1. Individual file entries only. Delete "or directory prefix" from §4.2 and delete "as
   directory-prefix entries" from Increment 2.
2. Add an `added` date field; `ledger-sound` asserts it is present and parseable.
3. `ledger-sound` validates `successor` against the WP registry in `.pipeline/AU.md`, not merely
   that the string is non-empty.
4. Restate §3, §5.4 and DoD §8.1 as *"0 crossings, conditional on N ledgered misclassifications"*.
5. Fix the ledger's own contents, which the plan states three different ways (see W6).

---

## CRITICAL

**C1. [§3.1, §9 Increment 2] There is a third live crossing today. Increment 2 lands the hard-zero
guard and hard-fails on it.**

`architecture.md` §3 states *"Live production → development import edges, today: **2**"* and
Increment 2 says moving the two `web/src` files makes *"the crossing count 0 at landing."* Both are
false. Independently scanned (git-tracked file set, relative + `@hyperidle/*` specifier resolution
through `tsconfig.base.json` paths and each package's `exports` map):

```
packages/web/scripts/ah5-resolve-model.ts:33  ->  @hyperidle/eval/smoke
                                              ->  packages/eval/src/smoke/index.ts
```

`packages/web/scripts/ah5-resolve-model.ts` has no `__` segment, is not a story, is not in a
development package, is inside `packages/`, and is not a test-runner config — **production** by the
settled rule. `packages/eval/**` is **development** (wholly-development package, clause 3). That is a
crossing, live today, and it is not closed until Increment 7 moves `web/scripts/` → `__scripts__/`.
The guard is hard-fail with no exception state from Increment 2 onward, so Increments 2, 3, 4, 5 and
6 all red.

This also falsifies **Ruling 8.1's** measured premise — *"Exactly one production→tooling reference
exists repo-wide — `packages/web/package.json` declaring `@hyperidle/eval` … **Zero production source
files import test or tooling code**"*. Ruling 8.1 counted only the manifest row and missed the source
import. The rule is not free to adopt after all; it costs one move.

→ **Fix:** add the edge to §3.1 (3 live crossings, not 2). Either pull the `web/scripts/` →
`__scripts__/` move forward into Increment 2, or split it out of Increment 7 into its own step before
the guard lands. The former is cleaner — Increment 2 already moves two directories.

---

**C2. [§9 Increment 3] Increment 3's own moves create a crossing whose fix lives in Increment 4,
breaking the plan's stated invariant.**

§9 states *"Crossings are hard-zero from Increment 2 onward, so every later increment must fix what
its own moves expose, in the same increment."* Increment 3 violates it. Simulated at the Increment 3
boundary, with all of Increment 3's own stated fixes applied:

```
packages/core-api/src/test-fixtures.ts  ->  @hyperidle/db/test-fixtures
                                        ->  packages/db/src/__testing__/test-fixtures.ts
```

`packages/core-api/src/test-fixtures.ts` is the **only** non-test consumer of the
`@hyperidle/db/test-fixtures` subpath (verified: 63 consumers, 62 under `__tests__/`). It is
production until **Increment 4** moves it to `core-api/src/__testing__/`. Increment 3 makes its
target development. The plan's own §6.8 note — *"63 imports of `@hyperidle/db/test-fixtures` need zero
change"* — is what hides this: the specifier does not change, but the *classification of its target*
does.

→ **Fix:** either merge Increments 3 and 4, or move `core-api/src/test-fixtures.ts` in Increment 3
alongside the db move (it is one `git mv` plus the 240 specifier rewrites, which is Increment 4's
bulk anyway).

---

**C3. [§5.3, §3] The `clause-live` floors are precedence-dependent, the precedence is never stated,
and the most natural reading breaks the guard's own floor on day one.**

`architecture.md` AC-1 requires the classifier to apply *"the clauses in a fixed, tested precedence"*
but the plan never says what that precedence is. It is not cosmetic: the per-clause counts — and
therefore the declared floors in §5.3 — change entirely with the order. Independently computed over
`git ls-files`, all 24 orderings:

| Precedence | dunder | stories | dev-package | config |
|---|---|---|---|---|
| `dunder > stories > devpkg > config` (**natural reading of Ruling 9**) | 906 | 136 | **95** | 35 |
| `dunder > devpkg > stories > config` | 906 | 135 | 96 | 35 |
| `stories > devpkg > dunder > config` | 874 | 136 | 127 | 35 |
| `devpkg > dunder > stories > config` (**the plan's numbers**) | **874** | **135** | **128** | **35** |

The plan's §3 breakdown (874 / 135 / 128) is reachable **only** under `devpkg > dunder > stories >
config` — an order it never states. Under the order a builder would most naturally derive from
Ruling 9's own clause listing, `development-package` resolves to **95**, below the plan's declared
floor of **100**, and `clause-live` — the plan's flagship anti-rot rule — hard-fails at landing on a
correct implementation.

→ **Fix:** state the precedence explicitly in §5.1 next to `ClassificationClause` (the union's
declaration order is a reasonable place to encode it), and derive every §5.3 floor from that stated
order. Add a unit test under AC-1 asserting the precedence for a path that matches two clauses (e.g.
`packages/eval/src/__tests__/x.ts` and `packages/eval/src/Foo.stories.tsx`).

---

**C4. [§7, AC-11] `au9-direct-handoff-guard.ts` has the identical dead-scan-root defect au6 is being
retired for. The plan misses it, claims no other chain entry has it, and Increment 2 adds an
assertion that will hard-fail on it.**

Verified in this worktree:

```
scripts/au9-direct-handoff-guard.ts:79
  const candidates = files(join(root, "packages/server/src")).filter(productionFile);

$ ls packages/server        →  No such file or directory
$ npx tsx scripts/au9-direct-handoff-guard.ts --check
  au9-direct-handoff-guard: PASS      (exit 0, zero files visited)
```

This is byte-for-byte the au6 failure mode the plan documents at §7 and cites in AC-3, AC-10 and
Ruling 9's governance principle. Yet:

- §7's reconciliation table does not list `au9` at all. It also omits `au3-runtime-vocab-guard`,
  `au7-runtime-retirement-guard`, `au18-kv-shape-guard`, `ag7-no-divergent-classes` and
  `honest-harness-guard` — six of the eleven `lint`-chain entries are unreconciled.
- `plan.md` AC-10 asserts *"Every retained guard in the chain gains an assertion that its scan root
  exists and is non-empty"* and `architecture.md` AC-11 asserts *"no other chain entry visits a
  directory that does not exist."* The second is false, and the first therefore hard-fails Increment
  2 the moment it is implemented.

(`au7-runtime-retirement-guard.ts:33-38` also names `packages/server` and `packages/fabric`, but as
`RETIRED_PATHS` it *asserts their absence* — correct by design, not a defect. Do not conflate them.)

→ **Fix:** extend §7's table to all eleven `lint` entries with a measured disposition each; retire
`au9` alongside `au6` on the same evidence, or re-root it; correct AC-11's claim. Also decide whether
the scan-root assertion covers only the `lint` chain or also `verify`'s separate guard chain
(`mock-inventory:check`, `demo-fixture-guard:check`, `token-guard:check`, `harness-vocab-guard:check`,
`ah5-mock-guard:check`, `ah6-mock-guard:check`) — `package.json:45` shows these are *not* in `lint`,
and the plan never says which chain AC-11 means.

---

## WARNING

**W1. [§3] The plan's own baseline table violates AC-2's totality invariant, dropping exactly the two
files it uses as its headline argument.**

§3 states: under `packages/` — total **2,160**, development **1,137**, production **1,021**.
1,137 + 1,021 = **2,158 ≠ 2,160**. Independently recomputed over `git ls-files packages`, 4-clause
rule: development **1,137** (correct), production **1,023**. The missing two are
`packages/desktop/build/entitlements.mac.plist` and `packages/desktop/build/icon.icns` — the very
files §3 invokes to justify sourcing the census from git. The plan's *git-based* number was computed
with the same exclusion its walker had. → Correct 1,021 → 1,023.

**W2. [§3, AC-7] The "walker returns 2,158" claim is not reproducible and the AC-7 / Validation-
scenario proof built on it is untestable as written.** A plain walk finds them:
`find packages -type f -not -path '*/node_modules/*' -not -path '*/dist/*' | wc -l` → **2,160**, and
`git status --porcelain packages` is empty (no untracked files skewing it). A walker returns 2,158
only if it explicitly excludes `build/`. The genuine, stronger argument for `git ls-files` — that it
excludes gitignored files and includes nothing untracked — is never made. → Restate the rationale;
drop the unreproducible number, or state the exclusion set that produces it.

**W3. [§6.7, Increment 3] "Eight files import `createTestDb`/`warmPool`/`closeAllInstances`/
`TestDbHandle` from `@hyperidle/db`" is understated by at least 5.** Multiline-regex match on the
actual import statement returns **13** files (`packages/core-api/src/vitest-setup.ts`,
`core-api/settings/src/__tests__/plugin-configuration.test.ts`, two `agent-orchestration/tool-handlers`
tests, and nine `core-api` integration tests); a looser scan suggests up to 20. The "seven further
relative importers" figure **is** correct (verified: 7). Increment 3's rewrite footprint is ~2× the
stated size. → Recount and restate.

**W4. [§6.6, AC-9/AC-10] `seed.ts` is 26 call sites, not 30 — and the brief's "5 in one file" that the
plan corrects was right about that file.** Exact `seed(db)` occurrence counts:
`seed.integration.test.ts` **9** (plan: 12), `U1-schema-migration.integration.test.ts` **10** (plan:
10 ✓), `X3-agent-config.integration.test.ts` **5** (plan: 6), `AD8a-category-rename.integration.test.ts`
**2** (plan: 2 ✓). Total **26**. The plan's 30 counts docblock and test-title mentions of `seed()`
(`seed.integration.test.ts:42` `@lore` comment, `:221` test title; `X3:10` docblock). The plan's real
correction — that the footprint is **four files, not one** — is valuable and correct; the count it
substituted is not. AC-9 and AC-10 both hardcode "all 30 call sites" and will be false on landing.
→ 26.

**W5. [§6.6] The `demo-fixture-guard.ts` "five-line existence assertion" will hard-fail on its own
allowlist.** `scripts/demo-fixture-guard.ts:47-57` lists six entries, three of which are `.js` twins
of `.ts` sources that do not exist on disk: `setup-cli.js`, `seed.js`, `index.js`. Adding a
naive existence assertion reds immediately on all three, not just the two being removed with
`seed.ts`. → The assertion must normalise `.js` → `.ts` (or the allowlist must drop the `.js` twins),
and the increment must say so.

**W6. [§4.1, §4.2, §10, §11, plan.md AC-6] The ledger's contents are stated three incompatible ways,
and the ratchet requires an exact number.** §4.2 and §11 say **four** files (§3.2 rows 1–2, 7, 8, 9).
§4.1 additionally says `vite.ah{1,5,6}.config.ts` *"go on the ledger"* (+3). `plan.md` AC-6 names four
things. `ledger-ratchet` compares a **committed resolved-file count** for exact equality, so this must
be pinned before Increment 2 seeds it. Note `llm-cassette.ts` is one file producing two edges (§3.2
rows 1–2) — the entry count and the edge count differ and the plan uses them interchangeably.
→ Enumerate the exact file list and the exact committed count in §4.2.

**W7. [§3.2] "The nine projected crossings" conflates two different things and contradicts §5.4.**
Five of the nine (rows 1–2, 7, 8, 9) are ledgered, and §5.4 correctly states a ledgered file *"is
classified production by the rule, so it produces no crossing to exempt."* They are therefore not
projected crossings at all. Row 6 (`playwright.config.ts:13` → `e2e/`) is dissolved by clause 5, not
by a fix. Only rows 3, 4 and 5 are real projected crossings requiring an inversion — confirmed by
independent simulation of the full move set, which returns exactly those three:
`core-api/src/app.ts` → `__testing__/test-routes.ts`, `db/src/index.ts` → `__testing__/test-utils.ts`,
`shared/src/harness/index.ts` → `__testing__/mock-harness-adapter.ts`. → Split §3.2 into "projected
crossings (3)" and "ledgered misclassifications (5 edges / 4 files)".

**W8. [§4.1, AC-1] Clause 5's `vitest.*.config.ts` sub-pattern matches zero files under `packages/`,
and the per-clause floor cannot see it.** All 34 tracked `vitest*.config.ts` files under `packages/`
are plain `vitest.config.ts`; the only `vitest.*.config.ts` in the repo is root
`vitest.integration.config.ts`, already development by clause 4 (outside `packages/`). A dead
sub-pattern hiding inside a live clause is precisely the granularity mismatch that let au6's
`ALLOWED_DIRECT_CONSUMER_IMPORTS` sit empty and unnoticed. The clause-level floor of ≥30 passes on the
other three patterns. Also unspecified: whether these patterns are globs or regexes — as a regex,
`vitest.*.config.ts` matches `vitest.config.ts` and `vitest-anything.config.ts`; as a glob it matches
neither. → Drop `vitest.*.config.ts`, or state the matcher semantics and give each pattern its own
floor.

**W9. [§Preamble] Ruling 4.1's dead-RPC-client deletion is deferred out of AU28 with no named owner —
the exact standard the plan enforces on its own ledger.** The preamble says it *"rides whichever later
AU28 step or successor touches `packages/web`'s manifest, and must not be silently lost."* Ruling 9
narrowed AU28 to step 1 and made steps 2–4 named successors, so "a later AU28 step" no longer exists
as a container. A founder ruling with no owner is a dropped ruling. → Name the successor WP id, or
carry the deletion in Increment 6 (it is three deletions with zero behaviour change and Increment 6
already touches `packages/web`).

**W10. [§8, §10] No protected-tests list, and the DoD's "test count unchanged" has no committed
baseline.** `seed.integration.test.ts` is renamed *and* rewritten (30→26 call-site substitutions) —
that is a test contract changing under a refactor, exactly what a protected-tests block exists to
freeze. AC-12 requires *"test count compared before and after each move increment"* but no baseline
number is recorded anywhere, so there is nothing to compare against. → Add the protected-tests list
(minimum: the four `db` integration files and the two e2e specs at `/_dev/artifacts`) and commit the
baseline test count in §8.1.

**W11. [§4.1] "Every one of them named in the root `vitest.config.ts` `projects` array" is false, for
two of the 31.** `vitest.config.ts:17-50` lists **32** projects; `packages/core-api/policy` and
`packages/agent-orchestration/session-requests` each have a `vitest.config.ts` that is **not** in the
list. Clause 5's stated rationale ("the root `projects` list resolves each project by directory") does
not hold for those two. It does not change the verdict — they are still runner configs pinned by
convention — but the justification as written is inaccurate, and the two orphaned configs are a real
latent finding worth a line in the successor notes. → Correct the sentence.

**W12. [§5.1, §5.3, AC-3/AC-4/AC-5] Three named functions and one data shape have no signature.**
`Finding` is used in `Rule.evaluate`'s return type but never defined. `runRules` is asserted on in
AC-3 with no signature. `compareLedger(committed, live)` is asserted on in AC-4 and listed as an
Increment 1 deliverable with no signature or return shape. The ledger JSON itself is prose-described
(`path`, `reason`, `successor`) with no exported type and no statement of where the committed count
lives (inside the same JSON? a sibling constant?). At production tier with a test-first Increment 1,
the builder cannot write the red tests from what is written. → Add all four to §5.1's contract block.

---

## NOTE

**N1. [§6.2] "git-export `src/testing.ts` … 0 importers" is misleading.** There are two consumers via
the `./testing` subpath (`core-api/src/__tests__/git-export-routes.integration.test.ts:18`,
`git-export.integration.test.ts:49`), both unaffected because the `exports` map is repointed. The
statement is true only for relative importers. Say that.

**N2. [§6.1] The `packages/db` heading says "7 files" over an 8-row table.** The 8th
(`scripts/strip-public-schema.ts` → `__scripts__/`) is real and verified to exist.

**N3. [§9 Increment 1] The claimed test home is verified and correct.**
`packages/db/src/__tests__/` holds 11 guard-logic tests importing from root `scripts/lib/`
(`ar1-attestation-floor`, `ar2-per-harness-floor`, `at1-attestation-scope`, `AF17-demo-fixture-guard`,
`AI1-token-resolution-guard`, `ar1-honest-harness-guard`, `at1-harness-symmetry`,
`AK1-harness-vocab-guard`, `ar2-coverage-guard`, `ar1-harness-predicate`, plus
`api-contract/…/typecheck-verdict.test.ts`). Root `tsconfig.json` has `include: []`, so `scripts/**`
is typechecked only transitively via these test imports — the precedent works, but it is load-bearing
and undocumented in the plan. Worth one line.

**N4. [§6.4, §6.8] Increment 7's string-path list is good but not exhaustive.** Verified present and
correctly enumerated: `knip.json:18-19` (two `packages/web/e2e/` entries), `.gitignore:13`
(`packages/web/e2e/screenshots/`), `mock-data-policy.ts:62-66` (`/e2e/`). Not enumerated:
`scripts/mock-inventory.ts` hardcodes `"packages/web/src"` and `scripts/token-resolution-guard.ts`
hardcodes `"packages/web/src"` + `"packages/design-system/src"` — both unaffected by the moves, but
both are in `verify` (not `lint`) and both should appear in §7's table so the reconciliation is
complete. `scripts/composition-boundary-guard.ts`'s `packages/web/scripts/ah6-test-server.ts`
reference is a `@lore` comment only (scan is `packages/web/src/**`) — safe, but confirm it in the
move increment.

**N5. [§5.2] The "not ESLint" argument is correct and well-evidenced.** Verified:
`package.json:36` runs `npx eslint . --quiet`, which does suppress warnings, so the ledger's
visibility genuinely could not live there.

**N6. [§8] No security & abuse block, and no "N/A with reason".** Correctly low-stakes for a
lint/move WP, but the production tier's own template asks for the explicit N/A. One line closes it.

---

## Answers to the plan's four open questions (§11)

**Q1 — Clause 5: accept, or narrower/wider? → SETTLED FROM EVIDENCE. Accept, one pattern narrower.**
The need is proven: `packages/web/playwright.config.ts:13` really does
`import { AU21_PRE_EXISTING_E2E_FAILURES } from "./e2e/known-pre-existing-failures.js"` — verified by
reading the file. Once `e2e/` becomes `__e2e__/` that is a hard crossing on a file that cannot move,
and 35 production-classified runner configs is a standing misclassification. The clause is enumerated,
closed, floor-checked, and earned by the same "pinned by an authority outside this rule" reasoning as
`.stories.tsx`. **Narrow it**: drop `vitest.*.config.ts` (matches zero files under `packages/`, W8),
keep `vitest.config.ts`, `playwright.config.ts`, `playwright.*.config.ts`. Not a founder question.

**Q2 — `demo-fixture.ts` production, or remove `--demo`? → SETTLED FOR STEP 1; only the successor
needs the founder.** The classification evidence is airtight: `packages/db/src/setup-cli.ts` calls
`seedDemoWorld(handle.db)` behind the `--demo` flag, guarded by `@lore AF17: demo mode seeds the Acme
demo team — opt-in only`, and `packages/db/src/factory-bootstrap.ts:7` imports
`COMMUNITY_DISPLAY_NAMES` + `FACILITATOR_TOOLS` from `seed-fixtures.js`. Both files have production
importers; both are production; neither moves. The planner corrected the brief **correctly** here.
Whether a shipped CLI flag should exist is a product question for a successor WP and is not a step-1
gate — do not let it block.

**Q3 — retain `db`'s `./test-fixtures` / `./test-pool` subpaths, or delete and rewrite 63 sites? →
SETTLED FROM EVIDENCE. Retain and repoint.** Of the 63 consumers, 62 are under `__tests__/` and the
one non-test consumer (`core-api/src/test-fixtures.ts`) is itself moving to `__testing__/`. After the
moves the subpaths point into `src/__testing__/`, and the crossing rule catches any production
consumer at the import — which is strictly stronger enforcement than deleting the subpath, since
deletion enforces nothing about the *next* consumer. This is consistent with Ruling 9's own framing:
the founder listed them as *"breaches which no folder convention would have caught"* — i.e. as
requiring a mechanism, which the crossing rule now supplies. **Caveat that must land in the plan:**
this only holds once C2 is fixed, because until `core-api/src/test-fixtures.ts` moves, that one
consumer *is* a live production crossing.

**Q4 — four-entry ledger, or pull an inversion into step 1? → GENUINE FOUNDER DECISION. My
recommendation: pull `llm-cassette.ts` in.** It is the only one of the four whose fix is purely
mechanical. `harness-registry/src/llm-client.ts:648-659` is a clean inversion point — `callLlm`
branches on `process.env.LLM_CASSETTE_MODE` and dynamically imports `./llm-cassette.js` in the
`replay`/`record` arms. Inverting to a registration seam (the cassette module registers itself; the
e2e/harness lane does the registering) touches one file plus its two lane entry points, changes no
product behaviour, and removes the only ledger entry with no user-visible consequence — taking the
ledger from 4 files to 3. Against it, honestly: the cassette lane is not exercised by per-merge
verify, so a regression would surface late. The other three (`KnowledgeDetail.tsx:67`,
`ReviewPage.tsx:23`, `router.tsx:112` + the two e2e specs at `/_dev/artifacts`) all require real
product decisions and belong in successors — do not pull those in.

---

## What's working well

- **The validation split is the best part of this plan and fully CLAUDE.md-compliant.** Every static
  codebase property is a lint rule (AC-6 crossings, AC-7 census-vs-git, AC-8 the ESLint
  `no-restricted-imports` on `scripts/rules/**`); every runtime behaviour is a real unit test with
  *injected synthetic inputs* through the `files`/`readFile`/`exists` seam (AC-1..AC-5). Not one AC
  is verified by a test that reads source files off disk. AC-9 explicitly refuses fixture-only proof
  and demands a real red on a scratch commit. AC-12 compares test *counts*, not just pass/fail.
  This is exactly right and should be the reference shape for future guard work packages.

- **The `Rule` interface with a per-rule `minScope` floor, plus the ESLint filesystem ban on
  `scripts/rules/**`, converts Ruling 9's "one census, many rules" from a convention into a
  mechanical property.** Turning "a rule matching zero files fails loudly" into a declared number per
  rule — rather than a doc comment — is the correct generalisation of the au6 lesson, and the
  filesystem ban is the right narrow use of ESLint alongside the correct refusal (§5.2) to build the
  whole guard there.

- **§5.2's three-way "not ESLint / not `layer-boundary-scan.ts` / new script" decision is a real
  design-it-twice, not theatre** — each alternative is engaged on its own merits with a verified
  disqualifier, and the rejection of a configurable rule DSL keeps the tier honest.

- **§6's move list is accurate.** All 21 named source paths verified to exist; `design-system/research`
  is 81 files (15 `.md` + 66 `.png`) exactly; `web/e2e` is 92; `desktop/scripts` is 4; the core-api
  churn is 240 `test-fixtures` specifiers in exactly two shapes (136 × `"../test-fixtures.js"`,
  104 × `"../../test-fixtures.js"`, zero at any other depth) — which makes Increment 4's bulk rewrite
  genuinely mechanical and its "largest by churn, smallest by risk" claim correct.

- **§6.6 catching `demo-fixture-guard.ts`'s two soon-to-be-dead allowlist rows in the same increment
  that kills `seed.ts`** is the plan noticing the exact class of rot AU28 exists to end, unprompted.
