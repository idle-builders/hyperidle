# AI7 — Page anatomy: APPROVED design (locked input to /architecture)

DESIGN-CLASS: routine. Single ratified variant of the existing de-facto standard. No new look. Embodied + rendered: `plans/AI7/design/ratified/variant.tsx` + `screenshot.png`.

## The ratified standard

### 1. Scroll rule (AC2) — PINNED HEADER, settled
Every primary page is a fixed-height flex column:
```
<div className="flex flex-col h-full">            // page scaffold root
  <PageHeader … />                                  // shrink-0, never scrolls
  <div className="flex-1 overflow-y-auto"> … </div> // body owns scroll; page owns body content
</div>
```
**Why pinned (not a taste call):** the AppShell page-host (`AppShell.tsx` ≈line 573, `mainContent`) is `flex-1 flex flex-col overflow-hidden min-w-0` — a bounded, non-scrolling container. A page that wants any scroll MUST own an internal `overflow-y-auto`; a pinned `shrink-0` header is the only pattern that keeps orientation stable inside that host. The scroll-away-header pages (WorkTeam, WorkRoutine) and the headerless-strip pages (AgentProfile) are the anomalies and adopt this scaffold.

### 2. PageHeader primitive (AC1, AC3)
A stateless DS primitive that owns the title treatment + pinning + bottom rule. Slots accept arbitrary nodes; typography/padding are closed (no per-page size/tracking props — that is what AI7 closes).

**Encoded class strings (the de-facto standard, verbatim):**
- Strip: `shrink-0 px-[24px] py-[18px] border-b border-[var(--border-subtle)]`
- Title: `text-[20px] font-[600] tracking-[-0.01em] text-[var(--text-primary)] min-w-0 truncate`
- Title row: `flex items-center justify-between gap-[12px]`
- Actions cluster: `flex items-center gap-[9px] shrink-0`
- Subtitle/meta: `mt-[3px] text-[13px] text-[var(--text-tertiary)]`
- Leading wrapper: `mb-[6px]`

**Props / slots:**
| Prop | Type | Role |
|---|---|---|
| `title` | `ReactNode` (required) | Rendered as `<h2>` with the title treatment. Truncates on overflow. |
| `leading` | `ReactNode?` | Breadcrumb / nav cluster row above the title. Wrapped in `mb-[6px]` when present. |
| `subtitle` | `ReactNode?` | Meta line below the title row (e.g. "Phase: build · Lead: Dana"). |
| `actions` | `ReactNode?` | Trailing cluster on the title row (StatusChip, Buttons). |
| `data-testid` | `string?` | Passthrough for page-level test hooks. |

- Renders semantic `<header>`. Spreads `dsProps("PageHeader", "1")`.
- Page injects `Breadcrumb`/`NavHistoryCluster`/`StatusChip`/`Button` as nodes — PageHeader imports none of them (stays router-agnostic + dependency-free, mirroring `Breadcrumb`'s `LinkComponent` discipline).

**States:**
- Title-only (no slots): renders just the strip + title.
- All slots: leading + title + actions + subtitle (see screenshot).
- Long title: `truncate` + `min-w-0` keeps the strip single-line; full text stays in DOM for a11y.
- The header is stateless; empty/loading/error are the *page body's* concern — loading/error/not-found branches still render their own minimal headers or the PageHeader with a title (pages keep current behavior; see migration notes).

### 3. SectionLabel primitive (AC1, AC3)
The uppercase opener of a body section.

**Encoded class strings:**
- Row: `flex items-center justify-between gap-[12px]` + spacing (`mb-[9px]`; with divider: `pb-[6px] mb-[9px] border-b border-[var(--border-subtle)]`)
- Label: `text-[13px] font-[600] uppercase tracking-[0.06em] text-[var(--text-tertiary)]`

**Props / slots:**
| Prop | Type | Role |
|---|---|---|
| `label` | `ReactNode` (required) | The uppercase label text. |
| `as` | `"h2" \| "h3" \| "h4"?` | Heading element for the document outline. Default `h3` (PageHeader title is the page's `h2`). Pages that use it as the top heading pass `as="h2"`. |
| `trailing` | `ReactNode?` | Same-row trailing slot (a count, a "New"/"Create" button). |
| `divider` | `boolean?` | Optional bottom rule. Default **false** (de-facto majority has no divider on the label); WorkTask/WorkBet pass `true`. |
| `data-testid` | `string?` | Passthrough. |

- Spreads `dsProps("SectionLabel", "1")`. Renders the heading element named by `as`.

**Rejected as essential, offered as knobs:** the bottom divider (optional, default off); the heading level (`as`, because document outline differs per page).

### 4. Out of scope (stays inline, page-owned)
- **Metric-tile labels** (11px/12px uppercase inside KeyValue tiles in WorkTask/WorkBet) — different scale + role; NOT SectionLabel. Untouched.
- **Filter pill rows** (WorkPortfolio, KnowledgeList) — page controls; stay in the body or below the title, NOT in PageHeader.
- **Page body composition** — owned by each page; the team page body is AG1's (coordinate: PageHeader must drop cleanly above an AG1-owned body — it does, since the scaffold body is page-owned).

## Migration list — every primary page + its current deviation → target
All ten adopt the scaffold + PageHeader; section-bearing pages adopt SectionLabel.

| Page (file) | Current deviation | Migration |
|---|---|---|
| `WorkPortfolio.tsx` | conformant (inline) | Replace inline header with `<PageHeader title=… actions=…>`. Filter pills stay in body. |
| `WorkBet.tsx` | conformant; one 12px section variant at ~L1170 | `<PageHeader>`; replace inline section titles with `<SectionLabel divider>`; the 12px variant → 13px. |
| `WorkTask.tsx` | conformant; `SECTION_TITLE` const | `<PageHeader>`; replace `SECTION_TITLE` const + usages with `<SectionLabel divider>`. Tile labels (11px) untouched. |
| `Conversations.tsx` | conformant | `<PageHeader title=… subtitle=… actions=…>` (header has live-dot meta + actions). |
| `KnowledgeList.tsx` | conformant | `<PageHeader title=… actions=…>`; filter pills stay. |
| `KnowledgeDetail.tsx` | conformant (h1 title) | `<PageHeader title=… actions=…>` (title becomes h2); sidebar 12px labels → `<SectionLabel as="h2">` 13px. |
| `KnowledgeCreate.tsx` | **inline-style title on `<input>`** | Keep the editable `<input>`, but its font/weight/tracking must come from the standard, not inline `style`. PageHeader's title slot accepts the `<input>` node styled with the title classes (the title treatment is shared via class, not inline style). Actions slot holds Cancel/Create. |
| `WorkTeam.tsx` | **scroll-away header; `text-sm font-heading uppercase tracking-wider` title; `text-xs font-heading` sections** | Adopt scaffold (root → `flex flex-col h-full` + scrolling body); `<PageHeader title={team.name} leading={Breadcrumb} subtitle={phase·lead} actions={StatusChip}>`; section `<h2>`s → `<SectionLabel>`. **AG1 owns the body composition below the header — coordinate.** |
| `WorkRoutine.tsx` | **no pinned strip; `text-sm font-heading` title; `text-xs font-heading` sections** | Same scaffold + PageHeader + SectionLabel migration as WorkTeam. |
| `AgentProfile.tsx` | **no page-title header; `text-[11px] font-heading tracking-caps` section h2s** | Add scaffold + `<PageHeader>` (title = agent name; the identity block stays in the body); section h2s → `<SectionLabel>`. |

**`font-heading` purge:** appears in WorkTeam, WorkRoutine, AgentProfile (three files, not the spec's two). After migration: zero occurrences in page files. `tracking-wider` (WorkTeam, WorkRoutine) → gone with the same edits.

## AC5 — cross-page consistency proof (NOT Playwright)
The spec's "Playwright sweep" is stale. Proof of cross-page consistency:
1. **Both primitives are story-backed** — `PageHeader.stories.tsx` + `SectionLabel.stories.tsx` added to `packages/design-system/src/`, auto-enumerated by the **vitest DOM-snapshot net** (`catalog-snapshot.test.tsx`). The committed `.snap` is the canonical serialized treatment; any drift fails the net.
2. **Adoption everywhere** — a lint/grep gate (architecture decides exact mechanism) asserts zero `font-heading`, zero `tracking-wider`, and zero inline page-title font-size/tracking in `packages/web/src/pages/`.
3. **Enumeration guard bump** — the `>= 56` threshold in `catalog-snapshot.test.tsx` rises to `>= 58` (two new root stories). (If story files are split further, bump to match.)
4. **Live TSX viewer at :8098** — the primitives render there for the design-critique gate.

No Playwright golden PNGs, no Docker, no pixel diffs.

## Rejected directions (do not re-litigate)
- **A combined `<Page>` component** that renders scaffold + header + scrolling body together — rejected: forces the DS to own each page's body layout, which pages (and AG1) must own. The scaffold stays a class convention.
- **Scroll-away headers** (keep WorkTeam/WorkRoutine as-is) — rejected: inconsistent with the host's `overflow-hidden` and every other page.
- **Keeping the small-caps `text-sm` title** on team/routine — rejected: it is a different treatment (uppercase label, not a page title); the 20px sentence-case title is the de-facto majority and the real page title.
- **Folding metric-tile labels into SectionLabel** via a `size` prop — rejected: re-opens the size fork AI7 closes; they are a different role at 11px.
- **Always-on section divider** — rejected as essential; offered as `divider` (default off) because half the pages have no rule.
- **A new token for the title treatment** — rejected: Hearth tokens only; the treatment is literal grid/scale values already on the allowlist (20px, 600, -0.01em).

## Open questions for the architect
- Exact gate mechanism for AC5 #2 (ESLint rule vs an existing grep-based check) — architecture decides; concept's hard rule #2 is the spec.
- KnowledgeCreate: confirm the title `<input>` can take the shared title classes cleanly (it can — same font/weight/tracking, just on an `<input>` with `bg-transparent border-none outline-none`). Architecture specifies whether PageHeader exposes this via the `title` slot taking the input node, or a small `titleAs` affordance. Recommendation: pass the `<input>` as the `title` node (slot is `ReactNode`), apply title classes to the input. No new prop needed.
- Mobile: pages already render in the three-tab mobile shell; PageHeader inherits the same strip. No mobile-specific adaptation beyond what pages do today (the `leading` cluster already hides on mobile via `sidebarMobile` checks the page owns).
