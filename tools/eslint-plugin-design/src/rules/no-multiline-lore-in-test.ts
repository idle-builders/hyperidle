/**
 * design/no-multiline-lore-in-test
 *
 * Founder ruling: `@lore` is allowed in test files, but each note is one
 * short line, present-tense, no history, and names no planning id — a track
 * letter, a work-item id, or a task id (`T-abc123`) names a document that
 * moves or disappears; the constraint the lore records does not. (Production
 * files are a separate rule/task — this one is scoped to test files only.)
 *
 * ESLint hands every `//` line its own Comment node — a real multi-line
 * `//`-style lore note is several ADJACENT nodes, not one. `groupComments`
 * merges consecutive same-column Line comments into one unit first (a Block
 * comment is already one unit); `splitIntoParagraphs` then finds the `@lore`
 * paragraph inside it. A line starting with the literal word "@lore" only
 * begins a NEW paragraph when the previous line ends with terminal
 * punctuation (or there is no previous line) — a wrapped sentence can land
 * that word at the start of a continuation line ("...conflation that\n@lore
 * AE4 documents.") without declaring a new note, and that must stay a
 * continuation, not a false paragraph break.
 */

import type { Rule } from "eslint";
import type { Comment } from "estree";
import { createRule } from "../util.js";

const PLANNING_ID = /\b(?:[A-Z]{1,3}\d{1,3}[a-z]?(?:-[A-Z]?\d+[a-z]?)?|T-[0-9a-z]{6})\b/;
const HISTORY_WORDS =
	/\b(?:previously|replaced|used to|no longer|deleted|removed|moved|renamed|Increment|Wave)\b/i;
const MAX_LORE_LENGTH = 160;

function stripCommentMarker(line: string): string {
	return line
		.replace(/^[ \t]*\*\/?[ \t]?/, "")
		.replace(/^[ \t]*\/\/[ \t]?/, "")
		.trimEnd();
}

function endsAParagraph(line: string): boolean {
	const trimmed = line.trim();
	if (trimmed.length === 0) return true;
	if (/^[-=]+$/.test(trimmed)) return true; // a decorative separator line
	return /[.!?]$/.test(trimmed);
}

interface Paragraph {
	readonly lines: readonly string[];
	readonly startOffsetInUnit: number;
}

function splitIntoParagraphs(contentLines: readonly string[]): Paragraph[] {
	const paragraphs: Paragraph[] = [];
	let current: string[] = [];
	let startOffset = 0;
	for (let i = 0; i < contentLines.length; i++) {
		const line = contentLines[i] ?? "";
		const isBlank = line.trim().length === 0;
		const startsNewLoreTag =
			/^@lore\b/.test(line.trim()) &&
			current.length > 0 &&
			endsAParagraph(current[current.length - 1] ?? "");
		if (isBlank || startsNewLoreTag) {
			if (current.length > 0) paragraphs.push({ lines: current, startOffsetInUnit: startOffset });
			current = [];
			if (startsNewLoreTag) {
				current = [line];
				startOffset = i;
			}
		} else {
			if (current.length === 0) startOffset = i;
			current.push(line);
		}
	}
	if (current.length > 0) paragraphs.push({ lines: current, startOffsetInUnit: startOffset });
	return paragraphs;
}

interface CommentUnit {
	readonly contentLines: readonly string[];
	readonly startLine: number;
}

/** Merges a Block comment (already one unit) or a run of adjacent, same-column Line comments into one unit. */
function groupComments(list: readonly Comment[]): CommentUnit[] {
	const units: CommentUnit[] = [];
	let i = 0;
	while (i < list.length) {
		const c = list[i];
		if (!c?.loc) {
			i++;
			continue;
		}
		if (c.type === "Block") {
			units.push({
				contentLines: c.value.split("\n").map(stripCommentMarker),
				startLine: c.loc.start.line,
			});
			i++;
			continue;
		}
		// Line comment: gather the run of adjacent same-column Line comments.
		const lines: string[] = [stripCommentMarker(c.value)];
		const startLine = c.loc.start.line;
		let lastLine = c.loc.start.line;
		const column = c.loc.start.column;
		let j = i + 1;
		while (j < list.length) {
			const next = list[j];
			if (
				next?.type === "Line" &&
				next.loc &&
				next.loc.start.line === lastLine + 1 &&
				next.loc.start.column === column
			) {
				lines.push(stripCommentMarker(next.value));
				lastLine = next.loc.start.line;
				j++;
			} else {
				break;
			}
		}
		units.push({ contentLines: lines, startLine });
		i = j;
	}
	return units;
}

type Reporter = Rule.RuleContext["report"];

/** Checks one lore paragraph and reports the first violation it finds, if any. */
function checkLoreParagraph(paragraph: Paragraph, unitStartLine: number, report: Reporter): void {
	const first = paragraph.lines[0] ?? "";
	if (!/^@lore\b/.test(first.trim())) return;
	const startLine = unitStartLine + paragraph.startOffsetInUnit;
	const loc = { start: { line: startLine, column: 0 }, end: { line: startLine, column: 0 } };
	if (paragraph.lines.length > 1) {
		report({ loc, messageId: "multiline", data: { lines: String(paragraph.lines.length) } });
		return;
	}
	const text = paragraph.lines[0] ?? "";
	if (text.length > MAX_LORE_LENGTH) {
		report({
			loc,
			messageId: "tooLong",
			data: { max: String(MAX_LORE_LENGTH), length: String(text.length) },
		});
		return;
	}
	if (PLANNING_ID.test(text)) {
		report({ loc, messageId: "planningId" });
		return;
	}
	const historyMatch = HISTORY_WORDS.exec(text);
	if (historyMatch) {
		report({ loc, messageId: "history", data: { word: historyMatch[0] } });
	}
}

export const noMultilineLoreInTest: Rule.RuleModule = createRule({
	meta: {
		type: "problem",
		docs: {
			description:
				"An @lore comment in a test file must be one short line, present-tense, with no planning id.",
		},
		schema: [],
		messages: {
			multiline: "@lore in a test file must be one line — this one spans {{lines}}.",
			tooLong: "@lore in a test file must be short (≤{{max}} chars) — this one is {{length}}.",
			planningId:
				"@lore in a test file must name no planning id (a track letter, work-item id, or task id) — the constraint outlives the document that named it.",
			history:
				"@lore in a test file states the present constraint, not its history — drop the change narrative ({{word}}).",
		},
	},
	create(context) {
		return {
			Program(): void {
				const comments = context.sourceCode.getAllComments();
				const units = groupComments(comments);
				for (const unit of units) {
					for (const paragraph of splitIntoParagraphs(unit.contentLines)) {
						checkLoreParagraph(paragraph, unit.startLine, context.report.bind(context));
					}
				}
			},
		};
	},
});
