/**
 * design/no-mock-data-symbol
 *
 * Forbids top-level declarations whose names match the closed forbidden-prefix
 * set in the policy doc. Also catches DEFAULT_* symbols when the file path or
 * symbol name suffix indicates a data-provider context.
 *
 * Architecture ref: M1 architecture.md § Phase B, File 3
 * Architecture-critique Important #1: numeric literal constants (DEFAULT_LOCAL_MS = 5_000,
 *   DEFAULT_LIMIT = 50) are NOT mock data — they are config. If the init value is a numeric
 *   literal (including underscore-separated: 5_000), the DEFAULT_* rule does not fire.
 *
 * Detection:
 *   VariableDeclaration (const/let) at top-level, or ExportNamedDeclaration wrapping one.
 *   Symbol name starts with any FORBIDDEN_PREFIXES entry → report.
 *   Symbol name starts with DEFAULT_ →
 *     - If init value is a numeric literal → NOT flagged (config, not mock data).
 *     - If file path contains any DEFAULT_PREFIX_DATA_PATHS fragment → flagged.
 *     - If symbol name ends with any DEFAULT_SUFFIX_TRIGGERS entry → flagged.
 *
 * Permitted surface (file is NOT flagged when):
 *   - Path contains /__fixtures__/, /__tests__/, /e2e/
 *   - File suffix is .test.ts, .test.tsx, .spec.ts, .spec.tsx, .stories.tsx
 *   - File basename starts with "seed"
 */

import { basename } from "node:path";
import type { Rule } from "eslint";
import type { VariableDeclarator } from "estree";
import {
	DEFAULT_PREFIX_DATA_PATHS,
	DEFAULT_SUFFIX_TRIGGERS,
	FORBIDDEN_PREFIXES,
	PERMITTED_SURFACE_PATH_FRAGMENTS,
	PERMITTED_SURFACE_SUFFIXES,
	POLICY_DOC_URL,
	SEED_FILE_BASENAME_PREFIX,
} from "../mock-data-policy.js";
import { createRule } from "../util.js";

type AnyNode = { type: string; [k: string]: unknown };

function isPermittedSurfaceFile(filename: string): boolean {
	if (PERMITTED_SURFACE_PATH_FRAGMENTS.some((f) => filename.includes(f))) return true;
	if (PERMITTED_SURFACE_SUFFIXES.some((s) => filename.endsWith(s))) return true;
	const base = basename(filename);
	if (base.startsWith(SEED_FILE_BASENAME_PREFIX)) return true;
	return false;
}

/**
 * Returns true if the AST init node is a plain numeric literal
 * (e.g. `5_000`, `50`, `30000`). These are config constants, not mock data.
 *
 * @lore M1: Covers numeric literals with numeric separators (5_000).
 * ESLint represents these as `Literal` nodes with a numeric `value`.
 * UnaryExpression with `-` wrapping a numeric literal is also a common pattern
 * for negative defaults — excluded from flagging too.
 */
function isNumericLiteralInit(init: unknown): boolean {
	if (!init || typeof init !== "object") return false;
	const node = init as AnyNode;
	if (node.type === "Literal" && typeof node.value === "number") return true;
	// Handle negative numeric literals: -5_000
	if (
		node.type === "UnaryExpression" &&
		(node.operator as string) === "-" &&
		node.argument &&
		typeof (node.argument as AnyNode).type === "string" &&
		(node.argument as AnyNode).type === "Literal" &&
		typeof (node.argument as { value?: unknown }).value === "number"
	) {
		return true;
	}
	return false;
}

function getForbiddenPrefix(symbolName: string): string | null {
	for (const prefix of FORBIDDEN_PREFIXES) {
		if (symbolName.startsWith(prefix)) return prefix;
	}
	return null;
}

function isDefaultForbidden(symbolName: string, filename: string, init: unknown): boolean {
	if (!symbolName.startsWith("DEFAULT_")) return false;
	// Numeric literal init → config constant, not mock data.
	if (isNumericLiteralInit(init)) return false;
	// Path-based check: file is in a data-provider location.
	if (DEFAULT_PREFIX_DATA_PATHS.some((f) => filename.includes(f))) return true;
	// Suffix-based check: symbol name ends with a known data-shape suffix.
	const upper = symbolName.toUpperCase();
	if (DEFAULT_SUFFIX_TRIGGERS.some((s) => upper.endsWith(s))) return true;
	return false;
}

/**
 * Checks a single declarator and reports if it violates the policy.
 */
function checkDeclarator(
	context: Rule.RuleContext,
	filename: string,
	declarator: VariableDeclarator,
): void {
	const id = declarator.id;
	if (id.type !== "Identifier") return;
	const symbolName: string = id.name;
	const init = declarator.init;

	// Check forbidden prefixes (unconditional).
	const prefix = getForbiddenPrefix(symbolName);
	if (prefix) {
		context.report({
			node: declarator as Rule.Node,
			messageId: "mockDataSymbol",
			data: {
				url: POLICY_DOC_URL,
			},
		});
		return;
	}

	// Check DEFAULT_* with disambiguation.
	if (isDefaultForbidden(symbolName, filename, init)) {
		context.report({
			node: declarator as Rule.Node,
			messageId: "mockDataSymbol",
			data: {
				url: POLICY_DOC_URL,
			},
		});
	}
}

export const noMockDataSymbol: Rule.RuleModule = createRule({
	meta: {
		type: "problem",
		docs: {
			description:
				"Forbid top-level declarations with mock-data prefixes (MOCK_*, FAKE_*, STUB_*, etc.) in runtime production code. Also catches DEFAULT_* when used as a data-provider fallback.",
			recommended: true,
			url: POLICY_DOC_URL,
		},
		schema: [],
		messages: {
			mockDataSymbol:
				"Symbol has a forbidden mock-data prefix. Move it to __fixtures__/, a *.test.ts file, or a *.stories.tsx file. See: {{url}}",
		},
	},
	create(context) {
		const filename = context.filename;
		if (isPermittedSurfaceFile(filename)) return {};

		return {
			VariableDeclaration(node) {
				// Only top-level declarations (program body, export wrapper).
				// Rule.Node carries a parent property (NodeParentExtension) — access via
				// the typed Rule.Node to avoid AnyNode casts.
				const ruleNode = node as Rule.Node;
				const parent = (ruleNode as { parent?: { type?: string } }).parent;
				if (!parent) return;
				// Accept: Program > VariableDeclaration
				// Accept: ExportNamedDeclaration > VariableDeclaration
				const parentType = parent.type;
				if (parentType !== "Program" && parentType !== "ExportNamedDeclaration") return;

				// node.declarations is VariableDeclarator[] per estree — no cast needed.
				for (const declarator of node.declarations) {
					checkDeclarator(context, filename, declarator);
				}
			},
		};
	},
});
