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

export interface GroupInfo {
	name: string;
	storyIds: string[];
}

export interface AgentFeed {
	groupName: string;
	storyIds: string[];
	lines: string[];
	status: StoryStatus;
	tools: Map<string, ToolCall>;
	subagents: Map<string, SubAgent>;
}

export interface PipelineStore {
	feeds: Map<string, AgentFeed>;
	groups: GroupInfo[];
	selectedGroup: string | null;
	approvals: ApprovalRequest[];
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
	groups: [],
	selectedGroup: null,
	approvals: [],
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

export function initGroup(groupName: string, storyIds: string[]): void {
	store.groups.push({ name: groupName, storyIds });
	store.feeds.set(groupName, {
		groupName,
		storyIds,
		lines: [],
		status: "in_progress",
		tools: new Map(),
		subagents: new Map(),
	});
	if (!store.selectedGroup) store.selectedGroup = groupName;
	notify();
}

export function appendOutput(groupName: string, text: string): void {
	const feed = store.feeds.get(groupName);
	if (!feed) return;
	if (feed.lines.length > 0 && feed.lines[feed.lines.length - 1] !== "") {
		feed.lines.push("");
	}
	for (const line of text.split("\n")) {
		if (line.trim()) feed.lines.push(line);
	}
	if (feed.lines.length > 500) {
		feed.lines.splice(0, feed.lines.length - 500);
	}
	notify();
}

export function updateFeedStatus(groupName: string, status: StoryStatus): void {
	const feed = store.feeds.get(groupName);
	if (!feed) return;
	feed.status = status;
	notify();
}

export function updateToolCall(groupName: string, tool: ToolCall): void {
	const feed = store.feeds.get(groupName);
	if (!feed) return;
	feed.tools.set(tool.id, tool);
	// Keep last 20 tool entries; drop the oldest done ones first.
	const tools = [...feed.tools.entries()];
	if (tools.length > 20) {
		const done = tools.filter(([, t]) => t.status === "done");
		for (const [id] of done.slice(0, done.length - 10)) {
			feed.tools.delete(id);
		}
	}
	notify();
}

export function completeToolCall(groupName: string, toolId: string): void {
	const feed = store.feeds.get(groupName);
	if (!feed) return;
	const tool = feed.tools.get(toolId);
	if (tool) tool.status = "done";
	notify();
}

export function updateSubAgent(groupName: string, agent: SubAgent): void {
	const feed = store.feeds.get(groupName);
	if (!feed) return;
	feed.subagents.set(agent.taskId, agent);
	notify();
}

export function setSelectedGroup(groupName: string): void {
	store.selectedGroup = groupName;
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
