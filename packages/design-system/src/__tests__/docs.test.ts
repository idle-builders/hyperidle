import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const DS_ROOT = resolve(__dirname, "../..");

describe("DESIGN.md", () => {
	const content = readFileSync(resolve(DS_ROOT, "DESIGN.md"), "utf-8");

	it("exists and has content", () => {
		expect(content.length).toBeGreaterThan(500);
	});

	it("references THEMES.md for style alternatives", () => {
		expect(content).toContain("THEMES.md");
	});

	it("references PRINCIPLES.md", () => {
		expect(content).toContain("PRINCIPLES.md");
	});

	it("documents surface tokens", () => {
		expect(content).toContain("--surface-0");
		expect(content).toContain("--surface-6");
	});

	it("documents accent tokens", () => {
		expect(content).toContain("--primary");
		expect(content).toContain("--warn");
		expect(content).toContain("--ok");
		expect(content).toContain("--danger");
	});

	it("documents border tokens", () => {
		expect(content).toContain("--border-subtle");
		expect(content).toContain("--border-default");
		expect(content).toContain("--border-emphasis");
	});

	it("documents typography", () => {
		expect(content).toContain("Inter");
		expect(content).toContain("Space Grotesk");
	});

	it("documents density presets", () => {
		expect(content).toContain("--density-pad-x");
		expect(content).toContain("Compact");
		expect(content).toContain("Comfortable");
	});
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

	it("covers the AI aesthetic blacklist", () => {
		expect(content).toContain("AI Aesthetic Blacklist");
		expect(content).toContain("Purple");
		expect(content).toContain("Gradient");
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

	it("documents all 4 themes", () => {
		expect(content).toContain("Factory Dark");
		expect(content).toContain("Calm Precision");
		expect(content).toContain("Light Operations Center");
		expect(content).toContain("Monochrome Machine");
	});

	it("includes strengths and weaknesses for each", () => {
		expect(content).toContain("Strengths");
		expect(content).toContain("Weaknesses");
	});

	it("references theme CSS files", () => {
		expect(content).toContain("factory-dark.css");
		expect(content).toContain("calm-precision.css");
		expect(content).toContain("light-ops.css");
		expect(content).toContain("mono-machine.css");
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
