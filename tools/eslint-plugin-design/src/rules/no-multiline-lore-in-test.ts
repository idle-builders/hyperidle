/**
 * design/no-multiline-lore-in-test
 *
 * Founder ruling: `@lore` is allowed in test files, but each note is one
 * line and carries no planning id — a track letter, a work-item id, or a
 * task id (`T-abc123`) names a document that moves or disappears; the
 * constraint the lore records does not. (Production files are a separate
 * rule/task — this one is scoped to test files only.)
 *
 * A comment is scanned paragraph by paragraph: consecutive non-blank
 * comment lines are one paragraph, split on a blank line or a new `@lore`
 * tag. A paragraph whose first line starts with `@lore` is checked; if the
 * paragraph has more than one line, or any line in it names a planning id,
 * it is flagged once, at the paragraph's first line.
 */

import type { Rule } from "eslint";
import { createRule } from "../util.js";

const PLANNING_ID = /\b(?:[A-Z]{1,3}\d{1,3}[a-z]?(?:-[A-Z]?\d+[a-z]?)?|T-[0-9a-z]{6})\b/;

function stripCommentMarker(line: string): string {
	return line
		.replace(/^[ \t]*\*\/?[ \t]?/, "")
		.replace(/^[ \t]*\/\/[ \t]?/, "")
		.trimEnd();
}

interface Paragraph {
	readonly lines: readonly string[];
	readonly startOffsetInUnit: number;
}

function splitIntoParagraphs(contentLines: readonly string[]): Paragraph[] {
	// A paragraph is a run of non-blank comment lines between blank-line breaks
	// — never split mid-paragraph on a bare "@lore" TOKEN, since a wrapped
	// sentence can legitimately land that word at the start of a continuation
	// line ("...conflation that\n@lore AE4 documents.") without declaring a
	// new lore note. Only a paragraph whose OWN first line starts with
	// "@lore" (i.e. immediately after a blank line, or at the top of the
	// comment) is a real lore paragraph.
	const paragraphs: Paragraph[] = [];
	let current: string[] = [];
	let startOffset = 0;
	for (let i = 0; i < contentLines.length; i++) {
		const line = contentLines[i] ?? "";
		const isBlank = line.trim().length === 0;
		if (isBlank) {
			if (current.length > 0) {
				paragraphs.push({ lines: current, startOffsetInUnit: startOffset });
			}
			current = [];
		} else {
			if (current.length === 0) startOffset = i;
			current.push(line);
		}
	}
	if (current.length > 0) paragraphs.push({ lines: current, startOffsetInUnit: startOffset });
	return paragraphs;
}

export const noMultilineLoreInTest: Rule.RuleModule = createRule({
	meta: {
		type: "problem",
		docs: {
			description: "An @lore comment in a test file must be one line and name no planning id.",
		},
		schema: [],
		messages: {
			multiline: "@lore in a test file must be one line — this one spans {{lines}}.",
			planningId:
				"@lore in a test file must name no planning id (a track letter, work-item id, or task id) — the constraint outlives the document that named it.",
		},
	},
	create(context) {
		return {
			Program(): void {
				const comments = context.sourceCode.getAllComments();
				for (const comment of comments) {
					if (!comment.loc) continue;
					const rawLines = comment.value.split("\n").map(stripCommentMarker);
					const paragraphs = splitIntoParagraphs(rawLines);
					for (const paragraph of paragraphs) {
						const first = paragraph.lines[0] ?? "";
						if (!/^@lore\b/.test(first.trim())) continue;
						const startLine = comment.loc.start.line + paragraph.startOffsetInUnit;
						const loc = {
							start: { line: startLine, column: 0 },
							end: { line: startLine, column: 0 },
						};
						if (paragraph.lines.length > 1) {
							context.report({
								loc,
								messageId: "multiline",
								data: { lines: String(paragraph.lines.length) },
							});
							continue;
						}
						if (paragraph.lines.some((l) => PLANNING_ID.test(l))) {
							context.report({ loc, messageId: "planningId" });
						}
					}
				}
			},
		};
	},
});
