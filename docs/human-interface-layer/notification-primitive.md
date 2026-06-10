# Notification primitive

Locked by `/concept` (AF8). Cadence rules live in [Interaction Cadences & Notification Discipline](./interaction-cadences-notification-discipline.md); the in-app attention model lives in [The Three Views](./the-three-views-the-rail.md) §4.1–4.2 (Conversations + ambient) and §4.5 (Thread). This doc locks the notification surface, the source-link model, and per-type/per-user muting.

## The shape: a lightweight popover, not the rail

HyperIdle removed the notification rail and does **not** bring it back. Notifications surface in a **lightweight, ephemeral popover** anchored at the sidebar bottom strip, next to the avatar/settings button (`packages/web/src/shell/Sidebar.tsx` ~371), with a small unread indicator on the affordance. Pops open on click, lists recent notifications, closes on dismiss — following the existing Assistant-overlay idiom (`assistantOverlayOpen`). On-demand, secondary, zero-footprint until opened.

| The dead rail | The notification popover |
|---|---|
| Permanent left panel | Ephemeral overlay, on demand |
| Primary navigation surface | Secondary; jump-off only |
| Own screen real estate | Zero footprint until opened |
| Where work *lived* | A *pointer* to where work lives |

Push and email do not exist yet, so the popover is the entire near-term surface; the `notification_queue` egress path (push/email) is real but dormant.

**Definition.** A *Notification* is a discrete record the system creates when something crosses the attention threshold — an instance of a registered **type**, surfaced in the popover and carrying a **source link** back to its origin (a thread *or* a place).

**Essential properties.** id; a **type key**; an **urgency** (the type's default); a durable **source link**; title (+ optional body); a **seen/read** state; created-at. Egress-only/accidental: delivery `status`, `channel`, `attempts`, `sentAt`.

**What it (and its surface) is not.**
- **Not the rail** — ephemeral, on-demand, secondary, a pointer to where work lives.
- **Not muted by editorial category** — the mute unit is the notification **type** itself (1:1 with a real source), not an imposed bucket.
- **Not the Conversations triage badge** — the §4.2 badge counts attention-worthy *threads* (the work queue, thread-derived); the popover lists *notifications* across types (incl. cost, never in Conversations), from the notification store.
- **Not the Thread / Item / Message** — the notification *points* at a thread/place via the source link.
- **Not an ambient indicator** — health dots and auto-unblock are continuous/FYI awareness (§4.2), never in the popover.
- **Not a bus event / log entry** — only the registered subset of events that crosses the threshold becomes a notification.
- **Not a channel** — push/email are channels (future, dormant).

**Composition.** *is an instance of* one type; *carries* a source link + title/body + seen state; *rendered in* the popover; *(future) delivered through* 0..1 Channels.

**Lifecycle.** `unread → read` (read on open/dismiss/jump). Egress (dormant): `pending → sending → {sent|failed|dropped}`; `sending` is a lease; stuck leases recover.

**Authority.** The notification **store** (the `notification_queue` table, repurposed/extended) is source of truth. The popover (web) reads it; the egress drain (fabric) delivers it. Notification-worthy *events* come from the policy engine, dependency watcher, cost sentinel. **Mute preferences are per-user**, set via the popover shortcut or the Settings list.

## The mute model

One per-user, per-type on/off state, shown in two surfaces:

| Concern | Mechanism |
|---|---|
| Mute one | Popover row → "mute notifications like this" → writes `type → off` for this user |
| See / re-enable everything | Settings → flat list of **all** notification types, each an on/off toggle |
| The mutable unit | The notification **type** (stable `key`, e.g. `cost_cap_breached`) |
| The "registry" | A **code-defined const list** of types `{ key, label, defaultUrgency }`; a new kind = one entry, auto-listed in Settings |
| Persistence | A **per-user** set of muted type keys |

**Dismiss ≠ mute:** dismissing clears *this instance* (seen/read); muting suppresses *future instances of the type*. This supersedes the three fixed AF15 toggles (`reviewAlerts`/`costAlerts`/`blockerAlerts`) by generalizing them into the per-type list (AF15 owns the rework + per-user persistence).

## Types & sources

Only `item_created` is thread-native in the code; the popover + source-link model makes thread-nativity irrelevant — what matters is whether an event is worth interrupting for and has a route home. Each notification declares a **type**:

| Event source | Type (key) | Source link | Default urgency |
|---|---|---|---|
| `item_created`, `verb=review` | `review_request` | the review thread | `immediate` if `risk_tier ≥ medium`/`blocking`, else `ambient` |
| dependency-watcher / policy-engine "agent blocked" | `blocker_alert` | the blocked task's thread | `immediate` |
| `cost_cap_warning` / `cost_cap_breached` | `cost_alert` (architecture may split) | the **cost detail** route (no thread) | `immediate` |
| `routine_fired` → rollup | — *digest delivery mode, not a type* | n/a (email, dormant) | — |
| `agent.health.degraded` | — *ambient health dot (§4.2), not a notification* | n/a | — |
| dependency-watcher "task unblocked" | — *ambient / nothing* | n/a | — |

The type list is code-defined and finite per release, extensible by a registry entry. Each type is independently mutable per-user.

## Axes

| Axis | Values | Meaning |
|---|---|---|
| **Type** | a registered `key` from the const registry (open set) | *What* it is + the mute unit + the urgency-default lookup. |
| **Urgency** | `immediate` (unread indicator + sorts first; future: rings) · `ambient` (listed, no escalation) | Per-type default. `digest` is a separate egress delivery mode. |
| **Source link** | a durable route: thread or place | *Where it jumps to.* Persisted, not reconstructed at render. |
| **Channel** | `console \| ntfy \| smtp` (CLOSED) | *Future egress transport.* Dormant. |

## Vocabulary

| Term | Definition | Aliases not to use |
|---|---|---|
| **Notification** | Discrete record created when something crosses the attention threshold; an instance of a type, source-linked, with a seen state. | alert (loosely), ping, toast |
| **Notification type** | A registered kind (`key` + `label` + default urgency); the unit of muting. | category (rejected), kind (taken) |
| **Notification popover** | Ephemeral overlay (sidebar bottom, by the avatar) listing recent notifications. | notification center, **rail**, panel, inbox, tray |
| **Source link** | Durable route a notification jumps to (thread or place). | anchor, deep link (impl) |
| **Mute preference** | Per-user, per-type on/off; one state behind the popover shortcut and the Settings list. | category mute |
| **Urgency** | Per-type default: `immediate` / `ambient`; `digest` is an egress delivery mode. | severity, priority |
| **Channel** | Future egress transport; dormant. | adapter, provider |
| **Conversations triage badge** | §4.2 count of attention-worthy threads (work queue) — distinct surface. | notification badge |

## Contracts

- **Cardinality.** One type + one source link per notification (both required); one popover; 0..1 Channels per egress attempt; one per-user mute preference per type.
- **Closure.** The type registry is code-defined and finite per release; new types added by a registry entry (auto-listed in Settings). Urgency closed. Channel closed.
- **Mutability.** Immutable after creation: id, type key, source link, title/body, created-at. Mutable: seen/read; egress delivery fields; per-user mute preferences.
- **Identity.** Notification: opaque UUID. Type: stable string `key` (reuse `eventType`).
- **Hard rules.**
  1. **One ephemeral popover, anchored by the avatar — never the rail.**
  2. **Every notification carries a durable, persisted source link** (thread *or* place); routing home never reconstructs a deep link in memory at render.
  3. **Source link need not be a thread** — `cost_alert` links to the cost detail route.
  4. **The mute unit is the notification type, and mute state is per-user.** No editorial categories; no per-instance mute (per-instance = dismiss/read). The Settings list renders the full registry so any type can be re-enabled.
  5. **Popover shortcut and Settings list write the same per-user mute state.** A muted type produces no popover entry and no ring.
  6. **`digest` is a delivery mode; `agent.health.degraded` and auto-unblock are ambient (§4.2), not notifications.**
  7. **The popover reads the notification store; the triage badge does not** — the §4.2 Conversations badge stays thread-derived.
  8. **Policy is never bypassed for convenience** (egress). Sole exception: a hard cost breach bypasses *factory silence* but respects *quiet hours*.
  9. **Cost notifications fire off a real value** — `cost_alert` reacts to an accumulated cost the system actually writes (coordinate AF10).
  10. **One event → one type (or ambient/digest).**

## Rationale

Notifications are how a human-in-the-loop product reaches the human. The audit found the model undefined, and the deepest gap was that the removed rail left no place for a notification to live. The resolution is a **lightweight ephemeral popover** (anchored by the avatar, following the Assistant-overlay idiom) — explicitly not the rail: on-demand, secondary, zero-footprint, a pointer rather than a home. Generalizing the route-home to a **source link** (a thread *or* a place) dissolves the "not thread-native" problem the code exposed: only `item_created` is thread-native, so forcing cost/health/digest into threads was wrong — cost links to its detail route, agent-health and auto-unblock are reclassified ambient (§4.2), and digest is an email delivery mode. Muting is **per-type, per-user**, not by editorial category — the founder found fixed buckets artificial, and the honest unit is the notification's own type (1:1 with its source). The simple solution is one per-user mute state behind two surfaces: a "mute notifications like this" shortcut on the notification, and a flat list of all registered types in Settings to re-enable. The hard rules expose the real defects: the source link was computed but never persisted, the `notification` event had zero listeners, and the cost sentinel watched a field nothing writes.
