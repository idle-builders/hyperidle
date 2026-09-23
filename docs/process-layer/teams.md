# Teams

<!-- @source framework/db/src/schema.ts -->
<!-- @source layers/core-ui/src/pages/WorkTeam.tsx -->

A team is an id and a name — nothing else lives on the row. Every user, human or agent, belongs to
one: an owned agent (an Assistant) takes its owner's team rather than naming its own, and a
person's own team is set when they are created or edited. There is no separate membership table and
no lead, capacity, or phase column — those went with the setup wizard's scaffold-tracking columns,
which were never written on any real path.

For the Team primitive's place among the four, see [The four primitives](./the-four-primitives.md).

## 1. Creating a team

A team is named, not built through a ritual: `edit_user({ team: { name } })` finds a team by that
name (the oldest match) or creates it, on whoever the call is creating or editing. The welcome screen
does this twice — once naming the founder's team, once naming the team's own agent — and Settings
does the same whenever you add an agent with a team name that doesn't exist yet.

Creating a team creates no agents by itself. The welcome screen's own team agent (§ below) is a
choice the screen makes, not something the team's existence requires; from there you add agents
directly, or install a plugin that brings a shaped roster.

## 2. Persistence and muscle memory

The team persists for as long as anyone names it. Successive tasks pass through the same team. The
team's shared knowledge lives in the **team scope** — one of the three `SCOPE_KINDS` (`factory | team
| user`), read by every member. Where an item sits in the tree says what it is about; scope says only
who sees it. See [The Canonical Store](../knowledge-architecture/the-canonical-store.md).

This is what makes the second task on a team faster than the first, and the tenth faster than the
second. Every completed task adds to the team's muscle memory: which assumptions held, which broke,
which failure modes are common, which artifacts are reusable.

## 3. When teams change

Team membership changes by editing a user: `edit_user({ id, team: { name } })` moves a person, or an
owned agent's team moves with its owner. There is no review-item ritual and no capacity check —
naming a team is as ordinary an edit as changing a name or a role.

## 4. When teams dissolve

Nothing deletes a team. A team with no members left simply has none; its name and id persist, and
naming it again on a future `edit_user` call picks it back up. Its accumulated knowledge stays in the
team scope until something archives it directly.

## 5. Filesystems attach here

An agent within a team can have a **filesystem** attached — the durable working files its output
lives in (a git repo for code, a document set for non-code). The registry is team-scoped
(`filesystems` table, FK to `teams`); per-agent wiring is the separate `filesystemInjections` mapping.
Both are read and written through `open_user`/`edit_user`'s `folders` field now — a person's own view
shows their team's folders, and `folders.give`/`folders.take` move one to or from a specific agent.
See [Filesystem primitive](./filesystem-primitive.md).
