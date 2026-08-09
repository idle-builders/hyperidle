# Notification primitive

Owns the notification model (AF8): the popover surface, the type registry, the source-link model, muting, the egress queue/digest, and the cadence discipline. The in-app attention model (triage badge, ambient indicators) lives in [The Three Views](./the-three-views.md); the end-user walkthrough lives in [guides/user/the-interface](../guides/user/the-interface.md).

## The surface: a lightweight popover

Notifications surface in an **ephemeral popover** (`layers/core-ui/src/shell/NotificationPopover.tsx`) anchored at the sidebar bottom strip, next to the avatar/settings button, with a red unread dot on the trigger (`layers/core-ui/src/shell/Sidebar.tsx`). Pops open on click, lists recent notifications, closes on dismiss — same idiom as the Assistant overlay. On-demand, secondary, zero footprint until opened: a *pointer* to where work lives, never a home for it.

Egress (push/email) is **live**: the ntfy (push) and smtp (email) adapters, the adapter factory, and the queue drain all ship in `layers/core-api/notifications/src/install.ts`. Console is the unconfigured fallback.

## Definition

A **Notification** is a discrete record the system creates when something crosses the attention threshold — an instance of a registered **type**, surfaced in the popover and carrying a **source link** back to its origin (a thread *or* a place).

**Essential properties.** id; a **type key**; an **urgency** (the type's default); a durable, persisted **source link** (`source_link`, `framework/db/src/schema.ts`); title (+ optional body); a **seen/read** state; created-at. Egress fields: delivery `status`, `channel`, `attempts`, `sentAt`.

**What it (and its surface) is not.**

- **Not muted by editorial category** — the mute unit is the notification **type** itself (1:1 with a real source), not an imposed bucket.
- **Not the Conversations triage badge** — that badge counts attention-worthy *threads* (thread-derived); the popover lists *notifications* across types, from the notification store.
- **Not the Thread / Item / Message** — the notification *points* at a thread/place via the source link.
- **Not an ambient indicator** — health dots and auto-unblock are continuous/FYI awareness, never in the popover (see [The Three Views](./the-three-views.md)).
- **Not a bus event / log entry** — only the registered subset of events that crosses the threshold becomes a notification.
- **Not a channel** — push/email are channels the egress path delivers through.

**Composition.** *is an instance of* one type; *carries* a source link + title/body + seen state; *rendered in* the popover; *delivered through* 0..1 channels on egress.

**Lifecycle.** In-app: `unread → read` (read on open/dismiss/jump). Egress: `pending → sending → {sent|failed|dropped}`; `sending` is a lease; stuck leases recover on every drain tick (`layers/core-api/notifications/src/install.ts`, 1-minute interval).

**Authority.** The notification **store** (`notification_queue`) is source of truth. The popover (web) reads it; the drain delivers egress. Notification-worthy events come from the policy engine and the dependency watcher.

## The mute model

One per-type on/off state, shown in two surfaces:

| Concern | Mechanism |
|---|---|
| Mute one | Popover row → "mute notifications like this" → writes `type → off` |
| See / re-enable everything | Settings → flat list of **all** notification types, each an on/off toggle (`SettingsNotifications.tsx` renders the registry, no hardcoded array) |
| The mutable unit | The notification **type** (stable `key`, e.g. `review_request`) |
| The registry | A **code-defined const list** `{ key, label, shortLabel, description, defaultUrgency }` (`framework/domain-model/src/notifications.ts`); a new kind = one entry, auto-listed in Settings |
| Persistence | Muted type keys in `server_config` (`notifications.mutedTypes`) |

**Dismiss ≠ mute:** dismissing clears *this instance* (seen/read); muting suppresses *future instances of the type*.

**Shipped granularity is factory-wide, not per-user.** The `MutePreferenceReader`/`MutePreferenceWriter` seam (`layers/core-api/notifications/src/install.ts`) deliberately omits `userId`; AF15 swaps in per-user persistence behind the same interface.

## Types & sources

The registry (`NOTIFICATION_TYPES`, `framework/domain-model/src/notifications.ts`) is the complete set — types are never derived from string keys elsewhere:

| Event source | Type (key) | Source link | Default urgency |
|---|---|---|---|
| `item_created`, `verb=review` | `review_request` | the review thread | `immediate`; the listener demotes to `ambient` for low-risk (risk_tier < medium, non-blocking) |
| dependency-watcher / policy-engine "agent blocked" | `blocker_alert` | the blocked task's thread | `immediate` |
| FYI-grade rollups | — *digest delivery mode, not a type* | n/a | — |
| `agent.health.degraded` | — *ambient health dot, not a notification* | n/a | — |
| dependency-watcher "task unblocked" | — *ambient / nothing* | n/a | — |

Thread-nativity is irrelevant — what matters is whether an event is worth interrupting for and has a route home. Health and auto-unblock are ambient; digest is a delivery mode.

## Axes

| Axis | Values | Meaning |
|---|---|---|
| **Type** | a registered `key` from the const registry (open set per release) | *What* it is + the mute unit + the urgency-default lookup. |
| **Urgency** | `immediate` (unread dot + sorts first) · `ambient` (listed, no escalation) | Per-type default. `digest` is a separate egress delivery mode. |
| **Source link** | a durable route: thread or place | *Where it jumps to.* Persisted, not reconstructed at render. |
| **Channel** | `console \| ntfy \| smtp` (CLOSED, `layers/core-api/notifications/src/types.ts`) | Egress transport. Live; console when unconfigured. |

## Cadence discipline

Notification fatigue is the failure mode. The shipped discipline:

- **Blocking / risk ≥ medium review → immediate** notification + push severity (`NotificationSeverity = "blocking" | "digest"`, `layers/core-api/notifications/src/types.ts`) — the agent is paused.
- **FYI-grade events → digest** egress delivery mode, never individual pushes. Digest always flushes (non-interruptive).
- **Ambient indicators never notify** — health dots, triage badge, auto-unblock are deliberately absent from the registry.
- **Quiet hours** are opt-in (`quietHoursEnabled`, default false; start/end persisted — `layers/core-api/settings/src/server-config.ts`); blocking items queue rather than push.
- **Silence mode** is factory-level; nothing bypasses it. Blocking items defer on silence mode and on quiet hours alike.

## Vocabulary

| Term | Definition | Aliases not to use |
|---|---|---|
| **Notification** | Discrete record created when something crosses the attention threshold; an instance of a type, source-linked, with a seen state. | alert (loosely), ping, toast |
| **Notification type** | A registered kind (`key` + `label` + `shortLabel` + default urgency); the unit of muting. | category (rejected), kind (taken) |
| **Notification popover** | Ephemeral overlay (sidebar bottom, by the avatar) listing recent notifications. | notification center, panel, inbox, tray |
| **Source link** | Durable route a notification jumps to (thread or place). | anchor, deep link (impl) |
| **Mute preference** | Per-type on/off; one state behind the popover shortcut and the Settings list. | category mute |
| **Urgency** | Per-type default: `immediate` / `ambient`; `digest` is an egress delivery mode. | severity, priority |
| **Channel** | Egress transport (`console`/`ntfy`/`smtp`). | adapter, provider |
| **Conversations triage badge** | Count of attention-worthy threads (work queue) — distinct surface. | notification badge |

## Contracts

- **Cardinality.** One type + one source link per notification (both required); one popover; 0..1 channels per egress attempt; one mute preference per type.
- **Closure.** The type registry is code-defined and finite per release; new types added by a registry entry (auto-listed in Settings). Urgency closed. Channel closed.
- **Mutability.** Immutable after creation: id, type key, source link, title/body, created-at. Mutable: seen/read; egress delivery fields; mute preferences.
- **Identity.** Notification: opaque UUID. Type: stable string `key`.
- **Hard rules.**
  1. **One ephemeral popover, anchored by the avatar** — no persistent notification panel.
  2. **Every notification carries a durable, persisted source link** (thread *or* place); routing home never reconstructs a deep link in memory at render.
  3. **Source link need not be a thread** — a type may link to a place instead.
  4. **The mute unit is the notification type.** No editorial categories; no per-instance mute (per-instance = dismiss/read). Settings renders the full registry so any type can be re-enabled. Per-user mute state is the AF15 seam, not yet shipped.
  5. **Popover shortcut and Settings list write the same mute state.** A muted type produces no popover entry.
  6. **`digest` is a delivery mode; `agent.health.degraded` and auto-unblock are ambient, not notifications.**
  7. **The popover reads the notification store; the triage badge does not** — the Conversations badge stays thread-derived.
  8. **Policy is never bypassed for convenience** (egress) — there is no exception.
  9. **One event → one type (or ambient/digest).**
