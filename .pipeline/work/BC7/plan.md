# BC7 — Opinions out: the default install is empty

## What we need

**Why this exists.** The founder's default: one agent, one subscription to everything, empty prompts; every opinion (role catalog, prompt templates, team scaffolding, baked assistant behaviour) is a plugin. Today those opinions are code. Until they move, the product cannot be installed without them and cannot be customised except by editing core.

**What exists today.** Role catalog and scaffold specs in `org/src/resolve-scaffold-specs.ts` and `scaffold-agents.ts`; prompt templates under `docs/system-prompts/` and builtin knowledge; the assistant's baked behaviour; the config layer already models `builtin | plugin | user` origin and `BUILTIN_PLUGIN_ID`; `plugin-contributions` records what a plugin owns.

**Missing delta.** Those opinions moved into a plugin; a fresh install with no plugin boots to four empty lists and one agent with one subscription. Deletes the builtin catalog, templates and scaffolding from core.

**Depends on.** BC5 and BC6 — the user module's defaults and the platform module's contributions are what make them movable.

**Dials (provisional).** complexity: feature · ambiguity: established context · exposure: user-facing surface

## How it works

## How we work on this

## Confusions

## Proposed items
