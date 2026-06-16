## Our components

Built up in four tiers. Each tier composes only from tiers below it. If something seems to belong in a tier but doesn't earn its keep across at least two usage sites, it doesn't exist.

### Tier 1 — Primitives (wrap DaisyUI + tokens to add semantics)

<!-- @source packages/design-system/src/ -->

Seven. Anything more is scope creep.

1. **StatusChip** — a `badge` coloured by state: `healthy / behind / blocked / paused / done / error`. Mono-sm caps text + 6 px dot. The single source of truth for status anywhere in the app.
2. **Tag** — a `badge-neutral` for identity labels: product name, object kind (bet, pitch, task), knowledge category. Flat fill, no border.
3. **KeyValue** — caps mono-sm label + body value, stacked or inline. Every detail view uses this; no freeform "label + text" rows are allowed.
4. **NavItem** — a `menu` `<li><a>` restyled with Icon + Text + optional count badge, with a `selected` state (surface-4 fill + 2 px primary left bar). Used in the icon rail, submenu, settings rail.
5. **SearchField** — `input input-sm` + leading search icon + trailing `kbd`. Always the same.
6. **PageHeader** — pinned top strip of a primary page: title (h1 by default, h2 via `level={2}`) + optional `leading` row (breadcrumb/nav cluster) + optional `subtitle` meta line + optional `actions` cluster. `shrink-0`, `border-b border-[var(--border-subtle)]`, `px-[24px] py-[18px]`. Exports `pageTitleClassName` so pages with an editable title `<input>` can compose the exact treatment (20px / 600 / `tracking-[-0.01em]` / `--text-primary`) without forking the literal. See **Page anatomy rules** below and `docs/ui-design/page-anatomy.md`.
7. **SectionLabel** — uppercase 13px section opener inside a page body. Treatment: `text-[13px] font-[600] uppercase tracking-[var(--tracking-caps-sm)] text-[var(--text-tertiary)]`. Tag defaults to `h3`; pass `as="h2"` where SectionLabel is the page's top body heading (e.g. KnowledgeDetail sidebar). Optional `trailing` slot (count, "New" button) and optional `divider` border-bottom (default off). See `docs/ui-design/page-anatomy.md`.

### Tier 2 — Blocks (compose Tier 1 into reusable units)

> **Disambiguation.** "Tier 2 — Blocks" is a tier of design-system *components* (React widgets). These are NOT the `Block` content primitive — see [`docs/blocks/`](BLOCKS.md). The primitive's renderer components (e.g. `HeadingBlockView`, `ParagraphBlockView`) are Tier-2 components that happen to render the primitive; the primitive itself is data, not a component.

Six. Each maps to a concrete recurring need.

1. **ThreadRow** — Avatar + title + caption + StatusChip + relative timestamp. Used in conversation lists and activity feeds.
2. **BetCard** — Tag(product) + title + StatusChip + ProgressTrack + owner Avatar. Appears on the bet canvas and in portfolio previews.
3. **PitchCard** — Tag(kind) + title + appetite KeyValue + StatusChip. Appears in the pitch selector overlay.
4. **TaskCard** — title + StatusChip + optional bet Tag + owner Avatar. Appears in the kanban.
5. **KnowledgeRow** — title + Tag(category) + caption + timestamp. Appears in knowledge lists, backlinks, provenance.
6. **NotificationRow** — StatusChip + summary + source Tag + timestamp + optional inline action `btn btn-ghost btn-xs`. The only shape notifications take, anywhere.

No other card shapes. If a new surface needs a card, it reuses one of these or proves it isn't one of them.

### Page anatomy rules (AI7)

Every primary page follows these three rules. They are lint-enforced and test-backed.

**1. Scroll rule — one pattern only.** Every primary page root is `flex flex-col h-full`. The `PageHeader` is `shrink-0` (pinned, never scrolls away). The body is `flex-1 overflow-y-auto`. This is the only scroll pattern consistent with the AppShell page-host, which is `overflow-hidden` — window-level scroll is impossible.

**2. Heading-level contract.** Each primary page carries exactly one `<h1>`: the `PageHeader` title (default `level=1`). Section headers inside the page body are `<h3>` via `SectionLabel` (default `as="h3"`). Pass `as="h2"` to `SectionLabel` only where it is the page's top body heading (e.g. KnowledgeDetail sidebar labels where there is no SectionLabel competing with the page title).

**3. No inline title or section-label treatments.** Two `eslint-plugin-design` rules enforce this:
- `no-handrolled-page-header` (error on `packages/web/src/pages/**`, SettingsPage + SetupFlow exempt) — flags the literal combo `text-[20px]` + `font-[600]` + `tracking-[-0.01em]` on any element that is not a `PageHeader`. Pages with an editable title `<input>` compose `pageTitleClassName` (an exported identifier) instead of repeating the literals.
- `no-undefined-font-heading` (error on `packages/web/src/pages/**`, warn on the rest of `packages/web/src/**`) — flags `font-heading` (undefined utility, a silent CSS no-op) and `tracking-wider` inside `pages/**` (the 0.05em default is off the Hearth caps scale; use `tracking-[var(--tracking-caps-sm)]` = 0.06em via `SectionLabel` instead).

### Tier 3 — Regions (compose Tier 2 into page sections)

Six. These are the things a page is made of.

1. **Sidebar** — 200 px left column: three section headers (Conversations, Work, Knowledge) with triage badge on Conversations + Settings gear at bottom. Ambient awareness via embedded badges and indicators.
2. **ArtifactView** — polymorphic review body. Five shapes, selected by artifact kind:
   - `text_diff` — stack of diff lines (mono, tinted bg).
   - `content_preview` — rendered content + KeyValue header.
   - `visual_comparison` — two surface-4 panes side by side with labels.
   - `action_summary` — ordered list of KeyValue rows.
   - `data_metrics` — grid of KeyValues + inline sparklines.

   That's it — one organism, five data shapes. No sixth.
3. **ReviewHeader** — title + Tag(product) + StatusChip + three `btn`s (approve / request changes / reject). Above every ArtifactView.
4. **Canvas** — Two-column bet board (Shaped / Committed) holding BetCards. A `+` slot opens BetCreateDialog for creating new pitches.
5. **Kanban** — four columns (Planned / Blocked / In Progress / Done) of TaskCards. Gets replaced by PitchSelector when `+` is clicked on the Canvas.
6. **PitchSelector** — filter Tags + scrollable list of PitchCards + "Add to canvas" action. Overlay that replaces the Kanban.

Detail views (bet detail, knowledge detail, settings form) don't need a dedicated region — they're just a title + KeyValues + Tier-2 rows arranged in the Main pane.

### Tier 4 — Pages (just compose regions)

The shell is fixed: `Sidebar | Main content`. Pages differ only in the Main pane content.

| Page | Submenu | Main |
|---|---|---|
| Conversations / Review | ThreadList of ThreadRows | ReviewHeader + ArtifactView + composer (`textarea` + `btn`) |
| Conversations / Chat | ThreadList | message list + composer |
| Work / Portfolio (L1) | Product Tags | grid of BetCards grouped by product |
| Work / Team (L2) | Product Tags | Canvas + Kanban |
| Work / Team + Pitch | Product Tags | Canvas + PitchSelector |
| Work / Bet (L3) | Product Tags | title + KeyValues + linked TaskCards + linked KnowledgeRows + NotificationRow feed |
| Knowledge / List | filter Tags + SearchField | list of KnowledgeRows |
| Knowledge / Detail | list | title + Tag row + body + backlinks (KnowledgeRows) + provenance (KeyValues) |
| Settings | section NavItems | KeyValue rows with `input` / `toggle` / `select` values |

That's the whole app.

---
