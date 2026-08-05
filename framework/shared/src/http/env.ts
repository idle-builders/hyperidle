/**
 * The authenticated Hono context type both HTTP applications run on.
 *
 * @lore AU26 A1: this used to live in `layers/core-api/src/middleware/auth.ts`,
 * next to `createAuthMiddleware`. That coupled *declaring a route* to *importing
 * core-api* — `agent-orchestration-sessions-routes.ts:9-12` states the consequence
 * outright: giving orchestration its own app "would force `agent-orchestration` to
 * import `@hyperidle/core-api` for the auth/boundary/rate-limit stack." The TYPE
 * moves here so a route on either app can be typed; the auth middleware that
 * populates it stays in core-api (it legitimately reads `@hyperidle/users`) and is
 * applied by the Application, never by a Layer.
 */

/**
 * Hono context type that carries the authenticated user identity.
 * Set by core-api's `createAuthMiddleware` after successful authentication.
 *
 * @lore S1: `authMethod` and `loginSessionId` support dual-strategy auth.
 * `authMethod` distinguishes API-key auth from LoginSession auth so routes can
 * enforce auth-method requirements (e.g. /invite admin-only, /logout session-only).
 * `loginSessionId` is set only when auth is via Bearer token; undefined otherwise.
 */
export type HyperIdleEnv = {
	// biome-ignore lint/style/useNamingConvention: `Variables` is the Hono Env property name; the framework requires this exact PascalCase key.
	Variables: {
		userId: string;
		authMethod: "api_key" | "login_session";
		loginSessionId: string | undefined;
		/**
		 * AF11: Set by `requireBoundary()` to record the declared boundary kind for
		 * this route. The global fail-closed assertion checks it after the handler
		 * runs.
		 */
		__boundary: "enforced" | "principal-self" | "public-data" | undefined;
	};
};
