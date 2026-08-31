# Authorization model

The single boundary deciding **who may read/write what**, and how secrets are protected. Backend-authoritative; applies uniformly across threads, sessions, artifacts, the assistant, and workers.

**This doc is load-bearing.** `layers/core-api/src/auth/access-boundary.ts` cites it as its sync contract — adding a host kind requires updating `HOST_SCOPE` *and* the scope table below.

## Principal

The **Principal** is the *authenticated* acting identity bound to a request — `c.get("userId")`, set by `createAuthMiddleware` (`layers/core-api/src/middleware/auth.ts`) from a verified credential. Every authorization decision is made against the Principal and nothing else.

- A Principal exists only when a credential was *verified*. A value from a client-supplied header is never a Principal.
- The Principal is **not** the agent identity (persona/system prompt) and **not** the `X-Identity` header.
- Routes consume `c.get("userId")`; they never re-derive identity from headers (lint-enforced, see below).

## Access boundary

`canRead/canWrite(principal, resource) → bool` — a single pure predicate in `layers/core-api/src/auth/access-boundary.ts` (`HOST_SCOPE` :32, `canRead` :60, `canWrite` :78), evaluated server-side per request, no DB round-trip. **One rule:** *a resource's visibility inherits from its host.* Two scopes:

| Scope | Host kinds | Visible iff |
|---|---|---|
| **participant-scope** | `user`, `agent` (DM / assistant / pinned configs) | `principal ∈ host.participants[]` |
| **host-scope** | `bet`, `task`, `knowledge_item`, `artifact`, `team`, `factory` | principal can see the host entity (today: any authenticated principal; later: host membership) |

Host kinds are closed (`bet|task|knowledge_item|artifact|agent|user|team|factory`). Each maps to exactly one scope; adding a kind requires updating this table first.

The boundary is **derived, never a user-edited ACL**. There is one decision function; every read endpoint and every WS subscribe routes through it. Host-scoped resources **must stay broadly readable** — over-restricting a bet/task/knowledge discussion is as much a defect as leaking a participant-scoped one.

`canWrite` mirrors `canRead` today; it is kept separate so future write-only tightening (e.g. only bet members can commit) has a seam.

**Not** the same as knowledge `scope_kind` — that classifies content *placement*, not request *authorization*.

## Trust mode

A deployment switch (`sharedMode` on the auth middleware) for how identity is *established* — not what a Principal may do.

- **local-trust** (desktop, single founder): the API key *is* the one founder; one human user. `X-Identity` may *attribute* multi-agent test traffic but grants **no** cross-identity authority.
- **multi-user-trust**: identity comes only from a verified per-principal credential (Bearer login-session); `X-Identity` is ignored for authorization entirely.

Endpoints stay mode-agnostic — only the middleware differs. The invariant that makes one codebase safe in both modes: **authorization always reads the Principal, never the header.** Local mode stays frictionless because its single principal trivially passes host-scope checks.

## Worker

A **Worker** is a capability-bounded session-execution endpoint — **not** a Principal, **not** an org member.

- Identity is **server-issued and token-bound** (`GET /ws/worker?token=<HYPERIDLE_WORKER_TOKEN>`), not self-asserted: a `register` cannot claim or replace another worker's identity (`id_in_use` rejection + liveness probe, `layers/agent-orchestration/run-orchestration/src/worker-ingress.ts`).
- Its token authorizes exactly one capability: *run the sessions assigned to this worker.* No authority to read threads, artifacts, knowledge, or the credential store.
- Credentials reach a worker **scoped to its assigned session's provider** (or the server proxies the model call) — never as a readable org-wide store.

## Secrets

| Kind | What | Protection |
|---|---|---|
| **Root-of-trust secret** | The single bootstrap key (`HYPERIDLE_API_KEY`, OS-protected `secrets.json` / desktop safeStorage). | OS file permissions. *Not* encrypted-with-itself. |
| **Managed secret** | Every other secret (provider/credential values). | Encrypted at rest, key derived from the root — mechanism owned by [credential-model.md](credential-model.md). **Never plaintext, persisted or logged, anywhere.** |

Hiding a field from GET responses is **not** protection. Every credential lives in the `server_credentials` store, never in the `server_config` blob. The model-tier keys this rule was written for are gone entirely — HyperIdle holds no model credential, because a harness authenticates through its own login. See [credential-model.md](credential-model.md).

## Enforcement layer & default posture

**Where it runs:** the **application/server layer** (Hono middleware + the single access-boundary decision function). The DB executes whatever the server sends; there is **no Row-Level Security** (`isRLSEnabled: false`).

- **Authentication is default-on** — `createAuthMiddleware` is mounted globally (`layers/core-api/src/api-middleware-stack.ts:75`); no `/api/*` route is reachable without a verified credential.
- **Authorization is default-deny.** Least privilege: a route exposes or mutates per-principal/per-host data only by **explicitly declaring** its access boundary (`__boundary`); absence of a declaration **fails closed** via `failClosedAssertion()` (`layers/core-api/src/api-middleware-stack.ts`), never open. This is Saltzer–Schroeder *fail-safe defaults* / OWASP *deny-by-default* — a named standard, not a bespoke scheme, and the structural fix for the guard-added-to-one-endpoint-missed-on-its-neighbour recurrence.
- **Static guardrails (lint).** "Every route declares a boundary" and "authorization never reads a client header" are *static* properties, enforced by three custom ESLint rules in `tools/eslint-plugin-authz/src/rules/`: `require-boundary-declaration`, `no-header-identity-in-authz`, `no-raw-db-in-route-bypassing-policy`.

**RLS — deferred, not rejected.** Postgres RLS would add defense-in-depth (the DB refuses cross-tenant rows even if a route forgets its guard). Deferred because the dominant deployment is local-trust single-founder (nothing to isolate), and the boundary logic is relational/JSON-array-shaped — awkward to mirror in SQL `USING` clauses, duplicating server logic. **Revisit when** a managed multi-tenant cloud deployment is on the table; that is the trigger to add RLS as a second layer beneath the server-layer chokepoint.

## WS subscribe authorization

Every WebSocket subscribe routes through `canSubscribe` (DB-backed authorizer `createDbSubscribeAuthorizer`, `layers/core-api/src/ws-subscribe-authorizer.ts:78`):

- **Global topics** (`conversations`, `work`) — any authenticated identity.
- **`session:<id>`** — the session must exist and its task host must resolve; valid sessions are host-scope (any authenticated principal), non-existent or unresolvable sessions deny fail-closed.
- **`thread:<id>`** — the subscriber must be in the thread's `participants` (participant-scope, per `canRead`).
- **Anything else** — denied.

This is the authoritative statement of WS subscribe authorization; the WS push contract in [as-implemented-domain-architecture.md](as-implemented-domain-architecture.md) cites it.

## Hard rules

1. **Read parity** — detail reads require the same authorization as the list. `GET /api/threads/:id`, the `session:<id>` WS topic, and artifact detail/preview enforce their list endpoint's boundary. No read path is looser than its list path.
2. **Principal-only authorization** — a client-supplied identity header never grants access to another principal's data, in any trust mode.
3. **Worker confinement** — a worker token cannot read credentials beyond its assigned session, nor act as a different worker.
4. **No plaintext secret** — no managed secret is ever persisted or logged in plaintext (incl. any on-disk file other than the OS-protected root secret). See [credential-model.md](credential-model.md).
5. **No over-restriction** — host-scoped resources remain readable per host visibility; a fix must not break legitimate whole-team reads.
6. **Default-deny** — a route touching per-principal/per-host data must declare its access boundary explicitly; an undeclared route fails closed. Enforced at runtime (the chokepoint) and statically (ESLint).

## Out of scope

Role-based access control and enterprise auth (out of product scope). Per-resource sharing UI. Session-execution wiring beyond the credential/worker-token boundary.
