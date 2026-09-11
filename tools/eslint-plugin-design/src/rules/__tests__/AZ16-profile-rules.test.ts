import { RuleTester } from "eslint";
import { describe, it } from "vitest";
import { borderWidthProfileOnly } from "../border-width-profile-only.js";
import { motionProfileOnly } from "../motion-profile-only.js";
import { typographyProfileOnly } from "../typography-profile-only.js";
import { ruleTester } from "./setup.js";

RuleTester.describe = describe as unknown as typeof RuleTester.describe;
RuleTester.it = it as unknown as typeof RuleTester.it;

ruleTester.run("typography-profile-only", typographyProfileOnly, {
	valid: [
		{ code: 'const view = <p className="type-copy text-[var(--text-primary)]" />;' },
		{ code: "const view = <p><span>inherits</span></p>;" },
		{
			code: 'const view = <section data-token-subject="foreign"><p className="text-[18px] font-bold" /></section>;',
		},
	],
	invalid: [
		{
			code: 'const view = <p className="font-sans text-[15px] font-normal leading-[1.55] tracking-normal" />;',
			errors: [{ messageId: "rawTypography" }],
		},
		{
			code: 'const view = <p style={{ fontSize: "15px" }} />;',
			errors: [{ messageId: "rawTypography" }],
		},
	],
});

ruleTester.run("motion-profile-only", motionProfileOnly, {
	valid: [
		{ code: 'const view = <button className="motion-feedback hover:opacity-80" />;' },
		{
			filename: "layers/core-ui/src/ds/Combobox.tsx",
			code: "requestAnimationFrame(() => inputRef.current?.focus());",
		},
	],
	invalid: [
		{
			code: 'const view = <button className="transition-all duration-200" />;',
			errors: [{ messageId: "rawMotion" }],
		},
		{
			code: 'node.scrollIntoView({ behavior: "smooth" });',
			errors: [{ messageId: "forbiddenMotionApi" }],
		},
		{
			code: "node.animate([{ opacity: 0 }, { opacity: 1 }]);",
			errors: [{ messageId: "forbiddenMotionApi" }],
		},
		{
			filename: "layers/core-ui/src/pages/work/Foo.tsx",
			code: "requestAnimationFrame(() => doWork());",
			errors: [{ messageId: "forbiddenAnimationFrame" }],
		},
		{
			filename: "layers/core-ui/src/ds/Combobox.tsx",
			code: "requestAnimationFrame(() => doUnrelatedWork());",
			errors: [{ messageId: "forbiddenAnimationFrame" }],
		},
	],
});

ruleTester.run("border-width-profile-only", borderWidthProfileOnly, {
	valid: [
		{
			code: 'const view = <div className="border-[var(--bw-thin)] border-[var(--border-subtle)]" />;',
		},
		{
			code: 'const view = <div className="border-s-[var(--bw-default)] border-e-[var(--bw-strong)]" />;',
		},
		{
			code: 'const view = <div style={{ borderInlineStartWidth: "var(--bw-default)" }} />;',
		},
		{
			code: 'const view = <section data-token-subject="foreign"><div className="border-2" /></section>;',
		},
		// NEW-18: directional @utility classes must be allowed
		{
			code: 'const view = <div className="border-width-thin-b border-[var(--border-subtle)]" />;',
		},
		{
			code: 'const view = <div className="border-width-thin-t border-width-strong-l" />;',
		},
		{
			code: 'const view = <div className="border-width-strong-b border-[var(--border-default)]" />;',
		},
	],
	invalid: [
		{
			code: 'const view = <div className="border border-s-2 border-[1.5px] border-width-thin" />;',
			errors: [{ messageId: "rawBorderWidth" }],
		},
		{
			code: 'const view = <div style={{ borderInlineStartWidth: "2px" }} />;',
			errors: [{ messageId: "rawBorderWidth" }],
		},
	],
});
