# BA9a — A plugin can be installed

Split from BA9 (2026-08-25, founder decision). The founder decisions this rests on are in
`.pipeline/work/BA9/plan.md` — read that first; it is authority alongside this plan.

## Outcome

A plugin in the **Agent Plugins 1.0** format can be installed into a running HyperIdle from a git URL, a
zip or a folder path, landing on one team or the whole backend. Its contributions become ordinary
editable rows; editing one detaches it from the plugin, which the product says out loud, and you can put
it back. The plugin can be disabled and removed.

**Why.** The extension story rests on this and it did not exist. The configuration half was real — three
tables and a resolver where a plugin default loses to a user override — but the intake half was never
built: no format, no loader, no install path, nothing that ever wrote a `plugin_configuration_defaults`
row. Until it exists, the AU20 audit's twenty-one plugin-marked rows cannot leave core.

## The standard

Agent Plugins 1.0.0 (https://github.com/agentplugins/agent-plugins-spec), adopted as written: where it
is normative we conform, where it is silent — install, update, disable, removal — we decide.
`plugin.json` sits at the plugin root, `$schema` and `name` are required, and the ten permitted
top-level fields are closed. Three points shape the loader:

- **An unknown top-level field, or a non-object `extensions`, is non-fatal** — report and keep loading.
  Other manifest violations are fatal.
- **Package containment:** every package-supplied path must resolve inside the plugin root.
- Client extensions live under a reverse-domain namespace. A client must ignore namespaces it does not
  implement **without validating their contents**, and one component's failure must not stop other
  valid components loading.

## Acceptance criteria

1. Install from a git URL, a zip and a folder path each produce a `plugins` row plus one
   `plugin_configuration_defaults` row per contribution, at a scope — one team or the whole backend —
   required at install time, recorded and visible afterwards.
2. A fatally invalid manifest is rejected with a reason a person can act on; an unknown top-level field
   or non-object `extensions` is reported and the install still succeeds. A path resolving outside the
   plugin root is refused, and the reserved `builtin` id can never be claimed or listed as installed.
3. Contributions appear as editable configuration, a user's edit wins, the edited item shows detached,
   and it restores to the plugin's value.
4. Disable stops contributions applying and re-enable brings them back; removal must survive
   `plugin_configuration_defaults.pluginId` being `onDelete: "restrict"`; reinstall at a newer version
   updates defaults and leaves detached items alone. Two plugins declaring the same `kind` and `key` do
   not corrupt each other — prove it with two real plugins.

**Out of scope.** Skills, rules, agent files and `mcp.json` (BA9b); event context (BA9c); the rituals
plugin and the `strategy` purge (BA9d); a marketplace. Live reload — a restart is allowed, as a named
step, not a surprise.

**Constraints.** No new runtime path for what already has one: contributions land in the existing
configuration tables and go through the existing resolver. Security is not preemptive (ETHOS) — package
containment is in the spec and stays; invent no permission model, sandbox, signature check or allowlist.

# As built

Shipped as PR #513, merged 2026-08-25 as `ed59f9443`. All new code sits in `layers/core-api/settings/`,
which already owns the three tables per `tools/governance/table-owners.json` — any other service writing
them would violate table ownership.

**Contribution keys are namespaced by plugin id.** `configuration_overrides` is unique on `(kind, key)`
globally while `plugin_configuration_defaults` is unique on `(pluginId, kind, key)`, so two plugins can
both hold a defaults row for a pair while only one override row exists. A contribution with key `K` in
plugin `P` is stored as `P/K`; plugin ids cannot contain `/`, so the pair is unique by construction.

**All three sources reduce to a local plugin root** and take one reading path: a folder is used in place,
a git URL is `git clone --depth 1` into a temp dir, a zip is extracted with `unzip` and must carry
`plugin.json` at its root. Temp dirs are cleaned up on success and failure alike.

**Removal works around the restrict constraint** by hard-deleting the plugin's defaults first — nulling
`defaultId` on any overrides — and only then marking the plugin row removed. A person's edit survives
as `user_owned` and reconnects on reinstall through `(kind, key)`.

**Detached is not a new flag.** The resolver's `valueSource: 'user_override'` already means "the person
changed this"; restore writes the stored default back over it, retained in `defaultValueJson` plus
`defaultVersionHash`.

## Durable learnings

- **PGlite is single-writer.** Reading its data directory from a second process while the dev server
  holds it returns a stale snapshot — it twice made a successful install look broken. Verify through
  the app with a full page reload, or stop the server first.
- **Migration `0058_AU44_fold_team_members.sql` aborted on every populated database**, and was fixed
  here: it re-pointed `users.team_id` to a `teams` id *before* dropping the FK that still required a
  `team_members` id, so it only passed where no user belonged to a team — which is what its own test
  had. Editing an already-applied migration is safe, settled empirically: **drizzle compares the
  journal's `folderMillis` timestamp, never the file hash.** Second occurrence; BA1 caught the first.
- **`plugin_configuration_defaults` is not empty on an existing install.** Nothing writes it in current
  code, but real databases carry orphan `builtin` rows (33 on the dev install) — written by AU2 (#414),
  deleted by the AU20 cleanup, maintained by nothing. Do not assume a blank slate.

## Known limitations

- **Install scope is stored and shown but does not filter.** A `team`-scoped plugin's contributions
  apply everywhere. The resolver structurally cannot fix this — `listConfiguration` takes only kind and
  key, serving an admin surface with no session or team context. Enforcement belongs where session
  assembly knows the team: **owned by BA9b**.
- **`validateConfigurationValue`** (`settings/src/plugin-configuration.ts:92`) rejects values holding
  fields named `command`, `env`, `secret` and similar. It runs only on the user-edit path, so it does not
  block a plugin *contributing* an MCP server but does block a person editing one. Open founder question.
