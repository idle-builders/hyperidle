# AI7 — Code Review (Phase 4)

**Verdict: DONE.** (Re-review of fix commit `4222264f` + attestation `66ffbff8`, 2026-06-15.)

The two Phase-4 blockers (F1 h1→h2 protected-test regression; F2 `work-team-page` testid relocation)
are resolved correctly, without touching protected assertions, without forcing tests green, and without
collateral. AC4 holds. The five other lenses remain clean. Original NOT-DONE record retained below.

## Re-review verification (fix commit 4222264f)

| Check | Result |
|---|---|
| All 5 originally-failing tests pass | YES — targeted run of `WorkProduct.test.tsx`, `WorkRoutine.AA1.test.tsx`, `WorkTeam.AG1.test.tsx`, `AI7-PageHeader.test.tsx`, `catalog-snapshot.test.tsx` → 5 files / 340 tests pass. |
| Protected `level: 1` assertions UNCHANGED | YES — `WorkRoutine.AA1.test.tsx:118` (`level: 1, "Daily digest"`) and `WorkProduct.test.tsx:121` (`level: 1, "HyperIdle Core"`) both retain original `level: 1`. Neither file touched by `4222264f` or `e9292001` (last edited by AG4). They pass because PageHeader now defaults `level=1` → `<h1>`. Not edited to force green. |
| Only the two protected assertions assert `level: 1` in web pkg | YES — `grep heading level: 1` returns exactly those two sites. |
| No double-h1 collision in migrated pages | YES — `grep '<h1'` across WorkTeam/WorkRoutine/AgentProfile = NONE. PageHeader is the sole h1 on every migrated page. |
| AgentProfile second-heading concern (designer amendment) | RESOLVED — AgentProfile renders **zero** literal heading elements and no `role="heading"`. The identity-block name was moved entirely INTO PageHeader title (lines 221/230: "Name/status live in PageHeader"). Not relegated to h2/h3 — removed as a heading. So the page carries exactly one h1 (PageHeader). The amendment's intent (no two competing h1s) is satisfied; no a11y regression. |
| Snapshot re-bless legitimate | YES — `.snap` diff = 16 changed lines, all `<h1>`/`<h2>` open/close on 4 PageHeader variants (TitleOnly, LongTitleTruncates, WithBreadcrumbAndActions, WithSubtitle). Zero non-heading lines changed. Nothing silently blessed. |
| F2 testid restored to scroll body | YES — `data-testid="work-team-page"` moved off scaffold root (`flex flex-col h-full`, now testid-free) back onto the `flex-1 overflow-y-auto` scroll body whose first child is the `max-w-[960px] mx-auto` column. AG1 197/206/213 green. `@lore` documents the placement contract. |
| Attestation honest | YES — `status: passed`, `partial: false`, `smartSkipped: []`, tools `[test, test:integration]`, real exit recorded. Commit message drops the false "pre-existing" labeling and states 5742/5742, zero failures. `dirty: true` = the established pre-commit-attestation ordering (verify-attest runs the staged tree, then commits); CI re-runs fast lanes live. Tree clean (only untracked `.pipeline/progress/AI7.json`). |

## Six lenses (re-pass on the fix)

- **Architecture** — PASS. `level?: 1 | 2` default 1 matches the Phase-2 amendment (`e9292001`). `pageTitleClassName` stays the single visual source for both tags; only the DOM tag swaps (`TitleTag = level === 2 ? "h2" : "h1"`). Treatment is level-invariant, proven by the new `level={2}` class-parity test. Migration contract (testid on the same element as origin/main) restored.
- **Design** — PASS. Visual treatment unchanged (20px/600/`tracking-[-0.01em]`/`truncate`/`min-w-0`); snapshot confirms class string identical across the tag swap.
- **Security** — PASS / N/A. Presentational; no new surface.
- **Adversarial** — PASS. No forced-green: protected assertions untouched, fix moved the implementation to meet them. No saboteur signal. No `any`/`!`/unsafe cast added. `TitleTag` capitalized-variable JSX pattern is correct React. `level: 1 | 2` is a closed union — no arbitrary level injection.
- **Simplification** — PASS. The `level` prop is a 2-value union with a single ternary, not a generic heading-level machine. Minimal. No dead code.
- **AI Slop** — PASS. The added `@lore` blocks (level rationale, F2 testid-placement contract) are load-bearing — they encode exactly the contract that broke in Phase 4. No filler. The third new test (`level={2}` class parity) is meaningful, not padding: it pins the level-invariance claim.

## Remaining findings

None blocking. Minor observation (not a defect): the `level` prop is currently unused by all 10 migrated pages (all default to h1). It exists as the reconciliation affordance for a future sub-page whose title is not the document top heading. Documented as such in the `@lore`. Acceptable — it is the smallest mechanism that resolves the F1 design/test conflict cleanly.

---

# ORIGINAL Phase-4 review (NOT DONE — retained for trail)

**Verdict: NOT DONE.**

AC4 (no regression) is violated. The builder's attestation claims "5 pre-existing test failures, zero
AI7 regression." **This is false.** All 5 failing tests pass on `origin/main` and fail only after AI7's
WorkTeam/WorkRoutine migration. Two of them are heading-level protected tests; three are AG1 layout tests.
The remaining five lenses are clean and the gate work is exactly as ratified in Phase 2 — but the regression
is a hard blocker.

Proof method: copied each page file's `origin/main` version over the AI7 version, ran the test, restored.

| Failing test | origin/main | AI7 branch | Cause |
|---|---|---|---|
| `WorkProduct.test.tsx:121` (WorkTeam "1. renders the page H1") | 12/12 PASS | 1 FAIL | PageHeader renders `<h2>`; test asserts `heading level 1 "HyperIdle Core"` |
| `WorkRoutine.AA1.test.tsx:118` ("renders routine name and status") | 8/8 PASS | 1 FAIL | PageHeader renders `<h2>`; test asserts `heading level 1 "Daily digest"`. **This file is in architecture.md `protectedTests`.** |
| `WorkTeam.AG1.test.tsx:197` (`overflow-y-auto` on `work-team-page`) | 35/35 PASS | FAIL | AI7 moved `work-team-page` testid from the scroll body to the new scaffold root |
| `WorkTeam.AG1.test.tsx:206` (`max-w-[960px]` on first child) | PASS | FAIL | same — `firstElementChild` is now `<header>`, not the `max-w` column |
| `WorkTeam.AG1.test.tsx:213` (`mx-auto` on first child) | PASS | FAIL | same |

(Full original AC table + lens findings + required-fix instructions preserved in git history at `b5715072`.)
