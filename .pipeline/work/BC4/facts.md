# BC4 — code facts (origin/main @ 2b1ef9b18, 2026-09-20)

Working file for refinement and architecture. Deleted at ship.

## Server
- Package `layers/core-api/knowledge/src`: repository 2,206 lines, promotion pipeline 426, session
  assembler 399, conflicts 83, token budget 74, scoring config 52. 30-odd public exports.
- Five tables, all owned by `knowledge`: `knowledge_items` (no FKs; parent points at five tables),
  `knowledge_edit_log`, `knowledge_access_log`, `knowledge_conflicts`, `knowledge_app_projection`.
  No versions table — `version` is an int used only for optimistic locking.
- Parent kinds: `knowledge_item · task · thread · routine · agent`. Roles: `ordinary · skill · rule ·
  agent_file · prompt` (named slots are unique per parent). Statuses: `proposed · active · stale ·
  archived`. Scope: factory / team / user.
- 11 routes in `routes/knowledge.ts` (948 lines) on the legacy list; `routes/search.ts` (one route,
  cross-object) is not on it. Routes own validation mapping, privacy (user-scoped ordinary item is
  404 to others), and all event emission. Package emits nothing except the two sweeps.
- Events: `knowledge_created · knowledge_updated · knowledge_archived`. Subscribers: only the generic
  routine event matcher and the generic websocket broadcaster. Promote, graduate and conflict emit
  nothing.
- Merge and split are not transactional and leave the source's children parented to an archived
  item. Archive does not bump the version.
- **Dead or half-dead:** `knowledge_access_log` has no production writer or reader. `knowledge_edit_log`
  has ten writers and no production reader (only eval judges). `knowledge_conflicts`: rows are written
  (agent tool, sandbox writeback on version clash or file delete), they block promotion to active,
  and nothing ever resolves one — `status` never leaves `open`. A conflict opens no thread today.
  `flaggedForReviewIds` in the auto-promotion sweep is always empty.
- Sweeps (auto-promote, mark stale) are called from `routine-scheduler-bindings.ts:78,80`.
- Other production callers of the package: plugin install/enable/restore (`routes/plugins.ts`), agent
  identity docs (`agents.ts`, `org.ts`, `users.ts`, `teams-routes.ts`, `agent-profile.ts`), routine
  prompt docs (`routines-routes.ts`), task and thread modules through narrow injected reads
  (`actions/compose.ts:63-112`), the two run resolvers (context assembly + identity), `search.ts`.

## Agent side
- Six live tools in `tool-handlers/src/tool-definitions.ts`, all over the HTTP seam to the routes:
  `write_memory`, `create_artifact` (both = create an item; artifact = item parented to task/thread),
  `promote_knowledge`, `create_conflict_review`, `merge_knowledge`, `split_knowledge` (last four only
  for assistant, facilitator, product manager). `run_knowledge_sweep` is already deleted and banned.
- **No tool reads a document.** Agents read only what is baked into the sandbox as files at session
  start (`context.ts:900-1027`): skills, rules, ordinary items shaped by ancestor chain, read-only.
  Thread-turn sessions get no documents at all.
- Agents also write by editing sandbox files: the writeback processor
  (`run-orchestration/src/writeback-processor.ts`) calls update / create / reparent / create-conflict
  over the seam.
- `CoreApiKnowledgePort` still has ten methods (`framework/api-contract/src/core-api-port.ts:351-383`).
- `plugins/knowledge-management`: one librarian agent, three routines; two weekly routines tell it to
  call the deleted sweep tool. Personas name deleted tools (`qa-engineer.md`, `facilitator.md`).
- Evals: six scenarios drive these tools; `provision-harness.ts` calls the real assembler.

## UI
- Pages: `KnowledgeDetail` 1,271, `KnowledgeList` 879, `KnowledgeCreate` 295, plus seven page-local
  files; `KnowledgeRoleList` in settings (skills and rules); `ArtifactSection` on task and thread;
  sidebar fast-nav; global search bucket; assistant overlay creates thread-parented items.
- 17 raw fetch sites. Filter and sort are client-side. Four hand-copied item shapes; production
  `KnowledgeDetail.tsx:63` imports `fixtures/knowledge-data.ts` as a live fallback.
- **UI controls exist for:** list, triage validate/reject, create, add child, edit with autosave and
  version-clash banner, change scope, move, archive, promote-to-task (already `edit_task`).
  **No UI for:** merge, split, conflicts, promote status, graduate. The demo seed has one open
  conflict no screen can show.
- No live updates on any document screen. The discussion section is already on `send_message`.
- 33 user-visible strings say "knowledge". 613 files mention the word (303 production, 310
  development); 68 of those are migration SQL and snapshots.
- About 24 unit tests, 4 stories and 24 Playwright specs mock the document routes.

## Pattern to copy
- Legacy neighbour reached through a narrow injected read (`TaskActionsDeps.knowledge`), sibling
  action reached through an injected runner (`TaskActionsDeps.openThread`). `OBJECT_EVENTS` in the
  governance rule already reserves `document.created` / `document.changed`.

## Founder rulings from the interview (2026-09-20)
1. **No conflicts.** Documents sync on their own; two writers at the same moment is rare. Last write
   wins. The conflicts table, the conflict tool, the promotion block on open conflicts and the
   writeback's conflict path all go. No review thread for a conflict.
