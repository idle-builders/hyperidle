/**
 * AG5 — ESLint rule test: design/no-handrolled-select
 *
 * Red phase: FAILS because the rule file does not exist yet.
 *
 * Rule forbids:
 *   - className containing "select-bordered" (DaisyUI hand-roll marker)
 *   - className containing "select select-sm" (combined DaisyUI classes)
 *   - className containing "select-sm" alone (DaisyUI size-only shortcut that bypasses the primitive)
 *   - inline `selectStyle` object pattern (SettingsOrgChart pattern — detected as const decl named /selectStyle/i)
 *
 * Files under layers/web/src/** only. The rule does NOT fire in design-system source.
 */

import { RuleTester } from "eslint";
import { describe, it } from "vitest";
// @lore AG5: rule does not exist yet — red phase
import { noHandrolledSelect } from "../no-handrolled-select.js";
import { ruleTester } from "./setup.js";

RuleTester.describe = describe as unknown as typeof RuleTester.describe;
RuleTester.it = it as unknown as typeof RuleTester.it;

ruleTester.run("no-handrolled-select", noHandrolledSelect, {
	valid: [
		// Using the canonical Select primitive — always valid
		{
			filename: "layers/web/src/pages/Settings.tsx",
			code: 'const J = <Select options={opts} size="sm" />;',
		},
		// Non-select className — not flagged
		{
			filename: "layers/web/src/pages/Foo.tsx",
			code: 'const J = <div className="flex flex-col gap-[12px]" />;',
		},
		// select-bordered outside layers/web/src — design-system itself is exempt
		{
			filename: "framework/design-system/src/Select.tsx",
			code: 'const J = <select className="select-bordered" />;',
		},
		// A plain <select> without the DaisyUI marker classes is not flagged
		{
			filename: "layers/web/src/pages/Foo.tsx",
			code: "const J = <select value={v} onChange={onChange} />;",
		},
	],
	invalid: [
		// DaisyUI select-bordered
		{
			filename: "layers/web/src/pages/Settings.tsx",
			code: 'const J = <select className="select select-bordered" />;',
			errors: [{ messageId: "handrolledSelect" }],
		},
		// DaisyUI select-sm
		{
			filename: "layers/web/src/settings/SettingsModels.tsx",
			code: 'const J = <select className="select select-sm select-bordered" />;',
			errors: [{ messageId: "handrolledSelect" }],
		},
		// select-bordered alone
		{
			filename: "layers/web/src/pages/WorkBet.tsx",
			code: 'const J = <select className="select-bordered w-full" />;',
			errors: [{ messageId: "handrolledSelect" }],
		},
		// selectStyle inline object — SettingsOrgChart pattern
		{
			filename: "layers/web/src/settings/SettingsOrgChart.tsx",
			code: "const selectStyle = { border: '1px solid var(--border-default)' };",
			errors: [{ messageId: "handrolledSelectStyle" }],
		},
	],
});
