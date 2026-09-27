import { RuleTester } from "eslint";
import { describe, it } from "vitest";
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
		// SEV-1 #5: bare top-level constants are NOT in styling context — pass.
		{
			filename: "Foo.tsx",
			code: 'const a = "#fafafa";',
		},
		// JSX text content documenting a hex value — pass.
		{
			filename: "Foo.tsx",
			code: 'const J = <code>{"#ff0000"}</code>;',
		},
		// aria-label describing a color picker — pass.
		{
			filename: "Foo.tsx",
			code: 'const J = <button aria-label="Picker for #ff0000" />;',
		},
		// id / data-* attributes — pass.
		{
			filename: "Foo.tsx",
			code: 'const J = <div id="user-#abc123" data-color="#fff" />;',
		},
		// Plain template literal not inside a styling context — pass.
		{
			filename: "Foo.tsx",
			code: "const a = `bg #ff0000`;",
		},
	],
	invalid: [
		// style={{ color: "#fafafa" }} — styling context.
		{
			filename: "Foo.tsx",
			code: 'const J = <div style={{ color: "#fafafa" }} />;',
			errors: [{ messageId: "hardcoded" }],
		},
		// style={{ background: "rgb(0,0,0)" }}
		{
			filename: "Bar.tsx",
			code: 'const J = <div style={{ background: "rgb(0,0,0)" }} />;',
			errors: [{ messageId: "hardcoded" }],
		},
		// className="bg-[#ff0000]" — arbitrary class with hex.
		{
			filename: "Baz.tsx",
			code: 'const J = <div className="bg-[#ff0000]" />;',
			errors: [{ messageId: "hardcoded" }],
		},
		// cn() argument with a hex color literal.
		{
			filename: "Cn.tsx",
			code: 'const J = <div className={cn("text-[#abc]", "p-2")} />;',
			errors: [{ messageId: "hardcoded" }],
		},
		// Tagged template `css` with hex.
		{
			filename: "Css.tsx",
			code: "const a = css`color: #ff0000;`;",
			errors: [{ messageId: "hardcoded" }],
		},
		// rgba inside a template-string className fires (regression test).
		{
			filename: "Foo.tsx",
			code: "const x = true; const J = <div className={`p-2 ${x}px bg-[rgba(22,118,79,0.08)]`} />;",
			errors: [{ messageId: "hardcoded" }],
		},
	],
});
