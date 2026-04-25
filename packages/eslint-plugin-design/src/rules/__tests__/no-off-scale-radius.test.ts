import { RuleTester } from "eslint";
import { describe, it } from "vitest";
import { noOffScaleRadius } from "../no-off-scale-radius.js";
import { ruleTester } from "./setup.js";

RuleTester.describe = describe as unknown as typeof RuleTester.describe;
RuleTester.it = it as unknown as typeof RuleTester.it;

ruleTester.run("no-off-scale-radius", noOffScaleRadius, {
	valid: [
		{
			filename: "Foo.tsx",
			code: 'const J = <div className="rounded-[4px]" />;',
		},
		{
			filename: "Foo.tsx",
			code: 'const J = <div className="rounded-[12px]" />;',
		},
		{
			filename: "Foo.tsx",
			code: 'const J = <div className="rounded-full" />;',
		},
		{
			filename: "Foo.tsx",
			code: 'const J = <div className="rounded-[999px]" />;',
		},
		// Named on-scale radii are valid.
		{
			filename: "Foo.tsx",
			code: 'const J = <div className="rounded-none" />;',
		},
		{
			filename: "Foo.tsx",
			code: 'const J = <div className="rounded" />;',
		},
		{
			filename: "Foo.tsx",
			code: 'const J = <div className="rounded-lg" />;',
		},
		{
			filename: "Foo.tsx",
			code: 'const J = <div className="rounded-xl" />;',
		},
	],
	invalid: [
		{
			filename: "Foo.tsx",
			code: 'const J = <div className="rounded-[10px]" />;',
			errors: [{ messageId: "offScale" }],
		},
		{
			filename: "Foo.tsx",
			code: 'const J = <div className="rounded-[16px]" />;',
			errors: [{ messageId: "offScale" }],
		},
		{
			filename: "Foo.tsx",
			code: 'const J = <div className="rounded-tl-[6px]" />;',
			errors: [{ messageId: "offScale" }],
		},
		// SEV-1 #3: named off-scale radii now fire.
		{
			filename: "Foo.tsx",
			code: 'const J = <div className="rounded-sm" />;',
			errors: [{ messageId: "namedOffScale" }],
		},
		{
			filename: "Foo.tsx",
			code: 'const J = <div className="rounded-md" />;',
			errors: [{ messageId: "namedOffScale" }],
		},
		{
			filename: "Foo.tsx",
			code: 'const J = <div className="rounded-2xl" />;',
			errors: [{ messageId: "namedOffScale" }],
		},
		{
			filename: "Foo.tsx",
			code: 'const J = <div className="rounded-3xl" />;',
			errors: [{ messageId: "namedOffScale" }],
		},
	],
});
