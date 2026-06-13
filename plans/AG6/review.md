# AG6 — Phase 4 Code Review: shared `Row` / `ItemList` / `RowDot` primitive

Reviewer (single evaluator persona, carrying Phase-2 critique context forward). Commit `03c11eff`.
Validation re-run live: `npm run check` PASS (12 pkgs), `npm run lint` PASS (0 errors; 380 warnings/164 infos, all pre-existing categories), AG6 targeted tests **73 passed**. Visual: screenshots captured via Playwright at `plans/AG6/proof/` (designsystem Row + ItemList stories, WorkTeam agents+routines, Knowledge triage + curated).

---

# RE-REVIEW (after fixes) — commit `2d97adde`

**All blockers and warnings resolved.** Re-validation live: `npm run check` PASS (12 pkgs); AG6 unit/component tests **149 passed** (9 files); AG6 e2e capture spec `AG6-row-primitive.spec.ts` **3/3 pass** (proxy ECONNREFUSED noise is from unmocked routes hitting the dead backend — mocked routes drive the assertions). Fresh screenshots captured at `plans/AG6/proof/AG6-surface1-*.png` + `AG6-surface2-*.png`.

## Verdict: DONE

### Finding resolution

| # | Finding | Status | Evidence |
|---|---|---|---|
| **C1** | Lead-marker quote glyphs | **RESOLVED** | `WorkTeam.tsx:555-559` now plain JSX text `— Lead` (`ml-1` provides spacing, accent color, 10px). Regression test `WorkTeam.AG6.test.tsx` "AG6 C1" with `isLead:true` asserts `/— Lead/` AND `not.toContain('" — Lead"')`. Visually confirmed in `AG6-surface1` screenshot: "Builder Agent — Lead" renders clean, no quotes. |
| **C2** | AC-6 capture spec missing | **RESOLVED** | `packages/web/e2e/AG6-row-primitive.spec.ts` exists (committed). Drives WorkTeam (agents + routines) and Knowledge triage; asserts `[data-ds-component='Row']` + ≥44px boundingBox on BOTH surfaces; captures screenshots. 3/3 pass. Visuals judged AQ-clean — zero hard-rule violations (see AC-6 row). |
| **W1** | Dead no-op if/else + cell duplication | **RESOLVED** | `Row.tsx:110-136` single `renderCell(cell, i)` helper; `cellStyle.color = toneColor(cell.tone)` (no-op branch gone); both div and li paths call the one helper (`Row.tsx:200, 279`). No duplicated cell JSX. |
| **W2** | Uniform hover/focus | **RESOLVED** | `clickable = onClick ? clickableProps(onClick, baseClasses) : null` is the single source. button branch: `className={clickable?.className ?? baseClasses}` (`:233`). li>div[role=button] (with + without actions): inner div built from `clickable?.className` (`:253-255, :295-297`). div+actions / div+onClick: `<div {...commonProps} {...clickableProps(onClick, baseClasses)}>` — spread last so role/handlers/className all win; no hand-rolled utilities, no double-specified handlers (`:323, :334`). All four interactive branches now route through `clickableProps`. The headline AC-3 risk is genuinely closed. |
| **W3** | Doc-check justification | **RESOLVED** | Commit `2d97adde` body: "W3: doc-check: internal DS primitive consolidation; cataloguing via index.ts + /designsystem stories; no user-facing doc affected." |
| **S1** | `KNOWLEDGE_KINDS` Set per-render | **RESOLVED** | `KnowledgeList.tsx:65` module-scope `const KNOWLEDGE_KINDS = new Set([...])`; both call sites (`:466, :695`) reference it. No per-row allocation, single name. |
| **S2** | KnowledgeList loading/error via ItemList | **DECLINED (accepted)** | Knowledge keeps page-level full-bleed `SkeletonList`/`ErrorState`/`EmptyState`. These are design-system companions, and the full-bleed page-level loading/error layouts legitimately live outside `ItemList` (they are not in-list states). AC-5 reads "consistently through the primitive OR its documented companions" — the companions satisfy it. AC-5 acceptably MET. |

### Final AC table

| AC | Status | Evidence |
|---|---|---|
| **AC-1** Primitive + stories (plain/status/trailing-action/selected/empty) | **MET** | unchanged; stories render all states at `/designsystem`. |
| **AC-2** Agents + routines + ≥1 more via primitive | **MET** | WorkTeam agents/routines + Knowledge triage/curated via `Row`/`ItemList`; e2e asserts `data-ds-component=Row` on both. |
| **AC-3** One consistent alignment/separator/hover/focus/44px | **MET** | W2 closed — all interactive branches share `clickableProps`. `min-h-[44px]` + hairline separators on every Row; e2e asserts ≥44px on both surfaces. |
| **AC-4** Bespoke rows removed → thin configs | **MET** | unchanged; 0 bespoke row component definitions remain. |
| **AC-5** Empty + loading consistent via primitive/companions | **MET** | `ItemList` owns error→loading→empty→children; WorkTeam uses it; Knowledge uses DS companions for page-level states (S2 accepted). |
| **AC-6** Playwright screenshots ≥2 surfaces, AQ-clean, zero hard-rule violations | **MET** | Committed `AG6-row-primitive.spec.ts` captures 2 surfaces, 3/3 pass. Reviewer judged both frames vs `aesthetic-quality.md`: warm earth palette + forest accents (AQ-008/018/102 clean), hairline separators + on-grid spacing (AQ-001), system fonts (AQ-019), no hero/glass/3-col-grid/emoji icons (AQ-104/107/108/105), no lead placeholder when omitted (AQ-113), tabular-nums on numeric cells (AQ-006). Shared row anatomy is visually consistent across both surfaces. **Zero hard-rule violations.** |

### Remaining
None blocking. S3 (RowDot `title` prop drift) and S4 (ItemList bare `<div/>` empty fallback) remain SUGGESTION-level and non-blocking, carried forward to retro if desired. Note: `Menu.test.tsx` flaky (unrelated, passes on re-run) and ~34 pre-existing e2e failures on main are not AG6-attributable.

Ready for retro + ship.

---

## Verdict (original Phase 4): NOT DONE

Two blocking items: a **visual regression** introduced by the migration (literal `" — Lead"` quotes render on every lead agent row — see screenshot `03`), and an **AC-6 process gap** (no `*.spec.ts` captures the migrated surfaces; the AC requires a Playwright capture spec, not an ad-hoc reviewer script). The primitive itself is well-built, contract-faithful, and the consolidation is real. Fix the two blockers + the WARNING-level dead code and it ships.

---

## AC table

| AC | Status | Evidence |
|---|---|---|
| **AC-1** Primitive exists + catalogued via stories (plain/status/trailing-action/selected/empty) | **MET** | `Row.tsx`/`ItemList.tsx`/`RowDot.tsx` exported from `index.ts:68-113`. Stories render at `/designsystem` (proof `01`,`02`): Row has Plain/WithStatusDot/WithAvatarLead/WithCells/WithTrailingAction/Selected/Subtitle/NoLeadNoPlaceholder; ItemList has Populated/Empty/Loading/Error/Flush/AsUl. All 5 named AC-1 states present. |
| **AC-2** Work-view agents + routines + ≥1 more render through primitive | **MET** | `WorkTeam.tsx:400-602` (routines + agents via `ItemList`+`Row`), `KnowledgeList.tsx:451,685` (triage + curated via `ItemList variant="flush" as="ul"`+`Row`). Rows carry `data-ds-component="Row"`. 73 AG6 tests green; protected testids preserved. |
| **AC-3** One consistent alignment/separator/hover/focus/44px | **MET (with WARNING)** | `Row.tsx:139-142` always emits `min-h-[44px]` + `border-b border-[var(--border-subtle)] last:border-b-0`. Tested (`Row.test.tsx:157-174`). Visual confirms hairline separators + alignment. **Caveat:** hover/focus is NOT applied uniformly across all wrapper branches — see WARNING-2. |
| **AC-4** Bespoke rows removed/reduced to thin configs | **MET** | grep: 0 definitions of `AgentRow`/`RoutineRow`/`KnowledgeListRow` remain. Each collapsed to `RowProps`/`RowCell[]` config. |
| **AC-5** Empty + loading consistent via primitive/companions | **PARTIAL** | `ItemList` owns error→loading→empty→children (`ItemList.tsx:73-105`); WorkTeam routines/agents use `ItemList.empty`. **But** KnowledgeList still hand-rolls its own inline `SkeletonList`/`ErrorState`/`EmptyState` blocks (`KnowledgeList.tsx:429-448, 644-675`) rather than routing loading/error through `ItemList` — the architecture migration spec (T8) explicitly said "replace inline SkeletonList/ErrorState blocks with ItemList loading/error". The in-list *empty* still bypasses the companion. Functional + consistent-looking, but the AC-5 "consistently through the primitive or its companions" intent is only half-delivered for the Knowledge surface. SUGGESTION-level, not blocking. |
| **AC-6** Playwright screenshots of ≥2 surfaces, AQ-clean, zero hard-rule violations | **NOT MET** | No `*.spec.ts` captures the migrated surfaces. The plan (T10) and the AC require a committed Playwright capture spec. Reviewer captured screenshots manually (proof `03`,`04`,`05`) and judges the **visual result AQ-clean** EXCEPT the `" — Lead"` quote regression (CRITICAL-1). The capture spec is a builder deliverable still missing. |

---

## Findings (prioritized)

### CRITICAL

**C1 — Visual regression: literal quote characters in agent lead marker.**
`WorkTeam.tsx:553-559` renders the lead marker as a JSX **string literal** including the double-quote glyphs:
```tsx
{member.isLead && (
  <span className="ml-1 text-[var(--accent-primary)] text-[10px]">
    " — Lead"
  </span>
)}
```
This renders on screen as `Builder Agent " — Lead"` (with visible quotes) — confirmed in proof screenshot `03`. On `origin/main` the same marker was correct JSX text: `<span ...> — Lead</span>` (no quotes). The AG6 migration introduced the quotes. No test covers it (all WorkTeam fixtures use `isLead: false`), which is why it shipped green. **Fix:** drop the surrounding quotes → ` — Lead` as JSX text. Add a fixture row with `isLead: true` asserting the rendered text is ` — Lead` (no quote glyphs) so it can't regress again.

**C2 — AC-6 capture spec missing.**
AC-6 is a hard AC requiring Playwright screenshots of ≥2 list surfaces on the primitive, committed as a spec. There is no `packages/web/e2e/AG6-*.spec.ts` (grep: none). The architecture maps AC-6 → T9/T10 and T10 is "E2E visual: screenshot agents + routines (+ knowledge)". The builder must add a `*.spec.ts` that navigates to the team page (agents+routines) and the knowledge list, asserts rows render via `[data-ds-component='Row']`, and captures screenshots. Reviewer's manual `plans/AG6/shot.mjs` is not a substitute — it is not committed test infra and does not run in CI.

### WARNING

**W1 — Dead `if/else` branch (no-op condition).** `Row.tsx:173-177`:
```tsx
if ((cell.tone && cell.tone !== "neutral") || cell.tone === undefined) {
  cellStyle.color = toneColor(cell.tone);
} else {
  cellStyle.color = toneColor(cell.tone);
}
```
Both branches are byte-identical (`cellStyle.color = toneColor(cell.tone)`), and `toneColor` already maps `"neutral"`/`undefined` → `var(--text-tertiary)` via its `default` case. The condition is a pure no-op — collapse to a single `cellStyle.color = toneColor(cell.tone);`. (The `as="li"` cell loop at `Row.tsx:277` already does exactly this single-line form — the two cell-render paths are inconsistent. This is also a duplication smell: the cell-rendering JSX is copy-pasted between the div path (168-201) and the li path (272-302). Consider extracting a `renderCells(cells)` helper to kill the duplication and the inconsistency.)

**W2 — Hover/focus treatment is NOT uniform across wrapper branches (AC-3 consistency claim is partially false).**
The design contract (§1, §7) and architecture (`architecture.md:96`) require *one* hover/focus treatment on every clickable row, sourced from `clickableProps`. The implementation diverges by branch:
- **`<button>` branch** (`Row.tsx:217-224`, onClick + no actions): receives `commonProps` + `onClick` only — **NO hover tint, NO focus-visible ring, NO motion**. A plain agent/routine row that has no actions gets zero hover/focus affordance. This is the *most common* clickable row shape.
- **`div role=button` branch** (`Row.tsx:347-372`): spreads `{...clickableProps(onClick, "")}` AND a hand-written `className` with the same hover/focus utilities. Because `className` is listed *after* the spread, `clickableProps`' merged className is **discarded** — the hand-written copy wins. So `clickableProps` is invoked but its className contribution is dead; only its `role`/`onClick`/`onKeyDown`/`tabIndex` survive (and those are ALSO set explicitly on the same element just above, lines 353-361 — double-specified). Net: the hover works here, but via duplicated hardcoded utilities, not via the helper the contract names.
- **`li` + onClick branches** (`Row.tsx:247-258`, `326-339`): inner `div role=button` has `className="flex items-center gap-[12px] flex-1 min-w-0 cursor-pointer"` — **NO hover tint, NO focus-visible ring**. Knowledge rows (the flush surface) therefore have no row hover/focus.

Result: of the four interactive branches, only the `div+actions` branch has the hover/focus, and it gets it by hand-rolling — the exact anti-pattern the critique (arch WARNING, design WARNING) said to avoid. **Fix:** route every interactive branch through `clickableProps(onClick, baseClasses)` as the single source of the hover+focus+motion, and remove the hand-written duplicate. The `<button>` and `li>div[role=button]` branches must gain the hover/focus; the `div+actions` branch must drop its hand-written copy and the double-specified role/handlers. This is the one finding that materially undercuts the AC-3 "one consistent hover/focus" claim — the stated win of the whole workpackage.

**W3 — Missing doc-check justification in commit.** The commit body has no doc-check line. AG6 is an internal design-system consolidation. DESIGN.md catalogues philosophy/tokens/architecture (not per-component prop tables — the live inventory is `index.ts` + `/designsystem`), so a DESIGN.md component entry is NOT strictly required by convention. But the one-line skip justification IS required and is absent. **Fix:** add a justification line to the commit (e.g. "doc-check: internal DS primitive; cataloguing is index.ts + /designsystem stories; no user-facing doc affected"). If the team treats DESIGN.md §Component Architecture as the catalogue of record, add a one-line Row/ItemList/RowDot entry there.

### SUGGESTION

**S1 — `KNOWLEDGE_KINDS` Set rebuilt per row render.** `KnowledgeList.tsx:459` (`KNOWLEDGE_KINDS`) and `:689` (`KNOWLEDGE_KINDS_C`) construct `new Set([...])` inside the `.map()` callback — one allocation per row per render, in two places, with two names for the identical set. Hoist to a single module-level `const KNOWLEDGE_KINDS = new Set(["pattern","decision","failure"])`.

**S2 — AC-5 KnowledgeList loading/error not routed through `ItemList`.** See AC-5 row. The Knowledge surface keeps inline `SkeletonList`/`ErrorState` (`KnowledgeList.tsx:429-435, 644-647`) instead of `<ItemList loading={...} error={...}>` per the T8 migration spec. Lower priority because the page-level full-bleed empty/loading layouts legitimately live outside `ItemList`, but the in-list loading/error for the populated path should route through the companion to fully satisfy "consistently through the primitive or its companions".

**S3 — `RowDot` gained an undocumented `title` prop.** `RowDot.tsx:21-25,36` adds a `title?` (HTML tooltip) prop not in the locked contract (`approved.md §5` / `architecture.md` typed `{ tone, label? }` only). It's harmless and used by the agent row (`WorkTeam.tsx:548`), but it's contract drift — either fold it into the architecture's type contract retroactively or note it. Not blocking.

**S4 — `ItemList` empty-with-no-`empty`-prop renders a bare `<div/>`.** `ItemList.tsx:93-95`: when `isEmpty` is true but no `empty` content is supplied, it renders `<div />`. Every real consumer passes `empty`, so this path is unreachable in production — minor dead/defensive branch. Acceptable, but if you want it gone, make `empty` required when `isEmpty` can be true, or drop the fallback.

---

## What's working well

- **Consolidation is real, not cosmetic.** Three bespoke row components deleted (grep-verified), all collapsed to thin `RowProps`/`RowCell[]` configs. The Knowledge curated/triage and Work agents/routines now visibly share one anatomy (proof `03`–`05`).
- **Contract fidelity on the hard items:** zero `rgba(` in the new TSX (grep clean); `RowCell.tone?: RowTone` single spelling, no `"default"` alias; `isEmpty` required; `RowDot` authored fresh (no `LiveDot` pulse copy); nested-button a11y heuristic implemented correctly (`button` vs `div[role=button]` vs `li`-keeps-listitem) with accurate `@lore`; testid passthrough preserved end-to-end.
- **Visual quality is high.** Knowledge triage/curated and the routines/agents lists are dense, warm-toned, AQ-clean (no slop tells, hairline separators, status dots, tabular-nums on numeric cells). The only visual defect is C1.
- **`as="li"` correctly avoids `role="button"` on the `<li>`** so `getAllByRole("listitem")` keeps working — good catch, well-lored (`Row.tsx:229-233`).
