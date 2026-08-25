# BA9a — Live proof

Run on 2026-08-26 against the real app (dev server, PGlite laptop profile), driving the actual
settings screen. Not a test fixture: a real plugin folder, a real git repository, the real HTTP routes
and the real database.

## The plugin used

An Agent Plugins 1.0.0 folder built for this proof, deliberately containing two things the spec says a
client must tolerate: an **unknown top-level field** (`somethingUnknown`) and a **foreign namespace**
(`com.someothertool`). Both are non-fatal per the spec, and the install accepted the plugin.

Contributions: one `agent` (`librarian`) and two `routine`s (`knowledge-decay`, `post-bet-retro`).
A `skills/retro-facilitation/SKILL.md` was included and correctly ignored — skills are BA9b.

## What was proven

| Step | Evidence |
|---|---|
| Install from a **folder**, factory scope, via the settings screen | Row appeared: `enabled · knowledge-upkeep · v0.1.0 · Factory`, replacing the empty state |
| Contributions written | `plugin_configuration_defaults` holds `knowledge-upkeep/librarian`, `knowledge-upkeep/knowledge-decay`, `knowledge-upkeep/post-bet-retro` |
| Contributions appear as **editable configuration** (AC5) | Agent-behavior pane went from `Agents 9 / Routines 1` to `Agents 10 / Routines 3` — exactly one agent and two routines. The agent renders as `Default · Librarian · facilitator` |
| Install from a **git URL** (AC1) | A second plugin `retro-rituals v1.2.0` installed from `file://` git remote and survived a **full page reload**, so it came back from the server, not from optimistic UI state |
| Two plugins declaring the **same** `agent`/`librarian` key (AC8) | Both installed and coexist; keys stay distinct as `knowledge-upkeep/librarian` and `retro-rituals/librarian` |
| **Disable** (AC7) | After a full reload: `disabled · retro-rituals`, button flips to Enable, and its contribution is listed as **"Inactive: plugin disabled · Retro Librarian · facilitator"** — it stops applying and says why rather than silently vanishing |
| **Remove** (AC7) | Row gone, agent count back to 10, no trace of `Retro Librarian` |
| Reserved `builtin` never listed (AC9) | The `builtin` plugin row exists in the database and never appears in the installed-plugins list |

Not proven live, and covered by the integration lane plus the reviewer's sanity-breaks instead: detach
and restore (AC6), the zip source, and reinstall-updates-defaults (AC10).

## Two things this proof turned up that the written record had wrong

**1. `plugin_configuration_defaults` is not empty on an existing install.** Refinement and the critique
both recorded that nothing writes that table. True of the code at HEAD — but this database carries **33
`builtin` rows** (agents, tools, a routine, a harness descriptor). The writer existed: it was added by
AU2 (`#414`) and deleted by the AU20 cleanup in `3efc6c573` ("delete settings batch: 15 rows — plugin
config engine…"). So the rows are residue that no current code writes or maintains, and the settings pane
on a real install is **populated by orphan rows**, not empty. BA9b and BA9d should not assume a blank
slate.

**2. Migration `0058_AU44_fold_team_members.sql` aborts on any populated database.** See
`.pipeline/work/BA9a/migration-0058-defect.md`. It blocked this proof until repaired by hand.

## A caution for anyone repeating this

PGlite is single-writer. Reading the data directory from a second process while the dev server holds it
returns a **stale snapshot** — it briefly made a successful install look like it had not been written.
Verify through the app with a full page reload, or stop the server first. Two of the "defects" seen
during this run were this, not the code.
