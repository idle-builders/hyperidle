import { Box, Text, useApp, useInput, useStdout } from "ink";
import { useEffect, useState } from "react";
import {
	type PipelineStore,
	getStore,
	removeApproval,
	setSelectedStream,
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

	// Reset scroll when switching streams
	const selectedStream = state.selectedStream;
	// biome-ignore lint/correctness/useExhaustiveDependencies: need to trigger on stream change
	useEffect(() => {
		setScrollOffset(0);
		setAutoScroll(true);
	}, [selectedStream]);

	// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: input handler maps keys to actions, flat structure is clearest
	useInput((input, key) => {
		const streamList = state.streams.map((s) => s.name);
		const currentIdx = streamList.indexOf(state.selectedStream ?? "");

		if (input === "j" || key.downArrow) {
			const next = streamList[currentIdx + 1];
			if (next) setSelectedStream(next);
		} else if (input === "k" || key.upArrow) {
			const prev = streamList[currentIdx - 1];
			if (prev) setSelectedStream(prev);
		} else if (key.pageDown || input === "n") {
			setAutoScroll(false);
			setScrollOffset((s) => s + 10);
		} else if (key.pageUp || input === "p") {
			setAutoScroll(false);
			setScrollOffset((s) => Math.max(0, s - 10));
		} else if (input === "e") {
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

	const selectedFeed = state.selectedStream ? state.feeds.get(state.selectedStream) : null;

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

	// Get stories for the selected stream
	const selectedStreamInfo = state.streams.find((s) => s.name === state.selectedStream);
	const streamStories = selectedStreamInfo
		? selectedStreamInfo.storyIds
				.map((id) => state.stories.find((s) => s.id === id))
				.filter(Boolean)
		: [];

	return (
		<Box flexDirection="column" width={cols} height={rows}>
			{/* Header */}
			<Box>
				<Text bold color="cyan">
					HyperIdle Pipeline
				</Text>
				<Text color="gray">
					{` ${doneCount} done | ${activeCount} active | ${blockedCount} blocked | ${minutes}m${String(seconds).padStart(2, "0")}s`}
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
						Agents
					</Text>
					{state.streams.map((stream) => {
						const feed = state.feeds.get(stream.name);
						const isSelected = stream.name === state.selectedStream;
						const streamDone = stream.storyIds.filter((id) =>
							state.stories.find((s) => s.id === id && s.status === "done"),
						).length;
						const statusColor =
							feed?.status === "done"
								? "green"
								: feed?.status === "in_progress"
									? "yellow"
									: feed?.status === "failed" || feed?.status === "blocked"
										? "red"
										: "gray";
						const activeStory = state.stories.find(
							(s) => stream.storyIds.includes(s.id) && s.status === "in_progress",
						);
						return (
							<Text key={stream.name} color={statusColor} bold={isSelected} wrap="truncate">
								{isSelected ? ">" : " "} {stream.name} ({streamDone}/{stream.storyIds.length})
								{activeStory ? ` ▸ ${activeStory.id}` : ""}
							</Text>
						);
					})}

					{/* Stories for selected stream */}
					{streamStories.length > 0 && (
						<Box flexDirection="column" marginTop={1}>
							<Text bold dimColor>
								Stories
							</Text>
							{streamStories.map((story) => {
								if (!story) return null;
								const icon = STATUS_ICONS[story.status] ?? " ";
								const color = STATUS_COLORS[story.status] ?? "white";
								return (
									<Text key={story.id} color={color} wrap="truncate">
										{`  ${icon} ${story.id} ${story.title.slice(0, sidebarWidth - 12)}`}
									</Text>
								);
							})}
						</Box>
					)}

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
						{state.selectedStream
							? `[${state.selectedStream}] ${selectedFeed?.status ?? "pending"}`
							: "Select an agent"}
					</Text>

					{/* Log output — agent start/end lines are colored, blank lines preserved */}
					{visibleLines.map((line, i) => {
						const lineColor = line.startsWith(">>>")
							? "magenta"
							: line.startsWith("<<<")
								? "green"
								: line.startsWith("<!>")
									? "red"
									: undefined;
						return (
							// biome-ignore lint/suspicious/noArrayIndexKey: log lines are positional, index keys are correct
							<Text key={`l-${i}`} wrap="truncate" color={lineColor}>
								{line === "" ? " " : line.slice(0, mainWidth - 1)}
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
					{`j/k: agents | p/n: scroll | e: end | a: approve | d: deny | q: quit${autoScroll ? "" : ` [scroll: ${scrollOffset}]`}`}
				</Text>
			</Box>
		</Box>
	);
}
