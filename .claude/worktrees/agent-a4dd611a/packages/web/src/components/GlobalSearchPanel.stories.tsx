import { useState } from "react";
import { GlobalSearchPanel } from "./GlobalSearchPanel";

const mockConversations = [
	{
		id: "c1",
		title: "Deploy review",
		snippet: "Reviewing the deploy pipeline...",
		timestamp: "2 min ago",
		kind: "review" as const,
	},
	{
		id: "c2",
		title: "Standup chat",
		snippet: "Daily standup notes...",
		timestamp: "5 min ago",
		kind: "chat" as const,
	},
];

const mockWork = [
	{
		id: "w1",
		title: "Mobile App V2",
		product: "HyperIdle",
		status: "committed" as const,
		appetite: "6 weeks",
	},
];

const mockKnowledge = [
	{
		id: "k1",
		title: "Rate Limiting Pattern",
		layer: "L2" as const,
		kind: "pattern" as const,
		status: "validated" as const,
		timestamp: "1 hour ago",
	},
];

function StoryWrapper({ initialOpen = true }: { initialOpen?: boolean }): JSX.Element {
	const [open, setOpen] = useState(initialOpen);
	return (
		<div>
			<button type="button" className="btn btn-sm" onClick={() => setOpen(true)}>
				Open Search (Cmd+K)
			</button>
			<GlobalSearchPanel
				open={open}
				onClose={() => setOpen(false)}
				onNavigate={(type, id) => {
					window.alert(`Navigate: ${type} / ${id}`);
					setOpen(false);
				}}
			/>
		</div>
	);
}

export const Default = {
	name: "Default (Empty)",
	render: (): JSX.Element => <StoryWrapper />,
};

export const WithResults = {
	name: "With Results",
	render: (): JSX.Element => {
		// Mock fetch to return results
		const originalFetch = window.fetch;
		window.fetch = (() =>
			Promise.resolve({
				ok: true,
				json: () =>
					Promise.resolve({
						conversations: mockConversations,
						work: mockWork,
						knowledge: mockKnowledge,
					}),
			})) as typeof window.fetch;

		// Restore on unmount would require useEffect, keeping simple for stories
		void originalFetch;

		return <StoryWrapper />;
	},
};

export const EmptyResults = {
	name: "Empty Results",
	render: (): JSX.Element => {
		window.fetch = (() =>
			Promise.resolve({
				ok: true,
				json: () =>
					Promise.resolve({
						conversations: [],
						work: [],
						knowledge: [],
					}),
			})) as typeof window.fetch;

		return <StoryWrapper />;
	},
};

export const Closed = {
	name: "Closed State",
	render: (): JSX.Element => <StoryWrapper initialOpen={false} />,
};
