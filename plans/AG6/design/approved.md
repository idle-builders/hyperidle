# AG6 — Approved design: `Row` + `ItemList` shared item-row/table primitive

**Chosen:** Variant B (Self-contained, column-config), score 8.6, plus `RowDot` helper from C. Variant A and C-compound-exports rejected (see `synthesis.md` — do not re-litigate).

This is the **input contract** to `/architecture`. The architect does NOT re-decide visual hierarchy, component vocabulary, or interaction grammar. It decides file paths, exact TS types, task ordering, test plan.

---

## 1. The primitive: anatomy

One flex line. Left→right:

```
[ lead? ]  [ title (+ subtitle?) : flex-1 min-w-0 ]  [ cells[] : shrink-0 ]  [ actions? : shrink-0 ]
```

| Slot | Content | Treatment (primitive-owned) |
|---|---|---|
| `lead` | status dot (`RowDot`), `Avatar`, or icon circle. **Omitted → renders nothing, no placeholder** (AQ-113). | `shrink-0`, inline-flex, `gap-[9px]` if multiple. |
| `title` | primary text — **required** | `text-[13px] font-[500] text-[var(--text-primary)] truncate`. One per row (Hierarchy rule). |
| `subtitle` | secondary line under title | `text-[12px] text-[var(--text-tertiary)] truncate`. |
| `cells[]` | trailing meta cells | `text-[11px] font-mono text-[var(--text-tertiary)]`, fixed width, right-align default, `tabular-nums` when `numeric` (AQ-006). Each `shrink-0`. |
| `actions` | trailing buttons | `shrink-0`, `flex gap-[3px]`. **Presence flips the row wrapper element** (see §4). |

Row container (always applied, identical for every consumer):
- `flex items-center gap-[12px]`
- `min-h-[44px]` (AQ-015 touch target — primitive owns it, consumer cannot forget)
- horizontal padding `px-[6px]` (inside an `ItemList` that already has `p-[12px]`); standalone rows can take `px-[12px]` via an ItemList variant — see §3
- separator: `border-b border-[var(--border-subtle)] last:border-b-0` (provided by ItemList context, see §3)
- hover: the established sibling-row hover token `bg-[color-mix(in_oklab,var(--accent-primary)_4%,var(--surface-elevated))]` `transition-colors duration-[var(--motion-fast)]` (only when `onClick`) — same as KnowledgeRow/NotificationRow/`clickable.ts`. **Prefer reusing `clickableProps`/`clickable.ts`**, which already bundles this exact hover + focus-visible + `duration-[var(--motion-fast)]`. The raw `rgba(44,36,26,0.02)` in the mockup HTML is mockup-only and must NOT carry into TSX (AQ-008 no hardcoded color, AQ-018 warm tint must trace to a token).
- focus-visible: `outline outline-1 outline-[var(--accent-primary)] -outline-offset-1`

All values on the Hearth 6px grid + closed type/radius/motion scales. No new tokens.

## 2. The container: `ItemList`

Owns the list-surface chrome and the empty/loading/error/populated states.

- Container surface: `rounded-[var(--r-subtle)] bg-[var(--surface-container)] p-[12px]` (the repeated WorkTeam wrapper, now centralized).
- A `variant="contained" | "flush"` prop:
  - `contained` (default): the surface-container wrapper above. Used by Work-view agents/routines.
  - `flush`: no wrapper, rows sit on the page; horizontal padding moves to `px-[24px]` on each row (matches the catalogued ThreadRow/KnowledgeRow `px-[24px]` anatomy and KnowledgeList full-width lists).
- Renders separators between rows (last row none).
- State props (mutually exclusive precedence: error → loading → empty → children):
  - `loading?: boolean` + `loadingRows?: number` → renders `SkeletonList rows={loadingRows ?? 4}` with matching aria-label.
  - `error?: { title?; description; onRetry? }` → renders `ErrorState`.
  - `empty?: { title; description; icon?; action?; dataTestId? }` → renders `EmptyState` when `children` is empty.
  - else → renders `children` (the `<Row>`s).

## 3. Row ↔ ItemList relationship

- `Row` reads padding/separator behavior from the `ItemList` it's inside via React context (`ItemListContext` carries `variant`). A `<Row>` outside an `ItemList` defaults to `contained` padding (`px-[6px]`) but still renders standalone (ds stories render bare rows).
- `ItemList` may also be driven declaratively: `rows?: RowProps[]` as an alternative to `children`. Either works; `children` is canonical for JSX call sites, `rows` for pure-config lists. (Architecture picks whether to ship both or just children — children is the floor; `rows` is a nicety.)

## 4. Nested-button accessibility (HARD constraint — non-negotiable)

When a row has BOTH a row-level navigation click AND inner real `<button>` actions (Customize, mute, dismiss), the row wrapper MUST be `div role="button"` + `tabIndex={0}` + `onKeyDown` (Enter/Space, `preventDefault`). A real `<button>` wrapper is INVALID (nested buttons break SR + cause hydration errors — AB2 S4/W4, AF8 W1 lore).

**The primitive decides automatically:**
- `Row` renders `<button>` when `onClick` is set AND `actions` is absent/empty.
- `Row` renders `<div role="button" tabIndex=0 onKeyDown>` when `onClick` is set AND `actions` is present.
- `Row` renders a plain `<div>` (or `<li>` in list context) when `onClick` is absent.

This preserves the existing AgentRow/RoutineRow/notification-row behavior exactly. Consumers can also force the wrapper via an explicit `as?: "button" | "div"` escape hatch, but the default heuristic must be correct so they rarely need it.

Inner action buttons MUST call `e.stopPropagation()` (primitive does not do this for consumer nodes — document it; consumers wiring `actions` are responsible, matching today's code).

## 5. `RowDot` helper

`RowDot` — exported. `<RowDot tone="success" | "warning" | "error" | "info" | "neutral" label?={string} />`.
- 6px circle, `tone` → `--status-*` / `--text-tertiary` for neutral.
- `label` present → `role="img" aria-label={label}` (SR conveys health, AB2 S2); absent → `aria-hidden`.
- Used by: agents (health), routines (state), notifications (urgency), threads (unread — separate, optional).
- **`RowDot` is justified-distinct from the existing `LiveDot`** (static tone-keyed status vs pulsing live-activity accent). Builder must NOT copy `LiveDot` markup — author `RowDot` fresh; do not reuse the pulse animation.

## 6. States (with copy)

| State | Surface | Copy (consumer-supplied, examples) |
|---|---|---|
| Populated | rows | — |
| Empty | `EmptyState` via `ItemList.empty` | Agents: "No agents" / "No agents are assigned to this team." · Routines: "No routines" / "This team has no recurring work configured." · Knowledge curated: "No knowledge items yet" / "Agents will populate this scope as they learn." |
| Loading | `SkeletonList` via `ItemList.loading` | aria-label e.g. "Loading agents" |
| Error | `ErrorState` via `ItemList.error` | "Couldn't load …" + retry |
| Selected row | `Row selected` → `aria-current="true"` + `bg-[var(--surface-elevated)]` + `shadow-[var(--shadow-subtle)]` + left `border-l-[var(--bw-strong)] border-[var(--accent-primary)]` + `rounded-[var(--r-subtle)]` | (generalized from ThreadRow.selected) |

## 7. Behavior + motion + keyboard

- Hover: bg tint `color-mix(in_oklab,var(--accent-primary)_4%,var(--surface-elevated))` (the shared sibling-row hover token, via `clickableProps`), `--motion-fast`. Honors `prefers-reduced-motion` (color transition only — AQ-014 compliant, no layout transitions).
- Focus-visible: 1px accent outline, offset -1.
- Keyboard: row activates on Enter/Space (when `onClick`); inner action buttons are native and tab-focusable in DOM order after the row.
- No keyboard-verb shortcuts in the primitive (founder filter). Page-level shortcuts (KnowledgeList j/k/v/x) stay in the page.

## 8. Mobile adaptation

- Desktop-first. At viewport ≤1024px the 44px target already holds (always-on).
- `RowCell.hideBelow?: number` (px) — a cell may collapse below a breakpoint via a `max-[Npx]:hidden` utility; title + lead + actions always persist. Default: cells stay (no hidden). Used sparingly on the mobile three-tab layout; not required for the AG6 migrations.

## 9. Migration scope (what /architecture must wire)

Required (AC-2, AC-4):
1. **WorkTeam agents list** → `ItemList variant="contained"` + `Row` (lead=`RowDot`+`Avatar`, cells=[status, context], actions=[Customize], auto `div role=button`). Delete local `AgentRow`. Preserve all `data-testid`s: `agent-row`, `agent-status`, `agent-context`, `agent-customize-btn`, `agent-card-category`.
2. **WorkTeam routines list** → `ItemList variant="contained"` + `Row` (lead=`RowDot`, cells=[avatar, schedule, lastRun, cost]). Delete local `RoutineRow`. Preserve `routine-row` testid.
3. **KnowledgeList rows** (the "one more" surface) → `Row` via `ItemList variant="flush"` (full-width `px-[24px]`). Delete local `KnowledgeListRow`. Curated + triage both. Triage keeps inline validate/reject/open buttons via `actions` (auto `div role=button`, `<li>` semantics preserved). Preserve `knowledge-row`, `knowledge-time`, `kind-badge`, `status-badge`, `private-badge` testids and `data-focused`.

Opportunistic (not gated): NotificationPopover row → `Row` (lead=`RowDot` urgency, cells=[type label, time], actions=[mute, dismiss]).

Keep distinct (justified): `ThreadRow`, `CommentRow`, `BetRow` (card). `BetRow`'s container may adopt `ItemList variant="flush"` only if zero-regression.

## 10. AC → design element map

| AC | Design element |
|---|---|
| AC-1 (primitive catalogued + stories: plain/status/trailing-action/selected/empty) | §1–§6; `Row.stories.tsx` + `ItemList.stories.tsx` at /designsystem |
| AC-2 (agents+routines+1 more via primitive) | §9.1–§9.3 |
| AC-3 (one alignment/separator/hover/focus/44px) | §1 container rules — primitive-owned, identical everywhere |
| AC-4 (new list = compose, not copy; bespoke work rows removed/reduced) | §9 deletes AgentRow/RoutineRow/KnowledgeListRow; `RowProps`/`RowCell[]` is the thin config |
| AC-5 (empty+loading consistently via primitive/companions) | §2 `ItemList` empty/loading/error companions |
| AC-6 (Playwright screenshots of 2+ surfaces, AQ-clean) | agents + routines + knowledge rendered through `Row`; visual test in /designsystem stories + page E2E |

## 11. Open questions for the architect

1. Ship `ItemList.rows` (declarative array) in addition to `children`, or children-only? (Recommend children-only floor; add `rows` only if a pure-config consumer appears — YAGNI.)
2. `RowCell.content` typed as `ReactNode` — confirm cells stay "dumb" (mono tertiary), not a re-divergence vector. Lint/test guard?
3. `Row` in a `<ul>`/`<li>` context (KnowledgeList) vs `<div>` context (WorkTeam): expose `as="li"`? (Knowledge curated uses `<ul><li>`; triage uses `<li>` for keyboard nav.) Recommend `ItemList as="ul"` → rows render `<li>`.
4. Data-testid passthrough on `Row` and `RowCell` (E2E selector preservation — C4 pattern).
5. HTML reference files (`Row.html`, `ItemList.html`) for visual-parity gate — designer (me) authors these in the build phase, or builder adapts these mockups? (Per visual-parity rule, HTML is design source of truth.)
