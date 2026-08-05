/**
 * design/require-stories-sibling
 *
 * Component files under `framework/design-system/src/` or
 * `layers/core-ui/src/components/` must have a `<Name>.stories.tsx` sibling.
 *
 * This rule fires once per file (on Program node). It is opt-out per file via
 * a top-of-file `// design-lint-disable require-stories-sibling` directive.
 *
 * Maps to the design-system rule "Every custom component must have a
 * .stories.tsx file" (.claude/rules/design-system.md).
 */

import { existsSync } from "node:fs";
import { basename, dirname, extname, join } from "node:path";

import type { Rule } from "eslint";
import { createRule } from "../util.js";

const TARGET_DIRS = ["framework/design-system/src/", "layers/core-ui/src/components/"];

function isComponentFile(filename: string): boolean {
	if (!filename.endsWith(".tsx")) return false;
	const base = basename(filename);
	if (base.endsWith(".stories.tsx")) return false;
	if (base.endsWith(".test.tsx")) return false;
	if (base === "index.tsx") return false;
	if (!TARGET_DIRS.some((d) => filename.includes(d))) return false;
	// First char uppercase → component file
	const first = base.charAt(0);
	return first === first.toUpperCase() && first !== first.toLowerCase();
}

function hasOptOut(text: string): boolean {
	return /\bdesign-lint-disable\s+require-stories-sibling\b/.test(text);
}

export const requireStoriesSibling: Rule.RuleModule = createRule({
	meta: {
		type: "suggestion",
		docs: {
			description:
				"Component files in framework/design-system/src/ or layers/core-ui/src/components/ must have a .stories.tsx sibling.",
			recommended: true,
		},
		schema: [],
		messages: {
			missing:
				"Component '{{name}}' has no .stories.tsx sibling.  → fix: create '{{expected}}' or add `// design-lint-disable require-stories-sibling` at the top of the file.",
		},
	},
	create(context) {
		const filename = context.filename;
		if (!isComponentFile(filename)) return {};
		const sourceCode = context.sourceCode;
		if (hasOptOut(sourceCode.text)) return {};
		const ext = extname(filename);
		const base = basename(filename, ext);
		const expected = join(dirname(filename), `${base}.stories.tsx`);
		if (existsSync(expected)) return {};
		return {
			Program(node) {
				context.report({
					node,
					messageId: "missing",
					data: { name: base, expected },
				});
			},
		};
	},
});
