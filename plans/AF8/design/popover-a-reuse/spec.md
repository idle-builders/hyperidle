# Variant A — "Reuse the NotificationRow primitive"

**User workpackage.** Founder clicks the unread dot by the avatar → popover lists recent notifications using the existing `NotificationRow` shape → jumps to source / dismisses / mutes.

## Composition (existing components only)
- Shell: a `CocOverlay`-clone shell (`fixed bottom-16 left-4`, `w-[360px]`, `max-h-[70vh]`, `surface-overlay`, `border-default`, `shadow-elevated`, Escape closes, focus moves in). New shell file `NotificationPopover.tsx` in `shell/` (composition, not a DS primitive — same tier as CocOverlay).
- Rows: existing **`NotificationRow`** (`severity: Status`, `message`, `timestamp`, `source?`, `actions?`).
  - `severity` mapped from urgency: `immediate → "error"` (red border), `ambient → "info"`.
  - `message` = notification title.
  - `source` Tag = the type label ("Review", "Cost", "Blocker").
  - `actions` slot = dismiss (×) + mute (bell-off) icon buttons.
  - whole-row click → jump (source link).
- Header: title "Notifications" + "Mark all read" ghost button + close ×.

## Hierarchy
1. Row title (`message`, 15px) — what crossed the threshold.
2. Status chip + colored left border — urgency at a glance.
3. Type Tag + relative time — context.
4. Dismiss / mute — trailing affordances.

## States
- **Empty:** `EmptyState` — "You're all caught up." + sub "Notifications appear here when something needs you."
- **Loading:** DaisyUI `loading-spinner loading-sm`, centered (matches CocOverlay).
- **Error:** inline "Couldn't load notifications" + Retry ghost button (CocOverlay error pattern).
- **Populated:** scrollable `NotificationRow` list, newest first, `immediate` sorted above `ambient`.
- **Overflow:** internal scroll past ~6 rows; title truncates.

## Behavior
- Open: click affordance → toggle. Escape / click affordance again → close. Opening marks all **seen** (clears the unread dot) but NOT read (rows stay until dismissed).
- Row click → `navigate(sourceLink)` + close + mark that row read.
- Dismiss (×) → mark read, row animates out (`motion-fast` opacity+translate).
- Mute (bell-off) → writes `type→off`, row + future rows of type suppressed; toast "Muted Review notifications. Re-enable in Settings."
- Keyboard: Tab through rows; Enter on focused row = jump.

## Mobile
Three-tab layout: the popover affordance moves to the mobile header (a bell with dot); tapping opens a full-width bottom sheet reusing the same row list.

## Signature
**Visual consistency with the ambient health rows** — notifications look like every other status row in the app (StatusChip + colored border). One row vocabulary everywhere.

## Trade-offs
- `NotificationRow`'s left **colored border + 24px icon circle + StatusChip** is heavy chrome for a dense triage list — three color signals per row competes with the title.
- `severity: Status` is an 8-value health enum (`healthy/error/paused/behind/...`); shoehorning binary urgency into it is a vocabulary smell.
- The icon circle is decorative (empty) — borderline AQ-113 over-iconification.
- `px-[24px]` row padding is generous; ~5 rows fill the 70vh popover.
