# BC4 — Document as a module: search · open · edit

## What we need

**Why this exists.** The knowledge service is the largest package (4,441 lines, 26 public methods) and the most routes (15); merge, split, promote, conflict and status each have their own path and tool. The contract says one edit, and renames the object to *document* — the word users use.

**What exists today.** `layers/core-api/knowledge`, `routes/knowledge.ts` (1,053 lines) + `search.ts`; seven tools (`promote_knowledge · create_conflict_review · merge_knowledge · split_knowledge · run_knowledge_sweep · create_artifact · write_memory`); `knowledge_edit_log` and versions; the knowledge tree (`parentKind` over five primitives); context assembly (`session-knowledge-assembler.ts`) — a deliberate keep.

**Missing delta.** The `document` module with three actions; the rename knowledge item → document across schema, code and UI in this one change; tree and parent kinds kept; merge, split, status, promote, conflict as fields of edit with invariants; versions and the edit log folded into `changes`; context assembly becomes the read model `document.search` returns to the session baker. Deletes the package, the routes, the seven tools, the hooks.

**Depends on.** BC3 — document's conflict opens a review thread; lands with thread already a module.

**Dials (provisional).** complexity: suite · ambiguity: established context · exposure: public contract

## How it works

This item copies the pattern from task and thread onto document, the largest package, and renames
knowledge item to document everywhere in the same change.

**One list.** A document module exports three actions — search documents, open a document, edit a
document — each as a name, the sentence an agent reads, the shape of its input, the invariants, and
what it does. Nothing else about documents is public. Today the same knowledge is spread over a
30-export package, eleven routes, six agent tools over an HTTP hop to the same process, seventeen
raw fetches and four hand-copied shapes in the UI.

**Edit is the only write.** Edit takes a partial: title, text, status, scope, parent, position;
without an id it creates. The module loads the document, applies the partial, runs the invariants
over the whole resulting document (does the parent exist and make no cycle, is a named slot free,
does a narrower scope fit the children, may this actor see and change it), and returns failures as
a list of problems. On success the document and one row in `changes` land in one transaction —
`document.created` or `document.changed`. That row is the event and the history; the edit log and
the access log are dropped. Validate, reject, archive, restore, move, change scope and "graduate a
task's output into the tree" are all plain fields of this edit.

**Two people at once.** An edit may carry the version it read. If someone saved in between, the
edit is refused with one problem — "changed since you read it, open it again and retry". With no
version, last write wins. Same rule as edit a task. There is no conflict object: the conflicts
table, the conflict tool and the block it put on promotion go.

**Memory, artifact, document.** Agents know these words, so edit takes `as: memory | artifact |
document`. A memory is private: its writer reads and edits it, and so does the person who owns the
agent that wrote it; it returns in the writer's next sessions. An artifact is output shared with
others: attached to the task or thread being worked in, the server fills the task from the session.
A document lives in the knowledge tree. Search and open take the same word. The tools
`write_memory` and `create_artifact` go; the task and thread pages keep their "Artifacts" section.

**Two reads.** Search is one filtered list (text, scope, status, parent, kind of slot, `as`) backed
by one read model; the list page, the sidebar, the parent picker, the settings list of skills and
rules, the artifacts section and triage all use it. Open returns the document with its path, its
children and its siblings. For the first time agents get both as tools — today they can only read
what was written into their sandbox at session start.

**Usage is counted for real.** A document carries how often and when it was last opened, and how
often and when it was last handed to an agent at session start. Search can filter and sort by them
("not used for 90 days"). The side table with ranking numbers goes; its two live values (confidence,
tags) move onto the document. The knowledge-management plugin's decay routine has its librarian
search for documents unused for a while and archive them with a plain edit. Citations are not
counted until something cites.

**Narrowing the audience cascades.** Making a document narrower narrows its wider children with it,
in the same transaction, one change row per child, same actor.

**Context for a session stays.** Picking and ranking the documents an agent starts with is a
deliberate construct and is kept: it becomes a read model inside the document module that the two
run resolvers call. Files written into the sandbox, and edits to those files flowing back, stay as
they are; the writeback calls edit a document, as the agent, with the version it was given.

**Removed because unused or replaced.** Merge and split (an edit plus an archive, done in two
steps by anyone). The two sweeps (bound, never called). The status-promotion tool (a status edit).
The ten document methods left on the agent seam. The fixture file the detail page falls back to.

**Neighbours.** Agent identity files, routine prompts and plugin-contributed skills and rules are
documents in named slots. Until their own items land, the agent, routine and plugin routes call
search, open and edit in-process as the same actor; task and thread swap their narrow reads of the
old package for open a document. The librarian plugin and the role personas are rewritten to name
the three actions.

**Screens follow, not rebuilt.** The list, detail, create, move, scope and settings screens call
the list through `call`, read the shared invariants to grey a control with its reason, and refresh
on a websocket nudge from the change row like threads do. URLs become `/documents`. Every label
says document; the sidebar section stays "Knowledge".

**The rename.** Tables, columns, ids in code, the thread host kind and the parent kind
(`knowledge_item` → `document`), events, packages, files, tests, docs. One destructive migration;
old migration files are left alone.

**Rejected.** A conflict that opens a review thread (conflicts are rare once documents sync; a
refused stale edit is enough). Merge and split as fields of edit. Keeping `write_memory` and
`create_artifact` as tools beside edit. Memories open to the whole team.

**Left simple.** One transaction per edit. No version history screen — the change rows hold it if
one is ever wanted. Statuses stay `proposed · active · stale · archived`; nothing sets stale but an
edit. The cross-object search box keeps its route until the user module; its document part calls
search documents.

## What was decided along the way

- A memory is a private note with no parent and an ordinary slot; a person's private document in
  the tree is a document and can be widened to the team or everyone later. The list keeps a
  "Private" pill and a separate "Memories" filter. A memory asked for a scope is refused with a
  reason, never silently kept private. A root document cannot be scoped "Private" from the dialog.
- The pure rules key on what the row already is, not only on the word in the edit: a memory
  given a team scope and an existing artifact made private are both refused. Moving an artifact
  into the tree ("graduation") stays a plain parent change.
- Only the server attaches a document to an agent or a routine; a person or an agent gets a plain
  refusal. In-process callers carry an internal flag no transport can set.
- A search by parent must name one id or a list of ids; a parent kind alone is refused, so the
  artifact exemption from the audience filter can never list every team's output.
- The path shown on open stops at the first parent the viewer may not read.
- A neighbour never calls a document action from inside its own open transaction (PGlite has one
  connection; it hangs). Task and thread lookups for an edit run before the transaction opens.
- The scope cascade narrows wider children in the same transaction with one change row each; it
  never turns a child into a memory. Widening never cascades.
- Reads count only through open; every internal read is a search. Session use is counted where the
  starting documents are picked, inside the caller's transaction when there is one.
- Plugin documents installed at team scope get one copy per team (the id carries the team);
  factory installs keep their ids.
- `/auth/me` carries the user's team so Team scope can be chosen; the demo founder is on the Acme
  team and the demo assistant's placeholder session is seeded finished.
- Rename everywhere except: the sidebar section "Knowledge" and its view id, the agent's sandbox
  folder `knowledge/`, the `knowledge_action` session family, old migration files, and the word
  where it means the place. The misplacement-ledger governance rule was deleted with its last
  entry, as its own text prescribes.

## Accepted limits and what is left

- A page left open on a busy document counts a read on each live refresh; the decay routine keys
  on dates, not counts.
- Reinstalling a plugin for one team can drop another team's copy from that plugin's registry
  (the registry has no team column); the document itself is untouched. Platform item.
- If the migration meets a malformed JSON message row it stops and names the row.
- A routine cannot react to a document change until subscriptions read the change rows.
- The plugin-detach hook is a plugin word inside the document module's deps until the platform
  item removes it. The setup route and the scheduler build their own small document-action wiring
  instead of receiving the app's list.
- Nothing cites a document yet, so there is no citation count.
- Two chips from the previous item still stand: the unreachable session viewer on the conversations
  page, and a hung agent start blocking other agents' turns.
