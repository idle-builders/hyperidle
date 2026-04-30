import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	LEGACY_PROGRESS_PATH,
	loadAllProgress,
	loadProgress,
	loadRun,
	loadStoryProgress,
	migrateLegacyIfPresent,
	PROGRESS_DIR,
	RUN_PATH,
	saveStoryProgress,
} from "../progress.js";
import type { Story, StoryProgress } from "../types.js";

let originalCwd: string;
let tmpRoot: string;

beforeEach(() => {
	originalCwd = process.cwd();
	tmpRoot = mkdtempSync(join(tmpdir(), "pipeline-progress-"));
	process.chdir(tmpRoot);
});

afterEach(() => {
	process.chdir(originalCwd);
	rmSync(tmpRoot, { recursive: true, force: true });
});

function makeStory(id: string, track = "X"): Story {
	return {
		id,
		title: `Story ${id}`,
		track,
		complexity: "M",
		dependencies: [],
	};
}

function makeStoryProgress(id: string): StoryProgress {
	return {
		id,
		title: `Story ${id}`,
		status: "pending",
		currentStep: null,
		branch: null,
		worktree: null,
		sessionId: null,
		pr: null,
		attempts: 0,
		error: null,
		blockedReason: null,
		needsHuman: false,
		startedAt: null,
		completedAt: null,
	};
}

describe("saveStoryProgress / loadStoryProgress", () => {
	it("round-trips a single story", () => {
		const sp: StoryProgress = { ...makeStoryProgress("L7"), status: "in_progress" };
		saveStoryProgress(sp);
		const loaded = loadStoryProgress("L7");
		expect(loaded).toEqual(sp);
	});

	it("loadStoryProgress returns null for missing story", () => {
		expect(loadStoryProgress("Z9")).toBeNull();
	});

	it("each story is written to its own file", () => {
		saveStoryProgress(makeStoryProgress("A1"));
		saveStoryProgress(makeStoryProgress("A2"));
		expect(existsSync(join(PROGRESS_DIR, "A1.json"))).toBe(true);
		expect(existsSync(join(PROGRESS_DIR, "A2.json"))).toBe(true);
	});
});

describe("loadAllProgress", () => {
	it("returns empty array when progress dir does not exist", () => {
		expect(loadAllProgress()).toEqual([]);
	});

	it("returns every story file", () => {
		saveStoryProgress({ ...makeStoryProgress("A1"), status: "done" });
		saveStoryProgress({ ...makeStoryProgress("A2"), status: "in_progress" });
		saveStoryProgress({ ...makeStoryProgress("B1"), status: "pending" });
		const all = loadAllProgress();
		expect(all.map((s) => s.id).sort()).toEqual(["A1", "A2", "B1"]);
	});

	it("ignores non-json files in the progress dir", () => {
		saveStoryProgress(makeStoryProgress("A1"));
		writeFileSync(join(PROGRESS_DIR, "junk.txt"), "ignore me");
		expect(loadAllProgress().map((s) => s.id)).toEqual(["A1"]);
	});
});

describe("migrateLegacyIfPresent", () => {
	it("is a no-op when no legacy file exists", () => {
		migrateLegacyIfPresent();
		expect(existsSync(LEGACY_PROGRESS_PATH)).toBe(false);
		expect(loadAllProgress()).toEqual([]);
	});

	it("splits a legacy progress.json into per-story files and archives it", () => {
		const legacy = {
			target: "L",
			startedAt: "2026-04-01T00:00:00Z",
			lastSessionAt: "2026-04-29T00:00:00Z",
			stories: [
				{ ...makeStoryProgress("L1"), status: "done" },
				{ ...makeStoryProgress("L2"), status: "in_progress" },
			],
		};
		mkdirSync(dirname(LEGACY_PROGRESS_PATH), { recursive: true });
		writeFileSync(LEGACY_PROGRESS_PATH, JSON.stringify(legacy));

		migrateLegacyIfPresent();

		expect(
			loadAllProgress()
				.map((s) => s.id)
				.sort(),
		).toEqual(["L1", "L2"]);
		expect(loadStoryProgress("L1")?.status).toBe("done");
		expect(loadStoryProgress("L2")?.status).toBe("in_progress");
		expect(existsSync(LEGACY_PROGRESS_PATH)).toBe(false);
		expect(existsSync(`${LEGACY_PROGRESS_PATH}.legacy`)).toBe(true);
		const run = loadRun();
		expect(run?.target).toBe("L");
		expect(run?.startedAt).toBe("2026-04-01T00:00:00Z");
	});

	it("does not overwrite existing per-story files", () => {
		saveStoryProgress({ ...makeStoryProgress("L1"), status: "done", attempts: 7 });
		const legacy = {
			target: "L",
			startedAt: "2026-04-01T00:00:00Z",
			lastSessionAt: "2026-04-29T00:00:00Z",
			stories: [{ ...makeStoryProgress("L1"), status: "pending", attempts: 0 }],
		};
		mkdirSync(dirname(LEGACY_PROGRESS_PATH), { recursive: true });
		writeFileSync(LEGACY_PROGRESS_PATH, JSON.stringify(legacy));

		migrateLegacyIfPresent();

		// per-story file wins (it was newer / authoritative)
		const loaded = loadStoryProgress("L1");
		expect(loaded?.status).toBe("done");
		expect(loaded?.attempts).toBe(7);
	});
});

describe("initProgress", () => {
	it("creates a fresh progress directory and run.json on first call", async () => {
		const { initProgress } = await import("../progress.js");
		const stories: Story[] = [makeStory("A1"), makeStory("A2")];
		initProgress("A", stories);
		expect(
			loadAllProgress()
				.map((s) => s.id)
				.sort(),
		).toEqual(["A1", "A2"]);
		expect(loadRun()?.target).toBe("A");
	});

	it("preserves done stories across re-invocations", async () => {
		const { initProgress, updateStory } = await import("../progress.js");
		const stories: Story[] = [makeStory("A1"), makeStory("A2")];
		const state = initProgress("A", stories);
		updateStory(state, "A1", { status: "done", completedAt: new Date().toISOString() });

		const reloaded = initProgress("A", stories);
		const a1 = reloaded.stories.find((s) => s.id === "A1");
		expect(a1?.status).toBe("done");
	});

	it("resets in_progress stories to pending (previous session died)", async () => {
		const { initProgress, updateStory } = await import("../progress.js");
		const stories: Story[] = [makeStory("A1")];
		const state = initProgress("A", stories);
		updateStory(state, "A1", { status: "in_progress" });

		const reloaded = initProgress("A", stories);
		const a1 = reloaded.stories.find((s) => s.id === "A1");
		expect(a1?.status).toBe("pending");
	});
});

describe("loadProgress (compatibility view)", () => {
	it("returns null when nothing has been written", () => {
		expect(loadProgress()).toBeNull();
	});

	it("synthesizes a PipelineState from per-story files + run.json", async () => {
		const { initProgress, updateStory } = await import("../progress.js");
		const state = initProgress("A", [makeStory("A1"), makeStory("A2")]);
		updateStory(state, "A1", { status: "done" });

		const view = loadProgress();
		expect(view?.target).toBe("A");
		expect(view?.stories.find((s) => s.id === "A1")?.status).toBe("done");
		expect(view?.stories.find((s) => s.id === "A2")?.status).toBe("pending");
	});
});

describe("paths", () => {
	it("PROGRESS_DIR + RUN_PATH live under .pipeline", () => {
		expect(PROGRESS_DIR).toBe(".pipeline/progress");
		expect(RUN_PATH).toBe(".pipeline/run.json");
		expect(LEGACY_PROGRESS_PATH).toBe(".pipeline/progress.json");
	});
});
