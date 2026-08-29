# BA12 — The plugin service owns what it installed

## What we need

**Why this exists.** A plugin has to know which agents, routines and knowledge documents belong to it,
or it cannot update them when a new version arrives, and cannot cleanly disable or remove them. That
knowledge belongs to the plugin service. Today it is spread across three different mechanisms and one
of them is a string in a field people are meant to edit, so the guarantee is not one a person can
rely on. The cost of not doing it: a plugin update cannot find its own material, and a single edit in
the wrong field detaches a document from its plugin permanently and silently.

**What exists today.** Agents, routines and configuration rows each carry a `plugin_id` column.
Skills carry nothing — their provenance is `topic = "plugin:<id>"`, and uninstall, disable and enable
all find them by matching that string, so editing a skill's topic orphans it for good. The plugin
list shows contributions by reading the configuration tables only, so a skill never appears there and
the decided behaviour — an edit wins, is shown as detached, and can be restored — has no surface for
the material people will actually edit. MCP contributions expand `${PLUGIN_ROOT}` and `${PLUGIN_DATA}`
off the plugin's install path every time a session is provisioned. Install, enable and disable are
otherwise symmetric and work.

**Missing delta.** One place, owned by the plugin service, that records which entities a plugin
installed, covering every kind it can create — including the routine prompts that become knowledge
documents in BA11. Update, uninstall, enable and disable resolve through it rather than through a
`topic` convention. The contributions surface lists what a plugin owns across all kinds, with the
detached marker and the restore that were already decided. Path expansion for MCP servers moves to
install time so provisioning a session no longer reads plugin rows.

**Depends on.** BA11 — the registry has to cover every kind of entity a plugin can install, and the
routine prompt becomes one there; building it first means rebuilding it.

**Dials (provisional).** complexity: feature · ambiguity: established context · exposure: user-facing
surface

## How it works

## How we work on this

## Confusions

## Proposed items
