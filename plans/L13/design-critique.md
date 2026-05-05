# L13 — Design Critique

Reviewer pass over `plans/L13/design/approved.md`. Read cold against the AC in `plans/work-packages/TRACK-L.md` L13 (lines 446–475) and the rules in `.claude/rules/aesthetic-quality.md` and `.claude/rules/frontend.md`.

## Surfaces classified by the designer

- **Novel.** Product page layout. Drill-down navigation.
- **Routine.** Submenu under Work, legacy `/work/team` redirect, empty-state for zero active bets.

The classification holds. The Product page is the first level-2 surface in the Work view that is parameterised by id; it has three load-bearing regions and a slot for a fourth. Drill-down navigation is the first level-2 affordance that mints a level-2 URL from a card click. Both are correctly novel.

The Submenu and redirect are correctly routine. The empty-state for zero active bets, however, is a spec-named acceptance criterion ("Given a product has no active bets, the page shows a clear empty state, not a fallback fake bet"). Routine is fine if the copy and `data-testid` are nailed — they are (see §Approved configuration). Acceptable.

---

## Surface A — Product page layout

### Variants explored

V1 stacked single column, V2 two-column-at-`lg` with bets+roster split, V3 three-column dashboard. Adequate spread — the three options span the realistic layout space (single, split-primary-plus-secondary, peer-columns). Three variants is the right number for a novel surface.

### Rubric scoring (reviewer reproduces independently against the 9-dim rubric)

| Dim | V1 — Stacked | V2 — 2-col | V3 — 3-col | Reviewer note |
|---|---|---|---|---|
| Information hierarchy (what's the subject?) | 9 | 8 | 5 | Concur on V1 (9). V2 over-promotes the right column to a peer; subject is the bets list, roster is auxiliary. V3 has no clear subject — confirmed. |
| Spacing / density | 9 | 8 | 6 | Concur. V3 forces narrow content past the BetCard's title fold. |
| Typography fit | 9 | 7 | 5 | V2 BetCard at 2/3 of the page width is fine on `lg` but truncates on `md`. Lower than designer scored (8 → 7). |
| Color / status surfacing | 9 | 9 | 8 | Concur. |
| Coherence with rest of app | 9 | 7 | 4 | Concur on V1. V2 introduces a bet|roster split that no other detail page in the app uses (verified: Bet detail is also stacked). V3 hits AQ-108 — concur. |
| Mobile parity (one form factor) | 10 | 7 | 6 | Concur. V1's "identical desktop and mobile" is the v3 form-factor doctrine. |
| Component budget (19-component ceiling) | 10 | 9 | 8 | V1 introduces zero new components; V2 needs a column container that risks creeping toward a custom Card; V3 same risk amplified. |
| Empty-state grace | 9 | 7 | 5 | Empty bets in a 1/3 column reads broken — concur on V3 as low. V2 lopsidedness is real. |
| Reach to L12 artifact slot | 9 | 6 | 5 | Concur. V1 leaves a clean full-width slot at the bottom — L12 can occupy that without re-flowing the page. V2 forces the slot under roster; V3 locks it into 1/3 width. |
| **Total** | **83** | **68** | **52** |

### Verdict on Surface A

V1 clears the bar (every dim ≥ 9, total 83). V2 and V3 do not (V2 totals 68, V3 totals 52). Designer's choice is sound. The "did we consider?" rejections (Kanban region, agent cards, cycle stripe duplication) are each defensible — the Kanban rejection in particular is forced by the v3 ownership rule (humans act at the bet level), and the spec confirms it.

**Score: 9.2 / 10. ADVANCE.**

One micro-note for the builder: the designer puts R4 (burn) above R2 (active bets) on the rationale "is this team burning healthily?" first. The architecture's `ProductDetail` shape lists `roster` before `burn` and `activeBets`. Order of regions in the rendered DOM is the design's call (burn → bets → roster → artifact slot per the V1 ASCII), and the architecture's response shape ordering is irrelevant to render order. No fix needed; just flagging that the builder must implement the design's order, not the API shape's order.

---

## Surface B — Drill-down navigation

### Variants explored

N1 breadcrumb chip on Product page header, N2 Submenu "Back to Portfolio" link, N3 IconRail re-click only.

### Rubric scoring (reviewer reproduces independently)

| Dim | N1 — breadcrumb | N2 — submenu | N3 — IconRail |
|---|---|---|---|
| Discoverability | 9 | 7 | 4 |
| Visual cost (chrome added) | 9 | 8 | 10 |
| Consistency with Bet detail breadcrumb (verified: cross-view-navigation-map.md row 16 says "Click breadcrumb") | 10 | 6 | 4 |
| Mobile parity | 9 | 5 | 8 |
| Component budget | 9 | 9 | 10 |
| Friction to invoke | 9 | 7 | 5 |
| Predictability of route | 10 | 10 | 9 |
| Robustness under direct-URL entry | 10 | 8 | 6 |
| Coherence with IA spec | 10 | 6 | 4 |
| **Total** | **85** | **66** | **60** |

### Verdict on Surface B

N1 clears the bar (every dim ≥ 9, total 85). The IA spec at `docs/information-architecture/cross-view-navigation-map.md` row 16 ("Bet Detail → Team View | Click breadcrumb") is independently verified — the breadcrumb pattern is established at level 3, and N1 brings level 2 into line. Single-segment breadcrumb (just "← Portfolio") is the right choice; the multi-segment trail ("Portfolio / Product Name") would duplicate the H1.

**Score: 9.4 / 10. ADVANCE.**

---

## Routine surfaces

### Submenu under Work

Drop "Team Board" entry; reduce list to `[ Portfolio ]`. When on a Product page, the active item remains "Portfolio". This holds because the user is *still in the Portfolio sub-tree*, just one level deeper.

The rejection of a "you are here" Submenu item per product is correct — that's exactly the side-navigation tree the founder rejected. Concur.

### Legacy `/work/team` redirect

`<Navigate to="/work/portfolio" replace />`. The `replace` is intentional (the user did not "ask" to see the legacy Team Board). Rejecting "redirect to first product" is correct (arbitrariness). Rejecting "render 404" is correct (vestigial URL friendliness).

One reviewer-flag: the architecture-critique will press whether `/work/portfolio` is the right fallback when the user *did* know which product they meant. It isn't — but there is no way to recover that intent from the URL `/work/team`, so Portfolio is the only honest fallback. Concur.

### Empty-state for zero active bets

Title "No active bets". Description "This product team has no bets in flight. Shape a pitch on the team's Canvas to commit one." `data-testid="product-active-bets-empty"`.

This is concrete enough to test (the Playwright e2e step 2 asserts the testid). The copy avoids marketing superlatives (AQ-110) and avoids placeholder filler (AQ-109). The "Shape a pitch on the team's Canvas" phrase mentions a Canvas affordance that does NOT exist on the Product page (the Canvas lives on the legacy WorkTeam.tsx, which is being deleted, and PitchSelector flow is L17). This copy nudges users toward an affordance they cannot find from this page. **Recommend tightening the copy.** Suggested: "This product team has no bets in flight. Pitch one in the next product cycle." Or simply: "No active bets. Shape a pitch when you're ready to commit one." — drop the "Canvas" reference. The designer flagged this themselves indirectly by noting "Pitch authorship is L17's territory"; the copy contradicts the rejection of a CTA.

This is a copy nit, not a structural break. The empty-state is concretely specifiable and testable as written. Score 7 — borderline ADVANCE but copy revision recommended in builder phase.

The roster empty-state ("Roster not configured") and burn empty-state ("Cost cap not set") are similarly concrete. Acceptable.

---

## Cross-cutting checks

### Component budget impact

L13 introduces zero new custom components. The page composes existing primitives: `BetCard`, `KeyValue`, `StatusChip`, `EmptyState`, `SkeletonCard`, `ErrorState`, DaisyUI `<progress>`, `btn btn-ghost btn-xs`, `<NavItem>`. The 19-component ceiling is respected. Concur.

### Anti-AI-aesthetic checklist

Designer's own checklist passes (no `rounded-2xl`, no purple/indigo gradients, no `p-8`+, no hero, no center-aligned body, no backdrop-blur, no 3-col grid, no marketing superlatives, no gradient-on-text). Reviewer scans the variant ASCII art and copy: confirmed. AQ-108 was the explicit rejection criterion for V3, which is exactly what the rule requires.

### States, transitions, keyboard, focus

The states table covers Empty / Loading / Error / Populated for each region. Tab order is region-by-region top-to-bottom. Enter on a focused row navigates to the bet. No new keyboard shortcuts (per the founder demotion). Focus moves to H1 on navigation; the optional focus-restore on breadcrumb-back is correctly flagged as designer-call deferred to polish.

One reviewer-flag: the H1 focus pattern requires `tabIndex={-1}` on the H1 + ref focus on mount. The designer references the existing pattern in `WorkBet.tsx` — verified that pattern lives there. Acceptable.

### Acceptance hooks

10 testids enumerated, all named consistently with existing `work-portfolio-page` / `product-card` / `cycle-stripe`. All 10 are used in the architecture's Playwright e2e. Concur.

### Mobile

Same vertical stack on mobile. No mobile-specific layout. Matches Portfolio + Bet detail behaviour. Concur.

---

## Required before advancing

None. Both novel surfaces clear ≥ 7 on every dim and total ≥ 80. Both routine surfaces have concrete decisions and considered-and-rejected alternatives.

## Optional improvements

1. **Empty-bets copy.** Drop the "team's Canvas" reference (the Canvas no longer renders on the Product page; PitchSelector is L17). Suggested: "No active bets. Shape a pitch when you're ready to commit one." Builder may apply during write-code or visual-polish.
2. **Focus restoration on breadcrumb back.** Designer flagged as designer-call. The simpler "focus H1 on return" path is acceptable for L13. Builder may add `location.state` plumbing if visual polish surfaces it as a friction point; otherwise defer.

---

## Verdict

**ADVANCE.** Surface A V1 = 9.2, Surface B N1 = 9.4. Routine surfaces are concretely decided. The empty-bets copy nit is non-blocking; flag it for builder polish.

Reviewer confidence the design is ready for architecture: HIGH.
