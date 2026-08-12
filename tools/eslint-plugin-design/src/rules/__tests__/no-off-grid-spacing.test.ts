import { RuleTester } from "eslint";
import { describe, it } from "vitest";
import { noOffGridSpacing } from "../no-off-grid-spacing.js";
import { ruleTester } from "./setup.js";

RuleTester.describe = describe as unknown as typeof RuleTester.describe;
RuleTester.it = it as unknown as typeof RuleTester.it;

// Composition spacing uses the Hearth vocabulary numerically. Semantics
// are reviewed as ranges; this rule does not prescribe an endpoint in a range.
ruleTester.run("no-off-grid-spacing", noOffGridSpacing, {
	valid: [
		{
			filename: "Foo.tsx",
			code: 'const J = <div className="gap-[6px] gap-x-[12px] mt-[24px] mb-[36px]" />;',
		},
		{
			filename: "Foo.tsx",
			code: 'const J = <div className="gap-1.5 gap-x-3 mt-6 mb-9 space-y-12" />;',
		},
		{
			filename: "Foo.tsx",
			code: 'const J = <div className="gap-[var(--space-2)] mt-[var(--space-4)]" />;',
		},
		// Padding and fixed geometry belong to AZ7/AZ11, not this composition rule.
		{
			filename: "Foo.tsx",
			code: 'const J = <div className="p-[5px] px-2 py-2.5 w-[17px] h-[31px]" />;',
		},
		// Negative overlap and auto/percentage positioning are not positive composition gaps.
		{
			filename: "Foo.tsx",
			code: 'const J = <div className="-mt-2 ml-[-6px] ml-auto mr-[10%]" />;',
		},
		// A small gap inside an intrinsic control is control-internal spacing.
		{
			filename: "Foo.tsx",
			code: 'const J = <button className="inline-flex items-center gap-1">Save</button>;',
		},
		// Compact pill contents are control internals, not surface composition.
		{
			filename: "Foo.tsx",
			code: 'const J = <span data-spacing-role="compact-pill" className="inline-flex items-center gap-1 px-2 py-1">Tag</span>;',
		},
		// Tiny positioning beside explicitly sized glyph geometry is optical alignment.
		{
			filename: "Foo.tsx",
			code: 'const J = <span className="mt-[2px] h-[12px] w-[12px] shrink-0" />;',
		},
		{
			filename: "Foo.tsx",
			code: 'const classes = ["gap-[6px]", active && "mt-[12px]"]; const J = <div className={classes} />;',
		},
		{
			filename: "Foo.tsx",
			code: 'const J = <><div data-spacing-role="overlay-offset" className="mt-1" /><span data-spacing-role="optical-offset" className="mt-[7px]" /><span data-spacing-role="coordinate" className="ml-[105px]" /></>;',
		},
	],
	invalid: [
		{
			filename: "Foo.tsx",
			code: 'const J = <div className="gap-[2px]" />;',
			errors: [{ messageId: "offGrid" }],
		},
		{
			filename: "Foo.tsx",
			code: 'const J = <div className="gap-2 mt-1 space-y-4" />;',
			errors: [{ messageId: "offGrid" }, { messageId: "offGrid" }, { messageId: "offGrid" }],
		},
		{
			filename: "Foo.tsx",
			code: 'const J = <div className="sm:gap-2 hover:mb-[5px]" />;',
			errors: [{ messageId: "offGrid" }, { messageId: "offGrid" }],
		},
		{
			filename: "Foo.tsx",
			code: 'const classes = ["gap-2", active && "mt-[5px]"]; const J = <div className={classes} />;',
			errors: [{ messageId: "offGrid" }, { messageId: "offGrid" }],
		},
		{
			filename: "Foo.tsx",
			code: 'const J = <div className="gap-[5rem]" />;',
			errors: [{ messageId: "unresolved" }],
		},
		{
			filename: "Foo.tsx",
			code: 'const J = <span className="inline-flex rounded-[var(--r-default)] px-24 gap-8">Not a pill</span>;',
			errors: [{ messageId: "offGrid" }],
		},
		{
			filename: "Foo.tsx",
			code: 'const J = <span className="relative h-[20px] mt-16" />;',
			errors: [{ messageId: "offGrid" }],
		},
		{
			filename: "Foo.tsx",
			code: 'const J = <span data-spacing-role="compact-pill" className="inline-flex gap-8 px-2 py-1">Bad pill</span>;',
			errors: [{ messageId: "offGrid" }],
		},
		{
			filename: "Foo.tsx",
			code: 'const J = <span data-spacing-role="optical-offset" className="mt-16" />;',
			errors: [{ messageId: "offGrid" }],
		},
	],
});
