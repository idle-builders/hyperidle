# AG5 — Concept Check

**Result: NO new or reshaped primitive. Existing nouns only.** Skip full `/concept`.

## Nouns in scope (all pre-existing, already catalogued)

- **Select** — Tier 0 foundation primitive (`packages/design-system/src/Select.tsx`, `DESIGN.md` §Tier 0). Native `<select>` styled to Hearth. AG5 *adopts* it across ~16 hand-rolled call sites + 4 `SettingsOrgChart` inline-style selects. No identity change.
- **BlockActionsPopover** — Tier 2 menu primitive (`packages/design-system/src/BlockActionsPopover.tsx`). `role=menu`, `role=menuitem`, Escape-to-close, shortcut/hint slots already exist. The reference shape for the menu-consolidation decision; no new noun is created, the decision is whether the 3 bespoke menus collapse onto a generalized version of this existing one.

## Why no concept work

AG5 is pure consolidation: one catalogued primitive bypassed everywhere becomes the adopted default; three accidental menu reimplementations either fold onto an existing menu primitive or are documented-distinct. No load-bearing noun is introduced, no existing noun's essence/lifecycle/authority changes. Behavior at every call site is preserved (spec contract). Vocabulary collisions already settled: "Select" = the form picker; "Menu/Popover" = the anchored action list; "scope pill" is AI5's, explicitly out of scope.

**Probes that would have fired (and their answers):**
- Identity: Select is not Menu. A Select commits one value from a closed option set into a form; a Menu fires one of N actions and dismisses. Kept distinct — they are different primitives, not variants.
- Rejection list: Select is NOT multi-select, NOT async-search, NOT a combobox (spec out-of-scope: "no net-new features beyond replaced controls").

Proceed to `/design`.
