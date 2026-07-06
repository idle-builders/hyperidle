/**
 * AI7 — ESLint rule `design/no-undefined-font-heading` tests (red phase).
 *
 * AC1(b): Flags `font-heading` (undefined utility — defect anywhere in web src)
 *         and `tracking-wider` (valid Tailwind utility, but a deviation on pages
 *         where the primitive now owns the treatment — flagged only under `pages/**`).
 *
 * Static AC → RuleTester is the right tool (per CLAUDE.md; not a vitest file-read).
 *
 * These tests FAIL until:
 *   packages/eslint-plugin-design/src/rules/no-undefined-font-heading.ts is created
 *   and exported from index.ts.
 *
 * Architecture constraints:
 * - `font-heading` arm fires regardless of path (it's an undefined utility).
 * - `tracking-wider` arm fires ONLY when context.filename contains `/pages/`.
 *   It must NOT fire on non-pages files (ArtifactSection, ArtifactThreadsSummary,
 *   TaskSheet, BlockRefEmbed, SessionView, ThreadSections, DesignSystem etc.)
 * - Both arms fire at whatever severity the eslint.config.ts block configures;
 *   the rule itself does not set severity — it just reports.
 */

import tsParser from "@typescript-eslint/parser";
import { RuleTester } from "eslint";
import { describe, it } from "vitest";

// This import fails until the rule is created
import { noUndefinedFontHeading } from "../rules/no-undefined-font-heading.js";

const tester = new RuleTester({
	languageOptions: {
		parser: tsParser,
		parserOptions: { ecmaFeatures: { jsx: true } },
	},
});

const PAGES_FILENAME = "/repo/packages/web/src/pages/WorkTeam.tsx";
const NON_PAGES_WEB_FILENAME = "/repo/packages/web/src/components/ArtifactSection.tsx";
const DS_FILENAME = "/repo/packages/design-system/src/SomeComponent.tsx";

describe("design/no-undefined-font-heading rule (AI7 AC1)", () => {
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
					filename: "/repo/packages/web/src/shell/TaskSheet.tsx",
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
					filename: "/repo/packages/web/src/components/SessionView.tsx",
					code: `const K = () => <span className="tracking-wider">text</span>;`,
				},
			],
			invalid: [],
		});
	});
});
