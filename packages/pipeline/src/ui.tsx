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
	const [scrollOffset, setScrollOffset] = useState(0);
	const [autoScroll, setAutoScroll] = useState(true);
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

	// Reset scroll when switching stories
	const selectedStory = state.selectedStory;
	// biome-ignore lint/correctness/useExhaustiveDependencies: need to trigger on story change
	useEffect(() => {
		setScrollOffset(0);
		setAutoScroll(true);
	}, [selectedStory]);

	useInput((input, key) => {
		const storyList = state.stories.map((s) => s.id);
		const currentIdx = storyList.indexOf(state.selectedStory ?? "");

		if (input === "j" || key.downArrow) {
			const next = storyList[currentIdx + 1];
			if (next) setSelectedStory(next);
		} else if (input === "k" || key.upArrow) {
			const prev = storyList[currentIdx - 1];
			if (prev) setSelectedStory(prev);
		} else if (key.pageDown || input === "n") {
			setAutoScroll(false);
			setScrollOffset((s) => s + 10);
		} else if (key.pageUp || input === "p") {
			setAutoScroll(false);
			setScrollOffset((s) => Math.max(0, s - 10));
		} else if (input === "e") {
			// Jump to end / resume auto-scroll
			setScrollOffset(0);
			setAutoScroll(true);
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

	// Running agents pinned at bottom
	const runningAgents = selectedFeed
		? [...selectedFeed.subagents.values()].filter((a) => a.status === "running")
		: [];
	const pinnedHeight = runningAgents.length > 0 ? runningAgents.length + 1 : 0;
	const logHeight = contentHeight - pinnedHeight - 1;
	const allLines = selectedFeed?.lines ?? [];
	const totalLines = allLines.length;

	let visibleLines: string[];
	if (autoScroll) {
		visibleLines = allLines.slice(-logHeight);
	} else {
		const end = Math.max(0, totalLines - scrollOffset);
		const start = Math.max(0, end - logHeight);
		visibleLines = allLines.slice(start, end);
	}

	const elapsed = Math.floor((Date.now() - state.startedAt) / 1000);
	const minutes = Math.floor(elapsed / 60);
	const seconds = elapsed % 60;

	const doneCount = state.stories.filter((s) => s.status === "done").length;
	const activeCount = [...state.feeds.values()].filter((f) => f.status === "in_progress").length;
	const blockedCount = state.stories.filter(
		(s) => s.status === "blocked" || s.status === "failed",
	).length;

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
					<Text bold wrap="truncate">
						{state.selectedStory
							? `[${state.selectedStory}] ${selectedFeed?.status ?? "pending"}`
							: "Select a story"}
					</Text>

					{/* Log output — agent start/end lines are colored inline */}
					{visibleLines.map((line, i) => {
						let color: string | undefined;
						if (line.startsWith(">>>")) color = "magenta";
						else if (line.startsWith("<<<")) color = "green";
						else if (line.startsWith("<!>")) color = "red";

						return (
							<Text key={`${i}-${line.slice(0, 10)}`} wrap="truncate" color={color}>
								{line.slice(0, mainWidth - 1)}
							</Text>
						);
					})}
					{!selectedFeed && (
						<Text color="gray" dimColor>
							Waiting for agent output...
						</Text>
					)}

					{/* Pinned running agents at bottom */}
					{runningAgents.length > 0 && (
						<Box flexDirection="column">
							<Text color="gray">{"─".repeat(mainWidth)}</Text>
							{runningAgents.map((agent) => (
								<Text key={agent.taskId} color="magenta" wrap="truncate">
									{`> ${agent.description}${agent.lastTool ? ` [${agent.lastTool}]` : ""}`}
								</Text>
							))}
						</Box>
					)}
				</Box>
			</Box>

			{/* Footer */}
			<Box>
				<Text color="gray">{"─".repeat(cols)}</Text>
			</Box>
			<Box>
				<Text color="gray">
					{`j/k: stories | p/n: scroll | e: end | a: approve | d: deny | q: quit${autoScroll ? "" : ` [scroll: ${scrollOffset}]`}`}
				</Text>
			</Box>
		</Box>
	);
}
