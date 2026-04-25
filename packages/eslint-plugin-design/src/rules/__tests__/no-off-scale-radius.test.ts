import { describe, it } from "vitest";
import { RuleTester } from "eslint";
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
	],
});
