# J2 — Shell Navigation Redesign — Implementation Plan

**Branch:** `feat/J2-shell-navigation-redesign`
**Spec:** `docs/work-packages/TRACK-J.md` lines 43–66
**Design canon:** `docs/design-synthesis/ShellSynthesis.html` rows 02 (IconRail), 03 (Rail), 04 (Submenu)
**Depends on:** J1 (merged) — density vars + Tag.kind primitive

---

## 1. Context

Today's shell renders three regions with a "works but mute" affordance budget:

- `IconRail` shows ghost buttons with `btn-active` background only for the active view. No edge indicator. No unread surface.
- `Rail` collapsed state renders two neutral DaisyUI badges (`bets.length`, `blockers.length`) with no semantic color and no third "paused" pill.
- `Submenu` renders title + collapse chevron + `NavItem` list. No mono header, no count bubble at title level, no segmented filter row.

J2 lifts those three components to the synthesis design without touching layout, routing, or the four-region shell composition.

---

## 2. Constraints

- **Roving focus contract** (`useRovingFocus`) is preserved verbatim. New buttons in IconRail/Rail must register into the same hook so Arrow/Home/End/Enter/Esc behavior is unchanged. Item count grows; `onSelect` mapping grows.
- **No new fonts, no new color tokens.** `--primary`, `--error`, `--surface-*`, `--text-*` are the palette. Mono = the existing `font-mono` Tailwind utility (already used in Rail headers).
- **Component budget** (rules/frontend.md): no new top-level custom component unless necessary. Pills and the filter row are composed inside the existing shell components — they are not additions to the 19-component custom set.
- **Unread data flows from one source.** AC line 62: "Unread data flows from same source as expanded Rail (no duplicate subscription)." See section 3 for current source.
- **Filter state is local**, not URL-persisted. Resets to "All" when `activeView` changes (AC line 64).
- **Strict TS, no `any`.** Explicit return types on exports.
- **Protected tests** (no regression AC, line 53–54): see section 9.

---

## 3. Unread / count data flow today

The single source of truth for the per-view counts is `SUBMENU_CONFIG` in `packages/web/src/layouts/AppShell.tsx` (lines 31–50): each view's submenu items declare an optional `count`. The Conversations Review item carries `count: 3`, Chat carries `count: 1`, Knowledge `All Items` carries `count: 12`. Work has no counts.

**Current consumers of these counts:**

1. `AppShell` itself reads `SUBMENU_CONFIG[activeView]` and passes it into `Submenu` children as `<NavItem ... count={item.count} />`.

That's the only consumer. `IconRail` does not see counts today and `Rail` ignores them entirely (Rail uses `MOCK_RAIL_BETS` / `MOCK_RAIL_BLOCKERS` from `fixtures/app-shell-data.ts`).

**Decision for J2:** the per-view *unread* signal already lives in `SUBMENU_CONFIG`. Promote it to a typed value object and pass an `unreadByView: Record<ViewId, number>` map down to `IconRail`, computed once in `AppShell` from the same config. This satisfies "no duplicate subscription" — the Submenu and IconRail both consume the same in-memory object, computed at render time from the one config block.

The collapsed-Rail pill counts (BLK/REV/PSD) are **a different signal** — they reflect Rail's own portfolio state (bets/blockers/paused), not the per-view unread count. Both signals are display-only today (mock data); both will swap to the same React Query subscription later (J9+). The plan reuses the existing `bets`/`blockers` props and adds a `paused` count derived from `bets` (`status === "paused"`).

### CONFUSION: PSD pill source of truth
I'm uncertain whether the PSD ("Paused") count comes from `bets[]` filtered by `status === "paused"` or from a separate `paused` collection.

Options:
A) Derive PSD from `bets.filter(b => b.status === "paused").length` — consequences: zero new props; reuses BetItem; consistent with current Rail data shape; PSD never shows a non-bet entity even if a paused agent should count.
B) Add a third `paused: PausedItem[]` prop alongside `bets`/`blockers` — consequences: explicit signal, future-proof for paused agents/sessions distinct from bets, but adds prop surface and a new fixture; pre-MVP we have no producer.

**Proceeding with (A)** because: today Rail only knows about bets, blockers, and cost; introducing a new entity type is out-of-scope for J2 (it's a presentation story). Flagged for the next agent that wires real data.

---

## 4. Design

### 4.1 IconRail — `packages/web/src/shell/IconRail.tsx`

**New props (additive, all optional to keep callers compiling):**

```ts
export interface IconRailProps {
  activeView: ViewId;
  onViewChange: (view: ViewId) => void;
  onAvatarClick?: () => void;
  avatarUrl?: string;
  /** Per-view unread count. Missing key or 0 = no dot. */
  unreadByView?: Partial<Record<ViewId, number>>;
}
```

**Render changes inside the existing `<button>`:**

- Wrap the icon in a `<span class="relative">` so children can absolutely-position.
- **2px left edge indicator** for active: render a `<span aria-hidden class="absolute left-0 top-1 bottom-1 w-0.5 bg-[var(--primary)]" />` only when `isActive`. Tailwind `w-0.5` = 2px (factory-dark theme uses default Tailwind spacing scale).
- **6px notification dot** for inactive views with unread: render a `<span aria-hidden class="absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-error" />` only when `!isActive && (unreadByView?.[viewId] ?? 0) > 0`. `h-1.5 w-1.5` = 6px.
- ARIA: when dot present, append " - N unread items" to the existing `aria-label` (AC line 63). E.g. `aria-label="Conversations - 3 unread items"`.

**Roving focus:** unchanged. Item count and indices remain `VIEW_IDS.length`. The dot/edge are presentational, not focusable.

### 4.2 Rail — `packages/web/src/shell/Rail.tsx`

**New props:** none. Counts derive from existing `bets` / `blockers`:

```ts
const blkCount = blockers.length;
const revCount = bets.filter(b => b.status === "review").length;
const psdCount = bets.filter(b => b.status === "paused").length;
```

**Collapsed branch (the `if (!expanded)` block, lines 130–151):** replace the two neutral `badge`s with up to three `Pill` spans. Render a pill *only when count > 0*:

```
[BLK 2]  ← bg-error/15, text-error, font-mono, uppercase
[REV 1]  ← bg-primary/15, text-primary, font-mono, uppercase
[PSD 3]  ← bg-base-300, text-base-content, font-mono, uppercase (neutral)
[expand chevron]  ← unchanged
```

Each pill is a `<span>` (non-interactive — the whole collapsed Rail clicks to expand via the chevron). Spec "Pills only render when count > 0" is line 51 of the story; if all three counts are zero, only the chevron renders (consistent with "communicate at a glance — silence when nothing").

**Pill markup (inline composition, no new component file):** factor a private `function CollapsedPill({ kind, count }: { kind: "blk" | "rev" | "psd"; count: number })` inside `Rail.tsx`. Lives next to `SectionHeader`. Returns `null` when count is 0. Class map for kind → tone uses Tailwind classes only; no new tokens.

**ARIA:** each pill gets `aria-label="N blockers"` / `"N reviews"` / `"N paused bets"` so screen readers announce the semantic, not the abbreviation.

**Expanded branch:** unchanged. Section headers + collapsible body + Esc-to-collapse roving focus all preserved.

### 4.3 Submenu — `packages/web/src/shell/Submenu.tsx`

**New props:**

```ts
export type SubmenuFilter = "all" | "needs-review" | "chats" | "resolved";

export interface SubmenuProps {
  title: string;
  collapsed: boolean;
  onToggleCollapse: () => void;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  /** Total count rendered in the title bubble. Hidden when undefined. */
  count?: number;
  /** Available filter chips for this view. Empty array = no filter row. */
  filters?: ReadonlyArray<{ id: SubmenuFilter; label: string }>;
  /** Currently selected filter id. Required when `filters` is non-empty. */
  activeFilter?: SubmenuFilter;
  /** Selection callback. Required when `filters` is non-empty. */
  onFilterChange?: (id: SubmenuFilter) => void;
  children: ReactNode;
}
```

**Header:** apply `font-mono uppercase tracking-wider text-xs` to the existing title `<span>` (already uses `font-heading` — swap to `font-mono` to match synthesis row 04). Add a count bubble next to it: `{count !== undefined && <span class="badge badge-sm badge-ghost font-mono">{count}</span>}`.

**Filter row:** when `filters?.length > 0`, render below the header (above the search field if any):

```
<div role="tablist" aria-label="Filter {title}" class="flex gap-1">
  {filters.map(f => (
    <button
      role="tab"
      aria-selected={f.id === activeFilter}
      class={f.id === activeFilter
        ? "btn btn-xs btn-primary"
        : "btn btn-xs btn-ghost"}
      onClick={() => onFilterChange?.(f.id)}
    >{f.label}</button>
  ))}
</div>
```

DaisyUI primitives (`btn btn-xs`, `btn-primary`, `btn-ghost`) per frontend rules — no new wrapper component.

**Per-view filter wiring** (in `AppShell.tsx`, alongside `SUBMENU_CONFIG`):

```ts
const SUBMENU_FILTERS: Record<ViewId, ReadonlyArray<{ id: SubmenuFilter; label: string }>> = {
  conversations: [
    { id: "all", label: "All" },
    { id: "needs-review", label: "Needs review" },
    { id: "chats", label: "Chats" },
    { id: "resolved", label: "Resolved" },
  ],
  knowledge: [
    { id: "all", label: "All" },
    { id: "needs-review", label: "Needs review" },
  ],
  work: [],
};
```

**Filter state in AppShell** (local, resets on view change):

```ts
const [filter, setFilter] = useState<SubmenuFilter>("all");
useEffect(() => { setFilter("all"); }, [activeView]);
```

J2 only renders the filter UI and threads the value through `Submenu`. **It does not change which child rows render** — the Conversations / Knowledge pages will read `filter` in J4 / J5. For J2, AppShell passes `filter` and `setFilter` to `Submenu`; the children list under each view is unchanged.

### 4.4 AppShell glue — `packages/web/src/layouts/AppShell.tsx`

Additive only:

1. Compute `unreadByView` from `SUBMENU_CONFIG` (sum of item counts per view, treating undefined as 0). Pass to `IconRail`.
2. Compute `submenuTotalCount` from `submenuConfig.items` and pass as `<Submenu count={…} />`.
3. Add filter state, pass `filters / activeFilter / onFilterChange` to `Submenu`.

No changes to `Rail` props (the new pills derive from existing `bets`/`blockers`).

---

## 5. Files to create / modify

**Modify (production):**

- `packages/web/src/shell/IconRail.tsx` — add `unreadByView` prop, edge indicator, dot, ARIA.
- `packages/web/src/shell/Rail.tsx` — replace collapsed badges with `CollapsedPill` trio.
- `packages/web/src/shell/Submenu.tsx` — mono header, count bubble, filter row.
- `packages/web/src/layouts/AppShell.tsx` — derive `unreadByView`, `submenuTotalCount`, filter state; thread through.
- `packages/web/src/shell/IconRail.stories.tsx` — add `with-unread` and `active-with-others-unread` story states.
- `packages/web/src/shell/Rail.stories.tsx` — add `collapsed-with-pills`, `collapsed-empty`, `collapsed-only-blk` stories.
- `packages/web/src/shell/Submenu.stories.tsx` — add `with-filters-conversations`, `with-filters-knowledge`, `no-filters-work` stories.

**Create (tests):**

- `packages/web/src/__tests__/IconRail.unread.test.tsx` — new test file. **Do NOT edit `IconRail.test.tsx`.**
- `packages/web/src/__tests__/Rail.collapsed-pills.test.tsx` — new file. **Do NOT edit `Rail.test.tsx`.**
- `packages/web/src/__tests__/Submenu.filters.test.tsx` — new file. **Do NOT edit `Submenu.test.tsx`.**
- `packages/web/e2e/rail-collapsed-pills.spec.ts` — Playwright E2E (AC line 54).

**Optional (only if `SubmenuFilter` ends up used outside `Submenu`):**

- A `SubmenuFilter` type export from `shell/Submenu.tsx` is sufficient — no new shared file.

---

## 6. Test matrix

### Unit (Vitest, RTL) — 11 tests across three new files

**`IconRail.unread.test.tsx` (4):**

1. Inactive view with `unreadByView={{ conversations: 3 }}` and `activeView="work"` → query `screen.getByRole("button", { name: /conversations/i })` and assert it has a child element with `bg-error` (the dot).
2. Active view with unread → renders the 2px left-edge indicator (`bg-[var(--primary)]`) AND no dot (active suppresses dot).
3. `unreadByView={{ conversations: 5 }}` on inactive view → button's `aria-label` contains "5 unread items".
4. No `unreadByView` prop → no dot rendered for any inactive view (back-compat).

**`Rail.collapsed-pills.test.tsx` (5):**

1. Collapsed + 2 blockers + 1 review bet + 0 paused → BLK pill shows "2", REV pill shows "1", no PSD pill in the DOM.
2. Collapsed + all-zero counts → no pills rendered, only the expand chevron.
3. Collapsed + 3 paused bets only → only PSD pill renders, with text "3" and `aria-label` "3 paused bets".
4. Collapsed BLK pill uses error color class (`text-error` or `bg-error/15`); REV uses `text-primary`; PSD uses neutral (`text-base-content`).
5. Expand chevron still present and clickable when all counts zero (degenerate case still yields a usable Rail).

**`Submenu.filters.test.tsx` (5):**

1. With `count={3}` → mono badge with "3" rendered next to title.
2. With `filters=[All, Needs review]` and `activeFilter="all"` → two `role="tab"` buttons rendered, "All" has `aria-selected="true"`.
3. Click "Needs review" tab → `onFilterChange` called with `"needs-review"`.
4. With `filters=[]` → no tablist rendered.
5. Title has `font-mono` class (header style change).

(Total = 14, not the 8–12 the brief asked for — I'd rather over-specify the new contract than under-specify it. If we need to trim, items 4 from each set are nice-to-haves.)

### Playwright E2E — 1 spec, 2 tests

**`packages/web/e2e/rail-collapsed-pills.spec.ts`:**

1. Start at `/`, ensure Rail is in collapsed state (resize viewport below the breakpoint that triggers `breakpoint.railExpanded === false`, OR click the collapse button), assert at least one of BLK/REV/PSD pills visible with the seeded mock data (`MOCK_RAIL_BETS` has `b2` blocked + `MOCK_RAIL_BLOCKERS` has 1 high-severity entry → BLK pill should render with count 1).
2. After clicking the expand chevron, the BLK pill is no longer in the DOM and the "Active Bets" section header reappears (proves toggle round-trips).

---

## 7. Risks

1. **Breakpoint-driven Rail state** — `useViewportBreakpoint` collapses Rail at small viewports. The Playwright test must explicitly set the viewport (e.g. `await page.setViewportSize({ width: 1024, height: 768 })`) or click the collapse toggle to enter the collapsed state deterministically. Don't rely on default test viewport.
2. **`btn-active` class drift in IconRail** — the existing test asserts the active button's `className !== inactive button's className`. Adding the edge indicator child does NOT change the button's own className (we add a child span). Verify this by reading test line 60–62 before changing classes; if you also change the button's class, you'll silently still pass the test but break visual parity.
3. **PSD source assumption** — see CONFUSION above. If the next agent wires real data and PSD comes from elsewhere, the `bets.filter(status==='paused')` derivation must be replaced.
4. **Filter state leakage** — `useEffect(() => setFilter("all"), [activeView])` runs after the new view's first render, meaning the first render uses the *previous* filter for one frame. For J2 (presentation only — children don't yet read the filter), this is invisible. Flag for J4.
5. **ARIA tab semantics** — using `role="tablist"` on the filter row implies a sibling `role="tabpanel"` somewhere. The submenu children are not technically a tabpanel. If a11y audit complains, drop to `role="group"` + `aria-pressed` toggle buttons. Cite WAI-ARIA 1.2 Tab pattern: <https://www.w3.org/WAI/ARIA/apg/patterns/tabs/>. ⚠️ UNVERIFIED for our specific layout — verify via axe-core in the unit tests.
6. **Dot positioning edge case** — `-top-0.5 -right-0.5` puts the dot half-overlapping the icon button border. Tailwind 3+ supports negative margins / positions natively; on Tailwind 4 (if upgraded mid-track) the syntax is unchanged but verify against `tailwindcss.com/docs/top-right-bottom-left` for the project's installed version before relying on it.

---

## 8. Out of scope

- Replacing `MOCK_RAIL_BETS` / `MOCK_RAIL_BLOCKERS` with real API data (J9+).
- Wiring filter state into Conversations Review / Knowledge list rendering — that lives in J4 / J5 acceptance criteria.
- Pre-existing lint errors on `main` (per J1 retro lesson).

---

## 9. Protected test files (must remain byte-identical)

The "no regressions" AC (line 53) is binding. These files describe the existing public contract of the three shell components and must NOT be modified during the red phase or as a workaround for new behavior. New behavior gets new test files (section 5).

- `packages/web/src/__tests__/IconRail.test.tsx`
- `packages/web/src/__tests__/Rail.test.tsx`
- `packages/web/src/__tests__/Submenu.test.tsx`
- `packages/web/src/__tests__/AppShell.test.tsx` — composition test, also relies on current Rail collapsed shape; treat as protected. If a J2 implementation requires it to change, that's a signal the design broke a contract — stop and re-plan.
- `packages/web/src/__tests__/use-roving-focus.test.tsx` — keyboard contract.
- `packages/web/src/__tests__/shell-types.test.ts` — view enumeration.
- `packages/web/e2e/navigation.spec.ts` — existing E2E that asserts the four-region shell still renders (the new pills must coexist with `Active Bets` reappearing when expanded).
- `packages/web/e2e/keyboard-and-responsive.spec.ts` — touches breakpoint-driven collapse.

If any protected test starts failing during implementation, the failure is the bug, not the test. Fix the implementation, not the test.

---

## 10. Acceptance-criterion → evidence map

| AC (story line) | Evidence |
|---|---|
| 50 — IconRail 2px active indicator | `IconRail.unread.test.tsx` #2 + `IconRail.stories.tsx` `active` state |
| 50 — IconRail 6px notification dot | `IconRail.unread.test.tsx` #1, #3 |
| 51 — Three semantic pills BLK/REV/PSD with counts | `Rail.collapsed-pills.test.tsx` #1, #4 + Playwright #1 |
| 51 — Pills only when count > 0 | `Rail.collapsed-pills.test.tsx` #2, #3 |
| 51 — Expand chevron still present | `Rail.collapsed-pills.test.tsx` #5 (and existing protected `Rail.test.tsx` collapsed expand-button test still passes) |
| 52 — Mono header + count bubble | `Submenu.filters.test.tsx` #1, #5 |
| 52 — Conversations/Knowledge segmented filter row | `Submenu.filters.test.tsx` #2, #3 + `AppShell` wiring of `SUBMENU_FILTERS` |
| 52 — Work submenu has no filters | `Submenu.filters.test.tsx` #4 + `SUBMENU_FILTERS.work === []` |
| 53 — Roving focus preserved | Existing protected `IconRail.test.tsx` keyboard suite + `Rail.test.tsx` keyboard suite still green |
| 54 — Playwright E2E for collapsed Rail pill | `e2e/rail-collapsed-pills.spec.ts` |
| 62 — Single source of truth for unread | `unreadByView` derived in AppShell from `SUBMENU_CONFIG`; no new fetch path |
| 63 — Dot ARIA "N unread items" | `IconRail.unread.test.tsx` #3 |
| 64 — Filter resets to All on view change | Add `Submenu.filters.test.tsx` #6 (optional 12th test): rerender with new `activeView` → `useEffect` fires → `setFilter("all")` |
