# BC5 — User as a module with subscriptions

## What we need

**Why this exists.** Routines and notifications are two systems for one idea: when X happens, this
user does something. An agent's is a routine; a human's is a notification; they have different
vocabularies, different mute, different scopes, and the notification queue has no recipient column.
The founder's rule — every event reaches a human as a notification and an agent as a trigger — is
only true once they are one mechanism on the user. Setup, teams and org edges are user attributes
wearing separate screens.

**What exists today** (census in `facts-user.md`, `facts-subscriptions.md`). `users` (736) + `org`
(675) + `routine` (2,056) + `notifications` (714) as packages; the `routines` table (owner agent ·
trigger · config · event) and a scheduler that subscribes to all 20 event types and queries the DB
on every one; `notification_queue` with no recipient and a global mute on the server-config
singleton; 45 routes across users, agents, org, teams, recipients, routines, notifications,
connections, filesystems, harnesses, agent-behaviour; four legacy tools; the setup wizard's routes;
twelve Settings sections. No human has a team on any path. Nine of the team row's fourteen columns
are unwritten. Email can only send a test mail to itself. The `changes` table already admits
`user`; seven of the nine events already exist as change rows.

**Missing delta.** The `user` module (`search_users · open_user · edit_user`) on core's list, for
humans and agents alike; `subscriptions` on the user replacing routines and the notification queue;
the nine events as one per change row; team as id + name that every user is in; the four route
families for connections, folders, backends and defaults folded into open/edit a user; the setup
wizard calling `edit_user`. Deletes the four packages, the routines and notification tables and
routes, the org/team/agent/user routes, the four tools, email, and the eight dead event names.

**Depends on.** BC6 (merged 2026-09-22 as `84b4626fb`). BC7 depends on this; nothing is left for
after BC7.

**Dials.** complexity: suite · ambiguity: established context · exposure: user-facing surface

**Rulings (founder, 2026-09-22/23).**
- A subscription is explicit: subscribe an agent to an event and it hears every one of them, the
  same as a person subscribing to a notification. Same mechanics for both kinds.
- Reach is what the user can see anyway: global + my team + my own. A subscription never shows more
  than search would.
- Every user is in a team; without a team there are no agents and nearly no events, so "no team" is
  not a case. Team is an id and a name, nothing else on the row.
- The welcome screen stays as it is; it calls `edit_user` underneath.
- Connections, folders, backends and behaviour defaults are user attributes in this item. No
  follow-up item after BC7.
- Org edges stay: they define the human an agent reports to. Shown by `open_user`, edited by
  `edit_user`. (Fact for the record: today only the org chart reads them; the code's "belongs to a
  person" is the separate `ownerUserId` column. Both stay.)
- Email goes.
- Size is judged on net change, not on edited lines.
- A no-team agent (a factory plugin's) reaches every team. The document plugin's retro becomes a
  "task changed" subscription whose prompt stops unless the task is done AND a root task. The crash
  notice survives as a health note on the agent (an edit, so subscribers to "user changed" hear it).

## How it works

**User: three entries on core's list.** *Search users* is one filtered list — by kind (human /
agent), by team, by name, by owner, by status — read by the roster, the agents list, the recipient
picker, the org chart and the setup redirect. *Open a user* returns everything attached: name, role,
kind, team, status, owner, who it reports to, harness + model + options, identity and skill
documents (by id), connections, folders it can reach, subscriptions, and — when you open yourself —
your inbox. *Edit a user* is one partial: no id creates (a person, or an agent with owner or team);
name, role, team (by name — created if absent), status, reports-to edges, harness + model, folders
given or taken, connections added or removed, subscriptions added / changed / paused / removed,
inbox rows marked read. The invariants say why a change is refused (an owned agent has no team; an
agent must be runnable to get subscriptions that wake it; unknown event; unknown team member).

**Subscriptions.** One table: `user · event | schedule · document? · paused`. When a change row is
appended, the module finds the subscriptions on that event whose user can see the object (same rule
as search: global, the object's team, the user's own), and for each: an agent is woken through the
intent door a mention uses, with the change as its message and the document (if any) as its prompt;
a person gets an inbox row (`user · change · seenAt · readAt`) and a nudge on `user:<id>` over the
one websocket. A schedule (cron, agents only) is the other trigger kind; the tick loop stays. "Run
it now" is *send a message* to that user.

**Events.** Every change row is an event named `<object>.<kind>`; the bus carries it once, post
commit. The eight names only the routine matcher heard go. `task_state_changed` becomes
`task.changed` for lifecycle propagation and the dependency watcher. `session_started / ended /
not_returned` stay as the plumbing by which a run reports back to its task; subscribers see a
session end as `task.changed`. The governance rule's legacy lists shrink to what stays.

**Team.** `teams` keeps id, name and createdAt; every other column goes. Every user is in one; an
owned agent takes its owner's. The team page reads `search_users` + `search_tasks` filtered by team.

**Setup.** The welcome screen keeps its look and calls `edit_user` (new person + team name) and then
`edit_user` (new agent). The wizard's routes, the scaffold and the welcome message go.

**Settings.** Each section that called a deleted route now calls the two entries: Profile, Org
chart, Agents, Filesystems, Agent backends, Connections, Agent behaviour, Notifications. Skills &
rules, Plugins, Appearance, Backend and Worker are untouched. No redesign.

**Rejected.** Default-on subscriptions for every event (founder: explicit). A team page of its own.
A separate notification object with its own vocabulary. Keeping routines as an object with four
actions. A follow-up item for the attribute families.

**Left simple.** An inbox row is a pointer at a change row; the UI renders the change. Reach is
computed at fire time, not stored. Cron is the existing 146-line parser, moved.

## How we work on this

Facts census (two agents), interview one question at a time, this plan, one architecture note with
one critique, builder chunks in dependency order with one red test and one pathspec commit each,
independent review passes on the integrated diff, a seam test driving every entry as an agent and as
a person, `verify`, the full fast suite and the service integration suite, the real-harness turn for
a subscription that wakes an agent, one packaged desktop build driven by hand, then retro and ship to
a CI-green open PR.

## Confusions

## Proposed items
