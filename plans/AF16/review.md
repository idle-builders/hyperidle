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
