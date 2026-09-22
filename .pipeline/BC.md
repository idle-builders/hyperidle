# Track BC: One User Substrate — actions & events

Agents and humans are one user. Everything a user can do is an **action** a person would say out
loud; everything that happens is an **event**. Every action exists as both an MCP tool and a UI
action with the same authorisation; every event reaches a human as a notification and an agent as a
trigger, through one mechanism. Today that is not true: the reach-parity audit found 17 human-only
capabilities, 15 agent-only, 4 built twice, and the cause is that nothing declares a capability once.

**The contract is settled** (founder, 2026-09-10/11): four objects — **task · thread · document ·
user** — each with *search · open · edit*; thread also *send a message · adjust*; plus *session:
see what's running · watch · stop* and *platform: manage plugins*. **Seventeen actions.** Nine
events: `task|thread|document|user` × `created|changed`, plus `thread.message`. Every one of today's
126 routes is mapped to an action, to plumbing, or to deletion.

**The layer below is settled** (founder, 2026-09-11): the ten service packages are **replaced** by
six modules (`task`, `thread`, `document`, `user`, `session`, `platform`). A module exports its
actions in one shape — `name · description · zod input · invariants(next) · run(ctx, input)` — and
nothing else. Reads are `search` (one filtered list per object, one read model per view) and `open`.
The write is one `edit`: apply the partial, check `invariants` on the whole resulting object, write in
one transaction, append a row to a `changes` table (object, id, actor, diff, time). That row is the
event. HTTP routes, MCP tools, the UI client, the event stream and a governance lint rule are each a
loop over the list. Tools call modules in-process; the HTTP seam between layers goes. Hono + zod +
the MCP SDK already in the tree; no new framework. The layer split stays: the composition root joins
each layer's list. Founder: *"I want something that produces a robust and simple solution. If we can
delete and simplify all the way down to the services I would call that a success."*

**Reference documents** (all committed, founder-edited): `plans/reviews/ACTIONS.md` (the list, every
route mapped), `plans/reviews/LAYER-BELOW.md` (the shape and its decisions), `plans/reviews/
EVOLUTION-PATH.md` (the seven steps), `plans/reviews/census/` (code facts), `plans/reviews/research/`
(cited evidence). `docs/` contradicts itself in 13 places on this ground (`census/docs-intent.md`);
each item updates the docs it makes false.

**Rules that shape every item.** Migrations are full and destructive — no compat layer, no dual-write,
no dead code left. Validation before implementation. Under 1,000 added lines per change or stop and
ask; deletions never count. Each item leaves `verify` green and the app usable. Each is verified the
same way: the seam test drives every action as an agent and as a human and gets the same answer; the
governance rule is green for what the item claims; the screen is looked at.

**Out of scope for this track:** the UI rebuild and the agent workspace — the phase after this one.
Each item here only re-points existing screens at `call` and `invariants`.

---

## Work package registry

| ID | Title | Type | Complexity | Depends | Status |
|---|---|---|---|---|---|
| BC1 | Delete: 14 routes, 7 events, the attention engine, the stale events fork, dead controls | backend + frontend | feature | — | shipped — PR #552 merged (`286628f7b`). Scope cut from 22 routes and 8 events by founder ruling: delete means unused or unreachable, so seven still-called routes stay, and `notification` stays for the item that replaces its queue. |
| BC2 | The action list, proven end to end on task (shape, `changes` table, three loops, lint rule) | backend + frontend | suite | BC1 | done — PR #553 merged 2026-09-16 as `f49720426` |
| BC3 | Thread as a module: search · open · send a message · adjust; `items` becomes a message kind | backend + frontend | suite | BC2 | done — PR #555 merged 2026-09-20 as `2b1ef9b18`; items and the policy engine deleted outright (not kept as a message kind) |
| BC4 | Document as a module: search · open · edit; knowledge item renamed; tree, status, merge, split as edit | backend + frontend | suite | BC3 | done — PR #556 merged 2026-09-22 as `b3ffde4f3`; conflicts, merge, split, sweeps, the logs and the side table deleted outright; memory and artifact are words on edit; usage counts real |
| BC5 | User as a module with subscriptions: routines and notifications become one mechanism; team an attribute; setup dissolves | backend + frontend | suite | BC6 | in refinement — branch `feature/user-subscriptions` off `84b4626fb` |
| BC6 | Session and platform as modules: see what's running · watch · stop; manage plugins | backend + frontend | feature | BC4 | done — PR #558 merged 2026-09-22 as `84b4626fb`; stop kills the process for real, activity stays in memory, plugins are search + edit, the server-side key and the second websocket are gone |
| BC7 | Opinions out: role catalog, prompt templates, team scaffolding move to a plugin; fresh install is empty | backend + plugin | feature | BC5 | planned |

## Dependency graph

Sequential. Every module links to its neighbours (a task has a thread, a document has a parent, a
session runs on a task) and a module reaches a neighbour only through the neighbour's actions. While
a neighbour is still a legacy service the link calls the legacy service, and whoever lands second
swaps it. Running BC3, BC4 and BC6 in parallel would put the same swaps on three branches.

- `BC1` depends on nothing. Pure reduction; the governance rule it adds names what may not return.
- `BC2` depends on `BC1`: the rule's plumbing list must be the real sixteen, and the attention
  column must be gone before the task read model is cut.
- `BC3` depends on `BC2`: copies the pattern; thread is what task leans on most.
- `BC4` depends on `BC3`: document's conflict opens a review thread; lands with thread a module.
- `BC6` depends on `BC4`: smallest; its task link is rewired by BC5 anyway, so it goes last before it.
- `BC5` depends on `BC6`: a subscription names the nine events, which exist once every object emits
  them; connections and folders move from orchestration once session is a module.
- `BC7` depends on `BC5`: moves what the user module's defaults and the platform module's
  contributions then make movable.

```
BC1 → BC2 → BC3 → BC4 → BC6 → BC5 → BC7
```
