# Architecture Critique: W1 — Hearth Foundation Design

ARCHITECTURE-SCORE: 7/10 rounds=1 score-line: SA:8 LI:10 AC:N/A DM:N/A N:9 MD:9 FMC:6 S:9 V:5

## Context

W1 is a design-only workpackage. It produces HTML reference files and design system documentation — no TypeScript, no APIs, no database changes, no backend code. This makes several architectural dimensions (API Contracts, Data Model Alignment) not applicable. The plan is evaluated on the dimensions that do apply.

---

## Dimension Scores

### 1. Spec Alignment — 8/10

The plan's file inventory maps well to the acceptance criteria. Every AC has a corresponding deliverable, and every deliverable traces to an AC.

Gaps:
- The AC says "Foundation primitive HTML files are created or rewritten for every primitive in the 03-hearth.html component library: Avatar, AvatarGroup, Button, Input, Select, Toggle, Checkbox, TabBar, Toast, Progress, Tooltip." The plan correctly shows AvatarGroup bundled in Avatar.html. The inventory is complete.
- The AC says "Existing component HTML files (StatusChip, Tag, BetCard, ThreadRow, CommentRow, NavItem, Composer, SearchField, etc.) are reviewed against 03-hearth.html and rewritten where they diverge." The plan lists only 5 rewritten components, but the designer actually rewrote 7 (adding NavItem and CommentRow). The plan's inventory table is stale — it was written before the final commits. The AC cross-reference table says "5 files rewritten" when the actual count is 7.
- The plan does not mention SearchField, StatusChip, or Tag as "reviewed and determined to not need rewriting." The AC says "reviewed... and rewritten WHERE THEY DIVERGE" — the plan should explicitly call out which components were reviewed and found to already match.

### 2. Layer Integrity — 10/10

W1 is entirely within the Human Interface layer (design system HTML files). No backend code, no Meta Layer access, no Agent Runtime. The plan does not reach past its layer. The dependency map for W2 correctly identifies the bottom-up flow within the design system.

### 3. API Contracts — N/A

W1 produces no APIs. Not applicable.

### 4. Data Model Alignment — N/A

W1 changes no database schemas. Not applicable.

### 5. Naming — 9/10

File names are clear: `conversations-thread-list.html`, `work-bet-overview.html`, `knowledge-detail.html`. Component names match 03-hearth.html and the existing codebase (Avatar, Button, BetCard, ThreadRow, etc.). Screen file names follow a `<view>-<state>.html` convention.

CSS class names are well-structured using BEM-adjacent patterns: `.bet-card__top`, `.thread-row__dot`, `.comment-row__action`. The plan documents the naming convention through examples.

### 6. Module Depth — 9/10

The plan's structure is appropriately simple for a design-only workpackage. Each HTML file is a self-contained module (standalone in browser). The tier hierarchy (Tier 0 primitives, Tier 1-2 components, screen mockups) creates a clear depth progression.

The plan's "Dependency Map for W2" section is a compact, useful abstraction — it hides the complexity of which components consume which primitives behind a simple 4-step ordering.

### 7. Failure-Mode Coverage — 6/10

The plan lacks explicit coverage of:
- **What happens when _tokens.css is missing or unreachable.** HTML files in `screens/` reference `../_tokens.css` — if directory structure changes, the relative path breaks. The plan should note this dependency.
- **What happens when the theme switcher script fails.** All files depend on `themes/_switcher.js`. If this script errors, the theme toggle breaks silently.
- **What happens when CDN scripts are unreachable.** All files load React, ReactDOM, and Babel from `unpkg.com`. If the CDN is down, the files render blank. The plan should note this external dependency and whether offline viewing is a requirement.
- **Verification of dark mode.** The plan says "Working Light/Dark theme switcher" is verified by "Browser check" but does not specify what to check — do all colors invert correctly? Do shadows change? Do contrast ratios hold?

For a design-only workpackage, these are lower-severity than they would be for production code, but the plan should acknowledge external dependencies.

### 8. Simplicity / Over-Engineering Risk — 9/10

The plan is appropriately simple. No unnecessary abstractions, no plugin systems, no feature flags. It is a file inventory with conventions and a cross-reference table. The "Dependency Map for W2" section is useful context without being premature optimization.

The only concern: the plan includes `data-daisyui` and `data-used-by` attributes on components, which are metadata for the design system tooling. This is existing convention, not over-engineering.

### 9. Verifiability — 5/10

This is the weakest dimension. The AC cross-reference table lists verification methods, but they are vague:

| Verification Method | Issue |
|---|---|
| "File existence + browser open" | What constitutes a passing browser check? The file opens? It renders? It matches 03-hearth.html? |
| "Visual inspection" | Who inspects? Against what reference? What's the pass/fail criterion? |
| "File diff" | A diff against what baseline? Any diff is a pass? |
| "Grep check" | This is concrete and good. |
| "Browser check" | Same as "File existence + browser open" — too vague. |
| "Read review" | What makes a read review pass? |

The plan does not specify:
- A failing-test-first ordering (there are no automated tests for HTML mockups, which is acceptable, but the plan should state this explicitly)
- Screenshot comparison methodology (side-by-side with 03-hearth.html? pixelmatch threshold?)
- Who runs `/design-critique` and what score threshold advances the plan
- Whether dark mode must be visually verified for every screen or just component primitives

For a design workpackage, automated testing is limited, but the plan should be more specific about the manual verification protocol.

---

## CRITICAL

None. The plan is fundamentally sound for a design-only workpackage.

---

## WARNING

1. **[plan SS Acceptance Criteria Cross-Reference] Rewritten component count is stale.** The table says "5 files rewritten" but the designer actually rewrote 7 (adding NavItem.html and CommentRow.html). The plan should be updated to reflect the actual deliverables. This creates a gap where the code review (Phase 4) would check against 5 files but 7 changed.

2. **[plan SS Acceptance Criteria Cross-Reference] Missing "reviewed but not rewritten" list.** The AC says "Existing component HTML files (StatusChip, Tag, BetCard, ThreadRow, CommentRow, NavItem, Composer, SearchField, etc.) are reviewed against 03-hearth.html and rewritten where they diverge." The plan does not record which existing components were reviewed and found to already match. Without this, there is no evidence the review happened for StatusChip, Tag, SearchField, etc.

3. **[plan SS Technical Conventions] No accessibility conventions documented.** The plan documents HTML file structure, data attributes, token usage, and density exclusion. It does not document accessibility conventions: ARIA roles for interactive primitives, focus-visible treatment, keyboard navigation patterns. Since these HTML files are the source of truth for W2's TSX implementation, missing accessibility patterns propagate downstream.

4. **[plan SS Acceptance Criteria Cross-Reference] Verification methods are too vague.** Five of the ten verification methods are variations of "visual inspection" or "browser open" without pass/fail criteria. The plan should specify: "Side-by-side visual comparison with 03-hearth.html sections confirms same design family — unmistakable visual kinship in warmth, spacing, typography weight, shadow depth."

---

## SUGGESTION

1. **[plan SS File Inventory] Add a "Unchanged Components" section.** List StatusChip.html, Tag.html, SearchField.html, etc. with a note like "Reviewed against 03-hearth.html — no divergence found, no changes needed." This creates an audit trail.

2. **[plan SS Technical Conventions] Document the CDN dependency.** Note that all HTML files depend on unpkg.com for React/ReactDOM/Babel. If offline viewing is needed, the files need local script copies. This is existing convention from pre-W1 files, but the plan should acknowledge it.

3. **[plan SS Dependency Map for W2] Add component dependency graph.** The 4-step ordering is good but could be strengthened with an explicit graph: Avatar consumed by (ThreadRow, BetCard, CommentRow, bet-detail, etc.), Button consumed by (Composer, EmptyState, ErrorState, etc.). This would help the W2 builder understand cascade impact.

4. **[plan] Add a "Design System Docs" conventions section.** The plan documents conventions for HTML files but not for DESIGN.md and AESTHETICS.md. What format do they use? What sections are required? What's the relationship between DESIGN.md tokens and _tokens.css values? (The designer figured this out, but the plan doesn't capture it.)

---

## What's Working Well

1. **The file inventory is comprehensive and well-structured.** The three-table layout (Foundation Primitives, Rewritten Components, Screen Mockups) with columns for file name, component/screen description, and states/changes makes it easy to verify completeness. The tier annotations (Tier 0, Tier 1-2) are useful.

2. **The "Dependency Map for W2" section is genuinely helpful.** It distills the trickle-up component dependency into a simple 4-step build order. This is exactly the kind of cross-workpackage context that prevents W2's builder from starting at the wrong end and doing rework. The insight that "fixing Avatar's TSX means every component using Avatar inherits correct 36px sizing" is the kind of thing that saves hours.

---

## Verdict

**Score: 7/10 — Good. Acceptable for advancing to W2.**

The plan is appropriate for a design-only workpackage. It correctly identifies all deliverables, documents technical conventions, and provides a useful dependency map for the downstream builder. The main weakness is vague verification methods and a stale component count. These do not block W2 — the design critique (this document's companion) provides the actual quality gate through dimensional scoring.
