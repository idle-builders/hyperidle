# Variant B — "Purpose-built dense triage row" (challenge the existing pattern)

**User workpackage.** Founder clicks the unread dot by the avatar → popover lists notifications as a dense, scannable triage queue → jumps / dismisses / mutes with minimal chrome.

## Composition
- Shell: same `CocOverlay` idiom (`fixed bottom-16 left-4`, `w-[360px]`, `max-h-[70vh]`, `surface-overlay`, `shadow-elevated`, Escape closes, focus moves in). New shell composition `NotificationPopover.tsx`.
- Rows: **purpose-built `NotificationItem` row** (NOT the DS `NotificationRow`). Built inline in the popover composition from raw markup + DS `Tag` (type label) — no new DS primitive, no StatusChip, no icon circle, no colored border.
- Row anatomy (single line, 36px min-height, `py-[9px] px-[12px]`):
  - **Urgency tick:** a 6px dot, leading. `immediate` → `--status-error`; `ambient` → `--border-strong` (muted). One color signal, not three.
  - **Title** (15px, `text-primary`, `truncate`, flex-1) — the click target for jump.
  - **Type label** (11px mono uppercase, `text-tertiary`, `tracking-caps-sm`) — "REVIEW" / "COST" / "BLOCKER".
  - **Relative time** (12px, `text-tertiary`, `tabular-nums`) — "4m", "2h", "yest".
  - **Trailing affordances (hover/focus-reveal):** mute (bell-off, 16px) + dismiss (×, 16px), `text-tertiary → text-secondary` on hover. Always visible on touch.
- Header: "Notifications" (15px/600) + close ×. **No "Mark all read"** — opening marks seen; dismiss is per-row and cheap. (List-level clear is re-litigated only if usage shows pile-up.)

## Hierarchy
1. **Title** — dominant, the eye lands here, it IS the jump target.
2. **Urgency dot** — pre-attentive red-vs-muted, the only color.
3. **Type label + time** — quiet context, right-aligned chrome.
4. **Mute / dismiss** — revealed on hover, never compete with the title.

## States
- **Empty:** `EmptyState` (centered, terse) — "All caught up" / "Notifications land here when something needs you."
- **Loading:** `loading-spinner loading-sm`, centered.
- **Error:** inline "Couldn't load notifications" + Retry ghost button.
- **Populated:** dense list, newest first, `immediate` block sorts above `ambient`; ~10 rows fit before scroll.
- **Overflow:** internal scroll; title truncates; no count cap (store query limits to e.g. 50).

## Behavior
- Open: click affordance → toggle; Escape / click-again → close; opening clears the unread dot (mark **seen**).
- Row click (title or row body) → `navigate(sourceLink)` + close + mark that row **read**.
- Dismiss (×) → mark read; row fades out (`motion-fast`, opacity + 4px translate; honor `prefers-reduced-motion`).
- Mute (bell-off) → `type→off`; Toast "Muted REVIEW. Re-enable in Settings → Notifications."
- Keyboard: Tab visits row then its mute/dismiss; Enter on row = jump; the trailing buttons are real `<button>`s with `aria-label`.

## Mobile
Bell + dot in mobile header → full-width bottom sheet, same dense rows (rows already touch-friendly at 44px min on mobile via `min-h`).

## Signature
**A dense, single-color triage queue** — title-forward, one urgency signal, affordances that hide until you reach for them. Reads like Linear's notification inbox, not a status dashboard.

## Trade-offs
- Diverges from the app's `NotificationRow` visual vocabulary (intentional — that primitive is for ambient health, not triage).
- Hover-reveal affordances are invisible at rest — relies on row affordance discoverability (mitigated: always-visible on touch + focus).
- Inline row markup in the composition (not a DS primitive) — slightly less reusable, but the row only exists in one place (the popover), so a DS primitive would be a single-consumer abstraction (violates the 2+-context rule).
