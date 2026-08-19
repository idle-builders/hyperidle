# Destroyer input — `http-middleware` (framework)

Package: `framework/http-middleware`
Surface: 11 exported functions, 0 classes (0 member methods), 11 interface/type declarations, 0 const/enum exports.

## A. Exported functions — EVERY ONE NEEDS A VERDICT

| # | Method | Public | Location |
|---|---|---|---|
| 1 | `requireBoundary` | yes | `framework/http-middleware/src/http/access-boundary.ts:51` |
| 2 | `failClosedAssertion` | yes | `framework/http-middleware/src/http/access-boundary.ts:81` |
| 3 | `createBodyLimit` | yes | `framework/http-middleware/src/http/body-limit.ts:76` |
| 4 | `composeApiApplication` | yes | `framework/http-middleware/src/http/compose-api-application.ts:77` |
| 5 | `pendingStart` | yes | `framework/http-middleware/src/http/explicit-start-projection.ts:62` |
| 6 | `projectExplicitStartOutcome` | yes | `framework/http-middleware/src/http/explicit-start-projection.ts:82` |
| 7 | `sendStartProjection` | yes | `framework/http-middleware/src/http/explicit-start-projection.ts:101` |
| 8 | `createRateLimiter` | yes | `framework/http-middleware/src/http/rate-limit.ts:101` |
| 9 | `constantTimeStringEqual` | yes | `framework/http-middleware/src/http/timing-safe.ts:24` |
| 10 | `validationHook` | yes | `framework/http-middleware/src/http/validate.ts:37` |
| 11 | `validateBody` | yes | `framework/http-middleware/src/http/validate.ts:79` |

## C. Interface / type declarations — the DI-port surface

Verdict each DECLARATION (not every member individually) unless a member is independently interesting. A port member whose only implementation you are deleting dies with it — say so.

- `BoundaryKind` (type, public) `framework/http-middleware/src/http/access-boundary.ts:37`
- `BoundaryDeclaration` (interface, public) `framework/http-middleware/src/http/access-boundary.ts:39` — members: `kind`
- `ComposedApiMiddleware` (interface, public) `framework/http-middleware/src/http/compose-api-application.ts:47` — members: `cors`, `errorHandler`, `rateLimit`, `bodyLimit`, `auth`, `failClosed`
- `ComposeApiApplicationOptions` (interface, public) `framework/http-middleware/src/http/compose-api-application.ts:56` — members: `middleware`, `preAuthRegistrars`, `apps`
- `HyperIdleEnv` (type, public) `framework/http-middleware/src/http/env.ts:23` — members: `Variables`
- `ExplicitStartRow` (interface, public) `framework/http-middleware/src/http/explicit-start-projection.ts:29` — members: `id`, `taskId`, `requestedAgentId`, `requestedModelTier`, `idempotencyKey`, `status`, `sessionId`, `failureCode`
- `PendingStartBody` (interface, public) `framework/http-middleware/src/http/explicit-start-projection.ts:41` — members: `status`, `startId`, `taskId`, `requestedAgentId`, `requestedModelTier`, `idempotencyKey`, `pollUrl`
- `StartFailureBody` (interface, public) `framework/http-middleware/src/http/explicit-start-projection.ts:52` — members: `error`, `code`
- `ExplicitStartProjection` (type, public) `framework/http-middleware/src/http/explicit-start-projection.ts:57`
- `RateLimiterOptions` (interface, public) `framework/http-middleware/src/http/rate-limit.ts:36` — members: `limit`, `windowMs`, `skipPaths`
- `ValidatedJson` (type, public) `framework/http-middleware/src/http/validate.ts:58` — members: `in`, `out`
