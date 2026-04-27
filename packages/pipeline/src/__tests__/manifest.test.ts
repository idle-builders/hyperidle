import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
	filterStories,
	loadManifest,
	MANIFEST_RELATIVE_PATH,
	validateDependencies,
} from "../manifest.js";

const repoRoot = resolve(__dirname, "../../../..");
const manifestPath = `${repoRoot}/${MANIFEST_RELATIVE_PATH}`;

describe("MANIFEST_RELATIVE_PATH", () => {
	it("points at a file that actually exists in the repo", () => {
		expect(existsSync(manifestPath)).toBe(true);
	});
});

describe("loadManifest", () => {
	it("loads multiple tracks", () => {
		const stories = loadManifest(manifestPath);
		const tracks = new Set(stories.map((s) => s.track));
		expect(tracks.size).toBeGreaterThanOrEqual(10);
		expect(tracks.has("K")).toBe(true);
	});

	it("K track contains stories", () => {
		const stories = loadManifest(manifestPath);
		const ids = stories.filter((s) => s.track === "K").map((s) => s.id);
		expect(ids.length).toBeGreaterThan(0);
		expect(ids.every((id) => id.startsWith("K"))).toBe(true);
	});
});

describe("filterStories", () => {
	it("'K' returns every K-track story", () => {
		const stories = loadManifest(manifestPath);
		const kOnly = filterStories(stories, "K");
		expect(kOnly.length).toBeGreaterThan(0);
		expect(kOnly.every((s) => s.track === "K")).toBe(true);
	});

	it("space-separated story ids return only those stories", () => {
		const stories = loadManifest(manifestPath);
		const allKIds = stories.filter((s) => s.track === "K").map((s) => s.id);
		const [first, second] = allKIds;
		if (!first || !second) throw new Error("expected at least 2 K stories");
		const subset = filterStories(stories, `${first} ${second}`);
		expect(subset.map((s) => s.id).sort()).toEqual([first, second].sort());
	});

	it("unknown target returns empty array (caller logs an error)", () => {
		const stories = loadManifest(manifestPath);
		expect(filterStories(stories, "Z9")).toEqual([]);
	});
});

describe("validateDependencies", () => {
	it("the shipped manifest has no dangling dependencies", () => {
		const stories = loadManifest(manifestPath);
		expect(validateDependencies(stories)).toEqual([]);
	});
});
