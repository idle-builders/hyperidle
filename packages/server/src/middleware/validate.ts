import { zValidator } from "@hono/zod-validator";
import type { ApiErrorResponse } from "@hyperidle/shared";
import { API_ERROR_CODES } from "@hyperidle/shared";
import type { Context, Env, MiddlewareHandler } from "hono";
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
 * The Hono `Input` map a route handler reads back via `c.req.valid("json")`.
 * Carries the server-local zod 4.4.3 `z.output<T>` so validated bodies are
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
 * @lore AF4/§4a: `@hono/zod-validator@0.7.6` typechecks against its own deduped
 * zod 3.25.76, while server schemas are zod 4.4.3 — the two `zod/v4/core`
 * `$ZodType` brands are nominally distinct, so the validator's inferring
 * overload (`T extends ZodSchema`) is UNREACHABLE for server schemas. We keep
 * `zValidator` for the runtime parse + 400-on-invalid behavior (unchanged) but
 * OWN the boundary type ourselves: the function's declared return type carries
 * `ValidatedJson<T>` (server-local `z.output<T>`). The only cast is
 * `schema as never` — a bridge for the validator's brand-incompatible schema
 * ARGUMENT, NOT a cast of the request payload. The payload a handler reads via
 * `c.req.valid("json")` stays fully typed as `z.output<T>`; no `any`, no
 * `as unknown as`, no payload-shape cast at the boundary.
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
