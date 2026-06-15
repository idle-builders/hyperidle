# AI7 — Code Review (Phase 4)

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

## AC table

| AC | Status | Evidence |
|---|---|---|
| AC1 — one title + one section treatment; no per-page forks; no undefined utility classes | PASS | `git grep -nE 'font-heading\|tracking-wider'` in `pages/` returns only one comment line in non-migrated `knowledge/KnowledgeCreateDialog.tsx` (AI2's file, a doc comment not a class). Primitives encode the one treatment; token form `tracking-[var(--tracking-caps-sm)]` used (not the literal). |
| AC2 — one scroll rule on every page and every return branch | PASS (structure) | Every WorkTeam (5) / WorkRoutine (4) / AgentProfile (4) branch roots `flex flex-col h-full` + `shrink-0` PageHeader + `flex-1 overflow-y-auto` body. PageHeader carries `shrink-0`. |
| AC3 — story-backed DS primitives; repeated class strings gone; new page composes the primitive | PASS | `PageHeader`/`SectionLabel` + `.stories.tsx` exist and export from `index.ts`; both gates fire as scoped (RuleTester proves both arms); KnowledgeCreate composes `pageTitleClassName` by reference. |
| **AC4 — no regression to page content/actions/navigation** | **FAIL** | 5 tests pass on `origin/main`, fail on AI7 (table above). Builder's "pre-existing" claim is false. |
| AC5 — cross-page consistency via the snapshot net | PASS | 8 new snapshot variants blessed; enumeration guard bumped 56→58 at both numeric sites + message template + test name + comments. |

## Lens findings

### Architecture — PASS
- Human-interface layer only; no Meta/Agent reach. Matches the plan.
- Prop interfaces match `architecture.md` § Type signatures exactly. `pageTitleClassName` exported and used by
  the primitive's own `<h2>` (single source of truth).
- WorkTeam migration respects the AG1 boundary: only the header strip + per-branch scaffold root changed; the
  body sections (`team-burn-vs-cap`, `team-active-bets`, `team-routines`, `team-agents`) are preserved, just
  re-indented inside the new scroll body. AI7 did **not** touch body composition. Good — except it relocated the
  `work-team-page` testid (see Adversarial F2).

### Design — PASS (with the h2 caveat under Adversarial F1)
- TSX matches `design/approved.md`: 20px/600/`tracking-[-0.01em]` title, 13px/600/uppercase caps token section.
- States present in stories (TitleOnly, WithBreadcrumbAndActions, WithSubtitle, LongTitleTruncates; Default,
  WithTrailing, WithDivider, AsH2).
- Tokens only — no hardcoded colors, on-grid spacing, `dsProps` markers present.
- a11y: `truncate` + `min-w-0` keeps full title text in DOM; semantic `<header>` + heading elements.

### Security — PASS / N/A
Presentational-only. Slots take `ReactNode` (React-escaped). No `dangerouslySetInnerHTML`, no routes, no inputs,
no secrets. Correct N/A across STRIDE.

### Adversarial

**F1 (BLOCKER, root cause of 2/5 failures) — PageHeader `<h2>` breaks two `level: 1` protected assertions.**
`design/approved.md` deliberately chose h2 for the page title (sections nest at h3) — a sound *document-outline*
decision in isolation. But on `origin/main` both WorkTeam (`WorkTeam.tsx:269`) and WorkRoutine (`WorkRoutine.tsx:196`)
render the page title as `<h1>`, and two component tests assert `heading { level: 1 }`:
- `WorkProduct.test.tsx:121` → `"HyperIdle Core"`
- `WorkRoutine.AA1.test.tsx:118` → `"Daily digest"` — **explicitly listed in `architecture.md` `protectedTests`,
  whose assertions "must NOT change."**

AI7 shipped both red and mislabeled them pre-existing. Per AC4 + the protectedTests contract this is a regression.
This is also a real document-outline question the plan never reconciled against these tests: switching the page
title from h1→h2 means **no page has an h1** unless something else provides it. The design decision and the
existing tests disagree, and that disagreement was never resolved — it was shipped as a "pre-existing failure."

**F2 (BLOCKER, root cause of 3/5 failures) — `work-team-page` testid relocated, contradicting the migration contract.**
`architecture.md` § Migrations (line ~159): *"Every page root keeps its `data-testid` … so existing
component/e2e tests stay green."* On `origin/main`, `work-team-page` sits on the **scroll body**
(`flex-1 overflow-y-auto`, `WorkTeam.tsx:111`) whose first child is the `max-w-[960px] mx-auto` column. AI7 moved
the testid up to the new scaffold root (`flex flex-col h-full`, `WorkTeam.tsx:113`). Now:
- `work-team-page.className` no longer contains `overflow-y-auto` → `WorkTeam.AG1.test.tsx:197` fails
- its `firstElementChild` is the `<header>`, not the `max-w` column → `:206` + `:213` fail

`WorkTeam.AG1.test.tsx` passes 35/35 on `origin/main`. These are AG1's `[RED]` tests for a feature AG1 hasn't
built — but they were *green by accident* against the current DOM, and AI7 broke them. Two readings, both end at
NOT DONE:
1. If the AG1 `[RED]` tests are "naming a future surface" (MEMORY: tests may name unreachable surfaces), they
   should have been red on `origin/main` already — they weren't, so AI7 caused a real DOM change under them.
2. Either way AI7 changed which element carries `work-team-page` and what its first child is — a structural
   regression the migration contract forbids.

No saboteur/backdoor signals. No `any`/`!`/unsafe-cast in the primitives. The `rawNode as JSXAttribute` casts in
the two rules match the established ESLint-visitor convention (precedent rules do the same with `biome-ignore`).

### Simplification — PASS
`SectionLabel`'s `[...].filter(Boolean).join(" ")` class assembly is idiomatic and warranted (conditional divider).
No single-use helpers, dead code, or premature generics. The two-rule split (vs one mega-rule) is the ratified,
precedent-matching choice.

### AI Slop — PASS
Comments are load-bearing `@lore` (the negative-em allowlist, the W1 identifier escape hatch, the h3-default
rationale) — not filler. No "TODO: implement", no "simplified version", no defensive over-engineering. Naming is
honest.

## "Builder must preserve" list (Phase 2 re-critique §136) — all verified intact

1. **warn-elsewhere config block** — `eslint.config.ts:206-224`, `no-undefined-font-heading: "warn"` on
   `packages/web/src/**` outside pages. Present. `npm run lint:eslint` exits 0.
2. **`tracking-wider` self-gate on `/pages/`** — `no-undefined-font-heading.ts:35,105` (`isInPages` +
   `inPages && isHeading`). Present. (Implementation adds an extra `isHeading` gate — narrower than plan,
   defensible; RuleTester covers it with `<h2>`/`<span>` cases.)
3. **two-file `ignores`** — `eslint.config.ts:184-185` (SettingsPage, SetupFlow). Present.
4. **literal-only collector + KnowledgeCreate negative case** — rules use
   `collectClassStringsFromJSXAttribute`; `AI7-no-handrolled-page-header.test.ts:116` is the identifier-reference
   negative case. Present.
5. **every-branch scaffold rooting** — WorkTeam 5 / WorkRoutine 4 / AgentProfile 4 branches all root
   `flex flex-col h-full`. Verified by grep. Present.

## Other verification

- `npm run check` — PASS (13 packages, 0 type errors).
- `npm run lint` / `lint:eslint` — PASS (exit 0; only biome warnings/infos, no errors). The out-of-scope
  `font-heading` files (ArtifactSection, TaskSheet, DesignSystem, …) warn-not-error under `--quiet` as designed.
- WorkTeam body composition (AG1 sharedFile) — untouched; header + scaffold root only.
- `mock-data-purge/inventory.*` change — benign (KnowledgeDetail line numbers shifted +2 by the added DS import;
  regenerated correctly).

## Required fixes for the builder

1. **Resolve the h1→h2 / protected-test conflict (F1).** The design wants the page title at h2; two protected
   tests assert h1. Pick one and make them consistent — do **not** ship red:
   - Either keep PageHeader at h2 and update the two assertions (`WorkProduct.test.tsx:121`,
     `WorkRoutine.AA1.test.tsx:118`) from `level: 1` → `level: 2`. But `WorkRoutine.AA1.test.tsx` is a
     `protectedTests` entry — changing its level assertion needs an explicit, documented call that the heading
     *level* is presentation (not behavior) and that no page should carry an h1; capture it as `@lore` and note
     it in the review trail. Confirm no remaining surface relies on a page-level h1 (none found:
     only these two tests assert `level: 1` across the web package).
   - Or give PageHeader an `as`/`level` affordance so migrated pages keep h1 where a test/outline depends on it.
   The decision must be reconciled, not deferred. The current state (shipped red, mislabeled pre-existing) is the
   defect.

2. **Restore the `work-team-page` testid contract (F2).** Per the migration contract, the testid must stay on the
   element it identified on `origin/main` — the scroll body (`flex-1 overflow-y-auto`) whose first child is the
   `max-w-[960px] mx-auto` column. Options:
   - Keep the scaffold root as a bare `<div className="flex flex-col h-full">` (no testid) and put `work-team-page`
     back on the inner `flex-1 overflow-y-auto` scroll body, with the `max-w` column as its first child — exactly
     the origin DOM relationship the AG1 tests assert. (PageHeader is a sibling of the scroll body inside the
     scaffold, so the testid relocation isn't required by the scaffold.)
   - This restores all 3 `WorkTeam.AG1.test.tsx` assertions without touching AG1's tests.
   Re-run `npx vitest run packages/web/src/__tests__/WorkTeam.AG1.test.tsx` → 35/35.

3. **Re-run the full suite and re-attest honestly.** After 1+2, `npm run test` must be 5740/5740 (or whatever the
   true zero-regression count is). The attestation message must not claim "pre-existing" for failures AI7 caused.

After these, AC4 holds and AI7 is shippable — the rest of the implementation (primitives, gates, scaffold,
snapshot net) is correct and matches the ratified plan.
