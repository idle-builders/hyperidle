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

describe("skill discovery integration", () => {
	const discoveryPath = resolve(__dirname, "../../../../.claude/rules/skill-discovery.md");

	it("skill-discovery.md still routes UI exploration to /design", () => {
		const content = readFileSync(discoveryPath, "utf-8");
		expect(content).toContain("/design");
	});
});
