import { zValidator } from "@hono/zod-validator";
import type { ApiErrorResponse } from "@hyperidle/shared";
import { API_ERROR_CODES } from "@hyperidle/shared";
import type { z } from "zod";

/**
 * Request body validator using Zod. Returns 400 with VALIDATION_ERROR
 * code on failure. The return type preserves the schema's inferred
 * generic so chained `c.req.valid("json")` is typed without `as` casts.
 */
export function validateBody<T extends z.ZodTypeAny>(
	schema: T,
): ReturnType<typeof zValidator<T, "json">> {
	return zValidator("json", schema, (result, c) => {
		if (!result.success) {
			const response: ApiErrorResponse = {
				error: "Validation failed",
				code: API_ERROR_CODES.VALIDATION_ERROR,
				details: { issues: result.error.issues },
			};
			return c.json(response, 400);
		}
	});
}
