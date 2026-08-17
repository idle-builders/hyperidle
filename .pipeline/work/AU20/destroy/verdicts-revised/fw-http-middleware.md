# http-middleware — destroyer verdict (framework) — REVISED after founder rulings

## What changed after the rulings

The first wave killed all four security features. One of its arguments — "a solo founder's agents
hammering their own API is the product working, not an attack" and "a product whose main deployment
is localhost" — is voided by Ruling 1. Each of the four was re-reached separately against the
corrected premise: a shared backend for a team and an organisation of teams, reachable over a
network, identity from OIDC.

| Row | Old verdict | New verdict | Ruling | Why it moved (or did not) |
|---|---|---|---|---|
| `constantTimeStringEqual` | DELETE | **KEEP** | Ruling 1 | The ONLY row whose kill rested on the voided premise. First-wave reason was explicitly "main deployment is localhost" — no longer true. Four call sites compare long-lived static secrets (admin API key x3, worker WS token x1) against attacker-supplied input at a network boundary that now, by ruling, serves an org over a network — including LAN distances, where timing recovery of a prefix-compare is the demonstrated case, not the hypothetical one. Full argument in the audit table. |
| `createRateLimiter` | DELETE | DELETE (**reason replaced**) | Ruling 1 | Verdict survives, but not for the first wave's reason. "Throttling the user's own agents" is void. The surviving reasons: (a) still preemptive — no flood has ever occurred, no learning earned it (ethos); (b) the implementation is wrong-shaped for the corrected premise it would need to invoke: it runs pre-auth, keys on `X-API-Key` → proxy header (env-gated) → direct address, and never sees an OIDC/Bearer principal — behind a reverse proxy without `HYPERIDLE_TRUST_PROXY` the entire team collapses into ONE shared bucket, so one teammate's runaway agent 429s everyone. A shared-backend limiter, if a flood ever teaches us to build one, is per-authenticated-principal and mounted post-auth. This code is not that and cannot become it. |
| `requireBoundary` | DELETE | DELETE (unchanged) | — | Kill never rested on user count. Prod behavior of the pair is a log line (source: "Production: log only. Lint is the real gate."); dev behavior duplicates the `require-boundary-declaration` lint rule; gate-by-default classifier shape the ethos forbids. True at any user count. |
| `failClosedAssertion` | DELETE | DELETE (unchanged) | — | Same feature, same reason. Multi-user makes the REAL authz (`authorizeRead`/`authorizeWrite` in handlers, identity from OIDC per Ruling 1/A7) more load-bearing — and that lives in handlers, untouched by this deletion. A stamp that only logs protects nobody, whether one human or fifty. |
| `createBodyLimit` | DELETE | DELETE (unchanged) | — | Kill reason was user-count independent: preemptive I2 cap, streaming-drain branch written to satisfy a test, nothing real ever hit it. The hole is repriced (an OOM now downs the team's backend, not one person's) — see Holes — but the ethos order stands: the earned fix is a 10-line Content-Length check when it actually hurts. |
| `RateLimiterOptions` | DELETE | DELETE (unchanged) | — | Dies with the limiter. |
| Kill summary / top-line | 8 DELETE / 9 KEEP, 45% cut | 7 DELETE / 10 KEEP, 41% cut | Ruling 1 | One row moved DELETE → KEEP. Package still dissolves to 0. |

Rulings 2 and 3 do not touch this package: it declares no event types and contains no
knowledge-ritual machinery. No PLUGIN or FINISH rows. (A7's FINISH — OIDC on the shared backend —
will reshape the auth *middleware* in core-api and the auth-identity members of `HyperIdleEnv`;
noted on that row, work belongs to the A7 finisher, not this verdict.)

Verdict changes: **1 row** (`constantTimeStringEqual`). Reason replaced, verdict unchanged: **1 row**
(`createRateLimiter`). All other 20 rows stand as first-waved.

## Where does this package go?

**Verdict: SPLIT then dissolve — DELETE the package.** Unchanged.

- **Security ceremony → DELETE** (6 of 22 exports now, was 8): the AF11 boundary pair + its 2 types,
  the rate limiter + its options type, the body cap. All preemptive walls from I2/AF11 hardening,
  earned by no incident — and the one of them a shared backend could have justified (the limiter) is
  built in a shape the shared backend cannot use (pre-auth, principal-blind).
- **Wire/boundary contract → `framework/domain-model`**: the explicit-start projection family
  (2 fns + 4 types after merge), `validateBody`/`ValidatedJson`, `HyperIdleEnv`, and now
  `constantTimeStringEqual`. The timing-safe compare has genuinely dual-layer consumers —
  `core-api` (auth middleware, users, workers) and `agent-orchestration/run-orchestration`
  (worker-ingress), which may not import each other; its own `@lore AU26` records that a hand-rolled
  duplicate in worker-ingress was exactly the drift already learned from and deleted once. That is a
  real learning, which is the ethos currency — do not re-create the duplicate by inlining.
  domain-model already holds `ApiErrorResponse`/`API_ERROR_CODES`, the shapes these render.
- **Mount recipe → `layers/core-api`**: `composeApiApplication` + its 2 option types move next to
  `api-middleware-stack.ts`. Its only two consumers (desktop + remote-server `create-server.ts`)
  already import core-api.

Why not STAYS SHARED: after the kills, every survivor is a wire/context/boundary **contract**, not
middleware. A package named http-middleware whose middleware is all dead is a boundary invented for
tidiness. Two real homes already exist.

## Consumers (measured, not assumed)

Unchanged from first wave — `rg -a -l "@hyperidle/http-middleware"` → 67 files. One row updated:

| Consumer | What it imports | Could it own this? |
|---|---|---|
| `layers/core-api` (29 route files + stack + auth + app) | `requireBoundary`, `validateBody`, `createRateLimiter`, `createBodyLimit`, `constantTimeStringEqual`, `failClosedAssertion`, `HyperIdleEnv`, projection fns | Gets `composeApiApplication`; rest from domain-model |
| `layers/agent-orchestration` (6 route files + app + boot) | `requireBoundary`, `validateBody`, `createRateLimiter`, `createBodyLimit`, `HyperIdleEnv`, projection fns | Shared survivors ride domain-model, which it already imports |
| `layers/agent-orchestration/run-orchestration` | `constantTimeStringEqual` only | **REVISED:** follows the symbol to domain-model (was: "inlines `===`"). The AU26 lore on this exact file is why it does not get a private copy. |
| `layers/agent-execution/harness-registry` (`mcp-route.ts`) | `requireBoundary` only | Dependency vanishes entirely |
| `applications/desktop`, `applications/remote-server` | `composeApiApplication` only | Import it from core-api, which they already boot |
| `tools/eval` | `HyperIdleEnv` (type-only) | Follows the type to domain-model |
| `framework/api-contract` | comment-only mention (hand-mirrored types, no import) | n/a |
| `framework/domain-model` | TEST-ONLY: `src/http/__tests__/rate-limit.test.ts` tests this package's limiter | Misplaced leftover; dies with the limiter |
| `tools/eslint-plugin-authz` | references the NAME `requireBoundary` in 2 lint rules | Rules die or get re-keyed (see holes — repriced) |

## If written today, from scratch

Written against the corrected premise: a shared backend serving a team and an org of teams over a
network; humans identified by OIDC; agents and workers identified by long-lived keys/tokens; every
event on a stream plugins hang off.

Nothing called "http-middleware" would exist. You would write:

- `domain-model/src/http/`: `validateBody` (typed 400s in the canonical error shape),
  `HyperIdleEnv` (the authenticated context both apps run on — its identity members become
  OIDC-shaped under A7), `projectExplicitStartOutcome` + `sendStartProjection` (the one wire
  contract for `POST /api/sessions` / `GET /api/sessions/starts/:id`), and
  `constantTimeStringEqual` (the correct spelling of "compare a static secret to attacker input on a
  network boundary" — you would write it on day one of a networked deployment because it is a
  property of the compare, not a wall in front of it: zero gates, zero friction, zero classifier,
  28 lines).
- `core-api/src/compose-api-application.ts`: the ~35-line mount recipe (probe-proven `notFound`
  trap + pre-auth/auth ordering — the one copy earned its keep by breaking twice as hand-copies).

Still no rate limiter — when a real flood on the shared backend teaches us, the buy-back is a
per-principal limiter mounted post-auth, which today's pre-auth principal-blind one is not. Still no
body cap — the earned fix is a Content-Length check, not a 127-line streaming drain. Still no
boundary stamps — if a static authz net is wanted for a multi-team backend, it is a lint rule that
detects `authorize*` calls directly, with no runtime ceremony on 43 routes.

## Kill summary

| Verdict | Count |
|---|---|
| DELETE | 7 |
| PLUGIN | 0 |
| FINISH | 0 |
| MERGE | 1 |
| SIMPLIFY | 4 |
| KEEP | 10 |

Surface: 22 exports → 13 (41% cut), **package count → 0** (survivors absorbed into domain-model +
core-api). First wave was 22 → 12 (45%); the difference is one row, `constantTimeStringEqual`,
moved by Ruling 1.

## Feature-level kills

1. **AF11 boundary-declaration ceremony — kill it all. Unchanged, ruling-proof.** `requireBoundary`
   is stamped on 43 production route files; `failClosedAssertion` then checks the stamp. In
   production it **only logs** — the source says "Lint is the real gate." The runtime pair is a
   dev-mode duplicate of a static lint check — a gate-by-default classifier the ethos forbids, at
   any user count. Kills: both functions, 2 types, the `__boundary` member of `HyperIdleEnv`, one
   middleware slot per composition root, 43 call-site stamps, `http-access-boundary.test.ts`. The
   two `tools/eslint-plugin-authz` rules keyed off the name: see hole 4 — the static net is worth
   re-keying on a shared backend, but re-keyed on `authorize*` presence, never on a runtime stamp.
2. **Rate limiting — kill the whole feature. Verdict unchanged, reason replaced (Ruling 1).** One
   global limiter, an `/auth/*` mint limiter, and five per-route limiters. The first wave's "own
   agents" argument is void. What kills it now: no flood has ever occurred (preemptive per ethos),
   and the implementation cannot serve the shared premise — it runs pre-auth, keys on API-key
   header or client address, never on the OIDC principal, and behind a proxy without
   `HYPERIDLE_TRUST_PROXY` it funnels the whole team into one bucket, converting one runaway agent
   into a team-wide 429 outage. The mint limiter guards `/auth/*` — home-grown login/session
   machinery that Ruling 1 deletes in favor of OIDC; its mount dies with its ward. Kills:
   `createRateLimiter`, `RateLimiterOptions`, `skipPaths` ceremony, `HYPERIDLE_RATE_LIMIT_PER_MIN`,
   the `rateLimit`/`authMintLimiter` stack fields, 7 mount sites, and the misplaced
   `domain-model/src/http/__tests__/rate-limit.test.ts`.
3. **Body cap — kill it. Unchanged, reason user-count independent.** 127 lines, half a hand-rolled
   chunked-stream early-abort drain the file admits is "rarely hit" — written to satisfy a test.
   Kills: `createBodyLimit`, the `bodyLimit` stack field, `HYPERIDLE_MAX_BODY_BYTES`, per-route
   mounts in filesystems (x3) and artifacts (x2), `body-limit.integration.test.ts`. Hole repriced
   below.
4. **Timing-safe compare — SPARED. This is the one Ruling 1 reverses.** The first-wave kill said
   "main deployment is localhost" — void. On the corrected premise the four compares guard the
   identity boundary of a network-reachable shared backend: shared-mode admin key
   (`auth.ts:200,219,246`), post-setup user-creation guard (`users.ts:125`), worker listing
   (`workers.ts:26`), worker WS token (`worker-ingress.ts:250`). With OIDC handling humans, these
   key/token compares are exactly the surviving identity mechanism for agents and workers — the
   thing Ruling 1 says a shared backend still needs. And it is not preemptive-security theatre: it
   erects no wall, gates nothing, adds zero friction and zero ceremony; it is the correct spelling
   of a compare that must exist anyway. Deleting it would not simplify the product by one visible
   feature — it would save 28 lines by deliberately weakening the one boundary everything else in
   this verdict leans on ("only the per-request auth check stands between a flood and the DB").
   KEEP; rides to domain-model with the other dual-layer survivors.

## Full method audit

| # | Method | Reach | Verdict | Reason |
|---|---|---|---|---|
| 1 | `requireBoundary` | UI:all 43 declared data routes | DELETE | Sets a context string nobody enforces in prod; runtime duplicate of a lint rule; ceremony on every route. Reason never rested on user count — stands under Ruling 1. |
| 2 | `failClosedAssertion` | BOOTSTRAP (mounted once per app) | DELETE | Prod behavior is a log line; dev behavior duplicates the lint gate. Real authz is `authorize*` in handlers and survives untouched. Stands under Ruling 1. |
| 3 | `createBodyLimit` | UI:/api/* (global) + filesystems/artifacts mounts | DELETE | Preemptive I2 cap; streaming branch exists for a test; nothing real ever hit it. User-count independent — stands; hole repriced. |
| 4 | `composeApiApplication` | BOOTSTRAP (desktop + remote-server create-server) | SIMPLIFY | Unchanged. Survives — probe-proven `notFound`/ordering fragility broke twice as hand-copies. Move to core-api; middleware param shrinks 6→3 fields (cors, errorHandler, auth). |
| 5 | `pendingStart` | INTERNAL + TEST-ONLY external | MERGE | Unchanged. Only production caller is `projectExplicitStartOutcome` in the same file — fold in, un-export. |
| 6 | `projectExplicitStartOutcome` | UI:POST /api/sessions + GET /api/sessions/starts/:id (both apps) | KEEP | Unchanged. One wire contract, two apps that may not import each other. Moves to domain-model. |
| 7 | `sendStartProjection` | UI:same two routes | KEEP | Unchanged. Render half of the same contract. Moves with #6. |
| 8 | `createRateLimiter` | UI:/api/* + /auth/* + 5 per-route mounts | DELETE | **Reason replaced (Ruling 1).** Preemptive — no flood ever occurred; and wrong-shaped for the shared premise: pre-auth, principal-blind, collapses the team into one bucket behind a proxy. The earned buy-back, if ever, is per-principal post-auth — not this. |
| 9 | `constantTimeStringEqual` | BOOTSTRAP (auth middleware) + UI:users/workers routes + worker WS upgrade | **KEEP** | **CHANGED DELETE → KEEP (Ruling 1).** Old reason "deployment is localhost" is void. Guards static-secret compares on a network-reachable org backend, on both sides of the core↔agent boundary; the surviving non-OIDC identity check per Ruling 1. No wall, no gate, no friction — 28 lines. AU26 lore already proved inlined copies drift. Moves to domain-model. |
| 10 | `validationHook` | INTERNAL only — zero external references (rg-confirmed) | SIMPLIFY | Unchanged. "Exported for use in tests" that don't exist. Un-export; private detail of `validateBody`. |
| 11 | `validateBody` | UI:17 files across both layers | KEEP | Unchanged. Typed bodies + canonical 400 shape at every write route; genuinely dual-layer. Moves to domain-model. |

## Types / DI ports

| Declaration | Verdict | Reason |
|---|---|---|
| `BoundaryKind` | DELETE | Unchanged. Dies with `requireBoundary`. |
| `BoundaryDeclaration` | DELETE | Unchanged. One-member interface wrapping a string union — indirection even while alive. |
| `ComposedApiMiddleware` | SIMPLIFY | Unchanged. Survives as `composeApiApplication`'s param; shrinks 6→3 fields (`rateLimit`, `bodyLimit`, `failClosed` die). |
| `ComposeApiApplicationOptions` | KEEP | Unchanged. Signature of the surviving compose fn; moves to core-api. |
| `HyperIdleEnv` | SIMPLIFY | Unchanged verdict. Drop the `__boundary` member; move to domain-model. Note: its auth-identity Variables (`loginSessionId` etc.) get reshaped by A7's FINISH (OIDC) — that is the finisher's work, not a reason to hold the move. |
| `ExplicitStartRow` | KEEP | Unchanged. Structural row contract of the surviving projection. |
| `PendingStartBody` | KEEP | Unchanged. Member of the surviving union. |
| `StartFailureBody` | KEEP | Unchanged. Same family. |
| `ExplicitStartProjection` | KEEP | Unchanged. Return type of both surviving projection fns. |
| `RateLimiterOptions` | DELETE | Unchanged. Dies with the limiter. |
| `ValidatedJson` | KEEP | Unchanged. Carries `z.output<T>` typing through `validateBody`. |

## Holes this leaves — repriced for a shared backend

1. **No flood protection anywhere — repriced UP.** A runaway agent or an internet scanner against
   the shared backend gets served at line rate, and now the outage cost lands on a whole team, not
   one founder. Still killed: the ethos order is learn-then-build, and the deleted limiter would not
   have protected the team anyway (one shared bucket behind a proxy — the flood and the victims
   share a budget). When a real flood happens, build the per-principal post-auth limiter that
   incident specifies.
2. **Unbounded request bodies — repriced UP.** A multi-GB POST buffers into memory; possible OOM now
   takes down every team's backend at once. If hit, the fix is a 10-line Content-Length check, not
   the 127-line streaming drain.
3. **API-key compare timing — CLOSED.** First wave priced this as "the one DELETE a founder might
   veto." Ruling 1 is that veto. Kept, relocated to domain-model; no hole remains.
4. **No mechanical check that a new data route wires authorization — repriced UP, and re-scoped.**
   Both eslint-plugin-authz rules key off the `requireBoundary` name and lose their anchor when the
   ceremony dies. On a multi-team backend a missed `authorize*` call now exposes another team's
   data, so a static net is worth having — but as a lint rule that detects `authorize*` presence in
   route handlers directly. The runtime stamp on 43 routes buys nothing toward that and stays dead.
   Re-keying the rule is small, static, and gate-free; recommend scheduling it with A7's FINISH,
   where the authz surface gets touched anyway.
5. **domain-model's purity erodes — slightly more than first wave.** It gains runtime `hono` +
   `@hono/zod-validator` usage and now a `node:crypto` import (timing-safe). All server-only; the
   web bundle must tree-shake or the http exports go on a subpath. Fallback if the founder rejects
   the merge: keep a gutted 13-export http-middleware — still a 41% surface cut and three of four
   security features dead.
6. **Mechanical churn:** 43 route files drop one middleware argument; 7 limiter mounts, 5 body-cap
   mounts, 3 package-local test files, 1 misplaced domain-model test deleted; 2 lint rules deleted
   or re-keyed; 4 `constantTimeStringEqual` call sites keep their import, respelled to domain-model.
   All deletions plus import respelling — no new code.
