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

## Status

**Refine in progress.** Nothing below the seed is agreed yet.

Migration numbering: main is at `0076_BB1_one_work_primitive.sql`. Take 0077+.
