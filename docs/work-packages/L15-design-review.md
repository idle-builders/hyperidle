# L15 Design Review — Findings

**Severity:** CRITICAL 0 · WARNINGS 4 · OBSERVATIONS 3
Verified live at `http://localhost:5173/work/team` and via DOM probes.

## WARNINGS

- **W1 — Submenu does not move focus.** After clicking "Request state change", `document.activeElement` stays on the parent menuitem ("Request state change"). Submenu items are mounted alongside (2 nested `[role=menu]`) instead of replacing the parent view. Spec implies a two-step menu; current pattern leaves both lists visible (`/tmp/L15-submenu.png`). Move focus to the first non-disabled target on submenu open. (`TaskActionsMenu.tsx:164-191`)
- **W2 — Off-grid spacing.** `mt-1`, `p-1`, `py-1`, `pt-1` = 4 px rows; AQ-002 requires `var(--density-pad-*)`/`--density-gap`. Hardcoded `min-w-[12rem]` also bypasses tokens. (`TaskActionsMenu.tsx:144-173`)
- **W3 — Touch target < 44 px.** Menuitem rows render at ~28 px (`px-2 py-1` + 14 px line). AQ-015 requires ≥ 44 CSS px at viewport ≤ 1024 px. Kebab (`p-1` icon button) is also sub-44 px on touch. (`TaskActionsMenu.tsx:112,149,159,173`)
- **W4 — Heavy shadow on non-overlay scope is fine, but no surface ladder.** Menu uses `shadow-lg` (allowed, AQ-012) yet borders + `--surface-2` are correct; however no `aria-label` on either `[role=menu]` and no `aria-labelledby` linking to the kebab — screen-reader users hear an unnamed menu.

## OBSERVATIONS

- **O1 — Kebab opacity flow correct.** `opacity-0 → group-hover/focus-within:100`, `data-[density=comfortable]:opacity-100` density flip honored. ESC returns focus to kebab (verified).
- **O2 — `text-[var(--danger)]` on Blocked target** matches Lucid red-only-for-danger.
- **O3 — Tabular-nums missing on `cost` cell** in TaskCard (KeyValue numeric); AQ-006.
