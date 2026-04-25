/**
 * End-to-end fixture run: invoke ESLint programmatically with the design
 * plugin loaded, assert
 *   - good fixture has 0 design/* violations
 *   - bad fixture has exactly the expected design/* rule IDs
 *
 * The bad fixture intentionally triggers seven of the nine rules in a single
 * file (one per rule). require-ds-attribute and require-stories-sibling are
 * filename-scoped and verified in their own unit tests + the dedicated
 * sibling-fixtures directory committed alongside.
 */
import { describe, expect, it } from "vitest";
import { Linter } from "eslint";
import { dirname, resolve } from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import tsParser from "@typescript-eslint/parser";

import plugin from "../index.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixturesDir = resolve(here, "..", "..", "test-fixtures");

const linter = new Linter();

function lintFile(filename: string) {
	const code = readFileSync(filename, "utf8");
	const messages = linter.verify(
		code,
		[
			{
				files: ["**/*.tsx"],
				languageOptions: {
					parser: tsParser,
					parserOptions: { ecmaFeatures: { jsx: true } },
				},
				plugins: { design: plugin },
				rules: {
					"design/no-hardcoded-color": "warn",
					"design/no-off-grid-spacing": "warn",
					"design/no-off-scale-radius": "warn",
					"design/no-off-scale-font-size": "warn",
					"design/no-ai-aesthetic": "warn",
					"design/no-raw-tailwind-color": "warn",
					"design/require-ds-attribute": "warn",
					"design/require-stories-sibling": "warn",
					"design/require-focus-on-interactive": "warn",
				},
			},
		],
		{ filename },
	);
	return messages.filter((m) => m.ruleId?.startsWith("design/"));
}

describe("eslint-plugin-design fixtures", () => {
	it("good fixture produces zero design/* violations", () => {
		const messages = lintFile(`${fixturesDir}/good-fixture.tsx`);
		expect(messages, JSON.stringify(messages, null, 2)).toEqual([]);
	});

	it("bad fixture triggers every targeted rule", () => {
		const messages = lintFile(`${fixturesDir}/bad-fixture.tsx`);
		const ids = messages.map((m) => m.ruleId).sort();
		expect(ids).toEqual(
			[
				"design/no-ai-aesthetic",
				"design/no-hardcoded-color",
				"design/no-off-grid-spacing",
				"design/no-off-scale-font-size",
				"design/no-off-scale-radius",
				"design/no-raw-tailwind-color",
				"design/require-focus-on-interactive",
			].sort(),
		);
	});
});
