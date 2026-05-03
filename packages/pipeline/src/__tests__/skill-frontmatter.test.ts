import { readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
	loadAllSkillFrontmatter,
	parseSkillFrontmatter,
	readSkillFrontmatter,
} from "../skill-frontmatter.js";

const repoRoot = resolve(__dirname, "../../../..");
const skillsRoot = join(repoRoot, ".claude", "skills");

describe("parseSkillFrontmatter", () => {
	it("parses name, description, min_tool_calls", () => {
		const fm = parseSkillFrontmatter(
			'---\nname: foo\ndescription: "Does foo"\nmin_tool_calls: 7\n---\nbody',
		);
		expect(fm).toEqual({ name: "foo", description: "Does foo", minToolCalls: 7 });
	});

	it("returns null when frontmatter is absent", () => {
		expect(parseSkillFrontmatter("# No frontmatter\nplain body")).toBeNull();
	});

	it("returns null when name is missing", () => {
		expect(parseSkillFrontmatter("---\ndescription: foo\n---\nbody")).toBeNull();
	});

	it("ignores invalid min_tool_calls (non-integer)", () => {
		const fm = parseSkillFrontmatter("---\nname: foo\nmin_tool_calls: lots\n---\nbody");
		expect(fm).toEqual({ name: "foo" });
	});

	it("treats negative min_tool_calls as invalid", () => {
		const fm = parseSkillFrontmatter("---\nname: foo\nmin_tool_calls: -3\n---\nbody");
		expect(fm).toEqual({ name: "foo" });
	});

	it("strips matched single quotes", () => {
		const fm = parseSkillFrontmatter("---\nname: 'foo'\n---\n");
		expect(fm).toEqual({ name: "foo" });
	});
});

describe("readSkillFrontmatter", () => {
	it("reads each shipped SKILL.md", () => {
		for (const dir of readdirSync(skillsRoot)) {
			const fm = readSkillFrontmatter(join(skillsRoot, dir));
			expect(fm, `skill ${dir} must have frontmatter`).not.toBeNull();
			expect(fm?.name, `skill ${dir} must have a name`).toBeTruthy();
		}
	});
});

describe("loadAllSkillFrontmatter", () => {
	const all = loadAllSkillFrontmatter(skillsRoot);

	it("loads every shipped skill", () => {
		const dirNames = readdirSync(skillsRoot);
		expect(all.size).toBe(dirNames.length);
	});

	it("every skill declares min_tool_calls (positive integer)", () => {
		for (const [name, fm] of all) {
			expect(fm.minToolCalls, `${name} must declare min_tool_calls`).toBeGreaterThan(0);
		}
	});
});
