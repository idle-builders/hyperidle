# Notification primitive

Locked by `/concept` (AF8). Cadence rules live in [Interaction Cadences & Notification Discipline](./interaction-cadences-notification-discipline.md); the in-app attention model lives in [The Three Views](./the-three-views-the-rail.md) §4.1 (Conversations), §4.2 (Ambient Awareness), §4.5 (Thread). This doc supplies the vocabulary those assumed and locks two decisions: **notifications have no dedicated in-app surface**, and **every notification maps to exactly one Thread**.

## The decision: no notifications place; the thread is the home

HyperIdle removed the notification rail. Attention is **distributed**: Conversations (threads needing action), ambient indicators (§4.2 — the **triage badge on the Conversations nav item**, filter chips, health dots), and — *in future* — the phone ring.

**Push and email do not exist yet.** The notification surface today is **entirely in-app**, and it is the §4.2 one: an indicator on/around the Conversations nav item + the anchor thread surfacing in the list. No inbox, bell, or center — that is the dead rail.

### Two mechanisms, one concept

| | **In-app indicator** (primary) | **Egress queue** (dormant) |
|---|---|---|
| What | Conversations triage badge + the anchor thread in the list, prominence scaled by urgency. | Push/email via `console`/`ntfy`/`smtp`. |
| Source of truth | **Thread / item state**, live over WebSocket. | `notification_queue` egress log. |
| Today | Works without push/email. | Only `console`; `ntfy`/`smtp` need config. |

The badge is **derived from threads, never from `notification_queue`.**

**Definition.** A *Notification* is a thread-state change worth the founder's attention. It maps to exactly one Thread and, in-app, manifests *as* that thread surfacing in Conversations with an attention indicator (and a count on the Conversations nav badge). *(Future: also an out-of-band ring that deep-links to the same thread.)*

**Essential properties.** id; exactly one **Category**; an **Urgency**; a durable **anchor** (`threadId`, optional `messageId`); title (+ optional body); created-at. Egress-only/accidental: delivery `status`, `channel`, `attempts`, `lastError`, `sentAt`.

**What it is not.**
- **Not a dedicated in-app notifications surface** — no inbox/bell/center/list. That is the removed rail; the Conversations triage badge + the anchor thread are the in-app rendering.
- **Not separate from the badge.** The §4.2 triage badge *is* how notifications render in-app — it counts attention-worthy threads, derived from thread state, not from the egress queue.
- **Not the Thread / Item / Message.** The thread is where work and conversation live; the notification is the *attention-worthiness* of a thread change. A thread can change without notifying (`ambient`). The assistant's cost-alert message is a normal thread message; the notification is that it crossed the threshold.
- **Not a bus event / log entry.** Most events never notify; the notification is the closed subset that crosses the threshold.
- **Not a channel.** Push/email are *channels* (future, dormant); a notification exists in-app today with no channel.

**Composition.** *belongs to* one Category; *maps to* exactly one Thread; in-app *renders as* that thread + a count on the Conversations badge; *(future) delivered through* 0..1 Channels.

**Lifecycle.** In-app: appears with the thread → cleared when the thread is read/resolved (thread state, not separate notification state). Egress (dormant): `pending → sending → {sent | failed | dropped}`; `sending` is a lease; stuck leases recover to `pending`.

**Authority.** In-app indicator: derived by server/web from thread state. Egress queue: owned by the **fabric** notification service. Notification-worthy *events* come from the policy engine, dependency watcher, cost sentinel — each tied to a thread (or one the alert creates). The founder controls categories + quiet-hours/silence via **Settings (AF15)** — there is no notification surface to control.

## Axes

| Axis | Values | Meaning |
|---|---|---|
| **Category** | `review_request \| blocker_alert \| cost_alert \| digest` (CLOSED) | *What* it's about. 1:1 with a Settings toggle. |
| **Urgency** | `immediate` (attention-demanding) · `ambient` (plain unread) · `digest` (egress batching, dormant) | *How prominent* in-app; once push exists, `immediate` rings. Derived from Category + `risk_tier` + `blocking`. |
| **Anchor** | exactly one Thread (persisted `threadId` [+ `messageId`]) | *What it routes back to* — opens in Conversations. No orphans. |
| **Channel** | `console \| ntfy \| smtp` (CLOSED) | *Future egress transport.* Founder-configured; dormant. |

### Category → trigger → toggle

| Category | Triggering event(s) | Toggle (AF15) | Default urgency |
|---|---|---|---|
| `review_request` | `item_created`, `verb = review` | `reviewAlerts` | `immediate` if `risk_tier ≥ medium` or `blocking`, else `ambient` |
| `blocker_alert` | dependency-watcher / policy-engine "agent blocked" | `blockerAlerts` | `immediate` |
| `cost_alert` | `cost_cap_warning`, `cost_cap_breached` → assistant-thread message | `costAlerts` | `immediate` |
| `digest` | scheduled rollup of `ambient` + FYI backlog | `emailDigests` | `digest` (egress; dormant) |

### Anchoring — every notification is a thread

Threads attach to every host kind (§4.5), so there is always a thread to map to. `review_request`/`blocker_alert` map to the thread carrying the triggering message. **`cost_alert` maps to the founder's assistant thread** (host = `user`): the assistant posts the alert as a message with a link to the cost detail. This is routing rule #4 ("how the factory operates → assistant thread") and keeps **one** in-app surface — the Conversations badge — for every notification. *(Locked founder decision; cost alerts do not get a separate surface.)*

## Vocabulary

| Term | Definition | Aliases not to use |
|---|---|---|
| **Notification** | Thread-state change worth attention; maps to one Thread; in-app via the Conversations badge + thread. | alert (as a row), ping, toast, **notification center/inbox/bell/rail** (dead) |
| **Anchor** | The single Thread a notification maps to. | source-surface, target page |
| **Triage badge** | §4.2 indicator on the Conversations nav item; the in-app rendering of attention-worthy threads. | notification center |
| **Urgency** | `immediate` / `ambient` / `digest`. | severity, priority |
| **Category** | Closed kind; 1:1 with a toggle. | kind (taken by `Item.kind`/`Message.type`), type |
| **Channel** | Future egress transport; dormant. | adapter, provider |
| **Quiet hours / Silence** | Defer / suppress the future egress ring. | DND, mute, block |

## Contracts

- **Cardinality.** One Category + one anchor Thread per notification (both required). In-app: renders through its thread + the shared Conversations badge (no per-notification in-app record). Egress: 0..1 Channels per attempt.
- **Closure.** Category, Urgency closed (new Category ⇒ new toggle + this doc). Channel closed.
- **Mutability.** Immutable after creation: id, category, anchor, title/body, created-at. Mutable: egress delivery status/attempts/lastError/sentAt/channel. No separate in-app read state — read/resolved is the thread's.
- **Identity.** Opaque UUID; not content-hashed.
- **Hard rules.**
  1. **No dedicated in-app notifications surface** — route back to the anchor thread in Conversations (`/conversations/<threadId>` [+ message]). No inbox/bell/center/list.
  2. **Every notification maps to exactly one Thread** — no orphans; **`cost_alert` → the founder's assistant thread** (host=`user`), posted as a message.
  3. **The in-app indicator is derived from thread state, not the egress queue** — the Conversations triage badge never reads `notification_queue`.
  4. **Route-back is durable** — the anchor is persisted on the row, not reconstructed in memory at render.
  5. **Suppression silences the egress ring, not the thread** — a category toggle off / silence / quiet-hours suppresses only the (future) push/email; the anchor thread still surfaces in Conversations + the triage badge.
  6. **Policy is never bypassed for convenience** (egress). Sole exception: a hard cost breach bypasses *factory silence* but respects *quiet hours*.
  7. **Cost notifications fire off a real value** — `cost_alert` reacts to an accumulated cost the system actually writes (coordinate AF10).
  8. **One event → one category → one thread.**
  9. **The queue is an egress log, not an inbox** — `notification_queue` is never queried to render an in-app list.

## Rationale

Notifications are how a human-in-the-loop product reaches the human. The audit found the model undefined, but the deepest gap was conceptual: the product removed the notification rail, so there was no place for a notification to live — and the obvious fix (an in-app notification center) is wrong, because it re-creates the rail and duplicates Conversations. The resolution: a notification *maps to a Thread* and, in-app, surfaces through the §4.2 Conversations triage badge that already exists — no new surface. Because push and email do not exist yet, the in-app indicator (derived from thread state) is the entire near-term surface, while the `notification_queue` + adapters are a separate, dormant egress mechanism. Mapping *every* notification to a thread — including cost alerts, via an assistant-thread message (routing rule #4) — is what keeps the in-app surface singular; the moment a notification isn't a thread, you must invent where it shows in-app, which drifts back toward the rail. The four orthogonal axes (Category, Urgency, Anchor, Channel) dissolve the three misaligned legacy vocabularies, and the hard rules expose the real defects: the deep link was computed but never persisted, the `notification` event had zero listeners, and the cost sentinel watched a field nothing writes.
