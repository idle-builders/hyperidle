import { readFileSync } from "node:fs";
import { parse } from "yaml";
import type { Story } from "./types.js";

interface RawManifest {
	stories: Array<{
		id: string;
		title: string;
		track: string;
		depends: string[];
	}>;
}

export function loadManifest(path: string): Story[] {
	const raw = readFileSync(path, "utf-8");
	const manifest = parse(raw) as RawManifest;
	return manifest.stories.map((s) => ({
		id: s.id,
		title: s.title,
		track: s.track,
		dependencies: s.depends,
	}));
}

export function filterStories(stories: Story[], target: string): Story[] {
	if (target === "all") return stories;

	const ids = target.split(/\s+/);

	// Single letter = track name
	const first = ids[0] ?? "";
	if (ids.length === 1 && /^[A-Z]+$/i.test(first)) {
		const track = first.toUpperCase();
		return stories.filter((s) => s.track.toUpperCase() === track);
	}

	// Specific story IDs
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
