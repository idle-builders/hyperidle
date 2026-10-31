# Document

Every piece of written content — a knowledge article, a skill, a rule, an agent identity file, a subscription prompt — lives in one `documents` table.

Source: `framework/domain-model/src/actions/document.ts`, `layers/core-api/document/src/`.

## Fields

- `id`, `title`, `body`, `format`, `status`, `slot`, `scopeKind`, `scopeId`.
- `format` — `markdown`, or `html` for an app (see below).
- `icon` — one emoji, shown in the knowledge tree and before the title; null shows the plain page mark.
- `discipline` — who it is for: agents of that discipline get it as they work; empty reaches every agent. People read every document either way.
- `parentKind`, `parentId`, `position` — tree position; no FK, no cascade.
- `confidence` (real, 0–1), `tags` (JSON), `version`, `lastReadAt`, `lastUsedAt`.
- `createdAt`, `updatedAt`.

`open_document` also says how many others follow the document (`followers`): a person follows it with a subscription on `document.changed` for its id, and is told when it changes — publishing included. Comments on it live in its thread (see [thread.md](thread.md#comments-on-a-document)).

## Apps

A document whose `format` is `html` is an app: its `body` is one whole HTML page with its own styles and scripts. It runs whole on its own page and in the pane beside a conversation or task (`?app=<id>`); where room is short — the conversation it was made in, its task's box — it shows as a card with its title and the page's `<meta name="description">` (else its `<title>`), read as text and never run.

A document is not the only app. A whole message can be one (see [thread.md](thread.md#message-types-closed)), and so can a task's description (see [task.md](task.md#description)). Each shows as the same card and opens in the same pane; find lists them all under Apps.

An app runs in a box sealed off from the app around it: a sandboxed frame with scripts allowed and nothing else, nested in a shell whose policy blocks every network request, embed and navigation away. It cannot reach HyperIdle's page, its key, storage or the network, so every image and font lives inside the page. The box is written once, in `layers/core-ui/src/app-frame.ts`.

## Statuses

Four: `proposed`, `active`, `stale`, `archived`.

Human-authored documents are created `active`. Agent-authored ones start `proposed`. A version mismatch on the manifest during writeback marks the document `stale`.

## Slots

Five: `ordinary`, `skill`, `rule`, `agent_file`, `prompt`.

- `ordinary` — general knowledge.
- `skill` — a skill document used by agents.
- `rule` — a rule document used by agents.
- `agent_file` — an agent's identity file.
- `prompt` — a subscription's prompt; parented to `subscription`.

## Scope

Three scope kinds: `factory`, `team`, `user`. `scopeId` holds the team id or user id; `factory`-scoped documents have no `scopeId`.

Default scope: the author's team when they are in exactly one (an agent always is); otherwise the calling task's team; otherwise `factory`.

Scope-narrowing cascade: moving a document to a narrower scope (`factory → team → user`) narrows all its descendants. Widening is refused.

## `as` (derived, never stored)

Three values: `memory`, `artifact`, `document`. Derived by `documentAs` (`actions/document.ts`):

- `artifact` — parent is a `task` or `thread`.
- `memory` — scope `user`, no parent, slot `ordinary`.
- `document` — everything else.

Moving a document out of a task/thread parent makes it a `document`. Moving it to `user` scope with no parent makes it a `memory`.

## Parent kinds

Five: `document`, `task`, `thread`, `agent`, `subscription`. No FK — the parent may not exist. Documents form a tree up to depth 32 (`document-store.ts`).

Clients may parent to `document`, `task`, or `thread`. `agent` and `subscription` parents are internal-only (`forbidden_parent_kind`).

## Visibility

`canReadDocument`: factory and team scope → everyone (a team-scoped document sits in that team's space and reaches that team's agents' context, but every person reads it); user scope with the ordinary slot → only that user and whoever owns them; task- or thread-parented artifacts → everyone. Code: `framework/domain-model/src/actions/document.ts`, `layers/core-api/document/src/`.

## Unique slot per parent

A singular-slot unique index (`doc_parent_slot_uq`) prevents two skill/rule/agent_file/prompt documents under the same parent.

## History

Every write appends a `changes` row. The `changes` table is the document's history — no separate history table.

## Live push

Writes push on `document:<id>` (the document's own topic) and `documents` (the broad topic).

## Read counters

`lastReadAt` is updated only on `open_document` calls, not on session assembly reads.
