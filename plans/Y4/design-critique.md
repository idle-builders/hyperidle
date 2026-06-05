# Y4 Design Critique: Knowledge Triage Improvements

DESIGN-CRITIQUE: variant=inline-triage-refinement score=8/10  rounds=1  axes: H:8 S:8 T:9 C:8 Co:8 St:9 A:8 AS:9 PP:7

---

## Scoring Breakdown

### 1. Visual Hierarchy (8/10)

The design correctly prioritizes: sidebar badge draws glanceable attention count, attention score pills on triage rows give immediate priority signal, inline action buttons surface on hover to keep the default view clean. The reading order -- badge (global awareness) then sorted list (priority order) then row actions (processing) -- is logical and well-structured.

One concern: the attention score pill (amber for >= 0.7, neutral for >= 0.4, hidden for < 0.4) creates a visual cliff at the 0.4 threshold. Items at 0.39 show no pill at all while items at 0.40 get one. This is a design judgment call, not a defect -- but the reviewer would prefer a two-tier system (show/hide at 0.4) rather than three tiers, since the neutral-background pill at 0.4-0.7 adds visual noise without strongly differentiating from the amber pill.

### 2. Spacing & Density (8/10)

All specified values are on the Hearth 6px grid: `px-[24px]`, `py-[12px]`, `py-[6px]`, `gap-[12px]`, `gap-[6px]`, `gap-[9px]`. The badge dimensions (18px min-width, 18px height) are on-grid. The attention score pill uses `px-[6px] py-[2px]` -- the 2px vertical padding is off-grid per AQ-001, but this falls under the sub-element badge exemption ("Sub-element gaps inside badges (4px) and toggle label stacks (2px) are similarly exempt"). The keyboard hint bar spacing (`px-[24px] py-[6px] gap-[12px]`) is on-grid.

### 3. Typography (9/10)

All specified font sizes are on the Hearth type scale: 9px (badge count -- AQ-004 floor for count badges), 11px (attention score pill, keyboard hints), 12px (existing timestamps/metadata). Font weights 500 and 600 are on-scale. `tabular-nums` specified for numeric displays (badge count, attention score) per AQ-006. `font-mono` for keyboard hints aligns with the existing sidebar search hint pattern.

### 4. Color Usage (8/10)

Colors are all from the token palette: `var(--accent-primary)` for badge background (forest green), `var(--text-on-accent)` for badge text, `var(--accent-secondary)` for high-attention pills (amber), `var(--surface-container)` for neutral pills, `var(--text-secondary)` and `var(--text-tertiary)` for secondary/tertiary text. Focus highlight uses `rgba(44,36,26,0.04)` which matches the existing hover pattern in KnowledgeListRow.

No hardcoded hex values. Color is used for meaning (amber = high attention, green = triage count).

### 5. Component Coherence & Consistency (8/10)

The design correctly avoids creating new design-system primitives. All UI changes compose from existing patterns: the badge follows the same visual grammar as count badges elsewhere (pill shape, small font, accent background). The action buttons on hover follow the existing pattern of revealing actions contextually rather than always showing them.

One note: the `kbd` element styling in the keyboard hint bar (`px-[6px] py-[2px] rounded-[4px]`) uses `rounded-[4px]` which is OFF the Hearth radius scale (the scale is 0/10/16/9999). However, this matches the existing sidebar search hint pattern at Sidebar.tsx line 311, so it is consistent with the codebase even if technically off-scale. The builder should use the same pattern as the existing `kbd` in Sidebar to maintain consistency.

### 6. States & Feedback (9/10)

Thorough state coverage:
- Sidebar badge: 0 items (hidden), 1-99 (number), 100+ ("99+"), loading (hidden), error (hidden).
- Triage tab: empty, loading (skeleton), error, populated-unfocused, populated-focused.
- After action: fade-out with `var(--motion-fast)` (120ms), auto-advance, badge decrement, last-item-processed empty state.
- Row: default, hover (actions reveal), focused (background highlight).
- Action buttons: visible on hover, `var(--text-tertiary)` default, `var(--text-primary)` on hover.

The motion spec (120ms opacity transition) uses the correct `--motion-fast` token per AQ-013.

### 7. Accessibility (8/10)

Keyboard navigation fully specified: j/k for movement, v/x for actions, Enter/o for open, Escape for clear focus. Input/textarea guard prevents conflicts with the search bar. The `data-testid` on the badge enables testing.

Two items to note for implementation:
- The keyboard shortcut handler must not interfere with screen readers. The design does not specify `aria-label` for the action buttons (validate, reject, open) -- the builder must add these.
- The `focusedIndex` visual highlight (`bg-[rgba(44,36,26,0.04)]`) is a subtle background change. Ensure sufficient contrast for low-vision users. Consider adding `aria-activedescendant` on the list container pointing to the focused row's id for screen reader support.

### 8. Anti-Slop Check (9/10)

No AI aesthetic tells detected:
- No purple/indigo gradients.
- No oversized padding.
- No hero sections.
- No `rounded-3xl`.
- No glass morphism.
- No centered body content (badge is inline, rows are left-aligned).
- No emoji iconography.
- Keyboard shortcuts match established patterns (Gmail, Linear) -- not invented for novelty.

The design is utilitarian and purpose-built. The "inbox triage" metaphor is a proven pattern, not a generic dashboard.

### 9. Premium Polish (7/10)

`tabular-nums` specified on count badge and attention score pill -- good. Motion uses `--motion-fast` token -- good. Touch targets: the design spec says action buttons are 24px on desktop, "exempt from 44px per AQ-015 -- these are visible on hover only on desktop." This is acceptable per the desktop exemption, but the design does not address what happens on mobile/tablet where hover is not available. The spec says action buttons are "always visible (mobile)" -- ensure these get 44px touch targets at viewport <= 1024px.

Missing: no `prefers-reduced-motion` consideration specified for the fade-out animation. The builder must honor AQ-014.

---

## Findings

### WARNING

1. **Off-scale radius on kbd elements.** The keyboard hint bar specifies `rounded-[4px]` for `<kbd>` elements. This is off the Hearth radius scale (0/10/16/9999). However, it matches the existing pattern in `Sidebar.tsx` line 311. The builder should replicate the Sidebar pattern exactly rather than introducing a different radius. Not a blocker because the pattern already exists in production code.

2. **Mobile touch targets for action buttons.** The design specifies 24px action buttons on desktop and "always visible (mobile)" but does not specify the touch target size at viewport <= 1024px. Per AQ-015, these must be >= 44px. The builder must ensure mobile action buttons meet this threshold.

3. **Focus management for screen readers.** The keyboard navigation design does not specify `aria-activedescendant` or `role="listbox"` for the triage list with keyboard focus. The builder should add `role="listbox"` to the triage list container and `role="option"` to each row, with `aria-activedescendant` pointing to the focused row's id. This is important for screen reader users to understand which item is "focused" via keyboard shortcuts.

4. **`prefers-reduced-motion` not addressed.** The fade-out animation on item removal (120ms opacity) should be disabled or reduced under `prefers-reduced-motion: reduce`. Per AQ-014.

### SUGGESTION

1. **Simplify attention score pill to two tiers.** The three-tier system (>= 0.7 amber, >= 0.4 neutral, < 0.4 hidden) could be simplified to two tiers (>= 0.4 shown, < 0.4 hidden) with amber for all shown pills. The neutral-background pill at 0.4-0.7 range adds visual noise without strongly communicating priority. However, this is a judgment call and the three-tier approach is defensible.

2. **Badge count staleness.** The design acknowledges the triage count badge updates only on focus-based revalidation (Option 2 in section 4.9). This means after validating/rejecting items, the badge count stays stale until the user navigates away and back. Consider passing a refetch callback from AppShell to KnowledgeList via outlet context, or using optimistic decrement in AppShell state. The "stale badge" experience could confuse users who just processed items.

---

## What's Working Well

1. **Email inbox metaphor is well-chosen.** Badge shows count, items sorted by priority, processing one surfaces the next. This is a proven pattern that users will immediately understand. No learning curve.

2. **Zero new primitives.** The design stays entirely within existing component patterns. Badge is a span in SectionHeader, action buttons are inline in existing rows, keyboard hints reuse the existing `<kbd>` styling from Sidebar. This is disciplined restraint.

---

## Verdict

Score 8/10. The design advances. All ACs are addressed with clear implementation paths. Findings are implementation-level concerns (accessibility attributes, mobile touch targets, motion preference) that the builder can resolve without design changes. No structural issues, no AI slop, no token violations.
