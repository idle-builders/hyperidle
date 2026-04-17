import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { PipelineState, Story, StoryProgress } from "./types.js";

const PROGRESS_PATH = ".pipeline/progress.json";

export function initProgress(target: string, stories: Story[]): PipelineState {
	const existing = loadProgress();
	const existingMap = new Map(existing?.stories.map((s) => [s.id, s]) ?? []);
	// Start with all existing stories (preserves history like A1=done)
	const merged = new Map(existingMap);

	// Add/update target stories
	for (const s of stories) {
		const prev = existingMap.get(s.id);
		if (prev && prev.status === "done") {
			// Already done — keep it
		} else if (prev && prev.status === "in_progress") {
			// Previous session died mid-story — reset to pending
			merged.set(s.id, { ...prev, status: "pending" as const });
		} else if (!prev) {
			merged.set(s.id, makeStoryProgress(s));
		}
	}

	const state: PipelineState = {
		target,
		startedAt: existing?.startedAt ?? new Date().toISOString(),
		lastSessionAt: new Date().toISOString(),
		stories: [...merged.values()],
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
	mkdirSync(dirname(PROGRESS_PATH), { recursive: true });
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
