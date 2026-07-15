/**
 * Public auth routes — mounted BEFORE the auth middleware.
 *
 * Contains only `POST /claim` which requires no authentication.
 * In local (desktop) mode this file is not mounted at all.
 *
 * @lore S1: Split from auth.ts so the claim endpoint can be mounted pre-auth
 * while /invite, /logout, /me, /ws-token remain post-auth. The same pattern
 * is used by createUserSetupRoute (P4).
 */

import type { HyperIdleDb } from "@hyperidle/db";
import type { ApiErrorResponse } from "@hyperidle/shared";
import { API_ERROR_CODES } from "@hyperidle/shared";
import { claimInvite } from "@hyperidle/users";
import { Hono } from "hono";
import { requireBoundary } from "../middleware/access-boundary-middleware.js";

export function createPublicAuthRoutes(db: HyperIdleDb): Hono {
	const router = new Hono();

	/**
	 * POST /api/auth/claim
	 *
	 * Public — no authentication required.
	 * Body: { code: string, name: string, email?: string }
	 * Response: { token: string, user: { id, name, email, kind, role } } (201)
	 * Errors: 410 INVITE_CLAIMED, 410 INVITE_EXPIRED, 404 NOT_FOUND, 400 on validation
	 */
	router.post("/claim", requireBoundary({ kind: "public-data" }), async (c) => {
		let body: { code?: unknown; name?: unknown; email?: unknown };
		try {
			body = (await c.req.json()) as { code?: unknown; name?: unknown; email?: unknown };
		} catch {
			const response: ApiErrorResponse = {
				error: "Invalid JSON body",
				code: API_ERROR_CODES.VALIDATION_ERROR,
			};
			return c.json(response, 400);
		}

		const { code, name, email } = body;

		if (typeof code !== "string" || code.trim().length === 0) {
			const response: ApiErrorResponse = {
				error: "code is required and must be a non-empty string",
				code: API_ERROR_CODES.VALIDATION_ERROR,
			};
			return c.json(response, 400);
		}

		if (typeof name !== "string" || name.trim().length === 0) {
			const response: ApiErrorResponse = {
				error: "name is required and must be a non-empty string",
				code: API_ERROR_CODES.VALIDATION_ERROR,
			};
			return c.json(response, 400);
		}

		const emailStr = typeof email === "string" && email.trim().length > 0 ? email : undefined;

		const result = await claimInvite(db, code.trim(), name.trim(), emailStr);

		if (!result.ok) {
			if (result.error === "NOT_FOUND") {
				const response: ApiErrorResponse = {
					error: "Invite code not found",
					code: API_ERROR_CODES.NOT_FOUND,
				};
				return c.json(response, 404);
			}

			if (result.error === "INVITE_CLAIMED") {
				const response: ApiErrorResponse = {
					error: "This invite code has already been claimed",
					code: API_ERROR_CODES.INVITE_CLAIMED,
				};
				return c.json(response, 410);
			}

			if (result.error === "INVITE_EXPIRED") {
				const response: ApiErrorResponse = {
					error: "This invite code has expired",
					code: API_ERROR_CODES.INVITE_EXPIRED,
				};
				return c.json(response, 410);
			}
		}

		if (!result.ok) {
			const response: ApiErrorResponse = {
				error: "Failed to claim invite",
				code: API_ERROR_CODES.INTERNAL_ERROR,
			};
			return c.json(response, 500);
		}

		return c.json(
			{
				token: result.token,
				user: {
					id: result.user.id,
					name: result.user.name,
					email: result.user.email,
					kind: result.user.kind,
					role: result.user.role,
				},
			},
			201,
		);
	});

	return router;
}
