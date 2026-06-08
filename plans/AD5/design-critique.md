# AD5 — Design Critique

DESIGN-CRITIQUE: variant=approved score=8/10  rounds=1  axes: H:8 S:9 T:9 C:9 Co:9 St:8 A:7 AS:9 PP:7

## Classification: Routine

AD5 is a wiring workpackage. The design doc covers four UI changes: (1) a new sidebar badge replicating the existing Y4 Knowledge triage badge pattern, (2) notification settings wiring with no visual change, (3) cost backend fix with no visual change, (4) bet button removal (pure deletion). No novel component. No HTML mockup exists or is needed -- the changes are pattern replication and deletion.

The "routine" classification is correct and properly justified.

---

## Dimension Scores

### 1. Visual Hierarchy: 8/10

The conversations blocking badge correctly inherits the Y4 pattern: secondary importance (right-aligned via `ml-auto`), subordinate to the section header label. The badge does not compete for primary attention. This is consistent with the Knowledge triage badge -- same visual weight, same position.

The bet button removal improves hierarchy by eliminating non-functional affordances that currently mislead users about available actions.

No issues.

### 2. Spacing & Density: 9/10

The badge uses `min-w-[18px] h-[18px]` (on Hearth 6px grid: 18 = 3x6). The `mr-[12px]` margin and `ml-auto` alignment exactly match the Knowledge triage badge. The flex wrapper `flex items-center` is identical to the Knowledge section. All spacing values are on the Hearth 6px grid.

No issues.

### 3. Typography: 9/10

Badge uses `text-[9px]` (AQ-004 allowlist floor: 9px for numeric count badges only) with `font-[600]` (within the 400/500/600/700 scale) and `tabular-nums` (AQ-006 compliance). All values match the established badge at Sidebar.tsx line 294.

No issues.

### 4. Color Usage: 9/10

Badge uses `bg-[var(--accent-primary)]` and `text-[var(--text-on-accent)]` -- semantic tokens only, no hardcoded colors. Matches the Knowledge triage badge exactly.

No issues.

### 5. Component Coherence & Consistency: 9/10

The design explicitly rejects creating a new Badge component, citing that two instances (Knowledge + Conversations) do not justify extraction. This is the right call -- inline markup with identical styling is simpler than premature component extraction. The "Rejected Directions" table documents this decision well.

The `ConsequencePreviewDialog` narrowing from `"pause" | "kill"` to `"kill"` only is a correct simplification that removes a dead branch.

The notification settings wiring integrates with the existing `useSettings` hook rather than creating a new persistence mechanism. Reuse over reinvention.

No issues.

### 6. States & Feedback: 8/10

Badge states are well-specified: count=0 (hidden), count 1-99 (numeric), count >99 ("99+"), loading (hidden, defaults to 0), error (hidden, defaults to 0). This matches the Y4 pattern.

Notification settings persistence specifies optimistic UI with rollback on failure -- good pattern.

**WARNING:** The design specifies notification toggle save failure reverts the toggle, but does not specify any visual error feedback (toast, inline error message). The user would see the toggle flick back silently with no explanation of why the save failed.

### 7. Accessibility: 7/10

**WARNING:** The badge `<span>` has no `aria-label`. Sighted users see a number; screen reader users get a raw number with no context. The Knowledge triage badge has the same issue -- this is a pre-existing accessibility gap being replicated, not introduced. However, the design should specify `aria-label={`${count} conversations need review`}` or similar to improve on the existing pattern.

The badge uses semantic markup (`<span>` with `data-testid`), which is acceptable for a non-interactive indicator. It is not a button or link, so no keyboard interaction is needed.

The bet button removal correctly removes non-functional affordances. The remaining Kill button and Adjust appetite button are unchanged.

### 8. Anti-Slop Check: 9/10

No AI-aesthetic anti-patterns present. The design is a minimal pattern replication, not a creative exploration. The "Rejected Directions" table shows thoughtful dismissal of over-engineering (animated badge, color-coded badges, new component, keep-as-disabled). The language is direct and functional.

No issues.

### 9. Premium Polish: 7/10

Tabular numerals are specified (`tabular-nums`) -- AQ-006 compliance. The badge size and positioning match the existing pattern pixel-for-pixel.

**SUGGESTION:** The design does not specify whether the badge pill should animate on count change (fade-in on first appearance vs. static render). Given AQ-013/AQ-014 constraints (motion tokens, prefers-reduced-motion), this is likely correct as-is (the "Rejected Directions" table explicitly rejects animation: "Zero motion budget for persistent navigation elements"). This is well-reasoned.

**WARNING:** No specification for what happens when the conversations section is active vs. inactive. The Knowledge badge is visible regardless of which section is active -- the design should explicitly state that the Conversations badge behaves the same way (always visible in the sidebar, not hidden when another section is active). Looking at the Sidebar code (line 290), the Knowledge badge is outside the `activeView === "knowledge"` conditional, so it is always visible. The design's Sidebar Layout Change section shows the badge inside the Conversations `mb-[18px]` div but outside the thread list conditional -- this is correct and consistent.

---

## Findings

### CRITICAL

None.

### WARNING

1. **[design/approved.md:107-108] Notification save failure has no user feedback.** The design specifies "On save failure, the toggle reverts to previous state (optimistic UI with rollback)" but does not specify any visual feedback (toast, inline error). The user sees the toggle silently revert. The builder should add a toast notification on save failure using the existing toast infrastructure. This is a behavioral specification gap, not a visual design issue.

2. **[design/approved.md:33-39] Badge has no aria-label.** The badge `<span>` renders a raw number with no semantic context for screen readers. Add `aria-label={`${count} blocking conversations`}` to the badge element. The same gap exists on the Knowledge triage badge -- this would be an improvement over the replicated pattern.

### SUGGESTION

1. **[design/approved.md:125-126] "email-digests" toggle client-only status unclear to user.** The design correctly keeps `email-digests` local-only, but the user has no indication that toggling this preference does not persist. Consider adding a subtle indicator or disabling the toggle with a tooltip. Low priority -- the toggle is off by default and the feature does not exist, so the user impact is minimal.

2. **[design/approved.md:59] Data source comment says `conversationsThreads.threads` but should clarify filtering semantics.** The `hasUnresolvedReview` field on threads is the blocking signal. The design should note that this counts review-type blocking (not all types of blocking). This is documentation precision, not a functional issue.

### What's Working Well

1. **Pattern replication over invention.** The design correctly identifies the Y4 Knowledge badge as the pattern to replicate and specifies exact pixel-level consistency. No novel component, no new design system entry, no creative divergence.

2. **Rejected Directions table.** Every considered alternative is documented with a clear rejection reason. This is high-quality design decision documentation that prevents re-litigation by the builder.

---

## Verdict

Score 8/10 -- advances to architecture. The two WARNING items (save failure feedback, aria-label) are real but minor: the first is a behavioral gap the builder can address with existing toast infrastructure; the second is a pre-existing accessibility gap being replicated rather than introduced. Neither warrants blocking the design.
