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
		return subscribe(() => setState({ ...getStore() }));
	}, []);

	// Keyboard navigation
	useInput((input, key) => {
		const feeds = [...state.feeds.keys()];
		const allStories = state.stories.map((s) => s.id);
		const storyList = allStories.length > 0 ? allStories : feeds;
		const currentIdx = storyList.indexOf(state.selectedStory ?? "");

		if (input === "j" || key.downArrow) {
			const next = storyList[currentIdx + 1];
			if (next) setSelectedStory(next);
		} else if (input === "k" || key.upArrow) {
			const prev = storyList[currentIdx - 1];
			if (prev) setSelectedStory(prev);
		} else if (input === "a" && state.approvals.length > 0) {
			// Approve first pending approval
			const approval = state.approvals[0];
			if (approval) {
				approval.resolve(true);
				removeApproval(approval.id);
			}
		} else if (input === "d" && state.approvals.length > 0) {
			// Deny first pending approval
			const approval = state.approvals[0];
			if (approval) {
				approval.resolve(false);
				removeApproval(approval.id);
			}
		} else if (input === "q") {
			exit();
		}
	});

	const sidebarWidth = 30;
	const mainWidth = cols - sidebarWidth - 3;
	const contentHeight = rows - 4; // header + footer

	const selectedFeed = state.selectedStory ? state.feeds.get(state.selectedStory) : null;
	const visibleLines = selectedFeed?.lines.slice(-(contentHeight - 2)) ?? [];

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
					{` ${doneCount} done | ${activeCount} active | ${blockedCount} blocked | $${state.totalCost.toFixed(2)} | ${minutes}m${seconds.toString().padStart(2, "0")}s`}
				</Text>
			</Box>

			<Box height={1}>
				<Text color="gray">{"─".repeat(cols)}</Text>
			</Box>

			{/* Main content */}
			<Box height={contentHeight}>
				{/* Sidebar — story list */}
				<Box flexDirection="column" width={sidebarWidth}>
					<Text bold underline>
						Stories
					</Text>
					{state.stories.map((story) => {
						const icon = STATUS_ICONS[story.status] ?? " ";
						const isSelected = story.id === state.selectedStory;
						const color = STATUS_COLORS[story.status] ?? "white";
						return (
							<Text key={story.id} color={color} bold={isSelected}>
								{isSelected ? ">" : " "} {icon} {story.id} {story.title.slice(0, sidebarWidth - 10)}
							</Text>
						);
					})}

					{/* Approvals */}
					{state.approvals.length > 0 && (
						<Box flexDirection="column" marginTop={1}>
							<Text bold color="yellow">
								Approvals ({state.approvals.length})
							</Text>
							{state.approvals.slice(0, 5).map((a) => (
								<Text key={a.id} color="yellow">
									{a.storyId}: {a.toolName}
								</Text>
							))}
							<Text color="gray" dimColor>
								[a]pprove [d]eny
							</Text>
						</Box>
					)}
				</Box>

				{/* Divider */}
				<Box flexDirection="column" width={1}>
					<Text color="gray">{"│\n".repeat(contentHeight)}</Text>
				</Box>

				{/* Main panel — agent output */}
				<Box flexDirection="column" width={mainWidth} paddingLeft={1}>
					<Text bold>
						{state.selectedStory
							? `[${state.selectedStory}] ${selectedFeed?.status ?? "pending"}`
							: "Select a story"}
					</Text>
					{visibleLines.map((line, i) => (
						<Text key={`${i}-${line.slice(0, 20)}`} wrap="truncate">
							{line.slice(0, mainWidth - 2)}
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
				<Text color="gray"> j/k: navigate | a: approve | d: deny | q: quit</Text>
			</Box>
		</Box>
	);
}
