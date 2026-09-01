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

## The proposed shape (to be tested in refine, not yet agreed)

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

## Status

**Refine in progress.** The three sections above are agreed. Parent vocabulary
and the fate of `scope` are still open.

Migration numbering: main is at `0076_BB1_one_work_primitive.sql`. Take 0077+.
