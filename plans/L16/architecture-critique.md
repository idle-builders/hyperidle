# L16 — Architecture Critique

**Artifact reviewed:** `plans/L16/architecture.md`.
**Method:** 9-dimension rubric, 0-10 each. Threshold: average ≥ 7. Two rounds (initial + post-fix).

## Per-dimension scores (final, post-fix)

| Dimension | Score | Rationale |
|---|---|---|
| Spec adherence / AC coverage | 9 | AC→test table maps every AC to verification: AC-1→`pitch.test.tsx` case 1 + e2e step 6; AC-2→case 3; AC-3→ESLint `no-restricted-imports` rule (negative invariant) + case 8 (positive runtime-data-path invariant); AC-4 split into round-trip (case 2), id-stability (case 3), edit-one (case 4); AC-5→e2e steps 3-5; AC-6→`bun run verify`. No AC unmapped. |
| Type / data-model correctness | 9 | `bets.pitch text NOT NULL` confirmed at `schema.ts:66`. Server returns `{ ...bet, tasks }` at `routes/bets.ts:97` with `pitch` already on the wire. New `BetDetail` type in `packages/web/src/types/bet.ts` correctly placed at the page-shape layer (not wire, not DS). Type flows page → fixtures; values flow fixtures → stories/tests. No cycle. |
| API contract | 9 | Zero server-side change. Endpoint `GET /api/bets/:id` exists; the new `useBet` hook is a thin client. |
| File / module boundaries | 9 | `BetPitch` co-located in `WorkBet.tsx` (single call site; promote on third consumer). Fixtures under `__fixtures__/`. Types isolated to `types/bet.ts`. `useBet` lives in `hooks/`. The `overrideBet` prop kept stories' fixture path from crossing into the page module. Clean. |
| Layer integrity | 10 | Human Interface → Meta Layer respected. Block primitive consumed via `@hyperidle/design-system`; `deriveBlocks` from `@hyperidle/shared`. No reach-past. |
| Testability / verification plan | 9 | Substring-grep "fixtures-isolation" test replaced with structural ESLint `no-restricted-imports` rule — catches every import edge regardless of symbols at either end, fails at lint time on every commit. Round-trip lossless test split from render-fidelity test (case 1 = DOM render-fidelity; case 2 = pure `deriveBlocks` structural assertion). Case 8 added for the positive AC-3 invariant (page reads from `useBet`, not from a smuggled fixture import). `useBet.test.ts` covers loading / data / error / cancellation. Strong. |
| Performance | 8 | `useMemo([pitch, betId])` correctly placed inside `BetPitch`. ⚠️ UNVERIFIED parse cost at the 256 KB cap remains honestly flagged. React 18 reference identity behavior described correctly. The deterministic-id rationale (DOM doesn't churn even if memo invalidates because Block keys match) is accurate. |
| Risk register | 9 | Nine risks called out with mitigations. Unknown-kind regex false-positive caught and mitigated (e2e step 4 excludes both `[data-ds-kind="code"]` AND `[data-ds-kind="unknown"]`). ESLint type-import edge case acknowledged and resolved by placing `BetDetail` outside `__fixtures__/`. The seed-pitch test-collision risk is new in this revision and correctly handled by a pre-edit grep. |
| Ordered tasks / executability | 9 | 13 ordered tasks; red phase first; verify gate; visual proof on both story override AND live `/work/bet/<seeded-id>` path. The `useBet` wire is now committed, not conditional. Task 1 ("read L2's existing test surface") is a thoughtful pre-step that prevents duplicated coverage. |

**Average: 8.9 / 10**

## Top findings (resolved this round)

1. **Fixtures-isolation test was theatrical.** Original plan used `fs.readFileSync` substring-grep against `WorkBet.tsx` looking for `# Problem` / `## Appetite`. Resolved: replaced with ESLint `no-restricted-imports` rule (§F) restricting `**/__fixtures__/**` imports from non-stories / non-test files in `packages/web/src/`. Type-import edge handled by isolating `BetDetail` in `packages/web/src/types/bet.ts`. The negative invariant is now structural; complemented by case 8 (positive: `useBet` IS the runtime data source).
2. **§G branch was conditional on L14, but L14 has not landed.** Verified via `git log --oneline | grep -iE "L14|bet.*fetch|useBet"` — zero hits on `main`. Resolved: §H is now "Required (L14 has not landed)"; the `useBet` hook + ErrorState path is committed, not optional. Task 1 dropped the grep-and-decide step.
3. **Open Question #2 (`overrideBet` vs. `overrideBetId`) was parked.** Resolved: chose `overrideBet`. Stories pass `<WorkBet overrideBet={MOCK_BETS.b1} />`; the page module never imports from `__fixtures__/`. `overrideBetId` removed. Stories switch atomically in step 8.
4. **Test naming conflated render-fidelity with structural round-trip.** Resolved: split into case 1 (DOM render-fidelity, no markdown markers visible) and case 2 (pure `deriveBlocks` structural assertion that all expected `BlockKind`s appear in the output). Case 2 cites `packages/shared/src/__tests__/blocks/round-trip.test.ts` if it covers the same fixture, to avoid duplication.

## Findings still open (parked for builder, non-blocking)

1. **`UnknownPayload` raw rendering risk for the e2e regex.** Designer's parked Open Question #1. Mitigation (exclude `[data-ds-kind="unknown"]` from the line-leading-`#` assertion) is sound. A deeper fix — making `UnknownPayload` strip leading hash markers from `raw.slice(0, 500)` — is out of scope for L16 and would couple the unknown fallback to markdown-specific stripping logic. Reviewer concurs with the current mitigation.
2. **Seed pitch ownership.** Designer's parked Open Question #2. The seed change is small, bounded, and gated by a pre-edit grep for assertion collisions. Reviewer concurs; if the seeded pitch already exercises multiple kinds, no edit is needed.

## Verdict

**APPROVED**
