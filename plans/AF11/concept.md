# AF11 — Authorization & credential hardening: concept (LOCKED)

> Materialized from the authoritative ground truth `docs/architecture/authorization-model.md`.
> The concept is **locked**. This artifact is a faithful restatement of the five nouns + six
> hard rules + default-deny posture, the fixed input for `/architecture`. It does **not** redefine
> or extend anything. It adds *implementation-relevant probes* — the silent assumptions in today's
> code that the build must confront. Nouns are not re-litigated.

## Required reading (downstream `/architecture`, `/pipeline` must read)

- `docs/architecture/authorization-model.md` — the locked model (ground truth; supersedes this artifact on any conflict).
- `.pipeline/work-packages/TRACK-AF.md` § "AF11" — acceptance criteria, mandated build sequence, scope.
- Code the build touches (cited so downstream does not re-discover):
  - `packages/server/src/middleware/auth.ts` — `createAuthMiddleware`, `HyperIdleEnv` (`c.get("userId")` source).
  - `packages/server/src/routes/threads.ts` — list `GET /` AD1 guard (line ~448); `GET /:id` (line ~518, **no guard** = IDOR); `readSenderId` (line ~81, **trusts `X-Identity`**).
  - `packages/server/src/routes/assistant.ts` — `readSenderId` (line ~42, trusts `X-Identity`); soul-prompt self-only guard (line ~263/317).
  - `packages/server/src/routes/worker-ws.ts` — `registerWorkerWsRoute` token check (line ~167); `register` self-asserts `msg.id` (line ~111).
  - `packages/server/src/routes/workers.ts` — `GET /api/workers` inline admin-key check.
  - `packages/server/src/services/credential-encryption.ts` — AES-256-GCM + HKDF (the canonical secret primitive; reuse, don't reinvent).
  - `packages/server/src/services/server-config.ts` — `ModelTierConfigSchema.apiKey` stored **plaintext** in the `server_config` JSON blob (the audited at-rest leak).
  - `packages/server/src/routes/model-gateway.ts` — strips `apiKey` from GET but persists plaintext (hiding ≠ protection).
  - `packages/server/src/services/credential-resolver.ts` — `DbCredentialResolver` decrypts server-side; workers never read the store directly.
  - `packages/server/src/app.ts` — global mount order: rate-limit → auth (`api.use("*", createAuthMiddleware)`) → ~36 data routes.
  - `packages/eslint-plugin-design/` — the precedent for a workspace-local ESLint plugin (where the three new rules live).

## The five nouns (restated, not redefined)

### 1. Principal

The **authenticated acting identity** bound to a request: `c.get("userId")`, set by `createAuthMiddleware` from a *verified* credential. Every authorization decision reads the Principal and nothing else.

- Exists only when a credential was verified. A client-supplied header value is **never** a Principal.
- Not the agent *identity* (persona/soul). Not the `X-Identity` header.
- Routes consume `c.get("userId")`; they never re-derive identity from headers.

### 2. Access boundary

`canRead/canWrite(principal, resource) → bool`, evaluated server-side per request. One rule: **a resource's visibility inherits from its host.** Two scopes:

| Scope | Host kinds | Visible iff |
|---|---|---|
| **participant-scope** | `user`, `agent` (DM / assistant / pinned configs) | `principal ∈ host.participants[]` |
| **host-scope** | `bet`, `task`, `knowledge_item`, `artifact`, `team`, `factory` | principal can see the host entity (today: any authenticated principal; later: host membership) |

Host kinds are **closed** (`bet|task|knowledge_item|artifact|agent|user|team|factory`); each maps to exactly one scope. The boundary is **derived, never a user-edited ACL** — one decision function, every read endpoint + WS subscribe routes through it. Distinct from knowledge `scope_kind` (content *placement*, not request *authorization*). **No over-restriction**: host-scoped resources must stay broadly readable.

### 3. Trust mode

A deployment switch (`sharedMode`) for how identity is *established* — not what a Principal may do.

- **local-trust** (desktop, single founder): the API key *is* the one founder. `X-Identity` may *attribute* multi-agent test traffic but grants **no** cross-identity authority.
- **multi-user-trust**: identity comes only from a verified per-principal credential (Bearer login-session); `X-Identity` is ignored for authorization entirely.

Endpoints stay mode-agnostic; only the middleware differs. Invariant: **authorization always reads the Principal, never the header.** Local mode stays frictionless because its single Principal trivially passes host-scope checks.

### 4. Worker

A **capability-bounded session-execution endpoint** — not a Principal, not an org member.

- Identity is **server-issued and token-bound**, not self-asserted in `register`; a `register` cannot claim/replace another worker's identity.
- Its token authorizes exactly one capability: *run the sessions assigned to this worker.* No authority to read threads, artifacts, knowledge, or the credential store.
- Credentials reach a worker **scoped to its assigned session's provider** (or the server proxies the model call) — never as a readable org-wide store.

### 5. Secrets

| Kind | What | Protection |
|---|---|---|
| **Root-of-trust secret** | The single bootstrap key (`HYPERIDLE_API_KEY`, OS-protected `secrets.json` / desktop safeStorage). | OS file permissions. *Not* encrypted-with-itself. |
| **Managed secret** | Every other secret (provider/credential values). | AES-256-GCM at rest, key via HKDF from the root. **Never plaintext, persisted or logged, anywhere.** |

Hiding a field from GET responses is **not** protection — `server_config.apiKey` is stripped from reads yet plaintext at rest; that is a defect.

## Default posture (restated)

- **Authentication** is already default-on (`createAuthMiddleware` mounted globally; no `/api/*` route reachable without a verified credential).
- **Authorization** is **default-deny** (Saltzer–Schroeder fail-safe defaults / OWASP deny-by-default). A data route exposes/mutates per-principal/per-host data only by **explicitly declaring** its access boundary. Absence of a declaration **fails closed**.
- **Static guardrails (lint).** "Every data route declares a boundary" and "authorization never reads a client header" are *static* properties → custom ESLint rules, not tests (per CLAUDE.md).
- **Enforcement layer:** application/server (Hono middleware + the single decision function). **No RLS** (`isRLSEnabled: false`); deferred to a future managed multi-tenant deployment.

## The six hard rules (verbatim intent)

1. **Read parity** — detail reads require the same authorization as the list. `GET /api/threads/:id`, the `session:<id>` WS topic, artifact detail/preview enforce their list endpoint's boundary.
2. **Principal-only authorization** — a client-supplied identity header never grants access to another principal's data, in any trust mode.
3. **Worker confinement** — a worker token cannot read credentials beyond its assigned session, nor act as a different worker.
4. **No plaintext secret** — no managed secret persisted/logged in plaintext (incl. the `server_config` blob).
5. **No over-restriction** — host-scoped resources stay readable per host visibility; the fix must not break legitimate whole-team reads.
6. **Default-deny** — a data route must declare its access boundary explicitly; an undeclared route fails closed. Enforced at runtime (chokepoint) + statically (lint).

## Vocabulary (canonical terms; aliases not to use)

| Term | Definition | Aliases not to use |
|---|---|---|
| **Principal** | Authenticated acting identity (`c.get("userId")`). | user, caller, sender, identity, `X-Identity` |
| **Access boundary** | The `canRead/canWrite(principal, resource)` decision. | ACL, permission, guard (informal), policy (when meaning the function, prefer "decision function" / "chokepoint") |
| **Trust mode** | `sharedMode` deployment switch for how identity is established. | auth mode, deployment flag |
| **Worker** | Capability-bounded session-execution endpoint. | adapter (the in-process impl), agent, node |
| **Managed secret** | Provider/credential value, AES-256-GCM at rest. | apiKey-in-config, credential blob |
| **Root-of-trust secret** | The single bootstrap key, OS-protected. | master key, encryption key |

Collision note: `scope` is overloaded — **access-boundary scope** (participant/host) ≠ knowledge `scope_kind` (factory/product/team/bet/task/user). Keep them lexically distinct in code and docs.

## Contracts the implementation must honor

- **Cardinality.** Every authorizable resource has exactly one host (`hostKind` + `hostId`). The host determines the scope.
- **Closure.** Host-kind vocabulary is closed; adding a kind requires updating the scope table in the model doc *first*.
- **Single chokepoint.** Exactly one decision function. Every data read/mutation and every WS subscribe routes through it; none re-implements the rule inline.
- **Fail-closed default.** Absence of a boundary declaration → deny. Flipping the global default to deny is the *last* step (only after all data routes declare), so no legitimate route 403s mid-migration.
- **Identity source.** Authorization identity is `c.get("userId")` only. No code path may derive an authz subject from a request header.
- **Secret at rest.** No managed secret persisted or logged in plaintext anywhere except the OS-protected root secret. `server_config.apiKey` must be AES-256-GCM encrypted using the existing `credential-encryption.ts` primitive.

## Implementation-relevant probes (silent assumptions the build must confront)

These are **not** concept changes. They are the load-bearing facts grounded in code that `/architecture` must resolve. Each cites the read evidence.

**P1 — What does `c.get("userId")` actually return in each mode?**
`auth.ts`: local-trust resolves `users WHERE kind='human' LIMIT 1` (fallback `"u-founder"`); multi-user-trust resolves it from the verified Bearer `LoginSession`. So the Principal is a real `users.id` in both modes. *Assumption to confirm:* the chokepoint can treat `c.get("userId")` as a stable, real Principal id everywhere — there is no path where it is undefined behind the global auth middleware. (`authMiddleware` stateless fallback, used only by db-less test apps, does **not** set `userId` — out of the data-route scope, but the chokepoint must not assume that path.)

**P2 — How is host-scope visibility computed *today*?**
It is **not** computed at all for detail reads. `GET /api/threads/:id` (threads.ts ~518) loads the row and returns it with no participant/host check — the IDOR. Host-scoped threads currently rely on "any authenticated Principal can see the host." The chokepoint must encode host-scope as *allow any authenticated Principal* (today's semantics) so the retrofit does not over-restrict bet/task/knowledge discussions (Hard Rule 5). The only *tightening* is on **participant-scope** resources (`user`/`agent` hosts), which must check `principal ∈ participants[]` — mirroring the list endpoint's AD1 guard (threads.ts ~448).

**P3 — Where is the `X-Identity` trust today, and what breaks if removed?**
`readSenderId` in both `threads.ts` (~81) and `assistant.ts` (~42) returns `c.req.header("X-Identity") ?? c.get("userId")`. The soul-prompt self-only guard (assistant.ts ~263/317) compares this header-derived id to the path `:userId` — so a spoofed header passes the guard (the live-exploited hole). *Resolution required:* **authorization** must use `c.get("userId")` only. But `X-Identity` is also used legitimately for *message attribution* in multi-agent test traffic (threads `readInitialSenderId` selects a non-founder sender for review/questionnaire). The build must split **attribution** (may consult `X-Identity` in local-trust for *which sender to record*) from **authorization** (Principal only). The soul-prompt guard is pure authorization → header dropped entirely there.

**P4 — How is the worker token validated, and where could it exfiltrate credentials?**
`worker-ws.ts` (~167): a single static `HYPERIDLE_WORKER_TOKEN` query param, constant-time compared. `register` (~111) sets `this.workerId = msg.id` — **self-asserted**, so any connected worker can claim any id. There is currently **no** worker-facing credential read endpoint (good); `DbCredentialResolver` runs server-side inside session provisioning. *Confinement design must:* (a) ensure the worker token never authenticates a `/api/credentials*` or data route (it authenticates only `/ws/worker`); (b) bind the worker's runtime identity to its issued token so `register` cannot claim a different worker's id; (c) keep credentials flowing only via server-side resolution scoped to the assigned session's provider — never a readable org-wide store handed to the worker.

**P5 — Exactly where is the plaintext secret, and what already encrypts?**
`server-config.ts`: `ModelTierConfigSchema.apiKey: z.string().optional()` is serialized into the `server_config.config` JSON blob in plaintext (`updateServerConfig` does `JSON.stringify(merged)`). `model-gateway.ts` only *strips* it from GET. Meanwhile `credential-encryption.ts` already provides AES-256-GCM + HKDF-from-root and `getServerSecret()`. *Resolution:* encrypt the `apiKey` field before it enters the blob (or relocate it to `server_credentials`), decrypt on read where the gateway actually needs it (session provisioning). Reuse the existing primitive; do not add a second crypto path. A migration must re-encrypt any existing plaintext blob.

**P6 — How many data routes need a boundary declaration, and what is "a data route"?**
`app.ts` mounts ~30 route groups under `/api/*` behind global auth. A "data route" is any handler exposing/mutating per-principal or per-host data (threads, bets, tasks, artifacts, knowledge, conversations, users, sessions, recipients, search, settings, credentials, model-gateway, org, teams, notifications, routines, status, git-export, hint-progress, agents, dispatch-queue). Pure infrastructure/public routes (health, the public setup `POST /users`, `auth/claim`, ws-token mint, MCP bridge, worker WS) are **not** data routes and are exempt by declaration, not by omission. *Architecture must enumerate the concrete ~36 handler-level routes* so the retrofit and the lint rule have a definite target, and decide the declaration mechanism (per-route middleware vs. a boundary registry) such that an *undeclared* data route fails closed.

**P7 — Can a single decision function express both scopes without an N+1?**
The list endpoint already pre-filters participant-scope in SQL then re-verifies in JS (threads.ts ~469). Host-scope today is "allow any authenticated." So `canRead(principal, {hostKind, hostId, participants})` is a pure in-memory predicate given a resource descriptor already loaded by the route — **no extra DB round-trip** for the common case. Architecture must define the resource descriptor shape the chokepoint consumes so routes pass it what they already have, not trigger a re-query.

## Rationale

The audit found the same class of bug recurring: a guard added to one endpoint, missed on its neighbour (list had AD1; detail didn't). The locked model's answer is structural, not spot-fixes: one decision function, default-deny, lint-enforced declarations — so a *new* data route cannot silently ship open. The four audited holes (thread-detail IDOR, soul-prompt header spoof, shared worker token, plaintext `server_config` key) are the acute symptoms; the deny-by-default retrofit + lint gate is the systemic cure. The build sequence is mandated precisely so the global flip to fail-closed happens **only after** every data route declares — otherwise the migration itself would 403 legitimate traffic and violate Hard Rule 5 (no over-restriction).

**Locked.** Downstream skills explore *inside* this concept; they do not reshape it.
