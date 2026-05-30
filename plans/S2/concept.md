# S2 — Remote Execution via HarnessAdapter: Concept

**Status:** Concept verified -- no new primitives, no reshaped concepts.
**Parent concept:** `plans/shared-server/concept.md` (locked)

---

## Required reading

Downstream agents (`/architecture`, `/pipeline`) must read:

- `plans/shared-server/concept.md` -- noun classification, Worker operational concept, HarnessAdapter boundary decision
- `plans/work-packages/TRACK-S.md` -- S2 acceptance criteria (lines 62-117)
- `packages/shared/src/harness/harness-adapter.ts` -- the interface RemoteHarnessAdapter must implement
- `packages/shared/src/harness/harness-events.ts` -- event types streamed through the adapter
- `packages/server/src/harness/claude-agent-sdk-adapter.ts` -- reference implementation (278 lines)
- `packages/server/src/services/session-provisioning.ts` -- 11-phase orchestration, currently takes single `harness: HarnessAdapter`
- `packages/server/src/services/session-lifecycle.ts` -- session state management (createSession, endSession, crashSession)
- `packages/server/src/routes/ws.ts` -- existing user WebSocket infrastructure (auth pattern, upgrade tokens)
- `packages/server/src/services/ws-broadcaster.ts` -- event multiplexing pattern
- `packages/server/src/services/credential-resolver.ts` -- local vs shared credential resolution
- `packages/server/src/server-factory.ts` -- where HarnessAdapter is instantiated and injected
- `packages/server/src/app.ts` -- AppOptions interface, dependency injection pattern
- `packages/shared/src/credential.ts` -- CREDENTIAL_NAMES catalog (currently 3 entries)
- `docs/architecture/key-interfaces-between-components.md` -- Meta -> Harness flow (section 4.2)
- `docs/process-layer/tasks-and-sessions.md` -- session lifecycle, memory across sessions

---

## Noun classification (verified against parent concept)

| Noun | Class | Concept work needed | Notes |
|---|---|---|---|
| HarnessAdapter | Stable interface | No | Gains a new implementation; interface unchanged |
| RemoteHarnessAdapter | New implementation | No (implementation, not concept) | Implements HarnessAdapter over WebSocket relay |
| Worker | Operational concept (locked) | No | Already defined in parent concept doc |
| AdapterPool | New operational concept | Architecture only | In-memory registry with selection logic; not a primitive |
| WorkerConnection | Satellite | No | WebSocket transport detail of Worker |
| ProcessIsolation | Satellite | No | Child-process constraint on server-side local adapter |
| worker_token | New credential | Architecture only | Must be added to P3 credential catalog or handled separately |

**No new primitives. No reshaped concepts.** Everything S2 introduces is either a new implementation of a stable interface or an operational/infrastructure concern. The parent concept doc's decisions hold without modification.

---

## Key concept decisions (inherited, not new)

1. **HarnessAdapter is the boundary.** No new dispatch/routing abstraction. Session provisioning picks an adapter. (parent concept, decision 2)
2. **Worker is operational, not domain.** Workers don't appear in the UI, don't participate in threads, have no lifecycle that users manage. (parent concept, Worker section)
3. **No queue persistence.** Capacity exhaustion = retriable error. Tasks stay in lifecycle state for re-trigger. (parent concept, self-critique; S2 AC)
4. **WebSocket keepalive replaces heartbeat.** No application-level heartbeat protocol. Connection close = worker gone. (parent concept, decision 3)
5. **Server is always a worker.** Local adapter self-registers into the pool. "No workers" edge case eliminated. (parent concept, decision 5)

---

## Gap: worker_token credential

The S2 spec says: "Auth: `worker_token` credential (added to P3 catalog)."

Current state: `CREDENTIAL_NAMES` in `packages/shared/src/credential.ts` is a **closed** set of 3 entries (`anthropic_api_key`, `openrouter_api_key`, `shared_backend_key`). The P3 concept doc says the catalog is "intentionally not user-extensible."

**Decision for architecture:** `worker_token` is conceptually different from the existing credentials. The existing three are API keys for external services or server auth. A worker token is a pre-shared key for internal infrastructure authentication -- closer to `HYPERIDLE_API_KEY` (server admin key) than to `anthropic_api_key`.

Two options:
1. **Add to catalog** -- extend `CREDENTIAL_NAMES` to 4 entries. Simple but conflates "external service keys" with "internal auth tokens."
2. **Separate mechanism** -- use an env var (`HYPERIDLE_WORKER_TOKEN`) or a separate config, not the credential catalog. Matches how `HYPERIDLE_API_KEY` works (env var, not in the catalog).

The architecture skill must decide. The concept is: worker_token is an internal infrastructure credential, not an external service API key.

---

## Vocabulary (additions to parent concept's table)

| Term | Definition | Aliases not to use |
|---|---|---|
| **AdapterPool** | In-memory registry of available HarnessAdapter instances | dispatcher, worker pool, execution pool |
| **RemoteHarnessAdapter** | HarnessAdapter implementation that relays over WebSocket to a worker | remote adapter, proxy adapter, worker adapter |
| **worker_token** | Pre-shared credential for worker WebSocket authentication | worker key, worker password, worker secret |
| **dispatch** | Sending a SessionConfig to a worker for execution | assign, route, schedule |
| **capacity** | Running sessions < maxConcurrent for an adapter | availability, slots, load |

---

## Self-critique

1. **Is AdapterPool really just a Map?** Yes, at the implementation level. But at the concept level it encapsulates selection logic (capability matching + least-loaded). The name communicates "collection with policy" rather than "bare container." Architecture decides the shape.

2. **Does "server is always a worker" create confusion?** The server's local adapter is in the pool alongside remote adapters. Session provisioning doesn't know which is which. This is the entire point -- transparent distribution. No confusion if the adapter pool treats all entries uniformly.

3. **Is the worker_token gap blocking?** No. The concept doc permits either resolution. Architecture picks one.

4. **Does RemoteHarnessAdapter need concept-level locking?** No. It implements a stable interface. The concept is the interface, not the implementation. If RemoteHarnessAdapter changed the interface (new methods, new event types), that would be a concept change. The S2 AC explicitly forbids this: "HarnessAdapter interface unchanged. No new methods, no new event types."

**Concept verified. Ready for /architecture.**
