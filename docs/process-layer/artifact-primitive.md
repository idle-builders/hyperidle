# Artifact

**An artifact is a knowledge item that hangs off the thing that produced it.**

There is no artifacts table, no separate content model, and no second lifecycle.
An artifact is the ordinary knowledge item every other part of the system already
knows how to store, version, scope, edit and discuss — carrying a parent that
says *where it came from*: the task it was produced in, or the conversation it
was produced in.

The word stays because people use it. What it names has changed: it is a stage a
knowledge item is at, not a different kind of thing.

## Why the second table went

An artifact used to be a receipt: `id`, `producing_task_id`, `kind`, `label`,
`preview_json`, `created_at`. No body. No status. No version. No scope. No
history. It could not exist without a task, it was never edited, and its whole
content lived in an untyped JSON preview column.

A knowledge item is a document: scope, title, markdown body, status, version,
role, an edit log, an access log, and a place in the knowledge tree.

They were the same thing at different stages of being kept. Modelling that as two
tables bought a receipt that could never grow into a document, and a document
that could never be produced by a task. Removing the second one closes the
product thesis: everything is a thread, a task, or a knowledge item.

## The shape

An artifact is a row in `knowledge_items` (`framework/db/src/schema.ts`) where
the parent slot points at a task or a thread:

```
parent_kind = 'task'   + parent_id = <task id>     # produced while working
parent_kind = 'thread' + parent_id = <thread id>   # produced in a conversation
```

The parent slot carries no foreign key — it can point at five different tables —
so existence is confirmed at the API boundary by the service that owns the
parent's table: `work` for a task, `conversation` for a thread. A half-named
parent (a kind with no id, or an id with no kind) is refused.

Only `task` and `thread` may be named by a client. The other parent kinds
(`knowledge_item`, `routine`, `agent`) are written exclusively by core-api's own
routes, which already hold the parent row for other reasons — so nothing outside
can forge a routine's prompt or an agent's identity.

## Content is markdown. There is no preview column.

The body is the content. Every kind an artifact used to have is expressible as
markdown, and the block layer already derives them: an image item's body is an
image, a code item's is one fenced block, a data item's is one table.

**An interactive HTML artifact stores its content as a fenced ` ```html ` block.**
This is not cosmetic. Measured against the real `deriveBlocks`: a realistic
self-contained HTML document placed raw in a markdown body derives to *six*
blocks and mis-parses a chunk of CSS as a paragraph, leaving `</style>` as
literal text — CommonMark terminates HTML blocks at blank lines. Fenced, it
derives to exactly one `code` block with `lang: "html"`, and the text comes back
byte-identical.

The deciding argument against a payload column was the file watcher. A
payload-backed item could only ever be made through an API call, never by writing
a file, which would split the system into file-backed and payload-backed items
forever.

**Kind is derived, never stored.** An item's kind is a property of its blocks,
computed at render, the same way blocks themselves are. There is no `kind` column
and no stored discriminant.

## How one gets made

Three ways, and they produce the same row.

- **An agent calls `create_artifact`** with a title and a markdown body. The
  parent is taken from the agent's own context and never passed as input: the
  task it is working in, or the conversation it is answering in. Neither is an
  error — a produced item must belong to something.
- **An agent writes a file** into `knowledge/` in its sandbox. The writeback path
  turns it into a knowledge item parented to whatever the session is working on,
  read from the session's own row.
- **A human clicks "+"** on a block and sends it. That puts a knowledge item into
  the conversation, parented to the thread.

The last one is the point of the design: **a human and an agent put something
into a conversation the same way, and the result is the same row.** That is the
parity requirement, not a nice-to-have.

## Where one shows up

- A **task-parented** item appears on that task, and never in the knowledge tree.
- A **thread-parented** item appears in that conversation, and never in the
  knowledge tree.
- Clicking either opens it in the split view, rendered through the same body path
  a knowledge item's own page uses — so an interactive one runs in the sandbox
  frame there too.

Keeping produced items out of the tree is what stops the tree filling with
per-task residue.

**Thread-parented items are leaves.** A thread can be hosted on a knowledge item
and a knowledge item can be parented to a thread, so `item → thread → item` is
expressible. The cycle is made *inert, not illegal* — forbidding it would forbid
an item hosting a thread that produces an item, which is the use case. Every tree
walk stops at the first non-knowledge-item parent, so a thread-parented item has
no ancestors and inherits nothing.

## Graduating into the knowledge tree

Giving a produced item a knowledge-item parent is how it becomes part of the
team's knowledge rather than residue of one task.

This is a **narrow, dedicated transition**, not an editable field. The parent is
create-only everywhere else, deliberately: otherwise a person could repoint a
routine's prompt or an agent's identity at something else. Graduation is allowed
only when the item's role is `ordinary` and its current parent is a task or a
thread, and only onto a knowledge item that exists — or onto nothing, meaning the
top of the tree.

**Provenance lives in that transition's history.** There is no `producing_task_id`
column any more, and none is wanted: `parent_id` means where an item sits, not
where it came from. Graduating overwrites it — but the update path logs old and
new values per field, so the original task id survives as that edit-log entry's
`oldValue`. Looking for provenance means reading history, which is the natural
place to look, and it is the *only* place it is kept.

## Status and role

A produced item is created with role `ordinary`. Its status is the ordinary
pre-validation draft state — produced, not yet vouched for — which is exactly
what an artifact always was.

## What "artifact" may and may not name

The word names produced content. It does not name a storage concept. Enforced by
`artifact-is-not-a-storage-concept` in `tools/governance/`, which bans the
identifiers of the old model — a table, a row type, a route, a stored kind, a
stored preview, a pointer to a row — rather than the word itself.

That distinction matters: `artifacts:` remains a live key in several unrelated
shapes that all survive (the handoff filename array, the review canvas, review
composition, the core-api port client). A rule that banned the word would need a
carve-out for each of them, and a carve-out is the thing that gets widened later.

Separately, a **review canvas artifact** is a different concept that merely shares
the word — a UI evidence envelope on a review, with its own nine-value
vocabulary. It is untouched by any of the above.
