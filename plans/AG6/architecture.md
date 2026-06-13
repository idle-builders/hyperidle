# AG6 — Architecture: shared `Row` + `ItemList` item-row/table primitive

**Fixed input:** `plans/AG6/design/approved.md` (Variant B + `RowDot`). Visual contract, slots, states, nested-button rule = locked. This plan decides types, files, task order, tests.

## Required reading (builder)
- `plans/AG6/design/approved.md`, `synthesis.md` (the locked design + rejection list).
- `packages/design-system/DESIGN.md`, `.claude/rules/aesthetic-quality.md`, `.claude/rules/visual-parity.md`, `.claude/rules/design-system.md`.
- Source to migrate: `packages/web/src/pages/WorkTeam.tsx` (AgentRow §580, RoutineRow §748, BetRow §828), `packages/web/src/pages/KnowledgeList.tsx` (KnowledgeListRow §249).
- Reference rows: `packages/design-system/src/{ThreadRow,KnowledgeRow,NotificationRow}.tsx`, `EmptyState.tsx`, `ErrorState.tsx`, `Skeleton.tsx`, `clickable.ts`, `ds-attrs.ts`.

## Plan reconciliation (spec ⇆ reality)
| Spec assumption | Reality | Plan handling |
|---|---|---|
| 4 catalogued rows share a base | They independently re-implement the same anatomy; no base | Create `Row`+`ItemList` base; rows compose or stay distinct per synthesis. |
| Work view hand-rolls 3 rows | Confirmed: `AgentRow`/`RoutineRow`/`BetRow` in `WorkTeam.tsx`; container wrapper `rounded-subtle bg-surface-container p-[12px]` repeated 2× | Collapse AgentRow+RoutineRow onto `Row`/`ItemList`; BetRow stays card. |
| `KnowledgeListRow` reimplements `KnowledgeRow` | Confirmed: local component §249, two branches (triage with `showActions`, curated) | Collapse onto `Row` via `ItemList variant="flush"`. |
| Testids in tests | `agent-row`, `agent-status`, `agent-customize-btn`, `agent-card-category`, `routine-row`, `kind-badge`, `knowledge-row`, `knowledge-time` used in unit tests + e2e (`time-vocabulary.spec.ts`, `L13-product-drilldown.spec.ts`) | **All testids preserved** — passed through `Row`/`RowCell` `data-testid`. Migration must not break these. |
| Stories auto-discovered | `import.meta.glob("./*.stories.tsx")` in design-system | New stories at `packages/design-system/src/{Row,ItemList}.stories.tsx` auto-appear at `/designsystem`. |
| HTML visual-parity files | `packages/design-system/html/*.html` are design source of truth | Designer authors `Row.html` + `ItemList.html` from approved mockups (adapt `plans/AG6/design/b-self-contained/mockup.html`). TSX matches within 5% (`npm run ds:sync`). |

## Acceptance criteria + verification

| # | Criterion | Verification |
|---|---|---|
| AC-1 | `Row`+`ItemList`(+`RowDot`) exist in design-system, exported from `index.ts`, with stories showing plain / status-indicator / trailing-action / selected / empty | `npm run check` (importable types); `Row.stories.tsx`+`ItemList.stories.tsx` render the 5 named states; `DesignSystem.test.tsx` story-discovery passes. Component test asserts each state renders. |
| AC-2 | WorkTeam agents+routines + KnowledgeList render through `Row`/`ItemList` not bespoke rows | Component tests: `WorkTeam` renders `data-ds-component="Row"` for agent/routine rows; `KnowledgeList` rows carry it. Existing `WorkTeam.*.test.tsx` + `KnowledgeList` tests stay green. |
| AC-3 | Rows share one alignment/separator/hover/focus + 44px target ≤1024px | Component test: `Row` always renders `min-h-[44px]`; lint `design/require-touch-target-min` clean; visual story shows hairline separators + hover. |
| AC-4 | New list = compose primitive; bespoke work rows removed/reduced | `AgentRow`,`RoutineRow`,`KnowledgeListRow` deleted from source (grep returns 0 definitions). Migration tasks T6–T8. |
| AC-5 | Empty+loading handled consistently via `ItemList` companions | Component test: `<ItemList loading>` renders `SkeletonList`; `<ItemList empty={…}>` renders `EmptyState`; `<ItemList error={…}>` renders `ErrorState`. |
| AC-6 | Visual test: Playwright screenshots of ≥2 surfaces, AQ-clean | E2E captures agents list + routines list (+ knowledge); reviewer visual check vs `.claude/rules/aesthetic-quality.md` — zero hard-rule violations. |

## Type contracts

```ts
// packages/design-system/src/RowDot.tsx
export type RowTone = "success" | "warning" | "error" | "info" | "neutral";
export interface RowDotProps {
  tone: RowTone;
  /** present → role="img" + aria-label (SR conveys status); absent → aria-hidden */
  label?: string;
}
export function RowDot(props: RowDotProps): JSX.Element;

// packages/design-system/src/Row.tsx
export interface RowCell {
  content: ReactNode;                 // string or node — kept deliberately dumb (mono tertiary)
  width?: number;                     // px fixed width; default auto
  align?: "start" | "end";            // default "end"
  numeric?: boolean;                  // → tabular-nums (AQ-006)
  tone?: RowTone;                     // undefined → text-tertiary; "neutral" also → text-tertiary; other tones → --status-*. Single spelling — no "default" alias.
  hideBelow?: number;                 // px breakpoint; cell hidden below it (mobile)
  "data-testid"?: string;
}
export interface RowProps {
  title: ReactNode;                   // REQUIRED, primary, flex-1 truncate
  subtitle?: ReactNode;               // tertiary line, truncate
  lead?: ReactNode;                   // RowDot | Avatar | icon circle; omitted → NO placeholder (AQ-113)
  cells?: RowCell[];                  // trailing meta cells
  actions?: ReactNode;                // trailing buttons; presence → div role=button wrapper
  onClick?: () => void;
  selected?: boolean;
  /** escape hatch; default heuristic (§nested-button) is correct without it */
  as?: "button" | "div" | "li";
  "data-testid"?: string;
  "data-focused"?: string;            // KnowledgeList triage keyboard focus
}
export function Row(props: RowProps): JSX.Element;

// packages/design-system/src/ItemList.tsx
export interface ItemListEmpty {
  title: string; description: string;
  icon?: ReactNode; iconBg?: string; action?: ReactNode; dataTestId?: string;
}
export interface ItemListError {
  title?: string; description: string; onRetry?: () => void;
}
export interface ItemListProps {
  children?: ReactNode;               // <Row> elements
  variant?: "contained" | "flush";    // default "contained"
  as?: "div" | "ul";                  // "ul" → rows render <li> (KnowledgeList)
  loading?: boolean;
  loadingRows?: number;               // default 4
  loadingLabel?: string;              // SkeletonList aria-label
  error?: ItemListError | null;
  empty?: ItemListEmpty;              // empty-state content, rendered when isEmpty && not loading/error
  isEmpty: boolean;                   // REQUIRED explicit empty flag. No implicit React.Children counting (footgun); every consumer passes x.length===0.
  "data-testid"?: string;
}
export function ItemList(props: ItemListProps): JSX.Element;
```

State precedence in `ItemList`: `error` → `loading` → (`empty` when `isEmpty === true`) → `children`. **`isEmpty` is the single empty signal** — no implicit empty-on-no-children path (`React.Children` counting dropped as a footgun; the SUGGESTION's third signal removed). T3 asserts the explicit `isEmpty` branch only.

`Row` reads `variant`/`as` from `ItemListContext` (React context). Standalone `<Row>` (ds stories) defaults to `contained` padding, renders fine outside a provider.

**Hover (token form — do NOT transcribe the mockup rgba).** Row hover, focus-visible, and motion come from the existing `clickableProps`/`clickable.ts` helper, which already bundles `bg-[color-mix(in_oklab,var(--accent-primary)_4%,var(--surface-elevated))]` + `outline outline-1 outline-[var(--accent-primary)] -outline-offset-1` + `duration-[var(--motion-fast)]` — identical to KnowledgeRow/NotificationRow. The `rgba(44,36,26,0.02)` literal in the mockup HTML is mockup-only; emitting it in TSX fails AQ-008 (no hardcoded color) + AQ-018 (warm tint must trace to a token) and breaks `npm run lint` (eslint-plugin-design `no-hardcoded-color`) in T2. T2 reuses `clickableProps`; it does not hand-write the hover.

`RowDot` (T1) is justified-distinct from the existing `LiveDot` (static tone dot vs pulsing accent dot) — author it fresh; do NOT copy `LiveDot` markup or its pulse animation.

## Nested-button wrapper heuristic (HARD — design §4)
- `onClick` set, `actions` empty/absent → `<button type="button">`.
- `onClick` set, `actions` present → `<div role="button" tabIndex={0} onKeyDown>` (Enter/Space preventDefault). Reuse `clickableProps` pattern; do NOT use a real `<button>`.
- `onClick` absent → plain `<div>` (or `<li>` when `as="li"`/`ItemList as="ul"`).
- `as` prop overrides the heuristic. `li` + `onClick` + `actions` → `<li>` containing the row chrome, row-level interactivity via inner `div role=button` (matches KnowledgeList triage + NotificationPopover today).
- Document: inner `actions` buttons must `e.stopPropagation()` (consumer-owned).

## Design-it-twice — `ItemList` state-render ownership
- **Option A: `ItemList` owns empty/loading/error.** Container switches on props. Single place for all four list states. Trade-off: container must know `isEmpty`. Reject reason: none material.
- **Option B: page owns states, `ItemList` is populated-only.** Pages keep their own `EmptyState`/`SkeletonList` calls (status quo). Trade-off: AC-5 ("consistently through the primitive or its companions") unmet — every page re-wires it differently, the current bug. Reject.
- **Synthesis: A.** `ItemList` owns the four states via companions. Pages with bespoke empty layouts (KnowledgeList full-page empty, hint banners) keep those *outside* `ItemList` — `ItemList.empty` covers the in-list empty only. WorkTeam's per-section `EmptyState` calls move into `ItemList.empty`.

## Files

Create:
- `packages/design-system/src/RowDot.tsx`
- `packages/design-system/src/Row.tsx` (+ `ItemListContext`)
- `packages/design-system/src/ItemList.tsx`
- `packages/design-system/src/Row.stories.tsx`
- `packages/design-system/src/ItemList.stories.tsx`
- `packages/design-system/html/Row.html`, `packages/design-system/html/ItemList.html` (designer-authored, from `plans/AG6/design/b-self-contained/mockup.html`)
- Tests: `packages/design-system/src/Row.test.tsx`, `ItemList.test.tsx`, `RowDot.test.tsx`

Modify:
- `packages/design-system/src/index.ts` — export `Row`, `ItemList`, `RowDot` + their prop/`RowCell`/`RowTone` types.
- `packages/web/src/pages/WorkTeam.tsx` — delete `AgentRow`, `RoutineRow`; render via `ItemList`+`Row`. Keep `BetRow` (card) and `StatTile`.
- `packages/web/src/pages/KnowledgeList.tsx` — delete `KnowledgeListRow`; render via `ItemList variant="flush" as="ul"`+`Row`.

`sharedFiles`: `packages/design-system/src/index.ts`.
`protectedTests`: `packages/web/src/__tests__/WorkTeam.AA1.test.tsx`, `WorkTeam.AB2.test.tsx`, `packages/web/src/pages/__tests__/WorkTeam.AB3.test.tsx`, `packages/web/e2e/L13-product-drilldown.spec.ts`, `packages/web/e2e/time-vocabulary.spec.ts` (assertions must not change — testids/behavior preserved through migration).

## Migrations (every call site)

**WorkTeam agents (T6)** — `AgentRow` → `Row`:
- `lead`: `<><RowDot tone={healthTone} label={healthDetail}/><Avatar initials size="sm" agent/></>`
- `title`: name + `— Lead` marker (when `isLead`).
- `cells` (pinned order — `agent-card-category` is asserted in 3 protected tests, do not churn): `[{content:<category Tag>, "data-testid":"agent-card-category"}, {content: status, width:48, tone:statusTone, "data-testid":"agent-status"}, {content: contextText, width:140, align:"start", tone: contextIsError?"error":undefined, "data-testid":"agent-context"}]`. Category `Tag` is the **first cell** (preserves existing before-status placement). `tone` undefined → text-tertiary (no `"default"` literal).
- `actions`: Customize `<button data-testid="agent-customize-btn" onClick={e=>{e.stopPropagation();onCustomize()}}>` → wrapper becomes `div role=button` automatically.
- `data-testid="agent-row"`, `onClick=onNavigate`. Wrap section in `<ItemList variant="contained" empty={{title:"No agents",description:"No agents are assigned to this team."}} isEmpty={roster.length===0}>`.

**WorkTeam routines (T7)** — `RoutineRow` → `Row`:
- `lead`: `<RowDot tone={routineTone}/>`.
- `title`: routine.name.
- `cells`: `[{content:<agent avatar 24px>}, {content:scheduleLabel,width:80,align:"start"}, {content:lastRunLabel,width:60,numeric:true}, {content:costLabel,width:54,numeric:true}]`.
- `data-testid="routine-row"`, `onClick=onNavigate`. `<ItemList variant="contained" empty={{title:"No routines",description:"This team has no recurring work configured.",dataTestId:"team-routines-empty"}} isEmpty={routines.length===0}>`.

**KnowledgeList (T8)** — `KnowledgeListRow` → `Row` via `ItemList variant="flush" as="ul"`:
- Curated row: `title`, `subtitle=preview`, `cells:[{content:<kind badge> data-testid:"kind-badge"},{content:<StatusChip> data-testid:"status-badge"},{content:<Private tag> data-testid:"private-badge"},{content:timestamp,width:60,"data-testid":"knowledge-time"}]`, `onClick`, `data-testid="knowledge-row"`. (Kind badge keeps `kindBadgeStyle` — it's a kind, not a status; stays a styled span in the cell.)
- Triage row: same + `actions` = validate/reject/open buttons (existing SVG glyphs), `data-focused`, `as="li"` already from `ItemList as="ul"`. Keyboard nav (j/k/v/x) stays in `KnowledgeListContent` page effect — primitive is unaware.
- Loading/error inside content: replace inline `SkeletonList`/`ErrorState` blocks with `<ItemList loading={apiLoading} error={apiError?{description:apiError}:null} empty={…} isEmpty={…}>`. Full-page systemEmpty layout + hint banners stay outside `ItemList`.

**Opportunistic (not gated):** NotificationPopover row → `Row` (lead=`RowDot` urgency, title, cells=[type label, time], actions=[mute,dismiss]). Skip if it risks the AF8 popover behavior; document as follow-up if so.

## Stories plan
- `Row.stories.tsx`: `Plain`, `WithStatusDot`, `WithAvatarLead`, `WithCells`, `WithTrailingAction`, `Selected`, `Subtitle`, `NoLeadNoPlaceholder`. Default export `{title:"Row", tier:"2", uses:["RowDot","Avatar","StatusChip","Tag"]}`.
- `ItemList.stories.tsx`: `Populated`, `Empty`, `Loading`, `Error`, `Flush`, `AsUl`. (Covers AC-1 "empty list" state.)

## Security & abuse cases
- Rate-limit / POST-PATCH: N/A — pure presentational primitive, no network.
- Input-trust boundary: `title`/`cells.content` may render agent-authored strings → React escapes by default; no `dangerouslySetInnerHTML`. `data-testid`/`data-focused` spread as plain string attrs (C4 pattern). N/A beyond default escaping.
- Path traversal / SSRF / secrets: N/A — no paths, URLs, or credentials.

## Risks / ambiguities
1. `cells: RowCell[]` could become a re-divergence vector if consumers stuff complex nodes into `content`. Mitigation: cells render with fixed mono-tertiary styling regardless of content; document "cells are dumb meta slots". (Open Q2 from approved.md.)
2. Kind badge in KnowledgeList is a non-status colored pill (`kindBadgeStyle`) — stays a styled span inside a cell, not coerced to `tone`. Acceptable; not a status.
3. `WorkTeam` agent context cell uses `align:"start"` + flex width — verify it still truncates and doesn't break the fixed-cell model. Use `width` + `align:start` + truncate.
4. Visual-parity: builder must run `npm run ds:sync` for Row/ItemList HTML vs TSX (≤5%). Designer authors HTML in build phase.

## Ordered task list
1. **T1** — `RowDot.tsx` + `RowDot.test.tsx` (tone→color, label→role=img/aria-hidden). No deps.
2. **T2** — `Row.tsx` + `ItemListContext` + `Row.test.tsx`: anatomy, slots, 44px, hover/focus, nested-button heuristic (button vs div role=button vs li), tabular-nums on numeric cells, no-lead-no-placeholder, selected treatment, testid passthrough. Dep: T1.
3. **T3** — `ItemList.tsx` + `ItemList.test.tsx`: variant contained/flush, as div/ul, state precedence error→loading→empty(via required `isEmpty` flag, single signal — no children-counting)→children via `ErrorState`/`SkeletonList`/`EmptyState`. Dep: T2.
4. **T4** — `Row.stories.tsx` + `ItemList.stories.tsx`. Dep: T2,T3.
5. **T5** — export from `index.ts`; `npm run check`. Dep: T2–T4.
6. **T6** — migrate WorkTeam agents; delete `AgentRow`; keep all testids; run `WorkTeam.AB2/AB3` tests. Dep: T5.
7. **T7** — migrate WorkTeam routines; delete `RoutineRow`; run `WorkTeam.AA1` tests. Dep: T5.
8. **T8** — migrate KnowledgeList; delete `KnowledgeListRow`; run KnowledgeList tests + `time-vocabulary.spec.ts`. Dep: T5.
9. **T9** — designer authors `html/Row.html` + `html/ItemList.html`; `npm run ds:sync` ≤5%. Dep: T2,T3.
10. **T10** — E2E visual: screenshot agents + routines (+ knowledge) lists; AQ review. `npm run verify`. Dep: T6–T9.

## AC → task map
AC-1→T1,T2,T3,T4,T5 · AC-2→T6,T7,T8 · AC-3→T2 · AC-4→T6,T7,T8 (deletes) · AC-5→T3 · AC-6→T9,T10.
