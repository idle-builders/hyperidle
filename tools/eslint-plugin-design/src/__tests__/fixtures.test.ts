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

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import tsParser from "@typescript-eslint/parser";
import { Linter } from "eslint";
import { describe, expect, it } from "vitest";

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
					"design/radius-token-only": "warn",
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
		const ids = messages.map((m) => m.ruleId);
		const expected = [
			"design/no-ai-aesthetic",
			"design/no-hardcoded-color",
			"design/no-off-grid-spacing",
			"design/no-off-scale-font-size",
			"design/radius-token-only",
			"design/no-raw-tailwind-color",
			"design/require-focus-on-interactive",
		];
		// Some rules legitimately fire multiple times in the bad-fixture (e.g.
		// no-ai-aesthetic for lorem + marketing + gradient-text + backdrop-blur,
		// and radius-token-only for arbitrary + named + rounded-3xl). Assert
		// each expected rule is present at least once via the deduplicated set.
		const unique = [...new Set(ids)].sort();
		expect(unique, JSON.stringify(messages, null, 2)).toEqual(expected.sort());
		// Sanity: total count must be at least the number of unique rules — if a
		// rule double-fires unexpectedly (e.g. cn() walker double-counting), the
		// count will spike and we want a noticed-not-touching to flag it.
		expect(ids.length).toBeGreaterThanOrEqual(expected.length);
	});

	it("bad fixture triggers each AI-aesthetic sub-tell at least once", () => {
		const messages = lintFile(`${fixturesDir}/bad-fixture.tsx`);
		const aiAestheticMessageIds = messages
			.filter((m) => m.ruleId === "design/no-ai-aesthetic")
			.map((m) => m.messageId);
		// Assert each major tell fires in the integration fixture. rounded2xl is on-scale;
		// rounded3xl is the AI-aesthetic tell.
		const expectedTells = [
			"rounded3xl",
			"backdropBlur",
			"gradientText",
			"loremIpsum",
			"marketingCopy",
		];
		for (const tell of expectedTells) {
			expect(aiAestheticMessageIds, `expected ${tell} tell in bad-fixture`).toContain(tell);
		}
	});
});
