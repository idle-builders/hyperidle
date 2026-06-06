# AB2 Design Critique — Agent Overview in Team Work Page

DESIGN-CRITIQUE: variant=dense-row score=7.6/10 rounds=1 axes: H:8 S:8 T:8 C:8 Co:9 St:7 A:8 AS:9 PP:7

## Overall Assessment

The designer made the right call. Dense rows (Variant B) over enhanced cards (Variant A) is well-reasoned: agents on the team page are monitoring targets, not decision objects. The RoutineRow pattern is the correct visual grammar. The 72/90 vs 66/90 scoring is defensible. The synthesis document correctly identifies which Variant A elements to pull forward (Customize button, error detail in context column).

The design is production-ready with minor findings below.

---

## CRITICAL

None.

---

## WARNING

### W1. Row height conflict: 36px declared but 44px min-height enforced

**Source:** `plans/AB2/design/dense-row/spec.md` line 16, `plans/AB2/design/approved.md` line 39.

The spec says "Row height: 36px (same as RoutineRow), min-height 44px for touch targets." These conflict. The actual RoutineRow in `WorkTeam.tsx` (line 601-616) uses `h-[36px]` with `style={{ minHeight: "44px" }}`. The `min-height` always wins, making the declared `h-[36px]` dead CSS. The row is always 44px, never 36px.

This is not a bug -- the touch-target constraint forces 44px, and the visual result is fine. But the design spec claims 36px rows and bases its density calculation on that ("6 agents in ~264px" requires 44px rows = 264px, which happens to work). The spec should just say 44px and drop the misleading 36px declaration.

**Impact on builder:** The builder will write `h-[36px]` that does nothing. Not harmful but confusing.

### W2. "9px row gaps" in comparison table does not match spec

**Source:** `plans/AB2/design/comparison.md` line 8: "9px row gaps".

The dense-row spec uses `gap-[9px]` in the flex items within a row (the spacing between health dot, avatar, name, etc.) but rows themselves are not separated by 9px gaps -- they use hairline borders with no gap. The comparison table conflates intra-row gaps with inter-row gaps. This could mislead the builder into adding `gap-[9px]` between rows.

### W3. Portfolio team pill agent count uses 3px left margin

**Source:** `plans/AB2/design/approved.md` lines 533-534: `ml-[3px]`.

3px is on the Hearth grid (AQ-001: {3, 6, 9, 12, 18, 24, 36, 48}px), so this is not a violation. However, the adjacent health dot also uses `ml-[3px]`. The tight spacing between team name, agent count, and health dot risks visual cramping on team pills. 6px (`ml-[6px]`) would give more breathing room and still read as "inline with the pill content." This is a judgment call, not a rule violation.

### W4. Concept doc says "frontend-derived" status; design says "server-derived"

**Source:** `plans/AB2/concept.md` line 52: "Agent operational status derivation stays frontend-derived per AB1 lore." `plans/AB2/design/approved.md` line 207: "This keeps operational status derivation on the server (not frontend)."

The concept document and the approved design contradict each other on a fundamental architectural decision. The concept says status stays frontend-derived (per AB1 lore); the design says server-derived (because N fetches are impractical). The design's reasoning is sound -- the team page loads multiple agents, and doing N profile fetches to derive status client-side would be wasteful. But this is a concept-level contract change that the concept doc should have been updated to reflect.

The architecture plan (which came after design) resolves this in favor of server-side derivation. The concept doc is now stale. This is acceptable as long as the builder follows the architecture plan, not the concept doc.

---

## SUGGESTION

### S1. Lead marker " -- Lead" appended inline is fragile at narrow widths

**Source:** `plans/AB2/design/approved.md` lines 67-68.

The lead marker is appended to the name as inline text: `{member.name} <span> -- Lead</span>`. At narrow viewports, truncation via `truncate` will clip the lead marker first (it is at the end of the string). A team lead named "Alexander" on a narrow viewport shows "Alexan..." with no lead indicator.

Alternative: Move the lead marker before the name as a small icon or fixed-width indicator. Or use a separate non-truncating element. The RoutineRow avoids this problem because it has no equivalent qualifier on the name.

### S2. Health dot `aria-hidden="true"` with information in title

**Source:** `plans/AB2/design/approved.md` line 63, architecture line 463.

The health dot is `aria-hidden="true"` but carries a `title` tooltip with health detail text. This means the health information (e.g., "High failure rate (83%)") is inaccessible to screen reader users. The status column shows "error" but not the detail. Consider adding `role="img"` and `aria-label={healthDetail}` instead of `aria-hidden`, or adding a visually-hidden span with the detail text.

### S3. Mobile adaptation hides task/role column -- spec mentions it but architecture omits it

**Source:** `plans/AB2/design/dense-row/spec.md` lines 80-82.

The dense-row spec says "On narrow viewports (<=768px): hide the task/role column." The architecture plan's AgentRow component (section 6b) has no responsive hiding logic. This is an explicit design decision that the builder might miss if they only read the architecture plan.

### S4. Customize button as a nested `<button>` inside a `<button>`

**Source:** `plans/AB2/design/approved.md` line 74, architecture plan line 490-494.

The architecture plan's AgentRow component is a `<button type="button">` containing another `<button>` for Customize. This is invalid HTML -- nested interactive elements violate the HTML spec and break screen readers. The existing AgentCard (line 498-513 of WorkTeam.tsx) deliberately avoids this by using `<div role="button">` for the outer element with a comment explaining why.

The builder must follow the same pattern: outer element as `<div role="button">` (not `<button>`), inner Customize as a real `<button>`. The architecture plan's code sample has this wrong.

### S5. Category tag removal is acceptable but should be explicitly documented

The design drops the category tag ("Strategy" / "Personal") from agent rows. The comparison and synthesis documents justify this: "noise without aiding the primary task (anomaly detection)." This is the right call for the dense-row pattern. Category information is available on the agent profile page (one click away). No action needed -- this is noted for the record.

---

## What's Working Well

1. **Visual grammar consistency.** The decision to match the RoutineRow pattern exactly -- same container, same hover, same dot-first layout, same row height -- creates a coherent "infrastructure monitoring" visual language across R5 (routines) and R3 (agents). This is the strongest aspect of the design.

2. **Health dot as leftmost element for peripheral anomaly detection.** Placing the health indicator at the left edge creates a vertical column of dots. A single red dot breaks the green column and draws the eye immediately. This is not decorative -- it is a genuine information design optimization for the "scan for anomalies" user task. The designer understood the user's actual scanning behavior.

3. **Rejected directions are well-reasoned.** Each rejection (cards, StatusChip, category tags, frontend-derived status, real-time updates) includes a clear rationale grounded in the user task or system constraints. The design document does not just list what was rejected but explains why, which gives the builder confidence to not re-litigate.

---

## Dimension Breakdown

| # | Dimension | Score | Notes |
|---|-----------|-------|-------|
| 1 | Visual Hierarchy | 8 | Health dot -> name -> status -> context is a clear four-level hierarchy. Dot placement for peripheral vision is excellent. Lead marker could be stronger (S1). |
| 2 | Spacing & Density | 8 | All values on the Hearth 6px grid: 12px container padding, 9px row gaps, 6px dot, 3px margins. The 36px/44px conflict (W1) is cosmetic. |
| 3 | Typography | 8 | 13px name, 11px mono status, 10px lead marker -- all on-scale (AQ-004). Mono for status labels matches RoutineRow. |
| 4 | Color Usage | 8 | All colors via semantic tokens (--status-success, --status-error, --status-warning, --text-tertiary, --accent-primary). No hardcoded values. Status colors are meaningful, not decorative. |
| 5 | Component Coherence | 9 | Near-perfect match with RoutineRow. Same container, same hover treatment, same dot, same typography weights. The highest-scoring dimension. |
| 6 | States & Feedback | 7 | Empty, populated, and per-agent status states are covered. Loading/error delegated to parent (acceptable). Missing: no explicit disabled state for the Customize button (when?), no explicit hover state documentation for the health dot beyond native title. Mobile responsive behavior specified in dense-row spec but omitted from architecture (S3). |
| 7 | Accessibility | 8 | Focus ring specified (outline-2, accent-primary). Keyboard nav (Enter/Space). Row is a semantic button. Deduction: health dot is aria-hidden with informative title (S2), and nested button issue (S4). |
| 8 | Anti-Slop | 9 | Maximum anti-slop score. Dense, purposeful, no decoration. No gradients, no oversized padding, no centered layouts, no emoji icons. This looks nothing like generic AI output. The RoutineRow pattern is a distinctive Hearth choice. |
| 9 | Premium Polish | 7 | Tabular-nums on status column (mono): not explicitly specified but mono implies it. Motion tokens for hover transition: specified (--motion-fast). Touch targets: 44px min-height. Deduction: no explicit prefers-reduced-motion handling documented. No explicit tabular-nums on the context column numeric content (e.g., "5/6 sessions failed"). |

**Weighted average: 7.6/10 -- PASS (threshold: 7.0)**

---

## Verdict

The design advances to implementation. The dense-row approach is well-grounded in the page's visual grammar and the user's actual task (anomaly scanning). The four warnings are addressable during implementation without design rework. The most important finding for the builder is S4 (nested button) -- the architecture plan's code sample must not be followed literally on this point.
