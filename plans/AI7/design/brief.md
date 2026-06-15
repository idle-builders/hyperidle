DESIGN-CLASS: routine  ref=Breadcrumb+inline-header-pattern  pattern=WorkBet/WorkTask/Conversations pinned header

# AI7 — Page anatomy: design brief

## Why routine (Phase 0a)
- **Existing component reference:** YES — concept names two primitives that encode an in-tree de-facto standard; `Breadcrumb` is the model for slot/`LinkComponent`/`dsProps` conventions.
- **Pattern match:** YES — the pinned-header pattern is already embodied on 6+ pages (WorkBet, WorkTask, WorkPortfolio, Conversations, KnowledgeList, KnowledgeCreate, KnowledgeDetail). The 13px section title is already inline in WorkTask (`SECTION_TITLE` const) and WorkBet.

Both axes match → `routine`. This is a consolidation/ratification, not an exploration. One variant + a "considered but rejected" list. The spec, concept, and CRITICAL constraints all forbid a new look.

## Phase 0b — Reuse inventory
| Visual element needed | Resolution |
|---|---|
| Page title typography (20px/600/-0.01em) | Currently inline on every page. NEW primitive `PageHeader` (encodes it once). Extension impossible — there is no existing header component to extend; the standard lives only as repeated class strings (which is how it forked). |
| Pinned header strip (px-24 py-18, border-b, shrink-0) | Same — `PageHeader` encodes the strip + pinning. |
| Section title (13px uppercase, tracking-0.06em) | Currently inline / `SECTION_TITLE` const / forked to `font-heading` 12px. NEW primitive `SectionLabel`. |
| Breadcrumb in header leading slot | REUSE `Breadcrumb` (DS) — injected as a node into PageHeader's `leading` slot. |
| Back/forward cluster | REUSE `NavHistoryCluster` — composed inside the Breadcrumb `leading`, passed through PageHeader. |
| Status chip beside title | REUSE `StatusChip` — injected into PageHeader actions/title-trailing slot. |
| Header action buttons | REUSE `Button` — injected into PageHeader `actions` slot. |
| Page scaffold (flex col h-full + scrolling body) | NOT a component — ratified class convention. The host (`AppShell.tsx` mainContent) is `overflow-hidden`, so pages own internal scroll. |

Two NEW shapes total (PageHeader, SectionLabel). Both prove "used in 2+ contexts" overwhelmingly — every primary page.

## Phase 0 — Settled questions (all pinned by spec/concept; nothing unsettled to ask)
1. **Scroll rule:** pin headers. Confirmed by the host-container fact (`overflow-hidden` page-host) + de-facto majority. No probe needed.
2. **Primitive APIs:** PageHeader = title + leading + subtitle + actions slots; SectionLabel = label + trailing + optional divider + `as`. Settled below.
3. **AC5 mechanism:** vitest DOM-snapshot net (NOT Playwright). The new stories auto-enumerate; bump the `>= 56` guard. Settled.

## Verified per-page deviation map (read from source, not the spec's summary)
| Page | Root | Header | Title treatment | Section titles |
|---|---|---|---|---|
| WorkPortfolio | `flex flex-col h-full` ✓ | pinned ✓ | 20px/600/-0.01em ✓ | (filter pills, no section labels) |
| WorkBet | `flex flex-col h-full` ✓ | pinned ✓ | 20px/600/-0.01em ✓ | inline 13px uppercase 0.06em ✓ (also a 12px variant at line 1170) |
| WorkTask | `flex flex-col h-full` ✓ | pinned ✓ | 20px/600/-0.01em ✓ | `SECTION_TITLE` const 13px ✓ (tile labels 11px = out of scope) |
| Conversations | `flex flex-col h-full` ✓ | pinned ✓ | 20px/600/-0.01em ✓ | (thread shell owns body) |
| KnowledgeList | `flex flex-col h-full` ✓ | pinned ✓ | 20px/600/-0.01em ✓ | (filter pills) |
| KnowledgeDetail | `flex flex-col h-full` ✓ | pinned ✓ | 20px/600/-0.01em ✓ (h1) | sidebar labels 12px uppercase 0.06em (rail meta — borderline; ratify to SectionLabel 13px) |
| KnowledgeCreate | `flex flex-col h-full` ✓ | pinned ✓ | **inline-style title** on `<input>` (fontSize 20 etc.) — DEVIATION | aside label 12px uppercase 0.06em |
| **WorkTeam** | **`flex-1 overflow-y-auto`** ✗ scroll-away | **no pinned header** ✗ | **`text-sm font-heading uppercase tracking-wider` h1** ✗ (a small-caps label, NOT the 20px title) | **`text-xs font-heading ... tracking-wider`** ✗ (12px + undefined `font-heading`) |
| **WorkRoutine** | **`flex flex-col gap-12 h-full`** (no pinned header strip) ✗ | header inside scroll col ✗ | **`text-sm font-heading uppercase tracking-wider` h1** ✗ | **`text-xs font-heading ... tracking-wider`** ✗ |
| **AgentProfile** | `flex flex-col gap-12 h-full` (no pinned header strip) ✗ | header inside scroll col ✗ | (no 20px title — identity block instead) | **`text-[11px] font-heading ... tracking-caps`** ✗ (undefined `font-heading`, 11px) |

**Key correction vs spec:** WorkTeam/WorkRoutine/AgentProfile don't merely "scroll away a 20px title" — their title is a *small uppercase label* (`text-sm`/`text-xs font-heading`), a different treatment entirely. Ratifying = these pages adopt the real 20px PageHeader title. AgentProfile has no page-title-shaped header at all today; it needs a PageHeader added (its agent identity block stays in the body). `font-heading` appears on WorkTeam, WorkRoutine, AND AgentProfile — three files, not two.
