# AG5 — Design Brief: One Canonical Dropdown

## Classification: ROUTINE (single-variant)

Consolidation of an existing, catalogued, story-backed primitive family. The canonical `Select` already exists and already embodies the Hearth treatment; the work is adoption + a menu-consolidation decision, not net-new shape exploration. Per `/design` discipline, routine ⇒ one settled variant for the dropdown, plus an explicit fold-vs-keep-distinct decision for the popovers. No 3-variant fan-out warranted — the spec mandates "exactly ONE canonical dropdown" and "do not add a second parallel one," which forecloses divergent anatomies.

## Phase 0b — Reuse Inventory (MANDATORY)

### Existing primitives (reuse, do not re-create)
- **`Select`** — `packages/design-system/src/Select.tsx` (Tier 0). Wraps native `<select>`, `appearance:none`, CSS-triangle arrow, Hearth border/focus chrome. Props today: `{ label?, options: {value,label}[], ...SelectHTMLAttributes }`. Story: `Select.stories.tsx` (single `Default` export holding labeled/disabled examples). HTML ref: `html/Select.html`. **Never imported by the web app today** — pure accidental divergence. **Width gotcha (verified at source):** `className` is applied to the outer wrapper `<div>` (`flex flex-col gap-[6px] ${className}`); the inner `<select>` hard-codes `w-full`. So `className="w-[88px]"` sizes the wrapper, NOT the control — the control stays full-width. Adoption MUST add an explicit control-width path (see Decision 1).
- **`BlockActionsPopover`** — `packages/design-system/src/BlockActionsPopover.tsx` (Tier 2). `role=menu` + `role=menuitem` items, Escape-closes, `aria-disabled`, shortcut + `aria-live` slots. Used in WorkBet:1598 and KnowledgeDetail:800 for block actions. Story + HTML ref exist. The natural anchor for the menu-consolidation decision.

### Call-site inventory — select-style pickers (16 native + 4 inline-style)

| # | File:line | Picker | Current class / chrome | Width override |
|---|---|---|---|---|
| 1 | `settings/SettingsModels.tsx:128/149` | model tier (×2) | `select select-sm select-bordered` | — |
| 2 | `settings/SettingsAgents.tsx:355/401/518/556` | role/model pickers (×4) | `select select-sm select-bordered` | — |
| 3 | `pages/AgentAddDialog.tsx:180/256` | role/model (×2) | `select select-sm select-bordered` | — |
| 4 | `pages/AgentEditDialog.tsx:276` | model | `select select-sm select-bordered` | — |
| 5 | `pages/WorkBet.tsx:573` | currency | `select select-bordered select-sm w-[88px]` | `w-[88px]` |
| 6 | `pages/WorkBet.tsx:1440` | (inline-chromed select) | `select select-sm bg-… border-… text-… text-[13px]` | **full inline chrome reimpl** |
| 7 | `pages/knowledge/ScopeChangeDialog.tsx:176` | scope target | `select select-bordered select-sm` | — |
| 8 | `pages/work/RoutineCreateDialog.tsx:188/209/230` | team/appetite/schedule (×3) | `select select-bordered select-sm text-base w-full` | `text-base w-full` |
| 9 | `pages/work/BetCreateDialog.tsx:143` | team | `select select-bordered select-sm text-base w-full` | `text-base w-full` |
| 10 | `settings/SettingsOrgChart.tsx:358/383/408/430` | from/mechanism/target (×4) | `style={selectStyle}` **inline-style object** | inline-style |

**Drift confirmed:** five distinct class strings (`select select-sm select-bordered`, with `select-bordered` before/after `select-sm`, plus `w-[88px]`, `text-base w-full`, full inline chrome) + one inline-style construction. Exactly the founder's complaint.

> Note: `SettingsAppearance` theme picker is already a swatch-card pattern (W3 AC-50) — NOT a `<select>`, out of scope. The knowledge **scope pill** segmented control is **AI5's**, out of scope here.

### Call-site inventory — bespoke popover menus (3)

| Menu | File | Shape | open/close | position | item style |
|---|---|---|---|---|---|
| Bet-actions overflow | `WorkBet.tsx:1075-1139` | `<details>`-less native `toggleAttribute("open")` on a `<div id=overflow-dropdown-…>` | DOM attribute toggle, **no Escape, no click-outside, no `role=menu`** | `absolute right-0 top-full` | `w-full text-left px-3 py-2 text-[13px] hover:bg-[--accent-primary-dim]` |
| Knowledge-detail overflow | `KnowledgeDetail.tsx:364-417` | React state `overflowOpen`, `role=menu`/`menuitem`, `aria-haspopup` | state + click-outside + Escape effect | `absolute right-0 top-full` | same item classes |
| Recipient picker | `components/RecipientPicker.tsx` | full inline composition: SearchField + `role=listbox`/`option` rows w/ avatar+status+role | not a transient popover — embedded panel with browsing/selected/sending states | inline (not anchored) | bespoke row buttons |

## Decision 1 — Canonical dropdown anatomy

**Promote the existing `Select`; do not replace it.** It already meets the Hearth bar (matches `Input` border/radius/focus per its lore, CSS-triangle arrow, `--border-strong` arrow color from DESIGN.md). It is a native `<select>` under the hood — which gives us platform keyboard, screen-reader roles, and mobile native pickers for free, satisfying the "a11y at least as good as native" AC by construction.

Anatomy (settled):
- Optional top `label` (13px medium) — already present.
- Control: full-width by default, `appearance:none`, 12px h-pad / 10px v-pad (optically-tuned form exemption) / 40px right arrow clearance, 1.5px `--border-default`, `--r-default` radius, `--surface-elevated` bg, 15px text.
- States: resting / hover (cursor-pointer) / focus (`--accent-primary` border + 3px focus ring) / disabled (opacity-50, not-allowed) / open (native). All already in `SELECT_CLASS`.
- **Gaps to close for adoption** (small, additive — no behavior change):
  1. **`size` prop** `"sm" | "md"` — call sites use DaisyUI `select-sm` (32px). Add a compact size mapping to Hearth-grid heights so dense settings rows keep their footprint. Default `md`.
  2. **width control (REVISED — D4/C3)** — `className` does NOT reach the control: it lands on the outer wrapper, while the inner `<select>` hard-codes `w-full`. So `w-[88px]` (currency) and `w-full` would not take effect on the control. **Decision: forward `className` to the inner `<select>` and drop the hard-coded `w-full` from the base class** (make full-width the default via an explicit `w-full` only when no width override is given — simplest: append caller `className` after the base so a `w-[88px]` override wins the cascade). One line, additive, zero new prop, zero new API surface — chosen over a separate `controlClassName`/width prop because the only thing callers ever pass through is width, and a second class slot would invite drift (the exact thing AG5 exists to kill). The wrapper keeps only layout (`flex flex-col gap-[6px]`); width belongs to the control. **Behavior-preservation gate MUST include:** WorkBet currency select renders at `w-[88px]` (88px control, not full-width) post-migration, and `w-full` sites (RoutineCreate/BetCreate) still render full-width.
  3. **`placeholder` / leading empty option** — several sites render a disabled `<option value="">Select…</option>`. Support via an optional `placeholder` prop that emits a disabled, value-`""` first option, OR let callers keep passing it in `options`. Decision: **`placeholder` prop** (eliminates the repeated empty-option boilerplate; using-it-requires-less-code AC).
  4. **`aria-label` passthrough** — already covered by `...rest`; sites w/o visible `label` (OrgChart) pass `aria-label`.

This keeps **one** primitive. No second parallel dropdown.

## Decision 2 — Popover/overflow menus

**Fold the two transient overflow menus onto one shared menu primitive; keep the RecipientPicker distinct (documented).**

- **Bet-actions overflow + Knowledge-detail overflow → consolidate.** They are the same shape: a "···" trigger button → anchored `absolute right-0 top-full` panel of left-aligned action buttons with identical item classes. Today they duplicate open/position/item-style; one (bet) even lacks Escape/click-outside/`role=menu` — a real a11y regression the consolidation fixes for free. `BlockActionsPopover` is *already* this exact primitive (role=menu, Escape, disabled items, shortcut slot) but is presentation-coupled to the block handle ("copy" rotates to "Copied", `liveRegionId`, BlockHandle `aria-controls`). **Introduce one `Menu` primitive (the generalized anatomy) that bet overflow and knowledge overflow render through.**
  - **COMMITTED (D8/C1): `BlockActionsPopover` becomes a thin wrapper that renders THROUGH `<Menu>`** — it builds the block-action `MenuItem[]` (copy / delete / etc.), injects the copy→Copied feedback as an opt-in item behavior, and delegates the entire `role=menu` container + open/position/item-style + Escape/click-outside/keyboard to `Menu`. The menu anatomy then lives in **exactly one place**. This SHARES the logic (passes the AC's "no two menus duplicate the same open/position/item-style by accident") rather than leaving `BlockActionsPopover` as an independent reimplementation (which would duplicate, just renamed). Chosen over a strict `BlockActionsPopover`→`Menu` rename because the wrapper keeps the block-copy specialization (`liveRegionId`, copy-feedback, BlockHandle `aria-controls`) named and local while still ending duplication, and avoids the rename ripple across 2 call sites + tests + stories + HTML.
  - Net: 3 menu implementations (block / bet / knowledge) → 1 `Menu` primitive (the only owner of the menu anatomy) + 3 thin call sites (`BlockActionsPopover` wrapper for block; inline `<Menu>` for bet + knowledge). Satisfies "no two menus duplicate open/position/item-style by accident."
- **RecipientPicker → keep distinct, documented.** It is not a transient action menu: it is an embedded, multi-state panel (browse → selected → sending) with a search field, rich identity rows (avatar + live-session badge + role tag + status chip), and a message composer. Forcing it into a `Menu` of action-items would be a category error — it selects an *entity from a searchable directory*, not an *action from a short list*. Its existing `@lore Q1` already documents it as a page-level composition. **Carry a written reason in the design + arch docs** per the AC's "documented reason for staying distinct." (Its avatar/identity-row inconsistencies are AI5's adoption sweep, not AG5's.)

## Quality bar / hard rules honored
- Hearth tokens only; no off-grid spacing (form v-pad 10px is the AQ-001 exemption, already directive-marked in `Select.tsx`); type within `{13,15}`; `--r-default`/`--r-subtle` radii; `--shadow-elevated` for the floating menu (AQ-012); warm tokens only (AQ-018); motion via `--motion-fast` (AQ-013). The compact `size` must keep a ≥44px touch target at ≤1024px (AQ-015) — verified in the visual/E2E plan.
- No AI-aesthetic tells: no gradient, no glass, no oversized padding, native arrow not a decorative icon.

## States to render in stories (`/designsystem`)
- **Select:** default, labeled, with-placeholder, sm size, md size, disabled, error-ish (long option list), full-width vs fixed-width.
- **Menu:** closed (trigger only), open with 2–4 items, with a destructive item (red), with a disabled item, with a shortcut/hint item, with the copy→Copied feedback variant.
