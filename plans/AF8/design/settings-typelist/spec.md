# Settings notification type-list (routine — 1 variant)

**User workpackage.** Founder opens Settings → Notifications → sees a flat list of every registered notification type, each with an on/off Toggle, and re-enables anything muted (incl. from the popover shortcut).

## Composition (extends `SettingsNotifications.tsx`)
- Reuses the existing **`Toggle`** DS component (label + description + on/off), same `flex flex-col gap-[18px]` stack.
- **Replaces** the hardcoded `NOTIFICATION_SETTINGS` array + `SERVER_KEY_MAP` with a render over the **type registry** (`NOTIFICATION_TYPES` from shared — `{ key, label, description, defaultUrgency }`).
- Each row: `Toggle` where `on = !isMuted(typeKey)`, `label = type.label`, `description = type.description`. Toggling off writes a mute; on clears it.
- Removes the AD3 solo-mode filtering of `blocker-notifications`/`email-digests` (the registry is the single source; every registered type shows). The `email-digests` local-only toggle is **removed** — digest is an egress delivery mode, not a notification type (concept hard rule #6).

## Hierarchy
1. Type label (per Toggle) — what kind of notification.
2. Description — when it fires (one line, from the registry).
3. Toggle — the on/off state.

## States
- **Empty:** never empty — the registry is non-empty at every release (at minimum `review_request`, `blocker_alert`, `cost_alert`). No empty state needed.
- **Loading:** the section renders with defaults (all on) until the per-user mute set loads (existing `useSettings` pattern; fail-open = all on).
- **Error:** mute-read failure → fail-open (all toggles on), matching today's fail-open behavior. No blocking error UI.
- **Populated:** one Toggle per registered type, registry order (immediate-urgency types first).

## Behavior
- Toggle off → optimistic local flip → write mute (AF15 store) → on failure, revert + Toast.
- Toggle on → clear mute, same path.
- The popover's "mute this type" writes the SAME store → reopening Settings shows the toggle off. One state, two surfaces (concept locked).

## Mobile
Unchanged — Settings is already a single scrollable column; the type-list stacks identically.

## Signature
**The registry IS the UI** — adding a notification type in code makes a new Settings row appear automatically. No hand-maintained toggle list to drift out of sync.

## Rejected directions (considered, not built)
- **Grouped by urgency (immediate / ambient sections).** Rejected: only ~3 types near-term; sectioning is premature chrome. The flat list is honest (concept: "no invented buckets").
- **Channel matrix (type × channel grid: in-app / push / email).** Rejected: push/email are dormant; a matrix advertises capabilities that don't exist and contradicts "the popover is the entire near-term surface."
- **Per-type urgency override (let user demote immediate→ambient).** Rejected: urgency is a per-type *default* (concept closed); user-tunable urgency is scope creep with no AC. Mute is the only per-user control.
- **"Mute all" master switch.** Rejected: factory silence + quiet-hours already exist as the global suppression mechanism (silence-policy); a second global mute would be a confusing duplicate.
