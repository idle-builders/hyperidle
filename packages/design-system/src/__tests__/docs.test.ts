import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const DS_ROOT = resolve(__dirname, "../..");

describe("DESIGN.md", () => {
	const content = readFileSync(resolve(DS_ROOT, "DESIGN.md"), "utf-8");

	it("exists and has content", () => {
		expect(content.length).toBeGreaterThan(500);
	});

	// U4: Updated from Lucid to Hearth
	it("documents Hearth theme system with light and dark modes", () => {
		expect(content).toContain("Hearth");
		expect(content).toContain("hearth-dark");
		expect(content).toContain("hearth-light");
	});

	it("references PRINCIPLES.md", () => {
		expect(content).toContain("PRINCIPLES.md");
	});

	// U4: Updated from --surface-0/--surface-6 to Hearth surface tokens
	it("documents Hearth surface tokens", () => {
		expect(content).toContain("--surface-page");
		expect(content).toContain("--surface-overlay");
	});

	// U4: Updated from --primary/--warn/--ok/--danger to Hearth accent/status tokens
	it("documents Hearth accent tokens", () => {
		expect(content).toContain("--accent-primary");
		expect(content).toContain("--accent-secondary");
		expect(content).toContain("--status-success");
		expect(content).toContain("--status-error");
	});

	// U4: Updated from --border-emphasis to --border-strong
	it("documents Hearth border tokens including border-strong", () => {
		expect(content).toContain("--border-subtle");
		expect(content).toContain("--border-default");
		expect(content).toContain("--border-strong");
	});

	// U4: Updated from Geist to system-ui
	it("documents system-ui typography (not Geist)", () => {
		expect(content).toContain("system-ui");
		expect(content).not.toContain("Geist");
	});

	// @lore W2: "documents density presets" test removed. Density system stripped.
	// DESIGN.md no longer documents --density-pad-x / Compact / Comfortable presets.
});

describe("PRINCIPLES.md", () => {
	const path = resolve(DS_ROOT, "PRINCIPLES.md");

	it("exists", () => {
		expect(existsSync(path)).toBe(true);
	});

	const content = existsSync(path) ? readFileSync(path, "utf-8") : "";

	it("covers the seven universals", () => {
		expect(content).toContain("Clarity Above All");
		expect(content).toContain("Hierarchy Through Weight");
		expect(content).toContain("Restraint");
		expect(content).toContain("Content First");
		expect(content).toContain("Consistency");
		expect(content).toContain("Meaningful Feedback");
		expect(content).toContain("Accessibility Is Structure");
	});

	it("covers surprise principles", () => {
		expect(content).toContain("Surprise Principles");
	});

	it("points to the canonical AI aesthetic catalog in AESTHETICS.md", () => {
		// K5 reduced the inline blacklist to a one-paragraph pointer; the canonical
		// 15-item catalog now lives in AESTHETICS.md § AI-Aesthetic Anti-Patterns.
		expect(content).toContain("AI Aesthetic Blacklist");
		expect(content).toContain("AESTHETICS.md");
		expect(content).toContain("AQ-101");
		expect(content).toContain("design/no-ai-aesthetic");
	});

	it("covers data-dense application principles", () => {
		expect(content).toContain("Data-Dense");
		expect(content).toContain("Progressive Disclosure");
	});
});

describe("THEMES.md", () => {
	const path = resolve(DS_ROOT, "THEMES.md");

	it("exists", () => {
		expect(existsSync(path)).toBe(true);
	});

	const content = existsSync(path) ? readFileSync(path, "utf-8") : "";

	// U4: Updated from Lucid Dark/Light to Hearth Dark/Light
	it("documents Hearth Dark and Hearth Light themes", () => {
		expect(content).toContain("Hearth Dark");
		expect(content).toContain("Hearth Light");
	});

	it("documents shared properties and per-mode token tables", () => {
		expect(content).toContain("Shared Properties");
		// U4: --surface-page replaces --surface-0
		expect(content).toContain("--surface-page");
	});

	// U4: Updated from lucid-dark.css/lucid-light.css to hearth-dark.css/hearth-light.css
	it("references Hearth theme CSS files", () => {
		expect(content).toContain("hearth-dark.css");
		expect(content).toContain("hearth-light.css");
	});
});

describe("design-system rule (.claude/rules/design-system.md)", () => {
	const rulePath = resolve(DS_ROOT, "../../.claude/rules/design-system.md");
	const content = readFileSync(rulePath, "utf-8");

	it("mentions design critique skill", () => {
		expect(content).toContain("design-critique");
	});

	it("mentions theme variants", () => {
		expect(content).toContain("theme");
	});

	it("mentions visual feedback", () => {
		expect(content).toContain("FEEDBACK.md");
	});

	it("mentions PRINCIPLES.md", () => {
		expect(content).toContain("PRINCIPLES.md");
	});
});
