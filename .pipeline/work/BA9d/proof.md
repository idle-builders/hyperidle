# BA9 — End-to-end proof, across all four packages

Run 2026-08-27 against the real app on a freshly bootstrapped install. Not a test fixture: the real
setup CLI, the real server, the real HTTP doors, the real database.

## Without the plugin, the product is coherent

A fresh `--demo` bootstrap, before installing anything:

| Check | Result |
|---|---|
| Agents in a `strategy` category | **none** — categories are `team`, `individual`, or null |
| The five seeded facilitators | **gone** (0 rows with `role='facilitator'`) |
| `builtin:*` routines | **gone** |
| Installed plugins | 0 |

The app boots with no server errors and the interface renders.

## Installing the plugin, into the running app

`POST /api/plugins` with the `knowledge-management` folder at whole-backend scope returned the installed
plugin with **no warnings**, and created:

- **An agent** — `Knowledge Librarian`, a real `users` row, `agent_category: individual`. Not `strategy`;
  that value no longer exists.
- **Three routines** — two calendar, one on `task_state_changed`, all owned by that agent.
- **Three skills as knowledge items** — `role: 'skill'`, `scope_kind: factory`, topic
  `plugin:knowledge-management`. This is BA9b's path carrying a real plugin's skills, not a fixture.

## The agents do the work

Triggering the promotion routine through its real door fired it and produced a run whose baked request
carried:

```
bundleKind: routine
routine:   "Knowledge Promotion with Attention Recompute"
prompt:    "Run the knowledge promotion sweep by calling the run_knowledge_sweep tool with
            kind='autoPromotion'. ..."
agent:     Knowledge Librarian
```

So the ritual is an ordinary agent session that calls a deterministic tool — the split the plan drew for
attention scoring, applied to decay and promotion: the **schedule** belongs to the plugin, the
**operation** stays in core where it is tested.

## What each package contributed

- **BA9a** — the plugin installed at all, at a chosen scope, through a real door.
- **BA9b** — its skills became knowledge and reach a session where each harness looks for them.
- **BA9c** — the retro routine learns which task finished; without it the retro could not do its job.
- **BA9d** — what was installed, and the core it left behind.

## Known gap found by this proof

**The demo world seeds the rituals it no longer owns.** A `--demo` bootstrap creates
`demo-routine-knowledge-decay`, `demo-routine-knowledge-promotion` and `demo-routine-post-task-retro`.
Two consequences:

1. A demo install **without** the plugin still shows retros and knowledge upkeep, which contradicts the
   acceptance criterion that a team which does not install the plugin sees nothing referring to retros.
2. A demo install **with** the plugin has each ritual twice — the demo copy and the plugin's.

This is tooling data, not production seeding, and it does not affect a real install. But the demo world
should either drop them (a fresh install has no rituals until the plugin is installed) or install the
plugin as part of the demo, which would also make the demo a better advertisement for it.

## Repeating this

PGlite is single-writer: the data directory cannot be read from a second process while the dev server
holds it. Stop the server, then inspect. The dev-only API key for local calls is `hyperidle-dev-local`
(`layers/core-ui/src/services/api-fetch.ts`), which is a documented developer convenience, not a secret.
