# tool-handlers — destroyer verdict

**Census correction.** The input file lists 2 exported functions + 2 interfaces. That census is misleading: this package is the home of the AGENT TOOL surface — 22 tools registered in `buildToolDefinitions`'s `all` array (`tool-definitions.ts:1620`), each an `AGENT:` door in its own right (`trace_doors kind=agent` lists all 22 at head ba0fb454). This verdict audits **both** tables: the 2 exports and every one of the 22 agent tools.

## Should this service exist?

**KEEP AS the single home of the agent tool surface.** The tools are the product's hands — how an agent participates in conversations, bets, and knowledge. Killing the service kills the agent side of the product. But the surface carries dead weight: two write-only note sinks nobody reads, an inbox poller the push model already covers, a showcase "irreversible" tool nothing invokes, a half-no-op scoring tool, and a conflict tool that trusts agents to report their own stale writes. Those die.

## If written today, from scratch

The honest shape is one tool per primitive-act:

- **Converse:** `reply`, `send_message`
- **Work:** `create_task`, `create_bet`, `edit_bet`, `submit_review`, `create_artifact`
- **Escalate:** `create_item`, `handoff_to`
- **Org:** `create_team`, `add_agent`
- **Routines:** `create_routine`, `update_routine`
- **Knowledge:** `query_practice`, `write_memory` (absorbing edit/conflict), `promote_knowledge`, `score_attention` (knowledge override only)
- **Plumbing:** `buildToolDefinitions`, `buildToolRegistry`

Everything outside that shape — polling, note journals, file-write duplication — is a deletion by construction.

## Kill summary

| Verdict | Count |
|---|---|
| DELETE | 4 |
| MERGE | 1 |
| SIMPLIFY | 8 |
| KEEP | 11 |

Surface: 24 callable surfaces (2 exports + 22 tools) → 19 (4 deleted, 1 merged away; 21% cut outright, 8 of the survivors shrink)

## Feature-level kills

1. **Session-notes persistence** (`write_session_notes` + `ToolHandlersSessionsAccessor.writeNotes` + `sessions.notes` writes). `sessions.notes` is a write-only column: written by the tool, by `writeback-processor.ts:338`, and by `routes/sessions.ts:305/321` — read by **nothing**. No UI render (`rg '\.notes' layers/core-ui/src` prod: zero), no next-session context read (`context.ts:550` seeds an *empty* `work/task-notes.md` every session). The builtin adapter's two programmatic `registry.invoke("write_session_notes", …)` calls (`builtin-harness-adapter.ts:647,697`) persist plan text into that void — kill those call sites too. Real harnesses that want a notes file just write it; the writeback watcher already sees it. What breaks: nothing observable — the column was never displayed or re-read.
2. **Task-notes log** (`log_task` + `appendTaskNote` port member + `PATCH /tasks/:id/notes` + `tasks.notes` column). Same disease: write-only audit trail. `tasks.notes` appears in `TaskView` (`core-api-port.ts:61`) but no UI page renders it and no handler reads it back. ETHOS names this exactly: "audit trails nobody reads." What breaks: agents lose a private journal; discoveries that matter go to the task thread (`reply`) or the fabric (`write_memory`) — the places humans actually look. The eval scenario `tools/eval/src/scenarios/log-task.ts` dies with it.
3. **Inbox polling** (`read_inbox` + `listInboxBySenderExclusion` port member + the agent leg of `GET /threads/inbox`). The system is push-model: sessions get a baked `transcript`/`contextBundle`/`callingThreadId` (`session-requests/src/service.ts:884-901`) and new messages re-trigger agents via reengagement. Polling is the second way, and it is badly built — fetch `limit*4`, filter participants client-side, hope. What breaks: an agent cannot pull arbitrary cross-thread context mid-session. Acceptable — the push model is the designed channel; if a real learning shows agents starving for context, widen the baked bundle, don't resurrect polling.
4. **`commit_file`** — outside its own definition and the catalog mirror, referenced by nothing: no system prompt, no eval scenario (`rg commit_file tools/eval`: zero), no production caller. It duplicates what every real harness does natively (write a file in its own sandbox) and exists as the AL7 showcase "irreversible" tool with a preemptive sandbox-escape guard — security nobody earned. AL7 doesn't need it: `classifyReversibility` fails closed for any undeclared tool, so the workflow router keeps a live irreversible path without a mascot.
5. **`score_attention`'s item target and recompute mode.** The `target:"item"` branch validates, looks up the row, and returns `ok` while doing **nothing** (`tool-definitions.ts:834`, `@lore O2: items.attentionScore removed — no-op`). The tool lies to the agent — and `facilitator.md:19` explicitly instructs "Score items for human attention," the exact no-op. Recompute mode duplicates the attention engine the routine scheduler already drives (`routine-scheduler.ts` → `attention-service.ts`). Survivor: knowledge_item override only.
6. **Agent-self-reported conflicts** (`create_conflict_review` merged into the knowledge write path). Today the agent must *notice* its own stale edit and volunteer a conflict row. The server should detect version mismatch at write time and record the conflict itself — the consumer loop (promotion-pipeline block, `KnowledgeDetail.tsx`, facilitator queue) stays; the honor-system tool goes.

## Full method audit

### Exported functions (input file table A)

| # | Method | Reach | Verdict | Reason |
|---|---|---|---|---|
| 1 | `buildToolDefinitions` | BOOTSTRAP (wired in `run-orchestration-composition.ts:326,340` via `tool-handlers-bindings.ts:225`; serves every AGENT:TOOL door) | KEEP | The one assembly point for the whole agent tool surface — the product's hands exist through this call. Shrinks automatically as tools die. |
| 2 | `buildToolRegistry` | BOOTSTRAP (`run-orchestration-composition.ts:327` → `provisioner.ts:1234`; every brokered/MCP tool call passes through `invoke`) | KEEP | The dispatch + AL7 workflow router — role filter, schema validation, review routing for every harness in one closure. Load-bearing for both the tool surface and the review→act loop. |

### Agent tools (the corrected census — every `AGENT:` door this package serves)

| # | Method | Reach | Verdict | Reason |
|---|---|---|---|---|
| 1 | `read_inbox` | AGENT:read_inbox | DELETE | Push model (baked transcript/contextBundle + reengagement) is the first way agents see messages; polling with a limit×4 overfetch hack is the second way. Kill `listInboxBySenderExclusion` and the qa-engineer prompt line with it. |
| 2 | `send_message` | AGENT:send_message | KEEP | Core value: agent-initiated collaboration — the conversations pillar. Door: return-actions trio member (`return-actions.ts:33`), standard tool in every role prompt. |
| 3 | `reply` | AGENT:reply | KEEP | Core value: answer whoever triggered you — how the assistant exists as a product. Door: every session kind's answer path (AU27); no-thread-arg design kills a loop class. |
| 4 | `query_practice` | AGENT:query_practice | SIMPLIFY | Knowledge read side survives, but push the layer filter into `coreApi.search` server-side and delete the limit×5 client overfetch. |
| 5 | `write_memory` | AGENT:write_memory | SIMPLIFY | Knowledge write side is core. Delete the facilitator-role layer gate (`FORBIDDEN insufficient role for L3+`) — a preemptive permission matrix nobody earned, straight against ETHOS §2 — and collapse the scopeKind/scopeId ceremony to one default. Absorbs `create_conflict_review` (see MERGE). |
| 6 | `handoff_to` | AGENT:handoff_to | KEEP | Core value: task ownership transfer between agents/humans — the session lifecycle itself. Door: return-actions trio, `POST /tasks/:id/handoff` seam. |
| 7 | `create_item` | AGENT:create_item | SIMPLIFY | Escalating to human attention is core (the review→act loop). The 9-kind × 6-verb × riskTier input surface is not — shrink to the kinds the attention view actually routes (review, escalation, knowledge) and delete the rest of the enum freight. |
| 8 | `write_session_notes` | AGENT:write_session_notes | DELETE | Writes `sessions.notes`, which nothing reads — no UI, no next-session read, `context.ts:550` even blanks the file each session. Duplicate of the writeback path for real harnesses. Kill the builtin adapter's two internal invokes with it. |
| 9 | `create_task` | AGENT:create_task | KEEP | Core value: agents decompose work under a bet — the bets/tasks pillar. Door: `POST /tasks` seam, standard tool in role prompts. |
| 10 | `submit_review` | AGENT:submit_review | KEEP | Core value: work returns as a reviewable message on the bet thread — the AL5 review loop. Door: return-actions trio member, `ReviewPayload` consumed by `ReviewComposition.tsx` etc. |
| 11 | `score_attention` | AGENT:score_attention | SIMPLIFY | The item target is a silent no-op (returns `ok`, writes nothing — `@lore O2`) and recompute duplicates the scheduler-driven engine. Survivor: knowledge_item override only, one mode, no superRefine. `recomputeAttentionScoreForItem` port member dies. |
| 12 | `promote_knowledge` | AGENT:promote_knowledge | SIMPLIFY | Lifecycle transitions are the fabric's designed loop (facilitator/PM prompts drive it). But the dual `KNOWLEDGE_STATUSES` + `KERNEL_KNOWLEDGE_STATUSES` union with `isAnyKnowledgeStatus` is two vocabularies for one concept — collapse to one status set and one transition table. |
| 13 | `create_conflict_review` | AGENT:create_conflict_review | MERGE | Fold into the knowledge write path (`write_memory` with `itemId`+`versionBase` = propose edit; server detects the stale version and records the conflict row). An agent should not be trusted to notice its own stale write — CAS at the write is the honest mechanism. Consumer loop (promotion block, `KnowledgeDetail.tsx`) survives untouched. `findOpenConflictByItemAndProposer`/`createKnowledgeConflict` port members move server-side. |
| 14 | `create_team` | AGENT:create_team | KEEP | Core value: the assistant scaffolds a flat team + roster + routines conversationally — the product's genesis move. Door: assistant-only tool over `createTeam`/`persistScaffoldedAgents`/`provisionTeamRoutines` seam. |
| 15 | `add_agent` | AGENT:add_agent | KEEP | Core value: growing the roster by talking to the assistant — agents as first-class hires. Door: assistant-only tool, `agent_added` event consumers. |
| 16 | `create_bet` | AGENT:create_bet | SIMPLIFY | Bets pillar, keep — but kill the `AssistantToolShape` + `wrapForRegistry` special shape (only these two tools deviate from `ToolDefinition`; two shapes for one idea). |
| 17 | `edit_bet` | AGENT:edit_bet | SIMPLIFY | Draft-refine loop with the human is real; same shape fix as `create_bet` — plain `ToolDefinition`, drop the parallel error idiom. |
| 18 | `create_routine` | AGENT:create_routine | KEEP | Core value: routines are one of the five primitives; the assistant setting up automation in conversation is the pitch. Door: assistant-only tool → `insertRoutine` seam → scheduler. |
| 19 | `update_routine` | AGENT:update_routine | SIMPLIFY | Pause/reschedule survives; delete the post-write re-read (`getRoutineById` twice per call) and take `triggerConfig` as an object, not JSON-in-a-string-in-JSON. |
| 20 | `commit_file` | AGENT:commit_file — but zero prompts, zero evals, zero production callers | DELETE | Duplicates native harness file-writing; exists as the AL7 irreversible showcase with a preemptive sandbox-escape guard. Fail-closed classification keeps AL7 honest without it. Catalog row and consistency-test row die with it. |
| 21 | `log_task` | AGENT:log_task | DELETE | Appends to `tasks.notes`, a column no UI and no handler ever reads — a write-only audit trail, the ETHOS anti-pattern by name. Kill `appendTaskNote`, `PATCH /tasks/:id/notes`, the column, and the eval scenario. |
| 22 | `create_artifact` | AGENT:create_artifact | KEEP | Core value: artifacts are the review surfaces (AL5) — how produced work becomes visible and reviewable. Door: `POST /artifacts` seam, `artifact_created` consumers, `submit_review.artifactRef`. |

## Types / DI ports

| Declaration | Verdict | Reason |
|---|---|---|
| `ToolHandlersSessionsAccessor` (`ports.ts:478`) | DELETE | Sole member `writeNotes` exists only for `write_session_notes`; dies with the tool. Its only implementation (composition-root binding to `run-orchestration`'s `setSessionNotes`) dies too. |
| `ToolHandlersPorts` (`ports.ts:488`) | SIMPLIFY | Loses the `sessions` member entirely; becomes `{ coreApi }` — at which point consider passing the accessor directly. |
| `ToolHandlersCoreApiAccessor` (internal, `ports.ts:144`) | SIMPLIFY | Members dying with their sole callers: `appendTaskNote` (log_task), `listInboxBySenderExclusion` (read_inbox), `recomputeAttentionScoreForItem` (score_attention recompute), `findOpenConflictByItemAndProposer` + `createKnowledgeConflict` (conflict detection moves server-side into the knowledge write). ~44 members → ~39. |

## Holes this leaves

- **No private agent journal.** With `log_task` and `write_session_notes` gone, an agent's only durable memory is the knowledge fabric and the conversation itself. That is the honest design — if continuity across sessions is a real need, the fix is reading notes somewhere, not writing them nowhere.
- **Builtin harness loses plan persistence.** `builtin-harness-adapter.ts:647,697` stop persisting plan text. Nothing read it; nothing visible changes.
- **No mid-session cross-thread pull.** An agent cannot browse messages outside its baked context. If a learning shows this starves agents, widen the baked `contextBundle` — the push channel — rather than restoring `read_inbox`.
- **No tool-mediated file write.** Builtin-harness agents have no way to produce a sandbox file via tool. No prompt ever told them to; if a real journey needs it, add it back against that journey, not as an AL7 mascot.
- **Cross-package fallout to schedule:** `BUILTIN_TOOL_CATALOG` (tool-protocol) loses 4 rows and its consistency test re-greens; `docs/system-prompts/qa-engineer.md` drops `read_inbox`/`write_session_notes`/`log_task`; `facilitator.md`/`product-manager.md` drop item-scoring instructions; `tools/eval` scenarios `read-inbox`, `log-task`, `write-session-notes`, `poc-session-notes`, `score-attention` (item half), `create-conflict-review` (rewritten against the merged write path) die or shrink; `routes/tasks.ts` notes-append endpoint and `tasks.notes`/`sessions.notes` columns drop.
