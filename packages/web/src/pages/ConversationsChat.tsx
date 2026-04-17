/**
 * Conversations/Chat page — shows thread list + a simple chat area.
 * Composes ThreadRow (Tier 2) for the sidebar. Chat area uses DaisyUI primitives only.
 */
import { type JSX, useState } from "react";
import { ThreadRow } from "../components/ThreadRow";

const AVATAR_PLACEHOLDER =
	"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32'%3E%3Crect width='32' height='32' fill='%23374151'/%3E%3C/svg%3E";

interface MockThread {
	id: string;
	title: string;
	snippet: string;
	timestamp: string;
	messages: Array<{ from: string; text: string; time: string }>;
}

const MOCK_THREADS: MockThread[] = [
	{
		id: "t1",
		title: "Sprint planning",
		snippet: "Let's discuss the next cycle priorities",
		timestamp: "5m ago",
		messages: [
			{ from: "Architect", text: "I've shaped three bets for the next cycle.", time: "10:00" },
			{ from: "You", text: "Can you walk me through the auth bet?", time: "10:02" },
			{
				from: "Architect",
				text: "Sure — it covers login, signup, and JWT refresh.",
				time: "10:03",
			},
		],
	},
	{
		id: "t2",
		title: "Bug report: cost tracking",
		snippet: "Weekly aggregation is off by one day",
		timestamp: "1h ago",
		messages: [
			{ from: "Analyst", text: "The weekly spend is miscalculated.", time: "09:15" },
			{ from: "You", text: "Can you provide the expected vs actual?", time: "09:20" },
		],
	},
];

export function ConversationsChat(): JSX.Element {
	const [selectedId, setSelectedId] = useState<string>(MOCK_THREADS[0].id);

	const selected = MOCK_THREADS.find((t) => t.id === selectedId) ?? MOCK_THREADS[0];

	return (
		<div className="flex h-full" data-testid="conversations-chat-page">
			{/* Thread list */}
			<div className="w-72 border-r border-base-300 overflow-y-auto flex-shrink-0">
				{MOCK_THREADS.map((thread) => (
					<ThreadRow
						key={thread.id}
						avatarUrl={AVATAR_PLACEHOLDER}
						title={thread.title}
						snippet={thread.snippet}
						timestamp={thread.timestamp}
						kind="chat"
						onClick={() => setSelectedId(thread.id)}
					/>
				))}
			</div>

			{/* Chat area */}
			<div className="flex-1 flex flex-col">
				<div className="border-b border-base-300 px-3 py-2">
					<h2 className="text-sm font-semibold">{selected.title}</h2>
				</div>
				<div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
					{selected.messages.map((msg) => (
						<div
							key={`${msg.from}-${msg.time}`}
							className={`flex flex-col gap-0.5 max-w-[75%] ${msg.from === "You" ? "self-end items-end" : ""}`}
						>
							<span className="text-xs text-[var(--text-lo)]">
								{msg.from} &middot; {msg.time}
							</span>
							<div
								className={`rounded px-2 py-1 text-sm ${msg.from === "You" ? "bg-primary/10" : "bg-base-200"}`}
							>
								{msg.text}
							</div>
						</div>
					))}
				</div>
				<div className="border-t border-base-300 p-2">
					<input
						type="text"
						className="input input-sm input-bordered w-full"
						placeholder="Type a message..."
						aria-label="Chat message input"
					/>
				</div>
			</div>
		</div>
	);
}
