/**
 * Conversations/Chat page — shows a chat area for the selected thread.
 * Thread selection is handled by the Submenu, not duplicated here.
 * Chat area uses DaisyUI primitives only.
 */
import { type JSX, useState } from "react";

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
	const [selectedId] = useState<string>(MOCK_THREADS[0].id);
	const [loading] = useState(false);
	const [error] = useState<string | null>(null);

	const selected = MOCK_THREADS.find((t) => t.id === selectedId) ?? MOCK_THREADS[0];

	if (loading) {
		return (
			<div className="flex flex-col h-full" data-testid="conversations-chat-page">
				<div className="skeleton h-8 w-48 m-3" />
				<div className="flex-1 p-3 flex flex-col gap-2">
					<div className="skeleton h-12 w-3/4" />
					<div className="skeleton h-12 w-1/2 self-end" />
					<div className="skeleton h-12 w-2/3" />
				</div>
			</div>
		);
	}

	if (error) {
		return (
			<div className="flex flex-col h-full" data-testid="conversations-chat-page">
				<div role="alert" className="alert alert-error text-sm m-3">
					{error}
				</div>
			</div>
		);
	}

	return (
		<div className="flex h-full flex-col" data-testid="conversations-chat-page">
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
	);
}
