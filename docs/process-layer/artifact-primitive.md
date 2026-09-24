# Artifact

**An artifact is a document that hangs off the thing that produced it.**

There is no artifacts table, no separate content model, and no second lifecycle.
An artifact is the ordinary `documents` row every other part of the system already
knows how to store, version, scope, edit and discuss — carrying a parent that
says *where it came from*: the task it was produced in, or the conversation it
was produced in.

The word stays because people use it. What it names has changed: it is a stage a
document is at, not a different kind of thing — `as: "artifact"` is derived from
the row on read, never stored as its own column (see [the canonical store](../knowledge-architecture/the-canonical-store.md#what-the-caller-calls-it-as)).

## Why the second table went

An artifact used to be a receipt: `id`, `producing_task_id`, `kind`, `label`,
`preview_json`, `created_at`. No body. No status. No version. No scope. No
history. It could not exist without a task, it was never edited, and its whole
content lived in an untyped JSON preview column.

A document is: scope, title, markdown body, status, version, slot, and a place
in the document tree, with every create and edit recorded as a `changes` row.

They were the same thing at different stages of being kept. Modelling that as two
tables bought a receipt that could never grow into a document, and a document
that could never be produced by a task. Removing the second one closes the
product thesis: everything is a thread, a task, or a document.

## The shape

An artifact is a row in `documents` (`framework/db/src/schema.ts`) where the
parent slot points at a task or a thread:

```
parent_kind = 'task'   + parent_id = <task id>     # produced while working
parent_kind = 'thread' + parent_id = <thread id>   # produced in a conversation
```

The parent slot carries no foreign key — it can point at five different tables —
so existence is confirmed at the API boundary by the service that owns the
parent's table: `task` for a task, `thread` for a thread. A half-named parent
(a kind with no id, or an id with no kind) is refused.

Only `task` and `thread` may be named by a client via `edit_document`'s `parent`
field. The other parent kinds (`document`, `subscription`, `agent`) are written
exclusively by core-api's own composition, which already holds the parent row
for other reasons — so nothing outside can forge a subscription's prompt or an
agent's identity.

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

- **An agent calls `edit_document`** with `as: "artifact"`, a title, and a
  markdown body. The parent is stamped from the agent's own calling context —
  the task it is working in (checked first), or the conversation it is
  answering in — and can never be passed as input: `parent` targets only
  `task | thread`, and an artifact create with no calling task or thread
  refuses with `artifact_no_parent`.
- **An agent writes a file** into `knowledge/` in its sandbox. The writeback
  path turns it into a document, calling `edit_document` as the session's own
  agent, parented to whatever the session is working on, read from the
  session's own row.
- **A human clicks "+"** on a block and sends it. That puts a document into
  the conversation, parented to the thread.

The last one is the point of the design: **a human and an agent put something
into a conversation the same way, and the result is the same row.** That is the
parity requirement, not a nice-to-have.

## Where one shows up

- A **task-parented** document appears on that task, and never in the document tree.
- A **thread-parented** document appears in that conversation, and never in the
  document tree.
- Clicking either opens it in the split view, rendered through the same body path
  a tree document's own page uses — so an interactive one runs in the sandbox
  frame there too.

Keeping produced documents out of the tree is what stops the tree filling with
per-task residue.

**Thread-parented documents are leaves.** A thread can be hosted on a document
and a document can be parented to a thread, so `document → thread → document`
is expressible. The cycle is made *inert, not illegal* — forbidding it would
forbid a document hosting a thread that produces a document, which is the use
case. Every tree walk stops at the first non-`document` parent, so a
thread-parented document has no ancestors and inherits nothing.

## Moving into the document tree

Giving a produced document a `document` parent is how it becomes part of the
team's knowledge rather than residue of one task. There is no dedicated
"graduate" route or edit type — it is an ordinary `edit_document({id, parent:
{kind:"document", id:<target>}})` move, the same call that reparents anything
else, checked against the same tree invariants (no cycles, scope no wider than
the new parent's). Once the parent is no longer a task or a thread, the
document's derived `as` reads back as `"document"` on the next open, with no
separate step to flip it.

**Provenance lives in `changes` history.** There is no `producing_task_id`
column, and none is wanted: `parent_id` means where a document sits, not where
it came from. Moving it overwrites `parent_id` — but the edit's `changes` row
carries the old and new value, so the original task or thread id survives as
that row's `before`. Looking for provenance means reading history, which is
the natural place to look, and it is the *only* place it is kept.

## Status and slot

A produced document is created with slot `ordinary`. Its status is the ordinary
pre-validation draft state, `proposed` — produced, not yet vouched for — which
is exactly what an artifact always was.

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
