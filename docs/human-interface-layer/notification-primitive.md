# Notification primitive

Locked by `/concept` (AF8). The cadence rules live in [Interaction Cadences & Notification Discipline](./interaction-cadences-notification-discipline.md); this doc supplies the vocabulary that doc assumed — Category, Urgency, Surface, Channel — and the contracts that bind them.

**Definition.** A *Notification* is a discrete, user-facing alert that something needs or deserves the founder's attention, carrying a durable reference back to its source and a delivery lifecycle. It is the alert *about* a state change — not the state, not the work, not the transport.

**Essential properties.** Every notification has an opaque id; exactly one **Category**; an **Urgency**; a **source reference** that resolves to a route back to the originating thread / conversation / entity; a title (+ optional body); a created-at; and a delivery **status**. External `channel`, `attempts`, `lastError`, `sentAt`, and tags are accidental — some notifications have them, they are not what make it a notification.

**What it is not.**
- **Not an ambient indicator** (sidebar badge, filter chip, health dot, triage badge). Those are continuous awareness state derived from `Item` state; they never push and aren't individually addressable or lifecycle-tracked. A notification may bump an unread count, but the badge is not the notification.
- **Not the Item / review request.** The Item is the work (in Conversations); the notification is the optional out-of-band signal that the item exists and where it lives. An item can exist and never notify.
- **Not a thread message.** A message is authored content inside a thread; a notification is system-generated meta about a state change.
- **Not a bus event / log entry.** Most `notification` / `cost_cap_*` events never become user-facing notifications. Emitting an event ≠ notifying a human; the notification is the derived, delivered artifact for the closed subset that warrants attention.
- **Not a push or email message.** Those are *channels*. A notification is channel-independent and renders to the in-app surface plus, conditionally, push and/or email.

**Composition.** A notification *belongs to* one Category; *carries* a source reference `{kind, id}` + title/body + urgency; *is delivered to* one in-app surface (always) and 0..1 external channels (conditional); *is referenced by* the digest (when batched) and an in-app unread count.

**Lifecycle.** Delivery: `pending → sending → {sent | failed | dropped}`. `sending` is a lease claimed before the adapter call; a lease stuck past timeout recovers to `pending`. `dropped` = policy suppressed external delivery (the in-app record persists). Read axis (in-app): `unread → read`.

**Authority.** The **fabric** notification service owns the queue/record. Notification-worthy *events* come from the policy engine, dependency watcher, and cost sentinel. The drain/listener (fabric, run by the server) mutates delivery status. The founder mutates read state and, via **Settings (AF15)**, category enable/disable and quiet-hours/silence policy.

## Axes

A notification is described by four orthogonal axes. Earlier code smeared these into one `severity` field; they are now separate.

| Axis | Values | Meaning |
|---|---|---|
| **Category** | `review_request \| blocker_alert \| cost_alert \| digest` (CLOSED) | *What* it's about. Maps 1:1 to a Settings toggle. |
| **Urgency** | `immediate \| batched` (CLOSED) | *How loud.* `immediate` pushes now (subject to policy); `batched` goes to the digest only. Derived from Category + `risk_tier` + `blocking`. |
| **Surface** | in-app surface (always) · external channel (conditional) | *Where it's perceived.* The originating thread is the *anchor*, not a surface — the in-app surface routes to it. |
| **Channel** | `console \| ntfy \| smtp` (CLOSED for now) | *How it leaves the app.* Founder-configured external transport; independent of Category/Urgency. |

### Category → trigger → toggle

| Category | Triggering event(s) | Settings toggle | Default urgency |
|---|---|---|---|
| `review_request` | `item_created`, `verb = review` | `reviewAlerts` | `immediate` if `risk_tier ≥ medium` or `blocking`, else `batched` |
| `blocker_alert` | dependency-watcher / policy-engine "agent blocked" | `blockerAlerts` | `immediate` |
| `cost_alert` | `cost_cap_warning`, `cost_cap_breached` | `costAlerts` | `immediate` |
| `digest` | scheduled rollup of batched + FYI items | `emailDigests` | `batched` |

## Vocabulary

| Term | Definition | Aliases not to use |
|---|---|---|
| **Notification** | Discrete user-facing alert about a state change worth attention, with a durable source reference and lifecycle. | alert (as the row), ping, toast, push, message |
| **Category** | Closed kind of a notification; 1:1 with a Settings toggle. | kind (taken by `Item.kind`), type, severity-as-category |
| **Channel** | External delivery transport. | adapter, provider |
| **Surface** | Where a notification is perceived (in-app vs external). | view, sink, target |
| **Urgency** | `immediate` vs `batched`. | severity, priority |
| **Ambient indicator** | Always-present awareness state; NOT a notification. | notification badge |
| **Quiet hours** | Per-human window that *defers* push (never drops). | DND, mute |
| **Silence** | Factory/product suppression of non-urgent push; record retained. | block |

## Contracts

- **Cardinality.** One source reference (required) and one Category per notification; one in-app surface record; 0..1 external channels per attempt.
- **Closure.** Category, Urgency closed (new member ⇒ concept-doc update; new Category ⇒ new toggle). Channel closed for now.
- **Mutability.** Immutable after creation: id, category, source reference, title/body, created-at. Mutable: delivery status, attempts, lastError, sentAt, claimedAt, channel, read state.
- **Identity.** Opaque UUID; not content-hashed (recurring alerts must be distinct rows).
- **Hard rules.**
  1. **Route-back is durable** — the source reference is persisted; routing back must not depend on reconstructing a deep link in memory at render time.
  2. **Policy is never bypassed for convenience** — silence + quiet-hours always apply. Sole exception: a hard cost breach bypasses *factory silence* but respects *quiet hours*.
  3. **A category toggle governs delivery, not the record** — turning a category off suppresses push/email/digest; the in-app record is still created. Nothing is silently dropped.
  4. **Cost notifications fire off a real value** — `cost_alert` reacts to an accumulated cost the system actually writes (coordinate AF10), never a perpetually-zero field.
  5. **One event → one category** — events outside the closed map never produce a notification.
  6. **In-app surface is universal** — every notification of every category/urgency has an in-app record, including `batched` and `dropped` ones.

## Rationale

Notifications are how a human-in-the-loop product tells the human something needs them. The audit found the model was undefined: three vocabularies described it and none aligned (the cadence doc's push/digest/ambient model, the code's `severity = blocking | cost_breach | digest`, and the Settings toggles `reviewAlerts/costAlerts/blockerAlerts/emailDigests`), the `notification` event had zero listeners, the deep link was computed but never persisted, and the cost sentinel watched a `cost_actual` field nothing writes — so every alert the system "raised" vanished. The fix is to stop overloading one `severity` field and separate the four orthogonal axes — **Category** (what), **Urgency** (how loud), **Surface** (where it lands), **Channel** (how it leaves the app). Each is then governable independently and maps cleanly onto the four Settings toggles, and the in-app surface becomes the durable home that guarantees no alert is ever silently lost.
