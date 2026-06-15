# AG7 — Settings Consistency Pass: Concept

## Classification: no new or reshaped primitives

AG7 is a **visual consistency / presentation pass**. Its job is to make 10 existing Settings sections look like they were designed by the same hand. No new domain primitives, no new nouns, no new data models, no new API contracts. Every load-bearing object already exists.

## Load-bearing existing primitives

These are the fixed inputs to `/design` and `/architecture`. They must not be invented, forked, or replaced.

| Primitive | Lives at | Role in AG7 |
|---|---|---|
| `SectionTitle` | `packages/web/src/pages/SettingsPage.tsx` (local) | The one shared section-header component. Already exists; AG7 enforces it as the *only* section-header pattern — no section may break it. |
| `Input` | `packages/design-system/src/Input.tsx` | Canonical text/textarea control. Replaces all `<input className="input input-sm input-bordered">` hand-rolls. |
| `Select` (AG5) | `packages/design-system/src/Select.tsx` | Canonical dropdown. Replaces all `inputStyle` inline-style selects and raw DaisyUI `select select-sm` usage. |
| `Toggle` | `packages/design-system/src/Toggle.tsx` | Canonical boolean control. Already used in Notifications; Worker section must adopt it. |
| `Button` | `packages/design-system/src/Button.tsx` | Canonical action button. Replaces all `btn btn-primary btn-sm` and `btn btn-ghost btn-sm` raw DaisyUI buttons in section save/cancel/action rows. |
| `Skeleton` / `SkeletonList` | `packages/design-system/src/Skeleton.tsx` | Canonical loading state. Replaces all `<div className="skeleton h-8 w-full">` hand-rolled bars. |
| `ErrorState` | `packages/design-system/src/ErrorState.tsx` | Canonical error state. Replaces all `<p className="text-sm text-error">…</p>` hand-rolled errors. Use `compact` variant inside Settings panes. |
| `EmptyState` | `packages/design-system/src/EmptyState.tsx` | Canonical empty state. Replaces all `<p className="text-[13px] text-[var(--text-tertiary)]">No X defined.</p>` hand-rolled empty messages. Use `compact` variant. |
| `Row` (AG6) | `packages/design-system/src/Row.tsx` | Canonical list-row. Available for future list rendering in Settings sections where row data is shown (OrgChart table, Agents table); AG7 assesses adoption fit. |

## What this workpackage is NOT

- Not a new design-system primitive (no new `.tsx` to add to `packages/design-system/src/`).
- Not a behavior/persistence change (no new API calls, no new fields, no new routes).
- Not a re-design of sections (no adding/removing sections, no changing what settings do).
- Not a density toggle (already removed per MEMORY: `project_density_removal.md`).
- Not a functional rework of AH3/AH4 changes (textarea pill-shape fix, assistant persona, org-chart edge behavior land in AH3/AH4; AG7 styles on top of their final shape).

## The one undocumented pattern: card-vs-flat treatment

The only concept work in AG7 is documenting **when a section's content sits in a card** (bordered `--r-subtle` container with `--border-subtle`) vs **flat** (no card chrome). This is currently inconsistent — Models/OrgChart use card wrappers per-row, Agents uses cards per-edit-form, others are flat. AG7 must define one rule. This is not a new primitive; it is a documented application of Hearth's existing `--surface-elevated` / border tokens to a specific layout pattern.

**Proposed rule (for `/design` to validate):** Settings sections that contain *list/table data* (OrgChart, Agents, Models) render each data-row or tier-group in a card. Sections that contain *form fields directly* (Profile, Notifications, Appearance, Backend, Worker, Assistant) are flat — no wrapper card. The add/edit *expansion forms* within list sections use a card with `--border-subtle` border.

## Vocabulary

| Term | Definition | Aliases NOT to use |
|---|---|---|
| **Section** | One vertical block within the stacked SettingsPage. Contains a SectionTitle + one Settings\* component. | panel, tab, pane |
| **SectionTitle** | The shared `<h2>` element: 13px/600 uppercase, text-tertiary, border-bottom. Lives in SettingsPage.tsx. | section header, heading, label |
| **card** | A bordered container (1.5px border, `--border-subtle`, `--r-subtle` radius) wrapping a data row or form expansion. | box, panel, tile |
| **flat** | Content rendered directly on the section background, no card chrome. | plain, bare, unstyled |

## Required reading for /design and /architecture

- `packages/web/src/pages/SettingsPage.tsx` — the SectionTitle contract and section structure
- `packages/web/src/settings/Settings*.tsx` (all 9 section files + CredentialsTab) — current divergent constructions
- `packages/design-system/src/Input.tsx`, `Select.tsx`, `Toggle.tsx`, `Button.tsx`, `Skeleton.tsx`, `ErrorState.tsx`, `EmptyState.tsx`, `Row.tsx` — the target primitives and their APIs
- `.claude/rules/aesthetic-quality.md` — AQ lint rules (especially AQ-001, AQ-004, AQ-008, AQ-011, AQ-018)
- `packages/design-system/DESIGN.md` — component budget (no new components without replacing one or proving 2+ use contexts)

## Concept gate: CLEARED

No new nouns. No reshaped concepts. All primitives are locked and stable. `/design` and `/architecture` may proceed.
