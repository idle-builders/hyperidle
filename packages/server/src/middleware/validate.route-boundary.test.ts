import type { MiddlewareHandler } from "hono";
import { describe, expect, expectTypeOf, test } from "vitest";
import { z } from "zod";
import type { validateBody } from "./validate.js";

/**
 * AF4 / AC2 — route-boundary payload soundness (RED phase).
 *
 * @lore The web app consumes config-PATCH routes (notifications /
 * observability / git-export) whose handlers read `c.req.valid("json")`.
 * That validated payload type is produced by `validateBody(schema)`: the
 * Hono `MiddlewareHandler`'s Input map carries `{ out: { json: <Out> } }`,
 * and `<Out>` is what `c.req.valid("json")` resolves to inside the handler.
 *
 * Today `validateBody` is typed `ReturnType<typeof zValidator>` — the
 * UN-parameterized middleware return — and casts the hook to
 * `Parameters<typeof zValidator>[2]`. That cast routes the call to the
 * wrong overload and ERASES the schema's inferred output: the validated
 * `json` type resolves to a wide/`string`-ish default, NOT
 * `z.output<typeof schema>`. So routes treat validated bodies as the wrong
 * (effectively `any`-grade) type at the boundary.
 *
 * This is a TYPE-LEVEL contract, so the type system (`tsc` via
 * `npm run check`) is the enforcing tool, per CLAUDE.md — a static property
 * is enforced by the type system, not a runtime assertion. The `tsc`-level
 * assertions below FAIL today (RED) and pass once §4a of the AF4 plan drops
 * the `ReturnType` widening + hook cast so the inferring `zValidator`
 * overload threads `z.output<schema>` through to `valid("json")`.
 *
 * Mechanism check: `npx tsc --noEmit -p packages/server/tsconfig.json`
 * reports an error inside THIS file while `validateBody` erases the type;
 * the error clears after the green-phase fix.
 */

/** Extract the validated `json` output type a route handler sees from a `validateBody` middleware. */
type ValidatedJson<M> =
	M extends MiddlewareHandler<infer _E, infer _P, infer I, infer _R>
		? I extends { out: { json: infer J } }
			? J
			: never
		: never;

// Representative web-consumed config-PATCH payload (mirrors the shape of
// `patchConfigSchema` in notifications-routes.ts — partial, strict object).
const patchPayloadSchema = z
	.object({
		enabled: z.boolean().optional(),
		smtpPort: z.number().int().optional(),
		recipientEmail: z.union([z.string(), z.null()]).optional(),
	})
	.strict();

type ValidatedPayload = ValidatedJson<ReturnType<typeof validateBody<typeof patchPayloadSchema>>>;
type ExpectedPayload = z.output<typeof patchPayloadSchema>;

describe("validateBody route-boundary payload type (AC2)", () => {
	test("validated json payload is the Zod-inferred type, not an erased/any type", () => {
		// TYPE ASSERTIONS — enforced by `tsc`. RED today (validateBody erases the
		// schema type); GREEN after the §4a inferring-overload fix.

		// The validated payload the route handler receives must EQUAL the schema's output.
		expectTypeOf<ValidatedPayload>().toEqualTypeOf<ExpectedPayload>();

		// And it must NOT be `unknown`/`any` (no escape hatch at the boundary).
		expectTypeOf<ValidatedPayload>().not.toBeUnknown();
		expectTypeOf<ValidatedPayload>().not.toBeAny();

		// Hard tsc gate: assigning a value of the validated type into the expected
		// concrete shape must compile. This line is a `tsc` error while the type is
		// erased — the RED signal under `npm run check` / direct `tsc -p server`.
		const sample = { enabled: true, smtpPort: 25 } as ValidatedPayload;
		const asExpected: ExpectedPayload = sample;
		expect(asExpected).toBeDefined();
	});
});
