# Plugins

How a plugin adds to a running HyperIdle, and how the plugin service keeps track
of what it added.

Plugins are how the product gains opinions it does not ship with. A fresh
install is one System Agent with a bare identity, one Assistant per human, and
nothing else — no roster, no roles, no personas. A Builder, a Designer, a
Document Librarian all arrive because somebody installed a plugin.

## What a plugin can contribute

| Kind | Becomes | Declared as |
|---|---|---|
| **Agent** | a `users` row, plus its identity | `agents[]` in the manifest, with an optional `identity` file |
| **Subscription** | a `subscriptions` row, plus its prompt | `subscriptions[]`, whose `prompt` becomes a knowledge document |
| **Skill** | a knowledge document | a `skills/<name>/SKILL.md` file |
| **Configuration default** | a `plugin_configuration_defaults` row | `contributions[]`, and `mcp.json` servers |

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

Installing copies the plugin to `<dataDir>/installed-plugins/<pluginId>` and
records the path in `plugins.install_path`. Two features depend on it: restore
reads the plugin's files from there, and `${PLUGIN_ROOT}` / `${PLUGIN_DATA}` in
an MCP server's config expand against it at session-provisioning time.

> Not `<dataDir>/plugins`. Beside a development checkout's database that is the
> repository's own plugin **source** directory, and install removes the
> destination before copying.

`${PLUGIN_ROOT}` expansion stays at session time deliberately. Expanding at
install would store an absolute machine path in `default_value_json`, and
`default_version_hash` hashes that value — a hash whose job is "did the plugin's
shipped default change" would start answering "did the plugin change, or did the
app move".

## Bundled plugins

`plugins/` in the repository holds plugins that ship with the source but are
**not** installed by default:

- `document-management` — the Document Librarian agent, decay/triage/retro
  subscriptions, and three skills.
- `role-personas` — Builder, Designer, Product Manager, QA Engineer, Growth, Ops
  and Facilitator, each with its identity. This is the roster HyperIdle used to
  ship, relocated.
