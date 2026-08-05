/**
 * AI7 — ESLint rule `design/no-handrolled-page-header` tests (red phase).
 *
 * AC3(c): Flags the inline page-title class combo
 *   `text-[20px]` + `font-[600]` + `tracking-[-0.01em]`
 *   on any JSX element in `layers/core-ui/src/pages/**` whose name is NOT `PageHeader`.
 *
 * Three negative (compliance) cases the rule MUST honor:
 *   1. The combo in `pageTitleClassName` as a template-literal expression reference
 *      (KnowledgeCreate editable <input> path — W1):
 *      className={`${pageTitleClassName} bg-transparent ...`}
 *      → The rule uses collectClassStringsFromJSXAttribute which only extracts
 *        static quasi text from TemplateLiteral (identifier expressions contribute
 *        nothing — no Identifier case in walk()). The combo never surfaces.
 *   2. The combo in `PageHeader.tsx` itself is in design-system, not pages/** — out of scope.
 *   3. `SettingsPage.tsx` and `SetupFlow.tsx` carry the combo but are exempted via
 *      eslint.config.ts block `ignores` — not tested here (config-level, not rule-level).
 *      The RULE itself fires on them; the config suppresses. The RuleTester case below
 *      uses SettingsPage's path to confirm the RULE still flags the combo
 *      (config exemption is separate from rule behavior).
 *
 * These tests FAIL until:
 *   tools/eslint-plugin-design/src/rules/no-handrolled-page-header.ts is created
 *   and exported from index.ts.
 *
 * @lore AI7-W1: The identifier-reference escape hatch works because
 * collectClassStringsFromJSXAttribute → collectClassStringsFromExpression has no
 * `Identifier` case in its walk() — it only extracts static quasi text from
 * TemplateLiteral, not the value of referenced identifiers. This is a deliberate,
 * documented property of util.ts:302 — not an AI7-specific hole.
 */

import tsParser from "@typescript-eslint/parser";
import { RuleTester } from "eslint";
import { describe, it } from "vitest";

// This import fails until the rule is created
import { noHandrolledPageHeader } from "../rules/no-handrolled-page-header.js";

const tester = new RuleTester({
	languageOptions: {
		parser: tsParser,
		parserOptions: { ecmaFeatures: { jsx: true } },
	},
});

const PAGES_FILENAME = "/repo/layers/core-ui/src/pages/WorkPortfolio.tsx";
const SETTINGS_FILENAME = "/repo/layers/core-ui/src/pages/SettingsPage.tsx";
const DS_FILENAME = "/repo/framework/design-system/src/PageHeader.tsx";
const COMPONENTS_FILENAME = "/repo/layers/core-ui/src/components/SomeComponent.tsx";

// The full title combo — all three tokens must appear together
const FULL_COMBO_LITERAL = `text-[20px] font-[600] tracking-[-0.01em] text-[var(--text-primary)] min-w-0 truncate`;

describe("design/no-handrolled-page-header rule (AI7 AC3)", () => {
	// ---- INVALID: literal combo on a non-PageHeader element in pages/** ----

	it("flags the title class combo on an <h2> in pages/**", () => {
		tester.run("no-handrolled-page-header", noHandrolledPageHeader, {
			valid: [],
			invalid: [
				{
					filename: PAGES_FILENAME,
					code: `const A = () => (
  <h2 className="text-[20px] font-[600] tracking-[-0.01em] text-[var(--text-primary)] min-w-0 truncate">
    Portfolio
  </h2>
);`,
					errors: [{ messageId: "handrolledPageHeader" }],
				},
			],
		});
	});

	it("flags the title class combo on a <div> in pages/**", () => {
		tester.run("no-handrolled-page-header", noHandrolledPageHeader, {
			valid: [],
			invalid: [
				{
					filename: PAGES_FILENAME,
					code: `const B = () => <div className="text-[20px] font-[600] tracking-[-0.01em]">Page</div>;`,
					errors: [{ messageId: "handrolledPageHeader" }],
				},
			],
		});
	});

	it("flags the title combo on an <input> with literal class string in pages/**", () => {
		tester.run("no-handrolled-page-header", noHandrolledPageHeader, {
			valid: [],
			invalid: [
				{
					filename: PAGES_FILENAME,
					code: `const C = () => <input className="text-[20px] font-[600] tracking-[-0.01em]" />;`,
					errors: [{ messageId: "handrolledPageHeader" }],
				},
			],
		});
	});

	it("flags the combo in SettingsPage (rule fires; config ignores suppress — separate concern)", () => {
		tester.run("no-handrolled-page-header", noHandrolledPageHeader, {
			valid: [],
			invalid: [
				{
					filename: SETTINGS_FILENAME,
					code: `const D = () => <h2 className="text-[20px] font-[600] tracking-[-0.01em] text-[var(--text-primary)]">Settings</h2>;`,
					errors: [{ messageId: "handrolledPageHeader" }],
				},
			],
		});
	});

	// ---- VALID: KnowledgeCreate identifier-reference escape hatch (W1) ----

	it("does NOT flag a template-literal className that references the pageTitleClassName identifier (W1)", () => {
		tester.run("no-handrolled-page-header", noHandrolledPageHeader, {
			valid: [
				{
					filename: PAGES_FILENAME,
					// The TemplateLiteral quasi text is only " bg-transparent border-none outline-none flex-1 p-0"
					// — the ${pageTitleClassName} expression contributes nothing (no Identifier walk case).
					// The title combo is never surfaced as a literal string fragment.
					code: `
import { pageTitleClassName } from "@hyperidle/design-system";
const E = () => (
  <input
    className={\`\${pageTitleClassName} bg-transparent border-none outline-none flex-1 p-0\`}
    data-testid="knowledge-create-title"
    aria-label="Document title"
  />
);`,
				},
			],
			invalid: [],
		});
	});

	// ---- VALID: PageHeader itself is in design-system, not pages/** ----

	it("does NOT flag the combo inside design-system (PageHeader.tsx is out of scope)", () => {
		tester.run("no-handrolled-page-header", noHandrolledPageHeader, {
			valid: [
				{
					filename: DS_FILENAME,
					code: `const F = () => <h2 className="${FULL_COMBO_LITERAL}">Page</h2>;`,
				},
			],
			invalid: [],
		});
	});

	// ---- VALID: 20px heading WITHOUT the full combo does NOT trip the rule ----

	it("does NOT flag a 20px heading that lacks font-[600] (not the page-title combo)", () => {
		tester.run("no-handrolled-page-header", noHandrolledPageHeader, {
			valid: [
				{
					filename: PAGES_FILENAME,
					// font-semibold ≠ font-[600]; no tracking — incomplete combo, must pass
					code: `const G = () => <h2 className="text-[20px] font-semibold tabular-nums">42</h2>;`,
				},
			],
			invalid: [],
		});
	});

	it("does NOT flag a heading with font-[700] (not font-[600] — incomplete combo)", () => {
		tester.run("no-handrolled-page-header", noHandrolledPageHeader, {
			valid: [
				{
					filename: PAGES_FILENAME,
					code: `const H = () => <p className="text-[20px] font-[700] tracking-[-0.01em]">Brand</p>;`,
				},
			],
			invalid: [],
		});
	});

	// ---- VALID: combo on <PageHeader> element itself does NOT trip the rule ----

	it("does NOT flag the combo on a <PageHeader> JSX element", () => {
		tester.run("no-handrolled-page-header", noHandrolledPageHeader, {
			valid: [
				{
					filename: PAGES_FILENAME,
					// PageHeader's own usage is via its exported const — not a direct class string here,
					// but even if a title node is passed inline, the rule must not flag <PageHeader> usages.
					// (The rule targets non-PageHeader elements.)
					code: `
import { PageHeader } from "@hyperidle/design-system";
const I = () => <PageHeader title="Portfolio" actions={<button type="button">New</button>} />;`,
				},
			],
			invalid: [],
		});
	});

	// ---- VALID: files outside pages/** are not in scope ----

	it("does NOT flag the combo in a non-pages web/src file", () => {
		tester.run("no-handrolled-page-header", noHandrolledPageHeader, {
			valid: [
				{
					filename: COMPONENTS_FILENAME,
					code: `const J = () => <div className="text-[20px] font-[600] tracking-[-0.01em]">text</div>;`,
				},
			],
			invalid: [],
		});
	});
});
