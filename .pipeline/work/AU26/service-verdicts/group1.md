# AU26 pass A — service verdicts, group 1

Scope: `packages/core-api/{conversation, filesystems, git-export, knowledge, notifications}`.
Method: §2/§3 of `.pipeline/work/AU26/requirements.md`. All sites traced with `rg -a` at branch `pipeline/AU26` (base `75d85687`).
Evidence bar: one named core-side effect (table write, gated operation, emitted/consumed event, enqueue). Rendering into a `core-api` response does not count.

---

## conversation — **stays**

**Domain:** threads and messages between humans and agents (`threads`, `messages`).

**One real core-side use:** `packages/core-api/src/routes/threads.ts:1180` + `:1199` — POST a new thread writes a `threads` row and its first `messages` row in one transaction, after core-side @mention resolution mutates the participant set (`:1161-1172`). Human-originated core table write.

**Depth trigger:** none fired. Closed at the line.

Scan for agent-shaped parts (no trigger, recorded so pass B isn't re-derived from scratch):

- `assistant-thread-pin-reaction.ts:44` — reacts to `thread_message_appended`, writes `threads.pinned`. Core table write on a core event. Core-shaped.
- `assistant-turn-resolver.ts` — emit-time resolve+bake of the assistant turn request handed to `agent-orchestration` (bakes transcript, model override, `resolveInjectedFilesystemsForAgent` at `:182`). Same bake shape as connections' K1. **Explicitly out of AU26 scope** — §7 out #6 assigns the assistant turn's output/execution de-specialization (Decision K2) to AU27. Flagged, not verdicted.

---

## filesystems — **stays, and contains parts that move**

Whole-service verdict is "stays" on the record's evidence below. Three parts get separate verdicts (§4 Item B).

**Domain (service):** registered repo / doc-set locations a team owns, the agent↔location assignment, and the mount engine that materializes them into a sandbox.

**One real core-side use (the record):** `packages/core-api/src/routes/knowledge.ts:565` + `:585` — `knowledge_items` can be scoped to a filesystem. `scopeKind: "filesystem"` is a first-class scope (`packages/shared/src/types.ts:181`, id-requiring at `:200`); the route **gates** creation on `requiresScopeId` (`routes/knowledge.ts:565`, 400 without a scopeId) and then writes `knowledge_items.scopeId = filesystems.id` at `:585`. A core domain's table references the record and a core operation is gated on it. That is a genuine core use, independent of any agent.

### Part 1 · the mounting engine (`RegistryFilesystemMounter`) — **moves**

Depth trigger 3 (contains something that moves). Re-traced, confirms §4 Item B:

- Constructed once, in core-api's composition root: `packages/core-api/src/server-factory.ts:1006`, then handed straight down to run-orchestration (`:1061`, `:1154`, `:1171`). Wiring only — core never invokes it.
- Only non-test `.mount()` / `.captureBack()` callers are in `agent-orchestration`: `run-orchestration/src/filesystem-provisioning.ts:78` and `provisioner.ts:527`.
- `core-api`'s remaining `.mount()` calls are the package's own adapter tests (`filesystems/src/__tests__/{git-clone-adapter,git-worktree-adapter,git-worktree-live-proof,local-folder-adapter,mounter-registry}`).
- All four adapters live inside `mounter-registry.ts` (`LocalFolderAdapter:64`, `GitCloneAdapter:123`, `GitWorktreeAdapter:160`, `CloudNotBuiltAdapter:46`) — the engine is the whole file, not a class to peel off it.
- `SANDBOX_SCAFFOLDING_PATHS` (`scaffolding-paths.ts`) has **zero** consumers outside `mounter-registry.ts:119,198` and one test assertion. It follows the engine.

**Surprise, contradicts §4 Item B's premise.** `filesystemCaptures` is *not* core-owned in practice:

- Its only non-test writer is the engine itself: `packages/core-api/filesystems/src/mounter-registry.ts:327`.
- `listCaptures` (`filesystem-registry.ts:99-110`, exported at `index.ts:19`) has **zero** non-test readers anywhere in `packages/` — the only callers are `filesystems/src/__tests__/filesystems-completeness-contract.integration.test.ts:172,178,181,211`. Confirmed with `rg -a` across all packages.
- The table's FK is `session_id → sessions` (`packages/db/drizzle/0041_wet_photon.sql:11`, `packages/db/src/schema.ts:1262-1287`) — an agent-run artifact record, not a core record.

So `filesystems` does **not** stay on the strength of `filesystemCaptures`. The captures table follows the engine, and `listCaptures` is test-only reachable (per the standing rule, that makes it dead surface, not an entry point).

**Consequence architecture must resolve (evidence, not design):** the engine's `gitRunnerFactory` port (`filesystems/src/ports.ts`) is fed `createGitRunner` from `@hyperidle/git-export` at `server-factory.ts:1007`. An `agent-orchestration` package may not import a core-api Service (Mechanism B), so relocating the engine strands that dependency — the same shape as §9.6's `harness-capability-read-model` problem. The engine also writes via `this.deps.db` (`mounter-registry.ts:327`), which is fine: orchestration has DB credentials.

### Part 2 · the record (`filesystem-registry.ts`) — **stays**

Evidence is the whole-service line above (`routes/knowledge.ts:565`/`:585`). This is the one non-configuration core use; without it the record would fail §2, because the Settings CRUD path on its own (`routes/filesystems.ts:207` register, `:323` delete) is exactly "a human configures it, then it is handed to an agent" — a disqualified argument.

**Part-level flag inside the record — `filesystemInjections` is purely agent-shaped.** Its full non-test surface:

- writes: `routes/filesystems.ts:369` (`saveInjection`) / `:415` (`deleteInjection`), driven only by the agent editor (`packages/web/src/settings/SettingsAgents.tsx:282,290`);
- reads: `listFilesystems(db, {agentId})` at `routes/filesystems.ts:289` (serving `GET ?agentUserId=`, consumed only by `SettingsAgents.tsx:194`) and `filesystems/src/resolve-injected-filesystems-for-agent.ts:51`.

Nothing in a core domain reads an injection. `resolveInjectedFilesystemsForAgent` is the emit-time bake that feeds orchestration's mount step (`run-orchestration/src/filesystem-provisioning.ts:53-70`) — structurally identical to connections' K1 bake that AU26 is deleting, but with ~12 core-api emit-site callers (`routes/threads.ts:1486,1723`, `routes/knowledge.ts:958`, `routes/sessions-routes.ts:417`, `work/src/{session-start-resolver.ts:141,task-run-resolver.ts:249}`, `routine/src/routine-service.ts:475`, `review/src/proposed-call-workflow.ts:389`, `knowledge/src/knowledge-action-resolver.ts:169`, `conversation/src/assistant-turn-resolver.ts:182`, plus the `services/*-bindings.ts` wiring). Recorded as a pass-B candidate with its evidence; not verdicted here, since it is the injection half of a record whose core use lives in its other half.

### Part 3 · the reachability probe (`filesystem-reachability.ts`, `inspect-local-path.ts`) — **stays, with the record**

**Real core-side effect:** `packages/core-api/src/routes/filesystems.ts:147` runs `resolveFilesystemState` and `:156` persists a transition with `updateFilesystemState(db, row.id, newState)` — a write to the `filesystems.state` column on the record that stays.

Honest caveats, since this is the weakest of the three:

- `filesystems.state`'s only consumer is the human Settings chip (`packages/web/src/settings/SettingsFilesystems.tsx:171`, labels at `:40,:46`). Orchestration maps `state` through the bake (`run-orchestration/src/filesystem-provisioning.ts:70`) but **never gates on it** — no `needs_attention` / `reachable` check exists anywhere in `agent-orchestration`.
- `inspectLocalPath` (`routes/filesystems.ts:260`) serves onboarding only (`packages/web/src/pages/SetupFlow.tsx:231,352`).
- The probe's git path takes the same `gitRunnerFactory` the engine takes (`routes/filesystems.ts:153`, `filesystem-reachability.ts:29-50`), so the `createGitRunner` question above straddles both parts.
- `routes/filesystems.ts:6` still type-imports `ServiceConnectionResolver` from `@hyperidle/connections` — the probe's auth resolver (`buildAuthResolver`, `:110-131`). That import follows connections' move (§4 Item A) regardless of the probe's own verdict.

---

## git-export — **stays**

**Domain:** publishing core knowledge items to a git repo the operator configured.

**One real core-side use:** `packages/core-api/git-export/src/git-export.ts:564` — `eventBus.on("knowledge_updated", handler)` (registered from `packages/core-api/src/server-factory.ts:553`). Core consumes its **own** knowledge event and, on export, writes back to `server_config.gitExport` — `git-export.ts:459` / `:468` → `git-export-config.ts:163-179` `writeExportMeta` → `serverConfig.update`. Event consumed + core config table written. No agent anywhere in the path.

**Depth trigger:** none fired. Closed at the line.

One note carried forward (not a verdict): `createGitRunner` (`git-export-runner.ts`, exported at `index.ts:47`) is a general git-execution platform, not export logic. Its non-export consumers today are `filesystems`' engine (`server-factory.ts:1007`) and probe (`routes/filesystems.ts:153,260`). If the engine relocates, this helper acquires readers on both sides of the boundary — same class of problem as §9.6, and architecture should rule on it there rather than in a git-export verdict.

---

## knowledge — **stays**

Charter-fixed (`.pipeline/AU.md:3`) — treated as a strong prior, reached on evidence, not assumed.

**Domain:** knowledge items, their scope/layer, attention + relevance scoring, promotion.

**One real core-side use:** `packages/core-api/src/routes/knowledge.ts:585` — `create as createKnowledgeItem` (imported `:33`) writes a `knowledge_items` row when a human creates an item. Core table write, human-originated, no agent involved.

**Depth trigger:** none fired. Closed at the line. (`knowledge-action-resolver.ts`'s emit-time bake at `:169` is the same `resolveInjectedFilesystemsForAgent` pattern flagged under filesystems Part 2 — it belongs to that finding, not to a knowledge verdict.)

---

## notifications — **stays**

**Domain:** the human's notification queue, its delivery channels, silence windows and daily digest.

**One real core-side use:** `packages/core-api/src/routes/teams-routes.ts:126` — `enqueue(db, {...})` writes a `notifications` row (`eventType: "agent.health.degraded"`) when a human loads a team page and finds a member in error state, after a dedupe read at `:115`. Core table write. Second, independent: `packages/core-api/policy/src/policy-engine.ts:127` — `isSilenced` **gates** a core policy decision (returns `"queue"` instead of `"push"`).

**Depth trigger:** none fired. Closed at the line.

Agent-shaped scan came back clean: the only agent references in the package are `silence-policy.ts:71-73`, resolving *which team* an item's source agent belongs to so the human's per-team silence applies. No `sessions` import, no harness coupling, no session-lifecycle subscription anywhere in `packages/core-api/notifications/src/`.
