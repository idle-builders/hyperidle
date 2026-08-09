/**
 * `@hyperidle/shared/http` — the HTTP primitives BOTH applications need.
 *
 * @lore AU26 A1: a NODE-ONLY subpath, deliberately never re-exported as values
 * from the main `@hyperidle/shared` barrel — `timing-safe.ts` imports
 * `node:crypto` and would break the browser bundle. Same idiom as the shipped
 * `@hyperidle/shared/net` (node:dns/net): the barrel may re-export TYPES from
 * here (erased at build time), never values.
 *
 * What belongs here: primitives a route file on EITHER app must be able to use
 * without importing the other Layer — the auth context type, the AF11 boundary
 * declaration, the constant-time key compare, the explicit-start wire
 * projection, the in-process rate limiter.
 *
 * @lore AU26 E4: `createRateLimiter` landed here when `/api/connections` moved
 * onto `agent-orchestration`'s app. It reads no table and knows no domain — it
 * is a token bucket over a request identity — and a route cannot move Layer
 * without the middleware it declares, so the limiter follows the same reasoning
 * A1 applied to `requireBoundary`. Each caller still creates its own bucket; a
 * shared home is not a shared bucket.
 *
 * @lore AU26 F2: `createBodyLimit` landed here for the same reason, when
 * `/api/filesystems` moved onto `agent-orchestration`'s app. It counts bytes and
 * emits the canonical `PAYLOAD_TOO_LARGE` envelope — no table, no domain. Its
 * core-api callers (`api-middleware-stack.ts`, `routes/artifacts.ts`, the slim
 * core-hosted injection route) import it from here now; each still passes its
 * own `maxSize`.
 *
 * What does NOT belong here: anything that reads a table or knows a domain. The
 * auth middleware itself stays in core-api (it reads `@hyperidle/users`) and is
 * applied by the Application.
 */
export type { BoundaryDeclaration, BoundaryKind } from "./access-boundary.js";
export { failClosedAssertion, requireBoundary } from "./access-boundary.js";
export { createBodyLimit } from "./body-limit.js";
export type {
	ComposeApiApplicationOptions,
	ComposedApiMiddleware,
} from "./compose-api-application.js";
export { composeApiApplication } from "./compose-api-application.js";
export type { HyperIdleEnv } from "./env.js";
export type {
	ExplicitStartProjection,
	ExplicitStartRow,
	PendingStartBody,
	StartFailureBody,
} from "./explicit-start-projection.js";
export {
	pendingStart,
	projectExplicitStartOutcome,
	sendStartProjection,
} from "./explicit-start-projection.js";
export type { RateLimiterOptions } from "./rate-limit.js";
export { createRateLimiter } from "./rate-limit.js";
export { constantTimeStringEqual } from "./timing-safe.js";
export type { ValidatedJson } from "./validate.js";
export { validateBody, validationHook } from "./validate.js";
