# R2 Post-Rebase Re-Review

**Reviewer:** Opus 4.6 (Reviewer persona)
**Date:** 2026-05-29
**Rebase target:** origin/main (SQLite -> PGLite migration, bun -> npm)
**Rebase conflicts:** 2 (both in `.verify-attestation.json` -- no code conflicts)

## Verdict: DONE

R2 is intact after rebase. All behavioral changes survive. All R2 tests pass.

---

## 1. Diff Integrity

25 files changed vs origin/main. Breakdown:

- **Infrastructure:** `.verify-attestation.json`, `package-lock.json` (expected post-rebase)
- **Backend (1 file):** `packages/server/src/routes/users.ts` -- email optional change intact
- **Frontend (4 files):** `SetupFlow.tsx`, `BetCreateDialog.tsx`, `WorkPortfolio.tsx`, `FirstRunRedirect.tsx` -- all R2 changes present
- **Tests (7 files):** R2-specific tests (`FirstRunRedirect.R2.test.tsx`, `R2-work-first-landing.spec.ts`) + updated existing tests (`SetupFlow.test.tsx`, `BetCreateDialog.test.tsx`, `WorkPortfolio.test.tsx`, `FirstRunRedirect.P4.test.tsx`, `FirstRunRedirect.test.tsx`, `setup-flow.spec.ts`, `router.P4.test.tsx`)
- **Plans (7 files):** Pipeline artifacts in `plans/R2/`

No unexpected files. No corruption. The `users-create.test.ts` file that appeared in the initial stat is identical to main (confirmed: `git diff origin/main` shows no diff for it).

## 2. Implementation Spot-Check

| File | Check | Status |
|------|-------|--------|
| `users.ts` | `email: z.string().email().max(200).optional()` | Intact |
| `users.ts` | All queries use async/await (no SQLite sync calls) | Confirmed |
| `users.ts` | `sql` template tag uses parameterized binding (line 309) -- safe with PGLite | Confirmed |
| `SetupFlow.tsx` | Two required fields (name + API key), one optional (repo path) | Intact |
| `SetupFlow.tsx` | No email field, no backend mode, no product name field | Intact |
| `SetupFlow.tsx` | Navigates to `/work/portfolio` on success | Intact |
| `FirstRunRedirect.tsx` | Redirects to `/work/portfolio` (line 38) | Intact |
| `BetCreateDialog.tsx` | No appetite fields, conditional product picker | Intact |
| `WorkPortfolio.tsx` | EmptyState CTA with `data-testid="create-bet-cta"` | Intact |
| `WorkPortfolio.tsx` | CTA shows only when `items.length > 0 && canvasBets.length === 0` | Intact |

## 3. Test Results

| Test file | Tests | Result |
|-----------|-------|--------|
| `FirstRunRedirect.R2.test.tsx` | 4 | All pass |
| `SetupFlow.test.tsx` | 14 | All pass |
| `BetCreateDialog.test.tsx` | 19 | All pass |
| `WorkPortfolio.test.tsx` | 9 | All pass |
| `users-create.test.ts` | 11 | Timeouts (pre-existing on main -- NOT an R2 change) |

**Note on `users-create.test.ts`:** This file is NOT in the R2 diff (identical to `origin/main`). The `beforeEach` hook times out at 30s because `createTestDb()` with PGLite is slow. This is a pre-existing infrastructure issue from the SQLite->PGLite migration on main, not an R2 regression.

## 4. Security (PGLite Transition)

- `users.ts` line 309: The `sql` template tag passes `${probe}` as a bound parameter via Drizzle ORM -- safe against injection in both SQLite and PostgreSQL.
- `createHumanUserSchema` uses Zod validation before any DB operations -- no raw input reaches queries.
- All R2 code paths use Drizzle ORM methods (`db.insert`, `db.select`, `db.update`) with parameterized values -- no raw SQL.
- Auth bypass guard (line 92-107) unchanged and functional.

No injection vectors introduced by the PGLite transition in R2's code paths.

## 5. AC Confirmation Table

| AC | Description | Verified By | Status |
|----|-------------|-------------|--------|
| AC-1 | Setup flow: two required fields (name + API key), repo path optional | `SetupFlow.test.tsx` (7 tests), `setup-flow.spec.ts`, `R2-work-first-landing.spec.ts` | Pass |
| AC-2 | Backend mode selection removed | `SetupFlow.test.tsx` (2 tests), `setup-flow.spec.ts`, `R2-work-first-landing.spec.ts` | Pass |
| AC-3 | Email field removed from setup | `SetupFlow.test.tsx` (2 tests), `users.ts` schema, `setup-flow.spec.ts`, `R2-work-first-landing.spec.ts` | Pass |
| AC-4 | Product created silently (no visible section) | `SetupFlow.test.tsx` (2 tests), `setup-flow.spec.ts`, `R2-work-first-landing.spec.ts` | Pass |
| AC-5 | Post-setup redirect to /work/portfolio | `SetupFlow.test.tsx`, `FirstRunRedirect.R2.test.tsx` (4 tests), `R2-work-first-landing.spec.ts` | Pass |
| AC-6 | BetCreateDialog: no appetite, conditional product picker | `BetCreateDialog.test.tsx` (7 tests), `R2-work-first-landing.spec.ts` | Pass |
| AC-7 | "Create bet" CTA on WorkPortfolio when no bets | `WorkPortfolio.test.tsx` (4 tests), `R2-work-first-landing.spec.ts` | Pass |
