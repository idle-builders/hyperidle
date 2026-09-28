# Security

Who may read and write what, how WebSocket subscriptions are authorized, and where secrets live.

## Principal

The **Principal** is the authenticated identity on a request — `c.get("userId")`, set by `createAuthMiddleware` (`layers/core-api/src/middleware/auth.ts`). Every authorization decision is made against the Principal. A value from a client-supplied header is never a Principal.

## Trust mode

There is one credential: the deployment's `HYPERIDLE_API_KEY`, sent as `X-API-Key` and compared in constant time. There are no login sessions, invite codes, or bearer tokens.

A valid key makes the caller the first human row on `users`. Any `x-hyperidle-actor-id` header on the request is ignored. Tests that need a specific actor call the action in-process via `action.run({ actor, db, eventBus, now }, input)`.

`HYPERIDLE_SHARED_MODE` changes one thing: whose identity `POST /api/auth/ws-token` mints the WebSocket upgrade token for. In shared mode it is the authenticated caller; in local mode the `X-Identity` header may name the identity (safe because the caller already holds the master key). `X-Identity` grants no authority anywhere else.

A deployment is single-founder: one human owns the deployment's connections, and every agent it provisions uses that human's connection tokens (`layers/agent-orchestration/run-orchestration/src/connection-provisioning.ts`).

## Thread access

`canReadThread` / `canWriteThread` (`framework/domain-model/src/actions/thread.ts`) — pure predicates, no DB round-trip beyond the thread row. One rule: a thread's visibility inherits from its host.

| Scope | Host kinds | Visible iff |
|---|---|---|
| participant-scope | `user`, `agent` | actor is in `thread.members[]` |
| host-scope | `team`, `document`, `factory` | any signed-in principal |

A task's own thread is `team`-hosted. Posting to a host-scoped thread joins the actor to it in the same transaction. A `user`/`agent`-hosted thread refuses a non-member outright.

## Document access

`canReadDocument` (`framework/domain-model/src/actions/document.ts`) — checks the document's `scope` (factory / team / user) and the viewer's team membership.

## Worker

A Worker is a session-execution endpoint, not an org member. Its token (`GET /ws/worker?token=<HYPERIDLE_WORKER_TOKEN>`) authorizes exactly one capability: run the sessions assigned to this worker. A worker authenticates to a shared-mode server with `shared_backend_key`.

## WS subscribe authorization

All WebSocket subscribes route through `createDbSubscribeAuthorizer` (`layers/core-api/src/ws-subscribe-authorizer.ts`):

| Topic | Admitted iff |
|---|---|
| `conversations`, `documents` | any authenticated identity |
| `thread:<id>` | `canReadThread` passes for that thread |
| `document:<id>` | `canReadDocument` passes for that document |
| `session:<id>` | any signed-in identity (no table read) |
| `user:<id>` | the subscriber's own id matches the topic id |
| anything else | denied |

## Secrets

| Kind | What | Protection |
|---|---|---|
| **Root secret** | `HYPERIDLE_API_KEY` | OS file permissions; desktop uses `secrets.json` |
| **Managed connection tokens** | `service_connections` rows | AES-256-GCM via `layers/agent-orchestration/connections/src/token-cipher.ts` |
| **Deployment credential** | `shared_backend_key` (remote worker auth to a shared server) | Desktop OS keychain only (`applications/desktop/src/safe-credentials.ts`); never sent to a server, never read back into the UI |

HyperIdle holds no model credential. A harness brings its own login; its key never passes through HyperIdle. Hiding a field from a GET response is not protection.

## Hard rules

1. **Read parity** — detail reads require the same authorization as the list. No read path is looser than its list path.
2. **Principal-only authorization** — a client-supplied identity header never grants access to another principal's data.
3. **Worker confinement** — a worker token cannot read credentials beyond its assigned session, nor act as a different worker.
4. **No plaintext secret** — no managed secret is persisted or logged in plaintext.
5. **No over-restriction** — host-scoped resources remain readable per host visibility; tightening a team-readable thread is as much a defect as leaking a DM.
