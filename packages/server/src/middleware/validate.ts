import { zValidator } from "@hono/zod-validator";
import type { ApiErrorResponse } from "@hyperidle/shared";
import { API_ERROR_CODES } from "@hyperidle/shared";
import type { Context } from "hono";
import type { z } from "zod";

/**
 * Shared validation hook for zValidator.
 *
 * When Zod validation fails, returns a 400 response with the canonical
 * ApiErrorResponse shape: { error, code, details: { issues } }.
 *
 * Used internally by validateBody — exposed as a named export so tests
 * and custom validators can reuse the same error format without duplicating
 * the shape logic.
 *
 * @lore api-typesafety: The hook is extracted from validateBody so it can
 * be tested independently and reused by other validators (e.g. validateQuery).
 * The hook is NOT re-exported from @hono/zod-validator — it is our project's
 * standardised error-format layer.
 */
export function validationHook(
	result: { success: false; error: { issues: unknown[] } } | { success: true; data: unknown },
	c: Context,
): Response | void {
	if (!result.success) {
		const failResult = result as { success: false; error: { issues: unknown[] } };
		const response: ApiErrorResponse = {
			error: "Validation failed",
			code: API_ERROR_CODES.VALIDATION_ERROR,
			details: { issues: failResult.error.issues },
		};
		return c.json(response, 400) as unknown as Response;
	}
}

/**
 * Request body validator using Zod.
 * Returns 400 with VALIDATION_ERROR code on failure.
 *
 * Uses the shared validationHook so all validation errors have the same format.
 */
export function validateBody<T extends z.ZodTypeAny>(schema: T): ReturnType<typeof zValidator> {
	return zValidator("json", schema, validationHook as Parameters<typeof zValidator>[2]);
}
