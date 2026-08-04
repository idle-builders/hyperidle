# System Requirements

Platform constraints and standing decisions — what the system must run on and the boundaries it must respect, stated as testable outcomes. Mechanism detail lives with the owning docs (linked per section). Feature behavior is in [functional-requirements.md](functional-requirements.md).

## S-1: Deployment

**S-1.1** The system ships as a native macOS desktop app (Electron) with the API server embedded in the main process (`packages/desktop/src/main.ts`, `bootLocalMode`). Distributed as a signed/notarized DMG with Homebrew-cask-stable artifact names (`packages/desktop/electron-builder.yml`). No Docker, no separate server process. Install and profile detail: [../deployment/index.md](../deployment/index.md).

**S-1.2** A new user goes from install to a working app shell through SetupFlow (`packages/web/src/pages/SetupFlow.tsx`) — no manual config files, no env vars.

**S-1.3** Node >= 24 (root `package.json` `engines.node >= 24.0.0`). Dev setup: [../guides/developer/getting-started.md](../guides/developer/getting-started.md).

## S-2: Data Storage

**S-2.1** Local storage is PGlite (embedded Postgres, `@electric-sql/pglite`) in the app data directory (`~/Library/Application Support/@hyperidle/desktop`). Server deployments run real Postgres (`migrate-pg.ts`, `pg-ssl.ts`). Store semantics: [../knowledge-architecture/the-canonical-store.md](../knowledge-architecture/the-canonical-store.md); deployment recipes: [../deployment/index.md](../deployment/index.md).

**S-2.2** Human-readable knowledge lives as database rows. **The Git export is not implemented** — the exporter was deleted in AU26 (increment C1) and the path this requirement cited had not existed since AU19. The database is the source of truth and currently the only store. The unimplemented export sketch: [../knowledge-architecture/facilitators.md](../knowledge-architecture/facilitators.md).

**S-2.3** Session context packs use the TOON format (external spec: github.com/toon-format/toon; codec at `packages/shared/src/toon-codec.ts`), assembled by the knowledge fabric at session start (`packages/fabric/src/context-assembly.ts`).

**S-2.4** Knowledge writes back continuously during a session with optimistic concurrency (`version` column, `packages/db/src/schema.ts:596`) — never a session-boundary batch. Primary implementation: `file-watcher.ts` (using `fs.watch`); `polling-watcher.ts` is the fallback for environments without native `fs.watch`. Sync mechanism: [../knowledge-architecture/sync-and-conflict-resolution.md](../knowledge-architecture/sync-and-conflict-resolution.md).

## S-3: Agent Runtime

**S-3.1** The system runs agents through two kinds of harness: a builtin in-process model-calling harness (`packages/server/src/harness/builtin-harness-adapter.ts`, `llm-client.ts`) and CLI harness adapters for claude/codex/opencode (`cli-harness-adapter.ts`, `adapter-pool.ts`). Capability detail: [../agent-layer/harness-capability-descriptor.md](../agent-layer/harness-capability-descriptor.md).

**S-3.2** Agents run as host processes; sandboxing is opt-in, never the default. The `SandboxAdapter` surface is `spawn`/`exec`/`destroy` (`packages/server/src/harness/sandbox-adapter.ts:20-22`). See [../architecture/run-unit-model.md](../architecture/run-unit-model.md).

**S-3.3** Model tier (`reasoning | workhorse | fast`, `packages/shared/src/types.ts:108`) is assigned at session creation. The deployer maps a provider + model to each tier (`model-gateway.ts`); API keys live in the credential store, not in tier config. Tier vocabulary and routing: [../agent-layer/model-routing-and-cost.md](../agent-layer/model-routing-and-cost.md).

## S-4: Threads and Messaging

**S-4.1** All human↔agent and agent↔agent communication flows through the Thread primitive: append-only sequences of typed messages `plain | review | questionnaire | verdict` (`packages/shared/src/thread.ts:31`), attached to a host entity (`HOST_KINDS`).

**S-4.2** Binding review decisions use the five-verdict grammar `approve | approve-with-comments | request-changes | edit | reject` (`thread.ts:34`); non-binding actions append plain messages. Full grammar: [../human-interface-layer/thread-primitive.md](../human-interface-layer/thread-primitive.md).

**S-4.3** Threads mount on their hosts in the UI (`useHostThread`); humans can initiate conversations with agents (`RecipientPicker`), and the Conversations view renders every thread the human participates in (`packages/web/src/pages/Conversations.tsx`).

## S-5: Identity and Routing

**S-5.1** One unified `users` table with `kind: 'human' | 'ai'` is the identity model (`packages/db/src/schema.ts:38`). Review routing flows through polymorphic `org_edges` (`schema.ts:548`). Item routing rules: [../human-interface-layer/items-and-routing.md](../human-interface-layer/items-and-routing.md).

## S-6: Scheduling

**S-6.1** Routines support four trigger types: `heartbeat | calendar | event | continuous` (`packages/shared/src/types.ts:118`). Routine semantics: [../process-layer/routines-and-retros.md](../process-layer/routines-and-retros.md).

**S-6.2** Scheduling runs as in-process `setInterval` services (`packages/fabric/src/services/`) on the Node.js event loop — no cron daemon, no background worker process. Scale to a separate worker only when measured latency demands it.

**S-6.3** No external workflow or agentic frameworks in the process layer — no Temporal, no Inngest, no Letta, no Agent Mail. All agentic integration happens through harness adapters. Confirmed by absence of any such dependency in `packages/`.

## S-7: Observability

**S-7.1** Every system event ships through one observability adapter with a correlating traceId (`packages/shared/src/observability/events.ts`). Console adapter is the default; OpenTelemetry is deferred, not dead.

## S-8: Notification Delivery

**S-8.1** Notification adapters: console, ntfy, SMTP (`packages/fabric/src/services/notifications/`). Minimum viable delivery is ntfy or plain SMTP. Primitive behavior (queue, digest, mute): [../human-interface-layer/notification-primitive.md](../human-interface-layer/notification-primitive.md).

## S-9: Security and Credentials

**S-9.1** Credentials are stored encrypted — AES-256-GCM in `server_credentials` on shared deployments (`packages/server/src/services/credential-encryption.ts`), Electron `safeStorage` on desktop (`packages/desktop/src/safe-credentials.ts`) — and injected at spawn so agents never handle plaintext. Depth: [../architecture/credential-model.md](../architecture/credential-model.md).

**S-9.2** The desktop app binds to localhost only. Auth is an auto-generated API key (`crypto.randomBytes(32)`, `packages/desktop/src/main.ts:110`) delivered over the Electron preload bridge. No public-internet exposure.

**S-9.3** No preemptive gating. Agent review requirements come from approval-rate × riskTier trust, not blanket approval rules. See [../human-interface-layer/review-primitive.md](../human-interface-layer/review-primitive.md).

## NF: Non-Functional

**NF-1** Hitting WIP or cost limits produces visible events, never silent drops — the cost sentinel emits `CostCapWarningEvent`/`CostCapBreachedEvent` on level transitions (`packages/fabric/src/services/cost-sentinel.ts`). Cap grammar: [../process-layer/wip-and-cost-limits.md](../process-layer/wip-and-cost-limits.md).

**NF-2** New agents are added in-app (AgentAddDialog/AgentEditDialog) against the data-driven role registry (`packages/shared/src/agent-roles.ts`) — no process-layer code changes. Adding a new role label is a code change.

## Standing Decisions

Settled boundaries. The code-verified architecture decision log is [../architecture/decisions.md](../architecture/decisions.md).

- **Practice meetings are a 3-turn workflow** — propose → react → facilitator synthesizes (`packages/fabric/src/services/practice-meeting.ts`, seeded as the `builtin:practice-meeting` routine).
- **TOON rides the external spec** at github.com/toon-format/toon; no in-house dialect.
- **Scheduler stays in-process and single-process** until measured latency demands a separate worker (S-6.2).
- **No external workflow frameworks in the process layer** (S-6.3) — a standing decision, not an implementation gap.
- **Writeback is continuous, not session-boundary** — the file watcher (`packages/fabric/src/file-watcher.ts`) syncs during the session; `polling-watcher.ts` is the fallback for environments without native `fs.watch`.
- **Desktop distribution** — Electron shell, server embedded in the main process, signed/notarized DMG, Homebrew-cask-stable names (S-1.1).
