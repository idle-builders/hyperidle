import type { StoryProgress, StoryStatus } from "./types.js";

export interface AgentFeed {
	storyId: string;
	lines: string[];
	status: StoryStatus;
	step: string;
	elapsed: number;
	cost: number;
}

export interface PipelineStore {
	feeds: Map<string, AgentFeed>;
	selectedStory: string | null;
	approvals: ApprovalRequest[];
	totalCost: number;
	startedAt: number;
	stories: StoryProgress[];
}

export interface ApprovalRequest {
	id: string;
	storyId: string;
	toolName: string;
	input: string;
	resolve: (allowed: boolean) => void;
}

const store: PipelineStore = {
	feeds: new Map(),
	selectedStory: null,
	approvals: [],
	totalCost: 0,
	startedAt: Date.now(),
	stories: [],
};

const listeners: Array<() => void> = [];

export function getStore(): PipelineStore {
	return store;
}

export function subscribe(listener: () => void): () => void {
	listeners.push(listener);
	return () => {
		const idx = listeners.indexOf(listener);
		if (idx >= 0) listeners.splice(idx, 1);
	};
}

function notify(): void {
	for (const l of listeners) l();
}

export function initFeed(storyId: string): void {
	store.feeds.set(storyId, {
		storyId,
		lines: [],
		status: "in_progress",
		step: "starting",
		elapsed: 0,
		cost: 0,
	});
	if (!store.selectedStory) store.selectedStory = storyId;
	notify();
}

export function appendOutput(storyId: string, text: string): void {
	const feed = store.feeds.get(storyId);
	if (!feed) return;
	for (const line of text.split("\n")) {
		if (line.trim()) feed.lines.push(line);
	}
	// Keep last 500 lines
	if (feed.lines.length > 500) {
		feed.lines.splice(0, feed.lines.length - 500);
	}
	notify();
}

export function updateFeedStatus(storyId: string, status: StoryStatus, cost?: number): void {
	const feed = store.feeds.get(storyId);
	if (!feed) return;
	feed.status = status;
	if (cost !== undefined) {
		feed.cost = cost;
		store.totalCost = [...store.feeds.values()].reduce((sum, f) => sum + f.cost, 0);
	}
	notify();
}

export function setSelectedStory(storyId: string): void {
	store.selectedStory = storyId;
	notify();
}

export function addApproval(request: ApprovalRequest): void {
	store.approvals.push(request);
	notify();
}

export function removeApproval(id: string): void {
	store.approvals = store.approvals.filter((a) => a.id !== id);
	notify();
}

export function setStories(stories: StoryProgress[]): void {
	store.stories = stories;
	notify();
}
