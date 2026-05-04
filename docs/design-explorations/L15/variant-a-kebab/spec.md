# Variant A — Per-card overflow menu (kebab)

**Constraint:** Smallest possible component count; reuse what exists.
**Thesis:** The feature ships inside the 19-component budget with zero new shapes. The grammar (kebab → menu → submenu) is already in DaisyUI.

## User story

A founder hovering a task on the Team Board reveals a kebab in the card's top-right corner. Clicking it opens a DaisyUI menu: "Request state change ▸" (cascading submenu of the three other states) and "Open thread". Selecting an action posts a typed message to the task's thread; the menu closes; a transient toast confirms the request was logged.

## Component composition

- `TaskCard` (Tier 2, existing) — accepts the existing `actions` slot OR a new `overflowMenu` slot. The overflow menu lives in the top-right of the card.
- DaisyUI `dropdown` + `menu` — the kebab button + menu surface. No new component.
- DaisyUI `kbd` (in submenu) — keyboard hint for the four states ("P / B / I / D").
- A toast surface (existing app-level toast container) confirms the post.

**Component budget impact:** 0 new components. TaskCard gains an optional `overflowMenu?: ReactNode` prop OR re-uses `actions` (preferred — `actions` is currently absorbing whatever goes at the bottom; we promote `overflowMenu` to top-right).

## Information hierarchy

The card stays as it is today (title, bet tag, status chip, owner, cost). The kebab is an **invisible-by-default** affordance — opacity 0 unless the card is hovered or has keyboard focus. Position: top-right, 24×24 hit area visible, 44×44 effective hit area on mobile via padded press target.

1. Title (text-hi, density-text, font-medium)
2. Bet tag · Status chip
3. Owner
4. Cost
5. **Overflow kebab** — opacity transitions on hover / focus-within

## States

| State | What appears |
|---|---|
| Default (idle) | TaskCard as today. Kebab opacity 0. |
| Hover / focus-within | Kebab opacity 1 (motion-fast, 80ms). Cursor pointer over the kebab only. |
| Menu open | DaisyUI dropdown menu floats below the kebab. Items: "Request state change ▸", divider, "Open thread". Outside-click closes. ESC closes and returns focus to the kebab. |
| Submenu open | "Request state change ▸" reveals a nested menu: "→ Planned", "→ Blocked", "→ In Progress", "→ Done". The current state is hidden (you can't request the state you're already in). Each row has a `kbd` hint ("P", "B", "I", "D"). |
| Posting | The selected item briefly flashes (motion-fast, primary-dim). Menu closes. Toast: "Requested → Blocked. Posted to thread." |
| Error | Toast (danger): "Could not post request. Retry." Menu re-opens; the action stays selectable. |
| Thread missing | "Open thread" is always available. If the thread does not yet exist, opening it triggers `POST /api/threads { hostKind: "task", hostId, initialMessage: null }` and routes to the thread surface (L18) — for L15, route to a placeholder "Thread (lifting…)" surface that displays the task header + Composer. |

## Behavior

**Pointer.** Hovering the card reveals the kebab. Clicking the kebab opens the menu.

**Keyboard.** Tab order: card → kebab. Pressing Enter on the kebab opens the menu. ↑/↓ moves through items; → enters submenu; ← exits submenu; Enter selects; ESC closes.

**Focus management.** On menu open: focus moves to first menu item. On close: focus returns to the kebab. Focus trap inside the menu, not the card.

**Motion.**
- Kebab opacity: `opacity` transition, `--motion-fast` (80 ms), `--motion-ease`.
- Menu open: DaisyUI default; we override to `--motion-medium` (150 ms) for the dropdown.
- Submenu open: same.
- No layout-property transitions (AQ-014).

**Keyboard shortcuts (within the open menu):** `P` `B` `I` `D` jump straight to the four state requests. `T` opens the thread. (These shortcuts only fire while the menu is open — no global keymap change.)

## Mobile adaptation

On viewports ≤ 1024 px, density flips to `comfortable` (AQ-016). The kebab becomes always-visible (not hover-revealed — touch has no hover). Hit target 44×44. Tapping the kebab opens the same DaisyUI menu, full-width-aligned. Submenu opens as a second tap rather than nested.

In the three-tab mobile layout (Conversations / Work / Knowledge), the Kanban is in Work. The kebab and menu surface adapt as above. Opening the thread routes the user into Conversations → Task thread, then the user navigates back via the back button.

## Signature

The kebab is a one-pixel-wide promise: dense card stays dense, but every card has a quiet handle for the two operations a human can do. The card is read-only by default; intent is explicit.

## Trade-offs

- Two clicks for a state request (kebab → menu item) — the request grammar is verbose by design (you're asking, not commanding) so two clicks is acceptable, but Variant B offers one click.
- Hover-to-reveal is invisible to first-time users until they hover. Keyboard tab reveals it; we lean on the focus ring to teach.
- The submenu pattern can feel "menu within a menu" if the submenu doesn't have a visible chevron — DaisyUI's default chevron is sufficient.
