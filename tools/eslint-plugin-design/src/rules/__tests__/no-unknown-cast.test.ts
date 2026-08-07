/**
 * ESLint rule test: design/no-unknown-cast
 *
 * Forbids `X as unknown as T` double-assertions. A single `as T`, a single
 * `as unknown` (discard), and casts through a concrete type are all allowed —
 * only the `unknown`-laundering double-assertion is flagged.
 */

import { RuleTester } from "eslint";
import { describe, it } from "vitest";
import { noUnknownCast } from "../no-unknown-cast.js";
import { ruleTester } from "./setup.js";

RuleTester.describe = describe as unknown as typeof RuleTester.describe;
RuleTester.it = it as unknown as typeof RuleTester.it;

ruleTester.run("no-unknown-cast", noUnknownCast, {
	valid: [
		// Single narrowing cast — allowed.
		{ code: "const x = value as Thread;" },
		// Single cast to unknown alone (discard) — allowed.
		{ code: "const x = value as unknown;" },
		// Cast through a concrete intermediate type — allowed (not `unknown`).
		{ code: "const x = value as object as Thread;" },
		// No cast.
		{ code: "const x = value;" },
	],
	invalid: [
		{
			code: "const x = value as unknown as Thread;",
			errors: [{ messageId: "unknownCast" }],
		},
		{
			code: "const x = (a ?? b) as unknown as Record<string, unknown>;",
			errors: [{ messageId: "unknownCast" }],
		},
		{
			code: "fn(tx as unknown as HyperIdleDb);",
			errors: [{ messageId: "unknownCast" }],
		},
	],
});
