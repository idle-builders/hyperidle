import type { JSX } from "react";
import { useEffect, useState } from "react";
import { GlobalSearchPanel } from "./GlobalSearchPanel";

// I4 D1: default export with `title` so the design-system auto-discovery
// (import.meta.glob + parseStoryModules) picks the module up. Without this
// the file was silently dropped from the story catalog.
export default { title: "GlobalSearchPanel", tier: "utility" as const };

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
		team: "HyperIdle",
		status: "active" as const,
		appetite: "6 weeks",
	},
];

const mockDocuments = [
	{
		id: "k1",
		title: "Rate Limiting Pattern",
		layer: "L2" as const,
		kind: "pattern" as const,
		status: "validated" as const,
		timestamp: "1 hour ago",
	},
];

/**
 * I4 security MED-3: swap window.fetch with a mock for the lifetime of the
 * story, then restore on unmount. Previously the stories monkey-patched
 * fetch and discarded the original reference, which corrupted every other
 * story rendered in the same viewer tab until page reload.
 */
function useMockFetch(payload: Record<string, unknown>, enabled: boolean): void {
	useEffect(() => {
		if (!enabled) return;
		const original = window.fetch;
		window.fetch = (() =>
			Promise.resolve({
				ok: true,
				json: () => Promise.resolve(payload),
			})) as unknown as typeof window.fetch;
		return () => {
			window.fetch = original;
		};
	}, [enabled, payload]);
}

function StoryWrapper({
	initialOpen = true,
	mockPayload,
}: {
	initialOpen?: boolean;
	mockPayload?: Record<string, unknown>;
}): JSX.Element {
	const [open, setOpen] = useState(initialOpen);
	useMockFetch(mockPayload ?? {}, mockPayload !== undefined);
	return (
		<div>
			<button type="button" className="btn btn-sm" onClick={() => setOpen(true)}>
				Open Search (Cmd+K)
			</button>
			<GlobalSearchPanel
				open={open}
				onClose={() => setOpen(false)}
				onNavigate={(type, id) => {
					// biome-ignore lint/suspicious/noConsole: story-only demo navigation
					console.log(`[story] Navigate: ${type} / ${id}`);
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
	render: (): JSX.Element => (
		<StoryWrapper
			mockPayload={{
				conversations: mockConversations,
				work: mockWork,
				knowledge: mockDocuments,
			}}
		/>
	),
};

export const EmptyResults = {
	name: "Empty Results",
	render: (): JSX.Element => (
		<StoryWrapper
			mockPayload={{
				conversations: [],
				work: [],
				knowledge: [],
			}}
		/>
	),
};

export const Closed = {
	name: "Closed State",
	render: (): JSX.Element => <StoryWrapper initialOpen={false} />,
};
