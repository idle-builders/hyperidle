# Security

Who may read and write what, how WebSocket subscriptions are authorized, and where secrets live.

## Principal

The **Principal** is the authenticated identity on a request — `c.get("userId")`, set by `createAuthMiddleware` (`layers/core-api/src/middleware/auth.ts`). Every authorization decision is made against the Principal. A value from a client-supplied header is never a Principal.

## Trust mode

Every request carries a key as `X-API-Key`. There are no login sessions or invite codes, and no bearer token is ever an API credential.

- **A person's own key** makes the caller that person. Only its sha256 is kept (`users.key_hash`); the key itself lives on the person's computer.
- **The team key** — the deployment's `HYPERIDLE_API_KEY`, compared in constant time — makes the caller nobody yet. It is for what needs no person, such as a laptop's first start, which makes the one person and keeps the key it was called with as theirs. Of the actions it may only run `open_user`, which answers that there is no one yet; every other action is refused (`no_person`).
- **Joining** takes no key: `POST /api/join` takes an ID token from the server's sign-in service (`HYPERIDLE_SIGN_IN_ISSUER`), checked against that service's published keys, issuer, this app's id there and a proven email (`layers/core-api/src/routes/join.ts`). It makes the person (named by a unique `users.email`) and hands back their own key; signing in again hands the same person a new key, and the old one stops working. Who may sign in at all is the sign-in service's call.
- Any other key is refused.

There is no fallback to "the first human". Tests that need a specific actor call the action in-process via `action.run({ actor, db, eventBus, now }, input)`, or give that person a key (`asPerson` in the core-api fixtures). `POST /api/auth/ws-token` mints the WebSocket token for the caller.

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

## WS subscribe authorization

All WebSocket subscribes route through `createDbSubscribeAuthorizer` (`layers/core-api/src/ws-subscribe-authorizer.ts`):

| Topic | Admitted iff |
|---|---|
| `conversations`, `documents`, `tasks` | any authenticated identity |
| `thread:<id>` | `canReadThread` passes for that thread |
| `document:<id>` | `canReadDocument` passes for that document |
| `session:<id>` | any signed-in identity (no table read) |
| `user:<id>` | the subscriber's own id matches the topic id |
| `task:<id>` | any signed-in identity, no table read (tasks have no per-row ACL) |
| anything else | denied |

## Secrets

| Kind | What | Protection |
|---|---|---|
| **Root secret** | `HYPERIDLE_API_KEY` | OS file permissions; desktop uses `secrets.json` |
| **Managed connection tokens** | `service_connections` rows | AES-256-GCM via `layers/agent-orchestration/connections/src/token-cipher.ts` |
| **Joined-server key** | the person's own key for the shared server they joined | Desktop OS keychain only (`applications/desktop/src/safe-credentials.ts`); never read back into the UI |

HyperIdle holds no model credential. A harness brings its own login; its key never passes through HyperIdle. Hiding a field from a GET response is not protection.

## Hard rules

1. **Read parity** — detail reads require the same authorization as the list. No read path is looser than its list path.
2. **Principal-only authorization** — a client-supplied identity header never grants access to another principal's data.
3. **No plaintext secret** — no managed secret is persisted or logged in plaintext.
4. **No over-restriction** — host-scoped resources remain readable per host visibility; tightening a team-readable thread is as much a defect as leaking a DM.
