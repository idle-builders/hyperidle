# AI5 — Concept (light probe)

## Framing: this is adoption, not a new primitive

AI5 introduces **no new domain noun**. The recurring interface atoms — Avatar/AvatarGroup, Button, Skeleton/SkeletonList/SkeletonCard, EmptyState, ErrorState, TabBar, Tag, KnowledgeRow, NotificationRow — are all **stable concepts**: they exist, are catalogued in `packages/design-system/DESIGN.md`, exported from `packages/design-system/src/index.ts`, and story-backed. AI5 makes them *true everywhere* by replacing hand-rolled equivalents. None of these is redefined; do not re-probe Avatar/Button/etc.

Phase 0 classification:

| Noun | Classification | Concept work? |
|---|---|---|
| Avatar / Button / Skeleton / EmptyState / ErrorState / TabBar / Tag / KnowledgeRow / NotificationRow | Stable (inputs) | No |
| EmptyState/ErrorState **compact variant** | Reshaped (variant added) | No — a prop, not a concept (design ratifies anatomy) |
| **Initials** (derivation) | Reshaped → extracted utility | No — pure function, not a noun |
| **Scope-picker** | Borderline — decided below | Yes (one decision) |

## The one decision: is the scope-picker a new primitive?

**No. It is a consolidation of an existing pattern, not a new primitive noun.**

Evidence from the tree:

- The **data** is already shared and singular: `packages/web/src/utils/scope-labels.ts` exports `SCOPE_PILL_OPTIONS` (4 filter pills: All / Shared / Team / Private) and `SCOPE_CREATE_OPTIONS` (3 create pills: Shared / Team / Private), plus `scopeKindToLabel()`. There is one vocabulary, one source of truth for *what* the scopes are.
- What is forked is only the **rendering** — a `role="radiogroup"` (create) or filter pill-row of buttons, each copy hardcoding the active tint `rgba(22,118,79,0.08)` (the value `--accent-primary-dim` already names) and re-deriving the active/disabled className triples.
- Forked render sites (verified, 4 files): `pages/KnowledgeList.tsx` (filter variant), `pages/KnowledgeCreate.tsx` (create variant), `pages/knowledge/ScopeChangeDialog.tsx`, `pages/knowledge/KnowledgeCreateDialog.tsx`. (`shell/TaskSheet.tsx` has a `role="radiogroup"` but it is the *request-intent* picker, NOT knowledge scope — out of scope, do not migrate.)

So the scope-picker is **not** a new domain concept (it carries no new meaning — Scope already exists in `@hyperidle/shared` as `ScopeKind` and in `scope-labels.ts` as the user-facing collapse). It is a **presentation primitive**: one segmented pill-group component that renders the existing scope options. Same status as Avatar — a reusable rendering of data that already has authority elsewhere.

### Scope-picker contract

| Aspect | Decision |
|---|---|
| **Identity** | A presentational segmented pill-group that renders an ordered set of scope options as mutually-exclusive (radiogroup) or filter pills. It is a **component**, not a domain entity. |
| **Authority** | Owns *nothing* about scope semantics. `scope-labels.ts` owns the option vocabulary; `@hyperidle/shared` `ScopeKind` owns the underlying values. The component owns only chrome + selection wiring. |
| **What it is NOT** | (1) NOT a new scope vocabulary — it consumes `SCOPE_*_OPTIONS`, never restates them. (2) NOT a generic Select/dropdown — that shape belongs to **AG5**; the scope-picker is an always-visible pill row, not a collapsing menu. (3) NOT the request-intent radiogroup in TaskSheet — different concept (intent ≠ scope), stays put. |
| **Cardinality** | Renders 0..n options; selection is single-select (radio) in create/change contexts, and single-select-with-null ("All") in the filter context. The "All = no filter" affordance is a mode of the same component, not a fork. |
| **Closure** | Option lists stay closed in `scope-labels.ts`; the component never invents options. |
| **Where it lives** | Design-system primitive (Tier 1) so all four web sites import it. The Hearth tint comes from `--accent-primary-dim`, never a hardcoded rgba. |

### Vocabulary lock

| Term | Definition | Aliases not to use |
|---|---|---|
| **ScopePicker** | The shared segmented pill-group rendering scope options. | scope pills, scope filter, scope tabs, scope selector, scope dropdown |
| **Initials** (utility) | `deriveInitials(name)` → 1–2 uppercase chars. Pure function. | initials chip, slice(0,2) |

Aliases collapse: the current `.slice(0, 2).toUpperCase()` (4 sites) and the bare `.slice(0, 2)` (RecipientPicker, no uppercase) become one `deriveInitials` call.

## Rejection list (concept-level, with reasons)

- **ScopePicker is not a dropdown.** AG5 owns dropdowns/select-pickers. If the scope-picker were ever to collapse into a menu, that menu is AG5's. AI5 ships the visible pill-group only — yield the menu shape.
- **The compact EmptyState/ErrorState variant is not a new component.** It is a `compact`/`inline` boolean (or `variant` prop) on the existing component. A second file would re-fork the thing we are consolidating.
- **`deriveInitials` is not an Avatar method.** Avatar stays a dumb renderer that takes pre-derived `initials`. Derivation is a separate utility so non-Avatar callers (any future identity chip) can reuse it without pulling in the component.

## Required reading (for /architecture and /pipeline)

- `packages/design-system/DESIGN.md` — primitive catalogue + token reference.
- `packages/design-system/src/index.ts` — live inventory (what exists to adopt).
- `packages/design-system/src/EmptyState.tsx`, `ErrorState.tsx`, `Avatar.tsx`, `Button.tsx`, `Skeleton.tsx`, `TabBar.tsx` — the primitives to extend/adopt.
- `packages/web/src/utils/scope-labels.ts` — the scope option vocabulary (authority).
- The 4 scope-render forks: `pages/KnowledgeList.tsx`, `pages/KnowledgeCreate.tsx`, `pages/knowledge/ScopeChangeDialog.tsx`, `pages/knowledge/KnowledgeCreateDialog.tsx`.
- `.claude/rules/aesthetic-quality.md` — AQ-015 (touch targets) rides along.
- Track-AI preamble (`.pipeline/work-packages/TRACK-AI.md` lines 1–13) — AG5/AG6/AG7 boundary.

## Rationale

The review found duplication was cheaper than reuse at authoring time; the scope-picker is the sharpest case — four files each re-deriving the *same active tint the token system already defines*. Promoting it to a primitive removes the template the fifth copy would have been pasted from. Naming it `ScopePicker` (not `ScopeSelect`/`ScopeDropdown`) is load-bearing: it signals "always-visible pill group," cleanly separating it from AG5's dropdown territory so the boundary never gets re-litigated.
