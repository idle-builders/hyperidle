## Our components

Built up in four tiers. Each tier composes only from tiers below it. If something seems to belong in a tier but doesn't earn its keep across at least two usage sites, it doesn't exist.

### Tier 1 — Primitives (wrap DaisyUI + tokens to add semantics)

Five only. Anything more is scope creep.

1. **StatusChip** — a `badge` coloured by state: `healthy / behind / blocked / paused / done / error`. Mono-sm caps text + 6 px dot. The single source of truth for status anywhere in the app.
2. **Tag** — a `badge-neutral` for identity labels: product name, object kind (bet, pitch, task), knowledge category. Flat fill, no border.
3. **KeyValue** — caps mono-sm label + body value, stacked or inline. Every detail view uses this; no freeform "label + text" rows are allowed.
4. **NavItem** — a `menu` `<li><a>` restyled with Icon + Text + optional count badge, with a `selected` state (surface-4 fill + 2 px primary left bar). Used in the icon rail, submenu, settings rail.
5. **SearchField** — `input input-sm` + leading search icon + trailing `kbd`. Always the same.

### Tier 2 — Blocks (compose Tier 1 into reusable units)

> **Disambiguation.** "Tier 2 — Blocks" is a tier of design-system *components* (React widgets). These are NOT the `Block` content primitive — see [`docs/BLOCKS.md`](BLOCKS.md). The primitive's renderer components (e.g. `HeadingBlockView`, `ParagraphBlockView`) are Tier-2 components that happen to render the primitive; the primitive itself is data, not a component.

Six. Each maps to a concrete recurring need.

1. **ThreadRow** — Avatar + title + caption + StatusChip + relative timestamp. Used in conversation lists and activity feeds.
2. **BetCard** — Tag(product) + title + StatusChip + ProgressTrack + owner Avatar. Appears on the bet canvas and in portfolio previews.
3. **PitchCard** — Tag(kind) + title + appetite KeyValue + StatusChip. Appears in the pitch selector overlay.
4. **TaskCard** — title + StatusChip + optional bet Tag + owner Avatar. Appears in the kanban.
5. **KnowledgeRow** — title + Tag(category) + caption + timestamp. Appears in knowledge lists, backlinks, provenance.
6. **NotificationRow** — StatusChip + summary + source Tag + timestamp + optional inline action `btn btn-ghost btn-xs`. The only shape notifications take, anywhere.

No other card shapes. If a new surface needs a card, it reuses one of these or proves it isn't one of them.

### Tier 3 — Regions (compose Tier 2 into page sections)

Eight. These are the things a page is made of.

1. **IconRail** — 48 px left column: four top-level NavItems (Conversations, Work, Knowledge, Settings) + user Avatar at bottom.
2. **Submenu** — 240 px contextual column: title, SearchField, filter Tags, scroll list of NavItems or Tier-2 rows. One Submenu per top-level view.
3. **Rail** — 56 px collapsed / 360 px expanded right column. Collapsed = stacked NavItems per notification category with counts. Expanded = SearchField + grouped NotificationRows. **This is the only notification surface in the app.**
4. **ArtifactView** — polymorphic review body. Five shapes, selected by artifact kind:
   - `text_diff` — stack of diff lines (mono, tinted bg).
   - `content_preview` — rendered content + KeyValue header.
   - `visual_comparison` — two surface-4 panes side by side with labels.
   - `action_summary` — ordered list of KeyValue rows.
   - `data_metrics` — grid of KeyValues + inline sparklines.

   That's it — one organism, five data shapes. No sixth.
5. **ReviewHeader** — title + Tag(product) + StatusChip + three `btn`s (approve / request changes / reject). Above every ArtifactView.
6. **Canvas** — Shape Up lanes (Shaping / Betting / Building / Cool-down) holding BetCards. A `+` slot swaps the Kanban below for the PitchSelector.
7. **Kanban** — four columns (Planned / Blocked / In Progress / Done) of TaskCards. Gets replaced by PitchSelector when `+` is clicked on the Canvas.
8. **PitchSelector** — filter Tags + scrollable list of PitchCards + "Add to canvas" action. Overlay that replaces the Kanban.

Detail views (bet detail, knowledge detail, settings form) don't need a dedicated region — they're just a title + KeyValues + Tier-2 rows arranged in the Main pane.

### Tier 4 — Pages (just compose regions)

The shell is fixed: `IconRail | Submenu | Main | Rail`. Pages differ only in Submenu content and Main content.

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
