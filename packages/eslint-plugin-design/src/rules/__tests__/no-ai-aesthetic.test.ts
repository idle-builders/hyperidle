import { describe, it } from "vitest";
import { RuleTester } from "eslint";
import { noAiAesthetic } from "../no-ai-aesthetic.js";
import { ruleTester } from "./setup.js";

RuleTester.describe = describe as unknown as typeof RuleTester.describe;
RuleTester.it = it as unknown as typeof RuleTester.it;

ruleTester.run("no-ai-aesthetic", noAiAesthetic, {
	valid: [
		{
			filename: "Card.tsx",
			code: 'const J = <div className="rounded-[8px] bg-surface-1 shadow-sm" />;',
		},
		{
			// shadow-lg is allowed inside Modal/Dialog/Popover/Tooltip
			filename: "Modal.tsx",
			code: 'const J = <div className="shadow-lg" />;',
		},
		{
			filename: "Foo.tsx",
			code: 'const J = <div className="rounded-full" />;',
		},
	],
	invalid: [
		{
			filename: "Foo.tsx",
			code: 'const J = <div className="rounded-2xl" />;',
			errors: [{ messageId: "rounded2xl" }],
		},
		{
			filename: "Foo.tsx",
			code: 'const J = <div className="bg-gradient-to-r from-indigo-500 to-purple-500" />;',
			errors: [{ messageId: "gradientBg" }],
		},
		{
			filename: "Foo.tsx",
			code: 'const J = <div className="backdrop-blur-md" />;',
			errors: [{ messageId: "backdropBlur" }],
		},
		{
			filename: "Card.tsx",
			code: 'const J = <div className="shadow-xl" />;',
			errors: [{ messageId: "heavyShadow" }],
		},
		{
			filename: "Heading.tsx",
			code: 'const J = <h1 className="bg-clip-text text-transparent" />;',
			errors: [{ messageId: "gradientText" }],
		},
	],
});
