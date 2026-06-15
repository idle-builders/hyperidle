import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	renameSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { decodeTyped, encodeTyped } from "@hyperidle/shared";
import type { PipelineState, Story, StoryProgress } from "./types.js";

export const PROGRESS_DIR = ".pipeline/progress";
export const RUN_PATH = ".pipeline/run.json";
export const LEGACY_PROGRESS_PATH = ".pipeline/progress.json";

export interface RunMeta {
	target: string;
	startedAt: string;
	lastSessionAt: string;
}

// @lore Per-story progress files were introduced to remove the multi-writer
// race on a shared progress.json. Each running agent owns exactly one file
// per story it's working on; the scheduler owns run.json. fs.rename gives us
// atomic single-file writes on the same filesystem, so partial writes from a
// crashed process can't be observed by readers.
//
// @lore TE-5 (block 1a plumbing): per-story files are now written as .toon
// (more compact, fewer cache writes when reread by agents). Reads honor both
// .toon and the legacy .json for one release; loadAllProgress prefers .toon
// when both exist for the same id (defensive — only happens if a legacy
// runner crashes mid-write before the .json is replaced).
function atomicWriteString(path: string, body: string): void {
	mkdirSync(dirOf(path), { recursive: true });
	const tmp = `${path}.tmp.${process.pid}.${Math.random().toString(36).slice(2)}`;
	writeFileSync(tmp, body);
	renameSync(tmp, path);
}

function atomicWriteJson(path: string, value: unknown): void {
	atomicWriteString(path, JSON.stringify(value, null, "\t"));
}

function atomicWriteToon<T extends object>(path: string, value: T): void {
	atomicWriteString(path, encodeTyped(value));
}

function dirOf(path: string): string {
	const i = path.lastIndexOf("/");
	return i < 0 ? "." : path.slice(0, i);
}

function storyPath(id: string): string {
	return join(PROGRESS_DIR, `${id}.toon`);
}

function legacyStoryPath(id: string): string {
	return join(PROGRESS_DIR, `${id}.json`);
}

function readStoryFile(path: string): StoryProgress {
	if (path.endsWith(".toon")) {
		return decodeTyped<StoryProgress>(readFileSync(path, "utf-8"));
	}
	return JSON.parse(readFileSync(path, "utf-8")) as StoryProgress;
}

export function loadStoryProgress(id: string): StoryProgress | null {
	const toonPath = storyPath(id);
	if (existsSync(toonPath)) return readStoryFile(toonPath);
	const jsonPath = legacyStoryPath(id);
	if (existsSync(jsonPath)) return readStoryFile(jsonPath);
	return null;
}

export function saveStoryProgress(progress: StoryProgress): void {
	atomicWriteToon(storyPath(progress.id), progress);
}

export function loadAllProgress(): StoryProgress[] {
	if (!existsSync(PROGRESS_DIR)) return [];
	const seen = new Set<string>();
	const out: StoryProgress[] = [];
	const entries = readdirSync(PROGRESS_DIR);
	// Prefer .toon over .json when both exist for the same id.
	for (const entry of entries) {
		if (!entry.endsWith(".toon")) continue;
		const id = entry.slice(0, -".toon".length);
		seen.add(id);
		out.push(readStoryFile(join(PROGRESS_DIR, entry)));
	}
	for (const entry of entries) {
		if (!entry.endsWith(".json")) continue;
		const id = entry.slice(0, -".json".length);
		if (seen.has(id)) continue;
		out.push(readStoryFile(join(PROGRESS_DIR, entry)));
	}
	return out;
}

export function loadRun(): RunMeta | null {
	if (!existsSync(RUN_PATH)) return null;
	return JSON.parse(readFileSync(RUN_PATH, "utf-8")) as RunMeta;
}

export function saveRun(run: RunMeta): void {
	atomicWriteJson(RUN_PATH, run);
}

/**
 * If a legacy `.pipeline/progress.json` exists, split it into per-story files
 * (without overwriting any existing per-story file — the per-story file is the
 * authoritative source if one is already present), persist its run-level
 * metadata to run.json, and rename the legacy file to `progress.json.legacy`.
 */
export function migrateLegacyIfPresent(): void {
	if (!existsSync(LEGACY_PROGRESS_PATH)) return;
	const legacy = JSON.parse(readFileSync(LEGACY_PROGRESS_PATH, "utf-8")) as PipelineState;

	mkdirSync(PROGRESS_DIR, { recursive: true });
	for (const story of legacy.stories) {
		const path = storyPath(story.id);
		if (existsSync(path)) continue;
		if (existsSync(legacyStoryPath(story.id))) continue;
		atomicWriteToon(path, story);
	}

	if (!existsSync(RUN_PATH)) {
		saveRun({
			target: legacy.target,
			startedAt: legacy.startedAt,
			lastSessionAt: legacy.lastSessionAt,
		});
	}

	renameSync(LEGACY_PROGRESS_PATH, `${LEGACY_PROGRESS_PATH}.legacy`);
}

export function initProgress(target: string, stories: Story[]): PipelineState {
	migrateLegacyIfPresent();

	const existingByid = new Map(loadAllProgress().map((s) => [s.id, s]));
	const merged = new Map<string, StoryProgress>(existingByid);

	for (const s of stories) {
		const prev = existingByid.get(s.id);
		if (prev?.status === "done") {
			// keep
		} else if (prev?.status === "in_progress") {
			merged.set(s.id, { ...prev, status: "pending" });
		} else if (!prev) {
			merged.set(s.id, makeStoryProgress(s));
		}
	}

	for (const story of merged.values()) {
		saveStoryProgress(story);
	}

	const now = new Date().toISOString();
	const run = loadRun();
	const runMeta: RunMeta = {
		target,
		startedAt: run?.startedAt ?? now,
		lastSessionAt: now,
	};
	saveRun(runMeta);

	return {
		target: runMeta.target,
		startedAt: runMeta.startedAt,
		lastSessionAt: runMeta.lastSessionAt,
		stories: [...merged.values()],
	};
}

/**
 * Compatibility view used by callers that still consume the legacy
 * `PipelineState` shape. Reads run.json + every per-story file and returns
 * them in one object. Returns null when neither exists.
 */
export function loadProgress(): PipelineState | null {
	const run = loadRun();
	const stories = loadAllProgress();
	if (!run && stories.length === 0) return null;
	return {
		target: run?.target ?? "",
		startedAt: run?.startedAt ?? "",
		lastSessionAt: run?.lastSessionAt ?? "",
		stories,
	};
}

export function updateStory(
	state: PipelineState,
	storyId: string,
	update: Partial<StoryProgress>,
): void {
	const story = state.stories.find((s) => s.id === storyId);
	if (!story) return;
	Object.assign(story, update);
	saveStoryProgress(story);

	const now = new Date().toISOString();
	state.lastSessionAt = now;
	const run = loadRun();
	if (run) saveRun({ ...run, lastSessionAt: now });
}

function makeStoryProgress(story: Story): StoryProgress {
	return {
		id: story.id,
		title: story.title,
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
