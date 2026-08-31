# Binding a knowledge document to a specific agent

Written for the parallel knowledge-structure refactor. Everything below was
checked against the running packaged desktop app, not read off the source.

## Short answer

It is **not a bug**. The binding exists, it works, and BA9 depends on it. But
`user` scope currently means two unrelated things depending on the document's
role, and only one of them reaches an agent. That overload is the thing worth
fixing in the refactor.

## How a document is bound to an agent today

`scopeKind = 'user'`, `scopeId = <the agent's id>`. That is the whole mechanism.
There is no separate agent-binding column or table.

Three things write it:

- creating an agent — its identity document is written bound to it
- installing a plugin — each contributed agent's `identity` file becomes an
  `agent_file` document bound to that agent
- `PATCH /api/knowledge/:id` with `{ scopeKind: "user", scopeId: "<agentId>" }`

The third was verified live: a `factory` document was re-bound to a
plugin-contributed Builder and came back `scopeKind=user scopeId=pa_bd0be…`.
Nothing rejects it, and nothing special-cases "is this id a human or an agent".

## The overload

`session-knowledge-assembler.ts`'s `fetchCapabilityItems` filters
`ne(role, "ordinary")`. So a document bound to an agent reaches that agent's
session **only when its role is `skill`, `rule` or `agent_file`**.

Bind an `ordinary` document to an agent and it reaches nobody:

- it is not a capability item, so the session assembler skips it
- it is user-scoped and ordinary, so `visibleToViewer` treats it as *private to
  its author* — it disappears from every other person's knowledge list too

Verified: a document created as `kind: pattern` (role `ordinary`) and bound to
the Builder is invisible to the Builder's sessions and to everyone but its
author. It is not an error state — it is a document that exists and reaches no
one.

So `user` scope is read two ways:

| role | `user` scope means | who sees it |
|---|---|---|
| `ordinary` | a person's private note | only `updated_by` |
| `skill` / `rule` / `agent_file` | bound to this agent | that agent's sessions |

The same two columns, two unrelated meanings, disambiguated by a third column.

## The UI gap

`SCOPES_REQUIRING_ID` is `{product, practice, team, bet, task}` — `user` is not
in it. So when a person picks **Private** in the create or scope-change dialog,
no id field appears and the server derives `scopeId` from the actor.

There is no way from the interface to bind any document to a chosen agent. The
capability the API has is unreachable by a human. Everything bound today was
bound by agent creation or plugin install.

## What the refactor should decide

1. **Split the meaning.** "Private to a person" and "bound to an agent" should
   not be the same scope kind. Once they are separate, `visibleToViewer` and
   `fetchCapabilityItems` stop needing `role` to tell them apart, and both
   predicates get simpler rather than more careful.

2. **Decide whether an ordinary document may be agent-bound at all.** Either it
   reaches that agent's sessions (drop `ne(role, "ordinary")`, and then decide
   how it is ranked and budgeted — capability items deliberately bypass ranking,
   ordinary ones must not), or binding one is refused at the API instead of
   silently producing a document nobody can read. Today it is neither.

3. **Make the binding reachable.** An agent picker on the scope dialog, not a
   free-text id field. This only matters after (1) and (2) — offering a binding
   that silently does nothing would be worse than not offering it.

4. **Keep the identity document exactly as it is.** BA9 proved the whole chain
   live: a `role-personas` Builder's `agent_file` document reached the session
   sandbox as the `## Identity` section of AGENTS.md, and the agent then did
   real work. Whatever replaces `user` scope must keep that path intact — it is
   how every plugin-contributed persona works now that the `system_prompt`
   column is gone.

## Not in scope here, but adjacent

`agent_file` and `skill` documents bypass ranking on purpose: installing a
plugin is a deliberate act, so its capabilities are always present rather than
competing for attention budget. If the refactor unifies ranking across roles,
that exemption has to survive it or plugin skills start dropping out of sessions
under budget pressure.
