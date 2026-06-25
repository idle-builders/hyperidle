/**
 * design/no-surface-network-import
 *
 * AC5 (AL5): Forbids network/API imports inside `surfaces/**` files.
 *
 * Review surfaces must be statically renderable from their props. They receive
 * data via the ReviewCanvasComponent contract (artifact, status, outcome, proposedCall)
 * and must NOT make network calls. The host (ReviewComposition/ReviewPage) is
 * responsible for fetching and forwarding all required data.
 *
 * This preserves the architectural invariant: surfaces are pure rendering
 * components, not data-fetching agents.
 *
 * Forbidden import patterns (in surfaces/** files):
 * - Any import from a path containing "api-fetch" or "apiFetch"
 * - Any import from a path containing "/services/" (network service layer)
 * - Any import from "@hyperidle/server" (server-side route handlers)
 *
 * Permitted (not flagged):
 * - Test files (*.test.ts, *.test.tsx)
 * - Story files (*.stories.tsx)
 * - Infrastructure files (resolve-surface.ts, SurfaceBoundary.ts, canvas-registry.ts)
 *   — these are in surfaces/ but are not surface components
 *
 * @lore AL5 AC5: Static codebase property enforced by lint, not a test.
 * A test that grepped the filesystem or read source files would be a lint rule
 * in disguise (see CLAUDE.md "Tests are for application logic").
 */

import { createRule } from "../util.js";

/** Path fragments in the import source that are forbidden in surfaces/ files. */
const FORBIDDEN_IMPORT_FRAGMENTS: readonly string[] = ["api-fetch", "apiFetch", "/services/"];

/** Module specifier prefixes that are forbidden in surfaces/ files. */
const FORBIDDEN_MODULE_PREFIXES: readonly string[] = ["@hyperidle/server"];

/** Path fragments that identify a file as a surfaces/** surface file. */
const SURFACES_PATH_FRAGMENT = "/surfaces/";

/** File suffixes that exempt a file from this rule (tests + stories). */
const EXEMPT_SUFFIXES: readonly string[] = [
	".test.ts",
	".test.tsx",
	".stories.tsx",
	".integration.test.ts",
	".spec.ts",
];

function isSurfacesFile(filename: string): boolean {
	return filename.includes(SURFACES_PATH_FRAGMENT);
}

function isExemptFile(filename: string): boolean {
	return EXEMPT_SUFFIXES.some((s) => filename.endsWith(s));
}

function isForbiddenImport(importSource: string): boolean {
	if (FORBIDDEN_IMPORT_FRAGMENTS.some((f) => importSource.includes(f))) return true;
	if (FORBIDDEN_MODULE_PREFIXES.some((p) => importSource.startsWith(p))) return true;
	return false;
}

export const noSurfaceNetworkImport = createRule({
	meta: {
		type: "problem",
		docs: {
			description:
				"Forbid network/API imports inside surfaces/** files. Surfaces must render from props only — no fetching. The host (ReviewComposition) is responsible for data fetching.",
			recommended: true,
		},
		schema: [],
		messages: {
			noSurfaceNetworkImport:
				"surfaces/** files must not import network/API utilities (found: '{{source}}'). Pass data via component props — the host (ReviewComposition/ReviewPage) fetches and forwards it. See AL5 AC5.",
		},
	},
	create(context) {
		const filename = context.filename;
		if (!isSurfacesFile(filename)) return {};
		if (isExemptFile(filename)) return {};

		return {
			ImportDeclaration(node) {
				const importSource = node.source.value as string;
				if (!isForbiddenImport(importSource)) return;
				context.report({
					node,
					messageId: "noSurfaceNetworkImport",
					data: { source: importSource },
				});
			},
		};
	},
});
