# Design-Review Viewer

The viewer at `http://localhost:8098` (`npm run ds:serve`) is the design-review surface for the whole product. Every original component, page, settings panel, AppShell layout, and kind renderer is catalogued here. It is a mirror of production, not a parallel design space.

## Two-axis catalog (AJ6)

Stories are organized into **Catalog groups** across two axes, separated by a labeled divider:

### Tier groups — reuse vocabulary (shown first)

Domain-agnostic pieces. The axis name is "Reuse vocabulary."

| Group | Contents |
|---|---|
| **Foundation** | Atoms — Button, Input, Avatar, Toggle, Checkbox, Select, SearchField, LiveDot, Progress, Breadcrumb, Skeleton, Menu, Tokens gallery |
| **Primitives** | Small composed — StatusChip, Tag, NavItem, KeyValue |
| **Blocks** | Domain-agnostic composed — Row, ItemList, EmptyState, ErrorState, TabBar, Toast, ScopePicker, Block, BodyEditor, Dialog family |

### Domain groups — product areas (shown after the divider)

The axis name is "Product areas."

| Group | Contents |
|---|---|
| **Work** | BetCard, TaskCard, work pages (WorkBet, WorkTeam, WorkRoutine, …) |
| **Knowledge** | KnowledgeRow, knowledge pages and dialogs |
| **Conversations** | ThreadRow, Composer, ThreadShell, CommentRow, RichMessageCard, ThreadHostBanner, NotificationRow, conversation pages |
| **Artifacts** | ArtifactCostChip, ArtifactEmbed, ArtifactGalleryCard, ArtifactKindBadge, ArtifactPreview, ArtifactPreviewSurface, ArtifactStackItem, ArtifactTimestamp |
| **Settings** | Settings panels (SettingsModels, SettingsAgents, SettingsAssistant, SettingsWorker) |
| **System** | AppShell layout, Sidebar, kind renderers (code, image, url, text, file, json, audio) |

## Classification rules

Group assignment is **derived** — from source path, story title, or an explicit `group` field in the story's default export. The derivation chain runs in this precedence order:

1. **`meta.group`** — explicit override in the story (highest precedence; use only for area-less stories where path and title carry no signal)
2. **`deriveFromPath(path)`** — authoritative for any `web/` or `kinds/` path; the folder is the signal
   - `web/src/pages/work/…` → Work
   - `web/src/pages/knowledge/…` → Knowledge
   - `web/src/settings/…` → Settings
   - `web/src/shell/…`, `web/src/layouts/…`, `design-system/src/kinds/…` → System
   - Flat `web/src/pages/…` — falls through to title
3. **Title fallback** — for flat `web/src/pages/*.stories.tsx` only: `"Page: Work/*"` → Work, `"Page: Knowledge/*"` → Knowledge, etc.
4. **`DS_COMPONENT_GROUPS[title]`** — central registry in `discovery.ts` for the flat `design-system/src/` root (path carries no axis signal there)
5. **null** — classification failure; caught by the total-classification test (AC2); never silently defaults

Area-less page stories (`WorkRoutine`, `WorkTeam`, `NotFound`) carry no folder signal and no `"Page: Area/*"` title prefix — they require an explicit `meta.group` override.

## Important boundaries

**No clone designs.** Every entry renders the real production component/page. The viewer is a mirror; never add a forked `WorkBetDesign.tsx` inside the design system.

**No import cycle.** `@hyperidle/design-system` (the package) never imports `@hyperidle/web`. Only the dev-only viewer (`viewer/main.tsx`) cross-imports web stories via build-time globs. An ESLint `no-restricted-imports` rule (AC8) enforces this at the import site.

**Token gallery reflects, never defines.** `packages/design-system/src/tokens.css` stays canonical. The Tokens story reads live values via inline `var(--x)` — `getComputedStyle` is not used (returns empty in jsdom).

## Token gallery

The **Tokens** story (Foundation group) renders all live token values theme-aware:

- **Colors** — surface, text, accent, status, border swatches
- **Spacing** — bars visualizing the 6px grid scale (space-1 … space-16)
- **Radius** — `--r-none`, `--r-subtle`, `--r-default`, `--r-pill`
- **Type scale** — each `--text-xs … --text-3xl` rendered at that size
- **Motion** — blocks animating over `--motion-fast / default / slow`
- **Shadows** — `--shadow-subtle / default / elevated`
- **Borders** — `--bw-thin / default / strong`

Theme toggle (Dark / Light) in the viewer toolbar switches the cascade; token tiles update live.

## Visual regression

The DOM-snapshot net (`packages/design-system/src/__tests__/catalog-snapshot.test.tsx`) covers all DS stories (`src/*.stories.tsx` including Tokens, and `src/kinds/*.stories.tsx`). It does NOT cover web stories (cross-package coupling is avoided in the test runner). The guard `expect(modules.length).toBeGreaterThanOrEqual(56)` must stay — a glob returning `{}` makes the net vacuously green. See `.claude/rules/visual-regression.md`.

## Deferred cleanup

Per-component group placement — debatable Tier-vs-Domain assignments, over-granular components, mis-tiered names (`ScopePicker`, `CredentialsTab`) — is deferred to a follow-up WP. AJ6 established the model and the first honest classification pass; the fine-grained cleanup ships separately so the structural change lands without a full component rename churn.

**Next:** [Component tree at a glance](./component-tree-at-a-glance.md) for the composition hierarchy, or [Theme tokens](./theme-tokens.md) for the token reference.
