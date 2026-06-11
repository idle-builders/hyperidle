# AF8 — Approved design (input contract to /architecture)

Two surfaces: the **notification popover** (Variant B, purpose-built dense row) and the **Settings notification type-list** (registry-driven Toggle list). `/architecture` and `/write-code` consume this; the visual contract, component vocabulary, and interaction grammar are NOT re-decided downstream.

---

## A. Notification popover

### Placement & shell
- New shell composition **`packages/web/src/shell/NotificationPopover.tsx`** (Tier 3 shell, NOT a DS primitive — same tier/rationale as `CocOverlay`).
- Anchored at the **sidebar bottom strip, by the avatar** (`Sidebar.tsx` bottom row). NEVER the rail.
- Idiom cloned from `CocOverlay`: `fixed bottom-16 left-4` (sidebar is left), `w-[360px]`, `min-h-[200px]`, `max-h-[70vh]`, `surface-overlay`, `border border-border-default`, `rounded-[var(--r-subtle)]`, `shadow-[var(--shadow-elevated)]`, `z-30` (above Main, below Settings z-40). Fade-in `motion-fast`.
- `role="dialog"`, `aria-modal="false"`, `aria-label="Notifications"`. Escape closes; focus moves to first focusable on open. Outside-click DOES close (unlike CocOverlay — no reason to keep it open while interacting with Main).

### Affordance (sidebar bottom strip)
- A **notification trigger** added to the `Sidebar` bottom row (between avatar and Assistant, or a small bell icon-button left of "Assistant"). 28px, matches the avatar button chrome (`border-1.5 border-border-default rounded-full` OR a borderless icon — builder picks to match the strip; reference: avatar button at `Sidebar.tsx:374`).
- **Unread indicator:** a 6px `--accent-primary` dot, top-right of the trigger (mirror the mobile hamburger dot at `AppShell.tsx:664`), shown when `unseenCount > 0`. NOT a number — a dot. (Numbered count is the §4.2 triage badge's grammar; the popover affordance is a binary "you have unseen notifications".)
- Mobile: a bell + dot in the mobile header (`AppShell.tsx` mobile branch), opens a full-width bottom sheet with the same row list.

### Header
- `"Notifications"` (15px / 600 / `text-primary`) left; close `×` (24px, `text-secondary → accent-primary` hover) right. No "Mark all read" in v1.

### Row anatomy (purpose-built, inline in `NotificationPopover.tsx`)
Single line, `min-h-[36px]` (`min-h-[44px]` at mobile), `py-[9px] px-[12px]`, `rounded-[var(--r-subtle)]`, hover bg `color-mix(in oklab, var(--accent-primary) 4%, var(--surface-elevated))`. Whole row is the jump target (`role` button semantics via a real `<button>` wrapping the content, or row `onClick` + keyboard handler).

Left→right:
1. **Urgency dot** — 6px, leading. `immediate → var(--status-error)`; `ambient → var(--border-strong)`. `aria-hidden`. (Red-only danger signal — Lucid.)
2. **Title** — 15px, `text-primary`, `flex-1`, `truncate`. The notification's `title`. This is the jump click target.
3. **Type label** — 11px `--font-mono` uppercase, `tracking-caps-sm`, `text-tertiary`. The type's `label` (uppercased): "REVIEW" / "BLOCKER" / "COST".
4. **Relative time** — 12px, `text-tertiary`, `tabular-nums`, `whitespace-nowrap`. "4m" / "2h" / "yest".
5. **Trailing affordances** — `opacity-0` at rest, `group-hover:opacity-100` + `focus-within:opacity-100`; **always visible at mobile/touch**. Two 16px real `<button>`s:
   - **Mute** (bell-off glyph), `aria-label="Mute {TYPE} notifications"`.
   - **Dismiss** (× glyph), `aria-label="Dismiss notification"`.

Sort: `immediate` urgency block first, then `ambient`; within each, newest `createdAt` first.

### States (all four)
- **Empty:** DS `EmptyState` — title "All caught up", body "Notifications land here when something needs you." (centered inside the popover body).
- **Loading:** DaisyUI `loading-spinner loading-sm text-text-tertiary`, centered (CocOverlay pattern). Sub-200ms in practice.
- **Error:** inline column — "Couldn't load notifications" (`text-secondary`) + `btn btn-xs btn-ghost` "Retry" (CocOverlay error pattern).
- **Populated:** scrollable row list; internal scroll past ~10 rows.

### Behavior & verbs
- **Open** (click trigger / mobile bell) → toggle. **Opening marks all currently-listed notifications `seen`** → clears the unread dot. Does NOT mark them read (rows persist).
- **Jump** (row click / Enter on focused row) → `navigate(sourceLink)` + close popover + mark that one `read`.
- **Dismiss** (×) → mark that notification `read`; row fades out `motion-fast` (opacity + 4px translateY; honor `prefers-reduced-motion` → opacity only). Read rows do not reappear.
- **Mute** (bell-off) → write per-user mute for the type → Toast (DS `Toast` via `ToastRegion`): "Muted REVIEW. Re-enable in Settings → Notifications." Future notifications of the type produce no popover row.
- **Keyboard:** Tab order = row → its mute → its dismiss → next row. Enter on a focused row = jump. Escape = close.

### Source-link routing (locked: persisted, never reconstructed at render)
The row jumps to the notification's persisted `sourceLink` string. The popover does NOT compute the route — it reads the column and calls `navigate()`. Validate via `sanitizeRouteId`-style guarding is NOT needed (the link is system-authored, not agent-authored) but the route must be an in-app path; reject `javascript:`/external (defense-in-depth — flag to architect).

---

## B. Settings notification type-list

### Composition (rewrite `packages/web/src/settings/SettingsNotifications.tsx`)
- Render over the **type registry** (`NOTIFICATION_TYPES` — `{ key, label, description, defaultUrgency }`), one DS **`Toggle`** per type, `flex flex-col gap-[18px]`.
- Each Toggle: `on = !isMuted(type.key)`, `label = type.label`, `description = type.description`.
- A short section intro line (13px `text-tertiary`): "Each type below is a real notification source. Turn one off to stop being notified; turn it back on here anytime."
- **Remove:** the hardcoded `NOTIFICATION_SETTINGS` array, `SERVER_KEY_MAP`, the `email-digests` local-only toggle (digest = egress mode, not a type), and the AD3 solo-mode filtering (registry is the single source — every registered type shows for everyone).

### Behavior
- Toggle off → optimistic flip → write mute → on failure revert + Toast. Toggle on → clear mute.
- Writes the **same per-user mute store** the popover's mute shortcut writes (one state, two surfaces). Reopening either surface reflects the other.

### States
- Loading/error: fail-open (all on) — matches today's behavior. No blocking UI.

---

## Component mapping
| Surface | DS components | New |
|---|---|---|
| Popover shell | (clones CocOverlay idiom) | `shell/NotificationPopover.tsx` (Tier 3, not a DS primitive) |
| Popover row | DS `Tag`? no — inline markup; `Toast` for mute feedback; `EmptyState`, `ErrorState`-style inline | inline row (no new DS primitive) |
| Sidebar affordance | extend `Sidebar.tsx` bottom strip | dot indicator |
| Settings list | DS `Toggle` | rewrite `SettingsNotifications.tsx` over registry |

**Component budget: 0 new DS primitives.** The popover and its row are Tier-3 shell composition (single consumer); reuse `EmptyState`, `Toast`, `Toggle`, DaisyUI spinner/button.

## Open questions for the architect
1. **`sourceLink` shape & the cost-detail route.** The app has no dedicated cost-detail page today. What route does `cost_alert` link to? (Candidate: `/work/portfolio` or a team cost view; or defer cost rows to link nowhere-clickable until AF10/a cost page lands.) Architect must pin the literal route string the listener persists.
2. **Read-state storage.** Single-founder near-term → a row-level `readAt` / `seenAt` on `notification_queue` is acceptable. Architect confirms no per-(user,notification) join needed in scope.
3. **Mute read API.** AF15 owns the per-user mute *store*; AF8 needs the read interface (`isTypeMuted(userId, key)` / a muted-keys set) for both the drain and the popover. Architect specifies the interface even though AF15 implements persistence.
4. **Popover data API.** Endpoint shape for list (which statuses? `read=false` rows only? cap?) + mark-seen + mark-read + dismiss. Architect defines.
5. **Unseen count source.** Count of `seenAt IS NULL` notifications for the dot. Polled or pushed (WS)? Architect picks (polling acceptable v1).
