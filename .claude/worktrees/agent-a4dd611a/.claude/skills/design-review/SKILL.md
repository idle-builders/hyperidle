---
name: design-review
description: "Read-only UI/UX design review. Run by the designer agent."
argument-hint: "[file paths or story-id]"
user-invocable: true
---

# Design Review

Read-only review. Produce findings — do NOT make code changes.

Read `docs/UI_DESIGN.md`, `docs/HUMAN_INTERFACE_LAYER.md`, and the changed UI files (via `$ARGUMENTS` or `git diff --name-only`).

Review for:
- **Component budget** — are only the 19 approved custom components used?
- **States** — are all states handled (empty, loading, error, populated)?
- **Accessibility** — focus management, aria labels, keyboard navigation
- **Design system** — does a `.stories.tsx` file exist? Verify stories render at `/designsystem`
- **AI aesthetic violations** — oversized padding, purple gradients, hero sections, decorative icons
- **Information density** — 8-12px padding, tight spacing, Bloomberg not Dribbble

Output structured findings: CRITICAL / WARNINGS / OBSERVATIONS with file paths and line numbers.
