import { RuleTester } from "eslint";
import { describe, it } from "vitest";
import { noOffScaleRadius } from "../no-off-scale-radius.js";
import { ruleTester } from "./setup.js";

RuleTester.describe = describe as unknown as typeof RuleTester.describe;
RuleTester.it = it as unknown as typeof RuleTester.it;

// U10 Hearth radius scale: {0, 10, 16, 9999}
// Named Tailwind classes: rounded-none (0) = allowed, rounded-2xl (16px) = allowed, rounded-full (9999px) = allowed.
// Everything else (rounded, rounded-sm, rounded-md, rounded-lg, rounded-xl, rounded-3xl) is off-scale.
ruleTester.run("no-off-scale-radius", noOffScaleRadius, {
	valid: [
		// Hearth on-scale arbitrary values
		{
			filename: "Foo.tsx",
			code: 'const J = <div className="rounded-[10px]" />;',
		},
		{
			filename: "Foo.tsx",
			code: 'const J = <div className="rounded-[16px]" />;',
		},
		{
			filename: "Foo.tsx",
			code: 'const J = <div className="rounded-[9999px]" />;',
		},
		{
			filename: "Foo.tsx",
			code: 'const J = <div className="rounded-full" />;',
		},
		// Named on-scale radii
		{
			filename: "Foo.tsx",
			code: 'const J = <div className="rounded-none" />;',
		},
		// rounded-2xl (16px) is NOW on-scale in Hearth (maps to --r-default)
		{
			filename: "Foo.tsx",
			code: 'const J = <div className="rounded-2xl" />;',
		},
	],
	invalid: [
		// Old 4px-grid values are now off-scale
		{
			filename: "Foo.tsx",
			code: 'const J = <div className="rounded-[4px]" />;',
			errors: [{ messageId: "offScale" }],
		},
		{
			filename: "Foo.tsx",
			code: 'const J = <div className="rounded-[8px]" />;',
			errors: [{ messageId: "offScale" }],
		},
		{
			filename: "Foo.tsx",
			code: 'const J = <div className="rounded-[12px]" />;',
			errors: [{ messageId: "offScale" }],
		},
		{
			filename: "Foo.tsx",
			code: 'const J = <div className="rounded-tl-[6px]" />;',
			errors: [{ messageId: "offScale" }],
		},
		// Named off-scale radii
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
			code: 'const J = <div className="rounded" />;',
			errors: [{ messageId: "namedOffScale" }],
		},
		{
			filename: "Foo.tsx",
			code: 'const J = <div className="rounded-lg" />;',
			errors: [{ messageId: "namedOffScale" }],
		},
		{
			filename: "Foo.tsx",
			code: 'const J = <div className="rounded-xl" />;',
			errors: [{ messageId: "namedOffScale" }],
		},
		// rounded-3xl (24px) remains off-scale
		{
			filename: "Foo.tsx",
			code: 'const J = <div className="rounded-3xl" />;',
			errors: [{ messageId: "namedOffScale" }],
		},
	],
});
