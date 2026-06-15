/**
 * AJ4 — RED phase: changedStories() unit tests.
 *
 * Tests the pure .snap diff function. All assertions are over return values;
 * no filesystem access except via the module under test.
 *
 * Import path the green builder must implement:
 *   packages/design-system/scripts/design-evidence/changed-stories.ts
 */

import { describe, expect, test } from "vitest";
import {
	changedStories,
	type ChangedStory,
} from "../../scripts/design-evidence/changed-stories.js";

// ---------------------------------------------------------------------------
// Helpers to build minimal valid .snap text
// ---------------------------------------------------------------------------

/**
 * Build a minimal Vitest snapshot file text from a map of key → body.
 * Mirrors the format Vitest actually writes:
 *   exports[`<key>`] = `
 *   <body lines>
 *   `;
 */
function buildSnap(entries: Record<string, string>): string {
	const lines: string[] = ['// Vitest Snapshot v1, https://vitest.dev/guide/snapshot.html', ""];
	for (const [key, body] of Object.entries(entries)) {
		lines.push(`exports[\`${key}\`] = \``);
		if (body) {
			lines.push(body);
		}
		lines.push("`;");
		lines.push("");
	}
	return lines.join("\n");
}

// ---------------------------------------------------------------------------
// AC3 path: identical snaps → [] (no design change)
// ---------------------------------------------------------------------------

describe("changedStories — identical snaps", () => {
	test("returns empty array when branch and base are identical", () => {
		const snap = buildSnap({
			"AG6/RowDot > Success 1": "<div class=\"row-dot\" />",
			"AG6/RowDot > ErrorTone 1": "<div class=\"row-dot error\" />",
		});
		const result: ChangedStory[] = changedStories(snap, snap);
		expect(result).toEqual([]);
	});

	test("returns empty array for empty snap files", () => {
		const snap = buildSnap({});
		expect(changedStories(snap, snap)).toEqual([]);
	});
});

// ---------------------------------------------------------------------------
// AC1 path: changed variant
// ---------------------------------------------------------------------------

describe("changedStories — changed variant", () => {
	test("returns the changed story when a variant body differs", () => {
		const baseSnap = buildSnap({
			"AG6/RowDot > Success 1": "<div class=\"row-dot\" />",
		});
		const branchSnap = buildSnap({
			"AG6/RowDot > Success 1": "<div class=\"row-dot success-tone\" />",
		});

		const result = changedStories(branchSnap, baseSnap);

		expect(result).toHaveLength(1);
		expect(result[0]?.title).toBe("AG6/RowDot");
		expect(result[0]?.variants).toContain("Success");
	});

	test("groups multiple changed variants under the same title", () => {
		const baseSnap = buildSnap({
			"AG6/RowDot > Success 1": "<div class=\"success\" />",
			"AG6/RowDot > ErrorTone 1": "<div class=\"error\" />",
		});
		const branchSnap = buildSnap({
			"AG6/RowDot > Success 1": "<div class=\"success changed\" />",
			"AG6/RowDot > ErrorTone 1": "<div class=\"error changed\" />",
		});

		const result = changedStories(branchSnap, baseSnap);

		expect(result).toHaveLength(1);
		expect(result[0]?.title).toBe("AG6/RowDot");
		expect(result[0]?.variants).toHaveLength(2);
		expect(result[0]?.variants).toContain("Success");
		expect(result[0]?.variants).toContain("ErrorTone");
	});

	test("only reports the actually changed variant within a module", () => {
		const baseSnap = buildSnap({
			"AG6/RowDot > Success 1": "<div class=\"success\" />",
			"AG6/RowDot > ErrorTone 1": "<div class=\"error\" />",
		});
		const branchSnap = buildSnap({
			"AG6/RowDot > Success 1": "<div class=\"success changed\" />",
			"AG6/RowDot > ErrorTone 1": "<div class=\"error\" />", // unchanged
		});

		const result = changedStories(branchSnap, baseSnap);

		expect(result).toHaveLength(1);
		expect(result[0]?.variants).toHaveLength(1);
		expect(result[0]?.variants).toContain("Success");
		expect(result[0]?.variants).not.toContain("ErrorTone");
	});

	test("reports stories from different modules as separate entries", () => {
		const baseSnap = buildSnap({
			"AG6/RowDot > Success 1": "<div class=\"rowdot\" />",
			"Avatar > Default 1": "<div class=\"avatar\" />",
		});
		const branchSnap = buildSnap({
			"AG6/RowDot > Success 1": "<div class=\"rowdot changed\" />",
			"Avatar > Default 1": "<div class=\"avatar changed\" />",
		});

		const result = changedStories(branchSnap, baseSnap);

		expect(result).toHaveLength(2);
		const titles = result.map((s) => s.title);
		expect(titles).toContain("AG6/RowDot");
		expect(titles).toContain("Avatar");
	});
});

// ---------------------------------------------------------------------------
// AC1 path: added story (in branch, not in base)
// ---------------------------------------------------------------------------

describe("changedStories — added story (first-time / new story)", () => {
	test("reports a branch-only story as changed", () => {
		const baseSnap = buildSnap({});
		const branchSnap = buildSnap({
			"NewComponent > Default 1": "<div class=\"new\" />",
		});

		const result = changedStories(branchSnap, baseSnap);

		expect(result).toHaveLength(1);
		expect(result[0]?.title).toBe("NewComponent");
		expect(result[0]?.variants).toContain("Default");
	});

	test("treats all keys as added when base snap is empty", () => {
		const baseSnap = buildSnap({});
		const branchSnap = buildSnap({
			"AG6/RowDot > Success 1": "<div />",
			"AG6/RowDot > ErrorTone 1": "<div />",
			"Avatar > Default 1": "<div />",
		});

		const result = changedStories(branchSnap, baseSnap);

		expect(result).toHaveLength(2); // grouped by title
		const titles = result.map((s) => s.title);
		expect(titles).toContain("AG6/RowDot");
		expect(titles).toContain("Avatar");
	});
});

// ---------------------------------------------------------------------------
// AC1 path: deleted story (in base, not in branch)
// ---------------------------------------------------------------------------

describe("changedStories — deleted story", () => {
	test("reports a base-only story as changed (removed)", () => {
		const baseSnap = buildSnap({
			"OldComponent > Default 1": "<div class=\"old\" />",
		});
		const branchSnap = buildSnap({});

		const result = changedStories(branchSnap, baseSnap);

		expect(result).toHaveLength(1);
		expect(result[0]?.title).toBe("OldComponent");
		expect(result[0]?.variants).toContain("Default");
	});
});

// ---------------------------------------------------------------------------
// AC1 / parser regression: escaped backtick + \${ in body
//
// The architecture § "How changedStories() parses the .snap" mandates a
// LINE-DELIMITED parser (not a non-greedy block regex) because the serializer
// escapes `→\` and $→\$ inside template-literal bodies. A naive regex stops
// early at an escaped backtick, producing a wrong changed-set.
//
// Vitest's snap format:
//   exports[`<key>`] = `    ← opener (backtick at end)
//   <body — may contain \` and \${>
//   `;                       ← closer (backtick-semicolon at column 0, alone)
//
// The line-delimited parser recognises the closer as /^`;$/ only — an escaped
// backtick INSIDE the body is \` (backslash + backtick), not a standalone `;`
// line, so it cannot be mistaken for the closer.
// ---------------------------------------------------------------------------

describe("changedStories — escaped backtick + \\${ in body (parser regression guard)", () => {
	/**
	 * Builds a snap whose body contains a literal escaped backtick (\`) and a
	 * \${ sequence. We inject them RAW (not through buildSnap's escape logic)
	 * because the .snap file on disk stores them escaped.
	 */
	function buildRawSnap(entries: Record<string, string>): string {
		const lines: string[] = ['// Vitest Snapshot v1, https://vitest.dev/guide/snapshot.html', ""];
		for (const [key, body] of Object.entries(entries)) {
			// Key is NOT escaped — it goes inside the outer `…` of exports[`key`]
			// Body IS the raw stored text (already contains \` / \${ as stored)
			lines.push(`exports[\`${key}\`] = \``);
			lines.push(body);
			lines.push("`;");
			lines.push("");
		}
		return lines.join("\n");
	}

	// Body with escaped backtick and \${ — identical on both sides → should be UNCHANGED
	const bodyWithEscapes = [
		"  <div class=\"code-block\">",
		"    \"text with \\`escaped backtick\\` and \\${template} inside\"",
		"  </div>",
	].join("\n");

	test("treats block with escaped backtick+\\${ as unchanged when bodies are identical", () => {
		const snap = buildRawSnap({
			"CodeBlock > Default 1": bodyWithEscapes,
		});

		const result = changedStories(snap, snap);

		expect(result).toEqual([]);
	});

	test("reports block as changed when one char inside the escaped-backtick body differs", () => {
		const baseBody = [
			"  <div class=\"code-block\">",
			"    \"text with \\`escaped backtick\\` and \\${template} inside\"",
			"  </div>",
		].join("\n");

		const branchBody = [
			"  <div class=\"code-block changed\">",
			"    \"text with \\`escaped backtick\\` and \\${template} inside\"",
			"  </div>",
		].join("\n");

		const baseSnap = buildRawSnap({ "CodeBlock > Default 1": baseBody });
		const branchSnap = buildRawSnap({ "CodeBlock > Default 1": branchBody });

		const result = changedStories(branchSnap, baseSnap);

		expect(result).toHaveLength(1);
		expect(result[0]?.title).toBe("CodeBlock");
		expect(result[0]?.variants).toContain("Default");
	});

	test("handles a body with multiple escaped backticks — does not split at any of them", () => {
		// If the parser used a naive non-greedy regex, it would stop at the first \`
		// and report a wrong (truncated) body for each key — causing false positives.
		const multiEscapeBody = [
			"  \"line one with \\`backtick\\`\"",
			"  \"line two with \\`another\\` and \\${expr}\"",
			"  \"line three clean\"",
		].join("\n");

		const snap = buildRawSnap({
			"MultiEscape > Variant 1": multiEscapeBody,
			"OtherModule > Default 1": "<div />",
		});

		// Identical → no changes
		expect(changedStories(snap, snap)).toEqual([]);

		// Change something unrelated to escaped backticks
		const snap2 = buildRawSnap({
			"MultiEscape > Variant 1": multiEscapeBody,
			"OtherModule > Default 1": "<div class=\"changed\" />",
		});

		const result = changedStories(snap2, snap);
		expect(result).toHaveLength(1);
		expect(result[0]?.title).toBe("OtherModule");
		// MultiEscape must NOT appear — the parser kept its body whole
		expect(result.find((s) => s.title === "MultiEscape")).toBeUndefined();
	});
});
