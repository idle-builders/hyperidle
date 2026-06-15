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
| `title` | `ReactNode` (required) | Rendered as a heading with the title treatment (tag set by `level`, default `<h1>`). Truncates on overflow. |
| `level` | `1 \| 2?` | Heading level for the title's DOM tag. **Default `1`** — a page title is the top of the document outline, so the page's PageHeader title is its single `<h1>`. Pass `2` only for a sub-page whose title is NOT the document's top heading. **No migrated page needs `2`.** AMENDMENT (Phase-4 review): replaces the earlier "always `<h2>`" rule, which broke two protected `level: 1` assertions (WorkTeam, WorkRoutine) and left migrated pages with no h1. The visual treatment is level-invariant — `pageTitleClassName` (20px/600/-0.01em) is identical for both; only the tag changes. |
| `leading` | `ReactNode?` | Breadcrumb / nav cluster row above the title. Wrapped in `mb-[6px]` when present. |
| `subtitle` | `ReactNode?` | Meta line below the title row (e.g. "Phase: build · Lead: Dana"). |
| `actions` | `ReactNode?` | Trailing cluster on the title row (StatusChip, Buttons). |
| `data-testid` | `string?` | Passthrough for page-level test hooks. |

- Renders semantic `<header>` wrapping the title heading (`<h1>` by default, `<h2>` when `level={2}`). Spreads `dsProps("PageHeader", "1")`.
- Page injects `Breadcrumb`/`NavHistoryCluster`/`StatusChip`/`Button` as nodes — PageHeader imports none of them (stays router-agnostic + dependency-free, mirroring `Breadcrumb`'s `LinkComponent` discipline).

**States:**
- Title-only (no slots): renders just the strip + title.
- All slots: leading + title + actions + subtitle (see screenshot).
- Long title: `truncate` + `min-w-0` keeps the strip single-line; full text stays in DOM for a11y.
- The header is stateless; empty/loading/error are the *page body's* concern. **AC2 requires the scaffold (pinned header + scrolling body) on EVERY return branch, not just the populated one** — loading / error / not-found branches each root the scaffold and render a minimal `<PageHeader title=…/>` with the spinner/EmptyState in the scrolling body. (Multi-branch pages: WorkTeam 5 branches, WorkRoutine 4, AgentProfile 4 — see migration notes + architecture tasks 18–20.)

### 3. SectionLabel primitive (AC1, AC3)
The uppercase opener of a body section.

**Encoded class strings:**
- Row: `flex items-center justify-between gap-[12px]` + spacing (`mb-[9px]`; with divider: `pb-[6px] mb-[9px] border-b border-[var(--border-subtle)]`)
- Label: `text-[13px] font-[600] uppercase tracking-[var(--tracking-caps-sm)] text-[var(--text-tertiary)]` (the token `--tracking-caps-sm` = 0.06em; NOT the literal `tracking-[0.06em]` — `design/no-hardcoded-tracking` is error on DS src and the rendered look is identical)

**Props / slots:**
| Prop | Type | Role |
|---|---|---|
| `label` | `ReactNode` (required) | The uppercase label text. |
| `as` | `"h2" \| "h3" \| "h4"?` | Heading element for the document outline. Default `h3` — a section opener nests below the page title (now the page's single `h1`, PageHeader default level=1). Pages that use SectionLabel as the top body heading (KnowledgeDetail sidebar) pass `as="h2"`. |
| `trailing` | `ReactNode?` | Same-row trailing slot (a count, a "New"/"Create" button). |
| `divider` | `boolean?` | Optional bottom rule. Default **false** (de-facto majority has no divider on the label); WorkTask/WorkBet pass `true`. |
| `data-testid` | `string?` | Passthrough. |

- Spreads `dsProps("SectionLabel", "1")`. Renders the heading element named by `as`.

**Rejected as essential, offered as knobs:** the bottom divider (optional, default off); the heading level (`as`, because document outline differs per page).

> **AMENDMENT (Phase-4 review) — PageHeader heading level.** The original ratified rule "PageHeader title always renders `<h2>`" conflicted with reality on `origin/main`: WorkTeam (`WorkTeam.tsx:269`) and WorkRoutine (`WorkRoutine.tsx:196`) render their page title as `<h1>`, and two protected tests assert `level: 1` (`WorkRoutine.AA1.test.tsx:118` + `WorkProduct.test.tsx:121`, the renamed WorkTeam suite). Hardcoding `<h2>` would break both assertions and leave every migrated page with no `<h1>` (a page with no h1 is a poor a11y outline). **Resolution:** PageHeader gains `level?: 1 | 2`, **default `1`** — a page title is the top of its outline, so each primary page's PageHeader title is its single `<h1>`. The visual treatment is unchanged: `pageTitleClassName` (20px/600/-0.01em) is identical regardless of level; only the DOM tag swaps. **No migrated page needs a non-default level** — all ten title PageHeaders use the default `1`. SectionLabel's default stays `h3`.

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
| `KnowledgeDetail.tsx` | conformant (h1 title) | `<PageHeader title=… actions=…>` (title **stays h1** — PageHeader default level=1, so the existing h1 is preserved); sidebar 12px labels → `<SectionLabel as="h2">` 13px. |
| `KnowledgeCreate.tsx` | **inline-style title on `<input>`** | Keep the editable `<input>`; its font/weight/tracking comes from the standard, not inline `style`. PageHeader's title slot accepts the `<input>` node, and the input composes the **exported `pageTitleClassName`** const (`className={`${pageTitleClassName} bg-transparent border-none outline-none flex-1 p-0`}`) — the title treatment is owned by the primitive and shared by reference, not by a literal class fork. Actions slot holds Cancel/Create. (Architecture chose the exported-const affordance over a per-file lint exemption — see architecture.md §W1.) |
| `WorkTeam.tsx` | **scroll-away header; `text-sm font-heading uppercase tracking-wider` title; `text-xs font-heading` sections; 5 return branches (loading + 3 error/not-found + populated)** | Adopt scaffold (root → `flex flex-col h-full` + scrolling body) **on EVERY return branch**; populated branch: `<PageHeader title={team.name} leading={Breadcrumb} subtitle={phase·lead} actions={StatusChip}>`; loading/error/not-found branches: scaffold + minimal `<PageHeader>` + body-hosted state; section `<h2>`s → `<SectionLabel>`. **AG1 owns the body composition below the header — coordinate.** |
| `WorkRoutine.tsx` | **no pinned strip; `text-sm font-heading` title; `text-xs font-heading` sections; 4 return branches (loading + error + not-found + populated)** | Same scaffold + PageHeader + SectionLabel migration as WorkTeam, **applied to all 4 branches**. |
| `AgentProfile.tsx` | **no page-title header; `text-[11px] font-heading tracking-caps` section h2s; 4 return branches (loading + 2 error/not-found + populated)** | Add scaffold + `<PageHeader>` **on every branch** (populated: title = agent name, identity block stays in body; loading/error/not-found: minimal PageHeader + body-hosted state); section h2s → `<SectionLabel>`. |

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
- KnowledgeCreate: **RESOLVED (W1).** PageHeader exports a `pageTitleClassName` const (the canonical title class string the primitive's own title heading — `<h1>` by default — uses). KnowledgeCreate passes its `<input>` as the `title` node and composes `pageTitleClassName` onto it. This is an exported reference, not a literal combo, so `no-handrolled-page-header` does not fire — no per-file config exemption, no new structural prop. Chosen over a config `ignores` exemption because it keeps the title treatment owned by the primitive (the whole point of AI7) and survives future editable-title pages.
- Mobile: pages already render in the three-tab mobile shell; PageHeader inherits the same strip. No mobile-specific adaptation beyond what pages do today (the `leading` cluster already hides on mobile via `sidebarMobile` checks the page owns).
