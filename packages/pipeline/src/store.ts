import type { StoryProgress, StoryStatus } from "./types.js";

export interface ToolCall {
	id: string;
	name: string;
	status: "running" | "done";
	elapsed: number;
	parentTaskId?: string;
}

export interface SubAgent {
	taskId: string;
	description: string;
	status: "running" | "completed" | "failed";
	lastTool?: string;
	tokenCount?: number;
	toolUses?: number;
}

export interface AgentFeed {
	storyId: string;
	lines: string[];
	status: StoryStatus;
	cost: number;
	tools: Map<string, ToolCall>;
	subagents: Map<string, SubAgent>;
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
		cost: 0,
		tools: new Map(),
		subagents: new Map(),
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

export function updateToolCall(storyId: string, tool: ToolCall): void {
	const feed = store.feeds.get(storyId);
	if (!feed) return;
	feed.tools.set(tool.id, tool);
	// Clean up old completed tools (keep last 20)
	const tools = [...feed.tools.entries()];
	if (tools.length > 20) {
		const done = tools.filter(([, t]) => t.status === "done");
		for (const [id] of done.slice(0, done.length - 10)) {
			feed.tools.delete(id);
		}
	}
	notify();
}

export function completeToolCall(storyId: string, toolId: string): void {
	const feed = store.feeds.get(storyId);
	if (!feed) return;
	const tool = feed.tools.get(toolId);
	if (tool) tool.status = "done";
	notify();
}

export function updateSubAgent(storyId: string, agent: SubAgent): void {
	const feed = store.feeds.get(storyId);
	if (!feed) return;
	feed.subagents.set(agent.taskId, agent);
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
