# Filter knowledge by role and scope

## Seed

Registered as a follow-up during the refine of `knowledge-attachment-slot`
(phase 1 of the knowledge unification). Founder call: *"Role and scope filtering
can be registered as a follow up workpackage."*

## Why it exists

The attachment-slot work makes a knowledge item's `role` decide where it lands in
a session, and moves items with a parent out of the knowledge navigation — you
reach a routine's prompt from the routine, an agent's identity from the agent.

That is only safe if those items stay **findable by search**. Today they are not
filterable at all:

- The knowledge list route filters on `topic` (`layers/core-api/src/routes/knowledge.ts`)
  — and `topic` is being deleted by the nested-knowledge strand.
- Global search (`layers/core-api/src/routes/search.ts`) has no `role` concept.
  Its only knowledge predicate is the auth boundary
  (`scope_kind != 'user' OR updated_by = userId`).

So "searchable by role or scope" is something to build, not something to preserve.

## Scope

Filtering knowledge by `role` and by `scope` in the list and in global search.

Nothing else. This does not touch the attachment mechanism, navigation, or the
knowledge tree.

## Dependency

Runs after `knowledge-attachment-slot`, which is what makes role a meaningful
filter axis and creates the need.

## Status

**Seeded, not refined.** Nothing here is agreed beyond the founder's decision to
register it.
