/**
 * AZ2 — ESLint rule `design/no-handrolled-page-scaffold` tests (red phase).
 *
 * AC5 / VS3: flags a page under `layers/core-ui/src/pages/**` that hand-writes
 * a scrolling body instead of calling `<PageScaffold>`.
 *
 * Two arms:
 *   Arm 1 — a class string combining a grow token (`flex-1`) with a vertical
 *           scroll overflow (`overflow-y-auto`, `overflow-auto`,
 *           `overflow-y-scroll`). Only `<PageScaffold>` may declare a
 *           scrolling page body.
 *   Arm 2 — a class string combining `flex-1` with `overflow-hidden`
 *           **without** `flex-col` — the exact WorkTeam.tsx:709 shape (a block
 *           wrapper that clips and gives its child nothing to size against).
 *
 * Each arm gets an invalid case AND a control twin (`tools/governance/README.md`
 * §113-120 discipline) — the same intent written the legal way, asserting
 * nothing is reported. A detector that flags everything is worthless without one.
 */

import tsParser from "@typescript-eslint/parser";
import { RuleTester } from "eslint";
import { describe, it } from "vitest";

// This import fails until the rule is created.
import { noHandrolledPageScaffold } from "../rules/no-handrolled-page-scaffold.js";

const tester = new RuleTester({
	languageOptions: {
		parser: tsParser,
		parserOptions: { ecmaFeatures: { jsx: true } },
	},
});

const PAGES_FILENAME = "/repo/layers/core-ui/src/pages/SomePage.tsx";
const NON_PAGES_FILENAME = "/repo/layers/core-ui/src/components/SomeComponent.tsx";

describe("design/no-handrolled-page-scaffold rule (AZ2 AC5)", () => {
	// ---- ARM 1: flex-1 + a scroll overflow — invalid ----

	it("flags flex-1 + overflow-y-auto on a hand-written page body", () => {
		tester.run("no-handrolled-page-scaffold", noHandrolledPageScaffold, {
			valid: [],
			invalid: [
				{
					filename: PAGES_FILENAME,
					code: `const A = () => <div className="flex-1 overflow-y-auto">content</div>;`,
					errors: [{ messageId: "handrolledScrollBody" }],
				},
			],
		});
	});

	it("flags flex-1 + overflow-auto (the ReviewComposition spelling)", () => {
		tester.run("no-handrolled-page-scaffold", noHandrolledPageScaffold, {
			valid: [],
			invalid: [
				{
					filename: PAGES_FILENAME,
					code: `const B = () => <div className="min-h-0 flex-1 overflow-auto">content</div>;`,
					errors: [{ messageId: "handrolledScrollBody" }],
				},
			],
		});
	});

	it("flags flex-1 + overflow-y-scroll", () => {
		tester.run("no-handrolled-page-scaffold", noHandrolledPageScaffold, {
			valid: [],
			invalid: [
				{
					filename: PAGES_FILENAME,
					code: `const C = () => <div className="flex-1 overflow-y-scroll">content</div>;`,
					errors: [{ messageId: "handrolledScrollBody" }],
				},
			],
		});
	});

	// ---- ARM 1: control twins — the same intent written the legal way ----

	it("does NOT flag flex-1 alone (no scroll overflow — not the combo)", () => {
		tester.run("no-handrolled-page-scaffold", noHandrolledPageScaffold, {
			valid: [
				{
					filename: PAGES_FILENAME,
					code: `const S1 = () => <div className="flex-1 items-center justify-center">content</div>;`,
				},
			],
			invalid: [],
		});
	});

	it("does NOT flag overflow-y-auto alone (no flex-1 — not the combo)", () => {
		tester.run("no-handrolled-page-scaffold", noHandrolledPageScaffold, {
			valid: [
				{
					filename: PAGES_FILENAME,
					code: `const S2 = () => <div className="overflow-y-auto max-h-[200px]">content</div>;`,
				},
			],
			invalid: [],
		});
	});

	it("does NOT flag flex-1 + overflow-x-auto (horizontal scroll — not a vertical scroll overflow)", () => {
		tester.run("no-handrolled-page-scaffold", noHandrolledPageScaffold, {
			valid: [
				{
					filename: PAGES_FILENAME,
					code: `const S3 = () => <div className="flex-1 overflow-x-auto">content</div>;`,
				},
			],
			invalid: [],
		});
	});

	it("does NOT flag flex-1 + overflow-y-auto inside PageScaffold.tsx (design-system, out of scope)", () => {
		tester.run("no-handrolled-page-scaffold", noHandrolledPageScaffold, {
			valid: [
				{
					filename: "/repo/framework/design-system/src/PageScaffold.tsx",
					code: `const S = () => <div className="flex-1 overflow-y-auto" data-page-scroll="">content</div>;`,
				},
			],
			invalid: [],
		});
	});

	// ---- ARM 2: flex-1 + overflow-hidden WITHOUT flex-col — invalid ----

	it("flags flex-1 + overflow-hidden without flex-col (the WorkTeam.tsx:709 shape)", () => {
		tester.run("no-handrolled-page-scaffold", noHandrolledPageScaffold, {
			valid: [],
			invalid: [
				{
					filename: PAGES_FILENAME,
					code: `const D = () => <div className="flex-1 overflow-hidden">{child}</div>;`,
					errors: [{ messageId: "handrolledManagedBody" }],
				},
			],
		});
	});

	// ---- ARM 2: control twin — flex-1 + overflow-hidden + flex-col is a legal shape ----

	it("does NOT flag flex-1 + overflow-hidden WITH flex-col (a bounded flex column, the managed shape)", () => {
		tester.run("no-handrolled-page-scaffold", noHandrolledPageScaffold, {
			valid: [
				{
					filename: PAGES_FILENAME,
					code: `const E = () => <div className="flex-1 min-h-0 flex flex-col overflow-hidden">{child}</div>;`,
				},
			],
			invalid: [],
		});
	});

	it("does NOT flag overflow-hidden alone (no flex-1 — not the combo)", () => {
		tester.run("no-handrolled-page-scaffold", noHandrolledPageScaffold, {
			valid: [
				{
					filename: PAGES_FILENAME,
					code: `const E2 = () => <div className="overflow-hidden rounded-[var(--r-default)]">{child}</div>;`,
				},
			],
			invalid: [],
		});
	});

	// ---- Scope: files outside pages/** are not in scope ----

	it("does NOT flag flex-1 + overflow-y-auto outside layers/core-ui/src/pages/**", () => {
		tester.run("no-handrolled-page-scaffold", noHandrolledPageScaffold, {
			valid: [
				{
					filename: NON_PAGES_FILENAME,
					code: `const F = () => <div className="flex-1 overflow-y-auto">content</div>;`,
				},
			],
			invalid: [],
		});
	});

	// ---- Honest limit: literal strings only, matching no-handrolled-page-header's own limit ----

	it("does NOT flag a dynamic className (cx()/template identifier) it cannot statically read", () => {
		tester.run("no-handrolled-page-scaffold", noHandrolledPageScaffold, {
			valid: [
				{
					filename: PAGES_FILENAME,
					code: `
const cls = someCondition ? "flex-1 overflow-y-auto" : "flex-1";
const G = () => <div className={cls}>content</div>;`,
				},
			],
			invalid: [],
		});
	});
});
