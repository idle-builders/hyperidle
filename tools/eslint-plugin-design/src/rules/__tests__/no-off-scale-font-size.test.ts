import { RuleTester } from "eslint";
import { describe, it } from "vitest";
import { noOffScaleFontSize } from "../no-off-scale-font-size.js";
import { ruleTester } from "./setup.js";

RuleTester.describe = describe as unknown as typeof RuleTester.describe;
RuleTester.it = it as unknown as typeof RuleTester.it;

// Type scale allowlist: {9,10,11,12,13,14,15,16,17,18,20,24,30} — 9px (count badges),
// 10px (micro-typography), 17px (--text-lg), 30px (--text-3xl).
ruleTester.run("no-off-scale-font-size", noOffScaleFontSize, {
	valid: [
		{
			filename: "Foo.tsx",
			code: 'const J = <span className="text-[14px]" />;',
		},
		{
			filename: "Foo.tsx",
			code: 'const J = <span className="text-[20px]" />;',
		},
		{
			filename: "Foo.tsx",
			code: 'const J = <span className="text-sm" />;',
		},
		// Hearth additions: 17px and 30px are now on-scale
		{
			filename: "Foo.tsx",
			code: 'const J = <span className="text-[17px]" />;',
		},
		{
			filename: "Foo.tsx",
			code: 'const J = <span className="text-[30px]" />;',
		},
		// Micro-typography sizes: 10px and 9px are on-scale
		{
			filename: "Foo.tsx",
			code: 'const J = <span className="text-[10px]" />;',
		},
		{
			filename: "Foo.tsx",
			code: 'const J = <span className="text-[9px]" />;',
		},
	],
	invalid: [
		{
			filename: "Foo.tsx",
			code: 'const J = <span className="text-[22px]" />;',
			errors: [{ messageId: "offScale" }],
		},
		{
			filename: "Foo.tsx",
			code: 'const J = <span className="text-[28px]" />;',
			errors: [{ messageId: "offScale" }],
		},
		{
			filename: "Foo.tsx",
			code: 'const J = <span className="text-[8px]" />;',
			errors: [{ messageId: "offScale" }],
		},
	],
});
