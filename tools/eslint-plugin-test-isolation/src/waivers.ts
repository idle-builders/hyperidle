import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PACKAGE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const REPO_ROOT = resolve(PACKAGE_DIR, "..", "..");
const WAIVERS_PATH = resolve(PACKAGE_DIR, "waivers.md");

export type WaiverSets = Record<string, Set<string>>;

/**
 * Waiver shape: one `## <rule-name>` section per rule; each entry is a
 * `- \`repo/relative/path\`` line. Anything else is prose.
 */
export function parseWaivers(markdown: string): WaiverSets {
	const sets: WaiverSets = {};
	let current: Set<string> | undefined;
	for (const line of markdown.split("\n")) {
		const heading = /^##\s+(\S+)\s*$/.exec(line);
		if (heading) {
			const name = heading[1];
			if (name !== undefined) {
				const existing = sets[name];
				if (existing) {
					current = existing;
				} else {
					const created = new Set<string>();
					sets[name] = created;
					current = created;
				}
			}
			continue;
		}
		if (!current) continue;
		const entry = /^-\s+`([^`]+)`/.exec(line);
		const path = entry?.[1];
		if (path !== undefined) current.add(path);
	}
	return sets;
}

let cached: WaiverSets | null = null;

/**
 * @lore AU38: waivers.md is the ratchet — it lists every not-yet-migrated
 * file per rule and only shrinks (empty for R1 at increment 8). The rules
 * read it here so a listed file is suppressed repo-wide; resolution anchors
 * on this module's own path, so it works regardless of lint cwd.
 */
export function loadWaivers(): WaiverSets {
	if (cached) return cached;
	let text = "";
	try {
		text = readFileSync(WAIVERS_PATH, "utf8");
	} catch {
		text = "";
	}
	cached = parseWaivers(text);
	return cached;
}

export function isWaived(ruleName: string, repoRelativePath: string): boolean {
	return loadWaivers()[ruleName]?.has(repoRelativePath) ?? false;
}
