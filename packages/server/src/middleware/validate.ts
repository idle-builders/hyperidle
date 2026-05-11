import { zValidator } from "@hono/zod-validator";
import type { ApiErrorResponse } from "@hyperidle/shared";
import { API_ERROR_CODES } from "@hyperidle/shared";
import type { Context } from "hono";
import type { z } from "zod";

/**
 * Shared validation-failure hook for zValidator.
 * Returns 400 with ApiErrorResponse on validation failure.
 *
 * @lore api-contract: validateBody was replaced with direct zValidator calls
 * because the wrapper's return type `ReturnType<typeof zValidator>` erased
 * the Zod schema generic parameter, breaking Hono RPC type inference. The
 * symptom was `c.req.valid("json" as never) as z.infer<typeof schema>` casts
 * across 26 call sites. The validationHook preserves the error-response
 * formatting without breaking the type chain.
 */
export function validationHook(
	result: { success: true; data: unknown } | { success: false; error: z.ZodError },
	c: Context,
): Response | void {
	if (!result.success) {
		const response: ApiErrorResponse = {
			error: "Validation failed",
			code: API_ERROR_CODES.VALIDATION_ERROR,
			details: { issues: result.error.issues },
		};
		return c.json(response, 400);
	}
}

/**
 * Request body validator using Zod.
 * Returns 400 with VALIDATION_ERROR code on failure.
 *
 * @deprecated Use `zValidator("json", schema, validationHook)` directly.
 * This wrapper will be removed after all call sites are migrated (end of Phase 3).
 */
export function validateBody<T extends z.ZodTypeAny>(schema: T): ReturnType<typeof zValidator> {
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
