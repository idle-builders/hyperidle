/**
 * design/no-planning-id-in-test
 *
 * A test file name or a `describe`/`test`/`it` title must say the behavior, not
 * cite the plan that asked for it (.claude/rules/testing.md § Structure: "No
 * planning labels (track letters, work-item ids)"). A track/work-item id
 * (`AG4`, `AM5-T8`, `BA9b`, a task id `T-abc123`) points at a document that
 * moves or disappears; the behavior it names does not.
 *
 * Detection is anchored to the START of the filename (minus its test suffix)
 * or the START of a title string — a planning id shows up as a prefix
 * ("AG4 — parentPathFor", "AM5-T8-block-anchor.test.ts"), never buried mid
 * sentence, so anchoring avoids flagging ordinary prose that happens to
 * contain a letter+digit pair (e.g. "a11y", "oauth2" — lowercase, not matched;
 * a capitalized id only fires at position zero).
 */

import { basename } from "node:path";
import type { Rule } from "eslint";
import { createRule } from "../util.js";

const TEST_SUFFIX = /\.(test|spec)\.tsx?$/;

// One or two uppercase letters + 1-3 digits + optional lowercase suffix letter,
// optionally followed by a second `-<letter?><digits>` segment (AM5-T8) — or a
// task id (T-<6 lowercase alnum>).
const PLANNING_ID = /^(?:[A-Z]{1,2}\d{1,3}[a-z]?(?:-[A-Z]?\d+[a-z]?)?|T-[0-9a-z]{6})\b/;

function startsWithPlanningId(text: string): boolean {
	return PLANNING_ID.test(text);
}

export const noPlanningIdInTest: Rule.RuleModule = createRule({
	meta: {
		type: "problem",
		docs: {
			description:
				"Forbid a track/work-item id as the file name or as the start of a describe/test/it title.",
		},
		schema: [],
		messages: {
			filename:
				"Test file name '{{name}}' starts with a planning id. Name the file after the behavior it tests, not the workpackage that asked for it.",
			title:
				"Title '{{title}}' starts with a planning id. Say the behavior — planning labels stay inside .pipeline/ (testing.md § Structure).",
		},
	},
	create(context) {
		const filename = context.filename;
		const base = basename(filename).replace(TEST_SUFFIX, "");
		return {
			Program(node) {
				if (startsWithPlanningId(base)) {
					context.report({ node, messageId: "filename", data: { name: basename(filename) } });
				}
			},
			CallExpression(node) {
				const callee = node.callee;
				if (callee.type !== "Identifier") return;
				if (!["describe", "test", "it"].includes(callee.name)) return;
				const first = node.arguments[0];
				if (!first || first.type !== "Literal" || typeof first.value !== "string") return;
				if (startsWithPlanningId(first.value)) {
					context.report({ node: first, messageId: "title", data: { title: first.value } });
				}
			},
		};
	},
});
