import { zValidator } from "@hono/zod-validator";
import { API_ERROR_CODES, type ApiErrorResponse } from "@hyperidle/domain-model";
import type { Context, Env, MiddlewareHandler } from "hono";
import type { z } from "zod";

/**
 * @lore AU26 B1a: moved from `layers/core-api/src/middleware/validate.ts`.
 * A route file on EITHER app must be able to validate a body without importing
 * the other Layer — `agent-orchestration`'s `PATCH /api/sessions/:id` is the
 * first non-core-api caller. Pure relocation; the runtime behaviour and the
 * 400 `ApiErrorResponse` shape are byte-identical.
 *
 * @lore AF4 (build/verify): The AF1 typecheck gate (scripts/typecheck-gate.ts)
 * runs `tsc --noEmit -p` per package. server/web are project-`references`
 * consumers of shared+db and DO need the leaves' emitted `dist/*.d.ts` present:
 * with leaf `dist/` ABSENT, cross-package symbols (e.g. the vitest `dbTest`
 * fixture) resolve to `any` → a ~3400-error TS7031/TS2xxx phantom and server
 * FAILS. The reference-noise filter only hides TS6305/6307/6059, NOT this
 * cascade. Proof: removing every leaf dist then `npm run check` → server 3428
 * FAIL; rebuild dist → server 0 PASS. `dist` is gitignored so a "clean" tree can
 * silently still have it — always `ls framework/shared/dist` before trusting a
 * gate count. To populate dist: `tsc -b framework/shared framework/db`
 * (ignore its TS6059 rootDir notices — it still emits), THEN delete the
 * generated `.d.ts/.js/.map` it scatters into the packages' `src` dirs (biome
 * lints src and would report ~714 phantom noBannedTypes errors from them).
 * Then `npm run verify` → server=0, gate PASS, biome 0 errors. CI never sees the
 * fragility (it validates the attestation signature, not the live gate). Upstream
 * cause is AF1-owned. Full writeup: plans/AF4/lore.md.
 */

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
		// c.json() returns `Response & TypedResponse<...>` which extends Response;
		// a single widening cast suffices (no unknown intermediary needed).
		return c.json(response, 400) as Response;
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
 * @lore AF4/§4a: `@hono/zod-validator@0.8.0` typechecks against its own deduped
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
