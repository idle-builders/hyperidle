# AA1 Design Critique — Routine Visibility & Team Scoping

DESIGN-CRITIQUE: variant=variant-b-integrated-list score=73/90  rounds=1  axes: H:8 S:8 T:8 C:8 Co:8 St:8 A:8 AS:9 PP:8

---

## Variant A: Parallel Rows

DESIGN-CRITIQUE: variant=variant-a-parallel-rows score=64/90  rounds=1  axes: H:6 S:8 T:8 C:8 Co:9 St:6 A:7 AS:8 PP:4

### 1. Visual Hierarchy — 6/10

The routine section is visually indistinguishable from the bet section. Both use the same elevated card-per-row treatment (bg-[var(--surface-container)], rounded-[var(--r-subtle)], p-[18px]). The section heading "ROUTINES" is the only cue that differentiates them. A team lead scanning the page for "is everything healthy?" cannot do a 2-second health check because the routine rows demand the same level of attention as bet rows. The name-first layout is wrong for the routine use case -- routines are infrastructure, not decision objects.

The expanded detail panel (inline accordion) for the error routine is functional but creates a visual block that pushes everything below it off-screen. For a page that is already vertically long (header + burn + bets + routines + roster + artifacts), the accordion expansion makes the page unwieldy.

### 2. Spacing & Density — 8/10

All values on the 6px grid: 18px card padding, 6px gap between rows, 12px gaps. No violations. Section heading margin-bottom is 6px. The mockup body padding is 24px -- on grid.

### 3. Typography — 8/10

13px medium for routine name, 10px mono for metadata, 12px section heading uppercase. StatusChip replica uses 11px mono. All within the Hearth type scale. Font weights at 500/600 -- valid.

### 4. Color Usage — 8/10

Semantic tokens throughout. StatusChip handles green/red/blue status. Run outcome dots use --status-success and --status-error. No hardcoded hex colors visible. The error last-outcome text uses var(--status-error) correctly.

### 5. Component Coherence — 9/10

Perfect structural coherence with bet rows -- same card style, same padding, same hover behavior. This is both the strength (zero learning curve) and the weakness (zero differentiation). The KV grid and run history table in the expanded detail use the same patterns as the rest of the system.

### 6. States & Feedback — 6/10

The mockup shows populated, error (expanded), and paused states but does not show empty or loading states visually. The brief mentions them but the mockup does not render them. More critically, the accordion expansion needs aria-expanded and aria-controls attributes for the expanded state -- the mockup does not demonstrate this. The inline expansion pattern is problematic: the run history table inside the accordion has no height constraint, so a routine with many runs pushes the rest of the page off-screen.

### 7. Accessibility — 7/10

Focus-visible outline defined. Button semantics correct. Keyboard navigation for rows is implicit. However, the accordion pattern is missing critical ARIA: no aria-expanded, no aria-controls, no id linkage between the trigger button and the detail panel. The run history table headers lack scope="col". The last-run dot (success/failure/never) communicates status through color alone -- no text alternative for screen readers within the dot element.

### 8. Anti-Slop — 8/10

No AI aesthetic tells. Warm tokens throughout. No gradients, no purple, no oversized padding, no hero sections. Realistic content (routine names, agent names, timestamps, costs). The design feels Hearth-native.

### 9. Premium Polish — 4/10

The design is functional but lacks the intentional differentiation that marks mature design. Routine rows as bet-row clones is the "safe default" -- it avoids design risk by making everything look the same. The expanded detail panel is a flat rendering of KVs and a table with no visual hierarchy between the configuration and the run history. Tabular numerals are present on cost values. Section heading tracking is correct. But the overall impression is "we pasted bet rows and added metadata columns" rather than "we designed a purpose-built surface for monitoring recurring infrastructure."

**Variant A Total: 64/90 (average 7.1/10)**

---

## Variant B: Integrated Status Table (APPROVED DIRECTION)

DESIGN-CRITIQUE: variant=variant-b-integrated-list score=73/90  rounds=1  axes: H:8 S:8 T:8 C:8 Co:8 St:8 A:8 AS:9 PP:8

### 1. Visual Hierarchy — 8/10

The status-dot-first layout is correct for the routine use case. A team lead glances at the left edge of the routines section and immediately sees four green/red/blue dots -- instant health check. The flat container card (Linen bg, no shadow) visually separates routines from bet rows (elevated cards with shadow). This communicates "infrastructure monitoring" vs "decision objects" through structure, not just content. The hairline separators between rows keep the table feeling tight and scannable.

The side drawer (shown in the mockup) is well-organized: title + StatusChip, KV grid, divider, run history, divider, action buttons. Clear section progression.

One deduction: the approved design rejects the side drawer in favor of a full-page detail route (`/work/routine/:routineId`). The mockup still shows the drawer. This is a mockup-vs-spec inconsistency -- the builder will need to implement a full page, not a drawer. The design spec (approved.md) is authoritative, but the visual reference for the detail surface is the drawer mockup, which has different layout constraints than a full page.

### 2. Spacing & Density — 8/10

36px row height = 6 * 6px -- on grid. 12px container padding -- on grid. 9px gaps between elements -- on grid. Agent avatar at 24px -- on grid. All column widths are explicit (80px schedule, 60px last-run, 54px cost). The drawer uses 24px padding and 18px section gaps -- on grid.

One concern: the 6px horizontal padding on routine rows (padding: 0 6px) is tight. With 9px gaps between flex children, the leftmost status dot sits only 6px from the container edge. This creates a subtle visual imbalance -- the dot appears cramped against the container wall. The bet rows above use 18px padding. The difference is intentional (flat table vs elevated card) but the 6px padding could be 9px or 12px for better breathing room without breaking the grid.

### 3. Typography — 8/10

13px medium for routine name. 11px mono for schedule, last-run, cost columns. Agent avatar at 9px bold for initials. Section heading at 12px uppercase 600 with 0.08em tracking. All within the Hearth type scale. The drawer uses 17px 600 for the title and 13px for KV values -- correct hierarchy.

### 4. Color Usage — 8/10

Status dots use semantic tokens: --status-success (active), --status-error (error), --status-info (paused), --text-tertiary (never-run). Agent avatar uses rgba(22, 118, 79, 0.08) for background and --accent-primary for text -- the AQ-012 agent distinction pattern. Container uses --surface-container. No hardcoded hex values in the mockup CSS... except the hover color: `rgba(44, 36, 26, 0.02)`. This matches the AQ-010 flat-list hover pattern precisely but is a raw rgba value in the CSS, not a token reference. The approved design spec also uses this raw value. It works because AQ-010 defines this exact value, but ideally it should reference a token.

### 5. Component Coherence — 8/10

The flat container card pattern (Linen bg + hairline separators) parallels the burn-vs-cap section in WorkTeam, which also uses --surface-container bg. This is good -- it establishes "flat informational container" as a pattern distinct from "elevated interactive card." The drawer uses the same KV grid pattern (2 columns, 9px 18px gap) found in the Variant A detail panel and in other system detail views.

One coherence concern: the routine rows within the container are `<button>` elements, which is correct for click-to-navigate. But the burn-vs-cap section (the visual sibling) is non-interactive. A user might develop the expectation that Linen containers are read-only and then be surprised that routine rows are clickable. The hover state (subtle background tint) and cursor:pointer mitigate this, but it is worth noting.

### 6. States & Feedback — 8/10

The approved design spec (approved.md) explicitly defines all states:
- **Empty:** EmptyState inside container card, left-aligned (AQ-008), data-testid specified.
- **Loading:** 2 skeleton rows at 36px height each, with skeleton-pulse animation.
- **Error (fetch):** ErrorState component.
- **Populated:** Flat rows as described.
- **Never-run:** Last-run shows "Never" in --text-tertiary. Status dot color changes based on state.

The detail page (approved.md) defines: loading (SkeletonCard per section), not-found (404 EmptyState), error, populated. Run history empty state: "No runs recorded yet."

Transitions use --motion-fast for background-color on hover. Focus state uses outline-2 on --accent-primary.

The one gap: the paused state's status dot should use --text-tertiary when the routine has never run AND is active, but --status-info when paused. The approved.md handles this correctly in the "Routine never run" section.

### 7. Accessibility — 8/10

Focus-visible outline defined with outline-offset: -2px (inset, to avoid clipping by the container border-radius). Button semantics on every routine row. The drawer in the mockup has aria-label="Routine detail" on the overlay and aria-label="Close" on the close button. Agent avatars should carry aria-labels (mentioned in the comparison but not shown in the mockup).

The approved design specifies the detail page as a full route, which eliminates the drawer accessibility concerns (focus trap, aria-modal, escape handler). A full page is inherently more accessible than a drawer.

Status dots communicate state through color only. The approved design mitigates this by having the dot paired with a state name in the detail view (StatusChip shows "HEALTHY"/"PAUSED"/"ERROR") and the column position (leftmost = status). In the row itself, the dot is the only status indicator -- but the row also shows the routine name, schedule, and other context, so the color is not the sole information carrier at the row level.

### 8. Anti-Slop — 9/10

No AI aesthetic tells. The flat status table is genuinely distinctive -- it does not look like a generic dashboard. The agent avatars with green tint add a warm, recognizable element. The container card pattern (Linen bg, no shadow, hairline separators) is Hearth-native. Realistic content throughout. No hero sections, no centered layouts (except the drawer which is rejected), no emoji icons, no oversized padding. The design communicates "purpose-built infrastructure monitoring" rather than "default card grid."

### 9. Premium Polish — 8/10

- Tabular numerals on cost and last-run columns (font-variant-numeric: tabular-nums) -- correct per AQ-006.
- Section heading uses uppercase 12px with 0.08em tracking -- matches --tracking-caps.
- Motion uses --motion-fast for hover transitions.
- Row height fixed at 36px -- columns align vertically.
- Agent avatar uses the green-tinted pattern established elsewhere in the system.
- The approved design specifies both Pause/Resume and Trigger Now buttons with ghost/primary pill styles -- correct per AQ-005.

Missing: no explicit mention of prefers-reduced-motion handling, though the only motion is the background-color transition on hover. Touch targets: 36px row height is below 44px at viewport <= 1024px (AQ-015). The approved.md does not specify a mobile adaptation that increases touch target size.

**Variant B Total: 73/90 (average 8.1/10)**

---

## Overall Assessment

Variant B is the correct choice. The designer's comparison scoring (67 vs 71) is reasonable but slightly generous to Variant A and slightly conservative on Variant B. My scoring (64 vs 73) widens the gap because:

1. Variant A's premium polish score is lower than the designer gave (4 vs 6) -- the clone-of-bet-row approach is explicitly the "safe default" that the Anti-Slop dimension penalizes.
2. Variant B's anti-slop score is higher (9 vs 8) -- the intentional visual distinction between infrastructure and decisions is a design achievement, not just a technical choice.
3. The designer scored Variant A's states at 7, but the accordion overflow problem is a functional concern that merits 6.

### CRITICAL

None. All dimensions score >= 7 for the approved direction (Variant B). The design advances.

### WARNING

- **[approved.md:37] Row height 36px vs touch target minimum.** AQ-015 requires touch targets >= 44px at viewport <= 1024px. The 36px routine rows violate this on tablet viewports. The approved design should note that on mobile/tablet, rows should have min-height: 44px (or the click area should expand via padding). The builder needs guidance here.

- **[approved.md:37] Hover value is a raw rgba, not a token.** The hover color `rgba(44, 36, 26, 0.02)` is defined inline in the CSS. This matches AQ-010 exactly but is not referenced as a token. If the design system ever introduces a `--surface-hover-tint` token, this value should use it. Low priority but worth tracking.

- **[mockup.html vs approved.md] Detail surface inconsistency.** The Variant B mockup shows a side drawer for routine detail. The approved design specifies a full-page route at `/work/routine/:routineId`. The drawer mockup is still useful as a visual reference for the KV grid and run history layout, but the builder must implement a full page, not a drawer. The approved.md is authoritative.

### SUGGESTION

- **[approved.md:27] Container padding 6px -> 9px or 12px.** The 6px horizontal row padding inside the routines container is tight. Increasing to 9px (still on grid) or 12px would give the status dot more breathing room from the container edge without breaking the dense table aesthetic.

- **[approved.md] Agent avatar border.** The mockup shows `border: 2px solid var(--surface-container)` on agent avatars (matching AQ-007 overlapping avatar pattern). In a single-avatar-per-row context, the border is unnecessary and makes the 24px avatar effectively 20px inside. Consider removing the border for routine rows where overlap is not possible.

- **[approved.md] Portfolio summary line.** The summary line "{totalBets} bets across {teamCount} teams -- {totalActiveRoutines} routines active" is a good first pass, but "routines active" is ambiguous -- does it mean routines in the "active" state, or routines that exist? The spec says "count of routines belonging to this team, all states" for routineCount. The summary should clarify: "8 routines" (all states) or "6 active routines" (filtered). The approved.md says "totalActiveRoutines" which implies filtering to active state only.

### What is Working Well

- **Visual separation between bets and routines.** The elevated-card vs flat-container distinction is the key design decision and it works. A team lead can immediately identify the two categories of work without reading any text.

- **Status-dot-first layout.** The leftmost dot enables a 2-second health scan -- the exact use case for routine monitoring. The approved design correctly identifies that "is everything healthy?" is the primary question, not "which routine is this?"

- **Comprehensive state coverage in approved.md.** Every surface (WorkTeam, detail page, portfolio) has explicit empty, loading, error, and populated states documented. The "never run" edge case is handled with appropriate visual treatment. This is thorough design work.

---

## Scoring Summary

| Dimension | Variant A | Variant B (Approved) |
|-----------|-----------|---------------------|
| Hierarchy | 6 | 8 |
| Spacing | 8 | 8 |
| Typography | 8 | 8 |
| Color | 8 | 8 |
| Coherence | 9 | 8 |
| States | 6 | 8 |
| Accessibility | 7 | 8 |
| Anti-Slop | 8 | 9 |
| Premium Polish | 4 | 8 |
| **Total** | **64/90** | **73/90** |

**Verdict: Variant B (Approved Direction) passes all dimensions at >= 7. Design advances to architecture.**
