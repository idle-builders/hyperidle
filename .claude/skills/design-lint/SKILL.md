---
name: design-lint
description: "Read-only design lint pass. Runs eslint-plugin-design (K6) for the regex/AST-detectable violations and adds higher-level cross-component checks the AST cannot do. Output mirrors slop-scan."
argument-hint: "[file paths or 'all' for the full design-system + web/src tree]"
user-invocable: true
---

# Design Lint

Read-only scan. Produce findings — do NOT make code changes.

## Required reading

1. `packages/design-system/AESTHETICS.md` — recommendations tables are the source of every rule value.
2. `.claude/rules/aesthetic-quality.md` — hard rule IDs (AQ-001..AQ-113) that map 1:1 to the K6 ESLint slugs.
3. `packages/design-system/src/tokens.css` — radius / spacing / type scales.

## What this skill runs

1. **`bun run lint:design`** — invokes the ESLint plugin against
   `packages/web/src/**/*.tsx` and `packages/design-system/src/**/*.tsx`. The
   plugin owns the regex/AST-detectable rules:
   - `design/no-hardcoded-color` (AQ-008/AQ-009)
   - `design/no-off-grid-spacing` (AQ-001/AQ-002)
   - `design/no-off-scale-radius` (AQ-011)
   - `design/no-off-scale-font-size` (AQ-004)
   - `design/no-ai-aesthetic` (AQ-101/AQ-102/AQ-107/AQ-012/AQ-111)
   - `design/no-raw-tailwind-color` (AQ-008)
   - `design/require-ds-attribute` (K2 marker contract)
   - `design/require-stories-sibling` (design-system contract)
   - `design/require-focus-on-interactive` (AQ-015 / WCAG 2.1.1)

2. **Higher-level checks the AST cannot easily do.** Read each changed
   component file and apply judgment:
   - **Same role, same treatment.** If two list-row components (e.g. `BetCard`
     and `PitchCard`) play the same role on the page, do they share spacing,
     density, and accent treatment? Inconsistent role → inconsistent
     treatment is a finding even when both files individually pass the AST
     rules.
   - **Hierarchy clarity.** Does the page expose a single primary element
     (one heading, one CTA, one accent), or does every row claim equal
     weight? Visual flatness is a finding.
   - **Empty states.** Every list / table / panel must define an explicit
     empty state. If a component renders a list but has no `<EmptyState>`
     branch, flag it.
   - **Error states.** Same as empty states for failure paths.
   - **Loading states.** Same for in-flight / skeleton paths.
   - **Mobile readiness.** At viewport ≤ 1024 px, does the component switch
     to comfortable density? Are touch targets ≥ 44 CSS px? (AQ-015 / AQ-016).
   - **Cross-component AI-aesthetic count.** Look at the page-level rendering
     (or the storybook snapshot) and count screenshot-detectable AI tells
     (#1 oversized radius, #2 indigo gradient, #4 hero, #5 emoji icons,
     #7 glassmorphism, #10 heavy shadow, #13 gradient text, #14 colored
     nav, #15 over-iconification). Three or more in a single frame → fail
     the screenshot rubric.

## Output format

Mirror slop-scan exactly:

```
LEVEL  file:line  message  → fix
```

Where `LEVEL` is one of `WARN | ERROR | INFO`. Group ESLint findings first
(verbatim from `bun run lint:design`), then higher-level findings under a
`## Higher-level findings` heading.

Example:

```
WARN  packages/web/src/pages/work/Inbox.tsx:42  shadow-xl on card surface (AI tell #10)  → fix: use tonal layering via --surface-2/3
INFO  packages/web/src/pages/work/Inbox.tsx     no EmptyState branch for `threads.length === 0`  → fix: render <EmptyState title="No threads" body="..." /> when threads is empty
WARN  packages/design-system/src/PitchCard.tsx:15  spacing inconsistent with BetCard (PitchCard: p-3, BetCard: p-2)  → fix: align both on var(--density-pad-*)
```

## When to invoke

- Before opening any UI PR.
- After a sweep that touched multiple components (K7 territory).
- When `/design-critique` flags a specific class of issue and you want
  confirmation that the whole codebase is clean.
