# System Requirements

Platform constraints and standing decisions — what the system must run on and the boundaries it must respect, stated as testable outcomes. Mechanism detail lives with the owning docs (linked per section). Feature behavior is in [functional-requirements.md](functional-requirements.md).

## S-1: Deployment

**S-1.1** The system ships as a native macOS desktop app (Electron) with the API server embedded in the main process (`applications/desktop/src/main.ts`, `bootLocalMode`). Distributed as a signed/notarized DMG with Homebrew-cask-stable artifact names (`applications/desktop/electron-builder.yml`). No Docker, no separate server process. Install and profile detail: [../deployment/index.md](../deployment/index.md).

**S-1.2** A new user goes from install to a working app shell through SetupFlow (`layers/core-ui/src/pages/SetupFlow.tsx`) — no manual config files, no env vars.

**S-1.3** Node >= 24 (root `package.json` `engines.node >= 24.0.0`). Dev setup: [../guides/developer/getting-started.md](../guides/developer/getting-started.md).

## S-2: Data Storage

**S-2.1** Local storage is PGlite (embedded Postgres, `@electric-sql/pglite`) in the app data directory (`~/Library/Application Support/@hyperidle/desktop`). Server deployments run real Postgres (`migrate-pg.ts`, `pg-ssl.ts`). Store semantics: [../knowledge-architecture/the-canonical-store.md](../knowledge-architecture/the-canonical-store.md); deployment recipes: [../deployment/index.md](../deployment/index.md).

**S-2.2** Human-readable knowledge lives as database rows. **The Git export is not implemented** — the exporter was deleted in AU26 (increment C1) and the path this requirement cited had not existed since AU19. The database is the source of truth and currently the only store. The unimplemented export sketch: [../knowledge-architecture/facilitators.md](../knowledge-architecture/facilitators.md).

**S-2.3** Session context packs use the TOON format (external spec: github.com/toon-format/toon; codec at `framework/toon-codec/src/toon-codec.ts`), assembled at session start by `layers/agent-orchestration/run-orchestration/src/context.ts` together with `layers/core-api/knowledge/src/session-knowledge-assembler.ts`.

**S-2.4** Knowledge writes back continuously during a session with optimistic concurrency (`version` column, `framework/db/src/schema.ts`) — never a session-boundary batch. Implementation: `layers/agent-orchestration/run-orchestration/src/file-watcher.ts`, `fs.watch`-based with a 500ms debounce. Sync mechanism: [../knowledge-architecture/sync-and-conflict-resolution.md](../knowledge-architecture/sync-and-conflict-resolution.md).

## S-3: Agent Runtime

**S-3.1** The system runs agents through installed CLI harnesses only — claude-code, codex, opencode, cursor-agent (`cli-harness-adapter.ts`, `adapter-pool.ts`) — plus remote workers. Each authenticates through its own login; HyperIdle stores no model credential. A builtin in-process model-calling harness was removed. Capability detail: [../agent-layer/harness-capability-descriptor.md](../agent-layer/harness-capability-descriptor.md).

**S-3.2** Agents run as host processes; sandboxing is opt-in, never the default. The `SandboxAdapter` surface is `spawn`/`exec`/`destroy` (`layers/agent-execution/harness-registry/src/sandbox-adapter.ts`). See [../architecture/run-unit-model.md](../architecture/run-unit-model.md).

**S-3.3** A session runs the model its agent was configured with (`agent_run_config.model_id`), passed to the harness binary as `--model`. Model tier (`reasoning | workhorse | fast`, `framework/domain-model/src/types.ts`) is still assigned at session creation but selects nothing — it keys the token-usage bucket a session's spend is reported in. Tier vocabulary and routing: [../agent-layer/model-routing-and-cost.md](../agent-layer/model-routing-and-cost.md).

## S-4: Threads and Messaging

**S-4.1** All human↔agent and agent↔agent communication flows through the Thread primitive: append-only sequences of typed messages `plain | review | questionnaire | verdict` (`framework/domain-model/src/thread.ts`), attached to a host entity (`HOST_KINDS`).

**S-4.2** Binding review decisions use the five-verdict grammar `approve | approve-with-comments | request-changes | edit | reject` (`thread.ts`); non-binding actions append plain messages. Full grammar: [../human-interface-layer/thread-primitive.md](../human-interface-layer/thread-primitive.md).

**S-4.3** Threads mount on their hosts in the UI (`useHostThread`); humans can initiate conversations with agents (`RecipientPicker`), and the Conversations view renders every thread the human participates in (`layers/core-ui/src/pages/Conversations.tsx`).

## S-5: Identity and Routing

**S-5.1** One unified `users` table with `kind: 'human' | 'ai'` is the identity model (`framework/db/src/schema.ts`). Review routing flows through polymorphic `org_edges` (`schema.ts`). Item routing rules: [../human-interface-layer/items-and-routing.md](../human-interface-layer/items-and-routing.md).

## S-6: Scheduling

**S-6.1** Routines support four trigger types: `heartbeat | calendar | event | continuous` (`framework/domain-model/src/types.ts`). Routine semantics: [../process-layer/routines-and-retros.md](../process-layer/routines-and-retros.md).

**S-6.2** Scheduling runs as in-process `setInterval` services, distributed across `layers/core-api/*/src/` and `layers/agent-orchestration/*/src/` (e.g. `layers/core-api/routine/src/routine-scheduler.ts`), on the Node.js event loop — no cron daemon, no background worker process. Scale to a separate worker only when measured latency demands it.

**S-6.3** No external workflow or agentic frameworks in the process layer — no Temporal, no Inngest, no Letta, no Agent Mail. All agentic integration happens through harness adapters. Confirmed by absence of any such dependency across `layers/`, `framework/`, `applications/`, `tools/`.

## S-7: Observability

**S-7.1** Every system event ships through one observability adapter with a correlating traceId (`framework/diagnostics/src/observability/events.ts`). Console adapter is the default; OpenTelemetry is deferred, not dead.

## S-8: Notification Delivery

**S-8.1** Notification adapters: console, ntfy, SMTP (`layers/core-api/notifications/src/`). Minimum viable delivery is ntfy or plain SMTP. Primitive behavior (queue, digest, mute): [../human-interface-layer/notification-primitive.md](../human-interface-layer/notification-primitive.md).

## S-9: Security and Credentials

**S-9.1** Credentials are stored encrypted — AES-256-GCM in `server_credentials` on shared deployments (`framework/credential-access/src/crypto/credential-encryption.ts`), Electron `safeStorage` on desktop (`applications/desktop/src/safe-credentials.ts`) — and injected at spawn so agents never handle plaintext. Depth: [../architecture/credential-model.md](../architecture/credential-model.md).

**S-9.2** The desktop app binds to localhost only. Auth is an auto-generated API key (`crypto.randomBytes(32)`, `applications/desktop/src/main.ts`) delivered over the Electron preload bridge. No public-internet exposure.

**S-9.3** No preemptive gating. Agent review requirements come from approval-rate × riskTier trust, not blanket approval rules. See [../human-interface-layer/review-primitive.md](../human-interface-layer/review-primitive.md).

## NF: Non-Functional

**NF-1** Hitting a WIP limit is enforced synchronously, never a silent drop — see F-9.3.

**NF-2** New agents are added in-app (AgentAddDialog/AgentEditDialog) against the data-driven role registry (`framework/domain-model/src/agent-roles.ts`) — no process-layer code changes. Adding a new role label is a code change.

## Standing Decisions

Settled boundaries. The code-verified architecture decision log is [../architecture/decisions.md](../architecture/decisions.md).

- **TOON rides the external spec** at github.com/toon-format/toon; no in-house dialect.
- **Scheduler stays in-process and single-process** until measured latency demands a separate worker (S-6.2).
- **No external workflow frameworks in the process layer** (S-6.3) — a standing decision, not an implementation gap.
- **Writeback is continuous, not session-boundary** — the file watcher (`layers/agent-orchestration/run-orchestration/src/file-watcher.ts`) syncs during the session.
- **Desktop distribution** — Electron shell, server embedded in the main process, signed/notarized DMG, Homebrew-cask-stable names (S-1.1).
