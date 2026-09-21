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

## How we work on this

**Confirmed in interview 2026-09-20/21** — five rulings, recorded in `facts.md`: no conflict
object; merge and split removed; rename everything except the sidebar word; memory and artifact as
words on edit; a memory is for its writer and the agent's owner.

**Dials.** complexity: suite · ambiguity: established context · exposure: public contract.

**Order.** Architecture written against `facts.md`, then one critique — it paid on both earlier
items. The build is cut into small chunks from the start: each owns its paths, implements one
block of the architecture, writes its failing test first, runs one check, makes one commit with
named paths. Order: declaration and module with its seam test → migration with a test on an old
database → neighbours re-pointed → agent side (tools, writeback, seam methods deleted) → screens →
deletions → the rename as its own mechanical wave → docs, plugin and personas. Full gates are their
own chunk. Then independent review in two passes (module and migration; agent side and screens);
every fix wave gets its own re-review.

**Gate, before ship.** The founder sees, in the packaged desktop app on the demo data: the
Knowledge section listing, opening, creating, editing, moving, archiving and triaging documents
through the list; a second window updating live; a stale edit refused with its reason; an agent
writing a memory and an artifact and reading a document through the three tools; the governance
rule green with the document entries gone from the legacy lists; the review findings; the line
count. Then retro and ship to a CI-green open PR. Nobody merges.

**Verification.** `npm run verify`, unit, service integration; the new document seam test driving
all three actions as an agent and as a human; a real-socket test for the nudge; the migration test
on a database from before this item; the harness lane locally once at the end because the tool list
changes; full e2e once for branch-only failures.

## Confusions

## Proposed items
