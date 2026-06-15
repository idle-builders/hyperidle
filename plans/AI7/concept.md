# AI7 — Page Anatomy: Concept

**Level:** Per-workpackage. **Track concept inherited:** Track AI (Style Consolidation) — "make what exists true everywhere," presentation-only, no behavior/data/process change.

## Phase 0 — Identify the thing

No *domain* primitive here. AI7 introduces no new load-bearing noun in the process/knowledge/agent layers. The nouns are **design-system UI components** that encode an already-existing de-facto visual standard. The "concept" question reduces to: which UI shapes are worth naming as catalogued primitives, and what is each NOT.

Central UI nouns:

| Noun | Working definition | Classification |
|---|---|---|
| **PageHeader** | The pinned top strip of a primary page: title (h2-equivalent) + optional subtitle/meta + optional trailing actions slot, on a `border-b` rule, never scrolls. | New DS primitive (encodes existing standard) |
| **Section title** | The uppercase label that opens a content section inside a page body (13px, `tracking-[0.06em]`). | New DS primitive (encodes existing standard) |
| **Page scaffold / scroll rule** | The fixed-height-column convention: page is `flex flex-col h-full`, header is `shrink-0`, body is `flex-1 overflow-y-auto`. | Reshaped convention (ratify one rule; no component required) |

Stable inputs (used as-is, not reshaped): `Breadcrumb` (DS), `NavHistoryCluster`, `StatusChip`, `Button`, `Avatar`, the AppShell page-host. The page **body content** is out of scope and owned by each page (and AG1 for the team page).

**Naming decision (collision check).** `SectionHeader` already exists as a **private, file-local** component inside `packages/web/src/shell/Sidebar.tsx` — it is a sidebar nav-category cluster (view switcher), semantically unrelated to a page-body section title. No DS-level export collides, but reusing `SectionHeader` would be confusing. `PageHeader`/`SectionHeader` also appear as test-id/string fragments in e2e files, not as real components. **Canonical names chosen to avoid confusion:**
- **`PageHeader`** — no real component owns this name today; clear and accurate. Keep.
- **`SectionLabel`** — chosen over `SectionHeader` to dodge the Sidebar collision. It is a *label*, not a header bar; the name states its job (the uppercase opener of a section).

## Phase 1 — Probe the essence

### PageHeader

1. **Identity.** A PageHeader IS a *layout-and-typography container* for a page's orientation strip — it is presentational chrome, not data. It owns the title treatment, the optional subtitle/meta row, an optional actions slot, the bottom rule, and the `shrink-0` pinning. It owns no state and fetches nothing.
2. **Essential properties.** Every PageHeader has: a **title** (string or node), the canonical title type treatment (`text-[20px] font-[600] tracking-[-0.01em] text-[var(--text-primary)]`), the canonical padding (`px-[24px] py-[18px]`), a bottom border (`border-b border-[var(--border-subtle)]`), and `shrink-0`. Optional: a **leading** slot (breadcrumb + nav cluster), a **subtitle/meta** slot below the title, an **actions** slot trailing the title row.
3. **Rejection list** — see Phase 2.
4. **Composition.** PageHeader *hosts* (via slots) `Breadcrumb`, `NavHistoryCluster`, `StatusChip`, and `Button` action clusters — it does not import or own them; the page injects them as nodes. It carries no domain payload. It is *referenced by* every primary page as the first child of the page scaffold.
5. **Lifecycle.** None. Stateless presentational component.
6. **Authority.** Owned by the design system (`packages/design-system/src/`). The page owns *what* goes in the slots; PageHeader owns *how the strip looks and pins*.
7. **Vocabulary collision.** `SectionHeader` in Sidebar (resolved above). `header` HTML element — PageHeader renders a `<header>`, which is correct semantics; one `<header>` per page is fine.

### SectionLabel

1. **Identity.** A SectionLabel IS the *typographic opener* of a content section in a page body — an uppercase micro-heading. It is a single text element with an optional trailing slot, not a container for the section's content.
2. **Essential properties.** Canonical treatment: `text-[13px] font-[600] uppercase tracking-[0.06em] text-[var(--text-tertiary)]`. Renders a heading element (`h2` by default; `as` override for `h1`/`h3` where document outline needs it). Optional **trailing** slot (e.g. a count, a "Create" button) laid out on the same baseline row.
3. **Rejection list** — see Phase 2.
4. **Composition.** Carries a `label` (string/node) and an optional `trailing` node. Hosts nothing structural; the section's body sits *after* the SectionLabel as a sibling, owned by the page.
5. **Lifecycle.** None.
6. **Authority.** Design system owns the treatment; page owns the label text and what sits in `trailing`.
7. **Vocabulary collision.** The 13px section-title treatment already lives inline in `WorkTask.tsx` (`SECTION_TITLE` const) and inline across `WorkBet`. SectionLabel collapses these to one primitive.

### Page scroll rule (ratified convention, not a component)

1. **Identity.** A rule, not a thing: every primary page is a fixed-height flex column whose header is pinned and whose body scrolls.
6. **Authority.** The AppShell page-host (`AppShell.tsx` line 573) is `flex-1 flex flex-col overflow-hidden ... min-w-0` — a **fixed-height, non-scrolling** container. This is the load-bearing fact: the host gives pages a bounded height and refuses to scroll, so a page that wants any scroll MUST own an internal `overflow-y-auto` region. The pinned-header pattern is therefore the only pattern consistent with the host; the scroll-away-header pages (`WorkTeam`, `WorkRoutine`) are the anomaly — their root is `flex-1 overflow-y-auto` with the header inside the scroll region.

## Phase 2 — Rejection list

**PageHeader is NOT:**
- **Not a Breadcrumb / NavHistoryCluster.** Those are orientation widgets the header *hosts* in its leading slot. Folding them in would couple the DS header to react-router and the nav-history store. Rejected because PageHeader must stay router-agnostic and stateless (same reason `Breadcrumb` injects `LinkComponent`).
- **Not a toolbar / filter bar.** The pill filter rows in `WorkPortfolio`/`KnowledgeList` are page-specific controls that live *below* the title row or in the body, not part of the header primitive. Folding them in would make the actions slot a dumping ground and force per-page conditionals into the DS. Rejected; they stay page-owned, optionally inside the header's body via the actions/children slot only when they are genuinely header-level.
- **Not the page scaffold.** PageHeader is the strip; it does not render the `flex flex-col h-full` wrapper or the scrolling body. Rejected as a combined "Page" component because that would force the DS to own each page's body layout, which pages (and AG1) must own. The scaffold stays as a documented class convention, not a component.
- **Not a Settings page section header (AG7).** AG7 owns Settings chrome; AI7 ratifies the primitive AG7's sections can later adopt but does not restyle Settings here.

**SectionLabel is NOT:**
- **Not a metric-tile label.** The 11px/12px uppercase labels inside KeyValue tiles (`WorkTask`, `WorkBet`) are tile-internal micro-labels at a smaller scale, not section openers. Rejected from this primitive — they are a different scale (11px) and a different role (datum label vs section opener). Folding them in would force a size prop that re-opens the fork AI7 closes.
- **Not a divider.** Some current section titles carry `border-b ... pb-[6px]` (WorkTask/WorkBet); others don't (WorkTeam/WorkRoutine/AgentProfile). The bottom rule is an *optional* affordance, not essential — making it always-on would change the look of half the pages. Rejected as essential; offered as an optional `divider` prop defaulting off (de-facto majority has no divider on the section label itself).
- **Not the Sidebar SectionHeader.** That is a nav view-switcher; unrelated. Rejected as a name to reuse.

**The scroll rule rejects:**
- **Scroll-away headers.** `WorkTeam`/`WorkRoutine` let the title scroll off. Rejected because it is inconsistent with every other page AND with the host container's `overflow-hidden` intent (a pinned header is the only pattern that keeps orientation stable). This is the AC2 decision: ratify pinned.
- **Page-level body-scroll on `window`.** Not possible — host is `overflow-hidden`. Documented so no page tries it.

## Phase 3 — Vocabulary

| Term | Definition | Aliases not to use |
|---|---|---|
| **PageHeader** | Pinned top strip of a primary page: title + optional leading/subtitle/actions slots, `border-b`, `shrink-0`. | page chrome, page bar, title bar, toolbar |
| **SectionLabel** | Uppercase 13px opener of a content section in a page body, optional trailing slot. | section header (collides with Sidebar), section title, group heading |
| **Page scaffold** | `flex flex-col h-full` page root with `shrink-0` PageHeader + `flex-1 overflow-y-auto` body. | page shell, page layout (overloaded) |
| **`font-heading`** | — | **Undefined utility — must be purged.** Not a token, not in tailwind config. |
| **`tracking-wider`** | Tailwind default 0.05em | Off the Hearth caps scale — replace with `tracking-[0.06em]` (`--tracking-caps-sm`). |

## Phase 4 — Contracts

- **Cardinality.** Exactly one PageHeader per primary page, as the first child of the page scaffold. Zero or more SectionLabels per page body.
- **Closure.** PageHeader slots are open (accept arbitrary nodes); its *typography and padding are closed* (fixed, no per-page size/tracking props — that is the whole point of AI7). SectionLabel treatment is closed; `as` and `trailing` and `divider` are the only knobs.
- **Mutability.** Stateless; nothing mutable.
- **Identity.** Presentational; no IDs. Carry `data-ds-component` / `data-tier` markers per DS convention (so the snapshot net enumerates them) and pass through `data-testid` for page-level test hooks.
- **Hard rules.**
  1. No primary page may declare title or section-label font-size/weight/tracking inline — those treatments exist only inside the two primitives.
  2. `font-heading` and `tracking-wider` appear in **zero** page files after this WP.
  3. Every primary page's root is the ratified scaffold (pinned `shrink-0` PageHeader + `flex-1 overflow-y-auto` body); no page lets its header scroll away.
  4. Hearth tokens only; no new tokens introduced.
  5. No behavior/content/navigation change on any page (Track AI scope rule).

## Phase 5 — Ground truth

No `docs/<topic>/` domain file is reshaped (these are UI components, not domain primitives). The standard belongs in `docs/ui-design/` and `packages/design-system/DESIGN.md`; `/write-docs` lands the primitive descriptions there post-merge. This concept doc + the design `approved.md` are the interim source of truth.

**Required reading for `/architecture` and `/pipeline`:**
- `packages/design-system/src/Breadcrumb.tsx` + `.stories.tsx` — slot/`LinkComponent`/`dsProps` conventions to mirror.
- `packages/design-system/src/ds-attrs.ts` — `dsProps` marker helper.
- `packages/web/src/layouts/AppShell.tsx` (≈line 567–620, `mainContent`) — the `overflow-hidden` page-host that forces the scroll rule.
- `.claude/rules/visual-regression.md` — the DOM-snapshot net + the `>= 56` enumeration guard to bump.
- `.claude/rules/aesthetic-quality.md` (AQ-004 type scale, AQ-007 caps tracking).
- The 10 primary page files enumerated in `approved.md`.

## Phase 6 — Self-critique

- *Rejection list real & distinct?* Yes — PageHeader-vs-toolbar, PageHeader-vs-scaffold, SectionLabel-vs-tile-label, SectionLabel-vs-divider are four genuinely different confusions, each with a load-bearing reason.
- *Name collisions verified?* Yes — grepped `SectionHeader`/`PageHeader`; only the Sidebar private `SectionHeader` exists; renamed our primitive to `SectionLabel`.
- *Contracts complete?* Cardinality, closure, mutability, identity, hard rules all pinned. Closure split (slots open / typography closed) is the crux and is explicit.
- *Rationale concrete?* Yes — driven by the verified `overflow-hidden` host fact and the enumerated forks, not vibes.
- *Right files touched?* No domain doc reshaped (correct — UI only); ground truth deferred to `/write-docs` into `docs/ui-design/` + `DESIGN.md`.

**Locked.**
