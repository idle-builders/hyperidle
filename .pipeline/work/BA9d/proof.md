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

## A gap this proof found, and its fix

The first run of this proof showed **seven routines where there should have been four**. The demo world
was still seeding the three rituals itself, so a demo install showed retros and knowledge upkeep
*without* the plugin — contradicting the acceptance criterion — and showed each of them *twice* with it.

Every test passed throughout. The demo world's routines and the plugin's were each individually correct;
only installing into a real seeded install showed them colliding. **This is the class of defect a test
suite structurally cannot catch, because nothing is individually wrong.**

Fixed by removing the three ritual routines and their seeded run history from the demo world. Left
alone, deliberately: the daily digest (not a ritual), and knowledge items and threads where a *person*
discusses a retro — that is someone talking, not machinery.

Re-run from a clean bootstrap after the fix:

- Before installing: **one** routine, the daily digest. Zero capability items.
- After installing: **four** routines — the daily digest plus exactly one of each plugin ritual.

## Repeating this

PGlite is single-writer: the data directory cannot be read from a second process while the dev server
holds it. Stop the server, then inspect. The dev-only API key for local calls is `hyperidle-dev-local`
(`layers/core-ui/src/services/api-fetch.ts`), which is a documented developer convenience, not a secret.
