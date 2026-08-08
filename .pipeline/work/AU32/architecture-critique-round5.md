# AU32 — architecture critique, round 5 (scope: the Ruling E amendment only)

Reviewed: `founder-rulings.md` Ruling E (and A–D as constraints), `architecture.md` §1e + D7′/D8′/D9′/D11/D12/D13
+ C2/C5 + AC-4′/AC-5′ + the re-based task list, `feasibility.md` P19, `misplacement-ledger-decision.md`,
and the live code. Rounds 1–4 are not re-litigated. Measured on `pipeline/AU32` at `736dfa9e`.

**Verdict: BLOCKED — 3 blocking findings.** All three are in the closure/evidence half. The severity model
itself (D7′) and the granularity choice (§1e) hold up against the live data.

---

## Independently verified (so the builder does not re-measure)

**Live state.** `npx tsx scripts/governance-lint.ts` → PASS, `3310 tracked files (789 production, 2521
development), 33 packages, 8114 crossings, 18 rules, 221 production + 0 development known violation(s) at
warn`. Parsing all 221 warn lines: **31 distinct group keys, zero ending ` development`.**
`governance/baseline.json` — 31 groups, 221 violations, 65 files, 270 lines. `scripts/governance-baseline.ts`
— 86 lines.

**§1e's granularity table is exact.** Group keys per registered rule / violations:
`crossing-import` 11/92, `crossing-table-write` 5/50, `crossing-table-read` 4/39, `crossing-di` 4/14,
`crossing-manifest` 3/21, `crossing-mcp` 2/2, `crossing-event` 1/2, `crossing-api` 1/1,
`crossing-capability` 0/0. 8 of 9 kinds dirty in production, **0 of 9 in development**. The four
multi-sibling cells hold 92+50+39+14 = **195 of 221 (88%)**. Per-(rule, world) is 18 cells, 8 at warn.

**Sibling attribution balances.** AU29 8 keys/30 (db:util 7 + db:unknown 1 + event 2 + the three
`framework → db:table …` keys 19 + `framework → layer [di]` 1), AU30 6/89, AU31 13/91, unclaimed 4/11 →
31/221. `.pipeline/AU.md:49` does sequence AU30 after AU29 for `factory-bootstrap.ts`, so the one shared
key (`framework → db:table (unowned) [table:write] production`, 2 violations) lands in AU30 as stated.

**D12's flip set is exact.** `governance/baseline.json` at `bbe82e9a` holds 38 groups / 288 violations, of
which the seven development groups are 38/13/10/3/1/1/1 across 25/10/4/3/1/1/1 files — matching D12 row for
row. The seventh row's withdrawal is genuine, not a reclassification: `governance/decided-rules.json` now
records `tooling → raw runtime [capability]` as `production: "forbidden"` / `development: "allowed"` (same
for `service →`), with the dated `ruling14narrowing` note and row count still 124.

**Every line citation in D8′ that I checked is accurate**, including the ones easiest to get wrong:
`crossing-report.ts` `:75-77` banner, `:79-82`, `:84-88`, `:90-96`, `:98-101`, `:104-140`, `:142-198` and the
three `@lore` blocks `:2-15` / `:106-117` / `:148-162`; `crossings.ts` `:7-8`, `:21`, `:40-49`, `:56-71`,
`:99-124`; the **nine** `governance-lint.ts` sites (`:41`, `:49`, `:59`, `:125-126`, `:152`, `:158-159`,
`:171-173`, `:227-231`, `:251`); `governance-attacks.ts` `:48`, `:663-676`, `:828`, `:884-886`, `:919`,
`:1023-1039`; `crossing-detectors.ts:35`; `no-laundered-re-exports.ts:52`; `governance/README.md` `:27-31`,
`:69-89`, `:91-108`, `:135-137`; `commands.md:69,75`; `linting-and-formatting.md:40-41`. The ratchet block is
exactly `governance-crossings.test.ts:689-842` and contains exactly **12** `it(` cases (5 top-level + 7 in
`describe("the baseline may only shrink")`); the flip case is `:1108-1176`.

**`governance:baseline` is invoked by nothing.** `package.json:36` is the only definition; `lint` (`:39`) and
`verify` (`:47`) do not call it; `.github/workflows/**` contains **zero** governance references. `RatchetVerdict`
is read by nothing. `liveGroups`' only consumers are the generator (`governance-baseline.ts:26,34`) and the
ratchet (`crossings.ts:115`). `violationsOf` is correctly retained (`governance-lint.ts:59,174`).

**The sweep does not need to reach `.claude/**` or `tools/**`.** Every "baseline" hit there is a different
mechanism: visual snapshot baselines (`visual-polish/SKILL.md:73`), lint-debt prose
(`compound-candidates.md`, `CLAUDE.md:40`), the harness tiny-model matrix (`testing.md:73`), drizzle journal
re-baselining, and `eslint-plugin-design`'s own warn→error plans (`eslint.config.ts:67,114,234,292,546`).

**Rulings A–D are not perturbed.** Ruling D's "zero production-world files change" survives the amendment:
`scripts/**`, `governance/**`, `docs/**` and `package.json` sit outside the shipping roots and
`governance-crossings.test.ts` is development-named, so every file the amendment touches is development by
`CLAUDE.md`'s own definition. No schema, no migration, no FK. **AC-4′ and AC-5′ correctly replace plan.md's
AC-4 and AC-5** (the baseline-holds-zero-entries wording and the conditional, deferred deletion), and AC-4′
preserves validation scenario 2 (`plan.md:56`) verbatim as the bite proof.

**Granularity verdict: the chosen grain is right, and grain 2's rejection is arithmetically sound.** Ruling E
item 3 requires a work package to flip *its* rules in *its* PR; under per-(rule, world) four cells holding 88%
of the debt are shared by two or three siblings, so nothing flips until the last one lands. Any grain
*coarser* than that (per world, per kind-family) fails a fortiori by the same argument, which is why not
considering them costs nothing. The claim that the grain adds no new vocabulary is verified: the key is
exactly what `groupKey` emits (`crossing-report.ts:72-73`) and what each warn line already prints
(`crossings.ts:88`). Grain 3 is *finer* than grain 2 in cell count but is the smallest grain at which
Ruling E item 3 is achievable — "smallest thing that works" is satisfied on the binding reading.

---

## BLOCKING

### B1 — An unenumerated residue of the deleted mechanism, and both AC-5′ greps are built so they cannot see it

`governance/misplaced-files.json:3` — the committed `note` field of a surviving governance record:

> "… Disjoint from `baseline.json`: that one records crossing violations … (same principle as the baseline,
> see the lore at the top of `scripts/lib/crossing-report.ts`). `resolvedFiles` is the number of entries …
> the lint fails when the live count is ABOVE it … or BELOW it … There is no generator: unlike the baseline,
> nothing derives this file …"

After this PR that paragraph describes a deleted file, a deleted generator, and a **path that no longer
exists** (`crossing-report.ts` is renamed to `crossing-keys.ts` by D8′ itself). D8′ enumerates the `@lore`
blocks in `misplacement-ledger.ts:10-27` and `governance-registry.ts:27-34` and the `governance/README.md`
paragraphs — but not the note inside the record file, and D13 explicitly leaves that file untouched pending
the founder ("the only change to it is rewriting the `@lore`", decision doc `:109-110` — the `@lore` lives in
the rule, not in the JSON).

Worse, AC-5′'s own evidence cannot catch it. Neither grep reaches it:
`rg -n 'baselineRatchet|compareBaseline|refuseGrowth|--adopt|governance:baseline' scripts/ governance/ …` —
the note contains none of those five tokens; `rg -ni 'baseline' governance/README.md docs/guides/developer/…`
— the file list omits `governance/`. Verified: both greps return zero hits on that file today.

Authority: Ruling E ("`governance/baseline.json`, unconditionally"; "the bookkeeping rule should be removed";
this WP owns the deletion) and D8′'s own stated purpose — "enumerated so that a half-removal shows up as an
omission rather than as a lint that still reads as if it keeps books." This is precisely that half-removal, in
an enforced artifact, and the failure survives the AC.

### B2 — AC-5′'s residue grep is blind to `scripts/rules/crossings.ts`, the primary file in the closure

`scripts/rules/crossings.ts` contains a **literal NUL byte at offset 3084 (line 64)** — the site separator is
written as a raw `\0` inside a template literal: `const siteKey = \`${key}<NUL>${file}\``. Consequences,
measured:

- `file scripts/rules/crossings.ts` → `data`; ripgrep classifies it binary and **silently skips it**.
- `rg -n --fixed-strings "crossing-report" .` returns no hit from that file, while `rg -a` shows `:8`, `:11`,
  `:12`. A repo-wide `rg 'baselineRatchet|compareBaseline|refuseGrowth|--adopt|governance:baseline'` returns
  **nothing** from that file although `baselineRatchet` is defined at `:105` and `compareBaseline` is called
  at `:115`.

So AC-5′'s central proof — "`rg …` → zero hits" — would report a clean closure today, with the ratchet fully
intact, for the one file that matters most. The blindness is self-referential: it lifts only once the
`seenPerSite`/`isNewDebt` block that holds the NUL is deleted, which is the very thing the grep exists to
confirm. `CLAUDE.md` names this hazard explicitly ("Grep can misreport files with control characters as
binary and skip them — never conclude 'no matches' … from grep alone; confirm with `rg -a`").

A grep that cannot fail on the residue it is looking for is not evidence for AC-5′.

### B3 — D9′ case 3 is a test that cannot fail, in a work package whose own ruling bans them

D9′ case 3: "a `"warn"` entry whose rule key has **zero** live violations produces **no error** — the case
that fails if anyone rebuilds the stale-record check D7′ forbids." As specified it sits beside cases 1–2 in
`governance-crossings.test.ts`, i.e. a unit test over `crossingRules`. But `crossingRules`' `evaluate` maps
over `myViolations` (`crossings.ts:82-94`): with zero violations for that key it emits nothing **by
construction**, whatever the severity map says. The case is green before the change, green after, and green
under every implementation of the forbidden check that is written the way the old one was — as its **own
registered rule** about the record file rather than about the code, which is exactly how `baselineRatchet`
was built and why (`crossings.ts:99-104`: "Separate from the per-kind rules because it is about the baseline
FILE rather than the code"). D7′ itself frames the replacement as a *report*, i.e. emitted outside
`crossingRules`.

So the prohibition Ruling E cares about most is pinned by nothing, and AC-4′ cites this case as evidence.
Authority: Ruling B, binding and applied as a principle — "a condition already guaranteed by construction
… is deleted. It is not resurrected … not kept for the shape of its coverage," and the builder must sweep
touched files for tests that cannot fail. The plan proposes adding one to a file it is already touching.
Either pin the prohibition where it would actually reappear, or drop the claim that it is pinned; do not ship
a vacuous case as AC evidence.

---

## NON-BLOCKING DEFECTS

**N1 — `knip` is not a gate on the leaving exports.** D8′/P19e: "`knip` and `knip:production` are a gate on
this task … six exported symbols leave `crossing-report.ts`." `knip.json`'s root workspace declares
`entry: ["scripts/*.ts!", "scripts/lib/**/*.ts!", "scripts/rules/**/*.ts!"]`, and knip does not report
unused *exports* of entry files unless `includeEntryExports` is set (it is not). Proof from the live tree:
`RatchetVerdict` (`crossing-report.ts:90-96`) is exported, read by nothing, and knip is green. So a leftover
`refuseGrowth`/`compareBaseline` left *defined but unused* would pass knip, pass typecheck, and — per B2 —
pass the grep. Review is the only gate; say so rather than naming a check that does not do it. (knip should
not newly *fail* either: no entry names the deleted file, so that claim is safe.)

**N2 — The attack path's `severityOf` is unspecified, and the wrong choice weakens the break-tests.** D8′
deletes `EMPTY_BASELINE` (`governance-lint.ts:158-159`) and `baseline: EMPTY_BASELINE` (`:152`) without
naming what `buildRules` passes instead. It matters: the `clean` control judgement filters
`findings … f.severity === "error"` (`governance-attacks.ts:851-857`). Today every overlay violation is an
error, so controls are judged strictly; if the builder wires `loadRuleSeverity()` into `buildRules`, a control
carrying a violation on a production `warn` key would pass as clean. The honest analogue of the deleted
constant's comment ("An overlaid tree has no debt, so the crossing rules judge it against nothing") is
`() => "error"`. Pin it.

**N3 — D11's population and floor are wrong.** "`minScope: 4`, against a live 5." Under D11's stated
population — tracked files under `governance/` plus the surviving governance CLIs — the live count after the
change is **9**: six record files (`README.md`, `architecture.json`, `decided-rules.json`,
`table-owners.json`, `misplaced-files.json`, `rule-severity.json`) plus three CLIs (`governance-lint.ts`,
`governance-floors.ts`, `governance-new-cells.ts`). A floor of 4 against 9 lets the rule lose five of nine
inputs and still pass — the `au6` failure mode `minScope` exists to prevent (`governance-rules.ts:9-15`).
Measure it; do not transcribe 5.

**N4 — D11 clause 4's premise is off, and the scan will false-positive on prose.** `governance-floors.ts` and
`governance-new-cells.ts` parse **no** flags at all (zero `--flag` occurrences), so the declared set is
exactly the lint's three; "whatever the surviving CLIs legitimately take" reads as though there are more. And
a textual scan of the surviving CLIs matches `--quiet` inside a comment (`governance-lint.ts:30`) plus the
usage-banner flags — state whether the check reads argv comparisons or any `--…` text, or it fails on a
sentence.

**N5 — The largest stated blind spot is mis-shaped, which misdirects the only gate.** `decide(arch, crossing,
world)` (`governance-model.ts:402`) receives a `Crossing` of `{kind, source, target}` (`:94-98`) — **no file
path**. A path hardcoded into a clause therefore cannot be written without widening the type or the
signature, which is a compile-visible diff at every call site. The carve-out that genuinely is undetectable is
by **package or target name** (`Actor.name`, `Target.surface`), which mirrors the legitimate `scope: "named"`
rows already in `decided-rules.json` (e.g. `harness-registry → raw runtime`) and so reads as native to the
model. I am not asking for it to be closed — Ruling C bans it and review is the gate. I am asking that the
disclosure name the shape a reviewer would actually have to look for.

**N6 — "The unit of severity is the unit of decision" is false for 9 of 31 keys.** Parsing all 31 live keys
against `decided-rules.json`'s 124 rows: **9 keys (119 of 221 violations) have no corresponding row** — every
`db:table (unowned)` key (7 keys, 91 violations; `unowned` is not a target in the decided set at all) plus
`framework → db:table (other) [table:write]` and `[table:read]`. Those verdicts come from model clauses, not
decided rows. The load-bearing half of the argument (the key is `groupKey`'s existing output) is verified and
sufficient; the decided-rules correspondence should not be asserted.

**N7 — The bite proof needs its precondition stated.** The companion clause credits the **whole file's** write
set (§1b, `crossing-detectors.ts:781-783`, `governance-model.ts:372-389`), so appending "a bare `teams`
insert to a development fixture" produces **no finding** if that fixture is one of the 26 files this work
package just completed — which is the most natural file for the builder to reach for. It fails loudly rather
than falsely green, but name the precondition (a development file whose write set contains no `teamMembers`)
so the mandatory proof does not cost a confusing cycle. Otherwise AC-4′(iii) is specified well enough to
execute and check: exit code, `ERROR  [crossing-table-write] <file>:<line>`, output committed to `probes/`,
revert.

**N8 — The false-documentation sweep misses the siblings' operating instructions.** `.pipeline/AU.md:52` tells
AU29/AU30/AU31/AU32 that "whichever of the four clears the last entry deletes `governance/baseline.json` and
the `--adopt` escape hatch in the same commit … the baseline is shrink-only, so each work package already
promotes its own rules to error as it goes"; `:48` and `:50` describe the generator and the baseline as the
mechanism the siblings clear against. All three are false after this PR, and they are exactly where the three
siblings will look for how to flip their rules. (`governance/README.md` is the right durable home and the plan
does route the dial there — this is the registry copy, not the enforced one.)

**N9 — D13's stated cost omits a whole test file.**
`framework/db/src/__tests__/governance-lint.test.ts:641-708` holds eight unit tests over the ledger, three of
them specifically about the count (`:670` "is clean when the live count matches", `:673` "fails when the
ledger GROWS", `:679` "fails when a misplacement is cleared and the shrink is not committed"), and its
`ledger()` helper constructs `resolvedFiles` — so dropping the field breaks compilation there too. The founder
is being asked to weigh cost, and it is larger than "~15 lines in one rule, two attack assertions, README".

**N10 — The decision doc's "nothing goes red" claim is narrower than stated.** `misplacement-ledger.ts:65-71`
still errors when the classifier now calls a ledgered file development — i.e. exactly when someone *fixes* a
misplaced file — instructing them to edit the record. That is the same friction shape as the count, one step
removed. The rest of the doc's facts check out: `:94-98` is the bookkeeping-only failure verbatim, `:88-93` is
the above-count branch, the three fact-naming errors are `:58-63`/`:65-71`/`:72-75`, the record holds 4
entries with `resolvedFiles: 4`, and the stated cost of deleting the record outright is accurate — nothing
else in the repo records those four judgements, and `CLAUDE.md`'s production/development section is the only
other place the mechanism is described.

**N11 — Say where the "clean rule still at `warn`" report lives.** If it is emitted as a `Finding` carrying
`world` and `group`, it enters `printKnownDebt` (`governance-lint.ts:77-103`) and the summary counts at
`:292-293` — which AC-4′(i) asserts exactly (`221 production + 0 development`). Nothing fires today (all 31
keys have violations), so this is latent, but the first sibling to clear a key would move a number AC-4′
treats as fixed.

**N12 — Citation drift, all harmless.** `governance-crossings.test.ts` imports are `Baseline :20`,
`compareBaseline :21`, `groupKey :22`, `refuseGrowth :23`, `targetLabel :24` — D8′'s "`:20-23`" would take
`groupKey` and leave `targetLabel`; the prose ("`groupKey` and `targetLabel` stay") is right. The census
arithmetic is now 3310 → 3308, not 3309 → 3307 (HEAD added a file; 332 of slack, conclusion unchanged).
`governance-context.ts`'s baseline `@lore` runs `:9-11`. D12's header says one rule ceases to exist in
development, while C2/D6′ correctly flip **two** raw-runtime rows (`service →`, `tooling →`) — only the
tooling one carried a violation. §1e/P19c describe the unclaimed four as `credentials` +
`filesystem-mounting`, but the fourth key is `layers/core-api/src/schemas/bet.schema.ts:15`
(`layer → db:table (other) [import]`); the count of 11 is right.

---

## FOLLOW-UP / NOTE

**F1 — Two rule lists become one.** Once `baseline` leaves `CrossingRuleInput`, `buildRules`
(`governance-lint.ts:128-156`) and `runLive`'s hand-duplicated `RULES` array (`:235-252`) are the same list;
the only reason they differ today is `EMPTY_BASELINE` vs `loadBaseline()`. Leaving both means
`no-per-file-allowances` must be registered twice, and a rule added to one and not the other runs in one lane
only — the coverage gate reads its ids from the attack pass (`governance-attacks.ts:919`), so a live-only rule
is not even coverage-checked. Collapsing them is optional; registering twice is not.

**F2 — The re-keying case is worth one sentence for the siblings.** When AU30 gives `sessions` an owner, seven
`db:table (unowned)` keys (91 violations) disappear and are replaced by `db:table (other)`/`(own)` keys that
are **absent** from `rule-severity.json` — i.e. errors — before the accessor moves land. Under the baseline the
same thing happened (a new group with no entry made every violation new debt) and `--adopt` was the answer;
under D7′ the answer is a one-line `warn` entry, which C5 already frames correctly as a reviewed downgrade.
Naming the case in `governance/README.md` would save a sibling a surprise red build.

**F3 — The README shape table's thesis gains a fourth noun.** `governance/README.md:27-31` is a three-way
split with a stated thesis ("A clause is a principle. A registry is a fact. A decided rule is a decision.").
`rule-severity.json` is none of those three; T12 has to name what a severity *is* rather than append a row.

**F4 — The `[known debt]` suffix.** `crossings.ts:88` appends " [known debt]" to every warn message. It reads
as a reference to a record after the record is gone; a warn on a rule that is not yet clean is the honest
phrasing.

---

## On the two questions the brief asks directly

**Granularity.** Group-key grain is the right choice and the analysis behind it is sound and independently
reproducible (numbers above). It is finer than per-(rule, world) in cell count, but it is the smallest grain
at which Ruling E item 3 — a work package flips its own rules in its own PR — is achievable, because 88% of
production debt sits in four cells shared by two or three siblings. No coarser scheme survives that argument,
so the two the planner did not consider cost nothing. "No new vocabulary" is verified against
`crossing-report.ts:72-73`; the weaker supporting claim about `decided-rules.json` is wrong for 9 of 31 keys
(N6) and should be dropped rather than defended.

**Deletion closure.** The enumeration is unusually accurate — every line citation I checked matches source,
the mechanical consequences (rule count 18, census floor, `alsoRegistered` emptying, `RatchetVerdict` dead,
`liveGroups`' two consumers) are right, and `governance:baseline` is genuinely invoked by nothing. It is
**not complete**, and more importantly its *evidence* cannot detect its own incompleteness: one residue is
missed outright and invisible to both greps (B1), the primary file is invisible to ripgrep because of a NUL
byte (B2), and the named gate for leftover unused exports does not gate them (N1). Compile errors will catch
every symbol that is still *used*; nothing named in the plan catches what is left *defined*, *commented*, or
*written into a record file*. That is exactly the "lint that still reads as if it keeps books" outcome
Ruling E's closure is about.
