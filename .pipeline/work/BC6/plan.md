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
server-side key goes; the desktop keeps it. Every entry is an agent tool too. Search plugins lists
installed plugins only. Size: net red and no more than 1,000 new lines — the plugin lifecycle moving
out of the deleted route file into the module is not new code (≈1,550 added / 3,100 deleted).

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
killed task's agents actually stop. That seam and the session-by-id lookup the routine scheduler
uses stay as plumbing; 16 route rows go.

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
state and contributions (the repo's bundled plugins are not shipped to a user's machine, so listing
and installing them is BC7's ground). *Edit plugin* is one partial: no id
with a source (folder, git, zip) installs; `state` enables or disables; `remove` removes; `restore`
puts one contribution back to what the plugin shipped. The invariants say why a change is refused
(builtin cannot be removed or disabled, unknown contribution, unknown plugin). The domain-row work
the route does today — agents, routines, identity, prompt and skill documents through `edit_document`
with the internal flag — moves into the module's `run`, so the settings package owns the whole
lifecycle instead of half. The settings page calls the two entries through `call`; agents get both.

**The key leaves the server.** The credentials routes, package, table and the Credentials tab are
deleted; the encryption helper moves to the connections package, whose tokens it also encrypts. The desktop's Worker settings section gets one field that writes the key to the keychain
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

One architecture note with one critique (blocked twice, both real), twelve builder chunks in
dependency order with one red test and one pathspec commit each, three fix waves, two independent
review passes on the integrated diff, a seam test driving every entry as an agent and as a person,
`verify`, the full fast suite and the service integration suite, the real opencode and claude turn
tests, one packaged desktop build driven by hand, then retro and ship to a CI-green open PR.

## What was decided along the way

- A stopped session ends with state and outcome "stopped" on both paths. Teardown reads a stop
  request that only the registry's abort with reason "stop" sets; opencode's own return goes
  through the same abort with reason "return" and still ends done/completed. Propagation acts on
  "completed" and health on "crashed", so a stop moves nothing. A routine session that is stopped
  finalises as an error.
- The session module lives in the package that owns the sessions table; the platform module in
  settings, which owns the plugins tables. Neither imports a neighbour: everything else arrives in
  a deps bag bound at the layer's composition root.
- Orchestration carries its own small copies of the action shape and the two loops and mounts its
  own `/actions` on the one `/api` router. The applications join the two tool lists once each boot;
  the HTTP door and the lint need no join.
- The session-by-id lookup the routine scheduler uses and the "stop sessions for these tasks" seam
  stay as plumbing; the latter now kills for real. Sixteen route rows left the governance list.
- Between declaring an action and wiring its screen the governance rule is necessarily red on that
  name; no decoy call site, no rule change. Full green once the screens landed.
- Search with no filter lists newest first with a limit of 100; the profile's health window passes
  its own. A stop answers with the row before the stop; the terminal state arrives by nudge, and
  the Stop control disables once the row is terminal.
- The encryption helper moved verbatim to the connections package with its golden-vector test;
  connections no longer receive a cipher from core. Migration 0087 drops the credentials table.
- The desktop bridge keeps one channel, `credentials:set`; the key field writes and never reads
  back; the plaintext readback channel and the self-pinging validator are gone with the catalog.
- Session activity entries in the live stream are content-free nudges on the one socket; the core
  socket took the per-request identity handoff the deleted socket had.
- Pipeline and record ids stay out of code, comments and test titles; a @lore block says the
  constraint in words.

## Accepted limits and what is left

- The worker's key field shows only in shared-backend mode; its keychain write is proven by tests
  and the worker reads that same file, but a live connect to a shared backend was not run because
  none exists. The founder's condition ("workers still work") is met up to the keychain, not to the
  wire.
- The plugin list reloads on navigation, not on a plugin installed through the tool by an agent:
  plugins emit no event yet.
- An agent's profile and the team roster show run state on load; the viewer is the only live
  surface. A stop reaches them on the next visit.
- The size bar was missed: whitespace-insensitive production diff is +2,991/−3,819 (net −828);
  862 lines of plugin lifecycle and 169 of cipher are relocations; roughly 1,960 lines are new
  against the 1,000 the founder accepted. The declarations, the orchestration copies of the loops,
  the two page splits and the viewer rewrite are where it went.
- The plugin system's `contributions[]` engine (406 lines and two tables beyond `mcp.json`) is used
  by no shipped plugin and read only by the agent-behaviour settings page; `harness_descriptor` and
  `configuration_default` are dead kinds. Nothing installs the bundled plugins. Both are BC7 ground.
- `plugin_contributions` has no scope column; reinstalling for one team can drop another team's
  registry row. Known since the document item.
- The AH5 e2e lane was deleted with the server credential it proved; the AH6 lane stays.
- The harness lane (real binaries, real model) ran for opencode and claude on the thread turn with
  the persisted row asserted; codex and cursor-agent were not run in this item.
