/**
 * design/no-mock-data-import
 *
 * Forbids any import in runtime production code from paths that are on the
 * permitted-mock surface (fixtures/, __fixtures__/). Generalizes the L16
 * no-restricted-imports block: the existing block fires at `error` for
 * __fixtures__/ imports; this rule fires at `error` too, with broader
 * coverage (also catches fixtures/ without the double-underscore prefix).
 *
 * Architecture ref: M1 architecture.md § Phase B, File 2
 *
 * Detection:
 *   ImportDeclaration whose source value contains any FORBIDDEN_IMPORT_FRAGMENTS
 *   fragment, AND whose file is NOT on the permitted-mock surface.
 *
 * Permitted surface (file is NOT flagged when):
 *   - Path contains /__fixtures__/, /__tests__/, /e2e/
 *   - File suffix is .test.ts, .test.tsx, .spec.ts, .spec.tsx, .stories.tsx
 *   - File basename starts with "seed"
 */

import { basename } from "node:path";
import type { Rule } from "eslint";
import {
	FORBIDDEN_IMPORT_FRAGMENTS,
	PERMITTED_SURFACE_PATH_FRAGMENTS,
	PERMITTED_SURFACE_SUFFIXES,
	POLICY_DOC_URL,
	SEED_FILE_BASENAME_PREFIX,
} from "../mock-data-policy.js";
import { createRule } from "../util.js";

function isPermittedSurfaceFile(filename: string): boolean {
	if (PERMITTED_SURFACE_PATH_FRAGMENTS.some((f) => filename.includes(f))) return true;
	if (PERMITTED_SURFACE_SUFFIXES.some((s) => filename.endsWith(s))) return true;
	const base = basename(filename);
	if (base.startsWith(SEED_FILE_BASENAME_PREFIX)) return true;
	return false;
}

function isForbiddenImportSource(importSource: string): boolean {
	return FORBIDDEN_IMPORT_FRAGMENTS.some((f) => importSource.includes(f));
}

export const noMockDataImport: Rule.RuleModule = createRule({
	meta: {
		type: "problem",
		docs: {
			description:
				"Forbid imports from fixtures/ or __fixtures__/ in runtime production code. Mock data must stay in the permitted-mock surface (tests, stories, e2e, seed files).",
			recommended: true,
			url: POLICY_DOC_URL,
		},
		schema: [],
		messages: {
			mockDataImport:
				"Runtime code must not import from a fixture/mock path. Mock data is only legal in tests, stories, __fixtures__/, e2e/, and seed files. See: {{url}}",
		},
	},
	create(context) {
		const filename = context.filename;
		if (isPermittedSurfaceFile(filename)) return {};

		return {
			ImportDeclaration(node) {
				const importSource = node.source.value as string;
				if (!isForbiddenImportSource(importSource)) return;
				context.report({
					node,
					messageId: "mockDataImport",
					data: {
						url: POLICY_DOC_URL,
					},
				});
			},
		};
	},
});
