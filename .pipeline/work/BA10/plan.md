# BA10 — Role and scope are editable on any knowledge document

## What we need

**Why this exists.** A skill, a rule and an agent file are meant to be ordinary knowledge documents
that happen to carry a role, editable like any other. Today none of them can be authored: a person
cannot write a skill, cannot promote an existing note into one, and cannot decide who a document
reaches. The only writer of a role is the plugin installer, so a capability exists only if a plugin
brought it — which makes the plugin a special kind of author rather than one writer among several.
The cost of not doing it: the knowledge view is the product's stated home for this material and
cannot express it, and every future capability has to arrive as a plugin.

**What exists today.** `knowledge_items` carries `role` (`ordinary` | `skill` | `rule` | `agent_file`,
default `ordinary`) and `scopeKind` / `scopeId`, and the schema's own note already describes the
intended behaviour for each role. Context assembly reads all four and materialises them per role, and
the session assembler already resolves reach as factory / team / agent. So the read side is built and
proven — a factory-scoped skill reaches a team agent and a team-less one alike, a team-scoped one
reaches only that team, and an agent-bound one reaches only its agent.

**Missing delta.** The write side. `createKnowledgeSchema` has no `role` field and
`updateKnowledgeSchema` cannot change `role`, `scopeKind` or `scopeId`. Nothing anywhere writes
`scopeKind: 'user'`, so the agent binding the reader supports has no producer at all. No `.tsx`
references `skill`, `rule` or `agent_file`, and the knowledge view offers no role or scope control.
This item makes role and scope ordinary editable fields, through the API and in the knowledge view,
including binding a document to a single agent.

**Depends on.** None.

**Dials (provisional).** complexity: feature · ambiguity: established context · exposure: user-facing
surface

## How it works

## How we work on this

## Confusions

## Proposed items
