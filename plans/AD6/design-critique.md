# AD6 Design Critique: Knowledge Cleanup & Scope Simplification

## Classification Agreement

Routine classification is correct. Existing component family, known layout patterns, simplification work. One variant with alternatives-check is the appropriate process for this scope.

---

## 9-Dimension Rubric Scoring

### 1. Problem Definition (8/10)

The design correctly identifies the core user problems: 7-value scope picker is overwhelming, kind badges are meaningless to humans, dead buttons erode trust, archive does nothing. Each surface is mapped to a specific AC.

Minor gap: AC-4 ("distinction between scope and topic is clear in the UI -- or unified into single tagging model") receives no explicit design treatment. The concept decided "keep separate" and the design silently inherits this -- but the design document should explicitly state how scope vs topic clarity is achieved in the new UI (scope pills filter by visibility, topic groups organize by subject). The designer relies on the concept probe's reasoning without restating it as a design rationale.

### 2. Information Architecture (9/10)

The 4-pill filter (All / Shared / Team / Private) correctly maps the backend model to user mental models. The mapping table (Surface 1) is precise and complete. Bet/task items appearing under "All" only is a sound decision -- they are agent-generated contextual items.

The create flow's 3-pill picker correctly removes bet/task/product/practice from user-facing surfaces while preserving them via ScopeChangeDialog escape hatch.

### 3. Interaction Design (7/10)

Archive flow: Click archive in overflow menu -> API call -> navigate to /knowledge. This is functional but raises one concern:

- **No loading state during archive call.** The user clicks Archive, the overflow menu closes, and then... what happens during the 200-500ms network round-trip? The page content is still showing. If the user clicks something else before navigation fires, they get a jarring redirect mid-action. The design should specify a brief loading indicator or immediate navigation with optimistic state.

The disabled Team pill with "clicking does nothing" is acceptable for v1 but the design originally mentioned a tooltip ("Join a team first") then reversed to "no tooltip required in v1." This inconsistency in the document (mentioning then retracting a tooltip) could confuse the builder.

### 4. States Coverage (8/10)

Good coverage of:
- Empty result after filter
- Loading/error during API fetch
- Archive success (navigate)
- Archive failure (inline error banner)
- Disabled Team pill (visual dimming)

Missing from explicit specification:
- Archive call in-flight state (between menu close and navigation)
- What happens if the user navigates away during the archive call (unmount cleanup)

### 5. Visual Consistency (9/10)

The design correctly specifies reuse of existing patterns: same pill shape/styling, same overflow menu structure, same error banner shape as conflict banner. No new visual primitives introduced. The "border-based, accent-primary on active" pill styling aligns with the existing scope pills in KnowledgeList.

### 6. Accessibility (8/10)

Correctly specifies:
- `role="radiogroup"` with `aria-label="Scope"` for create picker
- `role="radio"` + `aria-checked` for each pill
- `aria-disabled="true"` for Team pill
- Arrow-left/right keyboard navigation for pills
- Escape to close overflow menu

One gap: The list scope pills (Surface 1) have different semantics from the create scope pills (Surface 5). The list pills are toggle-style filters (you can deselect by clicking the same pill again -- click "Shared" then click "Shared" again returns to "All"). The create pills are exclusive radio buttons (must always have one selected). The design does not explicitly call out this difference in interaction model or verify that the list pill group also has `role="radiogroup"`. Looking at current code, the list pills are in a `<fieldset>` with no explicit role -- the design should address whether these should also get `role="radiogroup"` for consistency.

### 7. Edge Cases (8/10)

Well-handled:
- User has no team -> Team pill disabled
- Archive endpoint fails -> error banner with retry
- bet/task items in list -> appear under "All" only
- Product/practice items -> filterable under "Shared"

Noted but not explicitly designed:
- What if ALL items are bet/task scoped? The Shared/Team/Private pills all show empty results but "All" shows content. This is technically correct behavior but could be confusing. Low risk given target audience.

### 8. Component Reuse (9/10)

No new components. All changes compose existing primitives (button pills, overflow menu items, error banner). The "Component impact summary" confirms no new components needed. ScopeChangeDialog preserved as power-user escape hatch -- good decision.

### 9. Spec Fidelity (8/10)

| AC | Coverage |
|---|---|
| AC-1 (3 clear scope choices when creating) | Fully covered: 3-pill segmented control |
| AC-2 (no dead buttons) | Fully covered: Flag removed, Archive wired, Merge/Split already absent |
| AC-3 (archive works end-to-end) | Covered: calls backend, navigates on success, shows error on failure |
| AC-4 (scope vs topic clarity) | Implicitly covered (scope pills filter visibility, topic groups subject) but not explicitly argued |
| AC-5 (kind removed or simplified) | Covered: removed from list rows, removed from create, kept read-only in detail aside |

---

## Findings

### Must-fix (would block score)

None. All findings are advisory.

### Should-fix (improve quality)

1. **Specify archive in-flight state.** Between menu close and navigation, the user needs visual feedback that something is happening. Suggest: disable the overflow trigger button or show a subtle loading indicator in the header area. Without this, slow networks create a dead-interaction gap.

2. **Clarify list pill group semantics.** The list scope pills behave as toggleable filters (click-to-select, click-same-to-deselect-to-All), while create pills are exclusive radio. The design should note this distinction explicitly and specify whether the list pills get `role="radiogroup"` (they should, with "All" as a radio option, not as a deselect state).

### Nice-to-have (non-blocking)

3. **Remove the contradictory tooltip mention.** Surface 5 mentions "tooltip: Join a team first" then says "No tooltip required in v1." Pick one and state it cleanly.

4. **Explicitly address AC-4 in design.** Add a one-liner: "Scope pills filter by visibility (who sees it). Topic groups organize by subject (what it's about). This separation is reinforced by the distinct UI treatment: pills = scope, column headers = topic."

---

## Verdict

**Score: 8/10 -- PASS (advances to build)**

The design is comprehensive for a routine simplification workpackage. It correctly identifies all surfaces, specifies the right interaction patterns, handles major edge cases, and maintains visual consistency. The gaps (archive in-flight state, pill group role semantics) are minor and can be addressed during implementation without requiring a design revision.
