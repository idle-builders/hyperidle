import { createHash, timingSafeEqual } from "node:crypto";
import { zValidator } from "@hono/zod-validator";
import type { Context, Env, MiddlewareHandler } from "hono";
import type { z } from "zod";
import { API_ERROR_CODES, type ApiErrorResponse } from "./api-types.js";

/**
 * The authenticated Hono context type both HTTP applications run on.
 * `userId` is the caller the auth middleware resolved from the API key.
 */
export type HyperIdleEnv = {
	Variables: {
		userId: string;
	};
};

/**
 * Constant-time comparator for API keys.
 *
 * `crypto.timingSafeEqual` requires equal-length inputs and throws otherwise,
 * which is itself a length-leak via the throw vs return path. To handle the
 * different-length case safely we hash both inputs with SHA-256 first; the
 * digest is always 32 bytes so `timingSafeEqual` becomes total without
 * branching on input length.
 *
 * @lore: API key comparison — hash both with SHA-256 first; eliminates length-leak from timingSafeEqual on unequal lengths; two SHA-256 per auth request is fine
 */
export function constantTimeStringEqual(actual: string, expected: string): boolean {
	const a = createHash("sha256").update(actual).digest();
	const b = createHash("sha256").update(expected).digest();
	return timingSafeEqual(a, b);
}

/**
 * Validation hook for Zod validators — returns 400 with ApiErrorResponse
 * format on failure.
 */
function validationHook(
	result: { success: boolean; error?: { issues: unknown[] } },
	c: Context,
): Response | undefined {
	if (!result.success) {
		const response: ApiErrorResponse = {
			error: "Validation failed",
			code: API_ERROR_CODES.VALIDATION_ERROR,
			details: { issues: result.error?.issues ?? [] },
		};
		return c.json(response, 400) as Response;
	}
}

/**
 * The Hono `Input` map a route handler reads back via `c.req.valid("json")`.
 * Carries the server-local zod `z.output<T>` so validated bodies are
 * typed at the route boundary instead of erased to `unknown`/string-ish.
 */
export type ValidatedJson<T extends z.ZodTypeAny> = {
	in: { json: z.input<T> };
	out: { json: z.output<T> };
};

/**
 * Request body validator using Zod.
 * Returns 400 with VALIDATION_ERROR code on failure.
 *
 */
export function validateBody<T extends z.ZodTypeAny>(
	schema: T,
): MiddlewareHandler<Env, string, ValidatedJson<T>> {
	return zValidator("json", schema as never, validationHook) as MiddlewareHandler<
		Env,
		string,
		ValidatedJson<T>
	>;
}
