# T2 Design Critique -- Knowledge WYSIWYG Editing

**Classification:** Routine UI (1 variant)
**Reviewer:** Phase 2 critique agent
**Artifact:** `plans/T2/design/approved.md`

---

## 9-Dimension Rubric

### 1. Hierarchy (9/10)

The design correctly identifies the primary surface (BodyEditor replacing textarea), the secondary affordance (Edit/Done buttons), and the tertiary feedback (save indicator, conflict banner). The visual layout diagram (Section 1, lines 38-58) communicates the information hierarchy clearly: title and action at top, editor filling the main content area, status feedback below, discussion and sidebar unchanged.

Minor deduction: the "Done" button placement is described but not visually distinguished from "Edit" in terms of weight. Both use `btn btn-xs btn-ghost`. Given that "Done" exits an active editing session, it could arguably carry slightly more visual weight. However, for routine integration work this is appropriate -- the auto-save model means "Done" is not a high-stakes action.

### 2. Spacing & Density (8/10)

The design specifies `minHeight="200px"` for the editor (on-grid: 200 = 50 * 4px), `minHeight="128px"` for the create dialog (128 = 32 * 4px). The save indicator uses `text-xs` (on-scale). The conflict banner uses `px-3 py-2` -- 12px horizontal, 8px vertical -- both multiples of 4px and consistent with AQ-001.

The `gap-2` (8px) in the edit panel container is consistent with the existing page layout. No off-grid values detected.

### 3. Typography (9/10)

Save indicator: `text-xs text-[var(--text-lo)]` -- correct token usage, on-scale size. Conflict banner: `text-xs text-[var(--text-mid)]` -- appropriate for informational content. No hardcoded font sizes, no off-scale values. The design correctly avoids adding any new type treatment, reusing existing scale values throughout.

### 4. Color & Dark Mode (9/10)

All colors use semantic tokens: `var(--text-lo)`, `var(--text-mid)`, `var(--danger)`, `var(--surface-4)`, `var(--border-subtle)`. No hardcoded hex values, no raw Tailwind palette. The conflict banner uses `var(--surface-4)` (neutral, not danger) which is a correct semantic choice -- conflicts are informational, not destructive. The "Save failed" error uses `var(--danger)` which is correct per the Lucid system (red-only danger).

### 5. Coherence (9/10)

The design maintains consistency with existing patterns:
- Conflict banner follows the same pattern as `factory-amendable-banner` (line 286-292 in KnowledgeDetail.tsx, verified). Both use `role="alert"` and inline placement.
- Button styles (`btn btn-xs btn-ghost`, `btn btn-xs btn-primary`) match existing usage throughout the page.
- The `data-testid` naming convention (`conflict-banner`, `save-indicator`, `knowledge-edit-panel`) follows the established pattern.
- The create dialog integration (Section 4) preserves the existing dialog structure and simply swaps the textarea for BodyEditor.

### 6. States (8/10)

The design covers the critical states:
- **Default:** Read mode with KnowledgeBody rendering
- **Editing:** BodyEditor active with save indicator
- **Saving:** "Saving..." text
- **Saved:** "Saved" text with fade-out
- **Error:** "Save failed" in danger color
- **Conflict:** Banner with Reload action
- **Empty body:** Placeholder text (delegates to T1's placeholder extension)
- **Factory items:** Edit button hidden, read-only (unchanged guard)
- **Very long content:** Editor grows with content, page scrolls

Missing state consideration: what happens when the user clicks "Done" while a save is in-flight? The design does not specify whether "Done" should be disabled during saving, or whether exiting edit mode cancels a pending save. This is an edge case the builder will need to decide -- the design should have stated the behavior explicitly. Minor deduction.

The disabled/submitting state in the create dialog is covered (`editable={!submitting}`).

### 7. Accessibility (9/10)

Strong a11y coverage:
- Edit/Done buttons are keyboard-accessible native `<button>` elements
- Conflict banner has `role="alert"` for screen reader announcement
- Save indicator has `aria-live="polite"` for non-interrupting status updates
- BodyEditor inherits TipTap/ProseMirror keyboard support
- Clear mode signaling via button labels ("Edit" / "Done")

The "Did We Consider" table (Section 6) explicitly addresses the a11y advantage of keeping the Edit button over click-to-edit: "Screen readers get clear mode signaling."

### 8. Anti-Slop (10/10)

No AI aesthetic tells. The design is minimal and specific:
- No gratuitous icons or emoji
- No marketing language
- No rounded-2xl, no gradients, no oversized padding
- No hero sections or decorative elements
- The conflict banner is plain, functional, inline
- The save indicator is text-only, no icon

### 9. Premium Polish (8/10)

The "Saved" fade-out using `var(--motion-medium)` is a nice touch that prevents stale status text. The design correctly identifies that toasts would be too noisy for auto-save and places the indicator below the editor (close to the content being edited).

Minor gap: the design does not specify whether the BodyEditor should have any visual transition when entering/exiting edit mode (e.g., a subtle border change or background shift to signal mode). The current textarea has no such transition either, so this is consistent, but a polish opportunity was missed.

---

## Cross-Cutting Observations

**Design decision: Edit button vs click-to-edit.** The design makes a well-reasoned decision to keep the Edit button (Section 1, lines 20-34). The four arguments (scope control, factory guard, test compatibility, a11y clarity) are all valid. The concept doc's recommendation of "no explicit Edit button needed" is a design preference, not a hard requirement. The design correctly identifies that implementing click-to-edit would expand scope. This is a sound judgment call.

**Design decision: Reload-only conflict resolution.** The design correctly scopes conflict handling to "Reload" for v1 (Section 3, lines 113-118). The rationale (single-user desktop app, conflicts are rare, merge UI is overengineered) is appropriate. The concept doc does not specify merge behavior.

**Spec alignment check against T2 acceptance criteria (TRACK-T.md lines 67-88):**
- AC: "KnowledgeDetail uses BodyEditor instead of textarea + preview split" -- covered (Section 1)
- AC: "KnowledgeCreateDialog uses BodyEditor instead of plain textarea" -- covered (Section 4)
- AC: "Knowledge body auto-saves via PATCH /api/knowledge/:id with version field" -- covered (Section 2)
- AC: "On version conflict (409), inline conflict banner appears" -- covered (Section 3)
- AC: "Saving indicator ('Saving...' / 'Saved') appears near the editor" -- covered (Section 2)
- AC: "Factory-scoped items remain read-only" -- covered (Section 5, edge cases)
- AC: "Read mode continues using deriveBlocks()" -- covered (Section 1, line 29; Section 6, row 7)

All seven ACs have corresponding design coverage.

**Spec tension:** The T2 spec says "the edit/read boundary is the click-in / click-out behavior" (line 88). The design keeps an explicit Edit button instead. The design brief explicitly addresses this tension (Section 1, lines 20-34) with valid rationale. The spec's "click-in / click-out" was aspirational language from the concept doc, not a hard constraint -- the ACs themselves say "uses BodyEditor instead of textarea" not "implements click-to-edit."

---

## Aggregate Score: 8.8 / 10

**Verdict: PASS** (threshold >= 7)

The design is thorough, well-reasoned, and makes appropriate scope decisions for routine integration work. The edit-mode transition, auto-save indicator, conflict banner, and create dialog integration are all clearly specified with concrete implementation details. Edge cases are covered. Accessibility is addressed. The design stays within the component budget (no new components) and reuses existing patterns.

The two areas where the design could improve for future reference: (1) specify the behavior when "Done" is clicked during an in-flight save, and (2) consider a subtle visual mode transition between read and edit states. Neither of these block implementation.
