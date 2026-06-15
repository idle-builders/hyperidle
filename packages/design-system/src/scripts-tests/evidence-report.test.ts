/**
 * AJ4 — RED phase: buildEvidenceReport() unit tests.
 *
 * Covers:
 *   - AC1: PR markdown carries before+after link per module + aj4-design-evidence markers
 *   - AC1: capped overflow → "+K more" link-only line, no silent drop
 *   - AC2: summarySection shape (storyUrl, shots per changed module)
 *   - AC3: empty input → empty markdown + empty summarySection
 *   - Inline render mode (render:"inline") → ![]() form
 *
 * Import path the green builder must implement:
 *   packages/design-system/scripts/design-evidence/evidence-report.ts
 */

import { describe, expect, test } from "vitest";
import type { ChangedStory } from "../../scripts/design-evidence/changed-stories.js";
import {
	buildEvidenceReport,
	EVIDENCE_MODULE_CAP,
	type EvidenceReport,
} from "../../scripts/design-evidence/evidence-report.js";
import type { HostedShot } from "../../scripts/design-evidence/upload-assets.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeChanged(title: string, variants: string[]): ChangedStory {
	return { title, variants };
}

function makeHosted(
	title: string,
	variant: string,
	side: "before" | "after",
	render: "link" | "inline" = "link",
): HostedShot {
	return {
		target: { title, variant },
		side,
		url: `https://github.com/example/blob/pr-evidence/1/${title.replace("/", "__")}__${side}.png`,
		render,
	};
}

// ---------------------------------------------------------------------------
// AC3: empty input
// ---------------------------------------------------------------------------

describe("buildEvidenceReport — empty input (AC3)", () => {
	test("returns empty prMarkdown and empty summarySection for empty changed set", () => {
		const report: EvidenceReport = buildEvidenceReport([], []);
		expect(report.prMarkdown).toBe("");
		expect(report.summarySection).toEqual([]);
	});
});

// ---------------------------------------------------------------------------
// AC1: PR markdown structure
// ---------------------------------------------------------------------------

describe("buildEvidenceReport — PR markdown (AC1)", () => {
	const changed: ChangedStory[] = [makeChanged("AG6/RowDot", ["Success", "ErrorTone"])];

	const hosted: HostedShot[] = [
		makeHosted("AG6/RowDot", "Success", "before"),
		makeHosted("AG6/RowDot", "Success", "after"),
	];

	test("wraps content in aj4-design-evidence markers", () => {
		const { prMarkdown } = buildEvidenceReport(changed, hosted);
		expect(prMarkdown).toContain("<!-- aj4-design-evidence:start -->");
		expect(prMarkdown).toContain("<!-- aj4-design-evidence:end -->");
	});

	test("start marker comes before end marker", () => {
		const { prMarkdown } = buildEvidenceReport(changed, hosted);
		const startIdx = prMarkdown.indexOf("<!-- aj4-design-evidence:start -->");
		const endIdx = prMarkdown.indexOf("<!-- aj4-design-evidence:end -->");
		expect(startIdx).toBeLessThan(endIdx);
	});

	test("includes the story title in the markdown", () => {
		const { prMarkdown } = buildEvidenceReport(changed, hosted);
		expect(prMarkdown).toContain("AG6/RowDot");
	});

	test("includes the openable story link (viewer URL)", () => {
		const { prMarkdown } = buildEvidenceReport(changed, hosted);
		// Must link to the viewer hash route
		expect(prMarkdown).toContain("localhost:8098");
		expect(prMarkdown).toContain("AG6%2FRowDot");
	});

	test("includes a before evidence link (link render mode)", () => {
		const { prMarkdown } = buildEvidenceReport(changed, hosted);
		// In link mode, should have a markdown link containing the before URL
		const beforeUrl = hosted[0]?.url ?? "";
		expect(prMarkdown).toContain(beforeUrl);
	});

	test("includes an after evidence link (link render mode)", () => {
		const { prMarkdown } = buildEvidenceReport(changed, hosted);
		const afterUrl = hosted[1]?.url ?? "";
		expect(prMarkdown).toContain(afterUrl);
	});

	test("uses ![]() inline form when render is 'inline'", () => {
		const inlineHosted: HostedShot[] = [
			makeHosted("AG6/RowDot", "Success", "before", "inline"),
			makeHosted("AG6/RowDot", "Success", "after", "inline"),
		];
		const { prMarkdown } = buildEvidenceReport(changed, inlineHosted);
		// Inline form uses ![]() markdown image syntax
		expect(prMarkdown).toMatch(/!\[.*\]\(https?:\/\//);
	});

	test("mentions the changed variant names", () => {
		const { prMarkdown } = buildEvidenceReport(changed, hosted);
		expect(prMarkdown).toContain("Success");
		expect(prMarkdown).toContain("ErrorTone");
	});
});

// ---------------------------------------------------------------------------
// AC1: capped overflow — "+K more" line, no silent drop
// ---------------------------------------------------------------------------

describe("buildEvidenceReport — EVIDENCE_MODULE_CAP overflow (AC1)", () => {
	test("EVIDENCE_MODULE_CAP is exported and equals 12", () => {
		expect(EVIDENCE_MODULE_CAP).toBe(12);
	});

	test("emits a '+K more' line when changed set exceeds cap", () => {
		// Create cap+3 changed modules (15 total)
		const totalModules = EVIDENCE_MODULE_CAP + 3;
		const changed: ChangedStory[] = Array.from({ length: totalModules }, (_, i) =>
			makeChanged(`Module${i}`, ["Default"]),
		);

		// Only provide hosted shots for the first cap modules (as capture-evidence would do)
		const hosted: HostedShot[] = Array.from({ length: EVIDENCE_MODULE_CAP }, (_, i) => [
			makeHosted(`Module${i}`, "Default", "before"),
			makeHosted(`Module${i}`, "Default", "after"),
		]).flat();

		const { prMarkdown } = buildEvidenceReport(changed, hosted);

		// Must contain a "+3 more" (or "+K more") indication
		expect(prMarkdown).toMatch(/\+3 more/);
	});

	test("never silently drops a changed module — link-only modules appear in output", () => {
		const totalModules = EVIDENCE_MODULE_CAP + 2;
		const changed: ChangedStory[] = Array.from({ length: totalModules }, (_, i) =>
			makeChanged(`Module${i}`, ["Default"]),
		);

		// No hosted shots for overflow modules
		const hosted: HostedShot[] = Array.from({ length: EVIDENCE_MODULE_CAP }, (_, i) => [
			makeHosted(`Module${i}`, "Default", "before"),
			makeHosted(`Module${i}`, "Default", "after"),
		]).flat();

		const { prMarkdown } = buildEvidenceReport(changed, hosted);

		// The overflow modules (Module12, Module13) must still appear
		expect(prMarkdown).toContain("Module12");
		expect(prMarkdown).toContain("Module13");
	});

	test("all imaged modules appear in prMarkdown even at cap", () => {
		const changed: ChangedStory[] = Array.from({ length: EVIDENCE_MODULE_CAP }, (_, i) =>
			makeChanged(`Module${i}`, ["Default"]),
		);

		const hosted: HostedShot[] = Array.from({ length: EVIDENCE_MODULE_CAP }, (_, i) => [
			makeHosted(`Module${i}`, "Default", "before"),
			makeHosted(`Module${i}`, "Default", "after"),
		]).flat();

		const { prMarkdown } = buildEvidenceReport(changed, hosted);

		for (let i = 0; i < EVIDENCE_MODULE_CAP; i++) {
			expect(prMarkdown).toContain(`Module${i}`);
		}
		// No overflow line when exactly at cap
		expect(prMarkdown).not.toMatch(/\+0 more/);
	});
});

// ---------------------------------------------------------------------------
// AC2: summarySection shape
// ---------------------------------------------------------------------------

describe("buildEvidenceReport — summarySection (AC2)", () => {
	const changed: ChangedStory[] = [
		makeChanged("AG6/RowDot", ["Success", "ErrorTone"]),
		makeChanged("Avatar", ["Default"]),
	];

	const hosted: HostedShot[] = [
		makeHosted("AG6/RowDot", "Success", "before"),
		makeHosted("AG6/RowDot", "Success", "after"),
		makeHosted("Avatar", "Default", "before"),
		makeHosted("Avatar", "Default", "after"),
	];

	test("returns one summarySection entry per changed module", () => {
		const { summarySection } = buildEvidenceReport(changed, hosted);
		expect(summarySection).toHaveLength(2);
	});

	test("summarySection entry has the module title", () => {
		const { summarySection } = buildEvidenceReport(changed, hosted);
		const titles = summarySection.map((s) => s.title);
		expect(titles).toContain("AG6/RowDot");
		expect(titles).toContain("Avatar");
	});

	test("summarySection entry has a non-empty storyUrl (viewer link)", () => {
		const { summarySection } = buildEvidenceReport(changed, hosted);
		for (const entry of summarySection) {
			expect(entry.storyUrl).toBeTruthy();
			expect(entry.storyUrl).toContain("localhost:8098");
		}
	});

	test("summarySection entry lists the changed variants", () => {
		const { summarySection } = buildEvidenceReport(changed, hosted);
		const rowDot = summarySection.find((s) => s.title === "AG6/RowDot");
		expect(rowDot?.variants).toContain("Success");
		expect(rowDot?.variants).toContain("ErrorTone");
	});

	test("summarySection entry has a shots array", () => {
		const { summarySection } = buildEvidenceReport(changed, hosted);
		for (const entry of summarySection) {
			expect(Array.isArray(entry.shots)).toBe(true);
		}
	});

	test("summarySection shots have before and/or after URLs", () => {
		const { summarySection } = buildEvidenceReport(changed, hosted);
		const rowDot = summarySection.find((s) => s.title === "AG6/RowDot");
		const successShot = rowDot?.shots.find((s) => s.variant === "Success");
		expect(successShot).toBeDefined();
		// Must have at least one of before or after
		const hasEvidence = (successShot?.before ?? successShot?.after) !== undefined;
		expect(hasEvidence).toBe(true);
	});

	test("returns empty summarySection for empty input (AC3)", () => {
		const { summarySection } = buildEvidenceReport([], []);
		expect(summarySection).toEqual([]);
	});
});

// ---------------------------------------------------------------------------
// Degraded note (renderStory or uploadShots failed — no hosted shots)
// ---------------------------------------------------------------------------

describe("buildEvidenceReport — degraded mode (no hosted shots)", () => {
	test("still produces prMarkdown with story links when shots are absent", () => {
		const changed: ChangedStory[] = [makeChanged("AG6/RowDot", ["Success"])];

		// No hosted shots — capture failed
		const { prMarkdown } = buildEvidenceReport(changed, []);

		// Must still have markers and the story link
		expect(prMarkdown).toContain("<!-- aj4-design-evidence:start -->");
		expect(prMarkdown).toContain("AG6/RowDot");
		expect(prMarkdown).toContain("localhost:8098");
	});
});
