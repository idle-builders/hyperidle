# AF8 — Notification model (concept)

**Workpackage:** AF8 — "Notifications: define the model (concept), then deliver them" (Track AF, complexity L).
**Status:** Concept locked. Fixed input for `/design` (the notification popover — **now required**) and `/architecture`. Downstream skills explore *inside* this concept; they do not reshape it.

---

## The shape (founder-locked)

**A notification is a discrete record the system creates when something crosses the attention threshold, surfaced in a lightweight ephemeral popover, carrying a link back to its source, and mutable per-type by the user.** Four locked decisions:

1. **There is a notification surface — but it is not the rail.** A **lightweight, ephemeral popover** anchored at the sidebar bottom strip, next to the avatar/settings button (`Sidebar.tsx:371`), with a small unread indicator on the affordance. Pops open on click, lists recent notifications, closes on dismiss — following the existing Assistant-overlay idiom (`assistantOverlayOpen`). On-demand, secondary, zero-footprint until opened.
2. **Each notification links back to its source — a thread *or* a place.** Tapping it jumps to where it came from: a thread in Conversations (`review`, `blocker`), or a destination route (`cost` → the cost detail). The notification carries a **source link**, not necessarily a thread. *This dissolves the "not thread-native" problem.*
3. **The mute unit is the notification *type*, not an editorial category.** Each notification declares a stable **type key** (reuse the existing `eventType`). Muting is per-type and **per-user**. There are no invented buckets — each type is a real notification source, 1:1.
4. **One mute state, two surfaces.** The per-user, per-type on/off set is shown (a) as a **shortcut on each notification** in the popover ("mute notifications like this") and (b) as a **flat list of all types in Settings** with on/off toggles — where the user re-enables anything. Both read/write the same per-user store.

Push and email do not exist yet, so the popover is the entire near-term surface. The `notification_queue` egress path (push/email) is real but dormant.

### Why this is not the rail

| The dead rail | The notification popover |
|---|---|
| Permanent, always-present left panel | Ephemeral overlay, invoked on demand |
| A primary navigation surface | A secondary convenience; jump-off only |
| Held its own screen real estate | Zero footprint until opened |
| The home where work *lived* | A pointer *to* where work lives (the source link) |

### The mute model (the simple solution)

| Concern | Mechanism |
|---|---|
| Mute one | Popover row → "mute notifications like this" → writes `type → off` for this user |
| See / re-enable everything | Settings → flat list of **all** notification types, each an on/off toggle |
| The mutable unit | The notification **type** (stable `key`, e.g. `cost_cap_breached`) |
| The "registry" | A **code-defined const list** of types `{ key, label, defaultUrgency }` — the emitting code already defines which notifications exist; a new kind = one new entry, and it shows in Settings automatically |
| Persistence | A **per-user** set of muted type keys |

This supersedes the three fixed AF15 toggles (`reviewAlerts`/`costAlerts`/`blockerAlerts`) by generalizing them into the per-type list. **Dismiss ≠ mute:** dismissing a notification clears *this instance* (seen/read); muting suppresses *future instances of its type*.

---

## Required reading (downstream agents MUST read)

- `.pipeline/work-packages/TRACK-AF.md` → AF8.
- `docs/human-interface-layer/notification-primitive.md` — the ground-truth primitive this concept locks.
- `docs/human-interface-layer/the-three-views-the-rail.md` §4.1 (Conversations), **§4.2 (Ambient Awareness — the Conversations triage badge, distinct from this popover)**, §4.5 (Thread — host kinds; the source link for thread-backed notifications).
- `docs/human-interface-layer/routing-how-items-find-the-right-view.md` §8.
- `docs/human-interface-layer/interaction-cadences-notification-discipline.md` — push/digest/ambient cadence.
- `packages/web/src/shell/Sidebar.tsx` (~348–410) — the bottom strip the popover anchors to; the Assistant-overlay idiom.
- `packages/web/src/settings/SettingsNotifications.tsx`, `packages/server/src/routes/settings.ts` — today's toggles + `AlertPreferences`; **AF15 reworks this into the per-type list with per-user persistence**.
- `packages/fabric/src/services/notifications/{types.ts,dispatcher.ts}`, `silence-policy.ts`, `cost-sentinel.ts` (reads `factory_settings.cost_actual` — nothing writes it; coordinate AF10).
- `packages/db/src/schema.ts` → `notificationQueue` (~677–706).
- Coordinating WPs: **AF10** (cost value), **AF15** (per-user, per-type mute Settings).

---

## Phase 0 — The things

| Noun | Working definition | Classification |
|---|---|---|
| **Notification** | A discrete record the system creates when something crosses the attention threshold; an instance of a type, carrying a source link, urgency, and seen/read state. | **Reshaped** — a `notification_queue` row exists; the model (popover record, source-linked, per-type mutable) is undefined. |
| **Notification type** | A registered kind of notification with a stable `key` (reuse `eventType`), a human `label`, and a default urgency. The unit of muting. | **New** — replaces the artificial "Category"; 1:1 with a real notification source. |
| **Notification popover** | The lightweight ephemeral overlay (sidebar bottom, by the avatar) listing recent notifications — the in-app surface. | **New.** |
| **Source link** | The durable route a notification jumps to: a thread (`/conversations/<id>`) or a place (cost detail). | **New** — generalizes "anchor"; not necessarily a thread. |
| **Mute preference** | A per-user, per-type on/off setting, persisted; the same state behind the popover shortcut and the Settings list. | **New.** |
| **Urgency** | A per-type default: `immediate` (unread indicator + sorts first) vs `ambient` (listed, no escalation). `digest` is an egress delivery mode (email; dormant). | **Reshaped** — today's `severity` conflates this with the type. |
| **Channel** | Out-of-band egress transport (`console \| ntfy \| smtp`); dormant. | **Reshaped** — scoped to the future egress tier. |
| Thread | Container of messages on one host; the source link for review/blocker notifications. | Stable (§4.5). |
| Conversations triage badge | §4.2 count of attention-worthy *threads* (the work queue) — **distinct** from the popover. | Stable (§4.2). |
| Ambient indicators (health dots) | §4.2 always-present awareness state. NOT notifications. | Stable (§4.2). |
| Quiet hours / Silence | Defer / suppress the egress ring. | Stable (input). |

New + Reshaped (**Notification, Notification type, Notification popover, Source link, Mute preference, Urgency, Channel**) enter the rest of the skill.

**The problem this concept solves.** "The notifications the system decides to send" was undefined: three misaligned vocabularies, a `notification` event with zero listeners, a deep link computed but never persisted, a cost sentinel reading a never-written field — and no place for a notification to live after the rail was removed. Resolution: a **lightweight ephemeral popover** (not the rail) as the in-app home; each notification carries a **source link** (thread or place) so it routes home; muting is **per-type, per-user**, exposed both on the notification and in a Settings list.

### Which events become notifications (grounded in the code)

Only `item_created` is thread-native; cost/health/digest/unblock are not. With the popover + source-link model, thread-nativity stops mattering — what matters is whether an event is worth interrupting for and has a route home. Each notification declares a **type**:

| Event source | Notification type (key) | Source link | Default urgency |
|---|---|---|---|
| `item_created`, `verb=review` | `review_request` | the review thread | `immediate` if `risk_tier ≥ medium`/`blocking`, else `ambient` |
| dependency-watcher / policy-engine "agent blocked" | `blocker_alert` | the blocked task's thread | `immediate` |
| `cost_cap_warning` / `cost_cap_breached` | `cost_alert` (architecture may split warning/breach) | the **cost detail** route (no thread) | `immediate` |
| `routine_fired` → rollup | — *digest delivery mode, not a type* | n/a (email, dormant) | — |
| `agent.health.degraded` | — *ambient health dot (§4.2), not a notification* | n/a | — |
| dependency-watcher "task unblocked" | — *ambient / nothing, not a notification* | n/a | — |

The type list is **code-defined and finite at any release**, extensible by adding a registry entry. Each type is independently mutable per-user; `digest` is a delivery mode; agent-health and auto-unblock are ambient.

---

## Phase 1 — Essence probes

**Notification**

1. **Identity.** A discrete in-app record — "X crossed the attention threshold; here's where to go" — an instance of a type, distinct from the source it points to.
2. **Essential properties.** id; a **type key**; an **urgency** (from the type's default); a durable **source link**; title (+ optional body); a **seen/read** state; created-at. Egress-only/accidental: delivery `status`, `channel`, `attempts`, `sentAt`.
3. **Rejection list.** See Phase 2.
4. **Composition.** *is an instance of* one type; *carries* a source link + title/body + seen state; *rendered in* the popover; *(future) delivered through* 0..1 Channels.
5. **Lifecycle.** `unread → read` (read on open/dismiss/jump). Egress (dormant): `pending → sending → {sent|failed|dropped}`; `sending` is a lease; stuck leases recover.
6. **Authority.** The notification **store** (the `notification_queue` table, repurposed/extended) is source of truth. The popover (web) reads it; the egress drain (fabric) delivers it. Notification-worthy *events* come from the policy engine, dependency watcher, cost sentinel. **Mute preferences are per-user** (a new per-user store, distinct from factory-level silence), set via the popover shortcut or the Settings list.
7. **Vocabulary collision.** `kind` is taken by `Item.kind`/`Message.type` — use **type key**, never "kind". `severity` retired as the model field. "Rail" is dead; this is a "popover."

**Notification type** — a registered kind with a stable `key` (reuse `eventType`), a human `label`, and a default urgency. The **registry** is a code-defined const list — the single source for what Settings lists and what mute targets. Open: a new notification kind adds one entry and appears in Settings automatically.

**Notification popover** — ephemeral overlay at the sidebar bottom strip by the avatar; small unread indicator; opens to a short list of recent notifications (newest first), each row = title + source-link jump + relative time + a per-row **mute-this-type** + **dismiss** affordance; closes on outside-click/Esc. The only in-app notification surface. Not the Conversations triage badge.

**Source link** — a durable, persisted route. Thread-backed: `/conversations/<threadId>` [+ message]. Place-backed: a route to the originating element (cost detail, bet, team). Resolved at click; **persisted on the record**, never reconstructed at render.

**Mute preference** — per-user, per-type on/off, persisted. Muting suppresses future notifications of that type (no popover entry, no ring). The popover shortcut and the Settings list are two views of this one state. **Dismiss** (clear one instance) is a separate action from **mute** (suppress the type).

**Urgency** — a per-type default: `immediate` (unread indicator + sorts first; future: rings) / `ambient` (listed, no escalation). `digest` is the egress batching mode (email), not an in-app urgency.

---

## Phase 2 — Rejection list (what a Notification / its surface is NOT)

1. **Not the rail.** *Why:* the popover is ephemeral, on-demand, secondary, zero-footprint, and a *pointer* to where work lives — the rail was permanent, primary, navigational, the *home* of work.
2. **Not muted by editorial category.** *Why:* "review/blocker/cost as fixed buckets" felt artificial because they're an imposed taxonomy. The honest unit is the notification **type** itself (1:1 with a real source); the Settings list is just the registry, not a curated grouping.
3. **Not the Conversations triage badge.** *Why:* the §4.2 badge counts attention-worthy *threads* (the work queue, thread-derived); the popover lists *notifications* across types (incl. cost, never in Conversations), from the notification store. Two surfaces, two sources.
4. **Not the Thread / Item / Message.** *Why:* the notification is the discrete alert that *points* at a thread/place via the source link.
5. **Not an ambient indicator.** *Why:* health dots and auto-unblock are continuous/FYI awareness (§4.2), never in the popover. Agent-health and task-unblock are reclassified ambient, not notifications.
6. **Not a bus event / log entry.** *Why:* most events never notify; a notification is the registered subset that crosses the threshold.
7. **Not a channel.** *Why:* push/email are *channels* (future, dormant); a notification exists in the popover today with no channel.

---

## Phase 3 — Vocabulary lock

| Term | Definition | Aliases NOT to use |
|---|---|---|
| **Notification** | Discrete record created when something crosses the attention threshold; an instance of a type, source-linked, with a seen state. | alert (loosely), ping, toast |
| **Notification type** | A registered kind (`key` + `label` + default urgency); the unit of muting. | category (rejected), kind (taken by `Item.kind`/`Message.type`) |
| **Notification popover** | The ephemeral overlay (sidebar bottom, by the avatar) listing recent notifications. | notification center, **rail**, panel, inbox, tray |
| **Source link** | The durable route a notification jumps to (thread or place). | anchor, deep link (impl) |
| **Mute preference** | Per-user, per-type on/off; same state behind the popover shortcut and the Settings list. | category mute |
| **Urgency** | Per-type default: `immediate` / `ambient`; `digest` is an egress delivery mode. | severity, priority |
| **Channel** | Future egress transport (`console`/`ntfy`/`smtp`); dormant. | adapter, provider |
| **Conversations triage badge** | §4.2 count of attention-worthy threads (work queue) — distinct surface. | notification badge |

Retired: **`severity`** as the model field → **(type, urgency)**. **Category** as a mute unit → **notification type**. **`digest`** is not a type. **Rail** is dead.

---

## Phase 4 — Contracts

- **Cardinality.** Every notification is an instance of exactly **one** type and carries exactly **one** source link (both required). One popover. Egress (future): **0..1** Channels per attempt. Each type has **one** per-user mute preference.
- **Closure.** The **type registry** is code-defined and finite per release; new types are added by a registry entry (which auto-appears in Settings). **Urgency** CLOSED (`immediate | ambient`; `digest` is a delivery mode). **Channel** closed (`console | ntfy | smtp`).
- **Mutability.** Immutable after creation: id, type key, source link, title/body, created-at. Mutable: seen/read; egress delivery status/attempts/sentAt/channel. Mute preferences are mutable per-user.
- **Identity.** Notification: opaque UUID. Type: stable string `key` (reuse `eventType`).
- **Hard rules:**
  1. **The in-app surface is one ephemeral popover, anchored by the avatar — never the rail.**
  2. **Every notification carries a durable, persisted source link** (thread *or* place); routing home never reconstructs a deep link in memory at render. *(Exposes the gap: `deepLink` computed in `dispatcher.ts`, never persisted.)*
  3. **Source link need not be a thread** — `cost_alert` links to the cost detail route.
  4. **The mute unit is the notification type, and mute state is per-user.** No editorial categories; no per-instance mute (per-instance = dismiss/read). The Settings list renders the full type registry so any type can be re-enabled.
  5. **Popover shortcut and Settings list write the same per-user mute state.** A muted type produces no popover entry and no ring.
  6. **`digest` is a delivery mode; `agent.health.degraded` and auto-unblock are ambient (§4.2), not notifications** — reclassify the current `agent_health_transition` enqueue accordingly.
  7. **The popover reads the notification store; the triage badge does not** — the §4.2 Conversations badge stays thread-derived.
  8. **Policy is never bypassed for convenience** (egress). Sole exception: a hard cost breach bypasses *factory silence* but respects *quiet hours*.
  9. **Cost notifications fire off a real value** — `cost_alert` reacts to an accumulated cost the system actually writes (coordinate AF10).
  10. **One event → one type (or ambient/digest).**

---

## Phase 5 — Ground-truth updates

- `plans/AF8/concept.md` — this file.
- `docs/human-interface-layer/notification-primitive.md` — new ground-truth primitive, linked from the HIL index.
- `interaction-cadences-notification-discipline.md` stays authoritative for cadence; the primitive supplies the Notification/type/popover/source-link/mute vocabulary and the locked decisions.

---

## Phase 6 — Self-critique (1 round)

- **Answers the founder's direction?** Yes: per-type mute (not artificial categories), a popover shortcut to mute one, and a Settings list of all types to re-enable — the simple solution, one per-user state behind two surfaces. Source link (thread or place) keeps the "not thread-native" sources honest; health/unblock are ambient; digest is a delivery mode.
- **Rejection list distinct?** Yes — rail, editorial-category, triage-badge, thread/item, ambient-indicator, bus-event, channel: seven different rejections.
- **Collisions checked.** `kind`, `severity`, "category", "rail/center/panel" all handled.
- **Contracts complete?** Cardinality/closure/mutability/identity pinned; ten hard rules, three exposing verified defects (un-persisted source link, zero cost source, badge-vs-store confusion).
- **Rationale concrete?** Yes — rail removal, no push/email yet, the grounded event inventory (only `item_created` thread-native), the persisted-route gap, and the founder's "categories feel artificial."
- **Right files touched?** HIL primitive + index; Sidebar bottom strip grounded; AF15 (per-user per-type mute) and AF10 coordinated.

**`/design` is required** for the popover (placement, open/close, row anatomy incl. mute/dismiss affordances, unread indicator, empty state) **and** the Settings per-type list. Founder asked for an aesthetic surface.

**Concept is LOCKED.**
