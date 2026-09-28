# Document

Every piece of written content — a knowledge article, a skill, a rule, an agent identity file, a subscription prompt — lives in one `documents` table.

Source: `framework/domain-model/src/actions/document.ts`, `layers/core-api/document/src/`.

## Fields

- `id`, `title`, `body` (Markdown), `status`, `slot`, `scopeKind`, `scopeId`.
- `parentKind`, `parentId`, `position` — tree position; no FK, no cascade.
- `confidence` (real, 0–1), `tags` (JSON), `version`, `lastReadAt`, `lastUsedAt`.
- `createdAt`, `updatedAt`.

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

Default scope when an author belongs to a team: `team`. When creating without a team: `user`.

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

`canReadDocument`: factory scope → everyone; team scope → team members; user scope → only that user. Code: `layers/core-api/document/src/`.

## Unique slot per parent

A singular-slot unique index (`doc_parent_slot_uq`) prevents two skill/rule/agent_file/prompt documents under the same parent.

## History

Every write appends a `changes` row. The `changes` table is the document's history — no separate history table.

## Live push

Writes push on `document:<id>` (the document's own topic) and `documents` (the broad topic).

## Read counters

`lastReadAt` is updated only on `open_document` calls, not on session assembly reads.
