# Our Components

## Tier composition

Custom components are built in four tiers. Each tier composes only from tiers below it. A component earns its place by being needed across ≥ 2 usage sites — otherwise it stays inline.

No strict component count. New components only when necessary; prefer composition inside existing ones.

---

## Tier 1 — Primitives

Wrap DaisyUI classes or token CSS vars to add semantic meaning. Live in `framework/design-system/src/`.

- **StatusChip** — single source of truth for status color anywhere in the app. Six statuses: `healthy | behind | blocked | paused | done | error` (`StatusChip.tsx:4`). Also accepts `"unknown"` sentinel for call sites where absence is not an error. `status-mapping.ts` maps domain statuses into these six.
- **Tag** — identity label (product name, object kind, knowledge category). Hand-rolled token classes — not DaisyUI badge (`Tag.tsx:13`).
- **KeyValue** — caps mono-sm label + body value, stacked or inline. Convention: no freeform "label + text" rows allowed.
- **NavItem** — `Icon + Text + optional count badge` with a `selected` state (surface-4 fill + 2 px primary left bar). Used in sidebar navigation.
- **SearchField** — search input + leading icon + trailing `kbd` (`SearchField.tsx:76`).
- **PageHeader** — pinned top strip of a primary page. See [`docs/ui-design/page-anatomy.md`](page-anatomy.md) for the full contract; exports `pageTitleClassName` for editable-title pages.
- **SectionLabel** — uppercase 13px section opener. See [`docs/ui-design/page-anatomy.md`](page-anatomy.md) for full contract.

---

## Tier 2 — Blocks

Compose Tier-1 primitives into reusable display units. Live in `framework/design-system/src/`.

> **Naming disambiguation.** "Tier 2 — Blocks" is a tier of design-system *components* (React widgets). These are **not** the `Block` content primitive — see [`docs/blocks/`](../blocks/definition.md). The Block primitive's payload renderers (`HeadingPayload`, `ParagraphPayload`, etc. in `framework/design-system/src/block/`) are Tier-2 components that happen to render the primitive; the primitive itself is data, not a component.

Current shipped set (non-exhaustive — see `framework/design-system/src/index.ts` for the authoritative export list):

- **ThreadRow** — Avatar + title + caption + StatusChip + relative timestamp.
- **BetCard** — Tag(product) + title + StatusChip + Progress + owner Avatar.
- **TaskCard** — title + StatusChip + optional parent-task Tag + owner Avatar.
- **KnowledgeRow** — title + Tag(category) + caption + timestamp.
- **NotificationRow** — StatusChip + summary + source Tag + timestamp + optional inline `btn btn-ghost btn-xs` action.

Note: `PitchCard` was deleted. The design system ships ~70 components; the list above is illustrative, not exhaustive.

---

## Tier 3 — Shell regions

Compose Tier-2 components into major page sections. Shell regions live in `layers/core-ui/src/shell/`.

- **Sidebar** (`layers/core-ui/src/shell/Sidebar.tsx`) — 276px desktop / 300px phone-drawer context switcher: identity and grouped tools, four stable destinations, one large domain navigator, and Settings pinned at the bottom. Structure → [`docs/information-architecture/app-shell-always-present.md`](../information-architecture/app-shell-always-present.md).

Other shell surfaces (AppShell, DesktopTitleBar, and AssistantOverlay) live in `layers/core-ui/src/shell/`. View-specific region components live alongside their page files.

Note: `ArtifactView`, `ReviewHeader`, `Canvas`, `Kanban`, and `PitchSelector` no longer exist as components. Review rendering is now handled by the canvas registry (`layers/core-ui/src/pages/review/canvas-registry.ts`).

---

## Tier 4 — Pages

Pages compose regions into full views. Page inventory → [`docs/information-architecture/`](../information-architecture/index.md).

---

## DaisyUI — as-is set

Listed once here so downstream components don't redefine them. Each is used directly with the Hearth theme, no wrapping.

`btn` · `input` · `textarea` · `select` · `radio` · `range` · `skeleton` · `loading` · `toast` · `alert`

Everything else the design system hand-rolls on tokens: Menu, Avatar, TabBar, Dialog, Toggle, Tag, Breadcrumb, Checkbox — see `framework/design-system/src/`.

**Not used:** hero, card, chat bubble, carousel, steps, timeline, rating, stat, mockup — wrong tone, redundant, or consumer-y.

---

Stack facts, theme names, and token authority live in [`docs/ui-design/foundation.md`](foundation.md).
