# Notification primitive

Locked by `/concept` (AF8). Cadence rules live in [Interaction Cadences & Notification Discipline](./interaction-cadences-notification-discipline.md); the in-app attention model lives in [The Three Views](./the-three-views-the-rail.md) §4.1 (Conversations), §4.2 (Ambient Awareness), §4.5 (Thread). This doc supplies the vocabulary those assumed and makes one load-bearing decision: **notifications have no in-app home.**

## The decision: no notifications place

HyperIdle removed the notification rail. Attention is **distributed**, not centralized:

- **Conversations** — threads needing a verdict or reply (in-app *action*).
- **Ambient indicators** (§4.2) — sidebar triage badge, filter chips, health dots (in-app *awareness*, never interruptive).
- **The phone ring** — push/email that reaches the founder *away from the app*.

> §4.2: "If something needs attention, it goes to Conversations and rings a phone."

**A Notification is that third tier and only that: the out-of-band ring/email when a thread crosses the interruption threshold.** In-app, a notification is *not displayed* — the thread (Conversations) and the ambient badge already represent it. Tapping the push opens the thread. There is no inbox, bell, center, or list; building one would resurrect the rail.

**Definition.** A *Notification* is an out-of-band delivery (push/email) that interrupts the founder when a thread crosses the interruption threshold, carrying a durable anchor back to that thread. Egress-only.

**Essential properties.** id; exactly one **Category**; an **Urgency**; a durable **anchor** (`threadId`, optional `messageId`); title (+ optional body); created-at; a delivery **status**. `channel`, `attempts`, `lastError`, `sentAt`, tags are accidental.

**What it is not.**
- **Not an in-app notifications surface** — no inbox/bell/center/feed/list. That is the removed rail; the Thread + ambient badge are the in-app representation.
- **Not an ambient indicator.** Ambient indicators are continuous, never-interruptive, derived from thread/item state. A notification is a discrete interruption that leaves the app.
- **Not the Thread / Item / Message.** The thread is where work and conversation live; the notification is the out-of-band pointer at it. A thread can exist and never ring. A notification is not a message in the thread.
- **Not a bus event / log entry.** Most events never ring; the notification is the delivered artifact for the closed subset that crosses the threshold.
- **Not a channel.** Push and email are *channels*; the notification is channel-independent.

**Composition.** *belongs to* one Category; *anchors to* exactly one Thread; *carries* title/body + anchor; *delivered through* 0..1 Channels. It owns no in-app record — the Thread is that.

**Lifecycle.** Egress only: `pending → sending → {sent | failed | dropped}`. `sending` is a lease claimed before the adapter call; a stuck lease recovers to `pending`. `dropped` = policy suppressed the ring. No read/unread axis on the notification — read state lives on the thread/item.

**Authority.** The **fabric** notification service owns the egress queue. Notification-worthy *events* come from the policy engine, dependency watcher, and cost sentinel — each tied to a thread (or one the alert creates). The drain/listener (fabric, run by the server) mutates delivery status. The founder controls categories + quiet-hours/silence via **Settings (AF15)** — there is no notification surface to control.

## Axes

| Axis | Values | Meaning |
|---|---|---|
| **Category** | `review_request \| blocker_alert \| cost_alert \| digest` (CLOSED) | *What* it's about. 1:1 with a Settings toggle. |
| **Urgency** | `immediate` (ring now) · `digest` (batched email) · *ambient-only* (no notification — thread + badge only) | *Whether and how loud* it leaves the app. Derived from Category + `risk_tier` + `blocking`. |
| **Anchor** | exactly one Thread (persisted `threadId` [+ `messageId`]) | *What it routes back to* — opens in Conversations. No orphan notifications. |
| **Channel** | `console \| ntfy \| smtp` (CLOSED for now) | *How it leaves the app.* Founder-configured; the only place a notification physically exists. |

### Category → trigger → toggle

| Category | Triggering event(s) | Toggle (AF15) | Default urgency |
|---|---|---|---|
| `review_request` | `item_created`, `verb = review` | `reviewAlerts` | `immediate` if `risk_tier ≥ medium` or `blocking`, else *ambient-only* |
| `blocker_alert` | dependency-watcher / policy-engine "agent blocked" | `blockerAlerts` | `immediate` |
| `cost_alert` | `cost_cap_warning`, `cost_cap_breached` | `costAlerts` | `immediate` |
| `digest` | scheduled rollup of *ambient-only* + FYI backlog | `emailDigests` | `digest` |

### Anchoring systemic alerts

Thread-shaped categories (`review_request`, `blocker_alert`) anchor to the thread carrying the triggering message. `cost_alert` and other systemic alerts have no natural conversation, so they anchor to a **`factory`-hosted feed thread or the founder's `user`-hosted assistant thread** (§4.5 configurations) — consistent with routing rule #4 ("how the factory operates → assistant thread"). Either way the anchor surfaces in Conversations; architecture picks which.

## Vocabulary

| Term | Definition | Aliases not to use |
|---|---|---|
| **Notification** | Out-of-band ring/email when a thread crosses the interruption threshold; egress-only, thread-anchored. | alert (as a row), ping, toast, in-app notification, **notification center/inbox/bell/rail** (dead) |
| **Anchor** | The single Thread a notification routes back to. | source-surface, target page |
| **Channel** | Out-of-band transport. | adapter, provider |
| **Urgency** | `immediate` / `digest` / *ambient-only*. | severity, priority |
| **Category** | Closed kind; 1:1 with a toggle. | kind (taken by `Item.kind`/`Message.type`), type |
| **Ambient indicator** | Triage badge / chips / dots; NOT a notification. | notification badge |
| **Quiet hours** | Per-human window that *defers* the ring. | DND, mute |
| **Silence** | Factory/product suppression of the non-urgent ring. | block |

## Contracts

- **Cardinality.** One Category + one anchor Thread per notification (both required); 0..1 Channels per attempt; zero in-app records.
- **Closure.** Category, Urgency closed (new Category ⇒ new toggle + this doc). Channel closed for now.
- **Mutability.** Immutable after creation: id, category, anchor, title/body, created-at. Mutable: delivery status, attempts, lastError, sentAt, claimedAt, channel. No read state on the notification.
- **Identity.** Opaque UUID; not content-hashed (a recurring ring is a distinct row).
- **Hard rules.**
  1. **No in-app notifications surface** — routing back targets the anchor thread in Conversations (`/conversations/<threadId>` [+ message]). No inbox/bell/center/list.
  2. **Every notification anchors to exactly one Thread** — no orphans; systemic alerts anchor to a `factory`/`user` thread.
  3. **Route-back is durable** — the anchor is persisted on the row, not reconstructed in memory at render time.
  4. **Suppression silences the ring, not the work** — a category toggle off / silence / quiet-hours suppresses only the out-of-band ring; the anchor thread still surfaces in Conversations + the ambient badge. Nothing is lost.
  5. **Policy is never bypassed for convenience** — silence + quiet-hours always apply. Sole exception: a hard cost breach bypasses *factory silence* but respects *quiet hours*.
  6. **Cost notifications fire off a real value** — `cost_alert` reacts to an accumulated cost the system actually writes (coordinate AF10).
  7. **One event → one category.**
  8. **The queue is an egress log, not an inbox** — `notification_queue` is never queried to render an in-app list.

## Rationale

Notifications are how a human-in-the-loop product reaches the human. The audit found the model undefined, but the deepest gap was conceptual: **the product removed the notification rail, so there was no place for a notification to live** — and the obvious fix (build an in-app notification center) is wrong, because it re-creates the rail and duplicates Conversations. The resolution is to recognize that the in-app representation already exists — the Thread in Conversations plus the ambient triage badge (§4.2) — and to scope a Notification narrowly as the *out-of-band* tier: the ring/email that interrupts the founder when they're away, anchored back to a single thread. That also dissolves the three misaligned vocabularies (cadence doc, code `severity`, Settings toggles) into four orthogonal axes — Category (what), Urgency (how loud, incl. an *ambient-only* "don't ring" tier), Anchor (which thread it routes to), Channel (how it leaves the app) — and exposes the real defects: the deep link was computed but never persisted, the `notification` event had zero listeners, and the cost sentinel watched a field nothing writes.
