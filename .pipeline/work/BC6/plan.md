# BC6 — Session and platform as modules

## What we need

**Why this exists.** The contract has two non-object groups: session (see what's running · watch ·
stop — orchestration's) and platform (manage plugins — settings'). Both must be list entries mounted
by the same loops so the lint rule covers the whole surface and BC5 can name the events.

**What exists today.** Eight session registrations in four files with four mounts (`sessions.ts`,
`agent-orchestration-sessions.ts`, the 350-line intake file, `session-stream-ws.ts`); a second
websocket with its own protocol and one subscriber; a 743-line session viewer no screen can open;
activity held in memory only. Nobody can stop a session — `abort` has no caller, and killing a task
only marks its sessions stopped while the process runs on. Six plugin routes (984 lines) called
only by one settings page over raw fetches; no agent can touch plugins. One credential,
`shared_backend_key`: written by Settings into the server table, read only by the desktop worker
from its own keychain, which nothing writes — the worker cannot get its key today.

**Missing delta.** The `session` module (search · watch · stop) in orchestration and the `platform`
module (search plugins · edit plugin) in settings, both on the shared list; the composition root
joins each layer's list; the session socket folded into the one stream; the viewer reachable; the
key moved to where it is read. Deletes the twelve routes, the second websocket, the credentials
routes, package, table and tab.

**Depends on.** BC4 — sequential by the module-link rule; its task link is rewired by BC5.

**Dials.** complexity: feature · ambiguity: established context · exposure: public contract

**Rulings (founder, 2026-09-22).** Stop kills the process and leaves the task alone. Activity stays
in memory. Two plugin entries in the edit shape, not one `manage_plugins` with a verb field. The
server-side key goes; the desktop keeps it. Every entry is an agent tool too.

## How it works

**Session: three entries on orchestration's list.** *Search sessions* is one filtered list — by
task, by agent, by state — read by the task page's sessions section, the agent profile, the team
roster, the settings agents list and the recipient picker's live dot; the two count routes go, their
readers ask for active sessions. *Watch a session* returns the session with its recent activity: the
in-memory buffer as today, nothing persisted, gone a few minutes after the session ends and on
restart. *Stop a session* asks the run registry to abort — the cooperative flag plus the adapter's
real process kill — and the normal teardown marks the row stopped and fires "session ended", so the
task page, the agent's health and the routine reactions see it like any other end. The task keeps
its state and owner. Anyone signed in may search, watch and stop any session; agents get the same
three tools. Killing a task keeps its existing stop path but now goes through the same abort, so a
killed task's agents actually stop.

**One websocket.** The session socket, its hub and its gateway go. The activity gateway pushes a
nudge on `session:<id>` through core's hub — the same envelope threads and documents use; the
authorizer allows the topic (anyone signed in). The viewer's hook subscribes there, re-runs *watch*
on each nudge, and stops needing a second client. The core socket takes the per-request identity
handoff the session socket already had, so the race the old @lore names is closed rather than kept.

**The viewer gets a door.** A session row on the task page and on the agent profile opens the
existing viewer beside the list, in the split the thread and artifact panels use. No redesign.

**The join.** Orchestration exports its action list the way core does; the applications join the two
lists once and hand the joined list to the HTTP loop, the MCP loop and the lint. The UI `call` type
gains the session and plugin entries. Core never imports orchestration; the declarations live in
`framework/domain-model/src/actions/` like the others.

**Platform: two entries on settings' list.** *Search plugins* returns the installed plugins with
state and contributions, plus the bundled ones not installed. *Edit plugin* is one partial: no id
with a source (folder, git, zip) installs; `state` enables or disables; `remove` removes; `restore`
puts one contribution back to what the plugin shipped. The invariants say why a change is refused
(builtin cannot be removed or disabled, unknown contribution, unknown plugin). The domain-row work
the route does today — agents, routines, identity, prompt and skill documents through `edit_document`
with the internal flag — moves into the module's `run`, so the settings package owns the whole
lifecycle instead of half. The settings page calls the two entries through `call`; agents get both.

**The key leaves the server.** The credentials routes, package, table and the Credentials tab are
deleted. The desktop's Worker settings section gets one field that writes the key to the keychain
through the bridge the worker already reads, and the worker connects for the first time. The SMTP
password stored beside it has had no writer since BC1 and goes with the table.

**Events.** Session start and end keep reaching the task through the existing reactions (BC5 folds
them into subscriptions). A plugin edit writes its document changes as today; no new event.

**Rejected.** Persisting activity (a new table for something nobody reads later). One
`manage_plugins` with a verb field (a fourth shape for the UI and the lint). Keeping the server-side
key as a third platform entry (written by the UI, read by nothing). Sessions on `open_task`
(ruled out in BC2).

**Left simple.** Stop is best-effort: if the process is already gone, the row is marked and that is
the answer. Watch returns what the buffer holds. Visibility is "signed in". The four route families
for connections, filesystems, harnesses and agent behaviour stay legacy until BC5.

## How we work on this

One architecture note with one critique, then atomic builder chunks in dependency order (session
module → join → socket → viewer door → platform module → key → deletions → rename of legacy lists),
red test first per chunk, one fresh review over the integrated diff, the seam test driving every new
entry as an agent and as a human, `verify`, service integration, the packaged desktop app driven by
hand (stop a live session, watch it, install and disable a plugin, worker connects with the key),
then retro and ship to a CI-green open PR. The record has no checks or review configured, so the
planner runs them.

## Confusions

## Proposed items

- The plugin system's `contributions[]` engine (406 lines, `configuration_overrides` and
  `plugin_configuration_defaults` beyond `mcp.json`) is used by no shipped plugin and read only by
  the agent-behaviour settings page; `harness_descriptor` and `configuration_default` are dead kinds.
  BC5 or BC7 ground.
- Nothing installs the bundled plugins; two docs say the document-management plugin seeds the
  librarian and its routines. BC7.
- `plugin_contributions` has no scope column; reinstalling for one team can drop another team's
  registry row. Known since BC4.
