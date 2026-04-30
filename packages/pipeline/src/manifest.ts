import { readFileSync } from "node:fs";
import { parse } from "yaml";
import type { Complexity, Story } from "./types.js";

/**
 * Canonical path of the work-package manifest, relative to the repository root.
 *
 * Lives at `docs/work-packages/pipeline-manifest.yaml` since commit ff35161
 * (cleanup docs folder) — the scheduler used to read `docs/pipeline-manifest.yaml`
 * and silently produced "0 done | 0 active" for every target. The exported
 * constant + path-existence test below pin this so future doc reorganizations
 * can't regress it without a red test.
 */
export const MANIFEST_RELATIVE_PATH = "docs/work-packages/pipeline-manifest.yaml";

interface RawManifest {
	stories: Array<{
		id: string;
		title: string;
		track: string;
		depends: string[];
		complexity?: string;
	}>;
}

// @lore complexity is optional in the manifest; missing entries default to "M"
// (solo agent, same shape as the pre-grouping behavior). New stories created
// via /work-planning must specify it. S = batchable, M/L = solo.
const DEFAULT_COMPLEXITY: Complexity = "M";

function parseComplexity(raw: string | undefined, storyId: string): Complexity {
	if (raw === undefined) return DEFAULT_COMPLEXITY;
	if (raw === "S" || raw === "M" || raw === "L") return raw;
	throw new Error(`Story ${storyId} has invalid complexity ${JSON.stringify(raw)}; expected S|M|L`);
}

export function loadManifest(path: string): Story[] {
	const raw = readFileSync(path, "utf-8");
	const manifest = parse(raw) as RawManifest;
	return manifest.stories.map((s) => ({
		id: s.id,
		title: s.title,
		track: s.track,
		complexity: parseComplexity(s.complexity, s.id),
		dependencies: s.depends,
	}));
}

export function filterStories(stories: Story[], target: string): Story[] {
	if (target === "all") return stories;

	const ids = target.split(/\s+/);

	// Check if ALL tokens are single letters = track names (e.g. "A B C D E")
	const allTracks = ids.every((id) => /^[A-Z]$/i.test(id));
	if (allTracks) {
		const tracks = new Set(ids.map((id) => id.toUpperCase()));
		return stories.filter((s) => tracks.has(s.track.toUpperCase()));
	}

	// Otherwise treat as specific story IDs (e.g. "A2 A3 B1")
	const idSet = new Set(ids.map((id) => id.toUpperCase()));
	return stories.filter((s) => idSet.has(s.id.toUpperCase()));
}

export function getReadyStories(
	stories: Story[],
	done: Set<string>,
	inProgress: Set<string>,
	blocked: Set<string>,
): Story[] {
	return stories.filter((s) => {
		if (done.has(s.id) || inProgress.has(s.id) || blocked.has(s.id)) {
			return false;
		}
		return s.dependencies.every((dep) => done.has(dep));
	});
}

export function validateDependencies(stories: Story[]): string[] {
	const ids = new Set(stories.map((s) => s.id));
	const errors: string[] = [];
	for (const story of stories) {
		for (const dep of story.dependencies) {
			if (!ids.has(dep)) {
				errors.push(`${story.id} depends on ${dep} which is not in the manifest`);
			}
		}
	}
	return errors;
}
