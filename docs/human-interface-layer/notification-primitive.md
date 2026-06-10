# Notification primitive

Locked by `/concept` (AF8). Cadence rules live in [Interaction Cadences & Notification Discipline](./interaction-cadences-notification-discipline.md); the in-app attention model lives in [The Three Views](./the-three-views-the-rail.md) §4.1–4.2 (Conversations + ambient) and §4.5 (Thread). This doc locks the notification surface, the source-link model, and per-category mute.

## The shape: a lightweight popover, not the rail

HyperIdle removed the notification rail. It is **not** brought back. Instead, notifications surface in a **lightweight, ephemeral popover** anchored at the sidebar bottom strip, next to the avatar/settings button (`packages/web/src/shell/Sidebar.tsx` ~371), with a small unread indicator on the affordance. It pops open on click, lists recent notifications, and closes on dismiss — following the existing Assistant-overlay idiom (`assistantOverlayOpen`). On-demand, secondary, zero-footprint until opened.

| The dead rail | The notification popover |
|---|---|
| Permanent left panel | Ephemeral overlay, on demand |
| Primary navigation surface | Secondary; jump-off only |
| Own screen real estate | Zero footprint until opened |
| Where work *lived* | A *pointer* to where work lives |

Push and email do not exist yet, so the popover is the entire near-term surface; the `notification_queue` egress path (push/email) is real but dormant.

**Definition.** A *Notification* is a discrete record the system creates when something crosses the attention threshold, surfaced in the notification popover and carrying a **source link** back to its origin (a thread *or* a place).

**Essential properties.** id; exactly one **Category**; an **Urgency**; a durable **source link**; title (+ optional body); a **seen/read** state; created-at. Egress-only/accidental: delivery `status`, `channel`, `attempts`, `sentAt`.

**What it (and its surface) is not.**
- **Not the rail** — ephemeral, on-demand, secondary, a pointer to where work lives (see table).
- **Not the Conversations triage badge** — the §4.2 badge counts attention-worthy *threads* (the work queue, thread-derived); the popover lists *notifications* across categories (incl. cost, never in Conversations), from the notification store.
- **Not the Thread / Item / Message** — the notification is the discrete alert that *points* at a thread/place via the source link.
- **Not an ambient indicator** — health dots and auto-unblock are continuous/FYI awareness (§4.2), never in the popover.
- **Not a bus event / log entry** — only the closed subset of events that crosses the threshold becomes a notification.
- **Not a channel** — push/email are channels (future, dormant); a notification exists in the popover today with no channel.

**Composition.** *belongs to* one Category; *carries* a source link + title/body + seen state; *rendered in* the popover; *(future) delivered through* 0..1 Channels.

**Lifecycle.** `unread → read` (read on open/dismiss/jump). Egress (dormant): `pending → sending → {sent|failed|dropped}`; `sending` is a lease; stuck leases recover.

**Authority.** The notification **store** (the `notification_queue` table, repurposed/extended) is the source of truth. The popover (web) reads it; the egress drain (fabric) delivers it. Notification-worthy *events* come from the policy engine, dependency watcher, cost sentinel. The founder mutes categories + sets quiet-hours via **Settings (AF15)**.

## Axes & sources

| Axis | Values | Meaning |
|---|---|---|
| **Category** | `review_request \| blocker_alert \| cost_alert` (CLOSED) | *What* it's about. 1:1 with a Settings mute toggle. |
| **Urgency** | `immediate` (unread indicator + sorts first; future: rings) · `ambient` (listed, no escalation) | In-app prominence. `digest` is a separate egress delivery mode (email; dormant), not a category. |
| **Source link** | a durable route: thread (`/conversations/<id>`) or place (cost detail) | *Where it jumps to.* Persisted, not reconstructed at render. |
| **Channel** | `console \| ntfy \| smtp` (CLOSED) | *Future egress transport.* Dormant. |

Only `item_created` is thread-native in the code; the popover + source-link model makes thread-nativity irrelevant — what matters is whether an event is worth interrupting for and has a route home:

| Event source | Becomes a… | Source link |
|---|---|---|
| `item_created`, `verb=review` | `review_request` | the review thread |
| dependency-watcher / policy-engine "agent blocked" | `blocker_alert` | the blocked task's thread |
| `cost_cap_warning` / `cost_cap_breached` | `cost_alert` | the **cost detail** route (no thread) |
| `routine_fired` → rollup | **digest** *(delivery mode, not a category)* | n/a (email, dormant) |
| `agent.health.degraded` | **ambient health dot** — *not a notification* | n/a |
| dependency-watcher "task unblocked" | **ambient / nothing** — *not a notification* | n/a |

### Category → toggle

| Category | Triggering event(s) | Mute toggle (AF15) | Default urgency |
|---|---|---|---|
| `review_request` | `item_created`, `verb = review` | `reviewAlerts` | `immediate` if `risk_tier ≥ medium` or `blocking`, else `ambient` |
| `blocker_alert` | dependency-watcher / policy-engine "agent blocked" | `blockerAlerts` | `immediate` |
| `cost_alert` | `cost_cap_warning`, `cost_cap_breached` | `costAlerts` | `immediate` |

`emailDigests` is a delivery-mode toggle, not a category.

## Vocabulary

| Term | Definition | Aliases not to use |
|---|---|---|
| **Notification** | Discrete record created when something crosses the attention threshold; source-linked, category-typed, with a seen state. | alert (loosely), ping, toast |
| **Notification popover** | Ephemeral overlay (sidebar bottom, by the avatar) listing recent notifications. | notification center, **rail**, panel, inbox, tray |
| **Source link** | Durable route a notification jumps to (thread or place). | anchor, deep link (impl) |
| **Category** | Closed kind; 1:1 with a mute toggle. | kind (taken by `Item.kind`/`Message.type`), type |
| **Urgency** | `immediate` / `ambient`; `digest` is an egress delivery mode. | severity, priority |
| **Channel** | Future egress transport; dormant. | adapter, provider |
| **Conversations triage badge** | §4.2 count of attention-worthy threads (work queue) — distinct surface. | notification badge |

## Contracts

- **Cardinality.** One Category + one source link per notification (both required); rendered in the one popover; 0..1 Channels per egress attempt.
- **Closure.** Category, Urgency closed (new Category ⇒ new toggle + this doc). Channel closed.
- **Mutability.** Immutable after creation: id, category, source link, title/body, created-at. Mutable: seen/read; egress delivery status/attempts/sentAt/channel.
- **Identity.** Opaque UUID; not content-hashed.
- **Hard rules.**
  1. **One ephemeral popover, anchored by the avatar — never the rail.** No permanent panel, nav surface, or full-screen list.
  2. **Every notification carries a durable, persisted source link** (thread *or* place); routing home never reconstructs a deep link in memory at render.
  3. **Source link need not be a thread** — `cost_alert` links to the cost detail route.
  4. **The closed notification set is three categories.** `digest` is a delivery mode; `agent.health.degraded` and auto-unblock are ambient (§4.2), not notifications.
  5. **Muting is per-category, via Settings** — a muted category produces no popover entry and no ring. No per-notification controls.
  6. **The popover reads the notification store; the triage badge does not** — the §4.2 Conversations badge stays thread-derived.
  7. **Policy is never bypassed for convenience** (egress). Sole exception: a hard cost breach bypasses *factory silence* but respects *quiet hours*.
  8. **Cost notifications fire off a real value** — `cost_alert` reacts to an accumulated cost the system actually writes (coordinate AF10).
  9. **One event → one category (or ambient/digest).**

## Rationale

Notifications are how a human-in-the-loop product reaches the human. The audit found the model undefined, and the deepest gap was that the removed rail left no place for a notification to live. The resolution is a **lightweight ephemeral popover** (anchored by the avatar, following the Assistant-overlay idiom) — explicitly not the rail: on-demand, secondary, zero-footprint, a pointer rather than a home. Generalizing the route-home to a **source link** (a thread *or* a place) dissolves the "not thread-native" problem the code exposed: only `item_created` is thread-native, so forcing cost/health/digest into threads was wrong — cost links to its detail route, while agent-health and auto-unblock are reclassified as ambient (§4.2) and digest as an email delivery mode. The four orthogonal axes (Category, Urgency, Source link, Channel) dissolve the three legacy vocabularies, and the hard rules expose the real defects: the source link was computed but never persisted, the `notification` event had zero listeners, and the cost sentinel watched a field nothing writes.
