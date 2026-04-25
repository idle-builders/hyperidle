import { describe, it } from "vitest";
import { RuleTester } from "eslint";
import { noOffGridSpacing } from "../no-off-grid-spacing.js";
import { ruleTester } from "./setup.js";

RuleTester.describe = describe as unknown as typeof RuleTester.describe;
RuleTester.it = it as unknown as typeof RuleTester.it;

ruleTester.run("no-off-grid-spacing", noOffGridSpacing, {
	valid: [
		{
			filename: "Foo.tsx",
			code: 'const J = <div className="p-[8px] gap-[12px] mx-[16px]" />;',
		},
		{
			filename: "Foo.tsx",
			code: 'const J = <div className="px-3 py-2" />;',
		},
		{
			// Allowed: 0px implicitly via no class; explicit zero would also be fine
			filename: "Foo.tsx",
			code: 'const J = <div className="bg-surface-1" />;',
		},
	],
	invalid: [
		{
			filename: "Foo.tsx",
			code: 'const J = <div className="p-[5px]" />;',
			errors: [{ messageId: "offGrid" }],
		},
		{
			filename: "Foo.tsx",
			code: 'const J = <div className="gap-[2px]" />;',
			errors: [{ messageId: "subGrid" }],
		},
		{
			filename: "Foo.tsx",
			code: 'const J = <div className="px-[7px] py-[9px]" />;',
			errors: [{ messageId: "offGrid" }, { messageId: "offGrid" }],
		},
	],
});
