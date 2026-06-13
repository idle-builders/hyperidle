# AG5 — Retro (Phase 5)

Fresh-context observation after Phase 1–4 complete. All acceptance criteria met. Two cycles: Phase 2 design critique (1 revision round), Phase 4 code review (1 round, discovered e2e+focus+regex findings, fixed in round 2).

## Pipeline shape

**Phase timeline & critique rounds:**
1. Phase 1 (Concept check) — 1 commit, no new primitive, concept skipped.
2. Phase 2a (Design + critique) — design brief + approved-draft (2 commits), critique findings (1 commit). Menu wrapper-shares vs duplicates flagged as WARNING D8, width-via-className flagged as WARNING D4. Both resolved in round-1 revision.
3. Phase 2b (Design revision + re-critique) — revised brief/approved-draft (2 commits), re-critique round 2 confirming RESOLVED (1 commit). D8 (Menu thin-wrapper commits to sharing through Menu) and D4 (width mechanism clarified) moved to PASS. Final design score 9.2/10.
4. Phase 3a (Architecture) — architecture.md (1 commit). Carries forward D4/D8 resolution + adds C1–C5 cross-cutting findings.
5. Phase 3b (Architecture critique + revision) — critique.md (1 commit), re-critique round 2 with Tailwind regression analysis (1 commit). Flagged C1 (RESOLVED: BlockActionsPopover renders through Menu), C3 (width-primary-wrong-but-fallback-correct, downgraded WARNING→NOTE), C4 (selector ambiguity RESOLVED: MenuItem.dataAttrs Record passthrough), C2/C5 folded into docs. Final arch score 8.5/10 → 9.2/10 round 2.
6. Phase 3c (Red phase) — write-tests task (1 failing-test commit: `2de613d3`, title "test(AG5): red phase…").
7. Phase 3d (Green phase) — 6 feature commits (Select extension, Menu primitive, migration sites, ESLint rule, overflow-menu migrations), 4 chore/setup commits (mock-data, inventory, test-data updates).
8. Phase 4a (Code review round 1) — review.md found CRITICAL-A (e2e spec broken, 8/8 fail, 0 screenshots, never ran green), WARNING-A (Menu no focus-on-open), WARNING-B (Select width regex false-positives on max-w-/min-w-). Verdict: NOT DONE.
9. Phase 4b (Fixes + re-review round 2) — 5 fix commits (e2e routes + screenshots, Menu focus logic, Select regex, DESIGN.md wording, visual evidence), re-review confirms all 3 issues FIXED. All ACs re-run PASS. Verdict: DONE.

**Commit distribution:** 25 total — 1 concept, 5 design, 3 revision/re-critique, 2 architecture, 2 arch-critique, 1 red, 10 green+chore, 1 review, 5 fix. Code concentration: red(1) + green(10) = 11/25 = 44% implementation, 56% planning/critique/fixes.

## Cost signals (token / effort)

From stated token counts in feedback logs + git commits:
- Designer tokens (Phases 1–2b): ~81k (concept skip is fast; design 2-variant decision; 1 critique round × 2 rounds = revision cycle).
- Design-critique tokens (Phase 2): ~74k (lengthy cross-cutting finding on Menu wrapper-shares; Tailwind last-wins assumption caught early).
- Revision tokens (Phase 2b): ~75k (revised brief/approved-draft + re-critique with empirical Tailwind test).
- Architecture tokens (Phase 3a–3b): ~71k (base) + re-critique (empirical Tailwind test on live build tools).
- Red-phase tokens (Phase 3c): ~84k (279-line test file, 8 AC assertions).
- Green-phase tokens (Phase 3d): ~124k (6 feature files: Select extend, Menu new + stories + HTML + tests, BlockActionsPopover refactor, ESLint rule, 8 migration call sites, 2 aggregate test files). High because consolidation requires auditing + testing at scale.
- Code-review tokens (Phase 4a): ~111k (lengthy visual AC assessment, e2e test failure diagnosis, playwright route mapping).
- Fix tokens (Phase 4b): ~34k (surgical: route corrections, focus management 20-line effect, regex tightening, doc wording, screenshot integration).
- Re-review tokens (Phase 4c): ~92k (subagent: empirical verification — ran e2e green, reviewed 6 screenshots pixel-by-pixel, verified Menu focus restoration, regex non-triggering on edge cases).

Total estimated: ~666k tokens across 4 people-phases (designer, critic, architect, reviewer, builder distributed across 2 main agent roles).

## What worked

1. **Reviewer empirically disproving Tailwind assumption BEFORE builder hit it.** Architecture critique round 2 explicitly tested the "last-class-wins" theory against Tailwind 3.4.19 and found it false (stylesheet order, not attribute order). This prevented the builder from shipping a regression (currency control rendering full-width instead of 88px). The plan named the fallback (`strip w-full, apply conditionally`), and visual gate caught it.

2. **Red/green phase separation.** 279-line test file written before any code, covering all 6 ACs + 3 validation scenarios. All tests ran green on first implementation attempt, forcing the builder to think through edge cases (disabled skip, focus restore, width passthrough) before wiring code. Prevented rework.

3. **Reuse-first design audit catching unused primitive.** Phase-0 inventory (mandatory) exhaustively listed all hand-rolled selects + menu patterns *before* the design decision. This avoided the "we could add a new dropdown" trap and committed the design to consolidation-only from the start.

4. **Critique → fix → re-critique loop catching cross-cutting decisions.** Menu wrapper-vs-duplicate decision flagged as WARNING D8 in Phase 2 critique, resolved via revision (BlockActionsPopover now renders through Menu, not independently), then re-verified in Phase 2 round 2. Same for width mechanism (C3). Design critique's two-round model ensured the decision was ironclad before architecture wrote it.

5. **E2E spec failure caught by code review, not skipped as "out of scope."** Phase 4 review found the e2e spec (8/8 failing, 0 screenshots, never green) and refused to close the visual AC (#6) without rendered-app proof. Builder then fixed routes, added 6 screenshots, ran spec green, and reviewed side-by-side for chrome consistency. This was non-negotiable — no "verify passes without e2e" hand-wave.

## What leaked

1. **Green phase shipped a broken e2e spec (8/8 failing, wrong routes, zero screenshots) and claimed CI green because verify excludes test:e2e.** Spec was created with placeholder routes (/work/bets/ plural, wrong Settings nav) but never actually run. Builder's verify script (check+lint+knip+build only, no `test:e2e`) masked this entirely. Code review Phase 4 caught it at the gate and refused to proceed until routes were corrected and screenshots captured. Cost: 1 fix cycle + re-review (not a blocker by design, but a miss during green).

2. **Designer cited stale quality reference (03-hearth.html doesn't exist).** Design brief mentioned "parity to 03-hearth.html" which is a global reference snapshot, but AG5's actual parity anchor is the live `Select.html` + (new) `Menu.html`. Phase 2 critique caught this and downgraded it from blocker to NOTE — no impact on actual work since the real HTML refs existed. But it shows designer reached for a docstring rather than grepping the repo.

3. **Architecture plan's primary width mechanism was provably wrong (Tailwind last-class-wins assumption false) but named a correct fallback.** §1.1 claimed `${SELECT_CLASS_BASE} ${SELECT_SIZE[size]} ${className}` would work because "later utility wins." Architect flagged this as `⚠️ UNVERIFIED` and named the right fallback (`strip w-full, apply conditionally`). Phase 3b critique empirically tested it and downgraded from WARNING to NOTE. Builder followed the fallback and passed the visual gate. Shows the plan had the answer but phrased the primary wrong — critical because the fallback worked, but sloppy documentation.

## Process observations (3+ recurrence candidates for /compound)

1. **Two-review model catches different dimensions.** Design critique (Phase 2) found Menu wrapper-decision ambiguity. Code review (Phase 4) found e2e execution failure. Neither would have caught both. Confirms pattern across R5, T5, U6, X2: architect+reviewer separate, each catches what the other misses. Formalize into /review skill requirement.

2. **Critique-to-code drift on unresolved findings.** C1 (Menu single-owner) was flagged WARNING D8 in Phase 2, resolved in revision, re-verified in Phase 2 round 2. But builder carried forward the old approved-draft that said "leave BlockActionsPopover as-is." Only Phase 4 code review caught that the checked-in code *did* refactor (correctly), but the approved-draft doc had stale wording. Minor drift, self-correcting via code review, but recurs on U6, T5, U11 — critique findings not always flipped in the source docs post-revision.

3. **Visual/screenshot validation deferred or skipped.** e2e spec created with placeholder routes and never run. Builder assumed screenshots would "happen eventually" during verify. Phase 4 review had to explicitly demand routes be fixed + spec run green + screenshots captured. Pattern on T2, T1, U6 (ds:sync not run). Recommend: /verify or /ship skill adds E2E+screenshot checklist, blocks merge if visual-proof docs are empty.
