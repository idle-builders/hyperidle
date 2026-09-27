/**
 * `design/no-handrolled-page-scaffold` flags a page under `layers/core-ui/src/pages/**` that
 * hand-writes a scrolling or clipped body instead of calling `<PageScaffold>`: `flex-1` combined
 * with a vertical scroll overflow (`overflow-y-auto`/`overflow-auto`/`overflow-y-scroll`), or with
 * `overflow-hidden` and no `flex-col` (a block wrapper that clips with nothing to size against).
 */

import tsParser from "@typescript-eslint/parser";
import { RuleTester } from "eslint";
import { describe, it } from "vitest";
import { noHandrolledPageScaffold } from "../rules/no-handrolled-page-scaffold.js";

const tester = new RuleTester({
	languageOptions: {
		parser: tsParser,
		parserOptions: { ecmaFeatures: { jsx: true } },
	},
});

const PAGES_FILENAME = "/repo/layers/core-ui/src/pages/SomePage.tsx";
const NON_PAGES_FILENAME = "/repo/layers/core-ui/src/components/SomeComponent.tsx";

describe("design/no-handrolled-page-scaffold rule", () => {
	it("flags and clears scroll/clip combos correctly", () => {
		tester.run("no-handrolled-page-scaffold", noHandrolledPageScaffold, {
			valid: [
				// no scroll overflow — not the combo
				{
					filename: PAGES_FILENAME,
					code: `const S1 = () => <div className="flex-1 items-center justify-center">content</div>;`,
				},
				// no flex-1 — not the combo
				{
					filename: PAGES_FILENAME,
					code: `const S2 = () => <div className="overflow-y-auto max-h-[200px]">content</div>;`,
				},
				// horizontal scroll, not a vertical scroll overflow
				{
					filename: PAGES_FILENAME,
					code: `const S3 = () => <div className="flex-1 overflow-x-auto">content</div>;`,
				},
				// design-system component itself is out of scope
				{
					filename: "/repo/framework/design-system/src/PageScaffold.tsx",
					code: `const S = () => <div className="flex-1 overflow-y-auto" data-page-scroll="">content</div>;`,
				},
				// flex-1 + overflow-hidden + flex-col is a legal, bounded flex column
				{
					filename: PAGES_FILENAME,
					code: `const E = () => <div className="flex-1 min-h-0 flex flex-col overflow-hidden">{child}</div>;`,
				},
				// overflow-hidden alone — not the combo
				{
					filename: PAGES_FILENAME,
					code: `const E2 = () => <div className="overflow-hidden rounded-[var(--r-default)]">{child}</div>;`,
				},
				// outside layers/core-ui/src/pages/** is out of scope
				{
					filename: NON_PAGES_FILENAME,
					code: `const F = () => <div className="flex-1 overflow-y-auto">content</div>;`,
				},
				// dynamic className (cx()/template identifier) it cannot statically read — honest limit
				{
					filename: PAGES_FILENAME,
					code: `
const cls = someCondition ? "flex-1 overflow-y-auto" : "flex-1";
const G = () => <div className={cls}>content</div>;`,
				},
			],
			invalid: [
				{
					filename: PAGES_FILENAME,
					code: `const A = () => <div className="flex-1 overflow-y-auto">content</div>;`,
					errors: [{ messageId: "handrolledScrollBody" }],
				},
				{
					filename: PAGES_FILENAME,
					code: `const B = () => <div className="min-h-0 flex-1 overflow-auto">content</div>;`,
					errors: [{ messageId: "handrolledScrollBody" }],
				},
				{
					filename: PAGES_FILENAME,
					code: `const C = () => <div className="flex-1 overflow-y-scroll">content</div>;`,
					errors: [{ messageId: "handrolledScrollBody" }],
				},
				{
					filename: PAGES_FILENAME,
					code: `const D = () => <div className="flex-1 overflow-hidden">{child}</div>;`,
					errors: [{ messageId: "handrolledManagedBody" }],
				},
			],
		});
	});
});
