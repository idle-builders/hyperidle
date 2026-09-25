# Authorization model

The single boundary deciding **who may read/write what**, and how secrets are protected. Backend-authoritative; applies uniformly across threads, sessions, artifacts, the assistant, and workers.

**This doc is load-bearing.** `framework/domain-model/src/actions/thread.ts` cites this table as its sync contract — adding a host kind requires updating `HOST_SCOPED` *and* the scope table below.

## Principal

The **Principal** is the *authenticated* acting identity bound to a request — `c.get("userId")`, set by `createAuthMiddleware` (`layers/core-api/src/middleware/auth.ts`) from a verified credential. Every authorization decision is made against the Principal and nothing else.

- A Principal exists only when a credential was *verified*. A value from a client-supplied header is never a Principal.
- The Principal is **not** the agent identity (persona/system prompt) and **not** the `X-Identity` header.
- Routes consume `c.get("userId")`; they never re-derive identity from headers (lint-enforced, see below).

## Access boundary

`canReadThread`/`canWriteThread(actor, thread) → bool` — a pair of pure predicates in `framework/domain-model/src/actions/thread.ts` (`canReadThread`, `canWriteThread`), evaluated inside `send_message.run`/`adjust_thread.run` and by `open_thread`/`search_threads`, no DB round-trip beyond the thread row already read. **One rule:** *a thread's visibility inherits from its host.* Two scopes:

| Scope | Host kinds | Visible iff |
|---|---|---|
| **participant-scope** | `user`, `agent` (DM / assistant) | `actor ∈ thread.members[]` |
| **host-scope** | `team`, `document`, `factory` | any signed-in principal |

Host kinds are closed (`document|agent|user|team|factory`). There is no `bet` host kind and no `task` host kind — a task's own thread is `team`-hosted (see [thread-primitive.md](../human-interface-layer/thread-primitive.md)). Each maps to exactly one scope; adding a kind requires updating this table first.

The boundary is **derived, never a user-edited ACL**. There is one pair of decision functions; every read and write action routes through them. Host-scoped resources **must stay broadly readable** — over-restricting a task/knowledge discussion is as much a defect as leaking a participant-scoped one.

`canWriteThread` delegates to `canReadThread` today, so posting to a host-scoped thread the actor can already read — but is not yet a member of — joins the actor to it, in the same transaction as the post. That is the only way to join a thread. A `user`/`agent`-hosted thread refuses a non-member outright: there is no join path onto a DM.

**Not** the same as knowledge `scope_kind` — that classifies content *placement*, not request *authorization*.

## Trust mode

There is one credential: the deployment's `HYPERIDLE_API_KEY`, sent as `X-API-Key` and compared in constant time (`layers/core-api/src/middleware/auth.ts`). There are no login sessions, invite codes or bearer tokens, locally or on the shared backend.

- A valid key makes the caller the first human row on `users` — before the welcome screen has created a person, a placeholder id stands in, and that first `edit_user` runs as it.
- The Application's own composition root may name a different actor with the actor-override header (`CORE_API_ACTOR_OVERRIDE_HEADER`), so an agent's tool call acts as that agent. No external client sets it.
- On the shared backend every key holder is therefore the same person: the key is shared by a small team that trusts each other, not a per-person login.

`HYPERIDLE_SHARED_MODE` changes one thing only: whose identity `POST /api/auth/ws-token` mints the WebSocket upgrade token for (`layers/core-api/src/app.ts`, `routes/auth.ts`). In shared mode it is the authenticated caller; in local mode the `X-Identity` header may name the identity, which is safe because the caller already holds the master key. `X-Identity` grants no authority anywhere else.

Endpoints are mode-agnostic. The invariant: **authorization always reads the Principal the middleware resolved, never a header.**

## Worker

A **Worker** is a capability-bounded session-execution endpoint — **not** a Principal, **not** an org member.

- Identity is **server-issued and token-bound** (`GET /ws/worker?token=<HYPERIDLE_WORKER_TOKEN>`), not self-asserted: a `register` cannot claim or replace another worker's identity (`id_in_use` rejection + liveness probe, `layers/agent-orchestration/run-orchestration/src/worker-ingress.ts`).
- Its token authorizes exactly one capability: *run the sessions assigned to this worker.* No authority to read threads, artifacts, or knowledge.
- There is no server-side credential store for a worker to reach. A worker authenticates to a shared-mode server with `shared_backend_key`, read from its own desktop keychain (see [credential-model.md](credential-model.md)).

## Secrets

| Kind | What | Protection |
|---|---|---|
| **Root-of-trust secret** | The single bootstrap key (`HYPERIDLE_API_KEY`, OS-protected `secrets.json` / desktop safeStorage). | OS file permissions. *Not* encrypted-with-itself. |
| **Managed secret** | A user's connection tokens (`service_connections`), and the one remaining credential (`shared_backend_key`). | Encrypted at rest — connection tokens via the cipher in `@hyperidle/connections` ([connection-model.md](connection-model.md)); the credential via the desktop OS keychain ([credential-model.md](credential-model.md)). **Never plaintext, persisted or logged, anywhere.** |

Hiding a field from GET responses is **not** protection. A connection token lives in the `service_connections` store, encrypted, never in the `server_config` blob. There is no server-side credential store at all any more — the model-tier keys this rule was written for are gone entirely, and the one credential HyperIdle still holds never leaves the desktop keychain. See [credential-model.md](credential-model.md).

## Enforcement layer & default posture

**Where it runs:** the **application/server layer** (Hono middleware + the single access-boundary decision function). The DB executes whatever the server sends; there is **no Row-Level Security** (`isRLSEnabled: false`).

- **Authentication is default-on** — `createAuthMiddleware` is mounted globally (`layers/core-api/src/api-middleware-stack.ts:75`); no `/api/*` route is reachable without a verified credential.
- **Authorization is default-deny.** Least privilege: a route exposes or mutates per-principal/per-host data only by **explicitly declaring** its access boundary (`__boundary`); absence of a declaration **fails closed** via `failClosedAssertion()` (`layers/core-api/src/api-middleware-stack.ts`), never open. This is Saltzer–Schroeder *fail-safe defaults* / OWASP *deny-by-default* — a named standard, not a bespoke scheme, and the structural fix for the guard-added-to-one-endpoint-missed-on-its-neighbour recurrence.
- **Static guardrails (lint).** Custom ESLint rules live in `tools/eslint-plugin-authz/src/rules/`: `no-raw-db-in-route-bypassing-policy`. `no-header-identity-in-authz` is deleted — its sink was the header-reading code in `routes/threads.ts`, and that route is gone (the actions router reads only `c.get("userId")`), so the property it enforced is structural now, not lint-checked.

**RLS — deferred, not rejected.** Postgres RLS would add defense-in-depth (the DB refuses cross-tenant rows even if a route forgets its guard). Deferred because the dominant deployment is local-trust single-founder (nothing to isolate), and the boundary logic is relational/JSON-array-shaped — awkward to mirror in SQL `USING` clauses, duplicating server logic. **Revisit when** a managed multi-tenant cloud deployment is on the table; that is the trigger to add RLS as a second layer beneath the server-layer chokepoint.

## WS subscribe authorization

Every WebSocket subscribe routes through `canSubscribe` (DB-backed authorizer `createDbSubscribeAuthorizer`, `layers/core-api/src/ws-subscribe-authorizer.ts:78`):

- **Global topics** (`conversations`, `work`) — any authenticated identity.
- **`session:<id>`** — the session must exist and its task host must resolve; valid sessions are host-scope (any authenticated principal), non-existent or unresolvable sessions deny fail-closed.
- **`thread:<id>`** — the subscriber must be in the thread's `participants` column (participant-scope — the same case `canReadThread` covers for `user`/`agent` hosts).
- **`document:<id>`** — the same `canReadDocument` predicate `document-actions.ts`'s own read path uses, against the subscriber's subjects and effective team.
- **`user:<id>`** — a subscription's inbox nudge; admits only the identity named in the topic itself (no table read, the same "identity alone" rule `session:<id>` uses).
- **Anything else** — denied.

This is the authoritative statement of WS subscribe authorization; the WS push contract in [as-implemented-domain-architecture.md](as-implemented-domain-architecture.md) cites it.

## Hard rules

1. **Read parity** — detail reads require the same authorization as the list. `open_thread`, the `session:<id>` WS topic, and artifact detail/preview enforce their list endpoint's boundary. No read path is looser than its list path.
2. **Principal-only authorization** — a client-supplied identity header never grants access to another principal's data, in any trust mode.
3. **Worker confinement** — a worker token cannot read credentials beyond its assigned session, nor act as a different worker.
4. **No plaintext secret** — no managed secret is ever persisted or logged in plaintext (incl. any on-disk file other than the OS-protected root secret). See [credential-model.md](credential-model.md).
5. **No over-restriction** — host-scoped resources remain readable per host visibility; a fix must not break legitimate whole-team reads.
6. **Default-deny** — a route touching per-principal/per-host data must declare its access boundary explicitly; an undeclared route fails closed. Enforced at runtime (the chokepoint) and statically (ESLint).

## Out of scope

Role-based access control and enterprise auth (out of product scope). Per-resource sharing UI. Session-execution wiring beyond the credential/worker-token boundary.
