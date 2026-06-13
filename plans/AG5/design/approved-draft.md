# AG5 — Settled Design (reviewer approves)

Classification: **routine, single-variant.** See `brief.md` for full reuse inventory + call-site table.

## Settled decision 1 — Canonical dropdown

**Keep & promote the existing Tier-0 `Select`** (`packages/design-system/src/Select.tsx`). It is the one canonical dropdown; no second primitive is created. It is a styled native `<select>`, so platform keyboard, SR roles, and mobile native pickers come free → "a11y at least as good as native" holds by construction.

Additive, behavior-neutral API extensions (no call site changes value/selection behavior):
- `size?: "sm" | "md"` (default `md`); `sm` ≈ 32px control for dense settings rows. Compact height must still clear 44px touch target at ≤1024px (use min-height, not shrink) — covered in test plan.
- `placeholder?: string` → renders a disabled, `value=""` leading option; removes repeated empty-option boilerplate (less code than hand-rolling, per AC).
- **Control width (REVISED — D4/C3):** today `className` lands on the wrapper `<div>` while the inner `<select>` hard-codes `w-full`, so width overrides never reach the control. Fix: **forward `className` to the inner `<select>`** (append after the base class so a caller `w-[88px]` wins the cascade) and keep the wrapper to layout only. No new prop — width is the only thing callers pass through, so a second class slot would invite the drift AG5 exists to kill. Currency `w-[88px]` and `w-full` sites must be verified rendering at the intended control width (behavior-preservation gate).
- `aria-label` via existing `...rest` for label-less sites (OrgChart).

Anatomy unchanged from current `Select`: optional label / `appearance:none` control / CSS-triangle arrow / Hearth border+focus chrome / states resting·hover·focus(ring)·disabled·open.

## Settled decision 2 — Menus

- **Consolidate** bet-actions overflow (`WorkBet.tsx:1075`) + knowledge-detail overflow (`KnowledgeDetail.tsx:364`) onto **one shared `Menu` primitive**, generalized from the existing `BlockActionsPopover` anatomy (which already provides `role=menu`/`menuitem`, Escape, disabled items, shortcut + live-region slots). Consolidation incidentally fixes the bet menu's missing Escape / click-outside / `role=menu`.
- **`BlockActionsPopover` becomes a thin wrapper that renders THROUGH `<Menu>`** (D8/C1, COMMITTED): it builds the block-action `MenuItem[]`, keeps copy→Copied feedback + `liveRegionId` + BlockHandle `aria-controls` as its local specialization, and delegates the entire menu container + open/position/item-style + Escape/click-outside/keyboard to `Menu`. The menu anatomy lives in exactly one place → SHARES, not duplicates → passes "no two menus duplicate the same open/position/item-style by accident." (Chosen over a strict rename to avoid the ripple across 2 call sites + tests + stories + HTML while still ending duplication.)
- **Keep `RecipientPicker` distinct** — documented reason: it is a searchable entity-directory panel with multiple states (browse/selected/sending) and a composer, not a transient action menu. Folding it into `Menu` is a category error. Documented in arch + a `@lore` at the component.

## Contracts honored
Exactly one canonical dropdown; Hearth tokens only; zero behavior change at call sites; stories at `/designsystem`; component lives in design system.

## Resolved decisions (post-critique)
1. **Menu consolidation (was reviewer Q1 — RESOLVED, D8/C1):** `BlockActionsPopover` becomes a thin wrapper that renders **through** `<Menu>`, injecting block-copy feedback as an opt-in item. The menu anatomy lives in exactly one place (`Menu`); `BlockActionsPopover` owns only the block-copy specialization. This SHARES the open/position/item-style logic (passes the AC) rather than leaving two independent reimplementations. The strict `BlockActionsPopover`→`Menu` rename was rejected only on ripple cost, not contract — both options pass the AC; the wrapper option is cheaper.
2. `placeholder` prop vs. callers keeping their explicit empty `<option>` — adds the prop but does not forbid the explicit option (non-breaking). No change.
