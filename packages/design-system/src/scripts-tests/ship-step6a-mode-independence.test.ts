/**
 * AJ4 — RED phase: AC4 structural assertion.
 *
 * The ship skill's step 6a (design-change evidence) must run in BOTH
 * autonomous and interactive modes. This means the step-6a region must
 * contain NO `PIPELINE_INTERACTIVE` token (which would gate it on
 * interactive-only).
 *
 * Counter-proof: the step-7a region DOES contain `PIPELINE_INTERACTIVE`
 * (it is interactive-only by design), confirming the test can discriminate
 * between the two regions and is not vacuously passing.
 *
 * This is a STATIC PROPERTY of the skill file (classified per
 * CLAUDE.md: "static codebase property → lint rule or type system").
 * It uses the same file-read pattern as design-source.test.ts, which
 * established the precedent for structural skill/rule assertions in this
 * package. The ship skill is the artifact under test, not incidental config.
 *
 * No import from production code — this test has no green-phase module to
 * implement. The green phase is editing the SKILL.md file itself (task 8).
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

// ---------------------------------------------------------------------------
// Locate the skill file — anchored to this file's repo-root-relative position
// File: packages/design-system/src/scripts-tests/ship-step6a-mode-independence.test.ts
// Repo root: 5 levels up (scripts-tests -> src -> design-system -> packages -> repo root)
// ---------------------------------------------------------------------------

const REPO_ROOT = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"../../../..", // scripts-tests -> src -> design-system -> packages -> repo root
);

const SKILL_PATH = path.join(REPO_ROOT, ".claude", "skills", "ship", "SKILL.md");

// ---------------------------------------------------------------------------
// Region extraction helpers
// ---------------------------------------------------------------------------

/**
 * Extract the text of a numbered step region from the SKILL.md content.
 * Starts at the first line containing the step heading (e.g. "### 6a.")
 * and ends before the next "###" or "### 7" heading (or EOF).
 *
 * Returns the region text, or null if the heading is not found.
 */
function extractStepRegion(content: string, stepHeading: string): string | null {
	const lines = content.split("\n");
	let inRegion = false;
	const regionLines: string[] = [];

	for (const line of lines) {
		if (!inRegion) {
			if (line.includes(stepHeading)) {
				inRegion = true;
				regionLines.push(line);
			}
		} else {
			// Stop at the next heading that is not a continuation of this step.
			// A "###" heading that doesn't match our step heading signals the next section.
			if (line.match(/^###\s+(?!\s*$)/) && !line.includes(stepHeading)) {
				break;
			}
			regionLines.push(line);
		}
	}

	return inRegion ? regionLines.join("\n") : null;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("AC4 structural — ship/SKILL.md mode independence", () => {
	test("SKILL.md exists at .claude/skills/ship/SKILL.md", () => {
		expect(
			fs.existsSync(SKILL_PATH),
			`SKILL.md not found at ${SKILL_PATH} (repo root: ${REPO_ROOT})`,
		).toBe(true);
	});

	test("step-6a region contains no PIPELINE_INTERACTIVE token", () => {
		const content = fs.readFileSync(SKILL_PATH, "utf8");

		// The step-6a region must exist after AJ4's green phase (task 8).
		// Until then this test will fail because the region doesn't exist yet.
		const region = extractStepRegion(content, "6a.");

		expect(
			region,
			"Step 6a region not found in SKILL.md. " +
				"The green phase (task 8) must add a '### 6a.' heading to ship/SKILL.md " +
				"that calls `npm run ds:evidence`.",
		).not.toBeNull();

		expect(
			region,
			`Step 6a must NOT contain 'PIPELINE_INTERACTIVE' — it must run in both modes ` +
				`(AC4: ship artifact, not touchpoint). Found PIPELINE_INTERACTIVE in:\n${region}`,
		).not.toContain("PIPELINE_INTERACTIVE");
	});

	test("step-7a region DOES contain PIPELINE_INTERACTIVE (discriminating counter-proof)", () => {
		const content = fs.readFileSync(SKILL_PATH, "utf8");
		const region = extractStepRegion(content, "7a.");

		expect(
			region,
			"Step 7a region not found in SKILL.md — the counter-proof cannot discriminate. " +
				"The SKILL.md must have a '### 7a.' heading.",
		).not.toBeNull();

		expect(
			region,
			"Step 7a must contain 'PIPELINE_INTERACTIVE' (it is interactive-only by design, " +
				"per the existing ship summary check). " +
				"This proves the test can distinguish the two regions.",
		).toContain("PIPELINE_INTERACTIVE");
	});
});
