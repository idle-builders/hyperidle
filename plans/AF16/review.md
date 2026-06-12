# AF16 — Phase 4 Code Review (Reviewer)

**Branch:** `feat/AF16-display-correctness-hygiene` vs `origin/main`
**Verify:** GREEN on branch (2705 tests). This review is correctness-against-spec, not a re-run.

## Verdict: NOT DONE

Two CRITICAL findings block ship:

1. **Sub-batch (ii) Tasks 5 and 6 are entirely unbuilt.** No no-op-button lint/AST rule, no button-wiring/removal sweep (Z8-066-070, Z8-113-120), no a11y consistency fixes (Z8-147-165), and **none of the named candidate files changed** (KnowledgeDetail, AgentAddDialog, WorkRoutine, WorkPortfolio show zero diff). AC-2's "no button is a no-op" half has no implementation and no proof. Only Task 4 (breadcrumb) of sub-batch (ii) landed.
2. **14 dead, partially-diverged duplicate renderer files** left at `packages/web/src/kinds/`. Plan Task 9 said *relocate* (move); only `renderer-registry.ts` moved (git `R071`). The 7 renderers + 7 stories were **copied** and the originals never deleted. Three of seven already diverged from their design-system twins, including a reintroduced off-grid spacing violation and a stale image-fallback bug.

The other five sub-batches (i, iii, iv, v, vi) are correct, faithful to the plan, and well-tested.

---

## AC completeness audit

| AC | Requirement | Code / test satisfying it | Status |
|----|-------------|---------------------------|--------|
| AC-1 | No "NaN%", misleading bar, or raw placeholder; clean empty-state on empty data | `WorkBet.tsx:1224-1248` branches on `total>0`; `WorkBet.progress.test.tsx` (zero/null/50%/0-of-5) asserts no NaN, "No tasks yet", bar absent via `queryByTestId('bet-progress-bar')` | PASS |
| AC-2 | Every visible control acts; no no-op button; no breadcrumb to dead route | Breadcrumb half: `to="/work"` -> `/work/portfolio` in `WorkBet.tsx:1047` + `WorkTask.tsx:242` (FIXED). **No-op-button half: NOT BUILT** (Task 5 absent) | FAIL |
| AC-3 | Deterministic, relevance-aware search; non-arbitrary candidate set | `search.ts`: `id` ASC tiebreaker on all 3 queries + ordered over-fetch; `matchRankExpr` CASE (T8). `search.af16.integration.test.ts` asserts stable order across two runs + exact-match-ranks-first | PASS |
| AC-4 | Artifacts render per kind, else honest "no preview available" | `ArtifactPreviewSurface.tsx` dispatches `getRenderer(kind)` for `full`, error boundary + null/malformed -> "No preview available"; image `alt` preserved. `ArtifactPreviewSurface.af16.test.tsx` (image/null/throw/malformed/gallery) | PASS |
| AC-5 | Routine/agent reflects without manual reload | `useTeam.ts` adds `refetch()` (fetchCount); `WorkTeam.tsx:485` `onCreated` calls `refetchTeam?.()` | PASS |
| AC-6 | No banned terms (Rail/CoC); no false claims (BullMQ/Redis, file_leases) | Docs reframed; `file_leases` struck (`components.md:95-96`); BullMQ/Redis -> future/cloud-profile markers; `CLAUDE.md` stack corrected; pipeline row fixed. `feature-taxonomy.md` "CoC" now `@lore`-annotated (legit mention of the purge, rule-excluded) | PASS |

AC-2 FAILS: the breadcrumb defect is fixed but the AC text "no button is a no-op" has zero implementation and zero proof (see C1).

## Z8 traceability spot-check

| Z8 | Claim | Verified in diff |
|----|-------|------------------|
| Z8-019/020 | NaN% bet card + full-bar lie | FIXED — truthiness guard replaced with `total>0` branch; test asserts no NaN, no bar |
| Z8-026/027/028 | image-as-text "400x300" | FIXED — `full` dispatches `ImageRenderer` -> `<img>`; "400 x 300" demoted to caption |
| Z8-046 | `to="/work"` 404 breadcrumb | FIXED — both call sites retargeted to `/work/portfolio` |
| Z8-033 | search order nondeterministic | FIXED — `id` ASC tiebreaker + match-rank; integration test proves stable order |
| Z8-091 (BullMQ) | false present-tense claim | FIXED — `CLAUDE.md`, `technology-summary.md`, `components.md`, `deployment-architecture.md` reframed/removed |
| Z8-097 | unbounded retention tables | FIXED — `retention-reaper.ts` + bootstrap wire + integration test |
| Z8-100 | observability silently off | FIXED — `buildObservabilityConfig` defaults `enabled` true (`!== "false"`) |
| Z8-128-131 | post-mutation routine stale | FIXED — `useTeam.refetch` + `onCreated` wiring |
| **Z8-066-070, Z8-113-120** | **dead/no-op buttons** | **NOT FIXED — Task 5 unbuilt** |
| **Z8-147-165** | **a11y/UX consistency nits** | **NOT FIXED — Task 6 unbuilt** |

Banned-term purge is docs-only: diff touched **zero** `Coc*`/`Assistant*` component files (`git diff --name-only | grep -iE 'coc|assistant'` empty). No AF14 collision. Doc claims now match code.

---

## Findings

### CRITICAL

**C1 — Sub-batch (ii) Tasks 5 and 6 not implemented; AC-2 button half and AC-6-adjacent a11y nits have no code or proof.**
The plan's Task 5 (the WARNING-1-tightened no-op-button ESLint/AST rule + the button wiring/removal sweep) and Task 6 (a11y/label/aria nits) are absent:
- No button rule exists on the branch (`grep` over `packages/eslint-plugin-design/src/rules` finds only `require-focus-on-interactive`, a different a11y check; no no-op/dangling-submit rule anywhere). Not in the AF16 diff either.
- None of the named candidate files changed: `KnowledgeDetail.tsx`, `AgentAddDialog.tsx`, `WorkRoutine.tsx`, `WorkPortfolio.tsx` have **zero diff**. `WorkTeam.tsx`'s only change is the routine refetch (Task 3), not any of the L314/631/680/741 buttons Task 5 enumerated.
- No `*.test.tsx` exercising buttons-have-handlers landed.

AC-2 reads: "Every visible interactive control performs an action or is removed; no button is a no-op." The breadcrumb defect (Z8-046) is fixed, but the no-op-button requirement — the bulk of sub-batch (ii) and a named AC clause — is entirely unaddressed. Verify being green does not cover this: there is no test asserting it, so green proves nothing here.

**Fix:** Implement Task 5 (the AST/ESLint no-op-button rule per the plan's case (a)/(b)/(c) classification, plus wire-or-remove each flagged button) and Task 6 (the a11y nits), with the tests the plan specifies. If the team elects to descope Tasks 5/6 to a follow-up WP, that is a plan/spec decision the orchestrator must record explicitly — it cannot be silently shipped as "AC-2 done."

**C2 — Dead, diverged duplicate renderer source at `packages/web/src/kinds/` (Task 9 incomplete). Fix NOW.**
Plan Task 9 ("Relocate") required a *move*. Only `renderer-registry.ts` moved (git rename `R071`). The 7 renderers + 7 stories were copied to `packages/design-system/src/kinds/` and the originals left tracked at the old path:

```
packages/web/src/kinds/{code,data,fallback,html,image,text,url}-renderer.tsx        (7)
packages/web/src/kinds/{code,data,fallback,html,image,text,url}-renderer.stories.tsx (7)
```

No importer except their own co-located stories. The AE6 web test and `ArtifactView.tsx` now both import from `@hyperidle/design-system`. The web `DesignSystem.tsx` story glob is `../components/*.stories.tsx` + `../shell/*.stories.tsx` — it does **not** glob `../kinds/`, so these stories are not even surfaced at `/designsystem`. Knip stays silent only because `src/**/*.stories.tsx` is a knip *entry point*, so the stale stories self-justify their stale renderers.

Already diverging — the design-system copies got the AF16 fixes, the old copies did not:
- `code-renderer.tsx:51` — old `py-[2px]` (off-grid, AQ-001 violation) vs new `py-[3px]`.
- `fallback-renderer.tsx:40` — old `pt-[1px]` vs new `pt-[3px]`.
- `image-renderer.tsx:13` — old `if (!preview)` vs new `if (!preview || !preview.url)` (the WARNING-4 malformed-preview guard). The old copy still renders `<img src="">` on a malformed preview — the exact Z8-026 bug class AF16 set out to kill, preserved in a shadow file.

**Verdict on the duplicate-renderer question: REAL finding, fix NOW, do not defer.** It is dead source by every measure (no non-story importer, not surfaced in the DS view); already diverged (off-grid violation + stale image-fallback bug reintroduced); the next agent grepping `kinds/` finds two truths and may edit the wrong one; and "move, not copy" was the explicit Task-9 contract. Deferring institutionalizes the second-render-path drift Treatment B exists to eliminate.

**Fix:** `git rm` all 14 files under `packages/web/src/kinds/`; remove the empty dir. Re-run `npm run check` + `npm run lint` + `npm run knip` (expected green — only the deleted stories referenced them).

### NIT

**N1 — `search.ts` match-rank ranks only `bets.description`, while WHERE matches `description OR hypothesis OR doneCondition`.** A bet matching solely on `hypothesis`/`doneCondition` lands in `ELSE 2` and orders by recency only. Consistent with the plan's deliberately minimal T8 approach and fully deterministic — not a defect; noted for future relevance work (plan R3 flags FTS out of scope).

**N2 — `ArtifactPreviewSurface.tsx:85` `preview as any`.** Justified by the registry's open `RendererProps.preview: any` contract; biome-ignored with reason. Acceptable.

---

## Lens notes (passing surfaces)

- **Architecture:** Retention reaper mirrors `workspace-reaper.ts` exactly (`reapXOnce` + `startX` disposer, injectable clock, Drizzle-only deletes); wired in `bootstrap.ts:152` with `@lore`. Registry relocation respects no-upward-dependency. Money/labels untouched here use existing `formatMoney`/label maps (no reinvented helper). Marred only by C2.
- **Design:** Treatment A faithful — zero/null -> "No tasks yet" no bar; `done=0,total=5` keeps measured `0%`+bar; all four states tested. Treatment B: registry dispatch on `full`, summary on `gallery`, one honest fallback for null/throw/malformed via error boundary, image `alt` preserved. Hearth tokens only. (Live render path is correct; the stale shadow copies in C2 are the design risk.)
- **Security:** Retention deletes predicate-scoped; expiry-vs-age distinction correct; terminal-only predicates honored; `invite_codes` createdBy RESTRICT respected (leaf rows, JS-filtered null `claimedBy`); integration test proves non-terminal/unexpired rows survive. Search match-rank reuses escaped pattern (`escapeLikePattern` + `ESCAPE '\\'`) — no new injection. Observability default-on uses `console` adapter via structured logger; config carries no secrets — no leak.
- **Adversarial:** Empty/zero/null clean on every touched surface (no NaN%, no "--" leak). Search order proven stable across two identical queries. Post-mutation refetch fires (`refetchTeam?.()`, `undefined` in override/test mode to avoid spurious fetch). `bet.progress` made optional — only consumer uses `?.` + `?? 0`, safe.
- **Simplification:** No premature generics/wrappers. Only excess is C2.
- **Slop:** No `console.log`/TODO/commented-out blocks in added production source (one "for now" is a test comment). `@lore` annotations substantive.

---

## Re-review checklist for the builder

1. Implement Task 5 (no-op-button rule + wire/remove sweep) and Task 6 (a11y nits) with the plan's tests — OR get an explicit recorded descope decision. AC-2 cannot ship without this.
2. `git rm` the 14 files under `packages/web/src/kinds/`; remove the empty dir.
3. `npm run check && npm run lint && npm run knip` — confirm green.
4. `npm run test` — confirm no story-discovery test regressed.

Re-submit and I will re-review.

---

# AF16 — Phase 4 RE-REVIEW (Reviewer, round 2)

**Verdict: NOT DONE** — CRITICAL-2 resolved; CRITICAL-1 NOT resolved.

## CRITICAL-2 — RESOLVED ✅
`packages/web/src/kinds/` is gone (dir absent, all 14 files `git rm`'d in 59207d00). No live importer of the old path (only 4 explanatory comments noting the move). Live render path uses `@hyperidle/design-system` copies; `image-renderer.tsx:16` carries the WARNING-4 guard `if (!preview || !preview.url)`. Shadow-file drift eliminated. Confirmed.

## CRITICAL-1 — NOT RESOLVED ❌
The rule itself is **correct and strict** — built right:
- `packages/eslint-plugin-design/src/rules/no-op-button.ts` exists, registered in `index.ts`, wired in `eslint.config.ts` (K6 web-tsx block), tests cover all three cases incl. the real no-op (`type="button"` no handler → `noOp`; dangling submit → `danglingSubmit`). `--print-config` confirms it resolves for web pages. Flipped to `error` + supported `npm run lint:eslint`, it fires correctly.

**But the builder's "ZERO live violations" claim is FALSE.** Running the rule at `error` over the real tree surfaces **2 live production no-ops in `packages/web/src/pages/WorkTask.tsx`** (the other 13 hits are test-fixture `<button>`s in `__tests__/*`, true false positives):

- **WorkTask.tsx:271** — `<button type="button" aria-label="More actions">···</button>` — overflow-menu button, **no onClick**. (Sibling KnowledgeDetail overflow button got `onClick={onToggle}`; this one was missed.)
- **WorkTask.tsx:354** — `<button type="button" data-testid="task-dial-in-btn" aria-label="Dial in to active session">Dial in</button>` — **no onClick**. A visible, enabled, labeled "Dial in" control that does nothing.

`grep onClick packages/web/src/pages/WorkTask.tsx` returns **nothing** — the file has zero handlers; neither button is wired at any level. Both are exactly the AC-2 failure mode ("no button is a no-op; every visible interactive control performs an action or is removed"). They ship green only because the rule is wired `"warn"` and `npm run lint` runs `eslint . --quiet`, which suppresses warnings — so the rule never fails CI and these two slipped through. The rule did its job; the sweep did not act on the rule's own output.

**AC-2 still FAILS.** Breadcrumb half intact (`to="/work/portfolio"` at WorkTask:242/249, WorkBet:1047/1054). No-op half: 2 live defects.

## A11y / UX (Task 6) — landed, correct
Z8-147 (RedirectProductToTeam empty-id → portfolio), Z8-148 (NotFound go-back history fallback), Z8-150 (Sidebar search hint div→button + aria-label + focus-visible), Z8-156 (like-escape SQLite→Postgres comment), Z8-158 (SetupFlow Windows path split), GlobalSearchPanel cleanup. All sound. (Ironic: a11y polish landed while two genuine no-ops — the AC's core target — were left unwired.)

## Required to reach DONE
1. Wire or remove **WorkTask.tsx:271** (overflow "More actions") and **WorkTask.tsx:354** ("Dial in") — give each a real onClick or remove the control. These are the AC-2 no-ops; non-negotiable.
2. Add a `pages/__tests__/` exception (or biome/eslint-disable with reason) for the test-fixture `<button>`s so the rule can be raised to a level that surfaces real findings — OR raise `no-op-button` to a level whose findings aren't swallowed by `--quiet` for production source. With the rule at `warn`+`--quiet`, AC-2 has no enforcement teeth: a future no-op ships silently. At minimum, prove the 2 WorkTask buttons are gone by running the rule at error over `pages/**`+`components/**` (excluding `__tests__`) and showing zero.
3. Re-submit; I will re-verify the WorkTask buttons and the enforcement level.

## AC table (round 2)
| AC | Status | Note |
|----|--------|------|
| AC-1 | PASS | no regression |
| AC-2 | **FAIL** | no-op half: 2 live no-ops in WorkTask.tsx (271, 354). Breadcrumb half PASS. |
| AC-3 | PASS | no regression |
| AC-4 | PASS | design-system render path; WARNING-4 guard live |
| AC-5 | PASS | no regression |
| AC-6 | PASS | no regression |

Re-submit and I will re-review.

---

# AF16 — Phase 4 FINAL RE-REVIEW (Reviewer, round 3)

**Verdict: DONE** — CRITICAL-1 resolved. All 6 ACs PASS.

## CRITICAL-1 — RESOLVED
Both live no-op buttons in `WorkTask.tsx` are removed cleanly:
- ~L271 "More actions" overflow button — removed; replaced with an explanatory `// AC-2` comment. No dangling render.
- ~L354 "Dial in" (`data-testid="task-dial-in-btn"`) — removed; explanatory comment. The `activeSession` var that fed it removed; plural `activeSessions` (used in the session-count cell, L349) retained.
- No dangling refs: `grep task-dial-in-btn / "Dial in to active session"` over `packages/web` is empty. The remaining `activeSession` / "Dial in" / "More actions" grep hits are unrelated and all wired — Conversations.tsx ("Dial in" with real `onClick={() => setDialInSessionId(...)}`), WorkBet.tsx:1078 ("More actions" with `onClick` toggling the overflow dropdown), AgentProfile (`activeSession` data field). `SessionActivityPanel.test.tsx` hit is a doc comment.
- WorkTask tests green (`W3-work-task.test.tsx`, `WorkTask.outcome.test.tsx` — 9 passed); no test asserted the removed buttons. WorkBet progress tests green (10).

**Rule is enforcing, not suppressed.** `eslint.config.ts` adds a dedicated K6-AC2 block promoting `design/no-op-button` to `"error"` for `packages/web/src/pages/**/*.tsx` + `components/**/*.tsx`, with `ignores` for `__tests__`, `*.stories.tsx`, `*.test.tsx`. Errors are not swallowed by `--quiet`.
- Positive proof: config-driven eslint over `pages/` + `components/` → QUIET EXIT 0, zero `no-op-button` errors.
- Negative proof: a fresh handler-less `<button type="button">` dropped into `pages/` fires `design/no-op-button` at error (`<button> has no action…`). The gate has teeth — a future no-op fails lint.
- Config diff adds only the two `no-op-button` lines (warn in K6, error in K6-AC2); no other rule loosened.

## Regression pass (latest diff only)
- Button/var removal: no broken render, no dangling ref, no test regression (confirmed above).
- eslint config change: scoped block, only `no-op-button` promoted; other rules untouched.
- No AC 1–6 regressed.

## Final AC table (round 3)
| AC | Status | Note |
|----|--------|------|
| AC-1 | PASS | NaN%/full-bar lie fixed; clean empty-state; tests assert no NaN/no bar |
| AC-2 | **PASS** | Breadcrumb → `/work/portfolio`; both WorkTask no-ops removed cleanly; `no-op-button` rule enforced at error for pages/components (proven both directions) |
| AC-3 | PASS | deterministic search; id-ASC tiebreaker + match-rank; stable across runs |
| AC-4 | PASS | per-kind render via design-system; WARNING-4 malformed-preview guard live; honest fallback |
| AC-5 | PASS | post-mutation refetch wired (`useTeam.refetch` + `onCreated`) |
| AC-6 | PASS | banned-term purge; false-claim removal; docs match code |

AC-2 is enforced and clean: zero live no-op buttons in pages/components, and the `design/no-op-button` rule fails the gate at error on any future no-op.

Verify GREEN on branch (2727 tests). Ship.
