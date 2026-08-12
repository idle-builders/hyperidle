import { RuleTester } from "eslint";
import { describe, it } from "vitest";
import { shadowTokenOnly } from "../shadow-token-only.js";
import { ruleTester } from "./setup.js";

RuleTester.describe = describe as unknown as typeof RuleTester.describe;
RuleTester.it = it as unknown as typeof RuleTester.it;

ruleTester.run("shadow-token-only", shadowTokenOnly, {
	valid: [
		{
			filename: "Foo.tsx",
			code: 'const J = <div className="shadow-none shadow-[var(--shadow-subtle)]" />;',
		},
		{
			filename: "Foo.tsx",
			code: 'const J = <div className="shadow-[var(--shadow-default)] md:shadow-[var(--shadow-elevated)]" />;',
		},
		// Focus and validation rings communicate state rather than elevation.
		{
			filename: "Foo.tsx",
			code: 'const J = <input className="focus:shadow-[0_0_0_3px_var(--accent-primary-dim)] invalid:shadow-[0_0_0_3px_var(--status-danger-dim)]" />;',
		},
		{
			filename: "Foo.tsx",
			code: 'const J = <div style={{ boxShadow: "var(--shadow-default)" }} />;',
		},
		// The browser image is subject-authored content rather than Hearth chrome.
		{
			filename: "layers/core-ui/src/pages/review/ReviewBrowserPreview.tsx",
			code: 'const J = <div style={{ boxShadow: "0 8px 32px rgba(0,0,0,.18)" }} />;',
		},
	],
	invalid: [
		{
			filename: "Foo.tsx",
			code: 'const J = <div className="shadow-lg" />;',
			errors: [{ messageId: "rawShadow" }],
		},
		{
			filename: "Foo.tsx",
			code: 'const J = <div className="shadow-[0_8px_32px_rgba(0,0,0,.18)]" />;',
			errors: [{ messageId: "rawShadow" }],
		},
		{
			filename: "Foo.tsx",
			code: 'const J = <div style={{ boxShadow: "0 8px 32px rgba(0,0,0,.18)" }} />;',
			errors: [{ messageId: "rawShadow" }],
		},
		{
			filename: "Foo.tsx",
			code: 'const classes = ["shadow-sm", open && "shadow-[0_2px_8px_#000]"]; const J = <div className={classes} />;',
			errors: [{ messageId: "rawShadow" }, { messageId: "rawShadow" }],
		},
	],
});
