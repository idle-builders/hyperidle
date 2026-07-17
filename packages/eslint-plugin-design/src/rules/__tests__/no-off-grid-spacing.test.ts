import { RuleTester } from "eslint";
import { describe, it } from "vitest";
import { noOffGridSpacing } from "../no-off-grid-spacing.js";
import { ruleTester } from "./setup.js";

RuleTester.describe = describe as unknown as typeof RuleTester.describe;
RuleTester.it = it as unknown as typeof RuleTester.it;

// U10 Hearth: 6px grid — allowlist {0,3,6,9,12,18,24,36,48}
// 2px is no longer a sub-grid value; it is simply off-grid.
// 4px, 8px, 16px are now also off-grid (they were on the 4px grid, not the 6px grid).
ruleTester.run("no-off-grid-spacing", noOffGridSpacing, {
	valid: [
		// Hearth on-grid values
		{
			filename: "Foo.tsx",
			code: 'const J = <div className="p-[6px] gap-[12px] mx-[24px]" />;',
		},
		// hearth-internal-padding directive: vertical button/input padding 7px and 10px exempt
		{
			filename: "Button.tsx",
			code: '// hearth-internal-padding\nconst J = <button className="py-[7px] px-[12px]" />;',
		},
		{
			filename: "Button.tsx",
			code: '// hearth-internal-padding\nconst J = <button className="py-[10px] pt-[10px] pb-[7px]" />;',
		},
		// hearth-internal-padding directive: badge gap-[4px] and toggle gap-[2px] exempt
		{
			filename: "Badge.tsx",
			code: '// hearth-internal-padding\nconst J = <span className="gap-[4px] px-[6px]" />;',
		},
		{
			filename: "Toggle.tsx",
			code: '// hearth-internal-padding\nconst J = <div className="gap-[2px]" />;',
		},
		{
			filename: "Foo.tsx",
			code: 'const J = <div className="p-[3px] gap-[9px] mx-[18px]" />;',
		},
		{
			filename: "Foo.tsx",
			code: 'const J = <div className="p-[36px] gap-[48px]" />;',
		},
		{
			// Allowed: non-spacing classes
			filename: "Foo.tsx",
			code: 'const J = <div className="bg-surface-1" />;',
		},
		// 0px is always valid
		{
			filename: "Foo.tsx",
			code: 'const J = <div className="p-[0px] m-[0px] gap-[0px]" />;',
		},
		// Tailwind named spacing classes are not checked by this rule (no arbitrary suffix)
		{
			filename: "Foo.tsx",
			code: 'const J = <div className="px-3 py-2" />;',
		},
		// cn() arguments are walked
		{
			filename: "Foo.tsx",
			code: 'const J = <div className={cn("p-[6px]", "gap-[12px]")} />;',
		},
	],
	invalid: [
		{
			filename: "Foo.tsx",
			code: 'const J = <div className="p-[5px]" />;',
			errors: [{ messageId: "offGrid" }],
		},
		// 2px is now simply off-grid (no sub-grid concept in Hearth)
		{
			filename: "Foo.tsx",
			code: 'const J = <div className="gap-[2px]" />;',
			errors: [{ messageId: "offGrid" }],
		},
		// 4px, 8px, 16px are off the 6px grid
		{
			filename: "Foo.tsx",
			code: 'const J = <div className="p-[4px]" />;',
			errors: [{ messageId: "offGrid" }],
		},
		{
			filename: "Foo.tsx",
			code: 'const J = <div className="p-[8px]" />;',
			errors: [{ messageId: "offGrid" }],
		},
		{
			filename: "Foo.tsx",
			code: 'const J = <div className="p-[16px]" />;',
			errors: [{ messageId: "offGrid" }],
		},
		{
			filename: "Foo.tsx",
			code: 'const J = <div className="px-[7px] py-[11px]" />;',
			errors: [{ messageId: "offGrid" }, { messageId: "offGrid" }],
		},
		// cn() args containing off-grid values fire
		{
			filename: "Foo.tsx",
			code: 'const J = <div className={cn("p-[5px]", "bg-surface-1")} />;',
			errors: [{ messageId: "offGrid" }],
		},
		// hearth-internal-padding directive does NOT exempt horizontal padding (px-[7px])
		{
			filename: "Button.tsx",
			code: '// hearth-internal-padding\nconst J = <button className="px-[7px]" />;',
			errors: [{ messageId: "offGrid" }],
		},
		// hearth-internal-padding directive does NOT exempt gap-[4px] without the directive
		{
			filename: "Foo.tsx",
			code: 'const J = <span className="gap-[4px]" />;',
			errors: [{ messageId: "offGrid" }],
		},
		// hearth-internal-padding directive does NOT exempt py-[7px] without the directive
		{
			filename: "Foo.tsx",
			code: 'const J = <button className="py-[7px]" />;',
			errors: [{ messageId: "offGrid" }],
		},
	],
});
