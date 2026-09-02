# Architecture critique — verdict FAIL (7 blockers)

Independent read, 2026-08-31, against the pre-rebase architecture. Recorded because
`architecture.md` §0 depends on it. Five blockers need a founder decision (§0 there);
two were mine to fix and are folded into the rewrite.

## Claims that came back FALSE or half-true

- **`list({exportable})` does not exist.** Reported as dead code to delete; it is only a
  stale doc comment (`knowledge-repository.ts:674`). No overload, no branch.
- **Practice knowledge is matched by *community*, not role.** Assembly calls
  `communityForRole` — `"builder"` → `"building"` — while seeded practice rows carry role
  ids (`builder`, `designer`, …). The primary L3 match therefore misses every seeded row
  already; only `computeRoleMatch`'s `scopeId.includes(agentRole)` fudge touches them, and
  only to re-rank. The capability the founder-approved stopgap preserves may already be
  largely inert, and the stopgap matches a **different string** than production does.
- **The debounce is trailing, not fixed.** Every event restarts the 500ms timer, so a
  batch is "everything until the agent goes quiet" — not "the two halves of a move".
- **Migration numbering was stale.** The worktree knew `0069`; main was at `0076`.

## Blockers

1. **What an agent receives is entirely layer-keyed and was never replaced.** → D1.
2. **Two cross-service reads the design needs are forbidden by table ownership** — team
   membership (`users`) for visibility, and parent existence (`tasks`, `threads`) for the
   security check. → D2, and resolved in §4 by validating outside the transaction.
3. **The agent-create path does not do what the plan's example says** — directories are
   never reported, and created items get no scope. → D4.
4. **Move pairing does not survive real agent behaviour** — a directory rename is N
   deletions and N creations, which never pairs; and the fallback is lossy, producing a
   duplicate row and orphaning the original's identity, status and history. → D3.
5. **Dropping the id suffix causes silent cross-item overwrite** — path→item resolves by
   first match. → D3.
6. **The promotion sweep's `(layer, topic, kind)` signature degenerates to matching every
   row**, mass-promoting the store. → fixed in §4.
7. **Invariant 2 is only guarded on parent writes** — narrowing a parent's scope violates
   it from above with no write rejected. → D5.

## Non-blocking, folded into the rewrite

Census gaps (`write_memory`'s layer-keyed permission gate, `query_practice`, the search
route, `routines-routes.ts`, two cross-package contracts, `KNOWLEDGE_SCOPES`,
`CONTEXT_ASSEMBLY_DIRS`); `scope_kind` has no CHECK to rewrite; migration ordering was
internally inconsistent (parented rows onto topic items created a step later); rows the
migration never mentioned (`role != 'ordinary'` items from `0068`/`0069`, archived and
needs_human statuses); in-flight baked payloads in `agent_work_intents`; the
ancestor-materialisation rule was placed in a component with zero database access; the
end-to-end evidence was aimed at the harness lane, which has no CI job; no visual gate was
booked for a visually novel surface.

## What the critique confirmed as sound

The obligations table adds no outcomes. The polymorphic-parent trade cites a real in-repo
precedent. The in-transaction rationale for the invariants is correct. The
`item → thread → item` inertness argument is right, and not adding a write-time check for
it is the correct call. Deleting the cross-scope repetition signal rather than
approximating it is honest. The refusal to let scope drift into being described as access
control was called the single most valuable paragraph in the document.
