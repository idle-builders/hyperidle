# BA9a Design Notes

## Package location

All new code lives in `layers/core-api/settings/` — the existing service that already owns the
`plugins`, `plugin_configuration_defaults`, and `configurationOverrides` tables per
`tools/governance/table-owners.json`. The three tables are owned by `settings`; any new service
that writes to them would violate table ownership. No new package is needed.

## (kind, key) collision resolution

`configuration_overrides` has a unique constraint on `(kind, key)` globally.
`plugin_configuration_defaults` is unique on `(pluginId, kind, key)` — so two plugins can declare
the same kind+key in their manifests and both get a defaults row, but the overrides table has room
for only one override per kind+key pair.

Resolution: **namespace the stored key by plugin ID**. A contribution with manifest key `K` in
plugin `P` is stored as key `P/K`. Plugin IDs cannot contain `/` (validated by the name format).
This makes the global `(kind, key)` pair unique per plugin by construction. Two plugins with the
same manifest key produce `plugin-a/key` and `plugin-b/key` — distinct, no collision possible.

The manifest key (pre-namespacing) is stored only in the contribution's `value` JSON if the caller
wants it; the DB key is always namespaced.

## Sources

All three source kinds reduce to a local directory (the plugin root), then the same reading path:

- **Folder path**: `path.resolve(input.path)` — use directly, no temp dir.
- **Git URL**: `git clone --depth 1 <url> <tempDir/repo>` via `execFileSync`. Temp dir is cleaned
  up after install (success or failure).
- **Zip**: `execFileSync('unzip', [zipPath, '-d', destDir])` via system `unzip` command. The zip
  must have `plugin.json` at its root (not inside a subdirectory). Temp dir cleaned up after.

Temp dirs use `mkdtempSync(join(tmpdir(), 'hi-plugin-'))`.

## Scope

Scope is stored as two columns on `plugins`: `scope_kind` (`factory | team`) and `scope_team_id`
(null when factory, a team ID when team). Migration `0061_BA9a_plugin_scope.sql` adds them with
`scope_kind DEFAULT 'factory'` so the existing builtin row and any future schema-only plugins pick
up the safe default.

Scope is metadata only in BA9a — the resolver does not filter by scope yet.

## Disable / remove vs the restrict constraint

**Disable**: `UPDATE plugins SET state='disabled'`. The resolver's
`active: hasOverride || plugin.state === 'enabled'` already stops disabled contributions from
applying (except for user-owned overrides, which stay active per D5).

**Enable**: `UPDATE plugins SET state='enabled'`.

**Remove** (two steps):
1. Hard-delete all `plugin_configuration_defaults` rows for this plugin. The FK
   `configurationOverrides.defaultId` has `onDelete: "set null"`, so any overrides for those
   defaults have `defaultId` set to null and become user-owned (no plugin link).
2. `UPDATE plugins SET state='removed'`. The restrict constraint no longer applies after step 1.

The plugins row is never hard-deleted — kept for audit and for the `state='removed'` filter.

## Detached representation

The resolver (existing code) marks an item as detached when `valueSource === 'user_override'`.
Nothing new is needed: the installer writes defaults; when a user edits via
`writeConfigurationOverride`, the resolver sees the override and sets `valueSource`.

Restore = `writeConfigurationOverride(db, { kind, key: namespacedKey, value: null })` — clears the
override, defaults take over again.

## Manifest parsing

Follows spec 1.0.0:
- Required: `$schema` (must equal the canonical URL), `name` (1-64 chars, validated format).
- Fatal violations: missing required fields, wrong `$schema`, invalid `name`.
- Non-fatal: unknown top-level fields, non-object `extensions` — reported as warnings, install continues.
- Our namespace: `io.hyperidle` under `extensions`.
- Contributions live at `extensions["io.hyperidle"].contributions[]` — each item has `kind`, `key`, `value`.

## Package containment utility

`isPathContained(rootDir, candidatePath)` — resolves `candidatePath` relative to `rootDir` (using
`path.resolve`) and checks the result starts with `rootDir + sep`. Used in BA9b for skill and MCP
paths; exported from settings now so BA9b can reuse it.
