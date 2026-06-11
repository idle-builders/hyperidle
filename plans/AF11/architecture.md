# AF11 — Authorization & credential hardening: architecture

> Fixed inputs (do NOT re-litigate): `plans/AF11/concept.md`, `docs/architecture/authorization-model.md`.
> Backend security; **no UI** (`/design` skipped). This plan is the contract `/write-tests` and
> `/write-code` build against.

## Required reading (engineer must read before implementing)

- `plans/AF11/concept.md` — the five nouns, six hard rules, default-deny posture, probes P1–P7.
- `docs/architecture/authorization-model.md` — ground truth (supersedes on conflict; note the "open contradiction" on `session:<id>`).
- `.pipeline/work-packages/TRACK-AF.md` § AF11 — ACs, mandated sequence.
- Code (cited per fix below): `middleware/auth.ts`, `routes/threads.ts`, `routes/assistant.ts`, `routes/worker-ws.ts`, `routes/workers.ts`, `routes/auth.ts`, `services/credential-encryption.ts`, `services/server-config.ts`, `routes/model-gateway.ts`, `services/model-gateway.ts`, `routes/sessions-routes.ts`, `services/ws-broadcaster.ts`, `routes/ws.ts`, `app.ts`, `packages/eslint-plugin-design/` (plugin precedent).

---

## Phase 0 — Interrogation (resolved against code; not re-litigated)

**Q1 — Does the chokepoint need a DB round-trip per check?** No. The resource descriptor (`{ hostKind, hostId, participants }`) is already loaded by the route before the check (threads load the row; the list endpoint already parses `participants`). `canRead` is a pure in-memory predicate over the descriptor + `c.get("userId")`. Host-scope = "any authenticated Principal" (today's semantics, Hard Rule 5). Decision: **predicate, not a query.** Routes that need to *find* the resource still do their existing single load.

**Q2 — Declaration mechanism: per-route middleware vs. boundary registry?** Design-it-twice below. Decision: **per-route declaration middleware** (`requireBoundary(...)`) that stamps the boundary onto context, plus a **single terminal enforcement** that the route's handler calls (`authorizeRead(c, resource)` / `authorizeWrite(c, resource)`). The middleware records *intent*; the in-handler call enforces it against the loaded resource. Undeclared data routes are caught by the **lint rule** statically and by a runtime assertion in dev. (Rationale below.)

**Q3 — Is `session:<id>` WS topic in scope?** Yes — Hard Rule 1 + the model's stated resolution. Today it is deliberately ungated (`ws-broadcaster.ts` ~226: `return sessionId.length > 0`). Resolution: session inherits its task's host-scope → host-scope is "any authenticated Principal".

**Observable behavior is unchanged for valid sessions:** for any session that exists, session→task→host-scope resolves to `task` → `host` → `true` — the same `true` the current code already returns for a non-empty id. The retrofit is NOT a tightening of the happy path. **The value is purely:** (a) the topic now routes through `canSubscribe` like thread topics instead of bypassing the chokepoint (Hard Rule 1 read-parity — no accidental bypass), and (b) it closes the **non-existent-session** case: today `session:<garbage>` returns `ok` (length > 0); after the change a session id that resolves to no row returns `forbidden`. `/write-code` must NOT add a participant filter here — host-scope is `true` by design; over-building a per-participant gate would violate Hard Rule 5.

**New explicit deny path** (a new failure mode not previously present): if the session row is missing, OR the session has no resolvable `taskId`, OR the task host cannot be resolved → **deny** (`canSubscribe` returns `false` → `forbidden`). Fail closed: an unresolvable session is treated as "no such resource," not "open." Added to the failure-mode table (§Security & abuse).

**Q4 — Does dropping `X-Identity` break message attribution?** Concept P3: split attribution from authorization. `X-Identity` may still pick *which sender id to record* in local-trust (threads `readInitialSenderId` review/questionnaire selection, `/ws-token` mint). It may **never** be the *authorization subject*. The soul-prompt guard is pure authorization → header dropped there entirely. The lint rule `no-header-identity-in-authz` enforces the distinction.

**Q5 — Worker confinement: what is the actual exfiltration path?** Concept P4: there is **no** worker-facing credential route today (good). The risks are (a) the shared `HYPERIDLE_WORKER_TOKEN` authenticating anything beyond `/ws/worker`, and (b) `register` self-asserting `msg.id`. Decision: keep the token scoped to the WS upgrade only (already true), and **bind the worker identity to the connection** so a `register` cannot claim a different worker's id while another holds it (reject duplicate active id). Credentials continue to flow only via server-side `resolveModelTier` scoped to the assigned session's provider.

---

## Plan reconciliation (spec ⇆ reality)

| Spec assumption | Reality | Plan handling |
|---|---|---|
| "list-threads has AD1 guard, detail lacks it" | Confirmed. `threads.ts` ~448 guards list; ~518 `GET /:id` has no participant check. | Add `authorizeRead` on detail using the loaded `participants`. |
| "assistant trusts `X-Identity` over auth user" | Confirmed. `assistant.ts` `readSenderId` ~42, guard ~263/317 compares header-derived id to path param. | Replace with `c.get("userId")` for the authz subject. |
| "credentials use AES-256-GCM in `server_credentials`" | Confirmed. `credential-encryption.ts` + `DbCredentialResolver`. | Reuse this primitive for `server_config.apiKey`; no new crypto. |
| "openai-compatible keys plaintext in `server_config` blob" | Confirmed. `server-config.ts` `ModelTierConfigSchema.apiKey` serialized via `JSON.stringify(merged)`. | Encrypt at write in `updateServerConfig`; decrypt at the single consumption point. |
| "worker uses single shared static token" | Confirmed. `worker-ws.ts` ~167 `HYPERIDLE_WORKER_TOKEN`; `register` ~111 self-asserts id. | Bind id to connection; reject duplicate-active-id register. |
| "~36 data routes" | Enumerated below: **41 handler-level data-route groups** mechanically re-derived from the `app.ts` mount table (spec's "~36" is approximate). | Full route-checklist below. |
| "`session:<id>` WS intentionally ungated" | Confirmed `ws-broadcaster.ts` ~104. | Route through `canSubscribe` with host-scope (Q3). |
| "no custom ESLint rules exist" | Confirmed. `eslint-plugin-design` is the only local plugin; no authz rules. | Add 3 rules to a new local plugin (below). |

---

## The chokepoint

### Location & shape

New file `packages/server/src/auth/access-boundary.ts` (the single decision function — `auth/` already exists for `upgrade-token-store.ts`).

```ts
// Closed host-kind vocabulary (mirrors the locked model's scope table).
export type AccessScope = "participant" | "host";

// One entry per host kind; adding a kind requires updating this map (closure contract).
export const HOST_SCOPE: Readonly<Record<HostKind, AccessScope>> = {
  user: "participant",
  agent: "participant",
  bet: "host",
  task: "host",
  knowledge_item: "host",
  artifact: "host",
  team: "host",
  factory: "host",
};

// The resource descriptor the chokepoint consumes — routes pass what they already loaded.
export interface AuthorizableResource {
  hostKind: HostKind;
  hostId: string;
  /** Required for participant-scope; ignored for host-scope. */
  participants?: ReadonlyArray<string>;
}

/** Pure predicate. principal is c.get("userId"). No DB round-trip. */
export function canRead(principal: string, resource: AuthorizableResource): boolean {
  const scope = HOST_SCOPE[resource.hostKind];
  if (scope === "host") return true; // host-scope: any authenticated principal (Hard Rule 5 — no over-restriction)
  // participant-scope:
  return (resource.participants ?? []).includes(principal);
}

// Writes use the same boundary today; kept separate so future write-only tightening has a seam.
export function canWrite(principal: string, resource: AuthorizableResource): boolean {
  return canRead(principal, resource);
}
```

`@lore` on the file: host-scope deliberately returns `true` (today's single-product semantics); tightening to host-membership is the documented future hook, NOT a bug. Never widen participant-scope to `true`.

### Terminal enforcement helper (used inside handlers)

```ts
// packages/server/src/auth/authorize.ts
// Returns a Response (403) to return from the handler, or null to proceed.
export function authorizeRead(c: Context<HyperIdleEnv>, resource: AuthorizableResource): Response | null;
export function authorizeWrite(c: Context<HyperIdleEnv>, resource: AuthorizableResource): Response | null;
// Both read principal = c.get("userId"); on deny return the canonical 403 ApiErrorResponse
// { error, code: FORBIDDEN }. They also clear the "boundary pending" flag (see declaration).
```

### Boundary declaration mechanism (default-deny)

A per-route middleware records the route's *declared boundary intent* on context; a global post-auth guard fails closed if a data route produced a body without ever clearing the pending flag.

```ts
// packages/server/src/middleware/access-boundary-middleware.ts
type BoundaryDeclaration =
  | { kind: "enforced" }          // route calls authorizeRead/Write on a loaded resource
  | { kind: "principal-self" }    // route authorizes against c.get("userId") inline (e.g. inbox, /me)
  | { kind: "public-data" };      // route exposes no per-principal/per-host data (e.g. catalog, status)

// requireBoundary(decl) → MiddlewareHandler that sets c.set("__boundary", decl).
export function requireBoundary(decl: BoundaryDeclaration): MiddlewareHandler<HyperIdleEnv>;
```

- Each data-route group is mounted with `requireBoundary(...)` at registration (in the route file or `app.ts`).
- `authorizeRead/Write` mark the boundary "satisfied" when called.
- **Global fail-closed assertion** (new middleware, mounted in `app.ts` AFTER auth, BEFORE the data routes): wraps `next()`, and after the handler runs, if the matched route touched data (heuristic: under the data-route mount prefixes) and `__boundary` is unset → in **dev/test** throw (loud), in **prod** the response is already produced so we log a hard error + the lint rule is the real gate. The *primary* default-deny enforcement for new routes is **static (lint)**; the runtime assertion is the dev safety net. (The model states lint is the enforcer for the static property; runtime is belt-and-suspenders.)

> **Flip order (mandated):** the global fail-closed assertion is turned from "warn" to "throw in dev/test" **only after** every data route in the checklist declares. Until then it logs. This prevents mid-migration 403s (Hard Rule 5).

### Design-it-twice: declaration mechanism

**Option A — central boundary registry** (a `Map<routePattern, BoundaryDeclaration>` consulted by one global middleware that loads the resource and enforces centrally). Trade-off: one place to read all policy. Reject: the middleware would have to *re-load* each resource (extra query / per-kind switch) to enforce, duplicating route logic and creating an N+1 — and route patterns drift from handlers silently.

**Option B — per-route declaration + in-handler enforcement** (chosen). Trade-off: enforcement call lives in each handler (more touch points). Reject-not: the handler already loaded the resource, so enforcement is a pure predicate with zero extra queries, and the lint rule guarantees every data route declares — so the "scattered" downside is mechanically closed. Synthesis: declaration is centralized at mount (`requireBoundary`), enforcement is local where the data is loaded.

---

## The four-hole fixes

### Hole 1 — Thread-detail IDOR (Hard Rule 1)

`routes/threads.ts` `GET /:id` (~518). After loading `row`, parse `participants` (already done in `rowToThread`), build `AuthorizableResource { hostKind: row.hostKind, hostId: row.hostId, participants }`, call `authorizeRead(c, resource)`; return the 403 if non-null. For host-scoped threads (bet/task/knowledge) this returns `true` → no over-restriction. For participant-scoped (`user`/`agent` host, i.e. assistant/DM threads) the detail enforcement is **`principal ∈ participants`** (principal = `c.get("userId")`); a principal genuinely absent from `participants` gets 403.

**Predicate-parity note (not identical to AD1):** the list AD1 guard (`threads.ts` ~448) checks `q.participant_id === c.get("userId")` — i.e. it rejects a *mismatched query param*, not a non-membership. The detail check here is `principal ∈ participants`, which is the **correct read-parity predicate and is strictly stronger** than AD1's query-param guard: AD1 lets a user list only threads they claim, whereas detail verifies the user is actually a participant of the loaded thread. State this in AC1 so the test asserts the right thing — a principal truly not in `participants` is forbidden, not merely a query-param mismatch.
Also apply to: `GET /api/conversations/:threadId` (`conversations.ts` ~91 — same thread-detail shape), the `thread:<id>` WS topic (already gated), and the `session:<id>` WS topic (Q3).

### Hole 2 — Assistant soul-prompt header spoof (Hard Rule 2)

`routes/assistant.ts`: delete the local `readSenderId` (~42) for the **authz** path. In `createAssistantSoulRoutes` GET (~258) and PATCH (~312), derive `authenticatedUserId = c.get("userId")` directly. The self-only guard (`authenticatedUserId !== targetUserId → 403`) then compares the *real Principal* to the path param. The assistant agent id is `ast-{userId}`; writing the soul prompt is authorizing against the owning user — `principal-self` boundary declaration. The thread-resolve route `GET /api/threads/assistant` (~179) currently also uses `readSenderId`; switch its identity to `c.get("userId")` (the assistant thread is hosted on the user → participant-scope, principal is always a participant).

### Hole 3 — Worker token confinement (Hard Rule 3)

`routes/worker-ws.ts`:
- Keep `HYPERIDLE_WORKER_TOKEN` gating `/ws/worker` only (confirmed it authenticates nothing else; `/api/workers` and `/api/credentials*` require `HYPERIDLE_API_KEY`, a *different* secret — verify and assert in a test that the worker token is rejected by `/api/credentials`).
- **Bind identity to connection:** in `WorkerConnectionManager.onMessage` register branch (~110), reject a `register` whose `msg.id` is already registered+active in the pool (`pool.has(id)` / active check) → send `{ type: "register_rejected", reason: "id_in_use" }` and do not register. This prevents one worker connection hijacking another's identity. A worker may only (re)register its own id after the prior connection closed (`onClose` unregisters).
- **Reconnect / stale-id window (accepted limitation, documented):** the rejection keys on *active* registration. If a worker drops without a clean `onClose` (network partition, process kill), its pool entry lingers until evicted, and its own legitimate reconnect would be rejected `id_in_use` — a self-DoS until cleanup. Resolution for THIS WP: **accept-and-replace-if-the-existing-connection is dead.** Before rejecting, probe liveness of the incumbent entry (the WS readyState / last-seen on the pooled connection); if the incumbent socket is closed/closing → evict it and accept the new `register` (this is a *reconnect*, not a hijack). Only reject when the incumbent connection is genuinely still open. This closes the hijack (two live sockets, same id → reject the second) without locking out a flaky worker (dead incumbent → replaced). No new heartbeat subsystem is introduced; reuse the existing `onClose`/readyState signals. If liveness can't be cheaply determined, fall back to documenting it as an accepted limitation with the existing reconnect behavior (worker retries after the stale entry's natural close).
- **No credential surface for workers:** the "no route returns a credential to the worker token" claim is *negative space* — a runtime test can only probe routes it enumerates, so it cannot prove exhaustive absence. Reframe the proof in two parts:
  - **(a) Positive rejection (runtime):** worker token is rejected by `/api/credentials*` and `/api/workers` — they require `HYPERIDLE_API_KEY`, a *different* secret from `HYPERIDLE_WORKER_TOKEN` (confirmed distinct). Integration test asserts 401/forbidden.
  - **(b) Structural (by construction, not by probing):** the worker WS handler is *constructed without* a reference to the credential store / `credentialResolver` — assert via the type/wiring (the `registerWorkerWsRoute` signature takes `adapterPool` only, never the resolver), so no credential value can flow to a worker connection regardless of route. This is closer to a static guarantee than a runtime sweep; prefer a type-level / construction assertion over enumerating every route (per CLAUDE.md: static property → type/lint, not runtime test).

### Hole 4 — `server_config` plaintext key (Hard Rule 4)

Reuse `services/credential-encryption.ts` (AES-256-GCM + HKDF-from-root). The seam is the `apiKey` field of each tier in the model-gateway config.
- **Write:** in `services/server-config.ts` `updateServerConfig`, before `JSON.stringify(merged)`, encrypt every present `tier.apiKey` via `encryptCredentialValue(value, getServerSecret())`. Store a tagged form so read can distinguish (e.g. keep ciphertext in the `apiKey` field; it is opaque base64).
- **Read for consumption:** in `readServerConfig`, return the config with `apiKey` still encrypted (so any accidental log/response stays ciphertext). Add a dedicated **decrypt-at-use** seam `resolveTierApiKey(modelGateway, tier)` applied immediately before `resolveModelTier` consumes a tier's `apiKey`.

  **`readServerConfig` consumer enumeration (grepped — `single decrypt point` claim proven):** there are **5** call sites; exactly **2** need plaintext `apiKey`:
  | Consumer | Reads `apiKey`? | Handling |
  |---|---|---|
  | `server-factory.ts:41` (`createModelTierResolver` → `resolveModelTier`) | **YES** — passes `cfg.modelGateway` into `resolveModelTier` | decrypt seam **here** |
  | `sessions-routes.ts:246` (session provisioning → `resolveModelTier`) | **YES** — passes `serverCfg.modelGateway` into `resolveModelTier` | decrypt seam **here** |
  | `model-gateway.ts:104` (GET) | No — `sanitizeConfig`/`stripApiKey` removes it | unchanged |
  | `settings.ts:123` | No — reads `cfg.notifications.*` only | unchanged |
  | `server-factory.ts:238` (`readAlertPreferences`) | No — reads `cfg.notifications.*` only | unchanged |

  **Both** `resolveModelTier` call sites read plaintext today — the critique assumed only `sessions-routes.ts`, but `server-factory.ts:41` is a second one. To keep "single decrypt point" literally true, push the decrypt **into `resolveModelTier`'s input boundary**: `resolveModelTier` receives an already-decrypted-tier `apiKey`, and both callers wrap `serverCfg.modelGateway` through `resolveTierApiKey` first (one helper, two call sites — not two divergent decrypt implementations). The decrypt result lives only in-memory, never persisted. No other caller reads `apiKey`, so no silent break.
- **GET stays sanitized:** `model-gateway.ts` `stripApiKey` already removes the field — unchanged (defense in depth; encryption is the real fix).
- **Migration:** a one-shot migration step re-encrypts any existing plaintext `apiKey` in the single `server_config` row on boot. Detection: call `decryptCredentialValue(value, secret)`; if it returns `null` AND `value` is non-empty → plaintext → encrypt. **Soundness of detection (load-bearing invariant):** AES-256-GCM verifies the auth tag in `decipher.final()`, which **throws** on any non-ciphertext input (wrong key, bad base64, truncated, plaintext-that-happens-to-base64-decode); `decryptCredentialValue` catches and returns `null` (confirmed: `credential-encryption.ts:85–88` `catch { return null }`, plus the `< IV+TAG` length guard at :72). It **never** returns garbage on non-ciphertext — so "decrypt → null ⟺ not our ciphertext" is exact. **Idempotency proof:** after the first pass every `apiKey` is ciphertext; a second run calls `decrypt` → succeeds (non-null) → the value is left untouched. Running the migration N times is identical to running it once (no double-encryption). `@lore`: hiding-from-GET was never protection; this closes the at-rest leak; the migration is idempotent by the GCM auth-tag invariant.

> Decision: encrypt in-place in the blob (not relocate to `server_credentials`). Relocation would split one logical config across two tables and complicate the gateway PATCH atomicity; in-place encryption reuses the same primitive with one decrypt seam. Trade-off accepted: the field is opaque ciphertext in the blob.

---

## Route checklist — all data routes get an explicit boundary declaration

**This table is the closure set.** It is BOTH the exhaustive retrofit target (every row must declare before the flip) AND the seed for the lint exempt allowlist. A forgotten mounted group falsifies AC6 and makes the flip premature, so the checklist is **mechanically re-derived from the `app.ts` mount table — not trusted from a prior count.**

**Derivation procedure (the engineer re-runs this against `app.ts` before the flip, step 10):**
```
grep -nE 'api\.route\(|app\.route\(' packages/server/src/app.ts
```
Every mounted `/api/*` group is EITHER a checklist row below OR a named exempt entry. The mount list at the time of writing (app.ts ~270–503 + non-`/api` WS mounts in `server-factory.ts` ~273/281): `/users`(setup), `/auth`(public+auth), `/health`, `/agents`, `/model-gateway`, `/teams`, `/bets`, `/tasks`, `/artifacts`, `/knowledge`, `/team-members`, `/settings`, `/conversations`, `/threads`, `/users`(authed), `/org`, `/routines`, `/recipients`, `/sessions`, `/status`, `/workers`, `/git-export`, `/credentials`, `/hint-progress`, `/dispatch-queue`, `/search`, `/notifications`, `/observability`; plus `/ws` (user WS) and `/ws/worker` (worker WS). **Every one maps to a row or the exempt list below — verified line-by-line.** The previously-missed group was `/team-members` (now row 11); it was absent because the list was not reconciled against the mount table. `/write-code` must re-run the grep and diff against this table; any new mount absent from both lists is a hard stop.

**D** = enforced (`authorizeRead/Write` on a loaded host resource), **S** = principal-self (authorize vs `c.get("userId")` inline), **P** = public-data / host-scope (no per-principal restriction; declared exempt-by-intent, not omitted).

| # | Route | File | Decl |
|---|---|---|---|
| 1 | GET /api/threads/:id | threads.ts | D (Hole 1) |
| 2 | GET /api/threads | threads.ts | S (AD1 guard exists) |
| 3 | POST /api/threads | threads.ts | S (sender = principal) |
| 4 | POST /api/threads/:id/messages | threads.ts | D (participant guard exists ~741) |
| 5 | GET /api/threads/assistant | assistant.ts | S (Hole 2) |
| 6 | GET /api/users/:userId/assistant | assistant.ts | S (Hole 2) |
| 7 | PATCH /api/users/:userId/assistant | assistant.ts | S (Hole 2) |
| 8 | GET /api/conversations | conversations.ts | S/P (list, scope by principal) |
| 9 | GET /api/conversations/:threadId | conversations.ts | D (thread detail) |
| 10 | POST /api/conversations/items | conversations.ts | S |
| 11 | GET /api/team-members | knowledge.ts (`createTeamMembersRoutes` ~935, mounted app.ts:386) | P (host-scope team-membership listing; no per-principal restriction) |
| 12 | GET /api/artifacts | artifacts.ts | P (host-scope list) |
| 13 | GET /api/artifacts/:id | artifacts.ts | D (artifact host-scope) |
| 14 | POST /api/artifacts | artifacts.ts | D (via producing task host) |
| 15 | PATCH /api/artifacts/:id | artifacts.ts | D |
| 16 | GET /api/bets, /canvas, /:id | bets.ts | P (host-scope) |
| 17 | POST/PATCH /api/bets/* (commit/ship/kill/outcome/retro…) | bets.ts | P (host-scope; any authenticated) |
| 18 | GET /api/tasks, /:id | tasks.ts | P (host-scope) |
| 19 | POST/PATCH /api/tasks/* (transition/handoff) | tasks.ts | P |
| 20 | GET /api/knowledge, /:id, /search, /triage-count | knowledge.ts | P (host-scope) |
| 21 | POST/PATCH /api/knowledge/* (scope/merge/split/archive/flag) | knowledge.ts | P |
| 22 | GET /api/users, /:id | users.ts | P (directory) / S where self |
| 23 | PATCH /api/users/:id, /:id/skills/:skillId | users.ts | S (self only) |
| 24 | GET /api/users/:id/inbox | users.ts | S (self only) |
| 25 | POST /api/users/:id/inbox | users.ts | S (self only) |
| 26 | GET /api/sessions, /:id/activity | sessions-routes.ts | P (host-scope via task) |
| 27 | POST /api/sessions, PATCH /:id | sessions-routes.ts | P |
| 28 | GET/PATCH /api/settings | settings.ts | P (server config) |
| 29 | GET/PATCH /api/model-gateway | model-gateway.ts | P (server config; Hole 4 protects secret) |
| 30 | GET/PUT/DELETE/validate /api/credentials* | credentials.ts | P (admin server config) |
| 31 | GET/PATCH/POST /api/notifications/* | notifications-routes.ts | S/P |
| 32 | GET/PATCH/POST /api/observability/* | observability-routes.ts | P (server config) |
| 33 | GET/PUT/DELETE /api/org, /edges | org.ts | P |
| 34 | GET /api/recipients | recipients.ts | P |
| 35 | GET/POST/DELETE/PATCH/retire/trigger /api/routines/* | routines-routes.ts | P |
| 36 | GET /api/search | search.ts | P (host-scope filtered) |
| 37 | GET/POST/PATCH /api/teams, /:teamId | teams-routes.ts | P |
| 38 | GET/POST/PATCH/DELETE /api/agents/* | agents.ts | P |
| 39 | GET/PATCH /api/status/* | status.ts | P |
| 40 | GET/PATCH /api/git-export/* | git-export-routes.ts | P |
| 41 | GET/POST /api/hint-progress (hints) | hints.ts | S (per-user progress) |

Exempt (mounted but NOT data routes; declared exempt explicitly, not omitted — this is a **positive enumeration**, every entry justified): `/api/health` + `/api/status/health` (liveness), `POST /api/users` setup (pre-auth onboarding), `/api/auth/claim`, `/api/auth/me` (returns own principal — trivially self), `/api/auth/ws-token`, `/api/auth/worker-token`, `/api/dispatch-queue` (queue observer, no per-principal data), `/api/workers` (admin `HYPERIDLE_API_KEY`-gated, conditional mount), MCP bridge, `/ws/worker` (worker WS — worker-token only), `/ws` (user WS — subscribe-gated by `canSubscribe`, Hole 1/Q3). **No mounted group falls outside {checklist row, exempt entry}.**

> Note: most domain routes (bets/tasks/knowledge/sessions/artifacts) are **host-scope = P**, meaning the declaration is "host-scope, any authenticated principal" — this is the *correct* non-over-restricting behavior (Hard Rule 5). Only participant-scope routes (assistant/DM threads, inbox, user-self) tighten. This is the crux: default-deny is about *declaration*, not about making everything restrictive.

---

## Three custom ESLint rules

New workspace plugin `packages/eslint-plugin-authz/` (mirrors `eslint-plugin-design` structure: `src/index.ts`, `src/rules/*.ts`, `src/rules/__tests__/*`, `docs/rules/*.md`, `package.json` with `"exports": { ".": "./src/index.ts" }`, `private: true`). Registered in root `eslint.config.ts` scoped to `packages/server/src/routes/**/*.ts` (+ middleware). Each rule ships RuleTester fixtures (valid + invalid) — that is the rule's test, per CLAUDE.md (static property → lint, not runtime test).

1. **`no-header-identity-in-authz`** — flags a value read from a request header (`c.req.header(...)`, e.g. `X-Identity`) flowing into an **authz sink**. **Detection keys on a closed authz-sink allowlist, NOT a generic `BinaryExpression` shape** (the prior heuristic over/under-fired). The rule fires when a `header(...)` result reaches the argument list of a call whose callee name is in:
   ```
   AUTHZ_SINKS = { "canRead", "canWrite", "authorizeRead", "authorizeWrite" }
   ```
   Detection: trace a `c.req.header(...)` result (directly, or through a single intermediate `const x = c.req.header(...)` binding) into a `CallExpression` whose callee identifier ∈ `AUTHZ_SINKS`. (No `BinaryExpression` heuristic — the soon-deleted `assistant.ts` `readSenderId === path-param` comparison is removed by Hole 2, so the rule must not depend on it existing.)
   **The rule's real job is regression-prevention for future code:** a new route that wires a header into one of the four sinks. The RuleTester **invalid** fixture models that future shape directly — `const id = c.req.header("X-Identity"); if (canRead(id, resource)) …` — not the legacy comparison. **Valid** fixtures: header used purely for attribution into a `senderId` insert; `c.req.header(...)` feeding `store.issue` (the `/ws-token` mint, R5); and the correct authz call `canRead(c.get("userId"), resource)`. Message: "authorization must read c.get('userId'), never a request header (Hard Rule 2)."

2. **`require-boundary-declaration`** — flags a data-route handler (a `router.get/post/patch/put/delete` call inside a `routes/*.ts` file under a data-route mount) that neither is wrapped by `requireBoundary(...)` nor calls `authorizeRead/authorizeWrite`, **unless** the route pattern is on the exempt allowlist. **Two closure properties make the lint itself deny-by-default:**
   - **Closed glob (new files in-scope by default):** the rule is registered in `eslint.config.ts` against the glob `packages/server/src/routes/**/*.ts` (+ `middleware/`). A brand-new route file dropped under that path is **automatically in scope** — there is no per-file opt-in. So a genuinely new route surface cannot escape the lint by being new.
   - **Positive exempt enumeration (allowlist, not denylist):** the exempt option is an explicit **positive list of route patterns** (seeded from the §Route-checklist exempt block — health/auth/setup/etc.), each individually justified. A route that matches NO checklist declaration AND NO exempt pattern is flagged. There is no wildcard/over-broad exempt pattern; exemption is opt-in per pattern. This is deny-by-default **in the lint**, mirroring the runtime default-deny.

   Message: "data route must declare an access boundary; undeclared routes fail closed (Hard Rule 6)."

3. **`no-raw-db-in-route-bypassing-policy`** — flags a participant-scope route handler that performs a `db.select/insert/update/delete` returning per-principal/per-host data without a corresponding `authorize*` call in the same handler. Narrow scope to avoid false positives on host-scope P routes: the rule targets handlers declared `requireBoundary({kind:"enforced"})` (or participant-scope) that touch the DB but never call the policy function. Message: "route reads/writes scoped data via raw DB query without routing through the access-boundary policy."

> Rules favor *obviously-wrong* patterns (per model §60) — high precision over recall. The runtime fail-closed assertion + integration tests cover what the lint can't see statically.

---

## Acceptance criteria → verification

| AC | Verification |
|---|---|
| AC1 Thread-detail enforces read-parity authz (IDOR) | Integration test on the **`principal ∈ participants`** predicate (stronger than AD1's query-param guard): participant-scope thread (user host) whose `participants` do NOT contain principal A → `GET /api/threads/:id` as A → 403; a principal genuinely in `participants` → 200; host-scope (bet) thread readable by any authenticated principal → 200. The 403 case must assert real non-membership, not a query-param mismatch. |
| AC2 Soul-prompt guard from Principal, not header | Integration: authenticated as user A, send `X-Identity: B`, `GET`+`PATCH /api/users/B/assistant` → 403; cannot read/write B's prompt. Authenticated as B → 200. (Reproduces the live PWNED_BY_SPOOF exploit, now closed.) |
| AC3 Worker token confinement | **(a) positive:** worker token rejected by `/api/credentials*` and `/api/workers` (distinct `HYPERIDLE_API_KEY`) — integration 401/forbidden. **(b) structural:** assert by construction/types that the worker WS handler (`registerWorkerWsRoute`) is wired without the credential resolver — no credential value can reach a worker connection (static guarantee, not a route-by-route probe). **(c)** duplicate-*live*-id `register` with another worker's id → rejected; a dead-incumbent reconnect → accepted. Harness receives only its session's provider creds via server-side `resolveModelTier`. |
| AC4 No plaintext secret at rest | Integration: PUT model-gateway openai-compatible apiKey, read raw `server_config.config` from db → assert the apiKey substring is NOT present (ciphertext); `resolveTierApiKey` round-trips to plaintext. Migration test: pre-seed plaintext blob → boot → re-encrypted. **Idempotency assertion: run the migration twice → the ciphertext is stable and decrypts to the original plaintext (no double-encryption).** |
| AC5 Ownership/scope, not "any valid key" | Integration: participant-scope + self routes (inbox, user PATCH, soul) reject cross-principal; host-scope routes stay readable. |
| AC6 Default-deny chokepoint, undeclared fails closed | Integration (dev): a test route mounted without a boundary declaration that touches data → runtime assertion fires; lint rule `require-boundary-declaration` flags it (RuleTester). |
| AC7 Three ESLint rules fail the build | RuleTester fixtures: each rule has invalid cases that error + valid cases that pass; `npm run lint` red on a seeded violation. |

---

## Ordered task list (mandated sequence)

**Stage 1 — Chokepoint (single fail-closed policy).**
1. `auth/access-boundary.ts` — `HOST_SCOPE`, `canRead`, `canWrite`, `AuthorizableResource`. Unit tests (pure predicate: participant in/out, every host kind → scope). [proves: chokepoint exists]
2. `auth/authorize.ts` — `authorizeRead/authorizeWrite` returning `Response | null`; reads `c.get("userId")`.
3. `middleware/access-boundary-middleware.ts` — `requireBoundary`, the pending-flag, the global fail-closed assertion (mode: **warn** initially).

**Stage 2 — Fix the four audited holes.**
4. Hole 1: `threads.ts` `GET /:id` + `conversations.ts` `GET /:threadId` → `authorizeRead`. (depends: 1,2)
5. Hole 2: `assistant.ts` — drop header from authz; `c.get("userId")` in soul GET/PATCH + assistant thread. (depends: 2)
6. Hole 3: `worker-ws.ts` — duplicate-active-id rejection in `register`; confirm token scope; regression test no credential reachable.
7. Hole 4: `services/credential-encryption.ts` reuse → encrypt `apiKey` in `server-config.ts` write; `resolveTierApiKey` decrypt-at-use at **both** `resolveModelTier` call sites (`server-factory.ts:41` + `sessions-routes.ts:246`); boot migration re-encrypts plaintext (idempotent — see R3). (depends: existing crypto)
8. Hole 1 (WS): `ws-broadcaster.ts` `createDbSubscribeAuthorizer` `session:` branch — replace `return sessionId.length > 0` with: load the session row (`db.select().from(sessions).where(eq(sessions.id, sessionId))`); if missing → `false`. Resolve its `taskId` → task host; apply host-scope (`task` → `host` → `true`). If `taskId`/task host unresolvable → `false` (explicit deny, Q3). Net: valid sessions still `true`; non-existent/unresolvable sessions now `forbidden`. Do NOT add a participant filter (host-scope is `true` by design). (depends: 1)

**Stage 3 — Retrofit all 40 data routes (declare boundaries).**
9. Mount `requireBoundary(...)` per the route checklist on every data route group; add `authorizeRead/Write` to the participant-scope (D) routes; mark S/P routes with their declaration. Verify against the checklist.
10. **Flip the global default to fail-closed** (assertion mode warn → throw-in-dev/test) — only after step 9 confirms every checklist route declares.

**Stage 4 — Static regression gate (custom ESLint rules).**
11. `packages/eslint-plugin-authz/` scaffold (mirror `eslint-plugin-design`).
12. Rule `no-header-identity-in-authz` + RuleTester fixtures.
13. Rule `require-boundary-declaration` + fixtures + exempt allowlist option.
14. Rule `no-raw-db-in-route-bypassing-policy` + fixtures.
15. Register in `eslint.config.ts` scoped to `packages/server/src/routes/**` + middleware; `npm run lint` green on clean tree, red on seeded violations. Add `docs/rules/*.md` for each.

**Stage 5 — Verify.** `npm run check` + `npm run lint` + `npm run test:all`.

---

## Security & abuse cases

- **Rate-limit on POST/PATCH:** existing global limiter (300/min) + credential limiters cover new mutation surface; no new POST/PATCH added. **Applicable, addressed (reuse).**
- **Input-trust boundary (agent-authored fields):** the authz subject is now strictly `c.get("userId")`; agent/client-supplied `X-Identity` is barred from authz by Hole 2 + the lint rule. **Addressed.**
- **Secret handling:** Hole 4 — AES-256-GCM at rest, decrypt only in-memory at use, never logged/returned. Migration re-encrypts legacy plaintext. **Addressed.**
- **Path traversal:** no new path input. **N/A.**
- **SSRF:** credential validators call fixed provider URLs (anthropic/openrouter/self); openai-compatible `baseUrl` is operator-set server config, not agent-supplied. No change here. **N/A (pre-existing, unchanged).**
- **Worker DoS / identity hijack:** duplicate-*live*-id rejection (Hole 3) prevents a second connection stealing an in-use worker id. The rejection probes incumbent liveness first (accept-and-replace if the incumbent socket is dead) so a flaky worker's reconnect is NOT self-DoS'd — only a genuinely concurrent second live socket is rejected. **Addressed.**
- **Session unresolvable on WS subscribe:** `session:<id>` topic for a non-existent / host-unresolvable session denies (`forbidden`), failing closed rather than the prior `ok`-for-any-non-empty-id (Q3). **Addressed.**
- **Authorization oracle:** 403 vs 404 — participant-scope detail returns 403 on non-membership (`principal ∉ participants`). AD1's list guard also returns 403 (on query-param mismatch), so the *status code* is consistent even though the *predicate* is stricter at the detail level. Acceptable, consistent. **Addressed.**

## Protected tests

`protectedTests`: existing thread list AD1 guard tests, WS `forbidden` subscribe tests (L1 step9), credential-encryption round-trip tests, model-gateway `stripApiKey` GET tests. Their assertions must not weaken — the retrofit extends, never relaxes.

## Shared files

`sharedFiles`: `packages/server/src/app.ts` (mount order + new middleware), `eslint.config.ts` (plugin registration), `packages/server/src/middleware/auth.ts` (if `HyperIdleEnv` gains the `__boundary` context key), `packages/server/src/services/server-config.ts` (schema/serialization). Schedule merge-order awareness for any concurrent AF-track workpackage touching routes or app.ts.

## Risks & ambiguities

- **R1 — Runtime default-deny is best-effort in prod.** Once a response is produced, the assertion can only log; it cannot retroactively fail closed. This is an *accepted* posture, not a bug — **provided the lint is the closed gate**. The closure argument: the lint rule `require-boundary-declaration` fires at build time on every undeclared data-route handler, and (per R2) its glob is closed and its exempt list is a positive enumeration — so a genuinely *new* route surface is caught statically before it ships, regardless of the runtime log. Runtime assertion = belt-and-suspenders dev safety net; lint = the real gate (model §60: lint enforces the static property). The R1+R2 pair therefore does NOT leave the global default open for new surfaces — that is the exact failure this WP kills.
- **R2 — `require-boundary-declaration` closure (no escape for new files).** The lint glob `packages/server/src/routes/**/*.ts` (+ `middleware/`) is **closed**: any new route file is in-scope by default, no per-file opt-in. The exempt allowlist is a **positive enumeration** of justified route patterns (deny-by-default in the lint), not a denylist and not an over-broad wildcard. Host-scope P routes are not "exempt" — they declare `requireBoundary({kind:"public-data"})` explicitly so the lint passes on a real declaration, not on omission. Net: a route matching neither a declaration nor an exempt pattern is flagged; "fail closed" holds statically.
- **R3 — Migration mis-detecting ciphertext vs plaintext.** Detection: `decryptCredentialValue` → null AND non-empty ⇒ plaintext ⇒ encrypt. **Soundness:** the GCM auth-tag verification (`decipher.final()`) throws on any non-ciphertext, caught → `null` (never garbage) — confirmed at `credential-encryption.ts:72,85–88`. So detection is exact, not heuristic. **Idempotency:** second run finds ciphertext, `decrypt` succeeds, value untouched ⇒ no double-encrypt; running N times ≡ running once. Edge: a genuinely corrupt blob → falls back to defaults (existing behavior) and logs.
- **R4 — `session:<id>` semantics.** Resolving session→task host adds a DB lookup on subscribe (one-time per subscription, like thread topics already do). **The observable authz outcome is unchanged for valid sessions** (host-scope → `true`, exactly today's result); the only behavioral delta is that a `session:` topic for a non-existent session now returns `forbidden` instead of `ok` (Q3). The round-trip earns its keep solely by closing the accidental-bypass + non-existent-session gap, not by changing valid-session behavior — so the cost (one DB read per subscribe) is justified by the read-parity guarantee, not by a new restriction. Acceptable; not on the hot path.
- **R5 — Local-trust `/ws-token` still reads `X-Identity`.** This is *attribution* in admin-only local mode (the model permits it), not cross-principal authz. The lint rule does not flag it because `store.issue` is **not** in the closed `AUTHZ_SINKS` allowlist (`canRead`/`canWrite`/`authorizeRead`/`authorizeWrite`) — the rule keys on sink-callee name, not on a `BinaryExpression` heuristic, so attribution paths are structurally out of scope. A valid RuleTester fixture pins this.
