# Plugins

How a plugin adds to a running HyperIdle, and how the plugin service keeps track
of what it added.

Plugins are how the product gains opinions it does not ship with. A fresh
install is the person, their team and one agent — their assistant, with an
empty prompt and nine subscriptions, one per event, each with an empty
prompt — and nothing else: no roster, no roles, no personas. A Builder, a
Designer, a Document Librarian all arrive because somebody installed a plugin;
the ones that ship with the app are listed in Settings › Plugins as available,
one click from installed. A plugin brings its own agents and subscriptions; it
never writes into the assistant's.

## One install per team

A plugin is installed for a scope: **factory** (once, for everyone) or a
**team**. Each install is its own `plugins` row, and the row id is the install
id — the manifest name for a factory install, `<name>@<teamId>` for a team
install (a manifest name never contains `@`). Two teams can each install the
same plugin: each gets its own agents, subscriptions and documents, and
removing, disabling or enabling one team's install leaves the other's alone.
`edit_plugin`'s `id` is always an install id.

Contributed row ids hash the manifest name and the scope, so every install's
rows are distinct.

## What a plugin can contribute

| Kind | Becomes | Declared as |
|---|---|---|
| **Agent** | a `users` row, plus its identity | `agents[]` in the manifest, with an optional `identity` file |
| **Subscription** | a `subscriptions` row, plus its prompt | `subscriptions[]`, whose `prompt` becomes a knowledge document |
| **Skill** | a knowledge document | a `skills/<name>/SKILL.md` file |
| **MCP server** | nothing stored — read from the install folder's `mcp.json` each time a session starts | `mcp.json` |

There is no fourth kind. A per-plugin configuration layer (defaults a person could
override, shown on a Settings › Agent behavior page) existed and was deleted: every
install's defaults were empty and nothing that runs a session read an override.

Agents, subscription prompts and skills all end up as ordinary rows in the services
that own them — `users` (agents, subscriptions, both owned by `@hyperidle/user`), `documents`. A
plugin does not get a private world; it adds to yours, and what it adds is editable like anything
else.

An agent's `identity` names a file inside the plugin, and it becomes that agent's
`agent_file` knowledge document. A path that escapes the plugin root, or names a
file that is not there, drops the identity and keeps the agent — a bare agent is
a valid agent, so a typo must not cost the whole contribution.

## The ownership registry

`plugin_contributions` is the plugin service's record of what each plugin
contributed: one row per `(plugin, kind, entity)`, plus a `detached_at` stamp.

It is the **only** answer to "what did this plugin contribute". Provenance used
to be recorded seven different ways — `plugin_id` columns on `users` and
`subscriptions`, a `plugin_id` on the configuration defaults, a `topic =
'plugin:<id>'` and an `updated_by = 'plugin:<id>'` on documents, a
`<pluginId>/` prefix inside a configuration key, and one-way hashed row ids. Each
covered a different subset, two were never read at all, and no surface could
answer the question.

Two of those were also ownership violations wearing a column: a `plugin_id` on
`users` is the *plugin* service's provenance living in a table it does not own,
which is why that write had to sit inside the users package. The registry belongs
to the plugin service. It names the rows; the service that owns each table
writes them.

Freeing the old `topic` column (since deleted from `documents` entirely) also
fixed a real defect: matching on `topic = 'plugin:<id>'` meant that editing a
skill's topic silently orphaned it from uninstall and disable, permanently.

## One lifecycle

Install, enable, disable and remove all drive the same function over the
registry: make everything this plugin contributed live, or not live.

They used to be three separate spellings over three different provenance
mechanisms, and they drifted:

- disable wrote a subscription's `active` but not its `state`, so a
  plugin-disabled subscription read as active while the scheduler skipped it
- remove set a `deletedAt` that nothing ever cleared
- install revived skills but **not** agents or subscriptions, so reinstalling
  a disabled plugin produced one that reported `enabled` with a dead agent
  and dead subscriptions, unfixable short of manual SQL

**Installing is a deliberate act**: everything the plugin contributes is live
afterwards, whatever a previous disable or remove left behind.

Agents and documents are never hard-deleted: the audit tables hold RESTRICT foreign keys on knowledge
and users, so a removed plugin's agents go `inactive` and its documents archive. Subscriptions are the
one exception — they carry no soft-delete column, so a removed plugin's subscription rows are deleted
outright; disable instead sets them `paused` (`subscriptions.setLive`).

## Detach and restore

Editing a plugin-contributed document makes it yours: the registry stamps
`detached_at`, the contributions view says so, and a reinstall leaves your
version alone. That is D5 — your edit wins.

**Restore** hands it back: the plugin's version is re-read from disk and the
stamp cleared. A skill document's id is a one-way hash of the plugin id and the
skill directory, so restore inverts it by enumerating the plugin's skill
directories — the id derivation stays the single source of truth rather than the
mapping being stored twice.

## Where plugin files live

Installing copies the plugin to `<dataDir>/installed-plugins/<installId>` — one
folder per install, so one team's reinstall never removes the folder another
team's restore reads — and records the path in `plugins.install_path`. Two features depend on it: restore
reads the plugin's files from there, and a session reads the plugin's MCP servers
from the `mcp.json` there, expanding `${PLUGIN_ROOT}` / `${PLUGIN_DATA}` against
it. An install without a folder brings no MCP servers. The desktop app and the
remote server both hand these servers to the sessions they provision.

> Not `<dataDir>/plugins`. Beside a development checkout's database that is the
> repository's own plugin **source** directory, and install removes the
> destination before copying.

Nothing about a server is stored at install: the folder is the only copy, so an
edited `mcp.json` reaches the next session, and a moved data directory never
leaves a stale absolute path behind in the database.

## Bundled plugins

`plugins/` in the repository holds the plugins that ship with the app. The
desktop build copies it into the app's resources beside the migrations
(`electron-builder.yml`), and the desktop shell points the server at it with
`HYPERIDLE_BUNDLED_PLUGINS_DIR` (in development, the repository's own
`plugins/`); the server image finds it in the repository it carries. Nothing is
installed by default.

`search_plugins` answers two kinds of rows: every install, and — as
`state: "available"` — each bundled plugin the viewer's team has not installed.
The viewer's team is their own, else their owner's (an owned agent has no team
of its own). A factory install makes a plugin installed for everyone; another
team's install leaves it available to yours; a removed install makes it
available again. Settings › Plugins shows the available rows with an Install
button beside the installed ones.

`edit_plugin` installs one with `source: { kind: "bundled", name, scope }`. The
name is matched exactly against the manifest names the server read from its own
bundled folder; the caller never supplies a path, so `../x` or an absolute path
is `install_failed`, not a file read. The manifest's
`extensions["io.hyperidle"].installScope` (`team` by default, or `factory`)
decides where the Install button puts it: a team plugin into the viewer's team,
a factory plugin once for everyone, its agents on no team so they reach every
team.

A plugin's agents are runnable at once: after the install commits, every
contributed agent with no harness yet gets the first harness this machine has
ready and not switched off — the same first-ready choice the welcome screen
makes — written through the orchestration run-config port. No ready harness →
nothing is written and the install still stands. A harness a person chose later
is never overwritten by a reinstall. A source that cannot be fetched (no such
folder, a failed clone) answers `install_failed` rather than an error.

The two that ship today:

- `document-management` — the Document Librarian agent, decay/triage/retro
  subscriptions, and three skills. Installs factory-wide.
- `role-personas` — Builder, Designer, Product Manager, QA Engineer, Growth, Ops
  and Facilitator, each with its identity. This is the roster HyperIdle used to
  ship, relocated.
