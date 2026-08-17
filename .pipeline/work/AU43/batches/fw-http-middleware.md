# Delete batch — `fw-http-middleware`

7 convicted rows. Delete every one, or record it as a survivor with a reason.

| # | Symbol | Reach | Why it was convicted |
|---|---|---|---|
| 1 | `requireBoundary` | UI:all 43 declared data routes | Sets a context string nobody enforces in prod; runtime duplicate of a lint rule; ceremony on every route. Reason never rested on user count — stands under Ruling 1. |
| 2 | `failClosedAssertion` | BOOTSTRAP (mounted once per app) | Prod behavior is a log line; dev behavior duplicates the lint gate. Real authz is authorize in handlers and survives untouched. Stands under Ruling 1. |
| 3 | `createBodyLimit` | UI:/api/ (global) + filesystems/artifacts mounts | Preemptive I2 cap; streaming branch exists for a test; nothing real ever hit it. User-count independent — stands; hole repriced. |
| 4 | `createRateLimiter` | UI:/api/ + /auth/ + 5 per-route mounts | Reason replaced (Ruling 1). Preemptive — no flood ever occurred; and wrong-shaped for the shared premise: pre-auth, principal-blind, collapses the team into one bucket behind a proxy. The earned buy-back, if ever, is per-principal post-auth — not this. |
| 5 | `BoundaryKind` |  | Unchanged. Dies with requireBoundary. |
| 6 | `BoundaryDeclaration` |  | Unchanged. One-member interface wrapping a string union — indirection even while alive. |
| 7 | `RateLimiterOptions` |  | Unchanged. Dies with the limiter. |
