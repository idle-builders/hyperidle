import { RuleTester } from "eslint";
import { describe, it } from "vitest";
import { noRawTailwindColor } from "../no-raw-tailwind-color.js";
import { ruleTester } from "./setup.js";

RuleTester.describe = describe as unknown as typeof RuleTester.describe;
RuleTester.it = it as unknown as typeof RuleTester.it;

ruleTester.run("no-raw-tailwind-color", noRawTailwindColor, {
	valid: [
		{
			filename: "Foo.tsx",
			code: 'const J = <div className="bg-surface-1 text-text-hi border-border-default" />;',
		},
		{
			filename: "Foo.tsx",
			code: 'const J = <div className="text-sm font-medium" />;',
		},
		{
			filename: "Foo.tsx",
			code: 'const J = <div className="bg-[var(--surface-2)]" />;',
		},
	],
	invalid: [
		{
			filename: "Foo.tsx",
			code: 'const J = <div className="bg-blue-500" />;',
			errors: [{ messageId: "rawColor" }],
		},
		{
			filename: "Foo.tsx",
			code: 'const J = <div className="text-indigo-400 border-red-500" />;',
			errors: [{ messageId: "rawColor" }, { messageId: "rawColor" }],
		},
		{
			filename: "Foo.tsx",
			code: 'const J = <div className="ring-emerald-300" />;',
			errors: [{ messageId: "rawColor" }],
		},
	],
});
