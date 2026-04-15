import { existsSync, readFileSync, writeFileSync } from "node:fs";
import type { PipelineState, Story, StoryProgress } from "./types.js";

const PROGRESS_PATH = ".claude/pipeline-progress.json";

export function initProgress(target: string, stories: Story[]): PipelineState {
	const existing = loadProgress();

	// Merge: keep done stories from previous runs, add new ones as pending
	const existingMap = new Map(existing?.stories.map((s) => [s.id, s]) ?? []);

	const merged: StoryProgress[] = stories.map((s) => {
		const prev = existingMap.get(s.id);
		if (prev && prev.status === "done") return prev;
		if (prev && prev.status === "in_progress") {
			// Previous session died mid-story — reset to pending
			return { ...prev, status: "pending" as const, attempts: prev.attempts };
		}
		return makeStoryProgress(s);
	});

	const state: PipelineState = {
		target,
		startedAt: existing?.startedAt ?? new Date().toISOString(),
		lastSessionAt: new Date().toISOString(),
		stories: merged,
	};

	saveProgress(state);
	return state;
}

export function loadProgress(): PipelineState | null {
	if (!existsSync(PROGRESS_PATH)) return null;
	return JSON.parse(readFileSync(PROGRESS_PATH, "utf-8")) as PipelineState;
}

export function saveProgress(state: PipelineState): void {
	state.lastSessionAt = new Date().toISOString();
	writeFileSync(PROGRESS_PATH, JSON.stringify(state, null, "\t"));
}

export function updateStory(
	state: PipelineState,
	storyId: string,
	update: Partial<StoryProgress>,
): void {
	const story = state.stories.find((s) => s.id === storyId);
	if (!story) return;
	Object.assign(story, update);
	saveProgress(state);
}

function makeStoryProgress(story: Story): StoryProgress {
	return {
		id: story.id,
		title: story.title,
		status: "pending",
		branch: null,
		worktree: null,
		sessionId: null,
		pr: null,
		attempts: 0,
		error: null,
		blockedReason: null,
		needsHuman: false,
		cost: 0,
		startedAt: null,
		completedAt: null,
	};
}
