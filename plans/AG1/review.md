# AG1 — Code Review (Phase 4)

**Workpackage:** Team screen composes at desktop widths.
**Branch:** `feat/AG1-team-screen-desktop-composition` (PR #268).
**Diff scope:** `git diff 9f36037f..HEAD -- packages/` — 3 files, +1258/-272.
**Commits:** c0211819 (tests, red), 08077c6d (implementation, green), a7532594 (biome format).
**Reviewer:** same persona that scored design (8/10) + architecture (8/10) in Phase 2.

## Verdict: **DONE**

All 5 ACs pass with evidence. Zero CRITICAL findings. Scope discipline exemplary. Every Phase-2 WARNING was resolved in the implementation. The 6 review screenshots are accurate to shipped code (regenerated fresh — see Visual Proof). One pre-existing, non-AG1 environmental L13 failure noted below (NOT blocking — reproduces identically on the base commit with the unchanged file).

---

## Files changed
- `packages/web/src/pages/WorkTeam.tsx` — the only source file. Root wrapper recomposed in all 6 branches; burn `KeyValue` list → 4-tile `StatTile` strip; `StatTile` private helper added; `KeyValue` import dropped.
- `packages/web/src/__tests__/WorkTeam.AG1.test.tsx` — 35 component tests (new).
- `packages/web/e2e/AG1-team-composition.spec.ts` — 6 `test()` decls → 10 expanded cases (new).

No other files touched. AppShell, design-system, `@hyperidle/shared`, `KeyValue`, router — all untouched (grep-verified).

---

## Phase-2 WARNING resolution (carried-forward findings)

| Phase-2 WARNING | Resolved? | Evidence |
|---|---|---|
| Inflated "18 testids all asserted" claim → split into tiers | ✅ | architecture.md §Migrations split Tier-1 (14 asserted) / Tier-2 (4 unasserted); AG1 spec clicks `new-routine-btn`/`add-agent-btn`, upgrading 2 to Tier-1. |
| Screenshot path should be `test-results/AG1-NN-*.png` (not `e2e-output/`) | ✅ | spec writes `test-results/AG1-01..06-*.png`; 6 files present. |
| 4-tile mandatory, no 3-tile fallback | ✅ | WorkTeam.tsx:277-313 unconditionally renders 4 tiles; E2E `toHaveCount(4)` + component test "no 3-tile fallback" both green. |
| Empty-roster Status = "—"/"No agents", never "Healthy" | ✅ | WorkTeam.tsx:298-300; E2E asserts `toContain("No agents")` + `not.toContain("Healthy")`; screenshot AG1-05 confirms. |
| spec.md/approved.md 4th-tile name reconciliation | ✅ | Implementation follows approved.md (Status), not stale `b-summary-grid/spec.md` ("Bet vs routine"). |
| Empty-state composition §4a | ✅ | Empty frame renders full section skeleton; all headers + actions + EmptyStates present (AG1-04/05/06). |

---

## AC completeness table

| AC | Requirement | Evidence | Status |
|---|---|---|---|
| AC-1 | 1280–2560px: every section visible, no clipped text, no row exceeds readable measure | E2E: 6 viewport cases assert `work-team-page`/`team-burn-vs-cap`/`team-active-bets`/`team-routines`/`team-agents` visible + inner column `boundingBox().width ≤ 961`. Screenshots AG1-01/02/03 (populated) + 04/05/06 (empty) show capped centered 960px column at all 3 widths, zero clipping. | **PASS** |
| AC-2 | Related values read paired | StatTile is label-over-value (WorkTeam.tsx:557-572); section headers use `flex items-center` with title+action adjacent. E2E AC-2 test asserts each tile's value box is horizontally within its tile box (not window-edge). Screenshots confirm pairing. | **PASS** |
| AC-3 | Empty team looks intentional | E2E empty cases: 4 tiles render, Status="—"/"No agents", `team-active-bets-empty` + `team-routines-empty` visible. Component tests assert Status value `=== "—"` + sublabel "No agents" + not "Healthy". Screenshots AG1-04/05/06 show a measured, structured empty composition (summary strip anchors the top third). | **PASS** |
| AC-4 | Narrow layout + all behaviors unchanged | 79 component tests green across AG1 + AA1 + AB2 + AB3 (protected). E2E: dialog-open behaviors green (new-routine-btn, add-agent-btn → `role=dialog`). Diff is layout-only — all handlers are indentation-shifted identical code (verified). | **PASS** |
| AC-5 | Playwright visual proof + zero AQ violations | (a) `npm run lint` exit 0, zero `design/*` violations on WorkTeam.tsx. (b) 6 screenshots captured + reviewed below; zero aesthetic-quality.md hard-rule violations at all 3 widths. | **PASS** |

---

## Visual proof audit (the AC-5 proof surface)

**Screenshots regenerated fresh** by re-running the spec (the on-disk PNGs were dated 00:42, before the 00:45 impl commit). Re-run produced byte-identical sizes → the format commit did not alter render; the reviewed pixels match shipped code. All 10 E2E cases passed (42.6s).

| Frame | Width | State | Judgment |
|---|---|---|---|
| AG1-01 | 1280px | populated | 4 tiles in one row, paired label-over-value, content capped, no clipping. Header/sections clean. **PASS** |
| AG1-02 | 2000px | populated | Capped 960px column centered, big margins absorb width (no full-bleed). Status="Attention" + "1 idle agent". **PASS** |
| AG1-03 | 2560px | populated | Column holds at 960px, content does not stretch edge-to-edge. **PASS** |
| AG1-04 | 1280px | empty | All 4 tiles ("—"/"—"/"0 / 5"/"—"), Status="—" + "No agents". Every section header + action + EmptyState present; reads as set-up-but-not-started. **PASS** |
| AG1-05 | 2000px | empty | Status tile shows "—"/"No agents" (NOT "Healthy"). Intentional composition, no abandoned look. **PASS** |
| AG1-06 | 2560px | empty | Capped column, empty states proportionate. **PASS** |

**aesthetic-quality.md hard-rule check (visual + code):**
- AQ-001 spacing on-grid (`p-[18px]`, `p-[24px]`, `gap-[12px]`, `gap-[24px]`, `gap-[6px]`) ✅
- AQ-004 type scale (`text-[20px]`, `text-[11px]`) ✅
- AQ-006 tabular-nums on all numeric tiles ✅
- AQ-008/018 tokens only, no cool grays — warm cream surfaces throughout ✅
- AQ-011 `--r-subtle` radius ✅
- AQ-108 flex+flex-wrap (NOT grid-cols-3), 4 tiles of differing content — no AI-dashboard tell ✅

**NOTE (not a violation):** In the empty frames, the EmptyState card sits left-aligned within a wider list card, leaving right-side whitespace (visible AG1-05 routines/agents). This is pre-existing `EmptyState` component behavior (unchanged by AG1, out of scope — belongs to the shared primitive AG6), not a new defect.

---

## Lens findings

### Architecture — PASS
- Pure Human-Interface-layer change, one page component. No layer reached past. No package boundary crossed.
- StatTile is a typed (`{ label, value, sub? }: …): JSX.Element`) file-local helper, not exported, not shadowing a primitive.
- All 18 testids preserved verbatim (grep-confirmed in source + 79 green tests covering the asserted subset).
- No doc in `docs/` describes the WorkTeam burn KeyValue layout or tile composition (it is presentation detail). Doc-check audit below.

### Design — PASS (lens ACTIVE — UI changed)
- Matches approved.md §1 (wrapper) + §2 (4-tile strip) + §4a (empty composition) field-for-field.
- All states present: populated, empty, loading (4 SkeletonCards in wrapper), error (ErrorState centered), 404/null/malformed (EmptyState centered) — all inside the new capped wrapper (WorkTeam.tsx:106-173).
- Tokens only, no hardcoded colors in new code. The one `rgba(22,118,79,0.03)` inline style (line 443) is **pre-existing** (line 410 on base), moved not added — out of AG1 scope.
- Reuse-first: reuses StatusChip/Button/EmptyState/ErrorState/SkeletonCard/Avatar/Tag/`<progress>`. No new design-system primitive (correctly deferred to AG6).
- StatTile is page-local (single consumer) — correctly NOT promoted to design-system; if AG2/AG5 later need it, that is their promotion call. No `.stories.tsx` required (private in-file helper, not a DS export) — consistent with repo convention.

### Security — PASS (N/A surface)
- No mutations added; no new endpoints; no new untrusted-string rendering (tiles render `formatMoney` numeric output + derived enum labels). No path/URL/secret input. STRIDE axes all N/A, matching the plan's Security block.

### Adversarial — PASS
- **Saboteur:** No weakened tests. Assertions are meaningful (specific text equality on Status value, `toHaveCount(4)`, boundingBox width caps). No backdoor. No race — display-only derivation from already-in-scope `roster`.
- **New Hire:** The Status-tile IIFE (WorkTeam.tsx:297-312) is a minor readability speed-bump (an inline arrow-IIFE inside JSX) but is well-commented and self-contained. Acceptable.
- **Auditor:** PR claims match diff. "4 tiles" — verified. "No behavior change" — verified (handler diffs are indentation-only).
- **Type safety:** Zero `any`, zero `as`, zero `@ts-ignore`, zero non-null `!` in the added code. `npm run check` exit 0.

### Simplification — PASS
- KeyValue import correctly dropped (knip-clean). No dead code, no commented-out code, no premature generics. StatTile is appropriately thin (4 call-sites, justifies extraction).

### AI Slop — PASS
- No verbose filler, no "for now"/"TODO: implement" tells, no defensive over-engineering. The `@lore AG1` comments are load-bearing (explain the flex-not-grid AQ-108 mitigation and the empty-roster rule) — not restating code.

---

## Discrepancies investigated

1. **"11 vs 10" test count.** RESOLVED. The spec has 6 `test()` declarations; two live inside `.describe` blocks that loop over 3 viewports → 6 expanded + 4 standalone = **10 cases** (confirmed via `playwright --list`: "Total: 10 tests"). The red-phase report's "11" was an over-count of a planned case that was merged into a loop; no test was lost. All 10 pass.

2. **Screenshot staleness.** RESOLVED. PNGs predated the impl commit; regenerated fresh, byte-identical → reviewed pixels are accurate to shipped code.

3. **L13 protected E2E — 2 failures (PRE-EXISTING, NOT AG1).** `L13 (1)` and `L13 (3)` fail with `getByText("HyperIdle Core")` not found. **Confirmed not an AG1 regression:** checking out the base `9f36037f` WorkTeam.tsx and re-running reproduces the exact same 2 failures. The error-context page snapshot shows an **empty `<h1>`** and "UNKNOWN" bet title — the `page.route("**/api/teams/:id")` mock is not resolving in this worktree's E2E environment, so the page renders with empty fallback data. This is an environmental/fixture-timing flake on `origin/main`, independent of layout. AG1's own spec uses the same mock pattern and passes 10/10 (it waits on `networkidle` and asserts testids, not seeded text). The `<h1>{team.name}</h1>` rendering is byte-identical between base and AG1. **Not blocking AG1.** Flagging as a NOTE for the track — L13 (1)/(3) are red on main and should be triaged separately (the architecture plan's claim that "L13 stays green" was optimistic; 5/7 L13 cases pass, the 2 failures pre-date this WP).

---

## Scope discipline — PASS
- No shared primitive created (AG6 boundary respected).
- AppShell untouched (AG4 boundary).
- `KeyValue` shared definition untouched (only its usage removed from this page).
- No behavior/data changes — handler diffs are indentation-only; only new logic is the Status derivation.

## Doc-check audit — PASS (justification reasonable)
Builder skipped doc changes: "layout recomposition; no documented behavior or journey changed." Reasonable. No `docs/` file specifies the WorkTeam burn-block layout, tile composition, or column width as a contract — these are presentation details. `three-core-views.md` is pre-existing stale (not introduced or worsened by AG1). No API shape, state machine, data model, or lifecycle changed. No doc update owed by AG1.

## Verification run summary
- `npm run check` — exit 0 (zero type errors).
- `npm run lint` — exit 0 (zero errors; zero `design/*` violations; the 1 WorkTeam.tsx warning is a pre-existing a11y warning at line 797 in RoutineRow, unchanged by AG1).
- Component tests — 79 passed (AG1 + AA1 + AB2 + AB3).
- E2E `AG1-team-composition.spec.ts` — **10/10 passed** (fresh run, 42.6s).
- E2E `L13` — 5/7 passed; 2 pre-existing failures (not AG1, reproduced on base).

---

## Findings summary
- **CRITICAL:** none.
- **WARNING:** none.
- **NOTE-1:** L13 (1)/(3) are red on `origin/main` (mock-resolution flake) — triage separately; not an AG1 deliverable.
- **NOTE-2:** Empty-state EmptyState left-alignment within wide list cards is pre-existing `EmptyState` behavior (AG6 scope), not an AG1 defect.

**Final verdict: DONE.**
