import { RuleTester } from "eslint";
import { describe, it } from "vitest";
import { noHandrolledControl } from "../no-handrolled-control.js";
import { ruleTester } from "./setup.js";

RuleTester.describe = describe as unknown as typeof RuleTester.describe;
RuleTester.it = it as unknown as typeof RuleTester.it;

// AZ7 E2: DaisyUI control classes or a raw accent/status fill on a raw
// button/input/textarea/select under layers/core-ui/src/** are violations.
// The rule is scoped OFF outside that path (design-system builds controls).
ruleTester.run("no-handrolled-control", noHandrolledControl, {
	valid: [
		// Outside layers/core-ui/src — the design system builds controls.
		{
			filename: "framework/design-system/src/Button.tsx",
			code: 'const J = <button className="btn btn-primary" />;',
		},
		// A design-system component, not a raw element.
		{
			filename: "layers/core-ui/src/pages/Foo.tsx",
			code: 'const J = <Button variant="primary" />;',
		},
		// A raw button with no DaisyUI/accent chrome (token-legal, no violation
		// under this rule — E2's honest boundary, combined-round.md §3.3).
		{
			filename: "layers/core-ui/src/pages/Foo.tsx",
			code: 'const J = <button className="flex items-center gap-[6px]" />;',
		},
		// The AQ-011 form-control exemption: checkbox/toggle/radio/range are not matched.
		{
			filename: "layers/core-ui/src/pages/Foo.tsx",
			code: 'const J = <input type="checkbox" className="checkbox checkbox-sm" />;',
		},
		{
			filename: "layers/core-ui/src/pages/Foo.tsx",
			code: 'const J = <input type="range" className="range range-xs" />;',
		},
	],
	invalid: [
		// DaisyUI btn* class on a raw <button>.
		{
			filename: "layers/core-ui/src/pages/Foo.tsx",
			code: 'const J = <button className="btn btn-ghost btn-xs" />;',
			errors: [
				{ messageId: "daisyControl" },
				{ messageId: "daisyControl" },
				{ messageId: "daisyControl" },
			],
		},
		// DaisyUI input* class on a raw <input>.
		{
			filename: "layers/core-ui/src/pages/Foo.tsx",
			code: 'const J = <input className="input input-bordered input-sm" />;',
			errors: [
				{ messageId: "daisyControl" },
				{ messageId: "daisyControl" },
				{ messageId: "daisyControl" },
			],
		},
		// DaisyUI textarea* class.
		{
			filename: "layers/core-ui/src/settings/Foo.tsx",
			code: 'const J = <textarea className="textarea textarea-bordered" />;',
			errors: [{ messageId: "daisyControl" }, { messageId: "daisyControl" }],
		},
		// A raw button painting an accent fill directly.
		{
			filename: "layers/core-ui/src/pages/Foo.tsx",
			code: 'const J = <button className="bg-[var(--accent-primary)]" />;',
			errors: [{ messageId: "accentFill" }],
		},
		// A raw button painting a status fill directly.
		{
			filename: "layers/core-ui/src/pages/Foo.tsx",
			code: 'const J = <button className="bg-[var(--status-error)]" />;',
			errors: [{ messageId: "accentFill" }],
		},
		// The array + .join(" ") pattern must be caught (deep collector).
		{
			filename: "layers/core-ui/src/pages/Foo.tsx",
			code: 'const J = <button className={["btn", "btn-ghost"].join(" ")} />;',
			errors: [{ messageId: "daisyControl" }, { messageId: "daisyControl" }],
		},
	],
});
