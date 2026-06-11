# Authorization model

The single boundary deciding **who may read/write what**, and how secrets are protected. Locked by `/concept` for AF11 (`plans/AF11/concept.md`). Backend-authoritative; applies uniformly across threads, sessions, artifacts, the assistant, and workers.

## Principal

The **Principal** is the *authenticated* acting identity bound to a request — `c.get("userId")`, set by `createAuthMiddleware` from a verified credential. Every authorization decision is made against the Principal and nothing else.

- A Principal exists only when a credential was *verified*. A value from a client-supplied header is never a Principal.
- The Principal is **not** the agent **identity** (persona/soul of `agent-identity.md`) and **not** the `X-Identity` header.
- Routes consume `c.get("userId")`; they never re-derive identity from headers.

## Access boundary

`canRead/canWrite(principal, resource) → bool`, evaluated server-side per request. **One rule:** *a resource's visibility inherits from its host.* Two scopes:

| Scope | Host kinds | Visible iff |
|---|---|---|
| **participant-scope** | `user`, `agent` (DM / assistant / pinned configs) | `principal ∈ host.participants[]` |
| **host-scope** | `bet`, `task`, `knowledge_item`, `artifact`, `team`, `factory` | principal can see the host entity (today: any authenticated principal in the single product; later: host membership) |

Host kinds are closed (`bet|task|knowledge_item|artifact|agent|user|team|factory`). Each maps to exactly one scope; adding a kind requires updating this table first.

The boundary is **derived, never a user-edited ACL**. There is one decision function; every read endpoint and every WS subscribe routes through it. Host-scoped resources **must stay broadly readable** — over-restricting a bet/task/knowledge discussion is as much a defect as leaking a participant-scoped one.

**Not** the same as knowledge `scope_kind` (factory/product/team/bet/task/user) — that classifies content *placement*, not request *authorization*.

## Trust mode

A deployment switch (`sharedMode`) for how identity is *established* — not what a Principal may do.

- **local-trust** (desktop, single founder): the API key *is* the one founder; one human user. `X-Identity` may *attribute* multi-agent test traffic but grants **no** cross-identity authority.
- **multi-user-trust**: identity comes only from a verified per-principal credential (Bearer login-session); `X-Identity` is ignored for authorization entirely.

Endpoints stay mode-agnostic — only the middleware differs. The invariant that makes one codebase safe in both modes: **authorization always reads the Principal, never the header.** Local mode stays frictionless because its single principal trivially passes host-scope checks.

## Worker

A **Worker** is a capability-bounded session-execution endpoint — **not** a Principal, **not** an org member.

- Identity is **server-issued and token-bound**, not self-asserted in `register`; a `register` cannot claim or replace another worker's identity.
- Its token authorizes exactly one capability: *run the sessions assigned to this worker.* No authority to read threads, artifacts, knowledge, or the credential store.
- Credentials reach a worker **scoped to its assigned session's provider** (or the server proxies the model call) — never as a readable org-wide store.

## Secrets

| Kind | What | Protection |
|---|---|---|
| **Root-of-trust secret** | The single bootstrap key (`HYPERIDLE_API_KEY`, OS-protected `secrets.json` / desktop safeStorage). | OS file permissions. *Not* encrypted-with-itself. |
| **Managed secret** | Every other secret (provider/credential values). | AES-256-GCM at rest, key via HKDF from the root. **Never plaintext, persisted or logged, anywhere.** |

Hiding a field from GET responses is **not** protection — `server_config.apiKey` is stripped from reads yet plaintext at rest; that is a defect.

## Enforcement layer & default posture

**Where it runs:** the **application/server layer** (Hono middleware + the single access-boundary decision function). The DB executes whatever the server sends; there is **no Row-Level Security** (`isRLSEnabled: false`).

- **Authentication is already default-on** — `createAuthMiddleware` is mounted globally (`api.use("*", …)`); no `/api/*` route is reachable without a verified credential.
- **Authorization is default-deny (the principle this model adopts).** Least privilege: a route exposes or mutates per-principal/per-host data only by **explicitly declaring** its access boundary. Absence of a declaration **fails closed**, never open. This is Saltzer–Schroeder *fail-safe defaults* / OWASP *deny-by-default* — a named standard, not a bespoke scheme. It is the structural fix for the recurrence the audit found (a guard added to one endpoint, missed on its neighbour).
- **Static guardrails (lint).** Because "every route declares a boundary" and "authorization never reads a client header" are *static* properties, they are enforced with **custom ESLint rules** (per CLAUDE.md: static codebase property → lint rule, not a test), catching obviously-wrong patterns at build time: a route handler with no policy declaration, `X-Identity`/header values reaching an authorization decision, or a raw DB query in a route bypassing the policy function.

**RLS — deferred, not rejected.** Postgres RLS would add defense-in-depth (the DB refuses cross-tenant rows even if a route forgets its guard). Deferred because: the dominant deployment is local-trust single-founder (nothing to isolate), and the boundary logic is relational/JSON-array-shaped — awkward to mirror in SQL `USING` clauses, duplicating server logic. **Revisit when** a managed multi-tenant ("Claude") cloud deployment is on the table; that is the trigger to add RLS as a second layer beneath the server-layer chokepoint.

## Hard rules

1. **Read parity** — detail reads require the same authorization as the list. `GET /api/threads/:id`, the `session:<id>` WS topic, and artifact detail/preview enforce their list endpoint's boundary. No read path is looser than its list path.
2. **Principal-only authorization** — a client-supplied identity header never grants access to another principal's data, in any trust mode.
3. **Worker confinement** — a worker token cannot read credentials beyond its assigned session, nor act as a different worker.
4. **No plaintext secret** — no managed secret is ever persisted or logged in plaintext (incl. the `server_config` blob and any on-disk file other than the OS-protected root secret).
5. **No over-restriction** — host-scoped resources remain readable per host visibility; the fix must not break legitimate whole-team reads.
6. **Default-deny** — a route touching per-principal/per-host data must declare its access boundary explicitly; an undeclared route fails closed. Enforced at runtime (the chokepoint) and statically (custom ESLint rule).

> **AF11 resolved (Step 8):** the `session:<id>` WS topic now enforces read parity via `canSubscribe` in `ws-broadcaster.ts`. The prior `return sessionId.length > 0` bypass is replaced with a DB lookup of session → task host. Sessions that don't exist are now rejected. The accidental open default is closed.

## Out of scope

Role-based access control and enterprise auth (out of product scope). Per-resource sharing UI. Session-execution wiring beyond the credential/worker-token boundary (AF7).
