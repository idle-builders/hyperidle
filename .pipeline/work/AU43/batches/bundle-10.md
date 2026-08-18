# Delete bundle 10 — fw-http-middleware, fw-host-process, fw-toon-codec, filesystem-mounting

17 convicted rows across 4 package(s).

| # | Package | Symbol | Reach | Why convicted |
|---|---|---|---|---|
| 1 | fw-http-middleware | `requireBoundary` | UI:all 43 declared data routes | Sets a context string nobody enforces in prod; runtime duplicate of a lint rule; ceremony on every route. Reason never rested on user count — stands under Ruling 1. |
| 2 | fw-http-middleware | `failClosedAssertion` | BOOTSTRAP (mounted once per app) | Prod behavior is a log line; dev behavior duplicates the lint gate. Real authz is authorize in handlers and survives untouched. Stands under Ruling 1. |
| 3 | fw-http-middleware | `createBodyLimit` | UI:/api/ (global) + filesystems/artifacts mounts | Preemptive I2 cap; streaming branch exists for a test; nothing real ever hit it. User-count independent — stands; hole repriced. |
| 4 | fw-http-middleware | `createRateLimiter` | UI:/api/ + /auth/ + 5 per-route mounts | Reason replaced (Ruling 1). Preemptive — no flood ever occurred; and wrong-shaped for the shared premise: pre-auth, principal-blind, collapses the team into one bucket behind a proxy. The earned buy-back, if ever, is per-principal post-auth — not this. |
| 5 | fw-http-middleware | `BoundaryKind` |  | Unchanged. Dies with requireBoundary. |
| 6 | fw-http-middleware | `BoundaryDeclaration` |  | Unchanged. One-member interface wrapping a string union — indirection even while alive. |
| 7 | fw-http-middleware | `RateLimiterOptions` |  | Unchanged. Dies with the limiter. |
| 8 | fw-host-process | `sanitizeHttpUrl` | TEST-ONLY | Only __tests__/ssrf.test.ts calls it. The sync gate nobody wired; resolveUrlForSSRF does its own parse. Test dies with it. |
| 9 | fw-host-process | `assertUrlNotSSRF` | TEST-ONLY | Wrapper over resolveUrlForSSRF that throws away the addresses. Its own @lore says it exists for "existing call sites (notifications/ntfy)" — those call sites use notifications' private copy, not this. Zero production callers. |
| 10 | fw-host-process | `CreateGitRunnerOptions` |  | Only git-runner.integration.test.ts passes { logger, timeouts }. Production always calls createGitRunner(path) bare. Test-only surface on a public factory. |
| 11 | fw-host-process | `SanitizeResult` |  | { ok: false; reason: string }. |
| 12 | fw-host-process | `SandboxAdapterKind` |  | The sandboxAdapter field it types is read by nobody, anywhere. Dies with the field. |
| 13 | fw-host-process | `LAPTOP_DEV_API_KEY (const)` |  | Only prod use is the adjacent function; the browser code that must agree (core-ui/api-fetch.ts:33) hardcodes the literal anyway. Inline "hyperidle-dev-local" into the inlined validateStartupEnv; the core-api test importing it dies/moves with #10. |
| 14 | fw-toon-codec | `decodeTyped` | function · TEST-ONLY | Zero production callers; a typed wrapper over a dead decoder, whose doc admits it validates nothing. |
| 15 | fw-toon-codec | `decode` | function · TEST-ONLY | Zero production callers anywhere in the repo. ~120 lines of parser + keypath reconstruction serving only its own test file. Write-only format — the LLM is the decoder. |
| 16 | fw-toon-codec | `ToonParseError` | class · TEST-ONLY | Only thrown by decode; dies with it. |
| 17 | filesystem-mounting | `AdapterDeps` |  | Zero external references — boot.ts builds the deps structurally without importing it. After feature-kill 1, two of its three members (capturesDir, db) are dead anyway; the survivor is "pass the git-runner factory", which needs no interface. |
