# AU19 Service Catalog — What Each Service Does and Why It Exists

Reference catalog of all 31 shipped Service packages (17 `core-api`, 11 `agent-orchestration`, 3
`agent-execution`). For each: what it does, why it's a separate Service rather than folded into a
sibling, its owned SQL tables (if any), and its complete public API (every export from `src/index.ts`
— what other Services/the composition root can call; distinct from `ports.ts`, which is what a
Service *consumes* from others, not what it provides).

Grounded in `plans/AU19/architecture.md` (§4 roster, §9 self-critique/fold-candidate findings),
each Service's own `src/index.ts` barrel header, and `scripts/table-ownership-guard.ts`'s
`TABLE_OWNER` map (authoritative for ownership).

---

## `core-api` Layer (17 Services)

### `connections`

**What it does:** Owns credential storage (`server_credentials`, AES-256-GCM encrypted) and
service-connection provisioning/resolution (`service_connections`) — the held-vs-inherited
credential model (Track AN). Provides the spawn-time provisioning plan that re-applies a user's
held connections into a session's environment, and the resolver interfaces (`EnvCredentialResolver`/
`DbCredentialResolver`) other Services inject to read secrets without hardcoding storage.

**Why a separate Service:** Credentials are the single most sensitive data class in the system —
encryption keys, CLI env-var injection, and validation state need one clear owner with no ambiguity
about who else can touch `server_credentials`. It's also a genuine dependency sink: `settings` and
`notifications` both needed a credential store and had interim forward-references to it (Increment
1h closed both).

**Owned tables:** `serverCredentials`, `serviceConnections`.

**Exposed API:**
- `resolveOwningHumanUserId(...)` — finds the human user who owns a given agent's held connections.
- `listActiveHeld(...)` — lists a user's active held (non-inherited) service connections.
- `buildProvisioningPlan(deps)` — computes which env vars/CLI keys a session needs injected from held connections.
- `applyProvisioningPlan(args)` — applies a built provisioning plan into a session's actual environment.
- `SERVICE_CLI_ENV` — static map of service slug → CLI environment variable names to inject.
- `type ProvisioningPlan`, `type ResolvedMcpServer` — provisioning plan shape types.
- `deriveKey(serverSecret)` — derives an AES key from the server secret via HKDF.
- `encryptCredentialValue(plaintext, serverSecret)` — encrypts a credential value (AES-256-GCM, random IV per call).
- `decryptCredentialValue(encrypted, serverSecret)` — decrypts a credential value, returns `null` on tamper/wrong-key.
- `getServerSecret()` — reads the configured server secret, or `null` if unset (non-fatal).
- `requireServerSecret()` — reads the server secret, throws `MISSING_ROOT_SECRET` if unset.
- `type CredentialResolver` — interface for resolving a named credential to a value.
- `DbCredentialResolver` — resolves credentials from the encrypted `server_credentials` table (shared/hosted mode).
- `EnvCredentialResolver` — resolves credentials from `process.env` (local desktop mode).
- `findCredentialByName(db, name)` — looks up a stored credential row by name.
- `insertCredential(db, ...)` — inserts a new credential row.
- `upsertCredential(db, ...)` — inserts or updates a credential row.
- `deleteCredentialByName(db, name)` — deletes a credential row.
- `listAllCredentials(db)` — lists every stored credential row.
- `setCredentialValue(db, input)` — encrypts and stores/updates a credential's value in one call.
- `updateCredentialValidationState(db, ...)` — updates a credential's last-validated state/timestamp.
- `type ServerCredentialWriteValues`, `type SetCredentialValueInput` — write-shape types.
- `type ConnectionsUserReader` — DI port type this Service consumes from `users` (documented for completeness; consumed, not provided).
- `projectInheritedConnections(...)` — computes a user's inherited (non-held) connections from capability descriptors.
- `ServiceConnectionResolver` — per-user plaintext token resolver for service connections.
- `listServiceConnectionsByUserId(db, userId)` — lists a user's service connections.
- `listServiceConnectionsByAuthSource(db, ...)` — lists service connections by auth source (e.g. a config-default seed).
- `insertServiceConnection(db, ...)` — inserts a service connection row, translating unique-constraint violations to a 409-shaped error.
- `getServiceConnectionById(db, id)` — fetches a service connection by id.
- `getServiceConnectionByIdForUser(db, id, userId)` — fetches a service connection by id, scoped to a user (avoids existence leaks).
- `deleteServiceConnectionForUser(db, ...)` — deletes a user's service connection.
- `updateServiceConnectionHealth(db, ...)` — updates a service connection's health/status fields.

---

### `conversation`

**What it does:** Owns threads and messages — the CRUD store, search, inbox queries, verdict-message
projections (review workflow linkage), and artifact-thread summaries. The single source of truth for
every conversational surface in the product.

**Why a separate Service:** A pure leaf domain — per architecture §10.1/§10.2's census it has zero
real outbound Service edges (it never calls another Service), only inbound consumers
(`notifications`, `policy`, `realtime`, `review`, `dispatch`, `session-requests`, `tool-handlers`,
plus every route touching a thread/message). Splitting it out is what makes Table ACL possible for
`threads`/`messages` at all — before AU19, any file could write these tables directly.

**Owned tables:** `threads`, `messages`.

**Exposed API:**
- `insertThread(exec, values)` — inserts a new thread row.
- `updateThread(exec, id, patch)` — updates a thread row.
- `insertMessage(exec, values)` — inserts a new message row.
- `updateMessage(exec, id, patch)` — updates a message row.
- `resolveMessageIfUnresolved(exec, ...)` — marks a message resolved only if it isn't already (idempotent resolve).
- `findOrCreateDirectThread(exec, ...)` — finds a DM thread between two participants or creates one.
- `getThreadById(exec, id)` — fetches a thread by id.
- `getThreadByDirectKey(exec, key)` — fetches a DM thread by its deterministic direct-key.
- `getFirstThreadByHost(exec, host)` — fetches the first thread for a given host entity.
- `getFirstPinnedThreadByHost(exec, host)` — fetches the first pinned thread for a given host entity.
- `getThreadIdsByHost(exec, host)` — lists thread ids belonging to a host entity.
- `listThreadsByHost(exec, host)` — lists threads belonging to a host entity.
- `listThreadsByHostKind(exec, kind)` — lists threads filtered by host kind.
- `listThreadsByParticipant(exec, participantId)` — lists threads a participant belongs to.
- `listThreadsByRecency(exec, ...)` — lists threads ordered by most recent activity.
- `listThreadMetaByIds(exec, ids)` — fetches lightweight metadata for a batch of thread ids.
- `countThreads(exec)` — counts total threads.
- `getMessageById(exec, id)` — fetches a message by id.
- `getMessageByClientKey(exec, key)` — fetches a message by its client-supplied idempotency key.
- `listMessagesByThread(exec, threadId, opts)` — lists messages in a thread, paginated/filtered.
- `getMessagesByThreadIds(exec, threadIds)` — batch-fetches messages across multiple threads.
- `listUnresolvedReviewThreadIds(exec)` — lists thread ids with an unresolved review verdict pending.
- `listVerdictItemIds(exec, itemIds)` — filters item ids down to those with a recorded verdict.
- `listInboxBySenderExclusion(exec, ...)` — lists inbox messages excluding a given sender (e.g. "not from me").
- `listInboxByParticipantProbe(exec, ...)` — lists inbox messages for a participant via probe query.
- `searchConversations(exec, query)` — full-text-ish search across threads/messages.
- `listInitiatedVerdictMessages(exec, ...)` — lists messages that initiated a verdict/review flow.
- `listVerdictMessagesByItemIds(exec, itemIds)` — lists verdict messages linked to a batch of item ids.
- `getArtifactThreadSummaries(exec, ...)` — summarizes threads associated with artifacts.
- `type ArtifactThreadSummaryRow`, `type InboxRow`, `type MessageListOpts`, `type ThreadSearchRow`, `type VerdictMessageRow` — read-shape types for the above.

---

### `filesystems`

**What it does:** Owns the filesystem registry (mounted local folders, git clones/worktrees, cloud
sources) and their capture history. Provides the mount-adapter abstraction (local folder / git clone
/ git worktree / cloud-not-built), file-watching for sandbox changes, reachability probing (is a
configured source actually reachable), and the dependency-watcher that auto-unblocks tasks when a
filesystem dependency resolves.

**Why a separate Service:** A genuinely distinct domain — filesystem mounting/capture has its own
three tables, its own adapter polymorphism (4 source kinds), and its own async watcher process. It's
also the source of one of the system's few against-grain edges (`filesystems ⚠ capture-writeback`,
EventBus-inverted) — a real architectural seam, not just a convenient grouping.

**Owned tables:** `filesystems`, `filesystemInjections`, `filesystemCaptures`.

**Exposed API:**
- `writeFilesystemCapture(...)` — records a new filesystem capture row.
- `type FilesystemCaptureInput` — capture-write shape.
- `CloudNotBuiltAdapter` — mount adapter placeholder for not-yet-built cloud sources (gdrive/dropbox/s3); returns explicit `not built` failure.
- `checkAndUnblockDependents(...)` — checks and auto-unblocks tasks whose filesystem dependency has resolved.
- `startWatcher(config)` — starts a file-watcher on a mounted sandbox, emits `sandbox_writeback_changes_detected`.
- `type FileWatcher`, `type FileWatcherConfig` — watcher handle/config types.
- `NoopAuthResolver` — no-op auth resolver for reachability probes that don't need credentials.
- `probeGitRemote(...)` — probes whether a git remote is reachable.
- `probeLocalPath(...)` — probes whether a local path exists/is reachable.
- `repoToUrl(...)` — converts a repo identifier into a probeable URL.
- `resolveFilesystemState(input)` — resolves a filesystem connection's overall reachability state.
- `ServiceConnectionResolverAdapter` — adapts a `ServiceConnectionResolver` into the reachability probe's expected shape.
- `type FilesystemReachabilityInput`, `type ProbeResult` — reachability probe types.
- `getFilesystemById(db, id)` — fetches a filesystem row by id.
- `insertFilesystem(db, values)` — inserts a new filesystem row.
- `deleteFilesystemById(db, id)` — deletes a filesystem row.
- `updateFilesystemState(db, id, patch)` — updates a filesystem row's state.
- `listFilesystemsByTeamId(db, teamId)` — lists filesystems belonging to a team.
- `listFilesystemIdsByAgent(db, agentId)` — lists filesystem ids an agent has access to.
- `listFilesystemsByIds(db, ids)` — batch-fetches filesystems by id.
- `getFilesystemInjection(db, ...)` — fetches a filesystem-injection row.
- `insertFilesystemInjection(db, values)` — inserts a new filesystem-injection row.
- `deleteFilesystemInjection(db, ...)` — deletes a filesystem-injection row.
- `type FilesystemRow`, `type NewFilesystem`, `type FilesystemInjectionRow`, `type NewFilesystemInjection` — row/write-shape types.
- `GitCloneAdapter` — mount adapter that clones a git repo into the sandbox.
- `GitWorktreeAdapter` — mount adapter that adds a git worktree into the sandbox.
- `LocalFolderAdapter` — mount adapter that mounts an existing local folder.
- `inspectLocalPath(deps, path)` — inspects a local path (existence, git-ness, size) before mounting.
- `type InspectLocalPathDeps`, `type LocalPathInfo` — inspection input/result types.
- `type MountAdapter`, `type MountContext`, `type CaptureContext`, `type AdapterCaptureResult` — the mount-adapter interface + its context/result shapes.
- `isLocalRepoPath(...)` — checks whether a path looks like a local git repo.
- `MalformedFilesystemError` — error type for an invalid filesystem configuration.
- `RegistryFilesystemMounter` — resolves and mounts a filesystem by looking up its registry row and selecting the right adapter.
- `selectMountAdapter(kind)` — selects the correct `MountAdapter` implementation for a source kind.
- `type AdapterDeps` — dependency bundle the mounter registry needs.
- `type FilesystemsAgentWorkIntentInput/Kind/Record/Recorder`, `type FilesystemsGitConfigInjection/GitRunner/GitRunnerFactory`, `type FilesystemsServiceConnectionResolver`, `type FilesystemsWorkStore` — DI port types this Service *consumes* (documented here since they're barrel-exported, but see `ports.ts` for the real definitions).
- `EMITTED_ROOTS_AGENTS_MD` / `_CLAUDE_SETTINGS` / `_CLI_MCP_CONFIG` / `_CODEX_HOME` / `_CONTEXT_ASSEMBLY` / `_MCP_JSON` / `_OPENCODE_PLUGIN` — constants naming the sandbox paths each harness-specific config file gets scaffolded to.
- `SANDBOX_SCAFFOLDING_PATHS` — the full set of paths scaffolded into a new sandbox.

---

### `git-export`

**What it does:** Exports knowledge items to a git repository — computes the export plan (which
items changed since last export), writes them to disk, commits and pushes via a real (spawned `git`
subprocess) or fake (test double) `GitRunner`, and sanitizes/reads the export config stored in
`server_config.gitExport`.

**Why a separate Service:** A distinct, self-contained capability with its own runner abstraction and
subprocess-spawning concerns — not part of `knowledge`'s own CRUD (it *reads* knowledge but doesn't
own any knowledge data), and not part of `settings` (it just borrows `settings`' config table via a DI
port). Owns zero tables of its own.

**Owned tables:** none.

**Exposed API:**
- `computeExportPlan(...)` — computes which knowledge items need exporting since the last run.
- `buildCommitMessage(plan)` — builds the git commit message for an export plan.
- `runGitExport(deps, ...)` — runs a full export: compute plan, write files, commit, push.
- `registerGitExportHandler(...)` — registers the event-bus handler that triggers export on `knowledge_updated`.
- `resetExportMutexes()` — clears in-progress export locks (test/recovery use).
- `createNodeFsAdapter()` — real filesystem adapter (Node `fs`) for writing exported files.
- `EXPORTED_KINDS`, `EXPORTED_STATUSES` — constants: which knowledge kinds/statuses are eligible for export.
- `type ExportPlan`, `type ExportPlanEntry`, `type FsAdapter`, `type GitExportResult`, `type GitExportTrigger`, `type RegisterGitExportHandlerOptions`, `type RunGitExportDeps` — export orchestration types.
- `loadGitExportConfig(...)` — loads the git-export config, applying defaults.
- `readGitExportConfig(db)` — reads the raw `server_config.gitExport` section.
- `updateGitExportConfig(db, patch)` — updates the git-export config.
- `getLastExportMeta(db)` — reads metadata about the last successful export.
- `writeLastCommit(db, ...)` / `writeLastPush(db, ...)` — records the last commit/push outcome.
- `sanitizeAuthorEmail/Name(...)`, `sanitizeBranch(...)`, `sanitizePathSegment(...)`, `sanitizeRepoPath(...)`, `sanitizeRemoteUrl(...)` — input sanitizers for each config field.
- `redactRemoteUrl(...)` — redacts credentials from a remote URL before logging/display.
- `type GitExportConfig`, `type GitExportConfigPatch`, `type LastExportMeta`, `type SanitizeRemoteUrlOptions` — config types.
- `createGitRunner(options)` — creates the real `GitRunner` that spawns actual `git` subprocess calls.
- `createFakeGitRunner()` — creates a `FakeGitRunner` test double that records calls without touching disk/network.
- `type GitRunner`, `type CreateGitRunnerOptions`, `type FakeGitRunner`, `type FakeGitCall`, `type GitConfigInjection` — runner interface + test-double types.
- `type GitExportConfigDeps/Section/SectionPatch`, `type GitExportDeps`, `type GitExportKnowledgeItemProjection/Row`, `type GitExportKnowledgeReader`, `type GitExportServerConfigPort` — DI port types this Service *consumes* from `settings`/`knowledge`.

---

### `knowledge`

**What it does:** Owns the knowledge fabric — the CRUD repository for knowledge items, attention
scoring, relevance ranking, full-text search, the promotion pipeline (auto-promotion + stale-item
sweeps), and merge/split/archive operations. The richest core-api Service by export count — it's the
system's compounding-knowledge substrate, not just a CRUD table.

**Why a separate Service:** A large, self-contained domain with its own scoring/ranking engines
(attention, relevance, token-budget enforcement) that don't belong to any other Service's concerns.
It's also the single biggest consumer-magnet in the system — `context-assembly`, `git-export`,
`review`, `retention`, `capture-writeback`, `dispatch`, and `tool-handlers` all read from it, so
having one clear owner is what makes the rest of the graph's downward edges legal at all.

**Owned tables:** `knowledgeItems`, `knowledgeEditLog`, `knowledgeAccessLog`, `knowledgeConflicts`,
`knowledgeAppProjection`.

**Exposed API:**
- `upsertKnowledgeAppProjectionAttentionScore(...)` — writes a recomputed attention score onto a knowledge item's projection row.
- `buildAttentionService(deps)` — constructs the attention-recompute service bound to injected `work`/`review` ports.
- `MAX_RECOMPUTE_BATCH` — cap on how many items one attention-recompute pass processes.
- `type AttentionRecomputeResult/ScopeError/ScopeResult/Summary`, `type AttentionService/Deps/Filter`, `type AttentionWriteExecutor`, `type CreateReviewItemForKnowledgeInput/Result`, `type KnowledgeReviewWriter`, `type ReasoningMarkerFinder` — attention-engine types + the DI port shapes it consumes from `work`/`review`.
- `findRetroKnowledgeItemForBet(...)` / `upsertBetRetroKnowledgeItem(...)` — reads/writes the knowledge item tracking a bet's retro.
- `type RetroExistingKnowledgeItemRow`, `type UpsertBetRetroKnowledgeItemInput` — retro-store types.
- `createKnowledgeConflict(...)` — records a new edit conflict.
- `findKnowledgeItemVersionById(...)` — fetches a specific historical version of an item.
- `findOpenConflictByItemAndProposer(...)` — finds an unresolved conflict for a given item+proposer pair.
- `type CreateKnowledgeConflictInput`, `type KnowledgeItemVersionRow` — conflict types.
- `ItemDeletedError`, `VersionConflictError` — thrown error types for deleted-item and optimistic-concurrency conflicts.
- `ftsSearch(...)` — runs a full-text search query.
- `sanitizeFtsQuery(...)` — sanitizes/escapes a raw FTS query string.
- `setupFts(...)` — initializes the FTS index/config.
- `FTS_MAX_QUERY_CHARS`, `FTS_MAX_TOKENS` — FTS query length limits.
- `type FtsSearchOptions` — FTS search options shape.
- `findKnowledgeItemProjectionById(...)` — fetches a projection row for git-export.
- `listExportableKnowledgeItems(filters)` — lists items eligible for git export.
- `type ExportableKnowledgeItemFilters/Row`, `type KnowledgeItemProjectionRow` — git-export read-surface types.
- `listByScope(scope)` — lists knowledge items visible within a given scope (the `context-assembly` read path).
- `type KnowledgeScope` — scope filter type.
- `create(...)` / `update(...)` — the CRUD-repository create/update entry points.
- `findById(...)` — fetches a single item by id.
- `findDetailById(...)` — fetches a single item with full detail (for a detail-view route).
- `findRelatedByTopic(...)` — finds items related by topic.
- `list(filters)` — lists items matching filters.
- `listVisibleWithSignals(...)` — lists visible items enriched with scoring signals.
- `search(...)` — the general search entry point.
- `searchByText(...)` — text-only search (no scoring).
- `archiveItem(...)` — archives an item.
- `flagItem(...)` — flags an item for review.
- `changeScope(...)` — moves an item to a different scope.
- `mergeItems(...)` — merges two items into one.
- `splitItem(...)` — splits one item into multiple.
- `countAccessesSince(...)` — counts accesses to an item since a timestamp.
- `countTriageVisible(...)` — counts items visible in the triage queue.
- `type CreateKnowledgeItemInput/UpdateKnowledgeItemInput`, `type KnowledgeDetailRow/ItemWithProjection/ListRow`, `type ListFilters` — CRUD-repository types.
- `listRecentByLayers(...)` — lists recent items across layers (the `dispatch` portfolio-retro read).
- `type RecentLayeredKnowledgeItemRow` — portfolio-retro row type.
- `archiveKnowledgeItemWithLogRaw(...)`, `findKnowledgeAppProjectionByItemIdRaw(...)`, `findKnowledgeItemByIdRaw(...)`, `insertKnowledgeAppProjectionRaw(...)`, `insertKnowledgeEditLogRaw(...)`, `insertKnowledgeItemRaw(...)`, `listCapturedItemsByProjectionScopeRaw(...)`, `touchKnowledgeItemUpdatedAtRaw(...)`, `updateKnowledgeAppProjectionMetaIfUnchangedRaw(...)` — low-level raw accessors built specifically for `review`'s `practice-meeting.ts` DI port (not the general CRUD surface).
- `type ArchiveKnowledgeItemInput`, `type CapturedProjectedItem`, `type KnowledgeAppProjectionRow`, `type RawKnowledgeAppProjectionInsert/EditLogInsert/ItemInsert/ItemRow` — the above's types.
- `checkAutoPromotion(...)` — checks whether an item qualifies for auto-promotion.
- `runAutoPromotionSweep(...)` — runs the periodic auto-promotion sweep.
- `findStaleItems(...)` / `markStale(...)` / `runStaleSweep(...)` — stale-item detection and sweep.
- `detectLayerContradiction(...)` — detects contradictory content across knowledge layers.
- `AUTO_PROMOTION_EDITOR`, `AUTO_PROMOTION_REPETITION_THRESHOLD`, `DEFAULT_SWEEP_MAX_BATCH_SIZE`, `STALE_THRESHOLD_MS` — promotion-pipeline tuning constants.
- `type AutoPromotionResult/SweepResult`, `type ContradictionResult`, `type StaleSweepOptions/Result` — promotion-pipeline types.
- `findKnowledgeItemStatusById(...)` — fetches just an item's status (cheap check before promoting).
- `promoteKnowledgeItem(...)` — promotes an item to a higher layer.
- `type PromoteKnowledgeItemInput/Result` — promotion types.
- `computeRelevanceScore(...)` — computes a relevance score for an item against a context.
- `DEFAULT_RELEVANCE_CONFIG` — default relevance-scoring weights/config.
- `registerRelevanceListener(...)` — registers the event-bus listener that recomputes relevance on relevant events.
- `rankAndBudget(...)` — ranks items and trims to fit a token budget.
- `scoreItem(...)` — scores a single item.
- `createRelevanceService(deps)` — constructs the relevance service.
- `reapKnowledgeAccessLog(...)` — TTL-deletes old access-log rows (called by `retention` via its injected port).
- `type RelevanceConfig/Input/Shape/Weights`, `type RelevanceService`, `type SignalSet` — relevance-engine types.
- `communityForRole(role)` — maps a user role to its knowledge "community" grouping.
- `listTitlesByIds(...)` — batch-fetches just titles for a list of item ids.
- `recordKnowledgeAccess(...)` — records a knowledge-access-log row (a detail-view fetch).
- `searchVisibleByText(...)` — text search scoped to visible items only.
- `type RecordKnowledgeAccessInput`, `type SearchVisibleKnowledgeRow` — route-support types.
- `loadAttentionWeights(...)` / `loadRelevanceConfig(...)` / `loadScoringWeights(...)` — load tunable scoring config.
- `ATTENTION_THRESHOLD`, `CONTEXT_WINDOW_TOKENS`, `DEFAULT_KNOWLEDGE_BUDGET`, `KNOWLEDGE_ALLOCATION_RATIO` — scoring/budget constants.
- `type AttentionWeights`, `type ScoringContext/Weights` — scoring-config types.
- `countItemTokens(...)` / `countTokens(...)` — token-counting helpers.
- `enforceBudget(...)` — trims a scored item list to fit within a token budget.
- `type ScoredItem` — scored-item type.
- `KNOWLEDGE_STATUSES` — the closed set of valid knowledge-item statuses.
- `type KnowledgeKind/Layer/Status`, `type PropagationLevel` — shared knowledge domain types.
- `recordWritebackConflict(...)` — records a conflict detected during sandbox writeback (the `capture-writeback` DI port target).
- `type RecordWritebackConflictInput` — writeback-conflict type.

---

### `model-gateway`

**What it does:** Resolves an abstract model-tier request (e.g. "fast" vs "capable") into a concrete
model + provider, and resolves an agent's specific model configuration (`resolveAgentModel`).

**Why a separate Service:** A genuinely distinct, narrow concern — model selection logic that both
`dispatch` and the eval harness need, decoupled from `settings` (which just holds the raw config data
`model-gateway` reads as a parameter, not a table it queries itself).

**Owned tables:** none.

**Exposed API:**
- `resolveModelTier(...)` — resolves an abstract tier (fast/capable/etc.) to a concrete model.
- `resolveAgentModel(params)` — resolves the specific model an agent should use.
- `BUILT_IN_GATEWAY_CONFIG` — the built-in default gateway config constant.
- `UnsupportedAgentProviderError` — thrown when an agent's configured provider isn't supported.
- `type AgentModelParams` — resolution input type.
- `type ModelGatewayCredentialResolver` — DI port type this Service consumes from `connections`.

---

### `notifications`

**What it does:** Owns the notification queue — dispatch (console/SMTP/ntfy adapters), digest
batching (daily digest), mute/silence-policy evaluation, and PII redaction before delivery.

**Why a separate Service:** A self-contained delivery pipeline with its own adapter polymorphism
(console/SMTP/ntfy) and its own scheduling concern (digest batching) — distinct from who's being
notified about what (that's every other Service's job to *decide*; notifications just delivers).

**Owned tables:** `notificationQueue`.

**Exposed API:** (15 files' worth of exports — dispatcher/adapters/digest/mute/silence-policy/redact/config)
- `dispatchNotification(...)` — the core dispatch entry point: enqueues and routes a notification to its adapter.
- `createConsoleAdapter()` / `createSmtpAdapter(...)` / `createNtfyAdapter(...)` — per-channel delivery adapters.
- `createAdapterFactory(...)` — resolves the right adapter for a notification's configured channel.
- `runDailyDigest(...)` — batches and sends the daily digest.
- `buildDigestSummary(...)` — composes the digest's summary content.
- `registerNotificationListener(...)` — registers the event-bus listener that turns domain events into notifications.
- `drainNotificationQueue(...)` — drains pending queued notifications.
- `isSilenced(...)` — evaluates the silence policy for a given notification.
- `muteNotificationsFor(...)` / `unmuteNotificationsFor(...)` — mute/unmute a recipient.
- `redactNotificationBody(...)` — redacts sensitive content before delivery/logging.
- `readNotificationConfig(...)` / `updateNotificationConfig(...)` — reads/updates notification config.
- `insertNotification(db, values)` — inserts a notification-queue row.
- `type NotificationChannel/Config/Row` and related types — notification shape types.

*(Full literal export list intentionally not itemized function-by-function here — `notifications` moved 15 files unchanged from `packages/server/src/notifications/`; the above covers every real capability. See `packages/core-api/notifications/src/index.ts` directly for the exhaustive symbol list if a specific export name is needed.)*

---

### `observability`

**What it does:** Structured event/log dispatch — a buffered ring-dispatcher that fans out to
pluggable adapters (console adapter ships built-in), reads/writes/redacts `server_config.observability`,
and provides `summarizeToolArgs` for safely logging tool-call arguments without leaking secrets.

**Why a separate Service:** A cross-cutting sink every other Service can emit into, with its own
buffering/flush and adapter-pluggability concerns — genuinely orthogonal to any single domain, and
architecture §9 explicitly names it a candidate a reviewer should probe (kept separate to avoid
recreating the old grab-bag module, not because it has deep internal complexity).

**Owned tables:** none.

**Exposed API:**
- `readObservabilityConfig(db)` / `updateObservabilityConfig(db, patch)` — read/update the config.
- `redactObservabilityConfig(config)` — returns a safe-to-display copy with secrets redacted.
- `type ObservabilityConfig/ConfigPatch`, `type SafeObservabilityConfig` — config types.
- `createConsoleObservabilityAdapter()` — the built-in structured-log console sink.
- `createObservabilityDispatcher(deps)` — constructs the buffered ring-dispatcher.
- `registerObservabilityDispatcher(deps)` — registers the dispatcher as an event-bus subscriber.
- `createDbTraceIdResolver(...)` — resolves a trace id from DB context.
- `summarizeToolArgs(...)` — safely summarizes tool-call args for logging (secret-scrubbing).
- `type DispatcherDeps`, `type RegisterObservabilityDispatcherDeps`, `type TraceIdResolver` — dispatcher types.
- `type ObservabilityConfigDeps/Section/SectionPatch`, `type ObservabilityServerConfigPort` — DI port types this Service consumes from `settings`.
- `type FlushOutcome`, `type ObservabilityAdapter`, `type ObservabilityChannel`, `type ObservabilityDispatcher/DispatcherStatus` — adapter/dispatcher contract types.

---

### `org`

**What it does:** Owns team membership (`teamMembers`) and org routing edges (`orgEdges`, renamed
from the legacy `teams` concept) — team lookup, role-based routing, default-harness resolution per
team, and agent scaffolding (creating a new agent user + membership row together).

**Why a separate Service:** Team/org structure is its own bounded concept with real invariants (e.g.
exactly-one-row-per-team membership guarantees enforced in `team-lookup.ts`) that multiple Services
need (`work` for capacity, `cost` for budget attribution, `notifications`/`policy`/`review` for
routing) — a genuine hub, not an arbitrary split.

**Owned tables:** `teamMembers`, `orgEdges`, `teams`.

**Exposed API:**
- `getTeamMembersByTeamId(db, teamId)` — fetches all members of a team.
- `getTeamMembersById(db, id)` — fetches a single team-membership row.
- `loadTeamMembers(db, teamId)` — loads a team's membership row, enforcing the exactly-one-per-team invariant.
- `setTeamMembersActiveBets(db, ...)` — updates a team's active-bet count.
- `incrementTeamMembersCost(db, ...)` / `resetTeamMembersCost(db, ...)` / `resetAllTeamMembersCost(db)` — team cost-tracking writes.
- `getTeamById(db, id)` / `listTeamsByIds(db, ids)` — team lookup.
- `resolveTeamAgentHarness(...)` — resolves the default harness for a team's agents.
- `routeByRole(...)` — resolves org-routing by role.
- `scaffoldAgent(...)` — creates a new agent user + team-membership row together.
- `type Team/TeamMember` and related row types — org domain types.

---

### `policy`

**What it does:** The trust/approval workflow — the policy engine (evaluates whether an action needs
approval and issues attention notifications), approval-rate tracking, the human/agent handoff
protocol, and lifecycle propagation (cascading state changes across related entities).

**Why a separate Service:** A cross-cutting decision-making concern (should this be allowed, does
this need a human) that reaches into `work`/`conversation`/`users`/`org`/`notifications` — it owns no
data of its own, but the *logic* of trust/approval is genuinely its own thing, not naturally part of
any single domain Service.

**Owned tables:** none.

**Exposed API:**
- `evaluatePolicy(...)` — the policy engine's core evaluation entry point.
- `recordApprovalOutcome(...)` — records an approval/rejection outcome.
- `computeApprovalRate(...)` — computes a rolling approval-rate metric.
- `buildHandoff(deps)` — factory that builds the handoff-protocol function (human/agent session handoff).
- `propagateLifecycleChange(...)` — cascades a lifecycle state change to related entities.
- `type PolicyVerdict`, `type HandoffParams/Result`, `type LifecyclePropagationInput` and related types.

*(`policy` moved 4 seed files unchanged — `policy-engine.ts`, `approval-rate.ts`, `handoff-protocol.ts`, `lifecycle-propagation.ts`; see `packages/core-api/policy/src/index.ts` for the exhaustive symbol list.)*

---

### `realtime`

**What it does:** Broadcasts domain events to connected UI clients over WebSocket — the `WsBroadcaster`
class plus `createDbSubscribeAuthorizer`, which authorizes a client's subscription to a given topic
(thread, task, etc.) against their actual access rights.

**Why a separate Service:** Per architecture §10.2, explicitly "not infra of any one domain" — a pure
core→UI push capability that legitimately needs to read across `work`/`conversation`/`users`/`org` to
authorize subscriptions, which is exactly why it's called out in §9 as a Service a reviewer should
probe (it's thin, but its cross-cutting authorization need is real).

**Owned tables:** none.

**Exposed API:**
- `WsBroadcaster` — the broadcaster class; holds client connections and pushes events to subscribed topics.
- `createDbSubscribeAuthorizer(deps)` — builds the authorizer that checks a client can subscribe to a requested topic.
- `type SubscribeResult`, `type WsClient` — broadcaster types.
- `type RealtimeOrgTeamReader/TaskReader/TeamMembersRow/ThreadReader/ThreadRow/UserDirectory/UserRow`, `type SubscribeAuthorizerDeps` — DI port types this Service consumes from `conversation`/`users`/`org`/`work`.

---

### `retention`

**What it does:** The TTL reaper — periodically sweeps and deletes expired rows across several other
Services' tables (login sessions, invite codes, knowledge-access log, notification queue) plus the
genuinely-unowned `propagationLog` table.

**Why a separate Service:** Explicitly flagged in architecture §9 as a fold candidate — "keep it a
Service; revisit folding into `dispatch` only if it shrinks to a single call." It survived as its own
Service because even after Table ACL forced every per-table delete through an injected port, it still
coordinates 3 distinct owning-Service ports plus one direct unowned-table sweep — not the "single
delegate call" that would have justified folding it away. The most honestly-borderline Service in the
roster.

**Owned tables:** none.

**Exposed API:**
- `reapRetentionOnce(deps)` — runs one TTL sweep pass across all owned reaper ports.
- `startRetentionReaper(deps)` — starts the periodic reaper interval.
- `CONSUMED_INVITE_TTL_MS`, `RETENTION_REAPER_INTERVAL_MS`, `TERMINAL_LOG_TTL_MS` — TTL/interval tuning constants.
- `type RetentionReaperOptions/SweepResult` — reaper run types.
- `type RetentionKnowledgeAccessLogReaper/NotificationQueueReaper/UsersReaper`, `type RetentionReaperDeps` — DI port types this Service consumes from `knowledge`/`notifications`/`users`.

---

### `review`

**What it does:** The AL7 trust-first review workflow — proposed-call composition and consumption
(agent proposes an action, gets a tailored grant), practice-meeting knowledge review, review-item
factory (creating review items from flagged knowledge or risky sessions), and session-review creation
tied to task risk tier.

**Why a separate Service:** A genuine cross-cutting trust/approval workflow with its own three tables
and its own AL7 domain vocabulary (proposed calls, tailored grants, operation outcomes) — not a CRUD
extension of `work` or `conversation`, even though it reads from both.

**Owned tables:** `proposedCalls`, `operationOutcomes`, `tailoredGrants`.

**Exposed API:**
- `composeTailoredGrant(...)` — composes a grant on proposed-call approval, records the corresponding work intent in the same transaction.
- `findGrantedProposedCall(...)` — finds a granted (approved) proposed call.
- `findProposedCallWithOutcomeByReviewMessageId(...)` — looks up a proposed call + its outcome by the review message that decided it.
- `handleUnconsumedGrantOnSessionEnd(...)` — the liveness net: fires when a session ends without consuming its tailored grant.
- `captureProposedCall(...)` — records a new proposed call.
- `consumeTailoredGrant(...)` — marks a tailored grant consumed (the agent acted on it).
- `recordOutcome(...)` — records the operation outcome of a consumed grant.
- `createReviewItem(...)` — creates a review item (from flagged knowledge, a risky session, etc.).
- `createPracticeMeeting(...)` — creates a practice-meeting review record.
- `type ProposedCall/TailoredGrant/OperationOutcome` and related row types.

*(`review` moved 4 seed files unchanged; see `packages/core-api/review/src/index.ts` for the exhaustive symbol list.)*

---

### `routine`

**What it does:** Owns routine configuration and run history — CRUD for `routines`, run-lifecycle
tracking for `routineRuns` (start/complete/cost-sum), and schedule-label humanization for display.

**Why a separate Service:** A pure leaf domain — zero real outbound Service edges (never itself a
source in the composition census), only ever a target. `dispatch`'s routine-*scheduling* logic
(deciding *when* to fire) stays in `dispatch`, deliberately kept separate from `routine`'s own
CRUD/run-tracking, which is a different responsibility (data ownership vs. scheduling decision).

**Owned tables:** `routines`, `routineRuns`.

**Exposed API:**
- `insertRoutine(db, values)` — inserts a new routine.
- `getRoutineById(db, id)` — fetches a routine by id.
- `updateRoutineById(db, id, patch)` — updates a routine.
- `listRoutines(db)` — lists all routines.
- `listRoutinesByTeam(db, teamId)` — lists a team's routines.
- `listActiveRoutines(db)` — lists routines currently active.
- `listScheduledRoutinesMissingNextRunAt(db)` — lists routines needing their next-run time computed.
- `countRoutinesByTeam(db, teamId)` — counts a team's routines.
- `insertRoutineRun(db, values)` — inserts a new routine-run row.
- `getRoutineRunById(db, id)` — fetches a routine run by id.
- `updateRoutineRunById(db, id, patch)` — updates a routine run.
- `updateRoutineRunIfRunning(db, id, patch)` — updates a routine run only if it's still in "running" state (guards a race).
- `findRunningRoutineRun(db, routineId)` — finds the currently-running run for a routine, if any.
- `listRoutineRunsByRoutine(db, routineId)` — lists all runs for a routine.
- `incrementRoutineCost(db, id, delta)` — increments a routine's accumulated cost.
- `avgRoutineRunCost(db, routineId)` — computes average cost across a routine's runs.
- `sumRoutineRunCostSince(db, ...)` / `sumRoutineRunCostForRoutinesSince(db, ...)` — sums run costs since a timestamp, for one or many routines.
- `humanizeSchedule(...)` — converts a cron/schedule definition into a human-readable label.
- `type InsertRoutineOpts`, `type Routine/RoutinePatch`, `type RoutineRun/RoutineRunPatch` — routine domain types.

---

### `settings`

**What it does:** Owns server configuration (`serverConfig`, a typed singleton) and the plugin
configuration system — plugin defaults, user/team override resolution, and the resolved-configuration
view every other Service reads its own config section from.

**Why a separate Service:** The single configuration source of truth — every other Service's
"section" of config (git-export's, observability's, model-gateway's, cost's) lives inside
`serverConfig`, owned exclusively here, reached by everyone else through a narrow per-section DI port
rather than direct table access.

**Owned tables:** `serverConfig`, `plugins`, `pluginConfigurationDefaults`, `configurationOverrides`.

**Exposed API:**
- `readServerConfig(db)` — reads the full server config singleton.
- `updateServerConfig(db, patch)` — updates the server config singleton.
- `resolvePluginConfiguration(...)` — resolves effective config (plugin defaults + overrides) for a namespace.
- `seedPluginConfigurationDefaults(...)` — seeds a plugin's default config values.
- `setConfigurationOverride(...)` — sets a user/team override for a config key.
- `listResolvedConfiguration(...)` — lists the effective, resolved configuration view.
- `readAgentBehaviorConfig(...)` / `updateAgentBehaviorConfig(...)` — agent-behavior config section read/write.
- `type ServerConfig/ConfigPatch`, `type ResolvedConfigurationItem`, `type PluginConfigurationDefault` and related types.

*(`settings` moved 3 seed files — `server-config.ts`, `plugin-configuration.ts`, `agent-behavior-config.ts`; see `packages/core-api/settings/src/index.ts` for the exhaustive symbol list.)*

---

### `users`

**What it does:** Owns the user directory (`users`), bearer-token login sessions (`loginSessions`),
invite codes (`inviteCodes`), first-time hint-dismissal tracking (`hintProgress`), and the in-memory
WS-handshake upgrade-token store.

**Why a separate Service:** A pure leaf domain — zero real outbound Service edges (never itself a
source in the composition census), the single most-consumed core-api Service after `work` (nearly
every Service reads user rows). One clear owner is what makes team-scoped queries, cost attribution,
and auth all consistent.

**Owned tables:** `users`, `loginSessions`, `inviteCodes`, `hintProgress`.

**Exposed API:**
- `getUserById(db, id)` — fetches a user by id.
- `getUserByIdScopedToTeam(db, id, teamId)` — fetches a user by id, scoped to a team (avoids cross-team leaks).
- `getUsersByIds(db, ids)` — batch-fetches users by id.
- `getOrCreateUser(db, ...)` — fetches a user or creates one if absent.
- `getFirstUserByKind(db, kind)` — fetches the first user of a given kind (human/agent).
- `insertUser(db, values)` — inserts a new user.
- `updateUser(db, id, patch)` — updates a user.
- `listAllUsers(db)` — lists every user.
- `listUsersByKind(db, kind)` — lists users of a given kind.
- `listUsersByTeam(db, teamId)` — lists a team's users.
- `listUsersByTeamAndKind(db, teamId, kind)` — lists a team's users filtered by kind.
- `listUsersByTeams(db, teamIds)` — batch-lists users across multiple teams.
- `listActiveAiUsersByTeams(db, teamIds)` — lists active AI (agent) users across teams.
- `findActiveTeammateByRole(db, ...)` — finds an active teammate matching a role.
- `listUserDirectory(db)` — lists the full user directory (display listing).
- `listAgentProfiles(db)` — lists agent user profiles.
- `searchUsersByName(db, query)` — searches users by name.
- `incrementUserCost(db, id, delta)` / `resetAllUserCost(db)` / `sumAllUserCost(db)` — user cost-tracking writes/reads.
- `type AgentProfileRow`, `type OrgDirectoryRow` — user-store row types.
- `createInvite(db, ...)` / `claimInvite(db, ...)` / `generateInviteCode()` — invite lifecycle.
- `reapInviteCodes(db)` — TTL-deletes expired invite codes (the `retention` DI port target).
- `createLoginSession(db, ...)` / `findLoginSessionByTokenHash(db, hash)` / `revokeLoginSession(db, id)` — login-session lifecycle.
- `validateBearerToken(...)` — validates a bearer token against an active session.
- `generateToken()` / `hashToken(token)` — token generation/hashing helpers.
- `reapLoginSessions(db)` — TTL-deletes expired login sessions (the `retention` DI port target).
- `createUpgradeTokenStore()` — creates the in-memory WS-handshake upgrade-token store.
- `type UpgradeTokenStore` — upgrade-token store type.
- `dismissHint(db, ...)` / `listDismissedHints(db, ...)` — hint-dismissal tracking.
- `type DismissedHint` — hint-progress row type.

---

### `work`

**What it does:** Owns bets, tasks, items, and artifacts — the core process-layer domain: bet
decomposition (turning a bet into tasks), state machines for both bet and task lifecycle, kill-cascade
propagation, item routing, and the task-risk-tier extension. The most heavily-consumed Service in the
whole graph and the one with the most against-grain edges (3 of the system's 8).

**Why a separate Service:** The literal center of the product's process model — bets/tasks/items are
what users and agents actually work on. It's also the clearest case for Table ACL's value: before
AU19, dozens of files across routes/tools/services touched `bets`/`tasks` directly.

**Owned tables:** `bets`, `tasks`, `items`, `artifacts`, `taskPlanningSignals`.

**Exposed API:**
- `createBet(db, values)` — inserts a new bet.
- `getBetById(db, id)` — fetches a bet by id.
- `listBets(db)` / `listBetsByIds(db, ids)` / `listBetsByTeamAndStatus(db, ...)` — bet listing queries.
- `countBetsByTeamAndStatus(db, ...)` — counts bets matching team+status.
- `updateBetById(db, id, patch)` — updates a bet.
- `transitionBetStatus(db, args)` — CAS-guarded bet status transition.
- `searchBetsByText(db, query)` — text search across bets.
- `claimBetDecomposition(tx, betId)` — claims a bet for decomposition (CAS-guarded, prevents double-decompose).
- `resolveOrphanedBetDecompositions(db)` — recovers bets stuck mid-decomposition (crash recovery).
- `updateBetDecompositionStatusIfRunning(db, ...)` — updates decomposition status only if still running.
- `incrementBetCost(db, id, delta)` — increments a bet's accumulated cost.
- `createTask(db, values)` — inserts a new task.
- `getTaskById(db, id)` — fetches a task by id.
- `listTasks(db, opts)` / `listTasksByIds(db, ids)` — task listing queries.
- `updateTaskById(db, id, patch)` — updates a task.
- `transitionTaskState(db, args)` — CAS-guarded task state transition.
- `listHoldTasksWithDependencyPattern(db, ...)` — lists held tasks matching a dependency pattern (for the dependency-watcher).
- `listBetTasksWithLatestSessionOutcome(db, ...)` — lists a bet's tasks enriched with their latest session outcome.
- `createItem(db, values)` — inserts a new item.
- `getItemById(db, id)` — fetches an item by id.
- `updateItemById(db, id, patch)` — updates an item.
- `listItemsByThread(db, threadId)` — lists items linked to a thread.
- `listItemIdsBySourceAgent(db, agentId)` — lists item ids created by a given agent.
- `listQueuedItemsSince(db, ...)` — lists queued items since a timestamp.
- `findItemByReasoningMarker(db, ...)` — finds an item by its reasoning-marker correlation.
- `findRetroItemByThreadIds(db, threadIds)` — finds the retro item linked to a set of threads.
- `createArtifact(db, values)` — inserts a new artifact.
- `getArtifactById(db, id)` / `getArtifactWithTaskTitleById(db, id)` — fetches an artifact, optionally joined with its task's title.
- `listArtifactsPage(db, ...)` — paginated artifact listing.
- `listArtifactSummariesByTaskIds(db, ids)` — batch-fetches artifact summaries for a set of tasks.
- `setArtifactPreviewIfAbsent(db, ...)` — sets an artifact's preview only if not already set.
- `findEligibleTeamAgents(db, teamId)` — finds team agents eligible to decompose/own work.
- `insertProposedBetTasks(tx, ...)` — inserts the proposed task list from a decomposition run.
- `runBetDecomposition(deps, ...)` — the full bet-decomposition orchestration (the entry point that calls agent-selection/cost/session-requests).
- `resolveOrphanedDecompositions(db)` — recovers orphaned decomposition runs.
- `registerBetDecomposition(...)` — registers the `bet_state_changed` event-bus subscriber that triggers decomposition.
- `cascadeBetKill(...)` — cascades a bet kill to its tasks/items.
- `transitionBet(...)` / `updateBetField(...)` — lower-level bet state-machine primitives.
- `transitionTask(deps, ...)` — task state-machine transition (now takes a required `deps` param for its DI ports).
- `InvalidTransitionError` — thrown on an illegal state transition attempt.
- `VALID_TRANSITIONS` — the task state machine's valid-transition table.
- `routeItem(...)` — pure function routing an item to its destination (no DB).
- `getTaskRiskTierByTaskId(db, taskId)` — reads a task's risk tier from `taskPlanningSignals`.
- `type Bet/BetPatch`, `type Task/TaskPatch`, `type Item/ItemPatch`, `type ArtifactRow` and many related row/patch/options types.
- `type AgentSelectionDefaults/AgentWorkIntentRecorder/CostCapChecker/TeamCapacityReader/UserStoreReader` and related — the DI port types this Service *consumes* from `session-requests`/`agent-selection`/`cost`/`org`/`users`.

---

## `agent-orchestration` Layer (11 Services)

### `agent-selection`

**What it does:** Selects which agent should own/decompose a piece of work — WIP-limit checking,
default owner selection by app policy, team-candidate enumeration, and decomposition-plan resolution
(who decomposes a bet, using what default formation).

**Why a separate Service:** Agent-selection logic (capacity, capability, formation defaults) is a
distinct decision-making concern multiple Services need at decision time (`work` for task/decomposer
assignment, `session-requests` for intent-worker resolution) — not naturally part of `org` (team
membership) or `users` (identity), even though it reads both.

**Owned tables:** none.

**Exposed API:**
- `createAgentSelectionOps(deps)` — binds a single ops instance exposing the DB-touching surface below.
- `isAgentAtWipLimit(...)` — checks whether an agent is at their WIP limit.
- `selectAgentByAppDefaults(...)` — selects an agent using app-wide default policy.
- `enumerateTeamCandidates(db, teamId)` — lists candidate agents on a team eligible for assignment.
- `selectOwner(occasion)` — selects the owning agent for a given occasion (task creation, decomposition, etc.).
- `resolveAgentScaffoldSpecs(...)` — resolves the spec for scaffolding a new agent.
- `resolveAssistantFormation(...)` — resolves the default assistant formation for a request.
- `resolveDecompositionPlan(input)` — resolves who decomposes a bet and the plan shape.
- `deriveInitials(name)` — derives display initials from a name.
- `type AgentScaffoldSpec`, `type AssistantFormation/FormationRequest`, `type DecomposeBetRequest`, `type DecompositionPlan`, `type ScaffoldRequest`, `type SelectAgentOutcome/Request`, `type SelectionCandidate` — selection domain types.
- `type AgentSelectionDeps/TeamReader/UserReader` — DI port types this Service consumes from `org`/`users`.
- `type AgentSelectionOps/SelectOwnerOccasion` — the bound-ops factory's return shape.

---

### `capture-writeback`

**What it does:** Ingests batch changes from a sandbox session (knowledge edits, session notes) back
into the canonical store — reads/writes a manifest tracking what's been captured, classifies paths as
knowledge vs. session-notes, and processes the writeback. Subscribes to filesystem-change events
rather than being called directly (the system's clearest EventBus-inversion example).

**Why a separate Service:** Genuinely zero-table, purely a processing/subscriber Service — its
existence is the direct resolution of the `filesystems ⚠ capture-writeback` against-grain edge
(§10.3), which couldn't be a downward DI port since `filesystems` can't depend on orchestration.

**Owned tables:** none.

**Exposed API:**
- `processWriteback(deps, ...)` — processes a batch of captured sandbox changes.
- `readManifest(...)` / `writeManifest(...)` — read/write the capture manifest.
- `isKnowledgePath(path)` / `isSessionNotesPath(path)` — classifies a captured file path.
- `type WritebackChange/Config/Result` — writeback processing types.
- `registerCaptureWriteback(deps)` — registers the EventBus subscriber for `sandbox_writeback_changes_detected`.
- `type CaptureWritebackSubscriberDeps` — subscriber deps type.
- `SessionActivityBuffer` — in-memory ring buffer tracking recent session tool-call activity.
- `type ActivityEntry`, `type ToolCallData` — activity-buffer entry types.
- `type CaptureWritebackCreateKnowledgeItemInput/DepsKnowledgeItem/KnowledgeKind/Layer/Writer`, `type CaptureWritebackManifest/ManifestEntry`, `type CaptureWritebackRecordConflictInput`, `type CaptureWritebackUpdateResult` — DI port types this Service consumes from `knowledge` (plus a pure-type structural mirror of `context-assembly`'s manifest shape).

---

### `context-assembly`

**What it does:** Assembles the full prompt/context bundle for an agent session right before it
starts — pulling in relevant knowledge, the task/bet's current state, user identity, routine config,
filesystem access, and team info, all as of the moment the session is about to run.

**Why a separate Service:** Depends on zero other orchestration Services and exactly five core-api
Services (all via DI ports, never a raw import) — it's the canonical "gather everything a session
needs to see, fresh" responsibility, which doesn't belong in any single domain Service, and doesn't
belong in `session-lifecycle` either (assembly is a distinct concern from process management).

**Owned tables:** none.

**Exposed API:**
- `assembleContext(ports, scope, authorId)` — the core entry point: builds the full context bundle for a session.
- `startWatcher(...)` — starts a filesystem watcher scoped to the assembling session (wraps `filesystems`' watcher).
- `type ContextAssemblyPorts` and related DI port types this Service consumes from `knowledge`/`work`/`users`/`routine`/`filesystems`/`org`.

*(Started as an Increment-0 minimal-mechanism proof-of-slice; see `packages/agent-orchestration/context-assembly/src/index.ts` for the exhaustive symbol list.)*

---

### `cost`

**What it does:** Cost-cap enforcement — checks whether an agent/team/session is within budget before
a run proceeds, and the cost-sentinel background job that periodically reconciles/alerts on spend.

**Why a separate Service:** A cross-cutting budget-gating concern every session-starting path needs to
consult synchronously (its `checkCostCap` reads live spend data, which can't be staled into an earlier
event) — genuinely orthogonal to `work`, `users`, or `org`, even though it reads all three.

**Owned tables:** none.

**Exposed API:**
- `createCostOps(deps)` — binds a single ops instance exposing the DB-touching surface below.
- `checkCostCap(deps, db, eventBus, params)` — checks whether a proposed spend is within cap (agent/team/session levels).
- `getAgentSpend(...)` / `getTeamSpend(...)` — reads current cumulative spend.
- `recordCostAndCheck(...)` — records a cost delta and re-checks the cap in one call.
- `runCostSentinel(...)` — the periodic background reconciliation/alert job.
- `type CostCapResult`, `type CheckCostCapParams`, `type CostDeps` — cost-check types.
- `type CostOrgTeamReader/SettingsPort/WorkStore` and related — DI port types this Service consumes from `org`/`settings`/`work`.

---

### `dispatch`

**What it does:** The most-connected Service in the graph — task dispatcher, assistant-turn
dispatcher, routine scheduler (cron/due-eval), and builtin routine handlers (portfolio retro, etc.),
all bundled into one package.

**Why a separate Service:** Genuinely borderline by volume (16 distinct outbound edges, 60 call sites
— the single largest fan-out in the system) but each of its four jobs (task dispatch, assistant
dispatch, routine scheduling, builtin handlers) is a real, distinct "when should agent work happen"
decision that doesn't belong to any single domain Service. Not flagged as a fold candidate in
architecture §9, but its size makes it the strongest candidate for a future decomposition audit if it
ever becomes a real bottleneck.

**Owned tables:** none.

**Exposed API:**
- `dispatchTask(...)` — the task-dispatch entry point.
- `dispatchAssistantTurn(...)` — the assistant-turn dispatch entry point.
- `runDueRoutines(deps)` — the scheduler's due-eval pass (finds and fires routines that are due).
- `registerRoutineScheduler(...)` — registers the periodic scheduler.
- `runBuiltinRoutineHandler(kind, ...)` — dispatches to a builtin routine's handler (e.g. portfolio retro).
- `runPortfolioRetro(...)` — the builtin portfolio-retro routine handler.
- `nextCronMatch(cron, from)` / `parseCron(expr)` — cron scheduling helpers (also consumed by `run-orchestration`/`tool-handlers`).
- `type DispatchDeps` and related DI port types this Service consumes from `conversation`/`knowledge`/`model-gateway`/`review`/`routine`/`settings`/`users`/`work`.

*(Bundles 5 seed files — `task-dispatcher.ts`, `assistant-dispatcher.ts`, `routine-scheduler.ts`, `builtin-routine-handlers.ts`, `agent-work-assistant.ts`; see `packages/agent-orchestration/dispatch/src/index.ts` for the exhaustive symbol list.)*

---

### `lifecycle-projection`

**What it does:** Drains the durable `agent_lifecycle_inbox` and projects each fact into its owning
domain's terminal state (a routine run's completion, a task's terminal state, an explicit session
start's outcome) — the "what happened to this agent run" half of the durable-handoff pipeline AC-9
established.

**Why a separate Service:** One of only two agent-orchestration Services that genuinely own a SQL
table (`agentLifecycleInbox`) — the durable-handoff design (§AC-4/AC-9) explicitly requires this to be
its own owner, Table-ACL-enforced like any core-api Service.

**Owned tables:** `agentLifecycleInbox`.

**Exposed API:**
- `insertLifecycleInboxFactIfAbsent(...)` — idempotently inserts a lifecycle fact (won't duplicate).
- `deleteLifecycleInboxByRequestIds(...)` — deletes inbox rows for given request ids (post-projection cleanup).
- `listProjectedLifecycleInboxBefore(...)` — lists already-projected facts before a timestamp (for reaping).
- `type AgentLifecycleInboxFact` — inbox row type.
- `drainAgentLifecycleInbox(deps)` — drains pending inbox facts and projects each to its owner.
- `startAgentLifecycleProjectionDrain(deps)` — starts the periodic drain loop.
- `AGENT_LIFECYCLE_PROJECTORS` — the per-family projector registry.
- `AGENT_LIFECYCLE_SOURCE_KINDS`, `AGENT_LIFECYCLE_TERMINAL_STATES` — closed vocabulary constants.
- `type AgentLifecycleFact` — the drained fact's shape.
- `type AgentLifecycleProjectionDeps`, `type LifecycleProjectionExplicitSessionStartWriter/RoutineWriter/WorkWriter` — DI port types this Service consumes from `routine`/`work`/`session-requests`.

---

### `trigger-resolution`

**What it does:** Resolves a domain event/routine-due signal into an actual triggered agent session
request — the decision point of "does this event warrant starting an agent," recording the resolution
history either way (including deliberate no-fire decisions).

**Why a separate Service:** One of two agent-orchestration Services that owns a real table
(`triggerResolutionHistory`) — the durable record of every trigger evaluation, including fallback
runs, is itself part of the AC-9 durable-handoff guarantee (§11), not just an ordinary DI target.

**Owned tables:** `triggerResolutionHistory`.

**Exposed API:**
- `resolveTriggerForSessionRequest(...)` — the core resolution entry point: decides whether/how to trigger a session.
- `createTriggeredAgentSessionRequest(...)` — creates the actual session request once resolved to fire.
- `recordSessionForResolutionHistory(...)` — records a resolution outcome (fire or no-fire) durably.
- `type TriggeredSessionRequestInput` — resolution input type.
- `type TriggerResolutionConfigReader/Deps/SessionRequestPort/TeamReader/UserReader` — DI port types this Service consumes from `settings`/`session-requests`/`org`/`users`.

---

### `run-orchestration`

**What it does:** The top-level agent-run boundary — admits/executes/tracks agent run requests
end-to-end, boot-time recovery of running requests, and the worker WS route (where remote workers
register to receive dispatched runs).

**Why a separate Service:** The single-writer custody boundary for run admission/execution — a
distinct, security-relevant responsibility (only one code path may transition a request's custody
state) that's neither `session-requests` (the queue) nor `session-lifecycle` (session process
management), even though it composes both.

**Owned tables:** none.

**Exposed API:**
- `bootAgentLayer(deps)` — boots the agent layer at server startup (recovery + drain-loop wiring).
- `drainAgentSessionRequests(...)` — drains pending session requests for execution.
- `markRunningAgentSessionRequestsForShutdown(...)` — marks in-flight requests for graceful shutdown.
- `classifyAdmissionFailure(...)` — classifies why an admission attempt failed.
- `AGENT_LAYER_REAP_INTERVAL_MS` — boot-recovery reaper interval constant.
- `type AgentAdmissionFailureCode`, `type AgentLayerBootDeps` — boot types.
- `executeAgentRunRequest(...)` — the domain-facing execution boundary: runs a request end-to-end.
- `getAgentRunLifecycle(...)` / `listAgentRunLifecycleBySource(...)` — reads lifecycle state for a run/source.
- `recoverRunningAgentSessionRequests(...)` — boot-time recovery of requests left running from a crash.
- `type AgentRunLifecycle/LifecycleState` — lifecycle read-model types.
- `consumeAgentSessionRequest(...)` — the internal single-writer request-consumption function.
- `admitOnlyWithRequestLease(...)` — admits a request only while holding its claim lease.
- `reserveOrAdoptSession(...)` — reserves a new session or adopts a recovering one.
- `type ConsumeAgentSessionRequestOptions` — consumption options type.
- `registerWorkerWsRoute(...)` — registers the WS route remote workers connect to.
- `WorkerConnectionManager` — manages active worker WS connections.
- `type RunOrchestrationAdapterMeta/AdapterPool/AdmittedSession/ClaimOptions/DispatchPort/Ports/ProvisionDeps/ProvisionParams/ProvisionResult/RemoteHarnessAdapterFactory/RemoteWorkerAdapter/SessionContext/SessionLifecycleRuntime/SessionProvisioner/SessionRequestsPort/TerminationReason/WorkIntentSource` — the large DI-port type set this Service consumes from `session-requests`/`session-lifecycle`/`harness-registry` (including the `HarnessPort` execution-seam types).

---

### `session-lifecycle`

**What it does:** Manages an individual agent session's full lifecycle — admission, provisioning
(mounting filesystems, writing harness-specific config, constructing the harness runtime), running,
crash/termination handling, and reaping (stale routine sessions, abandoned sandboxes). This is where
the concrete `HarnessPort` implementation is composed.

**Why a separate Service:** Process/session lifecycle management is categorically different from
domain data — it's about a *running thing*, not a table. It's also the Service that resolves the
system's one genuine cross-process seam (`HarnessPort`), which structurally can't live in a core-api
Service (core-api never touches execution) or in `agent-execution` itself (Mechanism B forbids it
knowing about sessions/domain data).

**Owned tables:** none.

**Exposed API:**
- `admitSession(deps, params)` — admits a new session (the `HarnessPort.admitSession` half of the execution seam).
- `runSession(deps, params, admitted, signalStarted)` — runs an admitted session (the `HarnessPort.runSession` half).
- `provisionSession(...)` / `startSessionProvision(...)` — provisions a session's environment before running.
- `mountFilesystemsForAgent(...)` — mounts an agent's configured filesystems into the sandbox.
- `captureMountedFilesystems(...)` — captures changes from mounted filesystems on teardown.
- `EMITTED_ROOTS_MCP_JSON` — path constant for the scaffolded MCP config file.
- `type AdmittedSession`, `type BeforeHarnessStartContext/BeforeTeardownContext`, `type ProvisionSessionDeps/Params/Result` — provisioning types.
- `endSession(...)` — ends a session normally.
- `crashSession(...)` — handles an abnormal session crash.
- `requestAgentTermination(...)` — requests termination of a running session (the `policy` EventBus-subscriber target).
- `recoverRequestedTerminations(...)` — boot-time recovery of pending termination requests.
- `transitionAgentRunLifecycle(...)` — the single CAS-guarded lifecycle-transition writer.
- `TERMINATION_DISPOSITIONS`, `TERMINATION_REASONS` — closed vocabulary constants.
- `type AgentTerminationReason`, `type SessionContext` — termination/context types.
- `reapStaleRoutineSessions(opts)` — reaps routine sessions stuck/stale beyond their expected window.
- `type ReapStaleRoutineSessionsOpts` — reaper options type.
- `reapSandboxesOnce(...)` / `startSandboxReaper(...)` — sandbox-reaping pass / periodic starter.
- `SANDBOX_REAPER_INTERVAL_MS` — reaper interval constant.
- `type SandboxReaperOptions` — reaper options type.
- `type IngestionHandle` — writeback-ingestion handle type.
- Full `ports.ts` re-export (`export *`) — every DI port type this Service consumes from `routine`/`work`/`users`/`settings`/`observability`/`filesystems`/`connections`/`session-requests`/`cost`/`harness-registry`/`mcp-provider`/`tool-provider`.

---

### `session-requests`

**What it does:** The durable work-intent/session-request queue — the AC-9 pipeline's heart. Records
`agent_work_intents` (a domain fact that needs agent work), drains them into real
`agent_session_requests`, resolves triggers into requests, tracks explicit session starts, and
provides `sessionRunRegistry` (in-memory correlation of running sessions to their requests).

**Why a separate Service:** One of two agent-orchestration Services that genuinely own SQL tables
(`agent_work_intents`/`agent_session_requests`/`explicit_session_starts`) — the durable-handoff
design (§AC-4/AC-9's founder-confirmed correction) requires this precisely because "orchestration owns
no tables" was never a real rule, and these three tables *are* the mechanism that makes intent
recording crash-safe.

**Owned tables:** `agentWorkIntents`, `agentSessionRequests`, `explicitSessionStarts`.

**Exposed API:**
- `createAgentSessionRequest(...)` — creates a new session request.
- `claimNextAgentSessionRequest(...)` / `claimAgentSessionRequestById(...)` — CAS-guarded request claim.
- `findAgentSessionRequestById(...)` / `findAgentSessionRequestByIdempotencyKey(...)` / `findAgentSessionRequestBySessionId(...)` — request lookups.
- `findAgentSessionRequestTerminationReasonInTx(...)` — looks up a request's termination reason within a transaction.
- `isAgentSessionRequestClaimActive(...)` — checks whether a claim lease is still active.
- `listAgentSessionRequestsBySource(...)` / `listRunningAgentSessionRequests(...)` — request listing queries.
- `markRequestRunning(...)` — transitions a request to running with its admitted session id.
- `releaseRequestClaim(...)` / `renewAgentSessionRequestLease(...)` — claim-lease management.
- `requestAgentSessionTermination(...)` — requests termination of a running request.
- `terminalizeAgentSessionRequest(...)` / `terminalizeAgentSessionRequestInTx(...)` — the single terminal-state writer (CAS-guarded).
- `type ClaimRequestOptions`, `type TerminalizeAgentSessionRequestInput` — request-lifecycle types.
- `claimAgentWorkIntent(...)` / `renewAgentWorkIntentLease(...)` — work-intent claim/lease management.
- `resolveAuthoritativeInput(...)` — resolves the authoritative input data for a claimed intent (reads across `work`/`org`/`review`/`knowledge` as needed by intent kind).
- `AGENT_WORK_INTENT_FAILURE_CODES` — closed set of intent-processing failure codes.
- `type AgentWorkIntentWorkerOptions` — intent-worker config type.
- `recordAgentWorkIntent(tx, intent)` — durably records a new work intent (the `AgentWorkIntentRecorder` port target — same-transaction write).
- `drainAgentWorkIntents(deps)` — drains pending intents and resolves each into a session request.
- `findAgentWorkIntentByKindAndSource(...)` / `findAgentWorkIntentSourceByRequestId(...)` — intent lookups.
- `reapTerminalAgentWorkIntents(...)` — TTL-reaps completed/failed intents.
- `AGENT_WORK_INTENT_KINDS` — closed set of intent kinds.
- `AGENT_WORK_RETENTION_BATCH_SIZE`, `AGENT_WORK_RETENTION_DAYS` — reaper tuning constants.
- `type AgentWorkIntentDb/Input/Kind` — intent types.
- `createExplicitSessionStart(...)` — records an explicit (non-triggered) session start.
- `findExplicitSessionStartById(...)` / `findExplicitSessionStartByRequesterAndIdempotencyKey(...)` — lookups.
- `markExplicitSessionStartAdmitted(...)` / `markExplicitSessionStartFailed(...)` — outcome writers.
- `projectExplicitSessionStartTerminalState(...)` — projects a lifecycle fact into an explicit-start's terminal state (the `lifecycle-projection` DI port target).
- `type CreateExplicitSessionStartInput` — explicit-start input type.
- `sessionRunRegistry` — the in-memory registry correlating running sessions to their requests.
- `type AgentWorkIntentReapDeps/WorkerDeps`, `type MarkRequestRunningDeps`, `type SessionRequestsAgentSelection*/ConversationReader/GrantedProposedCall/KnowledgeReader/LifecycleInbox*/ReviewReader/RoutineReader/RunPatch/SelectionCandidate/TeamReader/TriggerHistoryWriter/TriggerInput/TriggerResolver/UserReader/WorkReader`, `type TerminalizeSessionRequestDeps` — the large DI-port type set this Service consumes from `routine`/`work`/`conversation`/`users`/`org`/`review`/`trigger-resolution`/`agent-selection`/`lifecycle-projection`.

---

### `tool-handlers`

**What it does:** Implements the DB-/domain-touching body of every agent-invocable tool (21 tools —
`create_task`, `create_bet`, `handoff_to`, `promote_knowledge`, `submit_review`, etc.) plus
`write_session_notes`. This is the server-side implementation behind the client-facing tool
definitions MCP exposes — the translation layer from "the agent called this tool with these args" to
"here's the actual domain-Service call(s), with the session's context resolved into it."

**Why a separate Service:** The C1 resolution from §7.5 — `agent-execution` must hold zero DB/Service
references (Mechanism B, a hard security boundary especially for `remote-worker`), so the DB-touching
half of every tool had to live somewhere with DB access and agent-run-context awareness. Not part of
any single domain Service, since most tools compose multiple (`create_task` alone touches `work` and
resolves session context; `handoff_to` touches `policy`).

**Owned tables:** none.

**Exposed API:**
- `buildAllToolDefinitions(ports)` — DI-wires and returns all 21+ tool definitions as one registry.
- `toolsForRoleFromPorts(ports, role)` — filters the tool set to those available for a given role.
- `createAddAgentTool(ports)` — the `add_agent` tool: adds a new agent user to a team.
- `createCreateArtifactTool(ports)` — the `create_artifact` tool.
- `createCreateBetTool(ports)` — the `create_bet` tool.
- `createCreateConflictReviewTool(ports)` — the `create_conflict_review` tool (flags a knowledge conflict for review).
- `createCreateItemTool(ports)` — the `create_item` tool.
- `createCreateRoutineTool(ports)` — the `create_routine` tool.
- `createCreateTaskTool(ports)` — the `create_task` tool.
- `createCreateTeamTool(ports)` — the `create_team` tool.
- `createEditBetTool(ports)` — the `edit_bet` tool.
- `createHandoffToTool(ports)` — the `handoff_to` tool (human/agent handoff, via `policy`).
- `createLogTaskTool(ports)` — the `log_task` tool.
- `createPromoteKnowledgeTool(ports)` — the `promote_knowledge` tool.
- `createQueryPracticeTool(ports)` — the `query_practice` tool (practice-meeting review query).
- `createReadInboxTool(ports)` — the `read_inbox` tool.
- `createRouteItemTool(ports)` — the `route_item` tool.
- `createScoreAttentionTool(ports)` — the `score_attention` tool.
- `createSendMessageTool(ports)` — the `send_message` tool.
- `createSubmitReviewTool(ports)` — the `submit_review` tool.
- `createUpdateRoutineTool(ports)` — the `update_routine` tool.
- `createWriteMemoryTool(ports)` — the `write_memory` tool.
- `createWriteSessionNotesTool(ports)` — the `write_session_notes` tool (touches `sessions`, `UNOWNED_SHARED_TABLES`).
- `createCommitFileTool(ports)` — the `commit_file` tool (execution-internal logic, zero domain touch, grouped here to match the pre-migration shape).
- `buildAssistantDraftRegistry(params)` — builds the assistant's draft-tool registry.
- `resolveCurrentDraftBetId(...)` / `resolveDraftTeamId(...)` — assistant-draft context resolution helpers.
- `type AssistantDraftRegistryParams` — draft-registry input type.
- `type ToolHandlersAgentSelectionAccessor/ConversationAccessor/DispatchAccessor/HandoffMetadata/HandoffParams/HandoffResult/KnowledgeAccessor/OrgAccessor/PolicyAccessor/Ports/RoutineAccessor/SessionContext/UsersAccessor/WorkAccessor` — the DI port type set this Service consumes from `conversation`/`knowledge`/`org`/`routine`/`users`/`work`/`review`/`agent-selection`/`dispatch`/`policy`.

---

## `agent-execution` Layer (3 Services — zero DB, zero Service dependencies of any kind)

### `harness-registry`

**What it does:** Every concrete harness adapter — builtin (direct LLM API loop), CLI-spawned
(claude/codex/opencode/cursor-agent), and remote (WS client talking to a `remote-worker`) — plus the
`AdapterPool` that discovers/selects among them, sandbox adapters (local/disabled), the LLM client
(direct HTTP to Anthropic/OpenRouter/OpenAI-compatible), a deterministic cassette record/replay lane
for tests, harness capability descriptors/discovery, and the return-enforcement/return-gate machinery
(AL6's un-bypassable drain-end backstop).

**Why a separate Service:** The literal execution boundary — this is the one place in the entire
system that actually spawns processes, makes LLM API calls, and talks to a real filesystem/sandbox.
Mechanism B (zero DB, zero Service dependency) is enforced here specifically because this code might
run on a completely untrusted remote machine (`remote-worker`) with no database credentials at all.

**Owned tables:** none (structurally cannot own any — zero `@hyperidle/db` dependency).

**Exposed API:**
- `AdapterPool` — the pool of available `HarnessAdapter` instances, selectable by requirement.
- `createLocalAdapterPool()` — constructs the pool for in-process (desktop) harness discovery.
- `CLAUDE_CLI_CONFIG`, `CURSOR_AGENT_CLI_CONFIG`, `CLI_TOOL_CONFIGS` — per-CLI-harness config constants.
- `type AdapterInfo/Meta`, `type SelectedEntry/SelectRequirements` — pool types.
- `BuiltinHarnessAdapter` — the direct-LLM-API-call harness implementation (no CLI spawn).
- `CliHarnessAdapter` — the CLI-spawning harness implementation (claude/codex/opencode/cursor-agent).
- `type CliAdapterConfig/Deps`, `type CliAvailabilityDeps`, `type CredentialResolver` — CLI adapter types.
- `writeCliMcpConfig(params)` — writes the `.mcp.json`/`config.toml` a CLI harness auto-discovers.
- `contextWindowForModel(model)` — looks up a model's context-window size.
- `isAboveThreshold(...)` — checks if usage is near the context-window limit.
- `MODEL_CONTEXT_WINDOWS`, `DEFAULT_CONTEXT_WINDOW` — context-window data/default.
- `DisabledSandboxAdapter` — no-op sandbox adapter for topologies with no local filesystem (`remote-server`).
- `describeRegisteredHarness(...)` — builds a capability descriptor for a registered harness.
- `KNOWN_HARNESS_FAMILIES` — the closed set of recognized harness families.
- `missingKnownHarnessDescriptors(...)` — finds which known harnesses lack a registered descriptor.
- `discoverLocalHarnesses(input)` — probes the local machine for available CLI harnesses.
- `probeEnvironmentClis(...)` / `probeClaudeCodeMcpList(...)` / `probeCodexMcpList(...)` / `probeOpenCodeCli(...)` / `probeOpencodeMcpList(...)` — per-CLI probe functions.
- `parseClaudeModelsOutput(...)` / `parseOpencodeModelsOutput(...)` — parses each CLI's model-list output.
- `BUILTIN_MODELS_FETCH_TIMEOUT_MS` — timeout constant for the builtin model list fetch.
- `probeHarnessSession(...)` — post-provision readiness probe for a session.
- `recordLlm(...)` / `replayLlm(...)` — deterministic LLM call record/replay (test cassette lane).
- `buildCassetteKey(...)` / `loadCassetteEntries(...)` — cassette key construction/loading.
- `__getCostAccumulatorForTest()` / `__resetCostAccumulatorForTest()` — test-only cost-accumulator hooks.
- `callLlm(options)` / `callLlmDirect(options)` — makes an actual LLM API call.
- `estimateCostUsd(...)` — estimates USD cost for a given token usage.
- `type LlmContentBlock/Message/Response/Role/TextBlock/ToolDef/ToolResultBlock/ToolUseBlock` — LLM wire-protocol types.
- `LocalSandboxAdapter` — the local-filesystem sandbox adapter (desktop's default).
- `provisionReturnHook(options)` — provisions the per-harness AL6 enforcement hook.
- `RemoteHarnessAdapter` — WS-client harness adapter that dispatches to a connected `remote-worker`.
- `createEnforcementRegistry()` / `enforcementRegistry` — the force-return enforcement bookkeeping registry.
- `createReturnGate(...)` / `evaluateReturn(...)` — the AL6 return-gate: the un-bypassable drain-end backstop.
- `type SandboxAdapter/Handle`, `type ExecResult` — sandbox adapter interface types.

---

### `mcp-provider`

**What it does:** Bridges skill-tool invocations over the Model Context Protocol for CLI-spawned
harnesses (claude/codex/opencode) — the per-session `McpServer` + transport, a registry routing
incoming MCP calls by session token, and the Hono sub-router handling the JSON-RPC bridge plus AL6
return-status adjudication.

**Why a separate Service:** The MCP wire protocol is a genuinely distinct concern from both harness
process management (`harness-registry`) and tool business logic (`tool-handlers`) — it's the transport
layer connecting a CLI-spawned harness's tool calls to the rest of the system.

**Owned tables:** none.

**Exposed API:**
- `createMcpBridge(options)` — constructs a per-session MCP bridge (server + transport).
- `type CreateMcpBridgeOptions`, `type McpBridgeInstance` — bridge construction types.
- `toolResultToCallToolResult(...)` — converts an internal `ToolResult` to the MCP wire format.
- `createMcpBridgeRegistry()` — creates the registry routing MCP calls by session token.
- `type McpBridgeRegistry` — registry type.
- `createMcpRoute(...)` — the Hono sub-router handling the JSON-RPC bridge + return-status adjudication.

---

### `tool-provider`

**What it does:** The harness-facing tool surface — descriptors (name/schema/roles/description),
the dispatch that marshals a call to an injected handler port, and the `return_status` tool. Zero
domain logic; every DB-touching tool body lives in `tool-handlers` instead.

**Why a separate Service:** The C1 resolution's other half — this is what stays inside the strict
Mechanism-B boundary (deps = shared only), holding just the erasure/classification/dispatch machinery
a harness needs to see a tool's shape and call it, with the actual domain-touching implementation
injected from outside.

**Owned tables:** none.

**Exposed API:**
- `buildToolRegistry(options)` — builds the harness-facing tool registry from a set of `RegisteredTool`s.
- `type BuildToolRegistryOptions` — registry-build options type.
- `returnStatusTool` — the built-in `return_status` tool definition.
- `type ReturnStatusResult` — return-status result type.
- `toRegistered(...)` — converts a `ToolDefinition` into a `RegisteredTool`.
- `toClaudeToolSpec(...)` — converts a tool definition to Claude's tool-spec wire shape.
- `classifyReversibility(...)` — classifies a tool call's reversibility (for AL6 enforcement).
- `composeWorkflowAllowDeny(...)` — composes an allow/deny decision for a workflow-gated tool.
- `canonicalJson(...)` / `identityHash(...)` — deterministic JSON serialization + hashing (idempotency/audit).
- `toolsForRole(role)` — filters the tool set to those available for a role.
- `wrapForRegistry(...)` — wraps a handler function into the registry's expected shape.
- `err(...)` / `ok(...)` — the `ToolResult` error/success constructors.
- `type AssistantToolResult/Shape`, `type ClaudeToolSpec`, `type ProposedCallWorkflowPort`, `type RegisteredTool`, `type RegistrySessionWorkflow`, `type ToolContext/Definition/Handler/Registry/Result` — the full cross-boundary tool-type set (re-exported from `@hyperidle/shared`, since both `tool-provider` and `tool-handlers` need identical types and Mechanism B forbids `tool-handlers` depending on `tool-provider` directly).

---
