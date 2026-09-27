/**
 * `design/no-off-scale-duration` flags `duration-[<number>ms]` and `ease-[ease]` in DS .tsx files —
 * they must use token forms (--motion-fast/default/slow and --motion-ease) instead.
 */

import { RuleTester } from "eslint";
import { describe, it } from "vitest";
import { noOffScaleDuration } from "../no-off-scale-duration.js";
import { ruleTester } from "./setup.js";

RuleTester.describe = describe as unknown as typeof RuleTester.describe;
RuleTester.it = it as unknown as typeof RuleTester.it;

ruleTester.run("no-off-scale-duration", noOffScaleDuration, {
	valid: [
		// Token form for duration — allowed.
		{
			filename: "Foo.tsx",
			code: 'const J = <div className="duration-[var(--motion-fast)]" />;',
		},
		{
			filename: "Foo.tsx",
			code: 'const J = <div className="duration-[var(--motion-default)]" />;',
		},
		{
			filename: "Foo.tsx",
			code: 'const J = <div className="duration-[var(--motion-slow)]" />;',
		},
		// Token form for easing — allowed.
		{
			filename: "Foo.tsx",
			code: 'const J = <div className="ease-[var(--motion-ease)]" />;',
		},
		// Named Tailwind duration utilities (no ms literal) — allowed.
		{
			filename: "Foo.tsx",
			code: 'const J = <div className="duration-200" />;',
		},
		{
			filename: "Foo.tsx",
			code: 'const J = <div className="ease-in-out" />;',
		},
		// Non-duration transitions — allowed.
		{
			filename: "Foo.tsx",
			code: 'const J = <div className="transition-colors" />;',
		},
	],
	invalid: [
		// Bare ms literal duration — the dominant violation (`Checkbox.tsx:48`).
		{
			filename: "Foo.tsx",
			code: 'const J = <div className="duration-[120ms]" />;',
			errors: [{ messageId: "hardcodedDuration" }],
		},
		{
			filename: "Foo.tsx",
			code: 'const J = <div className="duration-[240ms]" />;',
			errors: [{ messageId: "hardcodedDuration" }],
		},
		{
			filename: "Foo.tsx",
			code: 'const J = <div className="duration-[450ms]" />;',
			errors: [{ messageId: "hardcodedDuration" }],
		},
		// Non-token easing — CSS keyword `ease` as an arbitrary value
		// (`SearchField.tsx:41,50`, `NavItem.tsx:60`).
		{
			filename: "Foo.tsx",
			code: 'const J = <div className="ease-[ease]" />;',
			errors: [{ messageId: "hardcodedEase" }],
		},
	],
});
