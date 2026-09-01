# One way to attach knowledge to anything

**Phase 1 of two.** This item builds the single attachment mechanism. Phase 2
(`.pipeline/work/artifacts-become-knowledge/`) kills artifacts and puts produced
content on it. Nested knowledge waits for this to land, then builds the tree on
top.

## Seed — the founder's framing

> Maybe we should unify this to a single pattern? Something that makes it
> reusable for other cases?

> Our scope is now basically make those cases knowledge which are still custom
> stuff. Building on what already happened.

Anything custom that should be knowledge becomes knowledge, on one mechanism.

## Where this came from

Three different mechanisms currently say "this knowledge item belongs to that
entity", all added within the last few weeks:

| Mechanism | Used by | Shape |
|---|---|---|
| FK pointer on the entity | routine prompt | `routines.prompt_knowledge_id` (BA9f, `7aea1084e`) |
| Scope + role reverse lookup | agent identity | `role='agent_file'`, `scopeKind='user'`, `scopeId=<agentId>` (`knowledge-repository.ts:1339`) |
| Parent slot | planned, unbuilt | `parentKind` + `parentId` (nested knowledge) |

BA9 established the direction — a routine's prompt and an agent's identity are
knowledge, not bespoke columns. This finishes that thought with one mechanism
instead of a third.

## The shape (agreed)

`parentKind` + `parentId` + `role`.

- **parent** — which entity it hangs off.
- **role** — what it *is* to that parent. `ordinary` means one of many; a named
  role means the singular slot.

Role is the piece the parent slot was missing: a routine has exactly one prompt,
an agent exactly one identity, but a task has many knowledge items. Parent alone
cannot express "the prompt of this routine".

Known costs: `role` carries a DB CHECK pinned to four values
(`framework/db/src/schema.ts:866`) that has to open; `routines.prompt_knowledge_id`
is deleted rather than kept.

Refined below into three fields with one job each — see "Three fields, three
questions". Role's meaning was sharpened during refine from "what it is to its
parent" to **where it lands in the session**, which is the definition that also
covers roles with no parent.

## Agreed in refine

### Scope: the two real attachment cases

Only two things today attach a knowledge item to an entity as its content:

| Case | How it attaches today |
|---|---|
| Routine prompt | `routines.prompt_knowledge_id` — an FK column on the routines table |
| Agent identity | `role='agent_file'` + `scopeKind='user'` + `scopeId=<agentId>` |

**Skills and rules are NOT attachment.** They are ordinary knowledge with a
materialisation role and no parent (`context.ts:868`). Only `agent_file` carries
a binding.

**Excluded, deliberately:** `tasks.sourceKnowledgeItemId` points the other way —
the knowledge item a task was promoted *from*, not content the task owns. The
four satellite tables (edit log, access log, conflicts, projection) are records
*about* an item, not attachment.

### `role` = where the item lands in the session

Founder call, verified in code. Role is not about sandbox files — it is about
where the item lands in the session, which is broader:

| role | Lands as |
|---|---|
| `ordinary` | `knowledge/` files in the sandbox |
| `skill` | the harness's skills directory |
| `rule` | `knowledge/rules` |
| `agent_file` | the "## Identity" section of AGENTS.md |
| `prompt` | the run's instruction |

`prompt` fits that definition, so it is a role and **no new field is needed**.
Verified: the routine prompt resolves into the session's context bundle as the
instruction the run executes (`layers/core-api/routine/src/routine-service.ts:545`).

So the mechanism is two axes with one job each: **`parentKind` + `parentId` says
where it hangs; `role` says where it lands.**

Cost: the `role` CHECK constraint pinned to four values
(`framework/db/src/schema.ts:866`) has to open.

### This fixes a convicted ownership violation, not just untidiness

BA9g moved plugin provenance out of `users.plugin_id` and `routines.plugin_id`
into `plugin_contributions`, calling those columns **"table-ownership violations
wearing a column — provenance the PLUGIN service owns, sitting in tables it does
not"** (`framework/db/src/schema.ts:1246`). `routines.prompt_knowledge_id` is the
same shape: a column on the routines table describing a knowledge relationship.
Moving it onto `knowledge_items` puts it in the owning service's table.

BA9g is also the precedent for the whole exercise — provenance had been recorded
seven different ways before it was unified.

### The full parent vocabulary ships in phase 1

`parentKind` is built as `knowledge_item | task | thread | routine | agent`.
Phase 1 uses `routine` and `agent`; the other three are declared so phase 2 and
nested knowledge do not each have to reopen the column and its CHECK constraint.
This is the point of going first — the enum is the foundation being handed over,
and shipping a partial one would leave nested knowledge doing the very change
they were told to stand down on.

### A parent is not content

Founder call. Parenting a knowledge item to a thread hangs it off the
conversation; it does **not** make the conversation a file. A thread transcript
is never materialised into `knowledge/`.

The reason is mechanical, and was verified: `knowledge/` has no read-only
concept. The sandbox prompt tells the agent those files are editable
(`context.ts:361`), and `handleCreate` turns **any** file an agent writes there
into a knowledge item (`writeback-processor.ts:216`). A transcript in that
directory would be editable, and an edit would write back into an item.

Threads are not materialised today at all, so this is a rule to hold, not a bug
to fix. **If a conversation is ever wanted as agent context, it lands outside
`knowledge/` in a zone that is read-only** — which does not exist yet and would
be its own piece of work.

### Found while checking: `handleCreate` has no parent

`handleCreate` writes `layer: "L1"` and a `kind` inferred from the subdirectory —
**both of which are being deleted** by the nested-knowledge strand — and sets no
parent at all. An agent-created file therefore has no home under the new model.
Giving it one (the session's task) is phase 2's job, but it is named here because
it is the seam between this mechanism and the agent path.

### Three fields, three questions

| Field | Question it answers |
|---|---|
| `parentKind` + `parentId` | where it hangs |
| `role` | where it lands in the session |
| `scope` | how far it reaches |

**`scope` stays stored on the item — it is not derived from the parent.** Scope
is not UI visibility; it is the materialisation reach filter. Verified: session
assembly builds exactly `scopeKind='factory'` (global) OR
`scopeKind='team' AND scopeId=<teamId>` OR `scopeKind='user' AND scopeId=<agentId>`
(`layers/core-api/knowledge/src/session-knowledge-assembler.ts:344`) — global plus
your team plus your user context.

Three reasons not to derive it:

1. **They are different questions that coincide in one case.** For agent identity
   `parent=agent:X` and `scope=user:X` encode the same id, but that is a
   coincidence of that case. An item parented to a task could reasonably be
   team-wide or private; the parent does not say which.
2. **Deriving costs a hot path.** The reach filter is a flat indexed predicate
   over two columns today. Derived from the parent it would need joins across
   five parent tables on every session assembly.
3. **It makes scope a real choice for the first time.** Today `scopeKind='user'`
   is *forced* onto an agent identity by the binding mechanism — a team-visible
   identity is not expressible. Moving the binding to `parentId` frees scope to
   answer its own question.

Migration consequence, accepted: each existing agent identity needs a real scope
rather than an inherited one. Default to `user` — identical reach to today, no
behaviour change — and let it be widened deliberately later.

## How it behaves

### The governing model

Founder's framing, and it supersedes the piecemeal navigation rules this section
used to carry:

> general knowledge, skills, agents, routine prompts, tasks, … accessible from
> their respective lists where they can also be created & deleted but they are
> all knowledge items and are read & updated via the knowledge item content view.
>
> the navigation in the knowledge list is just the knowledge list for general
> knowledge.
>
> a plugin can create & update any of those like a human or an agent could.

Three rules follow.

**1. Lists own create and delete. The knowledge content view owns read and
update.** Each type has its own list — general knowledge, skills, rules, agents,
routines, tasks. You create and delete from the list. You click through to the
ordinary knowledge content view to read the thing and edit its body. There is no
bespoke editor per type, and no create flow inside the knowledge view.

**2. The knowledge list shows general knowledge only.** Items with a role or a
parent are reached from their own list, not by browsing knowledge. This is what
keeps the knowledge navigation clean, and it is why removing skills and rules
from it is safe rather than a loss.

**3. Human, agent and plugin have identical power.** A plugin is a batch of edits
a human could make one at a time — not a privileged author. Anything a plugin can
create or update, a person and an agent can too, through the same paths. This is
the same parity rule already agreed for human and agent.

### What that means concretely for this phase

- **`role` is set at creation, never edited on the document.** Creating a skill
  writes `skill`; a rule writes `rule`; creating an agent gives its identity
  `agent_file`; creating a routine gives its prompt `prompt`. The role selector
  is removed from the knowledge view entirely.

  This reverses the *mechanism* BA9e chose (`4f647e34e`, role as an editable
  metadata field) while keeping the problem it solved. BA9e's real finding was
  that the plugin installer was the only writer of `role`, making plugins a
  special kind of author. That stands — rule 3 above is the same point. Only the
  place it lives moves: to each type's create flow.

- **The skills and rules surface gets create and delete, not only a list.** That
  is the human-side equivalent of the plugin's batch, and it is what makes
  removing the role selector safe.

- **Skills and rules leave the knowledge navigation** in the same change. Global
  search still finds them by text (`scope=knowledge`,
  `layers/core-api/src/routes/search.ts:98`), so nothing becomes unreachable.
  Filtering *by role* is a registered follow-up
  (`.pipeline/work/knowledge-role-scope-filtering/`), not a blocker.

- **Two defects the architecture critique found are closed by rule 1**, not by
  extra guards: a person could have changed a routine prompt's role away from
  `prompt` (the routine then silently runs on its name), or promoted an ordinary
  note into a stray `prompt`. Neither is reachable once role is not an editable
  field.

- **The knowledge tree is still not this phase's job.** What the tree shows is the
  nested-knowledge strand's to implement against the parent column this phase
  creates. Phase 1 builds the column and the lists; it does not restructure the
  tree.

- **Not in this phase:** the full agent section in the nav (agents, skills, rules,
  routines as a navigation group). Placement of the skills/rules list is a
  build-time choice — `SettingsAgents` / `SettingsAgentBehavior` is the closest
  existing neighbour, since it already groups agent, skill, routine, tool and MCP
  rows.

### Deleting a parent deletes its knowledge

Founder call: when a routine, agent or other parent is deleted, its parented
knowledge items are deleted too. Chosen deliberately as the easy option **because
there is no UI for orphaned knowledge items** — an orphan would be invisible
clutter nobody can find or clear.

This is a change from today, where `routines.prompt_knowledge_id` is a real FK
and a routine's prompt is protected by it. Accepted: the parent column has no FK
by design (it points at five tables), so nothing enforces this at the database
level and it has to be done in application code.

**Ownership constraint on how that is built.** The routine service may not write
`knowledge_items` — that table belongs to the knowledge service, and BA9g
convicted exactly this shape as "a table-ownership violation wearing a column".
So the cascade cannot be a delete statement inside the routine service. It has to
be composed where both services already meet (the route), or expressed as a
knowledge-service operation the parent's service calls through an injected port —
the same way `getKnowledgeBody` and `getAgentIdentity` already reach knowledge
from the routine resolver.

**Settled: archive, using the API that already exists.** A hard delete is
impossible — `knowledge_edit_log`, `knowledge_access_log` and
`knowledge_conflicts` all hold `onDelete: "restrict"` FKs on `knowledge_items.id`
(`framework/db/src/schema.ts:878`, `:908`, `:926`), deliberately, so an agent can
never wipe its own authored history. Founder: if deleting is not possible it does
not matter, so long as it stops showing up.

`setKnowledgeStatus(exec, ids, "archived")` is that operation. It is already
exported from the knowledge package
(`layers/core-api/knowledge/src/knowledge-repository.ts:1441`) and already called
from the routine DELETE route (`layers/core-api/src/routes/routines-routes.ts:345`),
which archives a prompt for exactly this reason. **No new port is needed** — the
seam exists and governance permits it, since the call is composed at the route
where both services already meet rather than inside the parent's service.

Archived items are excluded from session assembly (`status='active'` predicate)
and from the knowledge surfaces, so archiving delivers the intent.

Known gap, accepted: there is **no un-archive path in the UI**. A parent deleted
by mistake leaves its knowledge recoverable in the database but not through the
app. Revisit if orphaned-item management ever gets a surface.

## Status

**Refine COMPLETE.** Scope, mechanism, role semantics, parent vocabulary, the
parent-is-not-content rule and the three-field split are all agreed.

**Program design in progress.**

Migration numbering: main is at `0076_BB1_one_work_primitive.sql`. Take 0077+.
