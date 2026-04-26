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
	it("loads every track including the latest", () => {
		const stories = loadManifest(manifestPath);
		const tracks = new Set(stories.map((s) => s.track));
		expect(tracks.size).toBeGreaterThanOrEqual(11);
		expect(tracks.has("L")).toBe(true);
	});

	it("L track contains all 10 stories", () => {
		const stories = loadManifest(manifestPath);
		const ids = stories.filter((s) => s.track === "L").map((s) => s.id);
		expect(ids).toEqual(["L1", "L2", "L3", "L4", "L5", "L6", "L7", "L8", "L9", "L10"]);
	});
});

describe("filterStories", () => {
	it("'L' returns every L-track story", () => {
		const stories = loadManifest(manifestPath);
		const lOnly = filterStories(stories, "L");
		expect(lOnly.length).toBe(10);
		expect(lOnly.every((s) => s.track === "L")).toBe(true);
	});

	it("'L1 L2' returns the two specific stories", () => {
		const stories = loadManifest(manifestPath);
		const subset = filterStories(stories, "L1 L2");
		expect(subset.map((s) => s.id).sort()).toEqual(["L1", "L2"]);
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
