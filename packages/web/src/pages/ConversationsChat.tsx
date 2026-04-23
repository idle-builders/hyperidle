import { EmptyState, ErrorState, SkeletonList } from "@hyperidle/design-system";
/**
 * Conversations/Chat page — shows a chat area for the selected thread.
 * Thread selection is handled by the Submenu, not duplicated here.
 * Chat area uses DaisyUI primitives only.
 *
 * @lore J4 Chat mode (distinct from review):
 *   - No verdict toolbar.
 *   - Adjacent messages from the same sender are grouped under one sender label.
 *   - Messages carrying an artifact render an inline preview.
 */
import { type JSX, useCallback, useMemo, useState } from "react";

interface MockMessageArtifactPreview {
	kind: "text_diff" | "content_preview" | "action_summary" | "data_metrics" | "visual_comparison";
	label: string;
}

interface MockMessage {
	from: string;
	text: string;
	time: string;
	artifact?: MockMessageArtifactPreview;
}

interface MockThread {
	id: string;
	title: string;
	snippet: string;
	timestamp: string;
	messages: MockMessage[];
}

const MOCK_THREADS: MockThread[] = [
	{
		id: "t1",
		title: "Sprint planning",
		snippet: "Let's discuss the next cycle priorities",
		timestamp: "5m ago",
		messages: [
			{ from: "Architect", text: "I've shaped three bets for the next cycle.", time: "10:00" },
			{
				from: "Architect",
				text: "Sharing the pitch deck preview below.",
				time: "10:01",
				artifact: { kind: "content_preview", label: "Cycle-7 pitch deck" },
			},
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

interface MessageGroup {
	from: string;
	messages: MockMessage[];
}

function groupBySender(messages: MockMessage[]): MessageGroup[] {
	const groups: MessageGroup[] = [];
	for (const msg of messages) {
		const last = groups[groups.length - 1];
		if (last && last.from === msg.from) {
			last.messages.push(msg);
		} else {
			groups.push({ from: msg.from, messages: [msg] });
		}
	}
	return groups;
}

export interface ConversationsChatProps {
	/**
	 * J8: allow callers (and stories) to supply an alternate thread list.
	 * When empty, the page renders an EmptyState instead of the chat shell.
	 * Production render path is unchanged.
	 */
	threads?: typeof MOCK_THREADS;
}

export function ConversationsChat({ threads }: ConversationsChatProps = {}): JSX.Element {
	const threadList = threads ?? MOCK_THREADS;
	const [selectedId] = useState<string>(threadList[0]?.id ?? "");
	const [loading] = useState(false);
	const [error] = useState<string | null>(null);
	const [inputValue, setInputValue] = useState("");

	const selected = threadList.find((t) => t.id === selectedId) ?? threadList[0];
	const groups = useMemo<MessageGroup[]>(
		() => (selected ? groupBySender(selected.messages) : []),
		[selected],
	);

	const handleSubmit = useCallback((): void => {
		if (inputValue.trim().length === 0) return;
		// TODO: send message via API when wired
		setInputValue("");
	}, [inputValue]);

	if (loading) {
		return (
			<div className="flex flex-col h-full" data-testid="conversations-chat-page">
				<SkeletonList rows={3} ariaLabel="Loading chat" />
			</div>
		);
	}

	if (error) {
		return (
			<div className="flex flex-col h-full" data-testid="conversations-chat-page">
				<ErrorState title="Failed to load chat" description={error} />
			</div>
		);
	}

	if (!selected) {
		return (
			<div className="flex h-full flex-col" data-testid="conversations-chat-page">
				<EmptyState
					title="No threads yet"
					description="Start a conversation with an agent to see it here. New threads open from the sidebar."
					dataTestId="conversations-empty"
				/>
			</div>
		);
	}

	return (
		<div className="flex h-full flex-col" data-testid="conversations-chat-page">
			<div className="border-b border-[var(--border-subtle)] px-3 py-2">
				<h2 className="text-sm font-semibold">{selected.title}</h2>
			</div>
			<div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3">
				{groups.map((group, gi) => {
					const isYou = group.from === "You";
					return (
						<div
							key={`${group.from}-${gi}`}
							data-testid="chat-message-group"
							className={`flex flex-col gap-1 max-w-[75%] ${isYou ? "self-end items-end" : ""}`}
						>
							<span className="text-xs text-[var(--text-lo)]">{group.from}</span>
							<div className="flex flex-col gap-1">
								{group.messages.map((msg, mi) => (
									<div
										key={`${msg.from}-${msg.time}-${mi}`}
										data-testid="chat-message"
										className="flex flex-col gap-1"
									>
										<div
											className={`rounded px-2 py-1 text-sm ${isYou ? "bg-[var(--primary-dim)]" : "bg-base-200"}`}
										>
											{msg.text}
										</div>
										{msg.artifact && (
											<div
												data-testid="chat-artifact-preview"
												className="flex items-center gap-2 rounded border border-[var(--border-default)] bg-base-100 px-2 py-1 text-xs"
											>
												<span className="badge badge-xs badge-outline font-mono uppercase">
													{msg.artifact.kind}
												</span>
												<span className="text-[var(--text-mid)]">{msg.artifact.label}</span>
											</div>
										)}
										<span className="text-[11px] text-[var(--text-lo)] font-mono">{msg.time}</span>
									</div>
								))}
							</div>
						</div>
					);
				})}
			</div>
			<form
				className="border-t border-[var(--border-subtle)] p-2 flex gap-2"
				onSubmit={(e) => {
					e.preventDefault();
					handleSubmit();
				}}
			>
				<textarea
					className="textarea textarea-sm textarea-bordered flex-1 resize-none"
					placeholder="Type a message..."
					aria-label="Chat message input"
					rows={2}
					value={inputValue}
					onChange={(e) => setInputValue(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === "Enter" && !e.shiftKey) {
							e.preventDefault();
							handleSubmit();
						}
					}}
				/>
				<button
					type="submit"
					className="btn btn-primary btn-sm self-end"
					disabled={inputValue.trim().length === 0}
				>
					Send
				</button>
			</form>
		</div>
	);
}
