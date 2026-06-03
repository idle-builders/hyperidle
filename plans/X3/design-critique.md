# X3 Design Critique — Agent Configuration (Inline Table)

DESIGN-CRITIQUE: variant=inline-table score=8/10  rounds=1  axes: H:8 S:8 T:8 C:8 Co:9 St:8 A:7 AS:9 PP:7

## Scores by Dimension

### 1. Visual Hierarchy — 8/10

The mockup shows a clear reading order: section title "Agents" at 15px semibold, then the table with agent names as the primary scan column (leftmost, natural language, full weight), role badges as secondary (monospace, ghost style, visually recessed), and metadata columns (harness, model tier, sessions) as tertiary in `--text-secondary`. The edit form clearly subordinates to the table row above it, with labels in 12px `--text-secondary` and field values in 13px `--text-primary`. The "Editing" indicator in accent green is a good touch — it provides a clear visual link between the row and its expanded form.

One weakness: the Actions column (Edit/Delete) floats right-aligned without a column header, which is correct (no label needed for action columns), but the two buttons are stacked vertically in the same cell. This works but creates a taller row height than OrgChart's single Delete button. Acceptable trade-off for this admin surface.

### 2. Spacing & Density — 8/10

The mockup uses 8px cell padding, 12px form padding, 12px gap between form fields — all on or near the 6px grid. The section gap of 12px between the heading and content matches other Settings sections. The form uses `gap: 12px` between rows, which maps to `--space-4`. The `min-w-[120px]` on form fields is appropriate for preventing select elements from becoming unreadably narrow.

The soul prompt textarea at 8 rows is appropriately sized — large enough to see context, small enough to not dominate the page. The `resize: vertical` spec is correct.

### 3. Typography — 8/10

Font usage is correct: system sans for all UI chrome, monospace for role badges, harness types, and the soul prompt textarea. The type scale is on-scale: 15px section heading, 13px table body text, 12px form labels, 12px table headers (uppercase with `0.06em` tracking per `--tracking-caps-sm`). Font weights stay within the allowed set (400 body, 500 labels, 600 heading, 600 "Editing" indicator).

The mockup correctly shows uppercase table headers in `--text-tertiary` with letter-spacing, matching the Hearth signature for section headers.

### 4. Color Usage — 8/10

All colors trace to Hearth tokens: `--text-primary` for names, `--text-secondary` for metadata, `--text-tertiary` for table headers, `--accent-primary` for the "Editing" indicator and Save button, `--border-subtle` for the edit form container, `--surface-elevated` for the edit form background, error color for Delete button. The row highlight on the editing row uses `rgba(44,36,26,0.02)` — warm-tinted, matching the AQ-010 flat-list hover tint.

No decorative color. Color is reserved for meaning (green = active edit, red = destructive action). Role badges use `--surface-container` background — neutral, not colorful. Correct.

### 5. Component Coherence & Consistency — 9/10

This is the strongest dimension. The design explicitly reuses every pattern from SettingsOrgChart:
- Same `table table-xs w-full` structure
- Same skeleton loading pattern (2x `skeleton h-8 w-full`)
- Same error text pattern (`text-sm text-error`)
- Same empty state pattern (`text-sm text-[var(--text-tertiary)]`)
- Same inline form container (`border border-[var(--border-subtle)] rounded-[var(--r-subtle)] p-3`)
- Same button patterns (ghost for Cancel/Add, primary for Save)
- Same toast feedback via `showToast`
- Zero new custom components, zero component budget impact

The Add Agent button matches OrgChart's "+ Add Edge" button exactly (`btn btn-ghost btn-sm self-start`). The save spinner matches Profile's save pattern. The section heading matches all other SettingsPage sections.

### 6. States & Feedback — 8/10

All required states are specified: loading (skeleton rows), error (text-sm text-error), empty ("No agents configured."), populated (table), edit mode (inline form), add mode (bottom form), save-in-flight (spinner on disabled button), delete confirmation (two-click with 3s timeout revert).

The delete confirmation (text changes to "Confirm?" with a second click required) is a thoughtful choice — avoids a modal for a low-frequency action while preventing accidental deletion. The 3-second timeout revert prevents a stuck "Confirm?" state.

The template pre-fill behavior on role change is well-specified: fetch, replace if empty/unchanged, show "Use template" button if user has edited. This handles the main UX edge case (user types custom prompt, then changes role — prompt is not lost).

### 7. Accessibility — 7/10

The spec covers keyboard navigation (Tab through rows, Enter to open/submit, Escape to close), focus management (focus Name input on form open, return focus on close), and semantic elements (table, form controls, buttons). Form labels use `<label>` with `label-text` spans.

Findings:
- No explicit `aria-label` specification on the Edit/Delete buttons. These need `aria-label` since the button text alone ("Edit", "Delete") is ambiguous without the agent name context. OrgChart has `aria-label={`Delete edge ${edge.id}`}` — the X3 design should specify the same pattern.
- No specification of `aria-expanded` on the Edit button when the form is open.
- Table header cells should have `scope="col"` for screen readers.
- The delete confirmation state change (button text "Delete" to "Confirm?") should be announced to screen readers via `aria-live="polite"` on the button container or a status region.

### 8. Anti-Slop Check — 9/10

The design is distinctly not AI-generic. No purple gradients, no centered empty states (AQ-008 compliance: left-aligned), no oversized padding, no emoji icons, no hero section, no glass morphism, no gradient-on-text. The role badges use pill shape with `--surface-container` background — subtle, not decorative. The monospace soul prompt textarea is a distinctive touch that communicates "this is a technical config surface."

The mockup uses realistic content (actual soul prompt text from the product-manager template, real agent names). No Lorem ipsum. AQ-009 compliance confirmed.

### 9. Premium Polish — 7/10

The Sessions column uses monospace numerals, which is correct for numeric alignment (AQ-006 adjacent). The uppercase table headers with tracking are on-brand. The Save button uses pill shape (AQ-005). The edit form border uses `--r-subtle` (10px), correct for an inner container.

Findings:
- The mockup does not specify `font-variant-numeric: tabular-nums` on the Sessions column — the architecture spec should ensure this in implementation. The column is centered, so jitter is less visible, but tabular numerals are still the correct treatment.
- No hover state specified for table rows. OrgChart does not have row hover either, so this is consistent, but a subtle `rgba(44,36,26,0.02)` hover tint would improve scannability for 6+ rows. This is a SUGGESTION, not a requirement, since it matches the reference.
- The form inputs in the mockup use `--r-subtle` (10px) radius. Inputs should use `--r-default` (16px) per DESIGN.md ("Cards, modals, inputs, toast use --r-default"). The mockup shows 10px radius on inputs — this is a deviation from the token spec.

---

## Findings

### CRITICAL

None.

### WARNING

- [approved.md:23-24] **Edit form container radius mismatch.** The spec uses `rounded-[var(--r-subtle)]` (10px) for the edit form container, which is correct for an inner container. However, the input/select elements within the form should use DaisyUI's default input styling, which already handles radii via `input-bordered`. The mockup HTML overrides input radii to `--r-subtle` (10px), but DESIGN.md states inputs use `--r-default` (16px). The TSX implementation should use DaisyUI `input input-sm input-bordered` without custom radius overrides, letting DaisyUI handle it. This is a mockup HTML detail, not a spec issue — the approved.md correctly specifies DaisyUI classes.

- [approved.md:107-109] **Missing aria-labels on action buttons.** The keyboard section specifies Tab and Enter behavior but the component mapping table does not specify `aria-label` attributes for Edit and Delete buttons. Each Edit button needs `aria-label={`Edit ${agent.name}`}` and each Delete button needs `aria-label={`Delete ${agent.name}`}`. The OrgChart reference implementation includes this pattern.

### SUGGESTION

- [approved.md:137-138] **Mobile horizontal scroll is acceptable but could note the touch-target concern.** At viewport <= 768px, the Edit/Delete buttons stack vertically in a narrow cell. The stacked buttons may fall below the 44px touch target minimum (AQ-015) depending on implementation. The builder should verify touch targets on the action buttons at mobile viewport.

- [inline-table/spec.md:81-82] **Template fetch endpoint path inconsistency.** The spec references `GET /api/soul-prompt-templates/:role` but the architecture plan uses `GET /api/agents/templates/:role`. The architecture plan's path is better (groups under `/api/agents`). The design spec should defer to the architecture plan — this is a documentation inconsistency, not a design issue. Mark as resolved by architecture.

- [approved.md:79] **Row highlight color is bare rgba, not a token.** The editing row highlight `bg-[rgba(44,36,26,0.02)]` uses a hardcoded rgba value. This matches the AQ-010 hover tint and is the same pattern used elsewhere in the codebase, but ideally it would reference a token. Since this value IS the de facto Hearth standard for flat-list hover/selection tint and is used identically in OrgChart's mockup patterns, it is acceptable as-is. No change needed.

---

## What's Working Well

1. **Pattern reuse is exemplary.** The design demonstrates genuine understanding of the existing Settings vocabulary by reusing OrgChart's exact interaction grammar (table + inline form + add button) and Profile's feedback patterns (dirty tracking + toast). This is the correct way to extend a settled interaction surface — no invention where convention exists.

2. **Template pre-fill behavior is thoughtfully specified.** The three-way logic (empty = auto-fill, unchanged template = auto-fill, user-edited = show "Use template" prompt) handles the most common UX edge case without being over-engineered. Many designs would either always overwrite (losing user edits) or never overwrite (making templates useless).

3. **Delete confirmation without a modal.** The two-click-with-timeout pattern is elegant for a low-frequency admin action. It avoids the interaction weight of a modal while preventing accidental deletion. The 3-second revert prevents stuck state. This is a genuine design decision, not the "safe default."

---

## Verdict

Score 8/10 — advances. The design is a well-executed routine variant that faithfully extends the established Settings patterns. The warnings are implementation-level details (aria-labels, input radii) that the builder can address during implementation. No structural issues. No design rework needed.
