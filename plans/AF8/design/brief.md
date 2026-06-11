DESIGN-CLASS: routine-low-conf  ref=CocOverlay+NotificationRow+SettingsNotifications  pattern=coc-overlay(html=none for notif-list)

# AF8 — Design brief (interrogated)

Two UI surfaces, separately classified:

| Surface | ref | pattern in `html/` | class | variants |
|---|---|---|---|---|
| **Notification popover** (sidebar-bottom, by avatar) | `CocOverlay` idiom (fixed overlay anchored bottom-left); existing `NotificationRow` primitive (wrong shape) | none — no notification-LIST popover embodied | **routine-low-conf** | 2 (A close to overlay idiom, B challenge it) |
| **Settings notification type-list** | `SettingsNotifications.tsx` (Toggle rows) | yes — toggle-row list | **routine** | 1 + rejected directions |

## Fixed input (locked concept — not re-litigated)

- Popover is **ephemeral, sidebar-bottom, by the avatar** — NEVER the rail. Assistant-overlay idiom (`CocOverlay`: `fixed bottom-16 left/right`, `w-[360px]`, `max-h-[70vh]`, `surface-overlay`, `shadow-elevated`, Escape closes, focus moves in).
- Each row = **title + source-link jump + relative time + per-row mute-this-type + dismiss**.
- Small **unread indicator** on the affordance (the sidebar bottom strip).
- Popover reads the **notification store** (not the §4.2 Conversations triage badge — distinct surface, do NOT merge).
- Settings = **flat list of ALL registered types**, each on/off toggle; supersedes the 3 fixed AF15 toggles.
- One mute state, two surfaces (popover row shortcut + Settings list) — same per-user store.

## Probes (resolved by evidence — autonomous mode, no human)

1. **Who / what decision?** A solo founder (or small-team member) glances at the popover to triage "what crossed my attention threshold while I was away" and either *jumps to the source* (review thread / blocker thread / cost detail) or *dismisses* it, occasionally *muting a noisy type*. Read: the popover is a **launchpad + dismissal queue**, not a reading surface. Confirmed by concept ("a pointer to where work lives").
2. **Smallest surface that delivers the outcome?** The popover list + the sidebar affordance + the Settings list. No notification *detail* view, no history, no test-send (out of scope per spec). Read confirmed.
3. **Primary state in real use?** **Populated, short (1–8 rows)** is the design target; **empty** is the steady state for an attentive founder (most notifications get dismissed/jumped). Both must feel intentional. Loading is a sub-200ms flash. Error is rare (store read fails).
4. **New primitive or extension?** The existing `NotificationRow` (severity Status-chip + message + source Tag) is shaped for **ambient/health display**, not for the source-link + mute + dismiss popover row. The popover row is a **distinct shape**. Decision deferred to variants: A reuses `NotificationRow` verbatim (cheapest, but wrong affordances); B introduces a purpose-built row. The Settings list **extends** `SettingsNotifications`.
5. **What overflows when dense?** The **title** truncates (single line, `truncate`); the source-link label and relative time are fixed-width chrome; mute + dismiss are icon affordances (no text). Cap the list at ~8 visible rows with internal scroll (`max-h-[70vh]`), newest first, `immediate` urgency sorts above `ambient`.
6. **Where do the verbs live?** Per-row: **jump** (whole-row click / Enter), **dismiss** (trailing ×), **mute-this-type** (trailing bell-off, secondary). Header: a **"Mark all read"** affordance is the only list-level verb (debated in variants — B cuts it).

## The decision the variants settle

The single unsettled question: **does the popover row reuse the existing `NotificationRow` primitive, or get a purpose-built dense row?** Everything else is locked by the concept + the CocOverlay idiom. The two variants take opposite positions on this, which cascades into density, affordance placement, and component budget.
