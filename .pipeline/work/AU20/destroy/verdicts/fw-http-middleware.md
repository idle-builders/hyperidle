# http-middleware — destroyer verdict (framework)

## Where does this package go?

**Verdict: SPLIT then dissolve — DELETE the package.**

- **Security ceremony → DELETE outright** (8 of 22 exports): the AF11 boundary-declaration middleware pair, the rate limiter, the body cap, the timing-safe comparator, and their 3 types. All of it is preemptive security from hardening work packages (I2, AF11), not from any real learning. ETHOS.md: "Security is never preemptive... never a wall built first." Nobody was ever burned; these walls were built first and justified later.
- **Wire contract → `framework/domain-model`**: the explicit-start projection family (2 fns + 4 types after merge), `validateBody`/`ValidatedJson`, `HyperIdleEnv`. Proof this is the natural home: `domain-model/src/http/` **still exists and contains only a `__tests__` dir with a test for this package's rate limiter** — the corpse of the pre-AU34 home. `ApiErrorResponse` and `API_ERROR_CODES` — the exact shapes `validationHook` and the projection render — already live in domain-model. Contract and its enforcement reunite in one package. domain-model already has `zod` as a dep and `hono` as a devDep.
- **Mount recipe → `layers/core-api`**: `composeApiApplication` + its 2 option types move next to `api-middleware-stack.ts`, the file that builds the very stack it mounts. Its only two consumers (`applications/desktop/src/create-server.ts`, `applications/remote-server/src/create-server.ts`) both already import core-api (`bootCoreApi`). The "layer-blind framework home" argument dies with the middleware it existed to stay blind about.

Why not STAYS SHARED: after the security kills, 12 exports remain and every one of them is a wire/context **contract**, not middleware. A package named http-middleware whose middleware is all dead is a boundary invented for tidiness. Two real homes already exist.

## Consumers (measured, not assumed)

`rg -a -l "@hyperidle/http-middleware"` → 67 files. Per-symbol:

| Consumer | What it imports | Could it own this? |
|---|---|---|
| `layers/core-api` (29 route files + stack + auth + app) | `requireBoundary`, `validateBody`, `createRateLimiter`, `createBodyLimit`, `constantTimeStringEqual`, `failClosedAssertion`, `HyperIdleEnv`, projection fns | Gets `composeApiApplication`; rest from domain-model |
| `layers/agent-orchestration` (6 route files + app + boot) | `requireBoundary`, `validateBody`, `createRateLimiter`, `createBodyLimit`, `HyperIdleEnv`, projection fns | May NOT import core-api — the shared survivors ride domain-model, which it already imports |
| `layers/agent-orchestration/run-orchestration` | `constantTimeStringEqual` only | Inlines `===` after the DELETE |
| `layers/agent-execution/harness-registry` (`mcp-route.ts`) | `requireBoundary` only | Dependency vanishes entirely |
| `applications/desktop`, `applications/remote-server` | `composeApiApplication` only | Import it from core-api, which they already boot |
| `tools/eval` | `HyperIdleEnv` (type-only) | Follows the type to domain-model |
| `framework/api-contract` | comment-only mention (hand-mirrored types, no import) | n/a |
| `framework/domain-model` | TEST-ONLY: `src/http/__tests__/rate-limit.test.ts` tests this package's limiter from another package | Misplaced leftover; dies with the limiter |
| `tools/eslint-plugin-authz` | references the NAME `requireBoundary` in 2 lint rules | Rules die with the ceremony (see holes) |

Three of nine consumers import exactly one symbol each. That is three symbols in the wrong place, not a shared package.

## If written today, from scratch

Nothing called "http-middleware" would exist. You would write:
- `domain-model/src/http/`: `validateBody` (typed 400s in the canonical error shape), `HyperIdleEnv` (the authenticated context both apps run on), `projectExplicitStartOutcome` + `sendStartProjection` (the one wire contract for `POST /api/sessions` / `GET /api/sessions/starts/:id`).
- `core-api/src/compose-api-application.ts`: the ~35-line mount recipe (probe-proven `notFound` trap + pre-auth/auth ordering — the one copy earned its keep by breaking twice as hand-copies).

No rate limiter. No body cap. No boundary stamps. No timing-safe hash dance. A solo founder's agents hammering their own API is the product working, not an attack.

## Kill summary

| Verdict | Count |
|---|---|
| DELETE | 8 |
| MERGE | 1 |
| SIMPLIFY | 4 |
| KEEP | 9 |

Surface: 22 exports → 12 (45% cut), **package count → 0** (survivors absorbed into domain-model + core-api).

## Feature-level kills

1. **AF11 boundary-declaration ceremony — kill it all.** `requireBoundary` is stamped on 43 production route files; `failClosedAssertion` then checks the stamp was set. In production it **only logs**; the code's own comments admit "lint is the real gate." So the runtime pair is a dev-mode duplicate of a static lint check — a gate-by-default classifier the ethos explicitly forbids. Kills: both functions, 2 types, the `__boundary` member of `HyperIdleEnv`, one middleware slot in every composition root, 43 call-site stamps, `http-access-boundary.test.ts`, and both `tools/eslint-plugin-authz` rules that key off the `requireBoundary` name (`require-boundary-declaration`, `no-raw-db-in-route-bypassing-policy`). Real authorization stays exactly where it already is: `authorizeRead`/`authorizeWrite` calls inside handlers.
2. **Rate limiting — kill the whole feature.** One global limiter, a dedicated `/auth/*` limiter (`authMintLimiter` + `app.ts:368`), and FIVE per-route limiters (harnesses redetect 1/5s, credentials 20/min + 3/min, connections 20/min + 3/min, settings-agent-behavior 20/min) — guards layered on guards, throttling the user's own agents. Built by I2 "hardening," earned by no incident. Kills: `createRateLimiter`, `RateLimiterOptions`, `skipPaths` health-probe ceremony, `HYPERIDLE_RATE_LIMIT_PER_MIN`, the `rateLimit`/`authMintLimiter` stack fields, 7 mount sites, and the misplaced `domain-model/src/http/__tests__/rate-limit.test.ts`.
3. **Body cap — kill it.** 127 lines, half of which is a hand-rolled chunked-stream early-abort drain that the file itself admits is "rarely hit" in production — code written to satisfy a test contract. Kills: `createBodyLimit`, the `bodyLimit` stack field, `HYPERIDLE_MAX_BODY_BYTES`, per-route mounts in filesystems (x3) and artifacts (x2), `body-limit.integration.test.ts`.
4. **Timing-safe compare — kill it.** Defends against an attacker statistically timing a string compare over the network to recover an API key — a hypothetical no one has hit, on a product whose main deployment is localhost. Four call sites go back to `===`. Kills `constantTimeStringEqual`, `http-timing-safe.test.ts`, and the package's `@hyperidle/diagnostics` dep dies with the assertion logger.

## Full method audit

| # | Method | Reach | Verdict | Reason |
|---|---|---|---|---|
| 1 | `requireBoundary` | UI:all 43 declared data routes | DELETE | Sets a context string nobody enforces in prod; runtime duplicate of a lint rule; pure ceremony on every route registration. |
| 2 | `failClosedAssertion` | BOOTSTRAP (mounted once per app) | DELETE | Prod behavior is a log line; dev behavior duplicates the lint gate; designed for a paranoia the ethos forbids. |
| 3 | `createBodyLimit` | UI:/api/* (global) + filesystems/artifacts mounts | DELETE | Preemptive cap from I2; the streaming branch exists for a test; nothing real ever hit it. |
| 4 | `composeApiApplication` | BOOTSTRAP (desktop + remote-server create-server) | SIMPLIFY | Survives — probe-proven `notFound`/ordering fragility broke as hand-copies. Move to core-api; middleware param shrinks 6→3 fields (cors, errorHandler, auth). |
| 5 | `pendingStart` | INTERNAL + TEST-ONLY external (`agent-layer-boot-recovery.integration.test.ts`) | MERGE | Only production caller is `projectExplicitStartOutcome` in the same file — fold in as a private helper, un-export. |
| 6 | `projectExplicitStartOutcome` | UI:POST /api/sessions + GET /api/sessions/starts/:id (both apps) | KEEP | One wire contract, two apps that may not import each other; a silent divergence here is invisible to tsc. Moves to domain-model. |
| 7 | `sendStartProjection` | UI:same two routes | KEEP | The render half of the same contract; both apps call it. Moves with #6. |
| 8 | `createRateLimiter` | UI:/api/* + 5 per-route mounts | DELETE | Preemptive throttling of the user's own agents; guards on guards; no learning earned it. |
| 9 | `constantTimeStringEqual` | BOOTSTRAP (auth middleware, users, workers, worker-ingress) | DELETE | Anti-timing-attack crypto for a hypothetical attacker; 4 call sites revert to `===`. |
| 10 | `validationHook` | INTERNAL only — zero external references (rg-confirmed) | SIMPLIFY | "Exported for use in tests" that don't exist. Un-export; private detail of `validateBody`. |
| 11 | `validateBody` | UI:17 files across both layers | KEEP | Typed request bodies + canonical 400 shape at every write route; real developer value, genuinely dual-layer. Moves to domain-model. |

## Types / DI ports

| Declaration | Verdict | Reason |
|---|---|---|
| `BoundaryKind` | DELETE | Dies with `requireBoundary`. Zero importers by name outside the package. |
| `BoundaryDeclaration` | DELETE | Same. A one-member interface wrapping a string union was already indirection. |
| `ComposedApiMiddleware` | SIMPLIFY | Survives as `composeApiApplication`'s param; shrinks 6→3 fields (`rateLimit`, `bodyLimit`, `failClosed` die). Zero importers by name — callers pass literals. |
| `ComposeApiApplicationOptions` | KEEP | Signature of the surviving compose fn; moves with it to core-api. |
| `HyperIdleEnv` | SIMPLIFY | 33 importers across both layers + tools/eval — the most-shared symbol here. Drop the `__boundary` member; move to domain-model. |
| `ExplicitStartRow` | KEEP | Structural row contract of the surviving projection; api-contract hand-mirrors against it. Moves with the family. |
| `PendingStartBody` | KEEP | Member of the `ExplicitStartProjection` union — required for the surviving exported signatures. No independent importers. |
| `StartFailureBody` | KEEP | Same family, same reason. |
| `ExplicitStartProjection` | KEEP | Return type of both surviving projection fns. |
| `RateLimiterOptions` | DELETE | Dies with the limiter. |
| `ValidatedJson` | KEEP | Carries `z.output<T>` typing through `validateBody`'s signature — the whole point of keeping it. |

## Holes this leaves

1. **No flood protection anywhere.** A runaway agent loop or an internet scanner against remote-server gets served at line rate; only the per-request auth check stands between a flood and the DB. Price: if it ever actually hurts, the ~60-line limiter comes back as a real learning — the honest order per ethos.
2. **Unbounded request bodies.** A multi-GB POST buffers into memory; possible OOM of the server process. If hit, the fix is a 10-line Content-Length check, not the 127-line streaming drain.
3. **API-key compare becomes prefix-timing-dependent.** The one DELETE a founder might veto: remote-server is internet-exposed. Practical remote timing recovery of a long random key on a modern async server is not a demonstrated attack, but it is 5 lines — if vetoed, inline it into core-api's auth middleware, don't keep a package for it.
4. **No mechanical check that a new data route wires authorization.** Both eslint-plugin-authz rules key off `requireBoundary` and die with it. Authz coverage then rests on handlers calling `authorizeRead`/`authorizeWrite` — which is where it really rested all along (the prod assertion only logged). If a static net is wanted later, a lint rule can detect `authorize*` calls directly, without a runtime stamp on 43 routes.
5. **domain-model's purity erodes.** It gains runtime `hono` + `@hono/zod-validator` usage (today hono is only a devDep there). `hono` is small and the web bundle tree-shakes server-only imports, but the "domain-model is shapes-only" instinct takes a dent. Fallback if the founder rejects the merge: keep a gutted 12-export http-middleware — still a 45% surface cut and all four security features dead.
6. **Mechanical churn:** 43 route files each drop one middleware argument; 7 limiter mounts, 5 body-cap mounts, 4 compare call sites, 3 package-local test files, 1 misplaced domain-model test, and 2 lint rules get deleted. All deletions — no new code beyond import respelling.
