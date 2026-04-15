import { Box, Text, useApp, useInput, useStdout } from "ink";
import { useEffect, useState } from "react";
import {
	type PipelineStore,
	getStore,
	removeApproval,
	setSelectedStory,
	subscribe,
} from "./store.js";

const STATUS_ICONS: Record<string, string> = {
	pending: " ",
	in_progress: ">",
	done: "+",
	failed: "x",
	blocked: "!",
};

const STATUS_COLORS: Record<string, string> = {
	pending: "gray",
	in_progress: "yellow",
	done: "green",
	failed: "red",
	blocked: "red",
};

export function PipelineApp(): React.JSX.Element {
	const [state, setState] = useState<PipelineStore>(getStore());
	const { stdout } = useStdout();
	const rows = stdout?.rows ?? 24;
	const cols = stdout?.columns ?? 80;
	const { exit } = useApp();

	useEffect(() => {
		const unsub = subscribe(() => setState({ ...getStore() }));
		const timer = setInterval(() => setState({ ...getStore() }), 1000);
		return () => {
			unsub();
			clearInterval(timer);
		};
	}, []);

	useInput((input, key) => {
		const storyList = state.stories.map((s) => s.id);
		const currentIdx = storyList.indexOf(state.selectedStory ?? "");

		if (input === "j" || key.downArrow) {
			const next = storyList[currentIdx + 1];
			if (next) setSelectedStory(next);
		} else if (input === "k" || key.upArrow) {
			const prev = storyList[currentIdx - 1];
			if (prev) setSelectedStory(prev);
		} else if (input === "a" && state.approvals.length > 0) {
			const approval = state.approvals[0];
			if (approval) {
				approval.resolve(true);
				removeApproval(approval.id);
			}
		} else if (input === "d" && state.approvals.length > 0) {
			const approval = state.approvals[0];
			if (approval) {
				approval.resolve(false);
				removeApproval(approval.id);
			}
		} else if (input === "q") {
			exit();
		}
	});

	const sidebarWidth = 32;
	const mainWidth = cols - sidebarWidth - 1;
	const contentHeight = rows - 4;

	const selectedFeed = state.selectedStory ? state.feeds.get(state.selectedStory) : null;

	// Layout: reserve space for tools/agents panels
	const toolsHeight = selectedFeed
		? Math.min(
				[...selectedFeed.tools.values()].filter((t) => t.status === "running").length +
					[...selectedFeed.subagents.values()].filter((a) => a.status === "running").length +
					2,
				8,
			)
		: 0;
	const logHeight = contentHeight - toolsHeight;
	const visibleLines = selectedFeed?.lines.slice(-logHeight) ?? [];

	const elapsed = Math.floor((Date.now() - state.startedAt) / 1000);
	const minutes = Math.floor(elapsed / 60);
	const seconds = elapsed % 60;

	const doneCount = state.stories.filter((s) => s.status === "done").length;
	const activeCount = [...state.feeds.values()].filter((f) => f.status === "in_progress").length;
	const blockedCount = state.stories.filter(
		(s) => s.status === "blocked" || s.status === "failed",
	).length;

	const runningTools = selectedFeed
		? [...selectedFeed.tools.values()].filter((t) => t.status === "running")
		: [];
	const runningAgents = selectedFeed
		? [...selectedFeed.subagents.values()].filter((a) => a.status === "running")
		: [];

	return (
		<Box flexDirection="column" width={cols} height={rows}>
			{/* Header */}
			<Box>
				<Text bold color="cyan">
					HyperIdle Pipeline
				</Text>
				<Text color="gray">
					{` ${doneCount} done | ${activeCount} active | ${blockedCount} blocked | $${state.totalCost.toFixed(2)} | ${minutes}m${String(seconds).padStart(2, "0")}s`}
				</Text>
			</Box>
			<Box>
				<Text color="gray">{"─".repeat(cols)}</Text>
			</Box>

			{/* Main content */}
			<Box height={contentHeight}>
				{/* Sidebar */}
				<Box flexDirection="column" width={sidebarWidth}>
					<Text bold underline>
						Stories
					</Text>
					{state.stories.map((story) => {
						const icon = STATUS_ICONS[story.status] ?? " ";
						const isSelected = story.id === state.selectedStory;
						const color = STATUS_COLORS[story.status] ?? "white";
						return (
							<Text key={story.id} color={color} bold={isSelected} wrap="truncate">
								{isSelected ? ">" : " "} {icon} {story.id} {story.title.slice(0, sidebarWidth - 10)}
							</Text>
						);
					})}

					{state.approvals.length > 0 && (
						<Box flexDirection="column" marginTop={1}>
							<Text bold color="yellow">
								Approvals ({state.approvals.length})
							</Text>
							{state.approvals.slice(0, 3).map((a) => (
								<Text key={a.id} color="yellow" wrap="truncate">
									{a.storyId}: {a.toolName}
								</Text>
							))}
							<Text color="gray" dimColor>
								[a]pprove [d]eny
							</Text>
						</Box>
					)}
				</Box>

				{/* Main panel */}
				<Box flexDirection="column" width={mainWidth}>
					{/* Active tools + subagents */}
					{(runningTools.length > 0 || runningAgents.length > 0) && (
						<Box flexDirection="column" marginBottom={0}>
							{runningAgents.map((agent) => (
								<Text key={agent.taskId} color="magenta" wrap="truncate">
									{`  agent: ${agent.description.slice(0, mainWidth - 12)}${agent.lastTool ? ` [${agent.lastTool}]` : ""}`}
								</Text>
							))}
							{runningTools.map((tool) => (
								<Text key={tool.id} color="cyan" wrap="truncate">
									{`  ${tool.elapsed > 0 ? `${tool.elapsed.toFixed(0)}s` : "..."} ${tool.name}`}
								</Text>
							))}
							<Text color="gray">{"─".repeat(mainWidth)}</Text>
						</Box>
					)}

					{/* Log output */}
					<Text bold wrap="truncate">
						{state.selectedStory
							? `[${state.selectedStory}] ${selectedFeed?.status ?? "pending"}`
							: "Select a story"}
					</Text>
					{visibleLines.map((line, i) => (
						<Text key={`${i}-${line.slice(0, 10)}`} wrap="truncate">
							{line.slice(0, mainWidth - 1)}
						</Text>
					))}
					{!selectedFeed && (
						<Text color="gray" dimColor>
							Waiting for agent output...
						</Text>
					)}
				</Box>
			</Box>

			{/* Footer */}
			<Box>
				<Text color="gray">{"─".repeat(cols)}</Text>
			</Box>
			<Box>
				<Text color="gray">j/k: navigate | a: approve | d: deny | q: quit</Text>
			</Box>
		</Box>
	);
}
