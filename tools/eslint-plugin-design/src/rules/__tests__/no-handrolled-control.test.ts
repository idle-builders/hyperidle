import { RuleTester } from "eslint";
import { describe, it } from "vitest";
import { noHandrolledControl } from "../no-handrolled-control.js";
import { ruleTester } from "./setup.js";

RuleTester.describe = describe as unknown as typeof RuleTester.describe;
RuleTester.it = it as unknown as typeof RuleTester.it;

// DaisyUI control classes, a raw accent/status fill, any other token
// fill, a token border, or ANY radius on a raw button/input/textarea/select
// under layers/core-ui/src/** are violations. The rule is scoped OFF outside
// that path (design-system builds controls).
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
		// A raw button that paints no chrome at all — layout and spacing only.
		{
			filename: "layers/core-ui/src/pages/Foo.tsx",
			code: 'const J = <button className="flex items-center gap-[6px]" />;',
		},
		// A non-control element may carry a fill, a border and a radius freely —
		// this rule is about controls.
		{
			filename: "layers/core-ui/src/pages/Foo.tsx",
			code: 'const J = <div className="rounded-[var(--r-default)] bg-[var(--surface-container)] border-[1.5px]" />;',
		},
		// A plain `border` utility is not the token border weight/colour.
		{
			filename: "layers/core-ui/src/pages/Foo.tsx",
			code: 'const J = <button className="border border-dashed" />;',
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
		// --accent-primary-dim is a row-hover/selected tint, not an accent fill — a raw
		// interactive element (e.g. a Row) painting it directly must not be flagged.
		{
			filename: "layers/core-ui/src/pages/Foo.tsx",
			code: 'const J = <button className="hover:bg-[var(--accent-primary-dim)]" />;',
		},
		// Test/story files are not "used in a product surface" — excluded.
		{
			filename: "layers/core-ui/src/__tests__/foundation.component.test.tsx",
			code: 'const J = <button className="btn btn-primary" />;',
		},
		{
			filename: "layers/core-ui/src/pages/Foo.stories.tsx",
			code: 'const J = <button className="btn btn-primary" />;',
		},
		// The selection-card exemption: aria-pressed + flex-col together skip the
		// fill/border/radius clauses — SettingsAppearance's theme-swatch picker is
		// a card, not a repainted Button.
		{
			filename: "layers/core-ui/src/pages/Foo.tsx",
			code: 'const J = <button aria-pressed="false" className="flex-col rounded-[var(--r-default)] bg-[var(--surface-container)] border-[1.5px]" />;',
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
		// DaisyUI file-input* class on a raw <input type="file">. file-input is
		// a full-chrome DaisyUI control class (like btn/input), not a modifier.
		{
			filename: "layers/core-ui/src/pages/Foo.tsx",
			code: 'const J = <input type="file" className="file-input file-input-bordered" />;',
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
		// @lore a control's chrome built in a same-file const before reaching className must be caught through the identifier.
		{
			filename: "layers/core-ui/src/pages/Foo.tsx",
			code: 'const controlClass = "btn btn-primary"; const J = <button className={controlClass} />;',
			errors: [{ messageId: "daisyControl" }, { messageId: "daisyControl" }],
		},
		// A surface fill — token-legal, and still chrome Button owns.
		{
			filename: "layers/core-ui/src/pages/Foo.tsx",
			code: 'const J = <button className="bg-[var(--surface-container)]" />;',
			errors: [{ messageId: "tokenFill" }],
		},
		// A color-mix() fill.
		{
			filename: "layers/core-ui/src/pages/Foo.tsx",
			code: 'const J = <button className="bg-[color-mix(in_oklab,var(--accent-primary)_6%,transparent)]" />;',
			errors: [{ messageId: "tokenFill" }],
		},
		// The 1.5px Hearth control border weight.
		{
			filename: "layers/core-ui/src/pages/Foo.tsx",
			code: 'const J = <input className="border-[1.5px]" />;',
			errors: [{ messageId: "tokenBorder" }],
		},
		// A --border-* colour, with a side infix.
		{
			filename: "layers/core-ui/src/pages/Foo.tsx",
			code: 'const J = <textarea className="border-x-[var(--border-subtle)]" />;',
			errors: [{ messageId: "tokenBorder" }],
		},
		// A token-spelled radius passes design/radius-token-only and is still a
		// control deciding its own corner radius.
		{
			filename: "layers/core-ui/src/pages/Foo.tsx",
			code: 'const J = <button className="rounded-[var(--r-default)]" />;',
			errors: [{ messageId: "controlRadius" }],
		},
		// A named Tailwind radius on a <select>.
		{
			filename: "layers/core-ui/src/settings/Foo.tsx",
			code: 'const J = <select className="rounded-lg" />;',
			errors: [{ messageId: "controlRadius" }],
		},
		// All three new axes on one element — one report per axis, not per token.
		{
			filename: "layers/core-ui/src/pages/Foo.tsx",
			code: 'const J = <button className="bg-[var(--surface-container)] bg-[var(--surface-elevated)] border-[1.5px] rounded-full rounded-lg" />;',
			errors: [
				{ messageId: "tokenFill" },
				{ messageId: "tokenBorder" },
				{ messageId: "controlRadius" },
			],
		},
		// Variant prefixes are stripped before matching.
		{
			filename: "layers/core-ui/src/pages/Foo.tsx",
			code: 'const J = <button className="hover:bg-[var(--surface-elevated)] lg:rounded-full" />;',
			errors: [{ messageId: "tokenFill" }, { messageId: "controlRadius" }],
		},
		// Token-legal chrome built in a same-file `const`.
		{
			filename: "layers/core-ui/src/pages/Foo.tsx",
			code: 'const RETRY_BTN_CLASS = "rounded-[var(--r-subtle)] bg-[var(--surface-container)]"; const J = <button className={RETRY_BTN_CLASS} />;',
			errors: [{ messageId: "tokenFill" }, { messageId: "controlRadius" }],
		},
		// The selection-card exemption stays narrow: flex-col alone (no
		// aria-pressed) is still exactly the population this rule targets.
		{
			filename: "layers/core-ui/src/pages/Foo.tsx",
			code: 'const J = <button className="flex-col bg-[var(--surface-container)]" />;',
			errors: [{ messageId: "tokenFill" }],
		},
		// aria-pressed alone (no flex-col) is still a repainted Button, not a card.
		{
			filename: "layers/core-ui/src/pages/Foo.tsx",
			code: 'const J = <button aria-pressed="false" className="bg-[var(--surface-container)]" />;',
			errors: [{ messageId: "tokenFill" }],
		},
	],
});
