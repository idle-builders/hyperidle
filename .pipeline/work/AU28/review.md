# AU28 — review

Four independent reviewers over `pipeline/AU28` @ `1942ec6f`, none of them the author.
Lenses: architecture + AC completeness · adversarial · simplification/slop/security · docs + work-package specs.

**VERDICT: NOT DONE.**

Two reasons, in order of severity:

1. **The guard has proven bypasses.** The adversarial pass executed 22 attacks against the live tree. Six evaded, and two of them compose into a complete defeat of the most-cited rule in the model. These are working exploits with controls, not theoretical gaps.
2. **The half that tells a human which rules now apply did not land.** AC-6 and AC-12 fail outright; `docs/` still publishes the rule Ruling 1 overturned.

The enforcement *machinery* — census, floors, clauses, ratchet, and the 250-verdict acceptance test — is genuinely strong. A subagent mutation-tested the model and 12 of 12 single-clause mutants were killed. What is broken is the detection surface underneath it and the documentation above it.

---

## 1 · Proven bypasses (adversarial)

Every row was executed against the live tree and reverted. Tree verified clean afterwards.

| Attack | Result |
|---|---|
| production imports development · cross-layer import · foreign table write · missing companion · baseline growth (new group) · baseline growth (raised count) · `import type` · dynamic `import()` · relative cross-layer path · symlink · new layer | **CAUGHT** |
| **re-export laundering** | **EVADED** |
| **aliased table (`teams as T`)** | **EVADED** |
| **local const alias (`const t = teams`)** | **EVADED** |
| **raw `db.execute(sql\`…\`)`** | **EVADED** |
| **production dir with no `package.json`** | **EVADED** |
| **the swap, within one file** | **EVADED** |
| `require("openai")` · `spawn(variable)` · template-interpolated specifier · untracked file | **EVADED** |

### C1 — re-export laundering defeats table ownership entirely

The model reasons **per edge** with no notion of transitive reach. A layer may name its own service; a service may name its own table. Chain them and the rule evaporates.

Control — direct reach errors as expected. Laundered, adding one line to `layers/core-api/work/src/index.ts`:

```ts
export { bets as betsTable } from "@hyperidle/db";
```

then in `layers/core-api/src/app.ts`, `insert(betsTable)` → **`governance-lint: PASS`, zero errors.** A layer now writes a table owned by another service.

`layers/core-api/work/src/index.ts:3-7` already carries a hand-written comment: *"This barrel MUST NOT re-export the raw `bets`/`tasks`/… pgTable objects — that would let a consumer obtain a table transitively and defeat Table ACL."* **The codebase knows. The guard does not enforce it. The only thing preventing table laundering today is a comment.**

The same hop nullifies surface audiences generally — re-export `escapeLikePattern` from a service barrel and `db:util`'s `reach: ["service"]` is void.

### C2 — table detection is identifier-name matching

`crossing-detectors.ts:510` sets `table = arg.text` only when `input.tables.has(arg.text)`. Any binding whose local name differs from the schema name is invisible. Same file, three variants:

```ts
import { teams } from "@hyperidle/db";              insert(teams) → ERROR
import { teams as T } from "@hyperidle/db";         insert(T)     → PASS
import { teams } from "@hyperidle/db"; const t = teams; insert(t) → PASS
```

Ruling 13's entire remaining protection is one keystroke deep. It also corrupts `buildWriteSets` the other way: a fixture that *does* write the companion under an alias is not credited, so the rule can false-positive too.

**Fix is cheap** — resolve the table through the import binding, which the census already has in `ImportEdge.symbols`.

### C3 — raw SQL is an open door

`READ_OPS`/`WRITE_OPS` only see the Drizzle builder. A table named in a `sql` template is a string. Proven in a production service file: `db.execute(sql\`insert into teams …\`)` → PASS, crossing count unchanged. The shape is already live in four places (`session-requests/src/service.ts:1030`, `knowledge/src/fts.ts:14,22,115`); all four happen to touch their own tables today.

### C4 — a production file outside every package gets composition-root powers

`actorFor(undefined)` returns `{sort:"repo-root"}`, a declared composition root — but `classifyFile` puts anything under `layers/` in the **production** world. `layers/rogue/src/backdoor.ts` with no `package.json` imported both `@hyperidle/agent-orchestration` and `@hyperidle/core-api` → **PASS**, counted as production (789→790), both cross-layer imports adjudicated *allowed*.

`actorFor` conflates "outside the package tree" (a build script) with "unregistered inside it" (a backdoor). **One condition fixes it:** a file classified `production` must never resolve to the repo-root actor.

### C5 — the swap is defeated only ACROSS files

My own `@lore` claims the bidirectional ratchet defeats "one violation fixed and another introduced in the same commit." **False.** The baseline is keyed `(group, file, count)` and group keys are coarse. On a real baselined site, renaming every occurrence of unowned `taskDispatchAttempts` to unowned `sessions` produced three brand-new violations for three cleared ones — no `stale`, no `newDebt`, PASS. A file's forgiven quota is fungible across every table in its class.

### C6 / C7 — "measured" numbers that do not reproduce

`governance-context.ts:52` claims measured `di` = 257. Live: **245** — 12 crossings lost across two commits, and the floor of 200 was loose enough not to notice. This is exactly the rot floors exist to catch, and `repo-census.ts:167-170` mandates recomputing on every move.

`repo-census.ts:172-187` documents 3,256 tracked / 2,467 development. Live: **3,296 / 2,507**.

**No test asserts `DETECTOR_FLOORS`, `MIN_TRACKED_FILES`, or any `minFiles` magnitude.** A "measured" constant with no test is the same artifact as `au6`.

---

## 2 · AC table

| AC | Verdict | Evidence / gap |
|---|---|---|
| AC-1 total tested classifier | **PASS** (AC text stale) | 8 clauses, 30+ cases green. `vitest.*.config.ts` deliberately dropped, `test-suffix`/`spec-suffix` added — founder-directed, never amended into the AC |
| AC-2 census = `git ls-files` | **PASS** | identity by construction; `MIN_TRACKED_FILES` floor. Gap: never asserts Σ`patternCounts` === `files.length` |
| AC-3 zero-scope rule fails loudly | **PASS** | `DeadRuleError`, 5 tests incl. below-floor-not-only-zero |
| AC-4 no rule does its own discovery | **PASS** (real red) | probe produced the eslint error. Covers `scripts/rules/**` only — `scripts/lib/**` is convention |
| AC-5 zero production→development | **PASS** (real red) | live 0; scratch probe → `FAIL — 2 error(s)`, exit 1 |
| **AC-6 shrink-only misplacement ledger** | **FAIL** | `scripts/prod-dev-split.ledger.json` does not exist and **no successor carries its substance**. `baseline.json` is a disjoint artifact (crossing violations, not misplaced files) — grep for `router.tsx`/`llm-client.ts` returns 0 |
| AC-7 the files move | **PASS** | all eight destinations verified, old paths gone |
| AC-8 barrels stop advertising development | **PASS** | tombstoned with `@lore`; knip + knip:production clean |
| AC-9 `seed.ts` deleted | **PASS** (half moot) | gone; the `demo-fixture-guard` half was superseded by Ruling 10 |
| AC-10 `au6` guard retired | **PASS** (superseded, stronger) | gone with 6 siblings; replaced by hard-throwing floors |
| AC-11 nothing breaks that only running proves | **PARTIAL** | `verify:quick` + `test:full` green; **`verify`, `test:e2e`, `test:integration`, `build` unexecuted at HEAD** |
| **AC-12 rule written where a developer hits it** | **FAIL** | `docs/guides/developer/` untouched; `governance/README.md` unreachable from every file an agent reads; CLAUDE.md's Architecture section *emptied* rather than filled |

**9 PASS · 1 PARTIAL · 2 FAIL.**

---

## 3 · Documentation — step 5 is a net regression

**C-DOC-1 — `docs/architecture/runtime-simplification.md:30-31,164-172` still publishes the rule Ruling 1 overturned** ("a Layer may depend only on Layers below it"), and explicitly sanctions the cross-layer DI the linter now forbids. Ruling 1 said the contract "supersedes the three ground-truth statements **and must say so**." Step 5 is marked DONE; the file is untouched. Combined with the emptied CLAUDE.md, this is now the most authoritative-looking architecture prose an agent will find.

**C-DOC-2 — `.claude/rules/testing.md:80-84` still tells agents to register `@hyperidle/strategy-minimal`** — a package that does not exist, explicitly named by Ruling 9 step 5, in a file step 5 rewrote 45 lines of and skipped this section.

**C-DOC-3 — the rewrite points at a doc that is worse than what it replaced.** `docs/agent-layer/harness-coverage-enforcement.md` documents as live: `honest-harness-guard.ts`, `coverage-debt.allowlist.json`, `honest-harness-guard.allowlist.json`, `model-import-debt.allowlist.json` — **all four deleted by this branch** — plus 14 `packages/` paths, six non-existent files, four of five supported harnesses, and `CostCapExceededError` from a hard-deleted feature. The 45 deleted lines were ~60% accurate.

**C-DOC-4** — `docs/guides/developer/testing.md:21` describes a six-guard verify chain; five are deleted.
**C-DOC-5** — 583 `packages/` references across **80 non-archive `docs/` files**. `.claude/` and `CLAUDE.md` migrated; `docs/` not.
**C-DOC-6** — `.claude/rules/visual-regression.md:10` names `npm run token-guard:check`; no such script.
**W-DOC-1** — `.claude/rules/testing.md:74` says the attestation floor is "**real**" with "for the files the predicate identifies" as a trailing caveat. That caveat means **1 of 12**.
**W-DOC-2** — `CLAUDE.md:66`'s `requireHarness` list omits `cursor-agent`, on the line the author edited.

---

## 4 · Self-inflicted rule violations

**W-GOV-1 — work-package numbers left in two enforced registries**, against a standing founder ruling the author applied to the third:
```
governance/architecture.json:78,114   "follow-up W1" / "follow-up W3"
governance/table-owners.json:53-58    "Follow-up W4/W5/W6" ×6
```
**W1–W6 were never registered** — the real successors are AU29–AU35. Already-dangling pointers, doing exactly what `crossing-report.ts:11-14` forbids the baseline from doing.

**W-GOV-2 — `eslint.config.ts:630`**, a message the author wrote from scratch to replace a stale one, states `agent-scaffold.ts` is *"the one caller of `defaultRoster()`"*. There are two — `layers/core-ui/src/pages/SetupFlow.tsx:73`.

**W-GOV-3 — three `@lore` comments claim `governance-lint.ts` is the only file allowed to touch fs.** It imports neither `node:fs` nor `node:child_process`; `governance-context.ts` does.

**W-GOV-4 — stale `@lore` numbers argue for a live design decision using dead evidence**: two comments cite "2,022 development violations" (live: 69, collapsed by Ruling 13a).

**W-GOV-5 — the clause count is stated four ways**: code says nine, README says 13, commit says 13, `CLAUSES` has 15.

**W-GOV-6 — Ruling 5 holds in letter, not mechanism.** Roles come from `workspaces` globs, but globs match directory paths. Step 2's restructure changed verdicts wholesale (`eval` → `tooling` removed 278 violations alone). **Moving a package one directory is a supported way to clear violations without fixing them, and the ratchet cannot distinguish that from a real fix.**

---

## 5 · Tests

- **W-TEST-1 — a test that can never fail.** `governance-lint.test.ts:431-437` maps every `minFiles` to `0`, then asserts `count >= 0`. Never calls `patternLive.evaluate`. `patternLive` could be deleted and it stays green.
- **W-TEST-2 — the 250-verdict loop has no iteration assertion.** Two `expect(wrong).toEqual([])` over a `.filter()`; an empty `rows` passes vacuously. Needs `expect(checked).toBe(250)`.
- **W-TEST-3 — four of nine detectors have no behavioural test**: `api`, `mcp`, `import`, `manifest`. `import` is 3,665 of 8,054 crossings and rests on a floor with 10% headroom and nothing else.

---

## 6 · Work-package specs

**X1 — AU29 ⇄ AU30 is circular.** AU29's AC-50 demands clearing every `framework → *` production entry; one is a write to **`agentRunConfig`**, an *unowned* table. Clearing requires an owner; naming one is AU30's AC-47; AU30 depends on AU29. Worse, relocating `factory-bootstrap` without an owner **re-keys** the violation into `layer → db:table (unowned)`, which trips `refuseGrowth` — AU29 goes red with no legal forward move. The AU30→AU29 direction is correct; the graph is missing the return edge.

**X2 — AU30's AC-51 claims 19 entries its own Out-of-scope hands to AU29.**

**X3 — "90 of the 91 production table violations … exactly one genuine foreign access" is wrong**, and the error originates in the committed `governance/table-owners.json` `unowned.note`, propagating to `.pipeline/AU.md:29` and `AU30/plan.md:5`. Actual: **89 unowned + 11 foreign = 100**, across 4 named files. A planner sizing off the headline under-scopes foreign-access work 10×.

**X4 — AU29/AU31/AU32 each say `Depends on. None.` while the registry says `depends: AU28`.**

**X5 — "AU31 independent of AU29" is false** — both claim `layers/core-api/src/services/tool-provider-bindings.ts`.

**X6 — AU29 never names `demo-fixture.ts`**, which carries 11 sites to `factory-bootstrap.ts`'s 8 — the larger half of its own job, hedged into a Plan-calls aside.

**X7 — AU29 and AU35 are undersized** (both M; both touch multiple subsystems, AU35 includes a live-row migration → L).

**X8 — AU34's AC-51 contradicts its own Out-of-scope** (mandates deleting the 11 unreached modules; excludes dead-code removal beyond knip, which is green and cannot see barrel type-exports).

**X9 — AU31's "What exists today" is an implementation plan** — twelve `file:line` call sites is `/architecture` output pre-written into a seed.

**Counts verified:** AU29 30 ✓ · AU30 100 ✓ · AU31 **91** (claimed 92) · AU32 **69** (claimed 68) · total 290 ✓ (errors cancel).

**O — AU34 is not a refusal case** despite zero violations behind it: its ACs add real enforcement, and the dependency-closure cost (`hono`, `remark-*`, `unified`, `@noble/hashes` in every consumer) is concrete.

---

## 7 · Model gap needing a founder ruling

`harness` and `raw-runtime` are treated identically in production — both forbidden outside `agent-execution`, both justified by the same `rawRuntime.why` ("every model **and harness** call goes through one door"). But `relaxForDevelopment`'s `guarded` predicate lists only `raw-runtime`:

```
raw-runtime  prod: forbidden | dev: forbidden  (held: one door)
harness      prod: forbidden | dev: allowed
```

A test importing the OpenAI SDK is held; a test spawning `claude` directly is waved through — around the same single door, by the clause's own rationale. `decided-rules.json` has no `service → harness` capability row, so the founder was never asked. `governance:new-cells` does surface it.

---

## 8 · Simplification / slop

Corrected framing: this is **net −2,007 lines**, not a 9,000-line addition — twenty guards deleted (including a 1,442-line graph generator and an 866-line harness guard), 15 rules in. The size is broadly earned.

- **`dep-manifest-lint.ts` ships a second, independent census** — its own recursive `readdirSync` and a hardcoded third copy of the role-root list. Contradicts "one census, many rules."
- **Three overlapping implementations of "is this violation new"**: `compareBaseline.newDebt` (production-dead — only `stale` is consumed), `isNewDebt` (different semantics), `refuseGrowth` (near-duplicate of the first).
- **Six full-repo AST parses per lint run**, no shared cache. 5s today, linear with a 6× constant.
- **Dead plumbing**: `mcpRouterHost` threaded through four files, never read. `DbResolution.unknownReason` written four times, read never. `packageNameForDefinitelyTyped` test-only.
- **Nine silent `catch {}`** around file reads with no counter — green-by-blindness at file granularity.
- **`exec`/`execSync` in `SPAWN_FUNCTIONS` is dead weight** — they take a whole command string, so `execSync("claude -p …")` never matches. `gh` is labelled an "Agent CLI"; it is the GitHub CLI.
- **`ownerOf` reads through the prototype chain** (`in`, not `Object.hasOwn`) — a table named `constructor`/`valueOf`/`toString` escapes the ownership throw. Same pattern in four more places; nothing in the branch uses `Object.hasOwn`.
- **`validateTableOwners` has one caller: a test.** `governance-lint.ts` calls only `validateArchitecture`. README's promise — *"a new table → the build fails until you give it an owner"* — **is not enforced.**
- Type discipline otherwise strong: zero `any`, zero non-null `!`, 13 `as` all at parse boundaries. Attestation untouched and clear. `git` invocation uses `execFileSync` with argv + `-z`.

---

## What to fix first

1. **C2 + C1 together** — they compose into a full bypass of the most-cited rule. C2 is cheap (resolve through the import binding). C1 needs the model to follow re-export edges, or a rule that a package may not re-export a foreign surface it merely holds.
2. **C4** — one condition.
3. **C6 + C7** — recompute every documented number and add the tests that pin them.
4. **C5** — narrow the group key to include the table, and correct the `@lore` claim either way.
5. **W-TEST-1** — a test that cannot fail is worse than no test.
6. **The doc set** — C-DOC-1 first; it actively contradicts the linter.
