/**
 * `design/no-local-status-builder` flags a page-local status→color or status→label builder in
 * `layers/core-ui/src`: *BadgeClass/*BadgeStyle/*BadgeVariant functions, and *_LABEL object literals
 * (STATE_LABEL, STATUS_LABEL, etc.) — scoped to core-ui only, so the real label registries in
 * framework/domain-model are never flagged.
 */

import tsParser from "@typescript-eslint/parser";
import { RuleTester } from "eslint";
import { describe, it } from "vitest";
import { noLocalStatusBuilder } from "../rules/no-local-status-builder.js";

// RuleTester with TypeScript support (mirrors existing fixture test pattern)
const tester = new RuleTester({
	languageOptions: {
		parser: tsParser,
		parserOptions: { ecmaFeatures: { jsx: true } },
	},
});

// The web package path that triggers the rule
const WEB_FILENAME = "/repo/layers/core-ui/src/pages/WorkBet.tsx";
// The substrate package path that should NOT trigger the rule
const SHARED_FILENAME = "/repo/framework/domain-model/src/types.ts";
// A design-system path that should NOT trigger the rule
const DS_FILENAME = "/repo/framework/design-system/src/status-mapping.ts";

describe("design/no-local-status-builder rule", () => {
	it("reports *BadgeClass functions in layers/core-ui/src", () => {
		tester.run("no-local-status-builder", noLocalStatusBuilder, {
			valid: [],
			invalid: [
				{
					// A function matching the *BadgeClass pattern — the WorkBet fork shape
					filename: WEB_FILENAME,
					code: `
function taskStateBadgeClass(state: string): string {
  if (state === "in_progress") return "bg-[rgba(22,118,79,0.08)]";
  return "bg-gray-100";
}
`,
					errors: [{ messageId: "localStatusBuilder" }],
				},
			],
		});
	});

	it("reports *BadgeStyle functions in layers/core-ui/src", () => {
		tester.run("no-local-status-builder", noLocalStatusBuilder, {
			valid: [],
			invalid: [
				{
					filename: WEB_FILENAME,
					code: `
function statusBadgeStyle(status: string): object | null {
  if (status === "active") return { backgroundColor: "green" };
  return null;
}
`,
					errors: [{ messageId: "localStatusBuilder" }],
				},
			],
		});
	});

	it("reports const arrow function matching *BadgeClass in layers/core-ui/src", () => {
		tester.run("no-local-status-builder", noLocalStatusBuilder, {
			valid: [],
			invalid: [
				{
					filename: WEB_FILENAME,
					code: `const kindBadgeStyle = (kind: string) => kind === "active" ? "green" : "gray";`,
					errors: [{ messageId: "localStatusBuilder" }],
				},
			],
		});
	});

	it("reports *_STATE_LABEL object literals in layers/core-ui/src", () => {
		tester.run("no-local-status-builder", noLocalStatusBuilder, {
			valid: [],
			invalid: [
				{
					filename: WEB_FILENAME,
					code: `
const TASK_STATE_LABEL: Record<string, string> = {
  proposed: "Planned",
  in_progress: "In progress",
};
`,
					errors: [{ messageId: "localStatusBuilder" }],
				},
			],
		});
	});

	it("reports *_STATUS_LABEL object literals in layers/core-ui/src", () => {
		tester.run("no-local-status-builder", noLocalStatusBuilder, {
			valid: [],
			invalid: [
				{
					filename: WEB_FILENAME,
					code: `const TASK_STATUS_LABEL = { in_progress: "In progress", done: "Done" };`,
					errors: [{ messageId: "localStatusBuilder" }],
				},
			],
		});
	});

	it("reports *_VERDICT_LABEL object literals in layers/core-ui/src", () => {
		tester.run("no-local-status-builder", noLocalStatusBuilder, {
			valid: [],
			invalid: [
				{
					filename: WEB_FILENAME,
					code: `const BET_VERDICT_LABEL = { validated: "Validated", refuted: "Refuted" };`,
					errors: [{ messageId: "localStatusBuilder" }],
				},
			],
		});
	});

	it("reports *_TYPE_LABEL object literals in layers/core-ui/src", () => {
		tester.run("no-local-status-builder", noLocalStatusBuilder, {
			valid: [],
			invalid: [
				{
					filename: WEB_FILENAME,
					code: `const TYPE_LABELS: Record<string, string> = { review_request: "REVIEW" };`,
					errors: [{ messageId: "localStatusBuilder" }],
				},
			],
		});
	});

	it("does NOT report a presentational helper named panelClass (negative case)", () => {
		tester.run("no-local-status-builder", noLocalStatusBuilder, {
			valid: [
				{
					// panelClass is NOT a status-builder pattern
					filename: WEB_FILENAME,
					code: `const panelClass = (open: boolean) => open ? "block" : "hidden";`,
				},
			],
			invalid: [],
		});
	});

	it("does NOT report *_LABEL defined in framework/domain-model (negative case — legitimate home)", () => {
		tester.run("no-local-status-builder", noLocalStatusBuilder, {
			valid: [
				{
					// TASK_STATE_LABEL in domain-model is the LEGITIMATE registry — must not flag
					filename: SHARED_FILENAME,
					code: `export const TASK_STATE_LABEL: Record<string, string> = { proposed: "Planned" };`,
				},
			],
			invalid: [],
		});
	});

	it("does NOT report mappings in framework/design-system (legitimate home)", () => {
		tester.run("no-local-status-builder", noLocalStatusBuilder, {
			valid: [
				{
					filename: DS_FILENAME,
					code: `
export function taskStateBadgeClass(state: string): string {
  return state === "active" ? "green" : "gray";
}
`,
				},
			],
			invalid: [],
		});
	});

	it("does NOT report a local variable named statusText (just displaying, not building the map)", () => {
		tester.run("no-local-status-builder", noLocalStatusBuilder, {
			valid: [
				{
					filename: WEB_FILENAME,
					// Consuming a label from a registry is fine; building the map is not
					code: `
import { TASK_STATE_LABEL } from "@hyperidle/domain-model";
const statusText = TASK_STATE_LABEL[task.state];
`,
				},
			],
			invalid: [],
		});
	});
});
