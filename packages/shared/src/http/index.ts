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
 * declaration, the constant-time key compare, the explicit-start wire projection.
 * What does NOT belong here: anything that reads a table or knows a domain. The
 * auth middleware itself stays in core-api (it reads `@hyperidle/users`) and is
 * applied by the Application.
 */
export type { BoundaryDeclaration, BoundaryKind } from "./access-boundary.js";
export { failClosedAssertion, requireBoundary } from "./access-boundary.js";
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
export { constantTimeStringEqual } from "./timing-safe.js";
