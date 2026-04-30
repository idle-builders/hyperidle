export type Complexity = "S" | "M" | "L";

export interface Story {
	id: string;
	title: string;
	track: string;
	complexity: Complexity;
	dependencies: string[];
}

export type StoryStatus = "pending" | "in_progress" | "done" | "failed" | "blocked";

export interface StoryProgress {
	id: string;
	title: string;
	status: StoryStatus;
	currentStep: number | null;
	branch: string | null;
	worktree: string | null;
	sessionId: string | null;
	pr: number | null;
	attempts: number;
	error: string | null;
	blockedReason: string | null;
	needsHuman: boolean;
	startedAt: string | null;
	completedAt: string | null;
}

export interface PipelineState {
	target: string;
	startedAt: string;
	lastSessionAt: string;
	stories: StoryProgress[];
}

export interface PipelineOptions {
	target: string;
	concurrency: number;
	interactive: boolean;
	cwd: string;
}

export interface AgentStatus {
	storyId: string;
	step: string;
	elapsed: number;
}
