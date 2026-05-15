import { zValidator } from "@hono/zod-validator";
import type { ApiErrorResponse } from "@hyperidle/shared";
import { API_ERROR_CODES } from "@hyperidle/shared";
import type { Context } from "hono";
import type { z } from "zod";

/**
 * Validation hook for Zod validators — returns 400 with ApiErrorResponse
 * format on failure. Exported for use in tests and as the canonical
 * validation error shape.
 */
export function validationHook(
	result: { success: boolean; error?: { issues: unknown[] } },
	c: Context,
): Response | void {
	if (!result.success) {
		const response: ApiErrorResponse = {
			error: "Validation failed",
			code: API_ERROR_CODES.VALIDATION_ERROR,
			details: { issues: result.error?.issues ?? [] },
		};
		return c.json(response, 400) as unknown as Response;
	}
}

/**
 * Request body validator using Zod.
 * Returns 400 with VALIDATION_ERROR code on failure.
 */
export function validateBody<T extends z.ZodTypeAny>(schema: T): ReturnType<typeof zValidator> {
	return zValidator("json", schema, validationHook as Parameters<typeof zValidator>[2]);
}
