# Artifacts become knowledge items

The `artifacts` table and the separate content model behind it are deleted. What
an agent or a person produces is a **knowledge item carrying a parent** that says
what produced it: the task it was made in, or the conversation it was made in.
Giving it a knowledge-item parent later is how it graduates into the team's
knowledge tree.

## Why

An artifact was a receipt — `id`, `producing_task_id`, `kind`, `label`,
`preview_json`, `created_at`. No body, no status, no version, no scope, no
history. It could not exist without a task, was never edited, and its whole
content lived in an untyped JSON preview column. A knowledge item is a document:
scope, title, markdown body, status, version, role, an edit log, a place in the
tree.

They were the same thing at different stages of being kept. Two tables bought a
receipt that could never grow into a document, and a document that could never be
produced by a task. Removing the second closes the thesis: everything is a
thread, a task, or a knowledge item.

## The word survives — founder call, reversing this plan's own earlier decision

An earlier draft killed "artifact" outright and explicitly refused to keep it as
a view word. The founder reversed that: *"we keep the tool called artifact,
that's an established name by now — what's behind is just a knowledge item
attached to a task or whatever the context."*

So the criterion is a **boundary, not a ban**: the word may name produced content
— the `create_artifact` tool, the section on a task, the frame an interactive one
runs in — and may not name a table, a route, a stored kind, a stored preview, or
a pointer to a row. Enforced by `artifact-is-not-a-storage-concept`
(`tools/governance/`), which bans the old model's SYMBOLS rather than the word,
because `artifacts:` remains a live key in five unrelated surviving shapes (the
handoff filename array, the review canvas, review composition, the core-api port
client, the threads write arm) and a carve-out for each is what gets widened
later. Committed deliberately red at 145 violations, then driven to zero.

Separately, a **review canvas artifact** is a different concept sharing the word.
It survives untouched, as does `AnchorRef.artifactId`, which points at one.

## What landed

- **The parent slot is reachable and validated.** `POST /api/knowledge` accepts
  `parentKind` + `parentId`, refuses a half-named parent, and confirms existence
  through the service that owns the parent's table (`work` for a task,
  `conversation` for a thread — both already imported there). Only `task` and
  `thread` are client-writable; `knowledge_item`, `routine` and `agent` stay
  internal, so nothing outside can forge a routine's prompt or an agent identity.
- **`create_artifact` writes a knowledge item.** Input is `title` + markdown
  `body` — no kind, no label, no preview. The parent comes from context and is
  never an input: `ctx.taskId`, else `ctx.threadId`, else an error.
- **Agent writeback works and parents its output.** It never had: it sent no
  `scopeKind` and a status the route rejects, so no agent had ever produced a
  knowledge item by writing a file. A written-back item now hangs off the
  session's own task or thread, read from the session row.
- **Graduation.** A narrow transition, not an editable field — the parent is
  create-only everywhere else on purpose. Allowed only for an `ordinary` item
  whose parent is a task or thread, onto a knowledge item that exists or onto
  nothing. It writes the edit-log entry that provenance now depends on.
- **Interactive artifacts render.** A knowledge item whose **only** derived block
  is a fenced ```html block runs in the AZ6 sandbox frame. One alongside other
  blocks stays a code listing — that sole-block rule is what separates "this IS
  an interactive document" from "this contains an HTML sample".
- **`BlockRef`-as-embed is retired and "+" rewired.** A block id is a hash of its
  content, so an embed rotted the moment anyone edited the source. Attaching a
  block now copies its content into a real thread-parented document.
- **Parity.** A human and an agent put an item into a conversation through one
  door, producing rows indistinguishable in parent, status, role and content.
- **Migration 0078** drops the table, the dead `tasks.artifacts` column, and the
  threads hosted on an artifact — those had no FK, so they would have pointed at
  nothing, silently. Existing artifact rows are dropped, not converted.

## Where things live

- Produced items appear on their task and in their conversation, and **never in
  the knowledge tree** — that is what stops the tree filling with per-task
  residue. Clicking one opens it in the split view, rendered through the same
  body path a knowledge item's own page uses.
- **Thread-parented items are leaves.** `item → thread → item` is expressible and
  is made inert rather than illegal: every tree walk stops at the first
  non-knowledge-item parent.
- **Provenance is history, not a column — and history has no reader.**
  `producingTaskId` is gone. The original task survives as the `oldValue` of
  graduation's edit-log entry (`editType: "graduate"`), which is written and
  tested. But **nothing can read it**: there is no history endpoint, no UI, and
  the only production code touching `knowledge_edit_log` is attention scoring,
  counting human edits. Recovering where a produced item came from means
  querying the database by hand.

  The plan justified dropping the column by saying provenance lives in history
  and history "is the natural place to look". Half of that is true: the data is
  kept, the looking is not built. Nothing is lost, but the claim was stronger
  than the system.

## What this plan got wrong

Recorded because each was believed and checked:

- **`tasks.artifacts` needed no careful rename.** The plan called it non-optional
  and warned it must be done by hand. Nothing wrote it and nothing read it — the
  handoff filename array it was named for travels in the thread message payload.
  It was simply dropped.
- **The parity mechanism was not a new path.** The plan said an agent in a
  conversation had none and one had to be designed. A thread-scoped session
  already existed, the agent already held `ctx.threadId`, and the tool set in a
  conversation is identical to a task's by design. The gap was one field missing
  in three places.
- **Graduation had no mechanism at all**, and the plan opens by describing it.
- **The routine artifact subject folds rather than dies.** The scheduler already
  resolves `knowledge_created` to a `knowledge-item` subject carrying more than
  the artifact subject did.

## Deferrals, stated

- **AC8 was not proven on the harness lane.** Parity is proven at the service
  level against a real database; the two payloads are transcribed from their call
  sites rather than driven through the agent harness and the browser. The harness
  lane has no CI runner by design.
- **`upsertPluginDocument` / `UpsertPluginDocumentInput`** are the
  nested-knowledge strand's vocabulary sweep, not this one's.
- **The status ladder collapse** (`captured` → `proposed`) is that strand's
  migration. Produced items are written `draft` here because that is what the
  constraint accepts at this point, and their mapping carries it.
- **Archived items still appear in `GET /api/knowledge`.** Pre-existing on main —
  `visibleToViewer` has never filtered status. Found while driving the app,
  filed separately, deliberately not fixed here.
