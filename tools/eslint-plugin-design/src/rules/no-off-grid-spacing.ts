/**
 * design/no-off-grid-spacing
 *
 * AZ15 enforces the numeric Hearth vocabulary for authored composition:
 * {0,3,6,9,12,18,24,36,48}px. Relationship semantics remain review guidance
 * with ranges, not a mechanically prescribed endpoint.
 *
 * Padding/control internals, fixed geometry, negative overlap, canvas
 * coordinates and subject-authored content are deliberately outside this
 * predicate. This prevents the rule from becoming a second owner for AZ7
 * control internals or AZ11 page geometry.
 */

import type { Rule } from "eslint";
import type { JSXAttribute } from "estree-jsx";
import {
	asReportNode,
	collectClassStringsFromJSXAttributeDeep,
	createConstIdentifierResolver,
	createRule,
	SPACING_ALLOWLIST,
} from "../util.js";

const COMPOSITION_CLASS = /^(gap(?:-[xy])?|space-[xy]|m[trblxy]?)-(.+)$/;
const TOKEN_VALUE = /^\[var\(--space-(?:1|2|3|4|6|8|12|16)\)\]$/;
const ARBITRARY_PX = /^\[(\d+(?:\.\d+)?)px\]$/;
const GEOMETRY_VALUE = /^(?:auto|full|screen|min|max|fit|px|\[.*(?:%|vw|vh|calc\().*\])$/;

function stripVariants(raw: string): string {
	let token = raw;
	while (/^[^:[\]]+:/.test(token)) token = token.replace(/^[^:[\]]+:/, "");
	return token;
}

function spacingPixels(value: string): number | null {
	const arbitrary = ARBITRARY_PX.exec(value);
	if (arbitrary) return Number(arbitrary[1]);
	if (value === "px") return 1;
	if (/^\d+(?:\.\d+)?$/.test(value)) return Number(value) * 4;
	return null;
}

function isIntrinsicControl(attr: JSXAttribute): boolean {
	const opening = (attr as JSXAttribute & { parent?: { name?: { type?: string; name?: string } } })
		.parent;
	const name = opening?.name;
	return (
		name?.type === "JSXIdentifier" &&
		(name.name === "button" ||
			name.name === "input" ||
			name.name === "select" ||
			name.name === "textarea")
	);
}

function isCompactPill(allClasses: string): boolean {
	return (
		/\binline-flex\b/.test(allClasses) &&
		/\brounded-/.test(allClasses) &&
		/\bp[xy]-/.test(allClasses)
	);
}

function isOpticalMargin(allClasses: string): boolean {
	return (
		/\b(?:h|w)-\[[^\]]+\]/.test(allClasses) && /\b(?:shrink-0|absolute|relative)\b/.test(allClasses)
	);
}

export const noOffGridSpacing: Rule.RuleModule = createRule({
	meta: {
		type: "problem",
		docs: {
			description:
				"Require authored composition gaps and margins to use the numeric Hearth spacing vocabulary.",
			recommended: true,
		},
		schema: [],
		messages: {
			offGrid:
				"Composition class '{{cls}}' resolves to {{n}}px outside the Hearth spacing vocabulary {0,3,6,9,12,18,24,36,48}px. Use an existing vocabulary value appropriate to the relationship.",
		},
	},
	create(context) {
		const resolveIdentifier = createConstIdentifierResolver(context);
		return {
			JSXAttribute(rawNode: unknown) {
				const node = rawNode as JSXAttribute;
				const name =
					node.type === "JSXAttribute" && node.name.type === "JSXIdentifier"
						? node.name.name
						: null;
				if (name !== "className") return;

				const strings = collectClassStringsFromJSXAttributeDeep(node, resolveIdentifier);
				const allClasses = strings.map(({ text }) => text).join(" ");
				const intrinsicControl = isIntrinsicControl(node);
				const compactPill = isCompactPill(allClasses);
				const reported = new Set<string>();

				for (const { text, node: stringNode } of strings) {
					for (const raw of text.split(/\s+/).filter(Boolean)) {
						if (raw.startsWith("-")) continue;
						const token = stripVariants(raw);
						const match = COMPOSITION_CLASS.exec(token);
						if (!match) continue;
						const [, property, value] = match;
						if (!property || !value) continue;
						if (TOKEN_VALUE.test(value) || GEOMETRY_VALUE.test(value)) continue;
						if (
							property.startsWith("gap") &&
							((intrinsicControl && /\binline-flex\b/.test(allClasses)) || compactPill)
						)
							continue;
						if (property.startsWith("m") && isOpticalMargin(allClasses)) continue;

						const pixels = spacingPixels(value);
						if (pixels !== null && /^m(?:l|r|x)$/.test(property) && pixels > 48) continue;
						if (
							pixels !== null &&
							pixels <= 2 &&
							property.startsWith("m") &&
							/\bshrink-0\b/.test(allClasses)
						)
							continue;
						if (pixels !== null && !SPACING_ALLOWLIST.has(pixels)) {
							const findingKey = `${stringNode.loc?.start.line ?? 0}:${stringNode.loc?.start.column ?? 0}:${token}`;
							if (reported.has(findingKey)) continue;
							reported.add(findingKey);
							context.report({
								node: asReportNode(stringNode),
								messageId: "offGrid",
								data: { cls: token, n: String(pixels) },
							});
						}
					}
				}
			},
		};
	},
});
