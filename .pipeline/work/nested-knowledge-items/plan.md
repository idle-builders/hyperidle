# Nested knowledge items

## Seed

A knowledge item can contain other knowledge items. The knowledge
navigation becomes a tree. There is no separate folder thing — **a folder is a
knowledge item**: clicking it opens it, with its children listed on it. In an agent's
sandbox, a knowledge item with children materialises as a directory with an index
knowledge item inside.

## What we need

**Why this matters.** Structure today is four flat vocabularies — `topic`, `kind`,
`layer`, `scope` — and they are four words doing two jobs badly. Knowledge
management is a plugin now; the core should not ship a fixed filing vocabulary.
The founder wants full flexibility: *"what we really need is full flexibility in
structuring knowledge."* You restructure by moving knowledge items, not by us shipping a
new enum value.

### The two jobs, separated

Everything turned on splitting one confusion: **what a knowledge item is about** is
answered by where it sits in the tree; **who sees it** is answered by `scope`, and
by nothing else. "Product" and "Practices" stop being scope values and become what
they always were — knowledge items near the root. A knowledge item is product knowledge
because it lives under Product.

| Survives | Job |
|---|---|
| `parentId` + `parentKind` + `position` | what it is about, and where it sits |
| `scope` = `factory` / `team` / `user` | who sees it |
| `status` | how relevant and trusted it is |
| `role` | skill / rule / agent file / ordinary |

**Deleted: `topic`, `kind`, `layer` (L0–L4), and the `product` / `practice` scope
values.** Founder: *"layer and kind don't make sense anymore in the current
product."*

### Scope is a readability filter, not RBAC

Scope narrows as you descend, and that is how the tree stays readable as it grows
— not an access-control system. A child's scope must be the same or narrower than
its parent's, on the founder's own reasoning: if you cannot see the root you
cannot reach the children. What you cannot see is **hidden**, not
shown-and-locked; a locked row you cannot open still costs a line of tree.

### Task knowledge lives in the task

The parent slot is polymorphic: a knowledge item's parent is another **knowledge item**, a
**task**, or a **thread** (a knowledge item an agent produced inside a conversation, or
a file a human attached to one). So `task` and `bet` leave the scope kinds entirely, and graduating a task
learning into the team's knowledge is reparenting it — one field, no copy, no
status change. This closes a hole found by the artifact/knowledge strand: while
task/bet stayed scope values, `scope` was still doing two jobs and the descent rule
was meaningless for a task-scoped child.

Accepted cost: the parent is no longer a plain foreign key, so existence is
validated at the API boundary. `org_edges` is the precedent. We trade a database
guarantee for one word that means one thing.

Another session is merging artifacts with knowledge, which makes task knowledge
and artifacts the same object. This item does not decide what that object is — only
that it stays off the tree and can be reparented into it.

### One lifecycle, no gatekeeping

**Amendment, founder-approved 2026-09-02.** The status ladder collapses to
**`proposed | active | stale | archived`**. A knowledge item starts proposed and
becomes active when someone or something vouches for it — `active` rather than
`approved` because the word should say *this is the current document*, not *this
passed a review*. Stale is what the decay sweep sets; archived is out.

Founder: *"the layer mechanism was too complex, rather all knowledge is dealt with
the same way."*

What that replaces is worse than the plan assumed. There are **two** status
vocabularies today — `KNOWLEDGE_STATUSES` (captured, provisional, validated,
active, stale, archived, needs_human) and `KERNEL_KNOWLEDGE_STATUSES` (draft,
active, archived, needs_human) — nine distinct values between them, with a
transition map spanning both. A human creating an item gets `draft`; an agent
writing one through writeback gets `captured`; the two mean the same thing.
`provisional` and `needs_human` have **no production writer at all**, so
auto-promotion scans for a state nothing creates and the Triage tab can only fire
on demo data.

**No authorisation checks.** The layer-keyed permission gate in `write_memory`
(`NON_FACILITATOR_MAX_LAYER`, `FACILITATOR_ROLES`) is deleted with `layer` and
nothing replaces it. Founder: *"we don't need authorization checks. later we can
risk based checks which isolate what needs review."* The facilitator is gone as a
concept — a bare setup has a single agent. Review is earned from a real learning,
never built first.

### What an agent receives

Settled: the scope column already answers it — an agent gets factory-scoped
knowledge, its team's, and its own. Founder: *"the agent gets global + stuff from
his team + stuff for his user. the scope column system takes care of that."* No
subtree selection logic, no replacement for the layer ladder. Ranking keeps the
existing relevance scoring minus its layer term.

Human viewers get the same rule on the read path, which is what makes a
team-scoped branch invisible outside that team. The pattern already exists for
agents in `fetchCapabilityItems`; the human path passes the viewer's team from the
route rather than joining to a table the knowledge service does not own.

### Agents and humans are equal here

*"Agents can do anything a human can."* An agent that writes
`knowledge/pricing/objections.md` creates real nested knowledge items, and nesting a
human makes materialises as real directories. Today deeper folders an agent
creates are silently discarded.

### Ordering and depth

Children sort by an explicit `position`, defaulting to creation order, ties by
title. There is no ordering at all today, and a browse tree that reshuffles when
someone fixes a typo is unusable. No drag-to-reorder interface here; the column
makes one possible later. Depth is capped at 32 as a backstop; the real guard is a
cycle check on every move.

### Success looks like

- A person opens Knowledge, sees a tree, clicks a parent, and reads it as a
  knowledge item with its children listed on it.
- A person can nest and move knowledge items, and the tree keeps up.
- An agent creating nested folders produces that same tree, and a tree a human
  builds arrives in the sandbox as directories.
- A team-scoped branch is invisible to someone outside that team.
- A task's knowledge appears on the task, never in the tree.
- `topic`, `kind`, `layer`, `product` and `practice` are gone from the schema, the
  interface and the agent tools — not deprecated, gone.

### Not in this item

- Drag-to-reorder, or any hand-ordering interface.
- The sidebar navigator's own design (search, filter, phone drawer).
- Changing how knowledge is created, promoted, decayed or scored beyond what
  losing `layer` and `kind` forces.
- Access control. Scope hides things to keep the tree readable; it is not a
  security boundary and must not be sold as one.

## How it works

### The tree

A knowledge item carries a parent, a parent kind, and a position. The parent kind is
a knowledge item, a task, or a thread. **Bet is not among them.** A parallel, further
advanced session is deleting bets in favour of nested tasks — a bet is a task with
no parent — so there is nothing extra to model here, and any parent kind list
carrying `bet` is stale. A knowledge item with no parent is a root. A knowledge item parented
to a task or a thread never appears in the knowledge tree; that task or thread
lists its own.

Three rules hold on every write that sets a parent, checked **inside the same
transaction as the write**: no cycles, scope no wider than the parent's, depth no
greater than 32. The in-transaction part is not fussiness — two people reparenting
at the same time can each see a legal tree and together produce a loop, and a
recursive read that meets a loop does not fail, it spins.

### One tree, not two

Today an agent gets two knowledge trees: the one it receives, filed into
`context/` by layer and made read-only, and the flat `knowledge/` it writes into.
That split is what stops an agent doing what a human can, so it goes. There is one
writable, watched `knowledge/` tree, shaped like the real one. Context assembly is
unchanged in spirit — scope and relevance still choose the slice an agent gets; the
slice simply arrives in the shape it actually has. Skills, rules and agent files
still land wherever the harness looks for them, because that is decided by what
they are, not where they sit.

A parent materialises as a directory with an `index.md` inside holding its own
text. Filenames stay human-readable titles plus a short `_${id.slice(0,8)}`
suffix — the only uniqueness and path→item key writeback trusts; no front matter.
When a selected knowledge item has an unselected ancestor, that ancestor's index
is written anyway: a path with a missing middle means nothing. A new directory
creates its own knowledge item; a created child inherits its parent's scope.
Narrowing a parent's scope cascades to the subtree.

### A move is an edit

A file appearing inside a directory becomes a knowledge item whose parent is that
directory's knowledge item. Moves resolve by the id suffix in the filename: a
creation whose name carries a known id is a reparent (body untouched, manifest
path rewritten). Batch pairing of delete+create was rejected — it fails directory
renames and edit-while-move. Ambiguous disappearances still open a conflict for
review.

The thread parent is not a new capability — it is the honest version of one that
has been half-built since T4. Content is attached to a conversation today as a
`BlockRef` embed, and a block id is a hash of content and outline path, so the
reference rots the moment the source is edited and degrades to "source changed".
It has no body, status, scope or history of its own. A knowledge item parented to the
thread has all of them. That retirement is owned by the artifact/knowledge strand,
which is rewriting how message content works; this item owns the slot it lands in.
The opposite direction — a thread *hosted on* a knowledge item and anchored to a block,
a comment on a region — is untouched.

**Nothing resolves through a non-item parent.** Every tree walk stops at the
first parent that is not a knowledge item, so a task- or thread-parented knowledge item is
both a leaf and a walking root: no ancestors, inherits nothing. This is what keeps
`item -> thread -> item` harmless — a thread can be hosted on a knowledge item
and also parent one, which closes a loop in the wider graph, but no walk crosses
the hop, so the loop is inert rather than policed. Forbidding it at write time
would outlaw the case it exists for. The cycle check governs item-to-item
chains only, and runs in full when a knowledge item graduates, since that is an ordinary
reparent.

A move is then recorded as an ordinary edit to the knowledge item, on its parent. It
shows up in history beside every other change and needs no separate review path —
which is what makes a move reviewable at all. A move that breaks one of the three
rules is refused outright and reported back, rather than recorded and repaired.

### What the old vocabularies were holding up

Only one live surface depended on them: the **Backlinks card** on a knowledge item,
which lists up to ten items sharing a topic string. It becomes children plus
siblings — the tree answers "what is near this" better than a shared word did.

The weekly decay sweep's cohort — how many neighbours say the same thing — becomes
siblings. The cross-scope repetition signal is deleted rather than approximated;
without `topic` there is no honest version of it. Nothing in the interface renders
an attention score today, so this changes what the sweep archives, not what anyone
sees.

Two more queries turned out to have no callers at all — the layer-filtered git
export and the recent-by-layer digest. They are deleted, not ported.

### Migrating what exists

Two levels, seeded once: a root item per surviving scope grouping (Product,
Practices), a root per distinct topic beneath it, and the items under those. Items
with no topic land under General. Rows scoped `product` or `practice` have their
scope rewritten to `factory`, because where they now sit says what their scope
value used to. Task- and bet-scoped rows all become task-parented, leaning on the
parallel work's invariant that each bet became a root task keeping its own id — so
the scope id never changes and only the kind string moves.

**Amendment, founder-approved 2026-08-30, after reconciliation against the code**
(`feasibility.md`). Two of the plan's migration claims were wrong.

`product` is not layer vocabulary — it displays as **Team** everywhere, and its
scope id is already a team id. It migrates to `team`, not `factory`. Sending it to
`factory` would have published every team's product knowledge factory-wide.

`practice` is live role-scoped knowledge — the "Role" option in the create picker,
whose scope id is an agent role, feeding the knowledge an agent receives for its
role. It moves **into the tree**, on the founder's ruling: a "Practices" root with
one knowledge item per practice, so a practice has a folder of its own knowledge and can
nest inside it. Context assembly resolves an agent's practice folder by matching
the agent's `role` string against those knowledge items.

That name match is a deliberate stopgap, accepted as such: *"for now whatever
works and later we will launch a session to rework that entire role/practice
aspect since it seems broken."* Whether a practice and an agent role are one thing,
and whether agents should be assigned practices by id instead of by name, is
deferred to its own session and must not be settled here.

### Left deliberately simple

No hand-ordering interface — `position` exists so one can be added later. No
transclusion: a knowledge item still belongs to exactly one parent. Scope hides branches
to keep the tree readable and is not access control; the day someone needs it to
survive a determined reader, it has to be rebuilt as something else.

### Sequenced with two parallel strands

The task-hierarchy work removes `bet` from the scope kinds; this work removes
`product`, `practice` and finally `task`. Same list, two branches — theirs lands
first and ours subsumes it. The artifact/knowledge merge decides what a
task-parented knowledge item *is*; this work needs only that it stays off the tree and
can be reparented into it.

## As built (durable)

- **Parent slot** already on `main` (attachment PR): `parent_kind` ∈
  `knowledge_item | task | thread | routine | agent`, paired with `parent_id`, no
  FK; walks stop at the first non-`knowledge_item` parent. This item added
  `position` and the tree invariants (cycle, scope descent, depth ≤ 32) in the
  same write transaction.
- **One-write create.** Nesting names a `knowledge_item` parent on `POST` (not
  create-then-PATCH). Illegal or invisible parents → 400.
- **Tree UI.** Curated list uses real tree chrome (`KnowledgeTreeList`: chevron,
  18px indent guides depth-capped at 6, expand-by-default, in-place Add child via
  `?parentId=`, keyboard collapse/expand). Detail always shows Children with Add
  child; ancestry breadcrumb for knowledge parents; Move stays in overflow. No
  drag-to-reorder. Page-local list, not a DS primitive.
- **Founder live-render.** Approved 2026-09-09 (`proceed`) for the nestable
  Curated tree and nested detail — closes the visual gate booked for this surface.
- **Accepted limitations.** Practice↔agent role is still title/name matching
  (stopgap). Docs that still teach L0–L4 / topic filing need a separate write-docs
  pass. Scope remains readability, not ACL. `routine`/`agent` parent existence is
  not validated on `PATCH` (only `task`/`thread` are) — not client-reachable today
  and the no-FK design already permits a dangling parent, so left open rather than
  fixed here. The status badge renders the design-system tone word (e.g.
  "Healthy") rather than the status label — pre-existing, not introduced by this
  item. The harness lane that proves agent materialisation has no CI job by
  design and depends on local CLI credentials, so nothing mechanically reruns it
  after this ships.
