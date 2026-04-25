import { describe, it } from "vitest";
import { RuleTester } from "eslint";
import { noHardcodedColor } from "../no-hardcoded-color.js";
import { ruleTester } from "./setup.js";

RuleTester.describe = describe as unknown as typeof RuleTester.describe;
RuleTester.it = it as unknown as typeof RuleTester.it;

ruleTester.run("no-hardcoded-color", noHardcodedColor, {
	valid: [
		{
			filename: "Foo.tsx",
			code: 'const x = "var(--text-hi)";',
		},
		{
			// Color literals in CSS files (e.g. tokens.css) are exempt.
			filename: "tokens.css.ts",
			code: 'const a = "#fff";',
		},
		{
			filename: "Foo.tsx",
			code: 'const a = "no color here";',
		},
	],
	invalid: [
		{
			filename: "Foo.tsx",
			code: 'const a = "#fafafa";',
			errors: [{ messageId: "hardcoded" }],
		},
		{
			filename: "Bar.tsx",
			code: 'const a = "rgb(0,0,0)";',
			errors: [{ messageId: "hardcoded" }],
		},
		{
			filename: "Baz.tsx",
			code: "const a = `bg #ff0000`;",
			errors: [{ messageId: "hardcoded" }],
		},
	],
});
