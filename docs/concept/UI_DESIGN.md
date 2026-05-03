# UI Design — The Factory

Version 0.3 · Desktop app · Dark / Light / System (Lucid theme)

<!-- @anchor: credo -->
## Credo

Keep it simple. Every component on this page has to justify its existence. If two components do almost the same thing, merge them. If a DaisyUI class already does the job, use it directly — don't wrap it.

---

<!-- @anchor: foundation -->
## Foundation

- **Tailwind CSS + DaisyUI** (community, not big-tech), configured with two custom themes `lucid-dark` and `lucid-light`. System preference is respected when no explicit theme is set.
- **Behavior gaps** (focus trap in modals, collision-aware floating elements): `focus-trap-react` + `@floating-ui/react`.
- **Data utilities** (virtual lists, tables when needed): `@tanstack/react-*`, pulled in only when a page demands it.

That is the entire dependency surface for the UI layer.

---

<!-- @anchor: theme-tokens -->
## Theme tokens

**Canonical source:** `packages/design-system/DESIGN.md` (full reference) and `packages/design-system/src/tokens.css` (implementation). Do not duplicate token values here — read them there.

DaisyUI theme wires our surfaces to `base-100/200/300`, primary to `--p`, warn to `--s`, ok to `--a`, danger to `--er`. Radius overrides: `--rounded-box: 8px`, `--rounded-btn: 4px`, `--rounded-badge: 4px`.

---

<!-- @anchor: what-we-use-from-daisyui-directly-as-is -->
## What we use from DaisyUI (directly, as-is)

Listed once here so we don't redefine them downstream. Each is used with our theme, nothing more.

`btn` · `input` · `textarea` · `select` · `checkbox` · `radio` · `toggle` · `range` · `file-input` · `kbd` · `badge` · `tabs` · `menu` · `dropdown` · `modal` · `drawer` · `alert` · `toast` · `tooltip` · `skeleton` · `breadcrumbs` · `avatar` · `divider` · `collapse` · `loading`

Anything else in DaisyUI — hero, card, chat bubble, carousel, steps, timeline, rating, stat, mockup, etc. — **is not used.** Wrong tone, redundant, or consumer-y.

---

<!-- @anchor: our-components -->
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

> **Disambiguation.** "Tier 2 — Blocks" is a tier of design-system *components* (React widgets). These are NOT the `Block` content primitive — see [`docs/concept/BLOCKS.md`](BLOCKS.md). The primitive's renderer components (e.g. `HeadingBlockView`, `ParagraphBlockView`) are Tier-2 components that happen to render the primitive; the primitive itself is data, not a component.

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

<!-- @anchor: component-tree-at-a-glance -->
## Component tree at a glance

```
DaisyUI (used as-is)
  btn input textarea select checkbox radio toggle range file-input
  kbd badge tabs menu dropdown modal drawer alert toast tooltip
  skeleton breadcrumbs avatar divider collapse loading

Tier 1 — Primitives (5)
  StatusChip · Tag · KeyValue · NavItem · SearchField

Tier 2 — Blocks (6)
  ThreadRow · BetCard · PitchCard · TaskCard · KnowledgeRow · NotificationRow

Tier 3 — Regions (8)
  IconRail · Submenu · Rail · ArtifactView · ReviewHeader
  Canvas · Kanban · PitchSelector

Tier 4 — Pages (9)
  Conversations/Review · Conversations/Chat
  Work/Portfolio · Work/Team · Work/Team+Pitch · Work/Bet
  Knowledge/List · Knowledge/Detail · Settings
```

Totals: 5 + 6 + 8 = **19 custom components** for the entire app. That's the simplicity bar. Adding a 20th needs a written reason in this file.

---

<!-- @anchor: rules -->
## Rules

1. **Don't wrap DaisyUI for the sake of wrapping.** Use `btn` directly in a page. Only create a Tier-1 primitive when it adds real semantics (state colour mapping, identity labels, label-value pairing, nav selection, standard search shape).
2. **Merge before you add.** If a new thing looks 80% like an existing Tier-2 block, make it a variant of that block, not a sibling.
3. **One shape per meaning.** One status chip, one card per domain object, one row per list context.
4. **Density over whitespace.** 8/12 px internal padding is the default. Whitespace is earned.
5. **Stitch outputs are mood boards.** A screen ships only after it decomposes into the tree above. If it can't, the screen is wrong — not the tree.
6. **Theme in one place.** All colour, radius, spacing changes happen in `tokens.css` and the DaisyUI theme config. Never in a component.
7. **Rail owns notifications. Fully.** No bell icon, no top-bar toasts, no inline pings outside the Rail feed.

---

<!-- @anchor: build-order -->
## Build order

1. Install Tailwind + DaisyUI, author Lucid themes, load fonts. _(2 days)_
2. Build Tier 1 (5 primitives) with all states in Storybook. _(3 days)_
3. Build Tier 2 (6 blocks). _(4 days)_
4. Build Tier 3 regions — shell first (IconRail/Submenu/Rail), then ArtifactView, then Canvas/Kanban/PitchSelector. _(1.5 weeks)_
5. Compose Tier 4 pages. _(1 week)_
6. Polish pass — motion, empty/loading/error states, keyboard shortcuts. _(3 days)_

About 4 weeks to replace the Stitch outputs with a coherent system.

---

<!-- @anchor: relation-to-other-docs -->
## Relation to other docs

- **INFORMATION_ARCHITECTURE.md** — defines *what* each page contains.
- **REQUIREMENTS.md** — defines *what the app does*.
- **UI_DESIGN.md** (this file) — defines *what we build and how little of it*.

Visual/component disputes are resolved here. Content/structure disputes are resolved in IA.
