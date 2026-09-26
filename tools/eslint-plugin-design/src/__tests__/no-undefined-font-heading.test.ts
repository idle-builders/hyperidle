/**
 * `design/no-undefined-font-heading` flags `font-heading` (an undefined utility, anywhere in web
 * src) and `tracking-wider` (a valid Tailwind utility, but a deviation flagged only under
 * `layers/core-ui/src/pages/**`, where the heading primitive now owns the treatment).
 */

import tsParser from "@typescript-eslint/parser";
import { RuleTester } from "eslint";
import { describe, it } from "vitest";
import { noUndefinedFontHeading } from "../rules/no-undefined-font-heading.js";

const tester = new RuleTester({
	languageOptions: {
		parser: tsParser,
		parserOptions: { ecmaFeatures: { jsx: true } },
	},
});

const PAGES_FILENAME = "/repo/layers/core-ui/src/pages/WorkTeam.tsx";
const NON_PAGES_WEB_FILENAME = "/repo/layers/core-ui/src/components/ArtifactSection.tsx";
const DS_FILENAME = "/repo/framework/design-system/src/SomeComponent.tsx";

describe("design/no-undefined-font-heading rule", () => {
	// ---- font-heading arm ----

	it("flags `font-heading` in a pages/** file (undefined utility — hard error)", () => {
		tester.run("no-undefined-font-heading", noUndefinedFontHeading, {
			valid: [],
			invalid: [
				{
					filename: PAGES_FILENAME,
					code: `const A = () => <div className="text-sm font-heading uppercase tracking-wider">X</div>;`,
					errors: [{ messageId: "fontHeadingUndefined" }],
				},
			],
		});
	});

	it("flags `font-heading` in a non-pages web/src file (undefined utility is wrong anywhere)", () => {
		tester.run("no-undefined-font-heading", noUndefinedFontHeading, {
			valid: [],
			invalid: [
				{
					filename: NON_PAGES_WEB_FILENAME,
					code: `const B = () => <div className="text-xs font-heading tracking-wider">Y</div>;`,
					errors: [{ messageId: "fontHeadingUndefined" }],
				},
			],
		});
	});

	it("flags `font-heading` even in design-system src (undefined utility)", () => {
		tester.run("no-undefined-font-heading", noUndefinedFontHeading, {
			valid: [],
			invalid: [
				{
					filename: DS_FILENAME,
					code: `const C = () => <span className="font-heading">Z</span>;`,
					errors: [{ messageId: "fontHeadingUndefined" }],
				},
			],
		});
	});

	// ---- tracking-wider arm — pages/** only ----

	it("flags `tracking-wider` in a pages/** file (deviation on title scale)", () => {
		tester.run("no-undefined-font-heading", noUndefinedFontHeading, {
			valid: [],
			invalid: [
				{
					filename: PAGES_FILENAME,
					code: `const D = () => <h2 className="text-sm tracking-wider uppercase">Team</h2>;`,
					errors: [{ messageId: "trackingWiderInPages" }],
				},
			],
		});
	});

	it("does NOT flag `tracking-wider` in a non-pages web/src file (legitimate intentional use)", () => {
		tester.run("no-undefined-font-heading", noUndefinedFontHeading, {
			valid: [
				{
					filename: NON_PAGES_WEB_FILENAME,
					// ArtifactSection / BlockRefEmbed etc. use tracking-wider intentionally
					code: `const E = () => <span className="text-xs tracking-wider uppercase">LABEL</span>;`,
				},
			],
			invalid: [],
		});
	});

	it("does NOT flag `tracking-wider` in design-system src", () => {
		tester.run("no-undefined-font-heading", noUndefinedFontHeading, {
			valid: [
				{
					filename: DS_FILENAME,
					code: `const F = () => <span className="tracking-wider">text</span>;`,
				},
			],
			invalid: [],
		});
	});

	// ---- clean code passes ----

	it("does NOT flag clean code with valid Hearth classes in pages/**", () => {
		tester.run("no-undefined-font-heading", noUndefinedFontHeading, {
			valid: [
				{
					filename: PAGES_FILENAME,
					code: `const G = () => <h2 className="text-[20px] font-[600] tracking-[-0.01em] text-[var(--text-primary)]">Page</h2>;`,
				},
			],
			invalid: [],
		});
	});

	it("does NOT flag font-sans or font-mono (valid font utilities)", () => {
		tester.run("no-undefined-font-heading", noUndefinedFontHeading, {
			valid: [
				{
					filename: PAGES_FILENAME,
					code: `const H = () => <div className="font-sans font-mono">text</div>;`,
				},
			],
			invalid: [],
		});
	});

	// ---- combined violations ----

	it("flags both font-heading AND tracking-wider when both appear in a pages/** file", () => {
		tester.run("no-undefined-font-heading", noUndefinedFontHeading, {
			valid: [],
			invalid: [
				{
					filename: PAGES_FILENAME,
					code: `const I = () => (
  <div>
    <h2 className="text-sm font-heading uppercase tracking-wider">A</h2>
  </div>
);`,
					errors: [{ messageId: "fontHeadingUndefined" }, { messageId: "trackingWiderInPages" }],
				},
			],
		});
	});

	// ---- ~8 out-of-scope files that must NOT error on tracking-wider ----

	it("does NOT flag TaskSheet tracking-wider (not in pages/)", () => {
		tester.run("no-undefined-font-heading", noUndefinedFontHeading, {
			valid: [
				{
					filename: "/repo/layers/core-ui/src/shell/TaskSheet.tsx",
					code: `const J = () => <div className="text-xs tracking-wider uppercase">LABEL</div>;`,
				},
			],
			invalid: [],
		});
	});

	it("does NOT flag SessionView tracking-wider (not in pages/)", () => {
		tester.run("no-undefined-font-heading", noUndefinedFontHeading, {
			valid: [
				{
					filename: "/repo/layers/core-ui/src/components/SessionView.tsx",
					code: `const K = () => <span className="tracking-wider">text</span>;`,
				},
			],
			invalid: [],
		});
	});
});
