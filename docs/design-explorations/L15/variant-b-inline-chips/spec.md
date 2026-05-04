# Variant B — Inline action chips on hover/focus

**Constraint:** Optimise for the single most common power-user task — request a state change in one click.
**Thesis:** Density and speed beat completeness. The 80% workflow is a state-request; surface it at one-click depth and accept the visual bleed when active.

## User story

A founder hovering a task reveals an inline action row at the bottom of the card: four chips (the three states OTHER than current — current is replaced by a "Thread" chip). Clicking a state chip posts the request to the thread immediately; clicking "Thread" opens the thread surface. No menu navigation, no submenus.

## Component composition

- `TaskCard` (Tier 2, existing) — re-uses the existing `actions` slot. The Kanban consumer fills `actions` with a `<TaskRequestChips>` block that is hidden until `:hover` / `:focus-within`.
- `Tag` (Tier 1, existing) — chips re-use the Tag visual recipe but interactive (hover state, click handler, keyboard focus). We add a `clickable` variant of Tag (or use the existing `clickableProps` helper used by TaskCard).
- DaisyUI `tooltip` — on each chip, names the action ("Request → In Progress").
- A toast surface confirms the post.

**Component budget impact:** Possibly +1 if we treat `<TaskRequestChips>` as its own micro-block. To stay strictly within the budget, we render the chips inline in the consumer (WorkTeam or a small Kanban-local helper) using the existing Tag primitive — no new design-system shape.

## Information hierarchy

1. Title
2. Bet tag · Status chip
3. Owner
4. Cost
5. **Action row** (visible only on hover/focus-within) — three state-request chips + one Thread chip. Current state is hidden so the user never sees a noop chip.

## States

| State | What appears |
|---|---|
| Default (idle) | Card as today. Action row hidden (`display: none` to recover the vertical space; the card height is the same as today). |
| Hover / focus-within | Action row reveals below cost — three state chips ("→ Planned", "→ Blocked", "→ In Progress", or "→ Done" minus current) + "Thread". Card height grows by ~32 px. |
| Posting | Selected chip flashes (primary-dim background, motion-fast). Card returns to idle after the post. Toast: "Requested → Blocked. Posted to thread." |
| Error | Toast (danger): "Could not post request. Retry." Chip returns to idle. |
| Thread missing | "Thread" chip always present. First click seeds the thread (same `POST /api/threads` flow as Variant A). |

## Behavior

**Pointer.** Hover reveals the action row. Click a chip = post the request. The chip animates a press feedback (primary-dim flash, motion-fast).

**Keyboard.** Tab from card → first chip → next chip → … → "Thread". Enter on a chip = post.

**Focus management.** When focus leaves the card / its chips, the action row hides. (Practical: `focus-within` on the card.)

**Motion.**
- Action row reveal: `opacity` 0 → 1 transition `--motion-fast`. The height-change is intentionally NOT animated — animating layout is forbidden (AQ-014). Instead the row is rendered with `visibility: hidden; opacity: 0; height: var(--row-h)` so it always occupies the same vertical slot, but is invisible in the idle state. Tradeoff: every card is slightly taller in idle than current. Mitigation: we keep the slot at the chip-row height (~32 px) and accept the bleed.

**Alternative motion strategy.** Use `display: none` in idle and accept that the card grows on hover. This violates the no-layout-transition rule because the change is instant (no animation), so it actually complies — `display` is not animated, just toggled.

## Mobile adaptation

On viewports ≤ 1024 px (no hover), the action row is always visible. This pushes every TaskCard taller by ~44 px (touch-target floor) on mobile, but the user gains one-tap state-request without a menu. Acceptable on mobile because the Kanban is rarely the primary mobile surface (Conversations is). Each chip carries a tooltip for the action label; on mobile, the chip label IS the action.

## Signature

Direct manipulation. There is no menu, no submenu, no layered intent. You see the four states the card can move to; you click one. The card "wears its requests on its sleeve" only when the user is engaged with it.

## Trade-offs

- The card height changes between idle and hover, which can feel jumpy in a dense column where multiple cards animate at once. Mitigated by `--motion-fast`.
- The action row eats vertical space the moment the user hovers — so column scroll position can shift mid-interaction.
- Mobile shows the action row always — denser cards. This is a real cost and is the reason Variant A may win on mobile-first thinking.
- "Thread" is one chip among five; the founder might expect Thread to be a more prominent affordance because it's the gateway to L18.
