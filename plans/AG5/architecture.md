# AG5 — Architecture: One Canonical Dropdown

Implements `plans/AG5/design/approved-draft.md`. Presentation/consolidation only — zero behavior change at call sites.

## 1. Components

### 1.1 `Select` (extend in place) — `packages/design-system/src/Select.tsx`

```ts
export interface SelectProps
  extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "size"> {
  label?: string;
  options: { value: string; label: string; disabled?: boolean }[];
  size?: "sm" | "md";        // NEW. default "md". "sm" = dense settings rows.
  placeholder?: string;       // NEW. emits a disabled value="" leading <option>.
}
export function Select(props: SelectProps): JSX.Element;
```

- `size` maps to two class fragments differing **only** in vertical padding / min-height; both keep `min-h-[44px]` at `≤1024px` via a responsive floor (AQ-015). `md` = current chrome (10px v-pad). `sm` ≈ 32px desktop control but `min-h-[44px]` under the touch breakpoint. Implement as `SELECT_CLASS_BASE` + `SELECT_SIZE[size]`; keep the `// hearth-internal-padding` directive.
- **Control width (C3 — REQUIRED FIX).** Today (verified at `Select.tsx:25,31`) `className` is applied to the **outer wrapper `<div>`** (`flex flex-col gap-[6px] ${className}`) and the inner `<select>` hard-codes `w-full` inside `SELECT_CLASS`. So `className="w-[88px]"` (currency) sizes the wrapper, not the control. **Fix: move `className` onto the inner `<select>` and append it after the base class** so a caller width override wins the cascade; the wrapper carries layout only (`flex flex-col gap-[6px]`, no caller class). Keep `w-full` as the base default by placing it in `SELECT_CLASS_BASE` **before** the appended `className`, so width-less sites stay full-width and `w-[88px]`/`w-full` overrides take effect (later utility wins under Tailwind's same-specificity last-wins ordering for `w-*`). **No new prop** — width is the only thing callers pass through; a `controlClassName`/width prop would add a second class slot and invite the drift AG5 exists to kill. Concretely:
  ```tsx
  // wrapper: layout only (no caller className)
  <div {...dsProps("Select","0")} className="flex flex-col gap-[6px]">
  // control: base + size + caller className (width override wins)
  <select className={`${SELECT_CLASS_BASE} ${SELECT_SIZE[size]} ${className}`} {...rest}>
  ```
  ⚠️ UNVERIFIED (Tailwind same-property last-wins): confirm in the visual gate that `w-[88px]` actually overrides the base `w-full` — if utility ordering doesn't resolve it, strip `w-full` from the base and apply it conditionally only when `className` contains no `w-` token. The behavior-preservation gate (§5) MUST assert the currency control renders at 88px and `w-full` sites render full-width.
- `placeholder` ⇒ prepend `<option value="" disabled>{placeholder}</option>` when set; selection still controlled by caller `value`.
- `options[].disabled` ⇒ pass through to `<option disabled>` (OrgChart team-empty case at `SettingsOrgChart.tsx:438`).
- Arrow, label, focus ring, `dsProps("Select","0")` unchanged. Native `<select>` retained → platform keyboard + SR roles + mobile native picker (a11y AC by construction).
- Update `Select.stories.tsx`: add `Sizes`, `WithPlaceholder`, `FullWidthVsFixed`, `DisabledOption` named exports. Keep HTML `html/Select.html` visually in parity (visual-parity rule — fix TSX to HTML if diff; arrow/chrome already match, so only additive states).

### 1.2 `Menu` (new, additive) — `packages/design-system/src/Menu.tsx` + `Menu.stories.tsx` + `html/Menu.html`

Generalized anchored action menu — **the single owner of the menu anatomy** (container, open/position/item-style, Escape/click-outside/keyboard). The two overflow menus render through it directly; `BlockActionsPopover` renders through it as a thin wrapper (C1 — see §1.2a). No component reimplements the anatomy.

```ts
export interface MenuItem {
  id: string;
  label: string;
  onSelect: () => void;
  disabled?: boolean;
  destructive?: boolean;     // red text (--status-error), Hearth red-only danger
  shortcut?: string;         // mono, right-aligned
  dataAttrs?: Record<string, string>;  // C4: arbitrary data-* spread onto the item button.
                             // bet items pass { "data-bet-action": "kill" } → literal data-bet-action attr;
                             // knowledge items pass { "data-testid": "knowledge-archive" }.
}
export interface MenuProps {
  open: boolean;
  onClose: () => void;
  items: MenuItem[];
  align?: "start" | "end";   // default "end" (right-0). maps to anchor side.
  label: string;             // aria-label on role=menu container
}
export function Menu(props: MenuProps): JSX.Element | null;
```

Behavior (lifted from `BlockActionsPopover` + the better of the two overflow menus):
- `role=menu`; items `role=menuitem`, `aria-disabled` on disabled.
- **Escape** closes (stopPropagation); **click-outside** closes (document `mousedown` listener gated on `open`, ref-contained — pattern already in `KnowledgeDetail.tsx:486`).
- Keyboard: ArrowUp/Down move focus across items, Home/End jump, Enter/Space invoke, Escape close, Tab closes. Focus moves into first item on open; returns to trigger on close. (`BlockActionsPopover` lacks arrow-nav today — `Menu` adds it so keyboard AC is met for the menu family.)
- Chrome: `absolute z-50 min-w-[160px] bg-[--surface-elevated] border border-[--border-subtle] rounded-[--r-default] shadow-[--shadow-elevated] p-[3px] flex-col gap-[3px]`; item `px-[12px] py-[9px] rounded-[--r-subtle] text-[13px] text-left hover:bg-[color-mix(...)] focus-visible:outline`. Destructive ⇒ `text-[--status-error]`. Matches `BlockActionsPopover` item chrome exactly (no new tokens).
- Trigger is **caller-owned** (the "···" button stays at the call site); `Menu` renders only the open panel. Caller passes `open`/`onClose`. This matches how `BlockActionsPopover` is used today (page-level open state) and avoids re-owning each site's button placement. **The caller-owned trigger keeps its own selectors** — `data-testid="bet-overflow-btn"` on the WorkBet trigger is NOT migrated and must survive unchanged (C4).
- **Per-item data attributes (C4):** each item button spreads `item.dataAttrs` verbatim. This is the single mechanism for E2E selector preservation: bet items emit literal `data-bet-action="<action>"` (queried by `AF12-lifecycle.spec.ts` + `L14-bet-actions.spec.ts` as `[data-bet-action="kill"]` etc.), knowledge items emit `data-testid="<id>"`. Chosen over a single `testId` prop (which would force one fixed attr name and break the bet e2e that queries `data-bet-action`, not `data-testid`).

### 1.2a `BlockActionsPopover` → thin wrapper that renders through `Menu` (C1 — COMMITTED)

`BlockActionsPopover` is **refactored** so it no longer owns a `role=menu` container, item chrome, or an Escape effect. It becomes a thin wrapper that:
- builds the block-action `MenuItem[]` (copy / delete / move / etc.) from its props,
- keeps its block-copy specialization local — the copy→"Copied" label flip, `liveRegionId`/`aria-live`, and the BlockHandle `aria-controls` wiring — by passing a copy item whose `onSelect` performs the clipboard write + label-flip state, and rendering its own `aria-live` region,
- delegates the entire menu container + open/position/item-style + Escape/click-outside/keyboard to `<Menu>`.

After this, the menu anatomy lives in **exactly one place** (`Menu`). `BlockActionsPopover` keeps its name and its two existing call sites (WorkBet block actions, KnowledgeDetail block actions) but is now a presentation-thin adapter. This is the **share** resolution of the AC "no two menus duplicate the same open/position/item-style by accident" — not the rejected "leave as-is" (which left two independent reimplementations = duplication). The strict rename to `Menu` was the alternative; it also passes the AC but costs a ripple across both call sites + tests + stories + HTML, so the wrapper is chosen on cost, not contract.

**Files this adds to §7:** `BlockActionsPopover.tsx` moves from "unchanged" to **edited** (refactor to render through `Menu`); its existing story + HTML + tests are re-verified against the now-delegated behavior (item chrome must stay pixel-identical since `Menu` lifts the same classes).

### 1.3 `RecipientPicker` — unchanged

Stays distinct. Add a `@lore AG5` comment at `packages/web/src/components/RecipientPicker.tsx:11` (extend existing Q1 lore): "Not folded into Menu (AG5): a searchable entity-directory panel with browse/selected/sending states + composer, not a transient action menu." No code change.

## 2. Barrel export — `packages/design-system/src/index.ts`

Add `export type { MenuItem, MenuProps } from "./Menu.js";` + `export { Menu } from "./Menu.js";` (alpha-ordered near `BlockActionsPopover`). `Select` already exported (`SelectProps` extended in place).

## 3. Call-site migration (ordered)

Each: replace hand-rolled `<select>` with `<Select>`, mapping current `<option>`s → `options[]`, preserving `value`/`onChange`/`disabled`/`aria-label`/width via `className`. **Selected value, change handler, and option set are copied verbatim — no behavior change.**

### Select sites (do all; AC: none remain)
1. `settings/SettingsModels.tsx` — :128, :149 (model tier ×2) → `size="sm"`.
2. `settings/SettingsAgents.tsx` — :355, :401, :518, :556 (role/model ×4) → `size="sm"`.
3. `pages/AgentAddDialog.tsx` — :180, :256 (role/model ×2) → `size="sm"`.
4. `pages/AgentEditDialog.tsx` — :276 (model) → `size="sm"`.
5. `pages/WorkBet.tsx` — :573 (currency, `className="w-[88px]"`); :1440 (inline-chromed select → `Select`, drop inline chrome).
6. `pages/knowledge/ScopeChangeDialog.tsx` — :176 (scope target) → `size="sm"`.
7. `pages/work/RoutineCreateDialog.tsx` — :188, :209, :230 (team/appetite/schedule ×3, `className="w-full"`).
8. `pages/work/BetCreateDialog.tsx` — :143 (team, `className="w-full"`).
9. `settings/SettingsOrgChart.tsx` — :358, :383, :408, :430 (from/mechanism/target ×4). **Delete the local `selectStyle` inline-style object**; pass `aria-label`; team-empty disabled option via `options[].disabled` or `placeholder`. (Leave `inputStyle` — text inputs are out of AG5 scope; only the *select* chrome is unified. Note if `inputStyle` is now orphaned, leave for AI-track / flag in arch — do not expand scope.)

### Menu sites (consolidate)
10. `pages/WorkBet.tsx:1075-1139` (bet-actions overflow) → caller keeps "···" button; render `<Menu open align="end" label="Bet actions" items={…}>`. Map activate/adjust-appetite/unblock (conditional) + `kill` (`destructive`). Replace `toggleAttribute("open")` DOM hack with React `useState` open.
    - **C4 — selectors:** the caller-owned trigger keeps `data-testid="bet-overflow-btn"` **untouched** (not migrated). Each item passes `dataAttrs={{ "data-bet-action": "<action>" }}` so the panel emits literal `data-bet-action="activate|adjust-appetite|unblock|kill"` — exactly what `AF12-lifecycle.spec.ts` + `L14-bet-actions.spec.ts` query (`[data-bet-action="…"]`). Do NOT emit `data-testid` on bet items (would not match those specs).
    - **C5 — remove the old toggle hack entirely:** when switching to `useState`-driven `Menu`, delete the per-bet `id={\`overflow-dropdown-${bet.id}\`}` and the `hidden [&[open]]:block` CSS toggle. No orphaned `overflow-dropdown-*` id refs may remain anywhere (grep after migration).
    - This is the highest-risk migration — do it last, run `AF12-lifecycle.spec.ts` + `L14-bet-actions.spec.ts` immediately after.
11. `pages/KnowledgeDetail.tsx:364-417` (`KnowledgeOverflowMenu`) → render `<Menu>`; keep `data-testid="knowledge-overflow-menu"` on the panel (via `Menu`'s container or a wrapper), `archiving` disabled state, Archive + Change scope items. Items pass `dataAttrs={{ "data-testid": "<id>" }}` (C4 — knowledge uses `data-testid`, not `data-bet-action`). Existing click-outside/Escape effect (:486) now lives in `Menu` — remove the duplicated effect from the page.

### MenuItem selector mechanism (C4 — settled in §1.2)
Selector preservation is via `MenuItem.dataAttrs?: Record<string,string>`, spread verbatim onto each item button — **not** a single fixed `testId` prop. Bet items emit `data-bet-action`; knowledge items emit `data-testid`. Both expressible through the same passthrough. This preserves all E2E/component selectors (`[data-bet-action="kill"]`, `[data-testid="knowledge-archive"]`) with no per-site special-casing.

## 4. Accessibility requirements (≥ native)

- **Select:** native element ⇒ full keyboard (open via Space/Down, type-ahead, commit Enter, close Esc), `role=combobox`/listbox by the platform, label association via `htmlFor`/`id`, visible focus ring (`focus:shadow ring`), disabled semantics. No regression possible — it *is* native. **C2 — keyboard parity is BY CONSTRUCTION, not test-proven:** jsdom cannot drive a native `<select>`'s open/type-ahead/commit keyboard, so no component test asserts it (any such test would be theatre). `Select.test.tsx` asserts the element is a native `<select>` (the construction that guarantees parity); the real keyboard interaction is covered only by Playwright in §6. Menu keyboard IS test-proven (it's a custom div tree — see below).
- **Menu:** `role=menu`/`menuitem`, `aria-disabled`, arrow/Home/End/Enter/Space/Esc keyboard, focus into menu on open + restore to trigger on close, click-outside close, `aria-haspopup="menu"` + `aria-expanded` on the caller trigger (KnowledgeDetail already sets these; add to WorkBet trigger). Visible `focus-visible` outline on items. This is **strictly better** than the bet menu's current state (no roles/Escape/click-outside today).

## 5. Test plan — AC → verification

| AC | Method | Where |
|---|---|---|
| Every select-style picker renders through one shared primitive; no hand-rolled `select select-sm select-bordered` remain | **ESLint rule** `design/no-handrolled-select` (static property) forbidding `className` containing `select-bordered`/`select select-sm` in `packages/web/src/**`, + forbidding inline `selectStyle` object pattern. Plus grep-style guard in CI. | new lint rule (`packages/eslint-plugin-design` or existing design plugin) |
| All dropdowns share resting/hover/focus/open/disabled appearance + keyboard | Component test: render `Select` in each `size`, assert single shared class source; visual test (below) for appearance parity | `Select.test.tsx` + Playwright |
| Popover menus consolidated OR documented-distinct; no accidental dup (SHARE not duplicate — C1) | Component test: bet + knowledge overflow both render via `Menu`; **`BlockActionsPopover` renders through `Menu`** (assert it produces a `Menu`-owned `role=menu` container — e.g. `data-ds-component="Menu"` present, and `BlockActionsPopover` no longer defines its own `role=menu`/item classes). Lint: no `role=menu` hand-roll outside `Menu`. RecipientPicker carries `@lore` (it uses `role=listbox`, not `role=menu`, so the lint doesn't flag it). | `Menu.test.tsx`, `BlockActionsPopover.test.tsx`, `WorkBet`/`KnowledgeDetail` tests |
| Select keyboard parity (C2) | **By construction, not test-proven.** `Select.test.tsx` asserts the rendered control is a native `<select>`; Playwright (§6) exercises real open/type/commit. jsdom can't drive native-select keyboard — no component test attempts it. | `Select.test.tsx` (native-element assertion) + Playwright |
| Control width preserved (C3/D4) | Component test: `Select className="w-[88px]"` renders the **inner `<select>`** with the width override (not the wrapper); `className="w-full"` and width-less sites render full-width control. Playwright confirms the currency control is ~88px on `WorkBet`. | `Select.test.tsx` + `ag5-dropdown.spec.ts` |
| Shared dropdown is catalogued, story-backed, less code than hand-rolling | Story renders at `/designsystem` (E2E asserts `Select` + `Menu` stories present); reuse-first satisfied | `Select.stories.tsx`, `Menu.stories.tsx` |
| Narrow-viewport + a11y ≥ replaced controls | Component test: keyboard open/move/commit/close on `Menu`; `Select` native asserted present; touch-target test asserts `min-h ≥ 44px` at ≤1024px for `size="sm"` | `Menu.test.tsx`, AQ-015 lint |
| Three surfaces visually identical in chrome + behavior | **Playwright visual** (below) | `*.spec.ts` |
| Keyboard-only open/move/commit/close with focus ring (validation scenario 2) | Playwright keyboard-driven E2E on a `Menu` instance | `ag5-dropdown.spec.ts` |
| No hand-rolled pickers remain (validation scenario 3) | ESLint rule above (static) | lint |

**Behavior-preservation tests (red-phase guard):** before migrating, the *existing* component tests for each call site (`WorkBet.AF12.test.tsx`, `W3-settings.test.tsx`, knowledge tests, RoutineCreate/BetCreate tests) must still pass post-migration — they assert selection behavior. Builder runs them as the behavior-neutral gate. Update only selector strings if a `data-testid` moves, never the asserted behavior.

**Behavior-preservation gate checklist (must all hold post-migration):**
1. **Currency width (D4/C3):** `WorkBet.tsx:573` currency `Select` renders its control at `w-[88px]` (88px control, NOT full-width). Asserted in `Select.test.tsx` (className lands on inner `<select>`) + confirmed visually in `ag5-dropdown.spec.ts`.
2. **Full-width sites (D4/C3):** `RoutineCreateDialog` + `BetCreateDialog` `Select`s render full-width controls (`w-full` reaches the control).
3. **Bet overflow selectors (C4):** `[data-bet-action="activate|adjust-appetite|unblock|kill"]` present on items; `data-testid="bet-overflow-btn"` trigger unchanged; no `overflow-dropdown-*` id remains (C5).
4. **Knowledge overflow selectors (C4):** `data-testid="knowledge-overflow-menu"` + item `data-testid`s present.
5. **Menu anatomy single-owner (C1):** `BlockActionsPopover` renders a `Menu`-owned container; no second `role=menu` definition in the codebase outside `Menu`.

## 6. Playwright visual-test plan — `packages/web/e2e/ag5-dropdown.spec.ts`

Desktop width 1440px (and one ≤1024px pass for touch-target). Screenshots captured + reviewed:
1. **Settings** (`/settings` → Models/Agents): open a model/role `Select`, screenshot resting + open.
2. **Bet creation** (`BetCreateDialog`): open team `Select`, screenshot; assert the team `Select` control is full-width (D4 `w-full` reaches control).
2b. **Currency width (D4/C3)** (`WorkBet`): assert the currency `Select` control bounding box ≈ 88px wide (not full-width) — the width-passthrough proof.
3. **Routine creation** (`RoutineCreateDialog`): open team/appetite `Select`, screenshot.
4. **Bet detail overflow `Menu`** (`WorkBet`): open "···", screenshot; drive open→arrow→Enter→close by keyboard, assert focus ring visible.
5. **Knowledge detail overflow `Menu`**: open "···", screenshot.
≥3 surfaces side-by-side for the consistency review; reviewer confirms identical chrome + zero AQ hard-rule violations.

## 7. Files touched

- **New:** `packages/design-system/src/Menu.tsx`, `Menu.stories.tsx`, `html/Menu.html`, `src/__tests__/Menu.test.tsx`.
- **Edit:** `Select.tsx` (+size/placeholder/option-disabled, **+control-width fix: `className`→inner `<select>`, C3**), `Select.stories.tsx`, `index.ts`.
- **Edit (refactor — C1):** `BlockActionsPopover.tsx` → thin wrapper rendering through `Menu` (copy-feedback as opt-in item; no own `role=menu`/item chrome/Escape effect). Re-verify `BlockActionsPopover.stories.tsx`, `html/BlockActionsPopover.html`, and its tests against the delegated behavior (item chrome stays pixel-identical).
- **Edit (migrate):** the 9 select files + 2 menu files in §3.
- **Edit:** `RecipientPicker.tsx` (lore only).
- **New lint:** `design/no-handrolled-select` (+ register in design eslint plugin + `AESTHETICS.md`/rule doc note).
- **New E2E:** `packages/web/e2e/ag5-dropdown.spec.ts`.

## 8. Risks / sequencing

- **AH2 overlap:** model/role/harness pickers' *function* is AH2's; AG5 only swaps the control. Apply presentation on top of AH's landed shape; if AH2 has not landed at a given site, migrate the current `<select>` as-is. (Spec boundary: AG owns presentation, AH owns function.)
- **AI5 boundary:** do not touch the scope pill or RecipientPicker identity rows (AI5).
- **Control width (C3 — REAL behavior risk):** live `Select` applies `className` to the wrapper, not the control; the inner `<select>` hard-codes `w-full`. Unfixed, currency `w-[88px]` regresses to full-width. Fix per §1.1 (forward `className` to inner `<select>`); prove via the §5 gate + §6 item 2b. Verify Tailwind same-property last-wins actually resolves `w-[88px]` over base `w-full` (⚠️ UNVERIFIED) — fall back to conditional `w-full` if not.
- **E2E selectors (C4):** bet overflow e2e queries literal **`data-bet-action`** (`AF12-lifecycle.spec.ts`, `L14-bet-actions.spec.ts`), NOT `data-testid`; knowledge uses `data-testid`. Both preserved via `MenuItem.dataAttrs` passthrough (§1.2). A single fixed `testId` prop would break the bet e2e. The caller-owned `data-testid="bet-overflow-btn"` trigger is NOT migrated — leave it untouched. Highest-risk migration — do bet menu last, run its specs immediately.
- **C5 — DOM toggle removal:** the bet migration must delete the `overflow-dropdown-${bet.id}` id and the `[&[open]]:block` toggle hack entirely (replaced by `useState`); grep for orphaned `overflow-dropdown-*` refs after.
- **Menu single-owner (C1):** `BlockActionsPopover` must render *through* `Menu`, not keep its own `role=menu`. If left independent, the "no two menus duplicate item-style" AC fails. Gate: no `role=menu` definition outside `Menu` (lint + component test).
- **`inputStyle` orphan** in `SettingsOrgChart` after `selectStyle` removal — leave the inline input chrome (text inputs are out of AG5 scope); flag for AI-track, do not expand scope.
