import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

export interface SkillFrontmatter {
	name: string;
	description?: string;
	minToolCalls?: number;
}

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---/;

export function parseSkillFrontmatter(source: string): SkillFrontmatter | null {
	const match = source.match(FRONTMATTER_RE);
	if (!match) return null;
	const body = match[1];
	const result: SkillFrontmatter = { name: "" };
	for (const rawLine of body.split(/\r?\n/)) {
		const line = rawLine.trim();
		if (!line || line.startsWith("#")) continue;
		const colon = line.indexOf(":");
		if (colon < 0) continue;
		const key = line.slice(0, colon).trim();
		const valueRaw = line.slice(colon + 1).trim();
		const value = stripQuotes(valueRaw);
		if (key === "name") result.name = value;
		else if (key === "description") result.description = value;
		else if (key === "min_tool_calls") {
			const n = Number.parseInt(value, 10);
			if (!Number.isNaN(n) && n >= 0) result.minToolCalls = n;
		}
	}
	return result.name ? result : null;
}

function stripQuotes(s: string): string {
	if (s.length >= 2) {
		const first = s[0];
		const last = s[s.length - 1];
		if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
			return s.slice(1, -1);
		}
	}
	return s;
}

export function readSkillFrontmatter(skillDir: string): SkillFrontmatter | null {
	const path = join(skillDir, "SKILL.md");
	if (!existsSync(path)) return null;
	return parseSkillFrontmatter(readFileSync(path, "utf-8"));
}

export function loadAllSkillFrontmatter(skillsRoot: string): Map<string, SkillFrontmatter> {
	const out = new Map<string, SkillFrontmatter>();
	if (!existsSync(skillsRoot)) return out;
	for (const entry of readdirSync(skillsRoot)) {
		const dir = join(skillsRoot, entry);
		if (!statSync(dir).isDirectory()) continue;
		const fm = readSkillFrontmatter(dir);
		if (fm) out.set(fm.name, fm);
	}
	return out;
}
