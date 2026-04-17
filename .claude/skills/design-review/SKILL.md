---
name: design-review
description: "Read-only UI/UX design review. Run by the designer agent."
argument-hint: "[file paths or story-id]"
user-invocable: true
---

# Design Review

Read-only review. Produce findings — do NOT make code changes.

## Required reading (do ALL before reviewing code)

1. `docs/UI_DESIGN.md` — component specs, design tokens, surface colors, motion values, component budget
2. `docs/HUMAN_INTERFACE_LAYER.md` — page layouts, interaction patterns, routing rules, keyboard shortcuts
3. `docs/INFORMATION_ARCHITECTURE.md` — information hierarchy, content organization
4. The relevant track file in `docs/work-packages/TRACK-*.md` for the story being reviewed

Then read ALL changed UI files (via `$ARGUMENTS` or `git diff --name-only`).

## Be thorough

Check every component against its spec in UI_DESIGN.md. If the spec says 4 columns, count the columns. If it specifies motion values (120/200/320ms), check the CSS transitions. If it says "factory-dark theme", verify the DaisyUI classes match. Don't assume correctness — verify it.

For accessibility: don't just check that aria attributes exist — check they're correct and meaningful. Tab through the focus order mentally. Check that keyboard shortcuts don't conflict with browser/screen reader shortcuts. Verify focus trapping in modals.

## Review for:
- **Component budget** — are only the 19 approved custom components used? Any additions need a written reason.
- **States** — are ALL states handled (empty, loading, error, populated)? Check each page component.
- **Accessibility** — focus management, aria labels, keyboard navigation, focus traps, roving tabindex
- **Design system** — does a `.stories.tsx` file exist? Do classes match factory-dark theme tokens?
- **Layout** — does the page layout match the spec (IconRail | Submenu | Main | Rail)? No extra columns.
- **AI aesthetic violations** — oversized padding, purple gradients, hero sections, decorative icons
- **Information density** — 8-12px padding, tight spacing, Bloomberg not Dribbble
- **Motion** — transitions match spec values (120/200/320ms), no instant snaps for state changes

Output structured findings: CRITICAL / WARNINGS / OBSERVATIONS with file paths, line numbers, AND the spec reference (doc + section) for each finding.
