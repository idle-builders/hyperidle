import { zValidator } from "@hono/zod-validator";
import { createHash, timingSafeEqual } from "node:crypto";
import { API_ERROR_CODES, type ApiErrorResponse } from "./api-types.js";
import type { Context, Env, MiddlewareHandler } from "hono";
import type { z } from "zod";

/**
 * The authenticated Hono context type both HTTP applications run on.
 *
 * @lore AU26 A1: lived in `layers/core-api/src/middleware/auth.ts`, then moved
 * to `@hyperidle/http-middleware` so routes on either app (core-api AND
 * agent-orchestration) could type their context without cross-layer imports.
 * Now domain-model: `http-middleware` dissolves (AU44 batch 8) and this type
 * belongs in the wire-contract layer, next to `validateBody`/`ApiErrorResponse`.
 *
 * @lore A7 (FINISH): `authMethod` and `loginSessionId` reflect the current
 * API-key / LoginSession dual strategy. When A7 ships OIDC for the shared
 * backend the identity members here will grow — that work belongs to the A7
 * finisher, not this verdict.
 */
export type HyperIdleEnv = {
	// biome-ignore lint/style/useNamingConvention: `Variables` is the Hono Env property name; the framework requires this exact PascalCase key.
	Variables: {
		userId: string;
		authMethod: "api_key" | "login_session";
		loginSessionId: string | undefined;
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
 * @lore I2 A1/A2: the previous comparison used `actual !== expected`, which
 * runs in time proportional to the matching prefix. The hash-and-compare is
 * the standard mitigation; we accept the cost of two SHA-256 calls per
 * authenticated request because key compares happen at the request boundary,
 * not inside hot loops.
 *
 * @lore AU26 A1: moved from `layers/core-api/src/middleware/timing-safe.ts`.
 * Both applications authenticate at the boundary, and a second hand-rolled copy
 * of a timing-safe compare is exactly the drift this WP exists to delete —
 * `run-orchestration/src/worker-ingress.ts:37` already carried one because it
 * could not import core-api's. Moved to domain-model (AU44 batch 8) so all
 * consumers reach it without cross-layer imports.
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
): Response | void {
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
 * @lore AF4/§4a: `@hono/zod-validator@0.8.0` typechecks against its own deduped
 * zod 3.25.76, while server schemas are zod 4.4.3 — the two `zod/v4/core`
 * `$ZodType` brands are nominally distinct, so the validator's inferring
 * overload (`T extends ZodSchema`) is UNREACHABLE for server schemas. We keep
 * `zValidator` for the runtime parse + 400-on-invalid behavior (unchanged) but
 * OWN the boundary type ourselves: the function's declared return type carries
 * `ValidatedJson<T>` (server-local `z.output<T>`). The only cast is
 * `schema as never` — a bridge for the validator's brand-incompatible schema
 * ARGUMENT, NOT a cast of the request payload.
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
