# AU32 — architecture critique, round 6 (narrow verification pass: are B1/B2/B3 closed?)

Scope as briefed: confirm the three round-5 blockers are genuinely closed, confirm the non-blocking
corrections landed, and confirm the granularity model / §1e table / D12 flip set are untouched. The
granularity model and the flip set were **not** re-litigated. Measured on `pipeline/AU32` at `736dfa9e`
with the uncommitted `architecture.md` + `feasibility.md` amendment in the working tree.

**Verdict: BLOCKED — 1 blocking finding.** The three round-5 blockers are **all closed**, and closed on
evidence I reproduced rather than accepted. The single blocker is a *new* site of the B1 class, found by
the spot-check the brief asked for, sitting in the three files the amendment already opens for editing —
and the amendment's own boundedness rule actively forbids fixing it. Fix is three bullet rewrites.

---

## The three closures — all hold, and here is what convinced me

### B2 — CLOSED. The proof now fails on the residue, and I watched it.

Ran the plan's exact positive control on the live tree:

```
git grep -na -e baselineRatchet -e compareBaseline -e refuseGrowth -e 'governance:baseline' \
  -e '\-\-adopt' -e 'baseline\.json' -e 'baseline-ratchet' -- scripts governance package.json \
  docs/guides/developer framework/db/src/__tests__ .pipeline/AU.md \
  .pipeline/work/AU29/plan.md .pipeline/work/AU30/plan.md .pipeline/work/AU31/plan.md
→ 74 lines, 19 files
```

**74 / 19 exactly**, with `scripts/rules/crossings.ts` at **7** hits (`:12`, `:105`, `:108`, `:115`,
`:117`, `:119`, `:120`) and `governance/misplaced-files.json` at **1** (`:3`). Both expectations the plan
publishes for the builder reproduce byte-for-byte, so the builder will not stop on a false alarm.

The asymmetry the whole finding rests on is real:

| form (5 original tokens, original file list) | hits | from `crossings.ts` |
|---|---|---|
| `rg -n` | **39** | **0** |
| `rg -na` | **43** | 4 |
| `git grep -na` | **43** | 4 — output `diff`-identical to `rg -na` |

`file scripts/rules/crossings.ts` → `data`. Over a directory traversal `rg -n` reports **nothing** from
that file; given the path explicitly it prints `:12` and then stops at the NUL. Either way AC-5′ as
written would have read clean with `baselineRatchet` defined and `compareBaseline` called. The canonical
form is immune, and `git grep`'s tracked-file bound is a real second benefit (no untracked scratch file
can pad the control's expected count — which matters, since the tree already gained a file between
rounds).

NUL sweep verified at byte level, independently:

- `git ls-files scripts/ | (count NUL bytes per file)` → **exactly one file, one byte**:
  `scripts/rules/crossings.ts`.
- `grep -abo $'\x00'` puts it at byte 3084, on **line 64**: `const siteKey = \`${key}^@${file}\``.
- Line 64 is inside the `seenPerSite`/`isNewDebt`/`newness` block, and D8′'s `crossings.ts` row deletes
  that block (`:56-71`) outright — not as prose cleanup but because D7′ replaces per-site newness with
  `severityOf(ruleKey)`, so the block cannot survive the change. **The hazard goes by construction; no
  delimiter change is needed and none is planned.** Correct call.
- Repo-wide tracked non-image NUL scan returns exactly the four files named plus `.DS_Store`:
  `crossings.ts` (1), `framework/shared/src/blocks/block-id.ts` (3),
  `framework/shared/src/__tests__/blocks/derive-blocks.test.ts` (1),
  `layers/core-ui/src/layouts/AppShell.tsx` (1). None of the three is in AC-5′'s search list, and
  `git diff --name-only origin/main` (75 files) contains none of them. Reporting rather than fixing them
  is right.

### B1 — CLOSED for the enforced artifact, and the D13 independence is real.

`governance/misplaced-files.json:3` carries all four statements verbatim: "Disjoint from
`baseline.json`"; "(same principle as the baseline, see the lore at the top of
`scripts/lib/crossing-report.ts`)"; "the lint fails when the live count is ABOVE it … or BELOW it";
"There is no generator: unlike the baseline, nothing derives this file". The rewrite is unconditional and
**T9b states the independence precisely** — "the four baseline references — unconditional, independent of
D13, and the sentence about `resolvedFiles` stays until the founder rules". That is exactly right: the
baseline references are stale either way, and the count sentence's fate stays with the founder. (D8′'s
prose is looser than T9b here — see N8.)

Every new sweep row checked against source and every one is accurate:

- `scripts/rules/misplacement-ledger.ts:85-86` — "// The ratchet. Both directions: above is new debt
  parked here, below is a fix whose shrink was never committed — the second is what turns a ratchet into
  a rubber stamp." Verbatim.
- `scripts/lib/crossing-report.ts:20` — "How a target is named in a finding and in the baseline key."
  `:71` — "/** The stable key a violation is grouped and baselined under. */". Both on **surviving**
  symbols. Verbatim.
- `scripts/lib/governance-attacks.ts:1041` — `id: "misplacement-ledger-ratchet"`, driving
  `rules: ["misplacement-ledger"]`. Verbatim; the id does name a mechanism that will not exist.
- `.pipeline/AU.md:48,:50,:51,:52` — all four read as described; `:52` is false in every clause.
- The three sibling plans' bullets at the enumerated lines all read as described.

The negative half is also right. `.claude/rules/testing.md:77` is the deleted honest-harness allowlists,
not this mechanism; `scripts/typecheck-gate.ts` + `CLAUDE.md` are the typecheck ratchet; `scripts/obs.ts`
is an A/B arm. Leaving `.pipeline/work/AU28/plan.md:177` alone is the right call — that is history, and
Ruling E revises AU28 rather than rewriting it.

### B3 — CLOSED. The vacuous case is gone and the replacement is genuinely falsifiable.

The withdrawal reasoning checks out against source: `crossingRules.evaluate` maps `myViolations`
(`crossings.ts:82-94`), so a zero-violation key emits nothing whatever the severity map says; and
`baselineRatchet` was indeed built as its own registered rule about the record file
(`crossings.ts:99-124`, registered only in `runLive`'s `RULES` at `:251` plus
`alsoRegistered: ["baseline-ratchet"]` at `governance-lint.ts:171-173`) — a place a `crossingRules` unit
never reaches. Ruling B applies; not adding it is correct.

The replacement is falsifiable on all three axes the brief names. `readyToFlip(severity, liveKeys)` over
two `"warn"` keys with one live: invert the predicate → returns the live key → the name assertion fails;
drop the report → length 0 ≠ 1 → fails; name the wrong key → fails. And it is a real red phase: the
function does not exist, so the import fails before T8. T11 and the proof-steps list both require the red
observation ("D9′ case 3 red against a tree where `readyToFlip` does not yet exist") — not optional, and
observable.

`readyToFlip`'s inability to perturb AC-4′'s numbers is verified rather than asserted: `printKnownDebt`
filters `f.severity === "warn" && f.group !== undefined` (`governance-lint.ts:78`) and the summary counts
`warnings.filter((f) => f.world === …)` (`:292-293`). A plain string carries neither. The `NOTE` shape it
copies is real (`:282-285`, `unplacedDbSymbols`).

**On the honesty of the admission:** holding the *ban* with a return type + a README prohibition + review
is the right call here, and it is the honest disclosure the standing rule asks for. `readonly string[]`
vs `Finding[]` is load-bearing — `Finding` is the only carrier of severity in this lint, so the gate
cannot be built without a compile-visible signature change and a `runRules` routing change in a reviewed
file. One sentence of the admission is over-stated (N5): a falsifiable test *shape* does exist, it just
has no lane in this design. Say that, rather than "no test can".

### Item 8 — granularity model, §1e table and D12 flip set: confirmed unchanged.

§1e occupies lines 189-278 of the amended file; exactly one diff hunk touches it (`@@ -233,11 +261,18 @@`),
and it contains only the "no new vocabulary" paragraph plus the withdrawal. The granularity table sits
above it, untouched. D12 spans 826-881; the only hunk inside it (`@@ -640,10 +852,30 @@`) rewrites proof
item 3 (the bite precondition). **The seven-row flip-set table at `architecture.md:832-840` is untouched.**

---

## BLOCKING

### B4 — The identical promotion bullet in all three sibling plans is false after Ruling E, is not enumerated, and the amendment's own boundedness rule forbids touching it

`.pipeline/work/AU29/plan.md:33` · `AU30/plan.md:35` · `AU31/plan.md:35` — the same sentence in each:

> "The baseline is shrink-only, so this work package promotes its own rules as it goes: clearing a
> group's last site deletes the entry and that rule is at error from the same commit. **There is no
> separate promotion step to remember, and none to defer.**"

Under Ruling E there **is** a promotion step, and it is the only thing item 3 of the ruling asks a sibling
to do: clear your group keys, then **remove those keys from `governance/rule-severity.json`** so the rule
bites with your PR. That is precisely the instruction the amendment writes into `.pipeline/AU.md:52` for
these same three work packages. Left standing, each sibling's own plan tells it the opposite of the
founder's model, in a bullet under **Contracts / constraints**.

Why the amendment cannot catch it:

1. **The enumeration skips it.** D8′'s sweep row lists `AU29:11,34,35,50,51` · `AU30:36,51,52` ·
   `AU31:36,51,52`. `AU29:33` sits directly above the enumerated `:34`; `AU30:35` directly above `:36`;
   `AU31:35` directly above `:36`. Adjacent bullets, one listed and one not — an enumeration gap, not a
   choice.
2. **The evidence cannot see it.** The bullet names "the baseline" in prose and none of the seven tokens.
   Confirmed: the positive control reports `AU29` at `:11,34,35,50,51` and `AU30`/`AU31` at `:36,51,52`
   only. So AC-5′(b)'s "zero hits after" is satisfied with all three bullets intact — the same defect
   shape as B2, reproduced for a different residue. Measured alternative:
   `git grep -nai -e 'shrink.only' -e 'may only shrink'` over the same list reaches all three.
3. **The plan instructs the builder to leave it.** "The edit is bounded to exactly the bullets that name
   `baseline.json`, `--adopt`, or the generator … **No other line of any sibling plan is touched**"
   (D8′ sweep row; repeated in T9b). These bullets name none of the three tokens, so a builder following
   the plan literally must skip them.

Same class, one more site: `.pipeline/work/AU30/plan.md:28` — "Sequence the five cheap assignments first
so **the ratchet records progress** while the sessions question is still open; the plan should say
explicitly that **no rule promotes until the last one lands**." Both clauses are false after this PR, and
the second is the exact belief the group-key grain was chosen to eliminate.

Authority: Ruling E item 3 ("A work package clears every warning for its set of rules, then flips those
rules to `error` in the same pull request"), plus the amendment's own AC-5′ claim that the mechanism is
gone with the residue search as evidence, plus D8′'s stated purpose ("enumerated so that a half-removal
shows up as an omission"). The plan claims the general question "has now been asked mechanically and
answered" — it was asked with a token set that cannot reach the phrase, and the miss lands on the single
most consequential instruction the siblings will read.

Cost to close: three bullet rewrites + one `AU30:28` clause, inside files T9b already opens, and one
widened token so the search can see the class.

---

## NON-BLOCKING DEFECTS

**N1 — P23's "all five development files that insert `teams`" is wrong by a factor of ~36, and it makes an
unreachable fallback look viable.** Measured: `git grep -l 'insert(teams)' -- '*__tests__*'` → **178**
development files, and **zero** of them contain no `teamMembers` mention. The conclusion P23 draws is
therefore *stronger* than stated (the trap is universal, not confined to five files in
`framework/db/src/__tests__/`), and the chosen remedy — a new `*.probe.ts` whose write set is `{teams}` by
construction — is unaffected and correct. But D12 item 3's fallback branch ("If the builder appends to an
existing fixture instead, the precondition is that the file's write set … contains no `teamMembers`")
reads as a viable option with a searchable precondition; on the live tree **no** existing development file
that inserts `teams` satisfies it. Either drop the fallback or say it is empty today.

**N2 — AC-5′ forces an edit that the boundedness rule does not authorize: `AU29/plan.md:11`.** It is
enumerated, and AC-5′(b)'s zero-hits over `.pipeline/work/AU29/plan.md` cannot be met without changing it
(its last sentence carries both `governance/baseline.json` and `npm run governance:baseline`). But it is
the **What exists today** prose paragraph, not a bullet, and it is where AU29's file set and symbol list
live (`architecture.json`'s thirteen modules, the `db:util` anomaly, the four `db:unknown` symbols,
`factory-bootstrap.ts`'s write sites, the two `shared` bus sites). The boundedness guarantee ("no scope,
file set, violation count, or dependency edge changes") is exactly what is at risk there. Name the
sentence — "`governance/baseline.json` holds every one of these … and `npm run governance:baseline`
regenerates the file" — rather than the paragraph.

**N3 — The residue search's token set cannot see the bare word `ratchet`, so three of the sweep's own new
rows are outside AC-5′(b) in both directions.** `misplacement-ledger.ts:85-86`,
`crossing-report.ts:20`/`:71` and the `misplacement-ledger-ratchet` attack id match none of the seven
tokens (`baseline-ratchet` does not match `misplacement-ledger-ratchet`; "baselined under" does not match
`baseline.json`). Measured: `git grep -nai ratchet` over the same list reports six files the token set
misses. The plan asserts that "search and enumeration agreeing is what makes 'zero hits after' mean
*closed* rather than *unlooked-at*" — for those three rows only the enumeration and review apply, and the
plan should say which rows the search covers and which it does not.

**N4 — Nothing shows the `readyToFlip` NOTE is actually wired into `runLive`.** The unit passes on a
function that is never called, and the block prints nothing on today's tree (all 31 keys carry
violations), so the wiring is unobservable at build time. The plan does state that nothing fires today —
accurate, not hidden — but the wiring itself has no evidence and should be named as review-only, like the
ban.

**N5 — One sentence of the ban admission is over-strong.** "No test can assert the absence of a future
rule without being an inverted-coverage check that names its own evasion." A *positive* assertion at the
registered-rule-set level would not be one: a synthetic tree judged against a severity map that holds a
clean `"warn"` key, asserting the run produces no error carrying that key, goes red exactly if the
forbidden check reappears as its own registered rule — the place D9′ itself says it would reappear. The
real obstacle is design-specific and worth stating instead: `buildRules` deliberately passes
`severityOf: () => "error"` (D8′), so **no lane in this design judges a synthetic tree against a real
severity map**, and creating one is a new injection seam. Declining is defensible; the reason should be
the true one.

**N6 — The `*.probe.ts` bite proof and `knip`.** While the probe exists it is an unreferenced source file
inside a workspace; `npm run knip` reports unused files. T12 runs `check && lint && test:all` and the bite
proof in the same step. Sequence the probe's creation-and-deletion so no knip run overlaps it, or say the
overlap is expected.

**N7 — Citation drift, all harmless, all verified against source.** `governance-attacks.ts` — the
`f.severity === "error"` spread is `:854`, and `:855` is the closing `];` (D8′/P25 say `:855`); the two
spreads are `:853-854`. `governance-model.ts` — `Crossing` is `:92-96`, not `:94-98`; `Actor`'s `name`
field is `:52` and `Target`'s `surface` is `:62` (the type declarations are at `:51`/`:59`); `decide` at
`:402` is exact. `governance-lint.test.ts` — "is clean when the live count matches" is `:671`, GROWS
`:675-678`, uncommitted shrink `:680-683`; the `ledger()` helper at `:650-655` and the eight-case count
are exact. `governance-lint.ts` usage-banner flags are `:22-25`. `trackedFiles()` runs
`git ls-files -z --cached --others --exclude-standard` (the `-z` is dropped in the quote; the substance —
untracked-but-not-ignored files enter the census, so the probe needs no `git add` — is verified at
`governance-context.ts:152-159`). D8′'s table says the NUL block is `:56-71` while the new B2 text says
`:62-71`; both contain line 64.

**N8 — D8′'s "four separate false statements" list and its D13 caveat contradict each other.** The list
counts the `resolvedFiles` count sentence as one of the four, then the same cell says "If D13 is declined,
the sentence about the count stays true and stays" — i.e. it is not false. The four *baseline references*
are the disjointness clause, the "same principle as the baseline" clause, the `crossing-report.ts` lore
pointer and the "unlike the baseline" clause; the count sentence is a fifth, D13-dependent item. T9b gets
this exactly right; align the D8′ prose to it so the builder is not choosing between two readings on a
line the founder has reserved.

**N9 — Round-5 N12 still open, still harmless.** D12's header says "one rule ceases to exist in that
world" while C2/D6′ flip **two** raw-runtime rows (`service →`, `tooling →`); only the tooling one carried
a violation, so the table is right and the header undercounts.

---

## Non-blocking corrections from round 5 — each confirmed landed

- **Withdrawn `decided-rules.json` claim (N6).** Verified: `.rows | length` → **124**; 30 distinct
  targets, exactly P20's list; `git grep -ci unowned governance/decided-rules.json` → zero hits. The
  withdrawal is correct and the load-bearing half (`groupKey` at `crossing-report.ts:72-73`, the warn line
  at `crossings.ts:88`) stands alone.
- **`severityOf: () => "error"` in `buildRules` (N2).** Landed, and P25's re-derivation of the *reason* is
  correct where round 5's was not: the `clean` control lists raw crossing violations irrespective of
  severity (`governance-attacks.ts:853`) before the `error` filter (`:854`), so a `warn`-keyed crossing on
  a control is still reported. The stated reason — independence of 47 break-test verdicts from a record
  file three siblings will edit — is the honest one.
- **D11 population and floor (N3).** Verified: `git ls-files governance/` → 6 today; after the change
  −`baseline.json` +`rule-severity.json` = 6 records, plus three surviving CLIs (`governance-lint.ts`,
  `governance-floors.ts`, `governance-new-cells.ts`; `governance:baseline` deleted,
  `governance-context.ts` is a loader) = **9**. `minScope: 8` is right, and it survives the D13 branch at
  8. AC-5′'s `git ls-files governance/` expectation is correctly restated from 5 to **6** with the paths
  named.
- **D11 clause 4 premise and argv-vs-textual (N4).** Verified: zero `--` occurrences in
  `governance-floors.ts` and `governance-new-cells.ts`; `governance-lint.ts:303-307` compares argv against
  exactly `--fixtures`, `--attacks`, `--errors-only`; `--quiet` really does appear in a comment at `:30`
  and the flags again in the banner at `:22-25`. Reading argv comparisons rather than `--…` text, with a
  hard-fail on a zero-match scan and an expected count of 3, is the correct shape.
- **The blind spot restated (N5).** Verified: `decide(arch, crossing, world)` at `governance-model.ts:402`
  receives `{kind, source, target}` with no path, so a path-keyed carve-out cannot be written without a
  compile-visible signature change; and `scope: "named"` rows do exist (17 of them, including
  `harness-registry → raw runtime [capability]`), which is what makes a name-keyed clause read as native.
  Deliberately not closed, stated accurately — the right posture.
- **D12's bite precondition and the `*.probe.ts` approach (N7).** Landed. `trackedFiles()` does include
  untracked-not-ignored files (`governance-context.ts:152-159`), so the probe enters the census without
  `git add` — the load-bearing dependency holds. `__tests__` makes it development, and `*.probe.ts` is
  outside vitest's default include. See N1 for the enumeration error inside the supporting probe.
- **D13's corrected cost (N9).** Verified: `governance-lint.test.ts:641` opens a describe with **eight**
  `it(` cases, three specifically about the count, and the `ledger()` helper constructs `resolvedFiles`
  (`:650-655`) — so dropping the field breaks compilation there. N10's narrower "nothing goes red" is also
  restated: `misplacement-ledger.ts:65-71` still errors when the classifier calls a ledgered file
  development.
- **F1, both rule lists (F1).** Verified and correctly promoted from optional to mandatory:
  `buildRules` (`governance-lint.ts:128-156`) and `runLive`'s `RULES` (`:235-252`) differ today only by
  `EMPTY_BASELINE` vs `loadBaseline()` plus `baselineRatchet`. Registering `no-per-file-allowances` in one
  only would make it run in a single lane, and the coverage gate reads ids from the attack pass.
- **Census as arithmetic rather than a transcribed number.** Verified live: `governance-lint: PASS —
  **3311** tracked files (789 production, 2522 development), 33 packages, 8114 crossings, 18 rules, 221
  production + 0 development known violation(s) at warn`. Stating it as −2 +1 +1 +rename-0 = net zero
  against `MIN_TRACKED_FILES = 2976` is the right fix for a number that has moved three times.
- **knip's real reach (N1).** Verified: `knip.json`'s root workspace declares
  `entry: ["scripts/*.ts!", "scripts/lib/**/*.ts!", "scripts/rules/**/*.ts!"]` with no
  `includeEntryExports`, and `RatchetVerdict` is exported, read by nothing, and knip is green. Saying knip
  must stay green but is **not** the gate, and naming the search + review as the gate, is the honest
  statement.

---

## FOLLOW-UP / NOTE

- **F1 — `.DS_Store` is tracked** (5993 NUL bytes). P21 flags it as a separate hygiene finding; correct
  not to fix here, worth its own line somewhere durable.
- **F2 — the three NUL-carrying source files** (`block-id.ts`, `derive-blocks.test.ts`, `AppShell.tsx`)
  are a real trap for every future agent and the plan is right to report rather than fix them. A one-line
  note in `governance/README.md` alongside the `git grep -na` instruction would outlive this plan file.
- **F3 — `governance/README.md`'s shape table still needs a fourth noun** (round-5 F3), and T12 carries it.
- **F4 — the `[known debt]` suffix** on every warn message (`crossings.ts:88`) still reads as a pointer to
  a record that will not exist (round-5 F4). Not enumerated; optional.

---

## Bottom line for the builder

B1, B2 and B3 are closed on reproduced evidence: the positive control lands on 74/19 with `crossings.ts`
at 7 and `misplaced-files.json` at 1; `rg -n` 39-with-nothing-from-`crossings.ts` vs `git grep -na` 43 is
real and the canonical form is immune; the single NUL in the whole `scripts/` tree sits on line 64 inside a
block the change deletes for independent reasons; the vacuous case is gone and its replacement goes red on
inversion, on omission and on the wrong key, before the function it tests exists. P22a's two-way mapping
closes at file granularity — all 19 files the control reports have a closure row, and every closure row
belongs to a reported file.

One blocker remains and it is three bullets: `AU29/plan.md:33`, `AU30/plan.md:35`, `AU31/plan.md:35`
(plus `AU30/plan.md:28`) still tell each sibling there is no promotion step, which is the one thing Ruling
E item 3 requires them to do. They are unenumerated, unreachable by the token set, and explicitly
excluded by the plan's own "no other line of any sibling plan is touched".
