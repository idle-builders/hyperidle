# Plugins

How a plugin adds to a running HyperIdle, and how the plugin service keeps track of what it added.

Plugins are how the product gains opinions it does not ship with. The install itself ships empty — only the hidden `system:propagation` actor. The welcome screen (SetupFlow) creates the person's assistant with nine subscriptions, one per event, each with an empty prompt. Beyond that there is nothing else: no roster, no roles, no personas. A Builder, a Designer, a Document Librarian all arrive because somebody installed a plugin; the ones that ship with the app are listed in Settings › Plugins as available, one click from installed. A plugin brings its own agents and subscriptions; it never writes into the assistant's.

## One install per team

A plugin is installed for a scope: **factory** (once, for everyone) or a **team**. Each install is its own `plugins` row, and the row id is the install id — the manifest name for a factory install, `<name>@<teamId>` for a team install (a manifest name never contains `@`). Two teams can each install the same plugin: each gets its own agents, subscriptions and documents, and removing, disabling or enabling one team's install leaves the other's alone. `edit_plugin`'s `id` is always an install id.

Contributed row ids hash the manifest name and the scope, so every install's rows are distinct.

## What a plugin can contribute

| Kind | Becomes | Declared as |
|---|---|---|
| **Agent** | a `users` row, plus its identity | `agents[]` in the manifest, with an optional `identity` file |
| **Subscription** | a `subscriptions` row, plus its prompt document | `subscriptions[]`, whose `prompt` becomes a document |
| **Skill** | a `documents` row with `slot = 'skill'` | a `skills/<name>/SKILL.md` file in the plugin |
| **MCP server** | nothing stored — read from the install folder's `mcp.json` each time a session starts | `mcp.json` |

Agents, subscription prompts and skills all end up as ordinary rows in the services that own them — `users` and `documents`. A plugin does not get a private world; it adds to yours, and what it adds is editable like anything else.

An agent's `identity` names a file inside the plugin, and it becomes that agent's `agent_file` document. A path that escapes the plugin root, or names a file that is not there, drops the identity and keeps the agent — a bare agent is valid, so a typo must not cost the whole contribution.

## The ownership registry

`plugin_contributions` is the plugin service's record of what each plugin contributed: one row per `(plugin, kind, entity)`, plus a `detached_at` stamp. It is the only answer to "what did this plugin contribute".

The registry belongs to the plugin service. It names the rows; the service that owns each table writes them.

## One lifecycle

Install, enable, disable and remove all drive the same function over the registry: make everything this plugin contributed live, or not live.

**Installing is a deliberate act**: everything the plugin contributes is live afterwards, whatever a previous disable or remove left behind.

Agents and documents are never hard-deleted: the audit tables hold RESTRICT foreign keys, so a removed plugin's agents go `inactive` and its documents archive. Subscriptions are the exception — they carry no soft-delete column, so a removed plugin's subscription rows are deleted outright; disable instead sets them `paused` (`subscriptions.setLive`).

## Detach and restore

Editing a plugin-contributed document makes it yours: the registry stamps `detached_at`, the contributions view says so, and a reinstall leaves your version alone.

**Restore** hands it back: the plugin's version is re-read from disk and the stamp cleared. A skill document's id is a one-way hash of the plugin id and the skill directory, so restore inverts it by enumerating the plugin's skill directories — the id derivation stays the single source of truth rather than the mapping being stored twice.

## Where plugin files live

Installing copies the plugin to `<dataDir>/installed-plugins/<installId>` — one folder per install, so one team's reinstall never removes the folder another team's restore reads — and records the path in `plugins.install_path`. Two features depend on it: restore reads the plugin's files from there, and a session reads the plugin's MCP servers from the `mcp.json` there, expanding `${PLUGIN_ROOT}` / `${PLUGIN_DATA}` against it. An install without a folder brings no MCP servers.

> Not `<dataDir>/plugins`. Beside a development checkout's database that is the repository's own plugin **source** directory, and install removes the destination before copying.

Nothing about a server is stored at install: the folder is the only copy, so an edited `mcp.json` reaches the next session, and a moved data directory never leaves a stale absolute path behind in the database.

## Bundled plugins

`plugins/` in the repository holds the plugins that ship with the app. The desktop build copies it into the app's resources beside the migrations (`electron-builder.yml`), and the desktop shell points the server at it with `HYPERIDLE_BUNDLED_PLUGINS_DIR`; the server image finds it in the repository it carries. Nothing is installed by default.

`search_plugins` answers two kinds of rows: every install, and — as `state: "available"` — each bundled plugin the viewer's team has not installed. A factory install makes a plugin installed for everyone; a removed install makes it available again. Settings › Plugins shows the available rows with an Install button beside the installed ones.

`edit_plugin` installs one with `source: { kind: "bundled", name, scope }`. The name is matched exactly against the manifest names the server read from its own bundled folder; the caller never supplies a path. The manifest's `extensions["io.hyperidle"].installScope` (`team` by default, or `factory`) decides the scope.

The two that ship today:

- `document-management` — the Document Librarian agent, decay/triage/retro subscriptions, and three skills. Installs factory-wide.
- `role-personas` — Builder, Designer, Product Manager, QA Engineer, Growth, Ops and Facilitator, each with its identity.
