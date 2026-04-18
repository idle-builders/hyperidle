# I2 Architecture Review — Security Hardening

Branch: `feat/I2-security-hardening`. Diff vs `main`: 49 files, +2184/-147.
Reviewer scope: layer boundaries, API contract shape, adapter contracts,
middleware ordering, coupling, module placement. Findings only — no code
changes.

Severity: **HIGH** = breaks an architectural invariant; **MED** = cross-cuts a
boundary or contract; **LOW** = naming/placement nit.

---

## APPROVALS (the design is sound)

- **A-1. Three-layer boundary holds.** Every change lives inside Meta Layer
  (`packages/server/src/middleware/`, `routes/`, `services/`) or Agent
  Runtime (`packages/server/src/harness/`). No new dependency from the Human
  Interface layer (`packages/web` is unmodified — see C-3 below for the
  consequence). No new DB schema. The upgrade-token store is in-process, as
  the plan promised (`services/upgrade-token-store.ts:42-78`).

- **A-2. `WorkspaceAdapter` and `HarnessAdapter` interfaces are preserved.**
  - `local-workspace-adapter.ts:13` and `docker-workspace-adapter.ts:50`
    still implement `WorkspaceAdapter` (`spawn`/`exec`/`destroy`). The
    Docker rewrite from `execAsync` to `child_process.spawn` is internal
    (`runDocker` helper at `docker-workspace-adapter.ts:32-48`); the
    public `Promise<ExecResult>` shape is unchanged.
  - `claude-agent-sdk-adapter.ts:47` still implements `HarnessAdapter`
    (`startSession`/`streamEvents`/`stopSession`/`getCapabilities`). The env
    allow-list and `permissionMode` gate are wholly internal to
    `startSession`. ARCHITECTURE.md §2.7 contract intact.

- **A-3. Defence-in-depth on tool authorization is correctly layered.**
  Registry filters by role at construction
  (`tool-registry.ts:140-170`), AND `session-provisioning.ts:303` still
  derives `allowedToolNames` for the harness. Two independent gates, exactly
  the architectural intent at AGENT_LAYER §5.1 (tool surface is per-role).

- **A-4. Constants centralized in `@hyperidle/shared`.**
  `TASK_STATES` and `MUTABLE_BET_FIELDS` (`packages/shared/src/types.ts:10-32`)
  are derived-once, exported via `index.ts:22`. `TaskState` union derives
  from the constant — no drift between the runtime enum and the type.
  ARCHITECTURE.md §2.1 spec parity (8 task states) preserved.

- **A-5. Upgrade-token store is correctly in-process.** No DB migration, no
  Redis, no shared state. Restart invalidates — acceptable for 60s TTL
  short-lived tokens. Matches plan §2 constraint and ARCHITECTURE.md §2.6
  ("in-process Python event emitter… no external message broker") spirit.

- **A-6. `POST /api/auth/ws-token` shape is consistent with sibling routes.**
  `routes/auth.ts:21-26` returns `{ token, expiresAt }` JSON via `c.json`,
  same shape pattern as `routes/status.ts:113-156`. Mounted under `/api/auth`
  via `app.ts:225` after auth middleware — endpoint is implicitly protected,
  consistent with every other domain route under `/api`.

---

## HIGH

- **H-1. `app.ts:184-225` middleware ordering admits the `/auth/ws-token`
  endpoint to be rate-limited at the same bucket as failed-auth probes.**
  Order today: rate-limit (`*`) → body-limit (`*`) → WS register → auth
  middleware (`*`) → `api.route("/auth", …)`. The rate-limiter at
  `middleware/rate-limit.ts:46-63` uses `X-API-Key` as identity if present,
  else IP. An attacker who knows the API key but wants to deny the WS to a
  legitimate user can burn the legitimate key's rate budget on
  `/auth/ws-token` — and once exhausted, the legitimate user cannot mint a
  WS token either. The limiter should also expose a bypass / higher budget
  for the auth-token mint endpoint, OR (architecturally cleaner) auth
  middleware should run BEFORE rate limit ONLY for the token mint, so
  unauthenticated probes get throttled but legitimate authenticated
  short-burst mints don't share a bucket with everything else.
  - **Recommended fix:** mount `/auth` under its own sub-router that swaps
    the order to `auth → rate-limit (per-key, scoped)`. Document the bucket
    scope in `app.ts`.

- **H-2. WebSocket auth middleware at `routes/ws.ts:71-89` runs as a Hono
  middleware on the path `/ws`, but it is registered INSIDE
  `registerWsRoute` which is called BEFORE `authMiddleware` is mounted
  (`app.ts:216-221`). That is correct — `/ws` is exempt from the global
  X-API-Key auth and uses one-shot tokens instead — but the registration
  order means the WS path is not behind the rate limiter either when
  `tokenStore` is missing. At `routes/ws.ts:73`, the guard is
  `if (!(token && tokenStore))` which short-circuits to 401 when either is
  absent. Production wires `tokenStore` correctly
  (`server-factory.ts:64-66`). However, a test or future caller that omits
  `tokenStore` causes every WS request to 401 silently — there is no
  startup-time invariant ("if WS is registered, token store MUST be
  present"). Today this is a latent contract violation, not a live bug.
  - **Recommended fix:** make `tokenStore` a required argument on
    `registerWsRoute`, drop the `?` in the signature, and let TypeScript
    enforce the invariant at the call site.

- **H-3. `app.ts:210` constructs an upgrade-token store unconditionally
  even when `options.upgradeTokenStore` is omitted AND no
  `registerWebSocket` hook is present.** This means every in-process test
  that builds an app via `createApp({ db })` allocates a `Map` plus an env
  read for `HYPERIDLE_WS_TOKEN_TTL_MS`. Harmless today but architecturally
  asymmetric: the auth route is mounted (`app.ts:225`) regardless of
  whether anyone can use the issued token. A test that hits
  `POST /api/auth/ws-token` will get a token it can never spend. The route
  should only mount when `registerWebSocket` was provided OR when an
  explicit `upgradeTokenStore` was passed in.
  - **Recommended fix:** gate the `api.route("/auth", …)` registration on
    the same condition as the WS hook, or document that tokens are issued
    speculatively for tests.

---

## MED

- **M-1. `services/upgrade-token-store.ts` placement.** The file is purely
  an authentication concern (one-shot credentials for the WS upgrade
  handshake). Its only consumers are `routes/auth.ts` (issuer) and
  `routes/ws.ts` (consumer). Neighboring services in `services/` are
  domain-level (`bet-state-machine`, `handoff-protocol`, `cost-cap`,
  `routine-scheduler`, etc.) — none deal with auth credentials. The file
  belongs in `middleware/` next to `auth.ts` and `timing-safe.ts`, OR in a
  new `auth/` directory alongside the auth route and middleware. Keeping
  it in `services/` blurs the layering between "domain logic" and "request
  authentication plumbing".
  - **Recommended fix:** move to `packages/server/src/auth/upgrade-token-store.ts`
    and co-locate `routes/auth.ts` and `middleware/auth.ts` there. Defer
    the move if churn cost is too high; flag in lore.

- **M-2. `tool-registry.ts:140-147` signature change is breaking but the
  diff shows only one in-tree caller updated.** `session-provisioning.ts:289`
  is the only production caller. Tests at `tool-registry.test.ts`,
  `tool-registry-role.test.ts`, `tool-schemas.test.ts`,
  `promote-knowledge.test.ts`, `route-item.test.ts`,
  `score-attention.test.ts` were updated. Verified: no other in-tree
  caller exists outside the test sweep (`grep buildToolRegistry` returns
  only the registry itself, the provisioning service, and tests). API
  break is contained — APPROVED in scope, but flag the contract: the plan
  promised `BuildToolRegistryOptions` so future additions
  (e.g. `extraTools`) don't require positional changes. Implementation
  matches (`tool-registry.ts:140-142`). 

- **M-3. `app.ts:51` imports `UpgradeTokenStore` and uses it in
  `AppOptions.registerWebSocket: (apiRouter, tokenStore) => void` and
  `AppOptions.upgradeTokenStore?`.** This couples `AppOptions` (a generic
  app configuration surface) to a concrete authentication primitive. The
  `registerWebSocket` callback should not need to know about the token
  store at all — the WS auth middleware should resolve the store from
  injected context, not from the registration callback's signature.
  Result: every future option that needs server-side wiring will tend to
  accumulate as another callback arg, instead of as a context object.
  - **Recommended fix:** pass an `AppContext { db, eventBus, tokenStore }`
    object through `registerWebSocket(apiRouter, ctx)`. Reduces signature
    churn and matches Hono's idiomatic dependency-injection pattern.

- **M-4. `claude-agent-sdk-adapter.ts:31` declares
  `let unsafeModeWarningEmitted = false` at module scope.** Process-global
  flags inside an adapter make it impossible for a parallel-test harness
  (or any future multi-tenant server) to verify the warning fires
  per-instance. The warning becomes a single-shot for the lifetime of the
  Node/Bun process. Acceptable for the operator-facing log signal today
  (the operator only needs to see it once), but architecturally this is a
  hidden global. Worth a `@lore` note explicitly marking the global as
  intentional, or moving the flag into a per-instance field on
  `ClaudeAgentSdkAdapter`.

- **M-5. `body-limit.ts:90` reconstructs a `Request` with
  `{ duplex: "half" }` typed as `RequestInit`.** ⚠️ UNVERIFIED: `duplex`
  is not in TypeScript's standard `RequestInit` lib defs as of TS 5.x.
  The file uses `as RequestInit` — a soft cast. CLAUDE.md §Tech Stack
  requires "no unsafe `as` casts". Architecturally the buffer-and-reissue
  pattern is the right call (the lore at lines 7-21 explains why
  `hono/body-limit` shape doesn't fit), but the cast should be tightened
  to `as unknown as RequestInit` with a `@lore` line citing the upstream
  TS issue, or guarded behind a typed wrapper.

- **M-6. `routes/ws.ts:33-37` `registerWsRoute` signature now takes three
  optional args (`apiApp, eventBus?, tokenStore?`).** The function's
  contract is increasingly ambiguous — what does it mean to register WS
  with eventBus but no tokenStore? With tokenStore but no eventBus?
  Production always passes both (`server-factory.ts:65`). Tests in
  `websocket.test.ts` exercise the production path. The two `?` markers
  are technical debt — making both required (and providing a `null` /
  no-op store for the rare case of "WS without auth") is cleaner.

---

## LOW

- **L-1. `app.ts:187` parses `HYPERIDLE_RATE_LIMIT_PER_MIN` as
  `Number.parseInt` and falls back to 60 on `NaN`.** The pattern is
  duplicated at `app.ts:199` for `HYPERIDLE_MAX_BODY_BYTES`. Promote to a
  shared `parsePositiveInt(envName, default): number` in
  `services/env-config.ts` (or re-use `services/observability/config.ts`'s
  numeric coercion if equivalent). Six lines of duplicated parsing logic
  is below the lore threshold but above the helper threshold.

- **L-2. `routes/auth.ts` has no `GET /` bounded resource descriptor**
  unlike `routes/knowledge.ts:114-130`, `routes/sessions-routes.ts`, etc.
  The I1 architecture-S1 fix added these descriptors as a regression
  guard. New auth route should follow the convention so the
  `api-availability.integration.test.ts` (planned in I5/I6) covers it.
  - **Recommended fix:** add `GET /` returning
    `{ ok: true, resource: "auth", endpoints: ["POST /ws-token"] }`.

- **L-3. `middleware/auth.ts:19` calls `constantTimeStringEqual` even
  when `expectedKey.length === 0`.** Short-circuit guard sidesteps the
  comparator call but the comparator runs SHA-256 on an empty string
  anyway. Trivial cost (microseconds) but defies the timing-safe
  contract: when no key is configured, the request returns 401 in a
  detectably-different timing class. The plan's index.ts fail-fast (A6)
  prevents production from reaching this branch, so the divergence is
  test-only. Acceptable but worth a `@lore` line that the test path
  short-circuits intentionally and the production path proves
  `expectedKey.length > 0` before the middleware ever runs.

- **L-4. `services/like-escape.ts` is a 22-line single-function helper.**
  Belongs alongside Drizzle query helpers (which today don't exist as a
  module). Acceptable placement, but the file is too small to justify a
  separate module — could fold into `services/db-helpers.ts` (new) or
  inline at the one call site (`routes/knowledge.ts:149`). Keep as-is if
  more LIKE callers are anticipated; remove if not.

- **L-5. `tool-registry.ts:131-142` documents `roles?: readonly
  AgentRole[]` on `ToolDefinition` but ALL_TOOL_DEFINITIONS does not show
  the four facilitator tools' `roles` arrays inline.** The narrowing
  happens inside each tool's own file (e.g. `promote-knowledge.ts`).
  Architectural: `toolsForRole` at line 127 is the only place that reads
  the field, but a reader of the registry has to chase six imports to
  understand which tools are gated. A short comment on
  `ALL_TOOL_DEFINITIONS` (line 106-120) listing the four facilitator
  tools by name would prevent the indirection. The lore at lines 102-105
  partially does this — extending it to enumerate the four would be
  enough.

---

## CONFUSION

### CONFUSION: Is `app.ts:225` mount path correct?
The plan §3.4 specifies "rate limit BEFORE auth so unauthenticated floods
are throttled". `app.ts:188-194` mounts rate-limit on `*` (all `/api`
paths). That includes `/api/health` (lines 176-182) — which is supposed
to be unauthenticated AND unthrottled (liveness probes from systemd /
docker / load balancers fire at high rate). Today `/api/health` is
mounted on the api sub-router BEFORE the rate-limiter `use("*")` call
(lines 176 vs 188), so route-specific match order should mean the health
handler runs first and the middleware never fires. ⚠️ UNVERIFIED against
current Hono routing semantics: in Hono v4.x, `app.use("*", mw)` chains
middleware that runs on every match including routes registered earlier
than the `use` call. Need to verify.

Options:
- **A)** Hono runs `use("*")` middleware on every match regardless of
  registration order → `/api/health` IS rate-limited. Liveness probes
  trip the limiter under load. Bug.
- **B)** Hono respects registration order → `/api/health` is NOT rate-
  limited. Design is correct, lore comment should explain why this works.

Proceeding with the assumption it's (B) because the plan's R3 test
(`bench: 1000 sequential next() calls`) would fail otherwise. Flag for
implementation verification.

---

## FILES (absolute paths)

- `/workspace/.worktrees/I2/packages/server/src/app.ts`
- `/workspace/.worktrees/I2/packages/server/src/server-factory.ts`
- `/workspace/.worktrees/I2/packages/server/src/index.ts`
- `/workspace/.worktrees/I2/packages/server/src/middleware/auth.ts`
- `/workspace/.worktrees/I2/packages/server/src/middleware/timing-safe.ts`
- `/workspace/.worktrees/I2/packages/server/src/middleware/rate-limit.ts`
- `/workspace/.worktrees/I2/packages/server/src/middleware/body-limit.ts`
- `/workspace/.worktrees/I2/packages/server/src/routes/auth.ts`
- `/workspace/.worktrees/I2/packages/server/src/routes/ws.ts`
- `/workspace/.worktrees/I2/packages/server/src/routes/knowledge.ts`
- `/workspace/.worktrees/I2/packages/server/src/routes/tasks.ts`
- `/workspace/.worktrees/I2/packages/server/src/routes/bets.ts`
- `/workspace/.worktrees/I2/packages/server/src/routes/status.ts`
- `/workspace/.worktrees/I2/packages/server/src/services/upgrade-token-store.ts`
- `/workspace/.worktrees/I2/packages/server/src/services/like-escape.ts`
- `/workspace/.worktrees/I2/packages/server/src/services/session-provisioning.ts`
- `/workspace/.worktrees/I2/packages/server/src/services/handoff-protocol.ts`
- `/workspace/.worktrees/I2/packages/server/src/harness/claude-agent-sdk-adapter.ts`
- `/workspace/.worktrees/I2/packages/server/src/harness/local-workspace-adapter.ts`
- `/workspace/.worktrees/I2/packages/server/src/harness/docker-workspace-adapter.ts`
- `/workspace/.worktrees/I2/packages/server/src/skill-tools/tool-registry.ts`
- `/workspace/.worktrees/I2/packages/shared/src/types.ts`
- `/workspace/.worktrees/I2/packages/shared/src/api-types.ts`
- `/workspace/.worktrees/I2/packages/shared/src/index.ts`

## CALLER SWEEPS PERFORMED

- `buildToolRegistry`: only `services/session-provisioning.ts:289` outside
  the test sweep. Breaking signature is contained.
- WebSocket client (`new WebSocket`, `/api/ws`, `?token=`): zero matches in
  `packages/web` — see C-3 below. The frontend has no WS hook today, so the
  plan's §3.2 frontend-impact item is a no-op against current code (the WS
  protocol on the server side is updated but no browser code consumes it).

## CROSS-CUTTING (C)

- **C-1. Plan §3.2 promised an update to `packages/web/src/hooks/useWebSocket.ts`
  (or equivalent).** The file does not exist, and `git diff main -- packages/web`
  is empty. There is currently no WS client in the web package. This means
  the WS-token flow has no frontend implementation. Architecturally this
  is fine for I2 (server contract is locked down), but H4 / I4 / I6
  frontend stories that introduce a WS client MUST consume the
  `POST /api/auth/ws-token` flow rather than passing the master key.
  Document this as a forward-binding contract.

- **C-2. Three-layer boundary check.** The Meta Layer never reaches into
  the Agent Runtime. The new sandboxing changes all live within the
  Agent Runtime adapters (`harness/`). The Human Interface never sees
  any of these changes. PASS.

- **C-3. ARCHITECTURE.md §2.5 lists API endpoints but does not include
  `/api/auth/ws-token`.** Net-new endpoint. ARCHITECTURE.md §4.2 (Auth)
  notes "API keys per human identity, passed in headers" — does not yet
  reflect the WS upgrade-token model. Spec needs updating in I6 doc-update
  task to add the auth endpoint and the WS upgrade flow.

---

End of review. 18 findings (3 HIGH, 6 MED, 5 LOW, 1 CONFUSION, 3 cross-
cutting), 6 explicit APPROVALS. Ship is gated on H-1, H-2, H-3 review
and the C-3 doc update.
