---
paths:
  - "packages/web/**/*.tsx"
  - "packages/web/**/*.ts"
  - "packages/design-system/src/**"
---

# Reuse First — Think Lazy

**The best component is the one you didn't build.** An existing design-system component carries hundreds of decisions that were already made and already tuned: spacing on the Hearth grid, type on the scale, hover/focus/disabled states, dark mode, touch targets, a11y roles, motion, empty/loading/error handling, stories, tests. A new component restarts that entire long tail from zero — and history shows it never gets finished: the 2026-06-12 consistency review found 8 relative-time formatters, 4 copies of one scope picker, 2 design-system rows reimplemented by the pages they were built for, and ~30 references to CSS tokens that don't exist. Every one of those started as "it's faster to just write it here."

Laziness is the senior reflex. Treat writing new UI code as a cost to be avoided, not a contribution.

## The decision ladder

Before writing ANY new component, hook, helper, or style — walk this ladder and stop at the first rung that holds. You must be able to say which rung you stopped at and why the ones above failed.

1. **Does it need to exist at all?** Is the element already on screen in another form? Can the spec be satisfied by the existing surface? (YAGNI.)
2. **Does the design system already have it?** Read `packages/design-system/src/index.ts` — the barrel export IS the inventory. Check `DESIGN.md` and `/designsystem` stories. The component you're about to write probably exists under a name you didn't grep for (identity → `Avatar`, status → `StatusChip` + `status-mapping.ts`, time → the shared formatter, lists → the row components, states → `EmptyState`/`ErrorState`/`Skeleton`, tabs → `TabBar`, search → `SearchField`).
3. **Can an existing component grow a prop?** A `compact` variant, an extra slot, one more enum value on an existing primitive is almost always cheaper than a parallel implementation — and every other consumer inherits the improvement. Extend in `packages/design-system`, update the stories, done.
4. **Does `@hyperidle/shared` or `utils/` already have the logic?** Label maps, status vocabularies, formatters, initials derivation — check before writing the fifth copy.
5. **Does DaisyUI cover it?** For primitives the design system deliberately doesn't own (per `DESIGN.md`), use the DaisyUI class directly — never wrap it in a one-line component.
6. **Only then: build new** — in `packages/design-system` if 2+ surfaces will ever use it, with stories, on tokens. Page-local components are for genuinely page-specific composition only.

## Hard rules

- **No second implementation of an existing capability.** If a design-system component, shared util, or token does what you need at 80%, extending it to 100% is the task — a local fork is a defect, not a shortcut.
- **The two-copy ceiling.** Duplication for locality is tolerated at ≤2 call sites. The third copy is the signal: promote to `packages/design-system` or `utils/` *in the same change* — never paste a third copy.
- **Every deliberate exception is written down.** If a rung-6 build or a local copy genuinely must exist (E2E selector needs, a11y role conflicts, protected tests), it carries a `@lore` comment naming the reason and the rung it failed on. An undocumented hand-rolled equivalent of an existing component is a review-blocking finding.
- **Shortest working diff wins.** Deletion over addition. A change that removes a local copy by adopting the shared one beats a change that polishes the copy.

## Red flags — rationalizations the review will reject

| Rationalization | Why it's wrong |
|---|---|
| "It's faster to write it inline" | Faster today; the 2026-06-12 review tallied the bill: 8 time formatters, 3 dialog systems, 5 focus-ring conventions. Inline is how drift starts. |
| "The shared component doesn't quite fit" | Then it's one prop away. Extending it fixes every consumer; forking it forks the design language. |
| "This page is self-contained by design" | Locality is bounded by the two-copy ceiling. Self-contained pages still speak the shared visual language. |
| "It's just a div with some classes" | Those classes encode spacing, type, color, and state decisions. The shared component already made them correctly. |
| "I'll promote it to the design system later" | Later never comes. Promote now or use what exists. |
| "A new component shows more work" | The goal is a tuned product, not a large diff. The tuned experience already exists — reuse it. |
