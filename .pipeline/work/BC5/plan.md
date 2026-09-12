# BC5 — User as a module with subscriptions

## What we need

**Why this exists.** Routines and notifications are two systems for one idea: when X happens, this user does something. An agent's is a routine; a human's is a notification; they have different vocabularies, different mute, different scopes, and the notification queue has no recipient column. The founder's rule — every event reaches a human as a notification and an agent as a trigger — is only true once they are one mechanism on the user. Setup, teams and org edges are user attributes wearing separate screens.

**What exists today.** `users` (802) + `org` (675) + `routine` (2,176) + `notifications` (1,093) + `credentials` (385); the `routines` table (`ownerAgentId · triggerType · triggerConfig · eventType`) and a scheduler that subscribes to all 29 event types; `notification_queue` with no recipient and a global mute singleton; `teams-routes.ts` + `org.ts`; `recipients.ts`; the setup flow and `Settings*` pages; tools `create_team · add_agent · create_routine · update_routine`; plugin-contributed defaults via `plugin-contributions`.

**Missing delta.** The `user` module with three actions; `subscriptions` on the user (`userId · event · documentId | null · paused`): a document set means the runner runs it, null means a notification row with a recipient; cron stays a trigger kind; the one event stream for the UI, per-user filtered; team as a column + filter; connections, folders, backends, defaults as attributes with plugin defaults and user overrides. Deletes the five packages, the routines table and routes, the notification routes and mute singleton, the team/org routes, the four tools, the setup and settings pages except plugins, and the `notification` event BC1 left alive.

**Depends on.** BC3 and BC4 — a subscription names the nine events, which exist once each object emits them from its own `changes` rows.

**Dials (provisional).** complexity: suite · ambiguity: established context · exposure: user-facing surface

## How it works

## How we work on this

## Confusions

## Proposed items
