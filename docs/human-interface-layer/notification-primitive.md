# Notification primitive

Owns the inbox model (BC5): the popover surface, the change-row source, seen/read state, and how a
person's subscriptions decide what lands there. The in-app attention model (triage badge, ambient
indicators) lives in [The Three Views](./the-three-views.md); the end-user walkthrough lives in
[guides/user/the-interface](../guides/user/the-interface.md).

## The surface: a lightweight popover

Notification rows surface in an **ephemeral popover** (`layers/core-ui/src/shell/NotificationPopover.tsx`)
anchored at the sidebar bottom strip, next to the avatar/settings button, with a red unseen dot on the
trigger (`layers/core-ui/src/shell/Sidebar.tsx`). Pops open on click, lists inbox rows newest first,
closes on dismiss — same idiom as the Assistant overlay. On-demand, secondary, zero footprint until
opened: a *pointer* to where work lives, never a home for it.

There is no egress path — no push, no email, no channel. A row exists only in your own inbox; the
only delivery is the popover and a live `user:<id>` socket nudge that tells the open client to refetch.

## Definition

An **inbox row** is a pointer at a `changes` row: it exists because you are subscribed to the event
that change is (§ below), and the change was in your reach when it fired. Everything the row shows —
title, object, timestamp — is derived from the change itself; there is no separate notification
record with its own fields.

**Essential properties.** `userId` + `changeId` (composite primary key, `inbox` table); `seenAt` /
`readAt`, both nullable.

**What it (and its surface) is not.**

- **Not a typed record.** There is no type registry, no urgency, no title/body stored on the row —
  `titleForChange`/`linkForChange` (`layers/core-ui/src/shell/notification-display.ts`) derive both
  from the change's `object`/`kind` at render time.
- **Not the Conversations triage badge** — that badge counts attention-worthy *threads* (thread-derived);
  the popover lists inbox rows, from the `inbox` table.
- **Not the Thread / Item / Message** — a row *points* at whatever object the change happened to.
- **Not an ambient indicator** — health dots and auto-unblock are continuous/FYI awareness, never in
  the popover (see [The Three Views](./the-three-views.md)).
- **Not every bus event** — only a row whose subscriber is actually subscribed to that event becomes
  an inbox entry.

**Composition.** *points at* one `changes` row; *rendered in* the popover; *cleared by* being marked
read, or by the 30-day retention sweep.

**Lifecycle.** `unseen → seen` (seen on popover open) → `read` (read on click-through or dismiss,
which removes the row from view). There is no egress lifecycle — nothing to send, nothing to retry.

**Authority.** The `inbox` table (owned by `@hyperidle/user`) is source of truth. The popover reads it
through `open_user({}).inbox`; the fire mechanism inserts a row wherever a subscription matches.

## Where a row comes from

A row exists because *you* subscribed to it — there is no registry deciding what is notification-worthy
on your behalf. Settings → Notifications is one toggle per object event
(`task.created`/`task.changed`/`thread.created`/`thread.message`/`thread.changed`/
`document.created`/`document.changed`/`user.created`/`user.changed`); turning one on adds (or
unpauses) a subscription to it, scoped to what you can already see — company-wide, your team's, or
your own. The same subscription mechanism wakes an agent instead of writing a row, when the subscriber
is an agent rather than a person — see
[subscriptions-and-retros.md](../process-layer/subscriptions-and-retros.md).

**Dismiss ≠ pause:** dismissing (or clicking through) marks *this row* read; pausing the subscription
in Settings stops *future* rows for that event. Neither touches the other.

## Vocabulary

| Term | Definition | Aliases not to use |
|---|---|---|
| **Inbox row** | A pointer at a `changes` row, in the recipient's own inbox, with seen/read state. | notification, alert, ping, toast |
| **Subscription** | The row on a user that decided this event reaches them. See [subscriptions-and-retros.md](../process-layer/subscriptions-and-retros.md). | mute preference, type |
| **Notification popover** | Ephemeral overlay (sidebar bottom, by the avatar) listing recent inbox rows. | notification center, panel, tray |
| **Reach** | Company-wide, the subscriber's team, or the subscriber's own — the same rule search applies. | scope (do not conflate with document `scope`) |
| **Conversations triage badge** | Count of attention-worthy threads (work queue) — distinct surface. | notification badge |

## Contracts

- **Cardinality.** One `(userId, changeId)` inbox row per subscribed change; one popover.
- **Mutability.** Immutable after creation: `userId`, `changeId`. Mutable: `seenAt`, `readAt`.
- **Identity.** An inbox row's identity is its `(userId, changeId)` pair, not an opaque id.
- **Hard rules.**
  1. **One ephemeral popover, anchored by the avatar** — no persistent notification panel.
  2. **Every row derives its title and link from the change it points at** — nothing is stored
     redundantly on the row itself.
  3. **The popover reads the `inbox` table; the triage badge does not** — the Conversations badge
     stays thread-derived.
  4. **A row exists only because a subscription matched** — there is no notification-worthy classifier
     outside the subscriber's own choice.
  5. **Rows older than 30 days are swept**, whether read or not — the same retention window the old
     notification queue used.
