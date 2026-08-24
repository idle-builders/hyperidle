/**
 * AF11 — Terminal enforcement helpers.
 *
 * authorizeRead / authorizeWrite: call from inside a route handler after loading
 * the resource. Returns a Response (403) if the Principal may not access it, or
 * null to proceed.
 *
 * @lore AF11: These helpers are the second half of the two-part enforcement:
authorizeRead/Write enforces the policy against the loaded resource inside
 *       the handler, where the resource descriptor is already in memory.
 * Keeping enforcement in the handler means zero extra DB round-trips — the route
 * already loaded the resource to build its response.
 */

import type { HyperIdleEnv } from "@hyperidle/domain-model/http";
import type { Context } from "hono";
import { type AuthorizableResource, canRead, canWrite } from "./access-boundary.js";

const FORBIDDEN_BODY = {
	error: "Forbidden",
	code: "FORBIDDEN" as const,
};

/**
 * Authorize a read operation.
 * Returns a 403 Response if the Principal may not read the resource, or null to proceed.
 * Reads principal from c.get("userId") — never from a request header.
 */
export function authorizeRead(
	c: Context<HyperIdleEnv>,
	resource: AuthorizableResource,
): Response | null {
	const principal = c.get("userId");
	if (canRead(principal, resource)) {
		return null;
	}
	return c.json(FORBIDDEN_BODY, 403);
}

/**
 * Authorize a write (mutation) operation.
 * Returns a 403 Response if the Principal may not write the resource, or null to proceed.
 * Reads principal from c.get("userId") — never from a request header.
 *
 * @public AF11: enforced write routes call this after loading the resource. Currently
 * only thread reads use authorizeRead; authorizeWrite is available for future
 * participant-scope write routes (e.g., artifact patching, message deletion).
 */
// knip:ignore-exports-used-in-file — intentional future API surface, not yet called by write routes.
export function authorizeWrite(
	c: Context<HyperIdleEnv>,
	resource: AuthorizableResource,
): Response | null {
	const principal = c.get("userId");
	if (canWrite(principal, resource)) {
		return null;
	}
	return c.json(FORBIDDEN_BODY, 403);
}
