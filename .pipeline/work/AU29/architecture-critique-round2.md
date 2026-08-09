# AU29 — Architecture critique, round 2

Fresh evaluation of `.pipeline/work/AU29/architecture.md` (revision 2) + `feasibility.md` +
`probes/` against `plan.md` (authority) and `requirements.md` (§4 lattice binding), at
`52080e21` on `pipeline/AU29`. Primary question: did the revision genuinely close round 1's B1?
Every claim below was re-verified by this reviewer — probes re-executed, registry numbers
re-derived from `governance/decided-rules.json`, source lines re-read. Verdict at the bottom.

## B1 closure — verified by re-execution: CLOSED

`bash .pipeline/work/AU29/probes/unplaced-escalation-probe.sh` re-run end to end on the clean
tree (2026-08-08):

- **Phase 1 reproduces B1's premise exactly.** With `probeNoDb` (a pure string function) added
  to `framework/db/src/no-db-probe.ts` and re-exported from the barrel, the unmodified
  governance lint exits **0** (`PASS … 18 rules … 221 production + 67 development … at warn`)
  while the non-fatal NOTE names the symbol. No delivering mechanism exists today — the
  critique's premise, proven again, not assumed.
- **Phase 2's failure is caused by the proposed rule and names the symbol.** With the unplaced
  map registered as an error rule (the §4.5 prototype), the lint exits **1** with
  `FAIL — 5 error(s) … 19 rules`; all five errors carry ruleId `db-symbols-all-placed`, one per
  map entry, each message the map's own `symbol — reason` text
  (`… probeNoDb — re-exported from ./no-db-probe.ts, a module governance/architecture.json does
  not name`), path = the db barrel. No other rule contributes to the failure. The four
  pre-existing symbols erroring alongside is itself the proof of §4.5's ordering constraint:
  the rule can only register in the commit that empties the list (task E).
- **Self-restoration confirmed.** After the probe: `git status --porcelain` empty, the probe
  module gone, and a fresh `npx tsx scripts/governance-lint.ts` back to
  `PASS — … 18 rules … NOTE 4 database symbol(s)` — identical to the pre-probe state.

**Rule properties verified against the real machinery, not the prose:**

- *Scope survives a clean tree.* `Rule.scope` is the population, not the violations, and
  `DeadRuleError` gates population only (`scripts/lib/governance-rules.ts:43-54`, throw at
  `:93-98`). The prototype's scope (census files under `framework/db/src/`, `minScope` 5) keeps
  the rule alive with zero findings. Post-move population is ~45 tracked files (60 today minus
  the relocations), not the "~20" §4.5 estimates — imprecise but not load-bearing; either way
  far above the floor.
- *Both rule lists exist as claimed.* `buildRules` (`scripts/governance-lint.ts:128`, shared
  with `--attacks` per the `@lore AU28` comment) and `runLive`'s `RULES` (`:235`) — and both
  receive `detected`, so the constructor-injection shape works in both.
- *The attack case is mandatory, not optional.* Property 4 — "A REGISTERED GOVERNANCE RULE WITH
  NO POSITIVE ATTACK CASE IS A BUILD ERROR" — and the control-twin property 2 are real
  (`scripts/lib/governance-attacks.ts:25-30`), so the §4.5 attack + control land in task E's
  commit or `npm run lint` fails. Property 3 (anchors must exist) makes the barrel-mutation +
  new-module-overlay shape feasible as specified.
- *The NOTE block is where §4.5 says* (`scripts/governance-lint.ts:282-284`, printed after
  findings; `hasErrors` at `:295` never sees it) — deleting it once the rule carries the same
  symbol+reason text is coherent, not a loss of signal.
- *All four detection legs exist* in `scripts/lib/db-surfaces.ts` `resolve()`: barrel re-export
  from an unmapped module (~`:167`, the scenario's literal case, consumer-free), zod/schema
  strays, import of a symbol absent from the barrel (~`:201`, the `seed` leg), deep import of
  an unmapped module (~`:212`).

**The residual gap is real and fairly bounded.** A no-database function smuggled into an
already-mapped `db:client` module (e.g. `connection.ts`) resolves through `moduleSurface` and
never enters the unplaced map — verified in `resolve()`. "Performs no database access" is
semantic; no static classifier decides it, so demanding that leg would demand invention. Every
historical instance of the disease this WP cures (`like-escape.ts`, `agent-scaffold.ts`,
`profiles.ts`, `system-prompt-templates.ts`) was a whole-module misplacement — exactly the leg
the rule now closes. §4.5 states the residual explicitly and claims nothing for it; it reaches
the founder via the §7 gate. Plan validation scenario 3 is delivered for every statically
decidable shape; this is a fair boundary, not an unmet AC.

**Ordering leaves the tree green at each step.** A clears the three template symbols (module
moves + every consumer repointed in the same task, including `agents.ts:32`); between A and E
the NOTE lists only `seed` — non-fatal, so interim commits pass. E fixes `migrate.test.ts`
(the mock invents `seed` — confirmed at `applications/desktop/__tests__/migrate.test.ts:34,63`),
emptying the list, and registers the rule + attack twin + NOTE deletion in that same commit —
same-commit promotion, mirroring the shrink-only baseline discipline. A → D → E → F with B, C
parallel is sound; E's dependency on both A and D is genuine.

One proxy note: the probe runs the governance pass, not the full `npm run lint`. Sound —
Biome/ESLint carry no rule that fires on an unused export and knip is not part of `lint`, so
the governance pass is the only component of `npm run lint` that could deliver or deny
scenario 3.

## Folded defects and notes — verified fixed in the text AND against source

- **D1 fixed.** `framework/db/src/__tests__/system-prompt-template-resolution.test.ts` imports
  `../system-prompt-templates.js` relatively (lines 9-14, re-read) and is now in §2.3's move
  list with the reason stated.
- **D2 fixed.** §2.3's interim-export block states `readSystemPromptTemplate` stays
  barrel-exported until task D deletes the last db-side caller. Matches the real consumers:
  `factory-bootstrap.ts:8` (import) / `:192` (call); `demo-fixture.ts:21` imports only the
  `ForRole` variant, so naming only `factory-bootstrap.ts:192` is correct.
- **D3 fixed.** §2.5.3 step 2 now mandates the null-skip as contract, matching the live guard
  (`factory-bootstrap.ts:192-195`, `content !== null`), with the honest caveat that the AC 7
  harness cannot catch its omission.
- **N1 folded — literal set re-derived independently.** `governance/decided-rules.json`:
  exactly 6 rows name `db:util`/`db:bootstrap` (3 + 3, no others). Removing them:
  `totals.rows` 124 → 118; production allowed **68 → 65**, forbidden **56 → 53**; development
  allowed **114 → 110**, forbidden **10 → 8** (deleted rows split 3/3 production, 4/2
  development — matches §4.4 exactly); exactly one deleted row's worlds differ
  (`layer → db:bootstrap`, forbidden/allowed). Model-test literals confirmed at
  `governance-model.test.ts:167-179` plus the two `checked … toBe(124)` counters (248 → 236).
  The set §4.4 names is complete — with the one caveat in D-R2 below.
- **N2 folded.** `eslint.config.ts` names `framework/db/src/agent-scaffold.ts` at ~`:566`
  (comment) and ~`:611` (rule message) — task A updates both; §8's sweep now spans the repo
  root, not just `docs/`.
- **N3 folded.** `layers/agent-orchestration/package.json` has no `@hyperidle/agent-run-config`
  dependency today (verified); §2.5.3 names the task-D addition.
- **N4/N5 folded.** §6 now requires the PR evidence to state Electron was not launched for the
  diff, and discloses that the branch-run capture script differs from the control-run script at
  the marked switch, directing reviewers to diff that edit.

## Previously-held findings — spot-checked, all hold

- `probes/run-config-equivalence.ts` re-executed: `VERDICT: PASS — row sets identical`.
- `probes/first-boot-capture.ts --bootstrap` re-executed fresh: dump diffed **empty** against
  the committed `first-boot-control.json`; tree clean after.
- `git diff 6a56a570 52080e21` over `architecture.md` removes exactly the false material (the
  two "existing unplaced-symbol error path" claims, the blanket "no new mechanism" line, E as a
  parallel leaf) and otherwise only adds: §4.5, the interim-export block, the third test-file
  move, the null-skip guard, the dep fact, the expanded literal set, the evidence-wording
  notes. §2.5's one-source-of-truth shape, §2.7's `toolsForRole` census, the knip analysis, the
  §4.1 legality table, §4.2's site-exact baseline arithmetic, and the AC 7 harness are intact.
  §9 now honestly declares the one new mechanism and its authorization (plan scenario 3).

## BLOCKING

None.

## NON-BLOCKING DEFECTS

**D-R2 — `totals.differ` in `decided-rules.json` is already inconsistent with its own rows;
§4.4's "44 → 43" perpetuates the stale literal.** Re-deriving `production !== development` over
the 124 rows gives **46**, not the recorded 44 — the two Ruling-13 development flips
(`layer`/`service → db:table (other) [table:write]`, forbidden → allowed; see the test comment
at `governance-model.test.ts:176-178`) updated the four split literals but nobody updated
`totals.differ`. After this WP's six deletions the true row-derived count is **45**. No test or
script asserts `totals.differ` (only `totals.rows` is asserted), so writing 43 cannot fail the
build — but it leaves a founder-instrument file internally inconsistent by 2, now with the
architecture's explicit endorsement. Pre-existing condition, not change-caused breakage, hence
non-blocking; it should be surfaced at the §7 human gate (the file is a founder instrument —
correcting 44/46 → 45 vs. carrying the delta is the founder's call, not the builder's).
Evidence: independent row scan this round; `governance/decided-rules.json:17`.

## FOLLOW-UP / NOTES

- §4.5's "~20 post-move" population estimate for the rule's scope is low (≈45 tracked files
  remain under `framework/db/src` after the relocations, counting retained tests). Irrelevant
  to correctness — `minScope` 5 is cleared either way — but the builder should not "fix" the
  scope to hit 20.
- §7 gate item 4 describes the new rule but does not name the §4.5 residual (mapped-module
  smuggling) in the gate list itself; the gate reads the architecture, and §4.5 states it, so
  this is presentation, not substance.
- Feasibility §1's census header ("3291 tracked files") predates the branch's own `.pipeline`
  commits; the restored-tree run now reports 3297. Violation counts (221 + 67) and the §4.2
  site arithmetic are unchanged — cosmetic drift only.

## Verdict

**PASS.** B1 is genuinely closed: the gap was reproduced on the unmodified tree, the
delivering mechanism was proven by execution with the symbol named, the probe restores the tree
completely, the rule's shape (both lists, mandatory attack + control, population-based scope,
same-commit promotion in task E) checks out against the real lint machinery, and the one
residual is semantic, honestly stated, and fairly bounded. D1–D3 and N1–N5 are fixed in
substance, not just claimed. Nothing that held in round 1 was disturbed. One non-blocking
defect (D-R2) and three notes for the builder and the human gate.
