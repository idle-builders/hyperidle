/**
 * AF11 — Access boundary declaration middleware.
 *
 * requireBoundary(decl): stamps the route's declared boundary intent onto
 * the Hono context. Every data route must call this at registration time.
 *
 * failClosedAssertion(): global middleware (mounted once by the Application after
 * auth). After the handler runs, checks if __boundary was set. If not:
 *   - dev/test: throws an error (loud, immediate)
 *   - prod: logs a hard error (lint is the real gate per architecture §60)
 *
 * @lore AF11 R1: Runtime default-deny is belt-and-suspenders. The real gate is
 * the lint rule `require-boundary-declaration` (static, build-time). The
 * runtime assertion is a dev/test safety net — it fires loudly during
 * development if a new route is wired without a declaration.
 *
 * @lore AF11 R2: The boundary pending flag is only set for "enforced" routes
 * (where authorizeRead/Write is expected to clear it). For principal-self and
 * public-data routes, the declaration itself is the proof — no pending check.
 *
 * @lore AF11: Flip order complete. Step 10 ("flip warn → throw-in-dev/test")
 * executed after all 41+ data routes confirmed declared (lint 0 violations).
 *
 * @lore AU26 A1: moved here from `layers/core-api/src/middleware/`. A route on
 * EITHER application must be able to declare its boundary, and an
 * `agent-orchestration` route file may not import core-api. `shared` is the one
 * package both may import. Behaviour is byte-identical to the core-api original.
 */

import { createLogger } from "@hyperidle/diagnostics";
import type { MiddlewareHandler } from "hono";
import type { HyperIdleEnv } from "./env.js";

const assertionLogger = createLogger({ pkg: "server.authz.assertion" });

/** The three valid boundary kinds. */
export type BoundaryKind = "enforced" | "principal-self" | "public-data";

export interface BoundaryDeclaration {
	kind: BoundaryKind;
}

/**
 * Per-route boundary declaration middleware.
 * Stamps the declared boundary onto context so the global fail-closed assertion
 * can verify it was set.
 *
 * Usage at route registration:
 *   router.get("/:id", requireBoundary({ kind: "enforced" }), async (c) => { ... })
 */
export function requireBoundary(decl: BoundaryDeclaration): MiddlewareHandler<HyperIdleEnv> {
	return async (c, next) => {
		// Record the declared boundary on context so the global fail-closed
		// assertion (applied by the Application) can verify it was set after the
		// handler runs.
		// @lore AF11: The lint rule is the primary build-time gate; this runtime
		// stamp is the dev/test safety net per the architecture flip-order requirement.
		c.set("__boundary", decl.kind);
		await next();
	};
}

/**
 * Global fail-closed assertion middleware — mounted once by the Application after
 * auth.
 *
 * After the handler runs, checks if requireBoundary() set `__boundary` on the
 * context. If not, an undeclared route reached data without a boundary declaration.
 *
 * Behaviour:
 *   - dev/test (NODE_ENV !== "production"): throws an Error immediately — loud,
 *     fast, unmissable. This is the flip-order trigger (Hard Rule 6).
 *   - production: logs a hard CRITICAL error. The lint rule is the real gate;
 *     production cannot retroactively fail a response already in flight.
 *
 * @lore AF11: The assertion is a belt-and-suspenders dev safety net. The lint
 * rule `require-boundary-declaration` is the closed static gate. Both exist
 * because the lint catches new routes at build time; the runtime catches any
 * path the lint missed (e.g., runtime-registered routes or test helpers).
 */
export function failClosedAssertion(): MiddlewareHandler<HyperIdleEnv> {
	return async (c, next) => {
		await next();
		// Check after the handler runs. If __boundary is still unset, the handler
		// ran without a requireBoundary() declaration.
		const boundary = c.get("__boundary");
		if (boundary === undefined) {
			// If the response is 404, this is likely a "no route matched" case
			// from Hono's default handler (not a data route that bypassed policy).
			// Skip the assertion for unmatched paths to avoid false positives.
			// @lore AF11: Security concern is undeclared data routes, not missing routes.
			// Unmatched 404s are handled correctly by Hono's default notFound handler.
			if (c.res.status === 404) return;

			const path = new URL(c.req.url).pathname;
			const method = c.req.method;
			const msg = `[AF11] undeclared route boundary: ${method} ${path} — add requireBoundary(...) to this route (Hard Rule 6)`;
			if (process.env.NODE_ENV !== "production") {
				throw new Error(msg);
			}
			// Production: log only. Lint is the real gate.
			assertionLogger.error(msg, { path, method });
		}
	};
}
