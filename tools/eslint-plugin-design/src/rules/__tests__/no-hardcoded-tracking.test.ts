/**
 * `design/no-hardcoded-tracking` flags every `tracking-[<number>em]` in DS .tsx files (uppercase
 * labels) — a token form must be used instead. Allowlisted: negative-em title kerning
 * (tracking-[-0.01em], tracking-[-0.005em]).
 */

import { RuleTester } from "eslint";
import { describe, it } from "vitest";
import { noHardcodedTracking } from "../no-hardcoded-tracking.js";
import { ruleTester } from "./setup.js";

RuleTester.describe = describe as unknown as typeof RuleTester.describe;
RuleTester.it = it as unknown as typeof RuleTester.it;

ruleTester.run("no-hardcoded-tracking", noHardcodedTracking, {
	valid: [
		// Token form — allowed.
		{
			filename: "Foo.tsx",
			code: 'const J = <div className="tracking-[var(--tracking-caps-sm)]" />;',
		},
		{
			filename: "Foo.tsx",
			code: 'const J = <div className="tracking-[var(--tracking-caps)]" />;',
		},
		// Negative-em title kerning — explicitly allowlisted.
		{
			filename: "Foo.tsx",
			code: 'const J = <div className="tracking-[-0.01em]" />;',
		},
		{
			filename: "Foo.tsx",
			code: 'const J = <div className="tracking-[-0.005em]" />;',
		},
		// Non-em tracking that does not look like a raw em value — allowed.
		{
			filename: "Foo.tsx",
			code: 'const J = <div className="tracking-normal" />;',
		},
		{
			filename: "Foo.tsx",
			code: 'const J = <div className="tracking-wide" />;',
		},
	],
	invalid: [
		// Hardcoded positive em tracking (the dominant violation pattern in DS).
		{
			filename: "Foo.tsx",
			code: 'const J = <div className="tracking-[0.05em]" />;',
			errors: [{ messageId: "hardcodedTracking" }],
		},
		{
			filename: "Foo.tsx",
			code: 'const J = <div className="tracking-[0.02em]" />;',
			errors: [{ messageId: "hardcodedTracking" }],
		},
		{
			filename: "Foo.tsx",
			code: 'const J = <div className="tracking-[0.03em]" />;',
			errors: [{ messageId: "hardcodedTracking" }],
		},
		{
			filename: "Foo.tsx",
			code: 'const J = <div className="tracking-[0.04em]" />;',
			errors: [{ messageId: "hardcodedTracking" }],
		},
		// Already-correct value but wrong form — token form required.
		{
			filename: "Foo.tsx",
			code: 'const J = <div className="tracking-[0.06em]" />;',
			errors: [{ messageId: "hardcodedTracking" }],
		},
		// Multiple violations in one className.
		{
			filename: "Foo.tsx",
			code: 'const J = <div className="tracking-[0.05em] text-sm tracking-[0.08em]" />;',
			errors: [{ messageId: "hardcodedTracking" }, { messageId: "hardcodedTracking" }],
		},
	],
});
