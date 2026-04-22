import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SKILL_DIR = resolve(__dirname, "../../../../.claude/skills/design-critique");
const REFS_DIR = resolve(SKILL_DIR, "references");

describe("design-critique skill", () => {
	describe("SKILL.md", () => {
		const skillPath = resolve(SKILL_DIR, "SKILL.md");
		const content = existsSync(skillPath) ? readFileSync(skillPath, "utf-8") : "";

		it("exists", () => {
			expect(existsSync(skillPath)).toBe(true);
		});

		it("has valid YAML frontmatter with required fields", () => {
			expect(content).toMatch(/^---\n/);
			expect(content).toContain("name: design-critique");
			expect(content).toContain("description:");
			expect(content).toContain("user-invocable: true");
		});

		it("description uses directive format for reliable activation", () => {
			const descMatch = content.match(/description:\s*"([^"]+)"/);
			expect(descMatch).not.toBeNull();
			const desc = descMatch?.[1] ?? "";
			expect(desc).toContain("ALWAYS");
		});

		it("defines the 8 scoring dimensions", () => {
			expect(content).toContain("Visual Hierarchy");
			expect(content).toContain("Spacing & Density");
			expect(content).toContain("Typography");
			expect(content).toContain("Color Usage");
			expect(content).toContain("Component Coherence");
			expect(content).toContain("States & Feedback");
			expect(content).toContain("Accessibility");
			expect(content).toContain("Anti-Slop Check");
		});

		it("defines scoring guide (0-10)", () => {
			expect(content).toContain("9-10");
			expect(content).toContain("7-8");
			expect(content).toContain("5-6");
			expect(content).toContain("3-4");
			expect(content).toContain("0-2");
		});

		it("references PRINCIPLES.md and DESIGN.md", () => {
			expect(content).toContain("PRINCIPLES.md");
			expect(content).toContain("DESIGN.md");
		});

		it("is under 500 lines (progressive disclosure best practice)", () => {
			const lineCount = content.split("\n").length;
			expect(lineCount).toBeLessThan(500);
		});
	});

	describe("reference files", () => {
		const expectedRefs = [
			"hierarchy.md",
			"spacing.md",
			"typography.md",
			"color.md",
			"finishing.md",
		];

		for (const ref of expectedRefs) {
			it(`references/${ref} exists and has content`, () => {
				const refPath = resolve(REFS_DIR, ref);
				expect(existsSync(refPath), `${ref} missing`).toBe(true);
				const content = readFileSync(refPath, "utf-8");
				expect(content.length).toBeGreaterThan(100);
			});
		}

		it("hierarchy.md covers the three text levels", () => {
			const content = readFileSync(resolve(REFS_DIR, "hierarchy.md"), "utf-8");
			expect(content).toContain("Primary");
			expect(content).toContain("Secondary");
			expect(content).toContain("Tertiary");
		});

		it("spacing.md covers the 4px grid", () => {
			const content = readFileSync(resolve(REFS_DIR, "spacing.md"), "utf-8");
			expect(content).toContain("4px");
		});

		it("typography.md covers the type scale", () => {
			const content = readFileSync(resolve(REFS_DIR, "typography.md"), "utf-8");
			expect(content).toContain("24px");
			expect(content).toContain("14px");
			expect(content).toContain("11px");
		});

		it("color.md covers semantic token usage", () => {
			const content = readFileSync(resolve(REFS_DIR, "color.md"), "utf-8");
			expect(content).toContain("--text-hi");
			expect(content).toContain("--surface-");
		});

		it("finishing.md covers hover, focus, and transition states", () => {
			const content = readFileSync(resolve(REFS_DIR, "finishing.md"), "utf-8");
			expect(content).toContain("hover");
			expect(content).toContain("focus");
			expect(content).toContain("transition");
		});
	});
});

describe("skill discovery integration", () => {
	const discoveryPath = resolve(__dirname, "../../../../.claude/rules/skill-discovery.md");

	it("skill-discovery.md includes design-critique", () => {
		const content = readFileSync(discoveryPath, "utf-8");
		expect(content).toContain("design-critique");
	});
});
