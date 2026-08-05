/**
 * AU21 §12 — the actor-override header name for the `CoreApiPort` write
 * seam. A tiny, dependency-free constant module so both the composition
 * root (`core-api-port-composition.ts`, which sets it via
 * `withActorTransport`) and the auth middleware (`middleware/auth.ts`,
 * which consults it) share the exact same header name without either
 * importing the other's heavier module.
 *
 * @lore AU21 §12 (CONFUSION resolved): `createAuthMiddleware` has no path to
 * resolve `userId` to an arbitrary agent — local mode always resolves the
 * first human, and a client-supplied identity header is the exact
 * IDOR-shaped pattern rejected elsewhere (`routes/users.ts` WARNING-1: never
 * trust a client-supplied identity header directly). This header is
 * DIFFERENT in kind, not just in name: it is consulted ONLY *after* the
 * existing `X-API-Key` (or Bearer session) auth has already succeeded — it
 * extends the trust boundary the API-key holder already has (the seam's
 * own Application-layer composition root, never an external client), it
 * does NOT create a new client-facing trust surface. Every route body still
 * reads only `c.get("userId")`, unchanged — this header only changes WHICH
 * value `createAuthMiddleware` puts there before any route handler runs.
 */
export const CORE_API_ACTOR_OVERRIDE_HEADER = "x-hyperidle-actor-id";
