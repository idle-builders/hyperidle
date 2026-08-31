# Architecture

Read by `/architecture`, `/architecture-critique`, `/write-code`, `/review`. Slot: `architecture`.

## The boundary rules are not in this file

What may import what, and how packages talk across a boundary, is machine-enforced. `npm run lint` is
the source of truth and `tools/governance/README.md` is the written account. Read it when the linter
stops you. Do not copy a rule out of it into a plan, a comment or a doc — a second copy drifts from
the enforced one, and then agents follow the wrong copy. Do not infer a boundary from the code around
you either: an existing import may be a violation nobody has caught yet.

One rule is deliberately elsewhere: **which world a file is in — production or development** — because
you need it before you write the file, not after the linter rejects it. `CLAUDE.md` carries that one.

## Say which kind of change you are proposing

Governance keeps three things apart, and a plan should name the one it touches:

- a **clause** (`src/lib/governance-model.ts`) is a principle — changing one is a founder ruling;
- a **registry** (`architecture.json`, `table-owners.json`) is a fact — a new package, surface,
  endpoint or table owner is a registry edit, not a model change;
- a **decided rule** (`decided-rules.json`) is a decision already made, one at a time, and the 195 rows
  double as the acceptance test the model must reproduce exactly.

A plan that wants "an exception for this case" is asking for a founder ruling. Say that plainly rather
than burying it in an implementation step. Every architectural rule is `error`; there is no severity
dial, so a new rule lands with its violations cleared in the same pull request.

## Scans, not lists

Never hardcode a package path in a script, guard or config — discover by scanning the role roots
(`layers/`, `framework/`, `applications/`, `tools/`), and **hard-fail when a scan finds nothing.** A
guard wired to zero files prints nothing and reads as passing forever. This repo has shipped that bug
more than once: three design rules exported by the plugin but named in no config block, and a harness
guard whose path predicate matched 1 of 12 candidate files after the packages moved.

## Migrations are full

Move every caller and all data to the new shape in the same change, then delete the old one. No compat
layer, alias, shim, dual-write or dead code left behind. If a bridge is genuinely unavoidable, say so
to the maintainer instead of quietly leaving one.

## Before you trace by hand

For "where is this used" and "what does changing this touch", use the `hyperidle-trace` MCP tools —
the code graph follows cross-file calls, startup wiring and event chains that grep cannot. A "no
matches" is not proof of unused; confirm an important negative with a targeted search.
