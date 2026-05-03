import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const DESIGN_SKILL = resolve(__dirname, "../../../../.claude/skills/design/SKILL.md");

describe("design skill (post-block-1b: design-critique collapsed into /design)", () => {
	const content = existsSync(DESIGN_SKILL) ? readFileSync(DESIGN_SKILL, "utf-8") : "";

	it("exists", () => {
		expect(existsSync(DESIGN_SKILL)).toBe(true);
	});

	it("has valid YAML frontmatter with required fields", () => {
		expect(content).toMatch(/^---\n/);
		expect(content).toContain("name: design");
		expect(content).toContain("description:");
		expect(content).toContain("user-invocable: true");
	});

	it("embeds the 9 scoring dimensions previously owned by /design-critique", () => {
		expect(content).toContain("Visual hierarchy");
		expect(content).toContain("Spacing & density");
		expect(content).toContain("Typography");
		expect(content).toContain("Color");
		expect(content).toContain("Component coherence");
		expect(content).toContain("States & feedback");
		expect(content).toContain("Accessibility");
		expect(content).toContain("Anti-slop");
		expect(content).toContain("Premium polish");
	});

	it("classifies stories routine | routine-low-conf | novel (TE-18)", () => {
		expect(content).toContain("DESIGN-CLASS");
		expect(content).toContain("routine");
		expect(content).toContain("novel");
	});

	it("emits a critique-pass output line so retros can read iteration count", () => {
		expect(content).toContain("DESIGN-CRITIQUE");
		expect(content).toContain("rounds=");
	});

	it("references PRINCIPLES.md and DESIGN.md", () => {
		expect(content).toContain("PRINCIPLES.md");
		expect(content).toContain("DESIGN.md");
	});
});

describe("design skill reference files (per-dimension critique material)", () => {
	const REFS_DIR = resolve(__dirname, "../../../../.claude/skills/design/references");
	const expectedRefs = ["hierarchy.md", "spacing.md", "typography.md", "color.md", "finishing.md"];

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

	it("the design skill cites each reference file", () => {
		const skill = readFileSync(DESIGN_SKILL, "utf-8");
		for (const ref of expectedRefs) {
			expect(skill, `SKILL.md does not link references/${ref}`).toContain(`references/${ref}`);
		}
	});
});

describe("skill discovery integration", () => {
	const discoveryPath = resolve(__dirname, "../../../../.claude/rules/skill-discovery.md");

	it("skill-discovery.md still routes UI exploration to /design", () => {
		const content = readFileSync(discoveryPath, "utf-8");
		expect(content).toContain("/design");
	});
});
