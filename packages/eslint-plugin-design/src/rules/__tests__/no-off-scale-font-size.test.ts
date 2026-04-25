import { RuleTester } from "eslint";
import { describe, it } from "vitest";
import { noOffScaleFontSize } from "../no-off-scale-font-size.js";
import { ruleTester } from "./setup.js";

RuleTester.describe = describe as unknown as typeof RuleTester.describe;
RuleTester.it = it as unknown as typeof RuleTester.it;

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
	],
	invalid: [
		{
			filename: "Foo.tsx",
			code: 'const J = <span className="text-[17px]" />;',
			errors: [{ messageId: "offScale" }],
		},
		{
			filename: "Foo.tsx",
			code: 'const J = <span className="text-[10px]" />;',
			errors: [{ messageId: "offScale" }],
		},
		{
			filename: "Foo.tsx",
			code: 'const J = <span className="text-[22px]" />;',
			errors: [{ messageId: "offScale" }],
		},
	],
});
