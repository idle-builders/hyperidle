# AH5 Retro — Live agent-path smoke lane

**Workpackage:** AH5 (Track AH). **Branch:** `feat/AH5-live-smoke-lane`. **Phases:** Architecture (no concept/design for test infra) → Critique → Builder TDD → Code Review → Re-review (post-fixes). **Final verdict:** DONE.

---

## Cost Signals (Observable Facts)

**Timeline & Sessions:**
- Phase 1 (Architecture plan): 1 designer session (~6 KB plan.md, 3 sections per fig. 0)
- Phase 2 (Architecture critique): 1 reviewer session (8/10 score, 1 WARNING, 6 SUGGESTIONs)
- Phase 2 (Architecture plan revision): 1 designer session (tighten per WARNING)
- Phase 3 (TDD + green phase):
  - Red tests committed (`6681fd4f`): all 5 ACs → unit + integration + e2e probes
  - **Builder timeout mid-green-phase:** session expired while implementing probe. Uncommitted code left in working tree.
  - Second builder spawned to assess state, verify, commit (`99904168`)
- Phase 4 (Code review): 1 reviewer session (NOT DONE, 2 CRITICAL + 6 WARNINGS/NITS)
- Phase 4 (Builder fix + second review): 1 builder session + 1 re-review (DONE)
- Final (Documentation + attestation): 1 session

**Commits & Lines:**
- 9 commits (feature branch from `d6b5d83c` WIP → `62777aa7` re-review docs)
- Plan: ~345 lines architecture.md + ~66 lines critique.md + ~133 lines code-review.md
- Code: ~1680 lines (feat `99904168`) + ~120 lines (fix `1015b20e`)
- Test: red tests (`6681fd4f`) + integration test for gating

**The Timeout Event (Notable Cost Signal):**
- First builder session timed out mid-green-phase, likely during step 7 (probe implementation) or step 8 (lane infra).
- Red tests were committed (`6681fd4f`), but probe implementation was left uncommitted in the working tree.
- A second builder was spawned to assess the state, run verification, and commit the implementation (`99904168`).
- This "mid-green-phase timeout + re-spawn" is the recurring "L/M full-stack green-phase timeout" pattern already observed in U1, S1, and others.
- Both builders produced working code; no loss of logic, but the session boundary required an interrupt/assess/resume cycle.

**The Fix Cycle:**
- Phase 4 review found 2 CRITICALs (C1: no-mock guard doesn't compile due to JSDoc `*/` inside glob; C3: probe doesn't assert tool-call fired — AC3 gated only by `test.fixme()`)
- Phase 4 also found 6 WARNINGs (W1–W6) and 5 NITs (N1–N5)
- Builder fix commit `1015b20e` addressed all findings:
  - C1: Rewrote JSDoc as `//` lines to avoid premature block-comment closure
  - C3: Probe now asserts `write_session_notes` tool-call with `notes === "AH5-SMOKE-OK"`, fails closed
  - W1: Gating test strengthened to prove combined predicate (outcome + cost + tool_call)
  - W2: Unified cost-report directory (`packages/web/playwright-report-ah5/`)
  - W3: Added missing exports (`credential-encryption`, `server-config`) to server package.json
  - W4: Documented the tier-path seam, not per-agent seam (AH3-scope)
  - All NITs (N1–N5) folded in (dead export, `Number.isNaN`, pre-filter extraction, env var docs, error-swallow docs)
- Re-review (`62777aa7`) confirmed all ACs MET, zero CRITICAL

---

## What Worked

1. **Two-review model (critique + code review) as gating + signal**
   - Phase 2 architecture critique (8/10, 1 WARNING) caught the `provisionSession` seam ambiguity early, forcing explicit pinning. The plan's §Sequencing and §4 "genuinely gates" sections were rewritten to be precise, not vague — reviewer required the exact entrypoint name.
   - Phase 4 code review found CRITICAL issues (compile error in guard, missing assertion in probe) that would have passed in any cursory check. The *adversarial* re-review (reviewer actually injecting `page.route("**/sessions/provision")` into the spec to test the guard) proved the guard works — this caught a real coverage gap.
   - Each lens (design/arch/code) found different gaps: neither alone would have been sufficient.

2. **Specification of the AH3-dependency split (the hardest part)**
   - The plan's decision to gate AH5 on a deterministic `provisionSession`-driven probe (independent of the UI trigger) was initially ambiguous ("the same entrypoint the probe uses"). Critique forced precision: name it (`provisionSession`/`runSession`), not a hand-built adapter.
   - Once pinned, the split became clear and defensible: AH5 ships the harness + model-selection + CI infra, gates AH5's own DoD on the real model-call span (the production seam that AH3's eventual trigger will also call), and `test.fixme()`-gates the UI-trigger assertion only if AH3 isn't merged yet.
   - This prevented the trap of "AH5 gated on AH3" (blocking) or "AH5 ships with mocked LLM" (useless).

3. **Static guard as mechanical enforcement, not hope**
   - The `ah5-no-mock-guard.ts` script (despite the compile bug) is the right mechanism: a script run in CI and locally, not a manual checklist or "avoid mocks" code review comment.
   - Phase 4 review showed that the guard actually caught violations (injected `page.route` → guard exited non-zero).
   - The bug (JSDoc `*/` closing the block) was fixable and doesn't change the architecture — it just means the guard wasn't running at all. Once fixed, it became the mechanical guarantee the spec needed.

4. **Fixture-driven unit testing (no live key, real shapes)**
   - Selection tests use a **captured real OpenRouter response** (not hand-authored JSON), so field shapes (`pricing.*` per-token USD, `created` unix-seconds, `throughput_last_30m`/`latency_last_30m` `{p50,...}`) are the ones OpenRouter actually returns.
   - Tests break loudly if OpenRouter changes the API shape, making the gate brittle-and-visible rather than silently wrong.
   - The fallthrough test (remove top model from fixture → assert `ranked[0]` becomes prior `ranked[1]`) is a pure, unit-testable property — no live key needed, no flakiness.

5. **Fail-closed budget cap**
   - The probe reads `result.totalCostCents` (already aggregated from `provisionSession`), doesn't re-derive cost from events.
   - The in-test assertion (`expect(totalCostCents).toBeLessThanOrEqual(cap)`) is paired with a redundant CI step (`ah5-assert-budget.ts`) that runs `if: always()`, so budget overflow fails CI even if the test harness mis-handles it.
   - **Crucially:** the CI budget-assert step exits non-zero if the cost file is missing or unparseable, not just on overflow. A crashed lane that skips cost-writing will not silently pass.

---

## What Surprised / Process Gaps

1. **A guard file that doesn't compile passing `check` + `lint`** (gap: guards never validated unless they run)
   - `ah5-no-mock-guard.ts` had a JSDoc block-comment closed early by `*/` inside `**/threads/**/messages` glob.
   - `tsx` (used to run the script) exited **before reading any spec file**, with a TransformError.
   - But `npm run check` (tsc typecheck) and `npm run lint` (biome) did NOT catch it:
     - tsc: file is not in a TS project tsconfig (it's a standalone CI script)
     - biome: tolerates the comment structure (not a parse error in biome's parser)
   - **The surprise:** a guard that never runs is indistinguishable from a guard that passes. The guard was wired into the CI workflow (`ah5-smoke.yml`) but never executed until Phase 4 review tried to actually run it.
   - **The gap:** guards (scripts, lint rules, static assertions) need a validation step in the build/verify pipeline. A lint rule that never runs is useless. A script with a parse error should fail CI, not silently succeed.
   - **Lesson for `/compound`:** static guards need to be proven to work, not assumed.

2. **A `test.fixme()` gate silently hiding a CRITICAL AC gap**
   - AC3 requires "≥1 real tool-using action; tool effect observable." The probe logged the `write_session_notes` tool-call event but never asserted it.
   - The only place that checked the tool was the UI overlay test, which was `test.fixme()`-gated behind AH3.
   - **The surprise:** the probe passed on `outcome==="completed" && cost > 0`, while the model silently emitted prose and never called the tool.
   - **Why it happened:** the Phase 2 plan (§7 step 6, §4) committed to "the probe asserts the `tool_call` event," but the Phase 3 green code had a comment saying "We don't fail on tool-call absence — the prescriptive prompt may produce prose without a tool call on some models."
   - This is "green while dead" (the exact failure mode the AH track exists to prevent) — the lane passes while the real model-call path doesn't exercise a tool.
   - **The gap:** `test.fixme()` gates should have an explicit assertion that the gated AC is actually asserted *somewhere*, not deferred without a replacement. A fixme that skips the last 10% of an AC is not a partial skip — it's a full AC gap.

3. **The builder green-phase timeout pattern recurring** (3rd time: U1, S1, AH5)
   - AH5's first builder session timed out mid-implementation (likely 60–120 minutes into the green phase).
   - Red tests were committed, but the probe implementation was left uncommitted.
   - A second builder had to be spawned to finish and verify.
   - **Known pattern:** large full-stack workpackages (L/M scope, spanning server + web + e2e + CI) hit session timeouts in the green phase. The red phase (test-writing) usually finishes in one session; the green phase (implementation + verification) exceeds token budget or wall-clock time.
   - **Why it matters:** builders can't resume a timed-out session. They must assess the working tree, run `npm run verify`, and either commit what's there (if green) or revert and start over. This is an "interrupt + assess + resume" cost, not lost work.

---

## Recurring-Pattern Candidates for `/compound`

1. **CC-007 (already tracked): Scope-not-enumerated, symbol-deletion consumers**
   - AH5 Phase 2 critique caught undefined eval-lane consumers of `EnvCredentialResolver` because the plan enumerated call sites.
   - This matches AH1 Phase 2 observation: "enumerate ALL consumers upfront — do not assume 'probably just server'."
   - The pattern: when a symbol is deleted (exported or scoped down), enumerate all consumers via grep BEFORE committing the plan. This prevents `npm run check fails on packages/eval` at green phase.

2. **CC-002 (guard validation): Static guards need proof-of-execution**
   - A lint rule, ESLint rule, or standalone guard script that never runs is indistinguishable from a passing guard.
   - AH5's `ah5-no-mock-guard.ts` had a parse error and never ran, but CI didn't catch it.
   - Lesson: guards must be tested (run the script in verify, add a lint/ESLint rule to the linter, wire the script into CI and assert exit-code 0 on clean runs + non-zero on injected violation).
   - This affects multiple workpackages: E2E guard scripts, mock-policy guards, type-safety guards.

3. **CC-008 (test.fixme gates): Deferred ACs need visible placeholders**
   - `test.fixme()` gates should have an explicit *replacement* assertion, not just "we'll fix this in AH3."
   - AH5's AC3 (tool-call observation) was gated entirely in `test.fixme()`, with no always-run probe assertion backing it.
   - Pattern: mark a fixme gate as INCOMPLETE until there's at least a log-and-fail assertion on the gated surface. Example: the probe should log a WARN if the tool-call is absent, even if it doesn't fail, so a human reading the log knows something is wrong.
   - This affects AH track: AH1, AH2, AH3, AH5 all have interdependencies. If AH5's proof is silent-incomplete, AH3 can ship without actually triggering the probe.

4. **CC-013 (builder timeout + multi-session): L/M green-phase workpackages need session strategy**
   - Third occurrence: U1, S1, AH5 all timed out mid-green-phase, requiring a second builder.
   - Pattern: Large full-stack workpackages should have a pre-defined checkpoint (e.g., "after red phase, commit and review" or "after server wiring, before e2e, commit a checkpoint").
   - Recommendation: `/pipeline` skill should recognize M-complexity workpackages and suggest intermediate commit points to avoid re-assessing a half-finished state.

---

## Top Observations for `.pipeline/retro-log.jsonl`

Three entries appended (ordered: timeline, severity):

1. **Builder timeout mid-green-phase, second builder spawned** (cost signal, friction, pattern match)
2. **Guard file with parse error passed check/lint, never validated** (gap, process discipline)
3. **tool_call assertion deferred entirely to test.fixme(), creating green-while-dead hole** (critical gap, AC3, AH track hard rule)

