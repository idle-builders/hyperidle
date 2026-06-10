# Z8 Trace — Agent Runtime

Deep code-trace of sessions, harness adapters, skill-tools, MCP bridge, worker WS, and workspaces.
Every claim below was verified by reading source; line numbers refer to current `main` (2a8402cb).

---

## Session Lifecycle Map

### Entry points that create sessions

| Entry | File:Line | Path |
|---|---|---|
| `POST /api/sessions` | `packages/server/src/routes/sessions-routes.ts:124` | Full `provisionSession` when `adapterPool`+`workspaceAdapter` injected (always true in production via `server-factory.ts:148-151`); legacy bare DB insert otherwise (returns 201, state=active, **no harness ever runs**) |
| `POST /api/routines/:id/trigger` | `packages/server/src/routes/routines-routes.ts:560-680` | Monthly-cap check → coalescing check (`shouldCoalesce`) → insert `routine_runs` (outcome="running") → `provisionSession({routineId})` → back-populate `routine_runs.sessionId` |
| Task dispatcher (AD2) | `packages/fabric/src/services/task-dispatcher.ts:404` | Subscribes `task_state_changed(accepted)` + `session_ended`; FIFO queue → `provisionSession`. **Never registered in production** (see FLAGS) |
| Routine scheduler | `packages/fabric/src/services/routine-scheduler.ts:500` | Cron/heartbeat poller. **Never started in production** (see FLAGS) |

### The 11-phase provisionSession orchestrator
`packages/server/src/services/session-provisioning.ts:231-735` — `provisionSession(deps, params)`

1. **Load agent** (`users` row): role, `teamId`, `soulPrompt` (inline text, X3 — no file read), `modelTierPreference` validated against `MODEL_TIERS`. Tier priority: param > agent preference > `"workhorse"`.
2. **Cost-cap pre-flight** — `checkCostCap` (`packages/fabric/src/services/cost-cap.ts`): agent cap (`users.costCapMinor ?? costCap` vs `users.costActual`), team cap (`teamMembers`), factory cap (params). Throws `CostCapExceededError` → route returns 422.
3. **Adapter select + concurrency + task transition** — `adapterPool.select({harnessType: agent.harnessType})` (least-loaded by `currentLoad/maxConcurrent`, skips paused). Concurrency: count of active `sessions` rows for agent vs `users.maxConcurrentSessions` → `ConcurrencyLimitError` → 429. Then `transitionTask(taskId, "in_progress")` unless already in_progress (handoff re-dispatch, AD2 guard at :312-319).
4. **Workspace spawn** — `workspace.spawn(workspaceBasePath)` → `<base>/<local-ws-N-timestamp>/`. Base path: `HYPERIDLE_WORKSPACES_DIR ?? os.tmpdir()+"/hyperidle-workspaces"` (`server-factory.ts:150-151`); routes default `/tmp/hyperidle-workspaces` when dep missing.
5. **Insert `sessions` row** — id=randomUUID, state="active", `workspaceSnapshot`=workspacePath, optional `routineId`.
6. **Materialize knowledge** — `materialize()` (`packages/fabric/src/materialization.ts:157`): wipes & recreates `context/ knowledge/ work/ .fabric/`; fetches L4 (factory), L2 (scoped to productId=teamId), L3 (role community) knowledge items; `rankAndBudget` token-budget trim; writes items into `context/factory|product|practices`; writes `context/session.toon`; sets `context/` read-only; writes `.fabric/manifest.json` (item id → version + source_path).
7. **Start file watcher** — `startWatcher` (`packages/fabric/src/file-watcher.ts`): fs.watch on `knowledge/` + `work/`, 500ms debounce → `processWriteback` (`writeback.ts`) which diffs against manifest: knowledge file edits → `knowledge_items` update with version check (mismatch → `knowledge_conflicts` row); `work/session-notes.md` → `sessions.notes` (`writeback.ts:275`).
   - **Failure of phases 4–7** → `revertTaskToAccepted` (bypasses state machine intentionally, appends `StateTransitionAuditEntry` to `tasks.auditTrail`, emits `task_state_changed`) then rethrows.
   - Emit `session_started`.
8. **Build tool registry** — `buildToolRegistry(toolContext, {role})` — role-filtered (`toolsForRole`). ToolContext = {db, eventBus, agentId, sessionId, taskId, teamId, workspacePath, watcher}.
   - **8.5a** builtin only: `harness.setSessionToolRegistry(sessionId, registry)` (instance method, not on interface).
   - **8.5** Compose prompt — `composePrompt`/`composeRoutinePrompt` (soul prompt + task/bet or routine context + tool summaries) → `writeWorkspaceCLAUDEmd(workspacePath, prompt)` writes `CLAUDE.md` (`prompt-composition.ts:256`).
   - **8b** MCP bridge (optional): `createMcpBridge({sessionId, registry})` → 64-hex token; `mcpBridgeRegistry.register(bridge)`; writes `<ws>/.mcp.json` with `{mcpServers.hyperidle.url: "<mcpBaseUrl>/api/mcp/<token>"}`. Failure is non-fatal (event-stream fallback).
9. **Start harness** — `harness.startSession({workspacePath, composedPrompt, modelTier, tools: allowedToolNames, resolvedModel, resolvedFastModel, mcpConnectionInfo})`. Throw → crash path, release pool slot.
10. **Drain `streamEvents`** loop:
    - `cost_update`: delta clamped ≥0, scaled by currency (`scaleForCurrency`), accumulated into `totalCostCents`; routine per-run cap check (`budgetExhausted`); then `recordCostAndCheck` (fabric cost-cap) — increments `users.costActual`, `teamMembers.costActual`, `bets.costActualMinor` (via `tasks.betId`), emits `cost_cap_warning`/`cost_cap_breached` with per-session dedup. **See FLAG F5 — running total passed where a delta is expected.**
    - `token_usage`: accumulated in-memory per tier.
    - `tool_call`: always emits `tool_call_recorded` (argsSummary via `summarizeToolArgs` = JSON → `scrubInlineTokens` → 512-char cap, `observability/dispatcher.ts:493`); invokes `registry.invoke(...)` only when adapter lacks MCP support AND isn't builtin (X5/X6 double-invocation guards).
    - `error`: crashed=true, break.
    - `stopSession` always called; pool slot released in `finally`. **SessionResult (cost/tokenUsage) is discarded** — only stream events count.
11. **Teardown** — unregister MCP bridge (both paths); then:
    - crash → `crashSession` (`session-lifecycle.ts:282`): watcher.stop (guarded), `sessions` → state/outcome=crashed + endedAt, emit `session_ended(crashed)`, update `routine_runs` (outcome=error), `releaseSessionDedup`. **Workspace preserved** for post-mortem.
    - budget_exhausted (routine per-run cap) → `endSession(..., "budget_exhausted")` then `workspace.destroy`.
    - normal → `endSession`: watcher.stop, `sessions` → done/completed/endedAt, emit `session_ended(completed)`, routine_runs outcome=success, `releaseSessionDedup`, `fs.rm(workspacePath)`, then `workspace.destroy(handle)` (idempotent double-delete).
    - `accumulateSessionTokensOnBet` merges per-tier tokens into `bets.tokensActualJson` (read-modify-write, non-atomic — acknowledged in code).

### Session state mutation endpoints
- `PATCH /api/sessions/:id` (`sessions-routes.ts:282`): optional `state` (done|crashed → sets endedAt + emits `session_ended`), `outcome`, `notes`, `effectivenessScore` (0–1 number, stored as text, `effectivenessRecordedBy` = auth actor ?? session.agentId). No harness interaction — pure DB write.
- `GET /api/sessions` — filter by task_id/agent_id/state, limit≤200.
- `GET /api/sessions/:id/activity` (`sessions-routes.ts:257`): session meta + last 50 entries from `SessionActivityBuffer` (in-memory ring, 100/session, subscribes `tool_call_recorded`, evicts 5 min after `session_ended`; `services/session-activity-buffer.ts`). Ephemeral by design.

### Activity stream to the UI
`packages/web/src/hooks/useSessionActivity.ts` → REST snapshot (`/api/sessions/:id/activity`) then WS subscribe to topic `session:<sessionId>`. `WsBroadcaster` (`services/ws-broadcaster.ts`) broadcasts `session_started`/`session_ended`/`tool_call_recorded` on `session:<id>`; **any authenticated WS client may subscribe to any session topic** (authz only enforced for `thread:<id>` topics via `createDbSubscribeAuthorizer`). WS auth: one-shot upgrade token from `POST /api/auth/ws-token` consumed in middleware (`routes/ws.ts:77-96`).

### Handoff protocol (session side)
`handoff_to` tool (`skill-tools/handoff-to.ts`) → `handoff()` (`services/handoff-protocol.ts:64`). Single transaction:
1. `sessions` → state=done + endedAt (no `session_ended` event — intentional, cost-attribution skip).
2. toHuman: inline task→blocked transition + audit entry; create review thread + `items` row (kind=review). toAgent: `tasks.ownerAgentId` swap. toRole: find active same-team agent via `teamMembers` join, else escalation thread+item (`status: "escalated"`).
3. Optional `messages` row (type=handoff, snake_case payload) on the task's thread.
4. Append `HandoffAuditEntry` to `tasks.auditTrail`.
Post-commit: emit `task_state_changed` then `item_created`; `releaseSessionDedup`. Re-dispatch to the new owner happens via the AD2 dispatcher's `session_ended` handler (which never fires in production — FLAG F2). **Note:** the harness loop keeps running after handoff marks the session done (no abort is signaled); provisioning's `endSession` later overwrites the row again (FLAG F16).

### Model gateway & credentials
- `resolveModelTier(tier, config, credentialResolver)` (`services/model-gateway.ts:47`): pure switch on provider — anthropic → `anthropic_api_key`, openrouter → `openrouter_api_key`, openai-compatible → apiKey/baseUrl from tier config itself. Throws `MissingCredentialError`. Defaults: `BUILT_IN_GATEWAY_CONFIG` = opus-4 (reasoning) / sonnet-4 (workhorse) / haiku-3.5 (fast), overridable via `serverConfig.modelGateway` (factory_settings).
- Resolution happens in `sessions-routes.ts:140-176` (primary + best-effort fast tier) and is passed into SessionConfig; adapters never call the gateway.
- `EnvCredentialResolver` (`services/credential-resolver.ts:35`): `anthropic_api_key→ANTHROPIC_API_KEY`, `openrouter_api_key→OPENROUTER_API_KEY`, `shared_backend_key→HYPERIDLE_API_KEY`. Wired in `server-factory.ts:147`. Desktop main sets env vars before server boot from `~/Library/Application Support/<app>/credentials.json` — safeStorage-encrypted blobs, file mode 0600, fixed 3-name catalog, IPC channels `credentials:*` (`packages/desktop/src/safe-credentials.ts`, `main.ts:783-788`).
- `DbCredentialResolver` (shared mode): decrypts `server_credentials.encryptedValue` with `HYPERIDLE_CREDENTIAL_KEY`/`HYPERIDLE_API_KEY`.
- `llm-client.ts` (builtin harness): direct `fetch` to `<baseUrl>/v1/messages` (anthropic/openrouter wire) or `/v1/chat/completions` (openai-compatible); 2-min timeout, 3 retries w/ exponential backoff on 429/502/503, hard fail on 400/401/403/404.

---

## Harness Adapter Matrix

All implement `HarnessAdapter` from `@hyperidle/shared`: `startSession(SessionConfig)→SessionHandle`, `streamEvents`, `stopSession→SessionResult`, `getCapabilities`.

| Adapter | File | Spawns | FS touchpoints | Process | Cost/token reporting | Capabilities |
|---|---|---|---|---|---|---|
| **builtin** (`local-builtin`, type `builtin`) | `harness/builtin-harness-adapter.ts` | In-process agent loop (plan → execute → reflect every 5 tool calls → stop, max 50 iterations) via `callLlm()` direct HTTP | None directly (tools do FS via registry, e.g. `write_session_notes` → `<ws>/work/session-notes.md`) | None (in-process) | Per-LLM-call `token_usage` + `cost_update` from hard-coded `COST_PER_MILLION_TOKENS` table (opus/sonnet/haiku; unknown models → sonnet pricing) | preCompaction ✓ (0.8 threshold → snapshot notes + summarize via fast tier), subAgents ✗, providers anthropic/openrouter/openai-compatible, MCP ✗ (executes tools internally via injected registry) |
| **claude-agent-sdk** (`local-claude-code`, type `claude-code`) | `harness/claude-agent-sdk-adapter.ts` | `@anthropic-ai/claude-agent-sdk` `query()` — SDK spawns the Claude Code subprocess | `cwd=workspacePath`; reads `CLAUDE.md` + `.mcp.json` from cwd | Claude Code subprocess; env allow-list `PATH,HOME,LANG` + `ANTHROPIC_API_KEY` only (I2 S1); `permissionMode: "default"` unless `HYPERIDLE_UNSAFE_AGENT_MODE==="true"` (then bypassPermissions + allowDangerouslySkipPermissions) | Translates SDK messages: assistant usage → `token_usage`; `result.total_cost_usd` delta → `cost_update`; `compact_boundary` → `pre_compaction` | preCompaction ✓, subAgents ✓, providers [anthropic], MCP ✓ |
| **CLI** (`local-cli-aider/goose/opencode`, type = binary name) | `harness/cli-harness-adapter.ts` | `spawn(binary, args)` ARGV form (never shell — X5 W1 security boundary). Registered only if `which <binary>` succeeds (`adapter-pool.ts:254`) | cwd=workspace; templates `{{workspace}} {{model}} {{apiKey}} {{baseUrl}} {{mcpUrl}}` in args/envMap | One child process per session; env allow-list + envMap (API key via env); SIGTERM → 5s → SIGKILL | **None** — `buildResult` always cost 0 / empty tokens; stdout lines → `completion` events ("text" mode for all 3 configs; "ndjson" mode would trust parsed objects as HarnessEvents); stderr lines → `error` events | preCompaction ✗, subAgents ✗, providers [], MCP ✓ (assumes tool reads `.mcp.json` — flagged provisional in code) |
| **isolated** | `harness/isolated-harness-adapter.ts` + `isolated-session-worker.ts` | `child_process.fork(isolated-session-worker.js)` with `--max-old-space-size=<maxMemoryMb>`; worker dynamically imports ClaudeAgentSdkAdapter and runs the session, relaying events over IPC | Inherits SessionConfig workspace | Forked Node child; env allow-list + `ANTHROPIC_API_KEY` from injected `CredentialResolver`; `maxDurationMs` timer → SIGKILL (timeout = crashed result); stop = IPC "stop" + 5s SIGKILL escalation | Relays `{type:"event"}` / `{type:"session_result"}` IPC messages | preCompaction ✓, subAgents ✓, providers [anthropic], MCP ✓. **Not registered in any production pool** — only used in tests (FLAG F13) |
| **remote** | `harness/remote-harness-adapter.ts` | Sends `{type:"dispatch", sessionId, config}` over the worker WebSocket | None on server (but provisioning already created a *server-local* workspace — FLAG F11) | None (work runs on the remote worker machine) | Worker pushes `{type:"event"}` (HarnessEvents incl. cost/token) and `{type:"session_result"}` | preCompaction ✗, subAgents ✗, providers from `WorkerRegisterMessage`, MCP ✗ (conservative — forces event-stream interception) |
| **local-workspace** (WorkspaceAdapter) | `harness/local-workspace-adapter.ts` | `mkdir <base>/local-ws-N-<ts>` | Host FS; `exec()` runs `sh -c <command>` in workspace cwd (dev-only by design) | Shell children on exec | n/a | Constructor refuses `NODE_ENV=production` unless `HYPERIDLE_PROFILE=laptop`. This is the production adapter wired by `server-factory.ts:149` |
| **docker-workspace** (WorkspaceAdapter) | `harness/docker-workspace-adapter.ts` | `mkdir <base>/docker-ws-N-<ts>`; `docker run -d --rm -v <hostPath>:/workspace node:20-slim sleep infinity` | Host dir bind-mounted into container | One container per workspace; `exec` = `docker exec <id> sh -c <cmd>` (argv form, I2 S5/S6); destroy = `docker stop` + `rm -rf hostPath` | n/a | **Never instantiated in production** — only `LocalWorkspaceAdapter` is wired (FLAG F12) |

**AdapterPool** (`harness/adapter-pool.ts`): Map keyed by stable id; `select()` filters paused/capacity/modelProviders/harnessType then min-load; `release()` decrements. `createLocalAdapterPool()` registers claude-code (max `HYPERIDLE_LOCAL_MAX_CONCURRENT`?4), builtin (max `HYPERIDLE_BUILTIN_MAX_CONCURRENT`?8), and any available CLI tools (max 2 default). Remote workers are registered/unregistered by the worker WS route. `getCapabilitiesByType()` feeds AB1 capability queries.

---

## Skill-Tool Registry

`packages/server/src/skill-tools/tool-registry.ts` — `ALL_TOOL_DEFINITIONS` (20 entries), role-filtered by `toolsForRole(role)`; `buildToolRegistry(ctx,{role})` requires explicit role (I2 B1/B2); `invoke()` returns `FORBIDDEN` for role-filtered tools vs `NOT_FOUND` for unknown; input validated twice (registry safeParse + per-handler safeParse). `toClaudeToolSpec` derives JSON Schema via `z.toJSONSchema(draft-7)`.

| Tool | Input schema (Zod) | Reads | Writes | Events |
|---|---|---|---|---|
| `read_inbox` | `{limit? ≤100}` | `messages ⋈ threads` (sender≠agent, participant JSON filter in JS, fetches limit×4) | — | — |
| `send_message` | `{to, subject?, body}` | `users` (recipient) | `threads` (find-or-create direct via `findOrCreateDirectThread`), `messages` (type=plain) | — |
| `log_task` | `{note ≤64KiB}` | `tasks` | `tasks.notes` append (prose lane, `---` separator) | — |
| `query_practice` | `{query, layer?=L3, limit?=20}` | FTS via `fabric.search` then layer filter in memory | — | — |
| `write_memory` | `{layer, kind(8 enum), title, body, topic?, format?, status?}` | `users` (role gate: L3/L4 facilitator-only), `tasks` (teamId fallback) | `knowledge_items` insert (status default "draft", scopeKind product/factory, updatedBy=`agent:<id>`) | knowledge events via repository |
| `handoff_to` | `{toAgent?/toRole?/toHuman?, contextId, status(4), reason, artifacts?, remainingWork?, error?}` | `users`, `tasks` | `sessions`(done), `tasks`(owner/state/auditTrail), `threads`, `items`, `messages` — all in one tx | `task_state_changed`, `item_created` (post-commit) |
| `create_item` | `{title, body?, kind?(10 enum), verb?(6 enum), layer?, riskTier?, attentionScore?, blocking?, threadId?, proposedAction?, options?, reasoning?, costEstimate?}` | `threads`, `users`, org_edges via `resolveReviewRecipients` | `threads` (auto-create hostKind=task; merge human reviewers into participants for review/escalation items), `items` insert | `item_created` |
| `write_session_notes` | `{notes, append?}` | FS | `<ws>/work/session-notes.md` + mirror to `sessions.notes` | — (watcher writeback idempotent) |
| `create_task` | `{title ≤512, description?, doneCondition?}` | `tasks` (parent — betId/teamId derived, never from input) | `tasks` insert (state=proposed, owner=agent) | `task_state_changed` (proposed→proposed) |
| `submit_review` | `{title, reasoning[1..16], artifactRef?{id,kind}}` | `tasks` (betId), `threads` (bet host thread) | `threads` (find-or-create hostKind=bet, add participant), `messages` (type=review w/ ReviewPayload, or plain fallback) | — |
| `create_artifact` | `{kind(6: text/code/image/data/html/url), label? snake_case≤64, preview (discriminated, must match kind)}` | `tasks` | `artifacts` insert (producingTaskId=ctx.taskId always) | `artifact_created` |
| `route_item` (roles: assistant/facilitator/product_manager) | `{itemId, riskTier?, kind?, verb?}` | `items` | `items` (only overridden fields) | none (intentional G1) |
| `score_attention` (same roles) | `{target item\|knowledge_item, id, score?0-1, mode? override\|recompute}` (superRefine: score required for override, forbidden for recompute) | `knowledge_items`, `items`, `knowledge_strategy_fabric` | knowledge_item: upsert `knowledge_strategy_fabric.attentionScore` + bump `knowledge_items.updatedAt`; recompute via attention engine. **item target: silent no-op** (O2 stripped column) | attention events (recompute path) |
| `promote_knowledge` (same roles) | `{knowledgeItemId, toStatus(7 fabric enum), reason? ≤64KiB}` | `knowledge_items`, `knowledge_conflicts` | tx: conditional status UPDATE (WHERE status=fromStatus → CONCURRENT_MODIFICATION on race), `knowledge_edit_log` insert. CONFLICT_OPEN gate blocks →validated. Transitions table incl. kernel `draft→active/captured/archived` | — |
| `create_conflict_review` (same roles) | `{knowledgeItemId, proposedBody ≤64KiB, proposedMeta?, versionBase}` | `knowledge_items`, `knowledge_conflicts` (per-agent open-conflict dedup) | `knowledge_conflicts` insert (status=open, proposedBy=`agent:<ctx.agentId>` — never from input) | — |
| `create_team` (roles: assistant) | `{name, functions[1..20], repoPath?}` | `factory_settings` (soul templates) | `teams`, `team_members`, `users` (full roster from `defaultRoster`), leadAgentId update | — |
| `add_agent` (assistant) | `{teamId, role, name, soulPrompt? ≤50K}` | `teams`, `team_members`, `factory_settings` | `users` insert (teamId = teamMembers.id) | — |
| `create_bet` (assistant; AssistantToolShape wrapped) | `{teamId, description, doneCondition?, hypothesis?}` | `teams` | `bets` insert (status=draft) | — |
| `create_routine` (assistant) | `{name, description?, teamId, ownerAgentId, triggerType:"calendar", triggerConfig(JSON w/ cron), costCapPerRunMinor?}` | `teams`, `users`, `bets` | `tasks` (stub task; may create "Routine Operations" system bet), `routines` insert (nextRunAt from cron) | — |
| `update_routine` (assistant) | `{routineId, updates{name?, description?, state?, triggerConfig?, costCap*?}}` | `routines` (soft-delete aware) | `routines` update (state syncs `active` bool) | — |

**Not in the registry** (assistant-surface only, `assistant-tools.ts` — 13-tool catalog with risk levels, `HIGH_RISK_TOOLS` = create_bet/edit_bet/submit_review/handoff_to gated by review message in the assistant dispatcher):
- `update_task_status` — direct `tasks.state` write **bypassing the task state machine** (no transition validation, no audit trail).
- `edit_bet` — `bets` description/doneCondition/hypothesis update.
- `edit_block` — **stub**: always returns "Block not found" (no blocks table yet).

---

## MCP Bridge

- `createMcpBridge` (`mcp/mcp-bridge.ts:76`): per-session `McpServer` + `WebStandardStreamableHTTPServerTransport` in stateless mode; token = `crypto.randomBytes(32).hex` (256-bit). Every registry tool registered with full Zod schema; handler delegates to `registry.invoke()` (double validation = authz boundary, X2 D7). `ToolResult` → `CallToolResult` (failure → `isError:true` with JSON `{error, code}`).
- `createMcpBridgeRegistry` (`mcp/mcp-bridge-registry.ts:36`): in-memory `Map<token, instance>`; `handleRequest` → 401 for unknown tokens; `unregister` closes `mcpServer` only (transport closed transitively), try/caught.
- Route: `ALL /api/mcp/:token` (`routes/mcp-route.ts:22`), mounted **before** auth middleware (`app.ts:325`, `server-factory.ts:208`) — token in URL is the sole credential. Rate-limited by the global `/api/*` limiter (300/min default).
- Token distribution: written to `<ws>/.mcp.json` (Claude Code/CLI auto-discovery) and passed as `mcpConnectionInfo` in SessionConfig. Unregistered in Phase 11 on both end and crash paths.
- Tools exposed over MCP = exactly the role-filtered registry definitions (no extra tools, no fewer).

---

## Worker WS Protocol

- **Server route**: `GET /api/ws/worker?token=<HYPERIDLE_WORKER_TOKEN>` (`routes/worker-ws.ts:161`), mounted before auth middleware; token compared via `constantTimeStringEqual`. 401 on mismatch/absence (and if env var unset, **all** connections 401 — fail closed).
- **Token mint**: `POST /api/auth/worker-token` (`routes/auth.ts:112`) — behind standard auth; returns the *shared static* `HYPERIDLE_WORKER_TOKEN` (404 if unset).
- **Worker→Server messages** (Zod discriminated union, `worker-ws.ts:26-64`): `register{id, name, modelProviders, maxConcurrent, harnessType?}`, `event{sessionId, event}`, `session_result{sessionId, result}`, `error{sessionId, message}`, `pause`, `resume`.
- **Server→Worker**: `registered` (ack), `dispatch{sessionId, config: SessionConfig}`, `stop{sessionId}`.
- `WorkerConnectionManager`: on register → `new RemoteHarnessAdapter(ws, msg)` + `pool.register(msg.id, …, kind:"remote")` (registering with an existing id **replaces** that pool entry); post-registration runtime messages re-serialized into `adapter.dispatchMessage` (S2-F07); pause/resume toggle `pool.pause/resume`; onClose → `pool.unregister`.
- **Desktop client** (`packages/desktop/src/desktop-worker-client.ts`): POST worker-token with `shared_backend_key` as X-API-Key → open WS → register (deviceId, machineName) → wait `registered`. On `dispatch`: `adapter.startSession(config)` (a `ClaudeAgentSdkAdapter` instance), stream events back, send `session_result`. `stop` → stopSession+result. Graceful `disconnect()` waits ≤60s then force-stops. No auto-reconnect (S4 scope).
- `GET /api/workers` (`routes/workers.ts`) lists pool entries — requires X-API-Key strictly equal to `HYPERIDLE_API_KEY` (master key only; bearer login sessions cannot call it).

---

## Filesystem Touchpoints

| Path | Writer | Reader | Cleanup |
|---|---|---|---|
| `$HYPERIDLE_WORKSPACES_DIR` or `$TMPDIR/hyperidle-workspaces/<id>/` | `LocalWorkspaceAdapter.spawn` / `createSession` | everything below | `endSession` `fs.rm` + `workspace.destroy`; **kept forever on crash** |
| `<ws>/context/{factory,product,practices}/*`, `context/session.toon` | `materialize()` | agent harness (read-only chmod) | with workspace |
| `<ws>/.fabric/manifest.json` | `materialize()`, `processWriteback` | file watcher / writeback | with workspace |
| `<ws>/knowledge/**` | agent | watcher → `knowledge_items` (version check → `knowledge_conflicts`) | with workspace |
| `<ws>/work/session-notes.md` | `write_session_notes` tool, builtin pre-compaction snapshot | watcher → `sessions.notes` | with workspace |
| `<ws>/CLAUDE.md` | `writeWorkspaceCLAUDEmd` (Phase 8.5) | Claude Code SDK (cwd auto-discovery) | with workspace |
| `<ws>/.mcp.json` | Phase 8b (contains live bridge token + URL) | Claude Code / CLI tools | with workspace |
| `<userData>/credentials.json` (mode 0600) | desktop `safe-credentials.ts` (safeStorage-encrypted) | desktop boot (`readAnthropicKeyFromStore` → env) | user-managed |
| `<userData>/hyperidle-pg/` | PGlite (laptop profile DB) | server | user-managed |
| Docker: `<base>/docker-ws-*` bind-mounted to `/workspace` | DockerWorkspaceAdapter | container | `docker stop` + rm |

**DB tables in scope**: `sessions` (no cost/token columns since O2 — strategy concern; effectiveness_* trio added AC1), `routines`, `routine_runs`, `tasks` (auditTrail JSON), `bets` (costActualMinor, tokensActualJson), `users` (soulPrompt, harnessType, modelTierPreference, maxConcurrentSessions, costActual/costCapMinor), `team_members` (costActual/costCapMinor), `user_skills` (PK user+skill, autonomyLevel, success/failureCount — read by users routes + routine-scheduler delegation; success/failureCount **never written by anything**), `knowledge_items`/`knowledge_conflicts`/`knowledge_edit_log`/`knowledge_strategy_fabric`, `items`, `threads`, `messages`, `artifacts`, `server_credentials`, `factory_settings`.

**`file_leases` does not exist.** No table, no code, no concept anywhere in the repo (grep over all packages). Concurrent file access is mediated only by per-session workspace isolation + version-conflict detection in writeback. (FLAG F7.)

---

## FLAGS

**F1 — CRITICAL: `npm run check` typechecks nothing.** Root `tsconfig.json` has `"include": []` and the check script is `tsc --noEmit -p tsconfig.json` (plain `-p`, not `-b`) — project references are not built, so zero source files are compiled and the gate passes vacuously. Proven: compiling `session-provisioning.ts` + `handoff-to.ts` against real sources yields `TS2741: Property 'traceId' is missing` at `session-provisioning.ts:385` and `handoff-to.ts:54` (`SessionContext.traceId` is required at `session-lifecycle.ts:37`), plus ~100 further strict errors across fabric/db. Every "zero type errors" attestation since this script landed is unsound.

**F2 — CRITICAL: AD2 task dispatcher is dead in production.** `bootstrapFabric` only registers it when `ctx.dispatcherDeps` is set (`fabric/src/bootstrap.ts:77`), but `server-factory.ts:167-181` never passes `dispatcherDeps`, and `setProvisionSessionFn` is only called in tests (`AD2-task-dispatcher.integration.test.ts:65`). Accepted tasks are never auto-dispatched; handoff re-dispatch (`session_ended` handler) never fires; `GET /api/dispatch-queue` always returns an empty queue.

**F3 — CRITICAL: routine scheduler never starts.** `startRoutineScheduler` (`fabric/src/services/routine-scheduler.ts:500`) is exported and tested (AD5 test even says "server-factory.ts calls startRoutineScheduler at boot") but no production call site exists. Calendar/heartbeat routines only run via manual `POST /api/routines/:id/trigger`.

**F4 — Latent crash in scheduler:** `createRoutineSession` (`routine-scheduler.ts:228`) inserts `cost: 0` into `sessions` — that column was dropped in O2. Would throw at runtime the moment F3 is fixed; also a type error masked by F1. It also bare-inserts `state:"active"` sessions with no harness (zombie rows).

**F5 — HIGH: cost over-counting.** `session-provisioning.ts:601` passes `costMinor: totalCostCents` (the **running total**) to `recordCostAndCheck` on *every* `cost_update` event, and `recordCostAndCheck` (`fabric/src/services/cost-cap.ts:224`) **increments** `users.costActual`, `teamMembers.costActual`, and `bets.costActualMinor` by that amount each call. Any session emitting >1 cost_update (the builtin harness emits one per LLM call) inflates spend by the sum of partial totals (e.g. deltas 10,5,5 → recorded 10+15+20=45 instead of 20). Cost caps then trip far too early and bet/agent spend numbers are wrong.

**F6 — HIGH: builtin registry cross-wiring race.** `BuiltinHarnessAdapter.startSession` (`builtin-harness-adapter.ts:210-216`) pairs itself with "the first pre-registered session that hasn't started". Phase 8.5a (`setSessionToolRegistry`) and Phase 9 (`startSession`) are separated by multiple awaits (prompt composition DB reads, MCP bridge creation). Two concurrent builtin provisions A,B can interleave (A.set, B.set, B.start) so B's harness grabs **A's** registry — B's LLM then writes notes/tasks/artifacts under A's sessionId/taskId/workspace.

**F7 — file_leases is fiction.** The audited `file_leases` table/concept does not exist anywhere. Nothing acquires or enforces file leases; cross-session knowledge write conflicts rely solely on manifest version checks → `knowledge_conflicts` rows.

**F8 — POST /api/sessions blocks for the whole agent session.** `provisionSession` runs the full harness loop inside the HTTP handler (`sessions-routes.ts:188`); a 20-minute session = a 20-minute hanging request. Client/proxy timeouts abort the *response* but the loop keeps running with no way to observe completion; no server restart recovery (queue and session loop are in-memory).

**F9 — CLI sessions are invisible to cost accounting.** `CliHarnessAdapter.buildResult` always reports cost 0 / no tokens, and text-mode stdout never produces `cost_update`. aider/goose/opencode sessions burn API spend (their own keys via envMap `{{apiKey}}` = the gateway-resolved key) with zero cap enforcement. Additionally in ndjson mode any line parsing to `{type:...}` is trusted verbatim as a HarnessEvent (`cli-harness-adapter.ts:364`) — a tool (or prompt-injected output) could forge `cost_update`/`error` events.

**F10 — Worker token = full credential exfiltration in shared mode.** Any authenticated user can `POST /api/auth/worker-token` to get the single shared `HYPERIDLE_WORKER_TOKEN`, register a worker with any `harnessType`/`modelProviders`, and receive `dispatch` messages whose `SessionConfig` contains `resolvedModel.apiKey` (the org's Anthropic/OpenRouter key) plus the composed prompt and knowledge context. Worker `id` is attacker-chosen and `pool.register` replaces same-id entries — a malicious worker can also hijack a legitimate worker's identity. No per-worker identity, no revocation short of rotating the env var.

**F11 — Remote dispatch is architecturally incoherent.** `provisionSession` spawns the workspace, materializes knowledge, and writes CLAUDE.md/.mcp.json on the **server's** filesystem, then `RemoteHarnessAdapter.startSession` ships `config.workspacePath` (a server-local path) to the worker, whose `ClaudeAgentSdkAdapter` uses it as `cwd` on a different machine — nonexistent dir, no CLAUDE.md, no knowledge, no MCP config. Remote sessions can't actually work as wired; `mcpBaseUrl` is also `http://localhost:<port>` (`server-factory.ts:155`), unreachable from any remote worker.

**F12 — DockerWorkspaceAdapter and IsolatedHarnessAdapter are dead code in production.** Only `LocalWorkspaceAdapter` (sh -c exec, no isolation) is ever constructed (`server-factory.ts:149`); the isolated adapter is never registered in any pool. The documented "Docker is the production path" exists but is unreachable.

**F13 — Orphaned workspaces accumulate.** Crash path intentionally preserves the workspace but nothing ever GCs them (no startup sweep of `workspaceSnapshot` paths for crashed/old sessions). Crash path also skips `workspace.destroy`, leaking the adapter's in-memory map entry; `LocalWorkspaceAdapter.destroy` later throws "Unknown workspace" for those handles.

**F14 — PATCH /api/sessions/:id desyncs DB from runtime.** Marking a session done/crashed via PATCH performs no harness stop — the agent loop/subprocess keeps running and its later `endSession` overwrites the PATCH. Conversely the legacy bare-insert POST path (no adapters) creates `active` sessions no harness will ever drive.

**F15 — `update_task_status` bypasses the task state machine.** Direct `tasks.state` write with no `VALID_TRANSITIONS` check, no auditTrail entry, no `task_state_changed` event (`skill-tools/update-task-status.ts:1192ff`) — unlike every other state mutation path.

**F16 — handoff doesn't stop the session.** After `handoff_to` commits (session row → done, ownership transferred), the harness loop continues: the agent retains live tools and the workspace; provisioning later re-writes the session row to done/completed. The tool description's "Ends the current session" is not enforced — no abort signal exists from tool → harness.

**F17 — Silent no-ops & stubs in the tool surface.** `score_attention` target=item returns ok but writes nothing (O2); `edit_block` always errors ("not yet implemented"); `route_item`'s computed `view` is returned but no view column is persisted and no event is emitted. `user_skills.successCount/failureCount` have no writer anywhere — read-only dead columns.

**F18 — `session:<id>` WS topic has no authorization** (acknowledged in `ws-broadcaster.ts:103` lore): any authenticated WS client can watch any session's tool-call stream; tool args summaries are scrubbed (`scrubInlineTokens`) + truncated to 512 chars, which limits but doesn't eliminate data exposure across users in shared mode.

**F19 — effectiveness attribution spoofing.** `PATCH /sessions/:id` sets `effectivenessRecordedBy = actor ?? existing.agentId` (`sessions-routes.ts:310`) — when auth context lacks a userId (master API key), scores are silently attributed to the agent itself.

**F20 — `GET /api/workers` master-key only** (`workers.ts:26` compares X-API-Key to `HYPERIDLE_API_KEY` directly) — inconsistent with the bearer-session auth model in shared mode; desktop UI sessions cannot list workers.

Minor notes: `read_inbox` participant filtering is post-hoc in JS over limit×4 rows (misses older matches); `accumulateSessionTokensOnBet` is a non-atomic read-modify-write (acknowledged); `routine_runs` matching by `routineId+outcome="running"` is safe only because coalescing guarantees one running row (documented); `HYPERIDLE_UNSAFE_AGENT_MODE="true"` globally disables Claude SDK permission prompts (deliberate, logged once).
