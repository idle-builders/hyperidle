---
name: design-review
description: "Read-only UI/UX design review. Run by the designer agent."
argument-hint: "[file paths or story-id]"
user-invocable: true
min_tool_calls: 12
---

# Design Review

Read-only review. Produce findings — do NOT make code changes.

## Required reading (do ALL before reviewing code)

1. `packages/design-system/DESIGN.md` — Token reference: surfaces, text, borders, radii, spacing, typography, motion
2. `packages/design-system/PRINCIPLES.md` — Design principles and anti-patterns
3. `docs/UI_DESIGN.md` — Component specs, component budget, building order
4. `docs/HUMAN_INTERFACE_LAYER.md` — Page layouts, interaction patterns, routing rules, keyboard shortcuts
5. `docs/INFORMATION_ARCHITECTURE.md` — Information hierarchy, content organization
6. The relevant track file in `docs/work-packages/TRACK-*.md` for the story being reviewed

Then read the changed UI files (via `<target>` or `git diff --name-only`).

## Be thorough

Check every component against its spec in UI_DESIGN.md. If the spec says 4 columns, count the columns. If it specifies motion values (80/150/250ms), check the CSS transitions. If it says "Lucid theme", verify the DaisyUI classes match. Don't assume correctness — verify it.

For accessibility: don't just check that aria attributes exist — check they're correct and meaningful. Tab through the focus order mentally. Check that keyboard shortcuts don't conflict with browser/screen reader shortcuts. Verify focus trapping in modals.

## Review for:
- **Component budget** — are only the 19 approved custom components used? Any additions need a written reason.
- **Component reuse** — is existing design system code used where it should be? Inline reimplementations of StatusChip, Tag, KeyValue, EmptyState, ErrorState, Skeleton etc. are failures. Read `packages/design-system/src/` to know what exists.
- **Consistency** — same visual role = same treatment everywhere. Compare borders, spacing, radii, typography, hover states across sibling components. Divergence between pages that serve the same purpose is a finding.
- **Token compliance** — no hardcoded colors, spacing, radii, or font sizes. No raw Tailwind color classes. Everything traces to design tokens.
- **States** — are ALL states handled (empty, loading, error, populated)? Check each page component.
- **Accessibility** — focus management, aria labels, keyboard navigation, focus traps, roving tabindex
- **Design system** — does a `.stories.tsx` file exist? Do classes match Lucid theme tokens?
- **Layout** — does the page layout match the spec (IconRail | Submenu | Main | Rail)? No extra columns.
- **AI aesthetic violations** — oversized padding, purple gradients, hero sections, decorative icons
- **Information density** — 8-12px padding, tight spacing, precision instrument aesthetic
- **Motion** — transitions match spec values (80/150/250ms), no instant snaps for state changes

## Visual verification

Look at pixels, not code. Run `cd packages/web && bun run visual:compare <reference-name>` to generate pixel diffs against the reference mockups in `docs/design-references/`. Read the reference.png, implementation.png, and diff.png. Compare against `docs/UI_DESIGN.md`. Check truncation, contrast, alignment, spacing, all states. Include screenshot paths and match percentages in findings.

If the dev server is not running or Playwright is not installed, that is a CRITICAL finding.

## Output

Structured findings: CRITICAL / WARNINGS / OBSERVATIONS with file paths, line numbers, spec reference, and screenshot evidence for visual issues.

## Target

$ARGUMENTS
