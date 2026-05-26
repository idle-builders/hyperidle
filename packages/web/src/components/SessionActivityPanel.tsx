/**
 * Q1 §4.5: SessionActivityPanel component.
 *
 * Companion pane for the dial-in view. Shows session activity stream
 * (tool calls, reasoning excerpts, cost ticks) alongside the thread.
 *
 * States:
 * - streaming: session is active, activity entries arrive in real-time
 * - ended: session ended, shows summary
 * - error: fetch failed, shows retry
 *
 * @lore Q1: Accessible region landmark (aside) so screen readers and a11y
 * tools can identify the panel as a complementary section.
 */

import { type JSX, useEffect, useRef } from "react";
import type { ActivityEntry } from "../hooks/useSessionActivity.js";
import { useSessionActivity } from "../hooks/useSessionActivity.js";

export interface SessionActivityPanelProps {
	sessionId: string;
	agentName: string;
	taskTitle: string;
	onClose: () => void;
}

function ActivityEntryRow({ entry }: { entry: ActivityEntry }): JSX.Element | null {
	const time = new Date(entry.timestamp).toLocaleTimeString(undefined, {
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
	});

	if (entry.type === "tool_call") {
		const toolName = typeof entry.data.toolName === "string" ? entry.data.toolName : "unknown";
		const argsSummary = typeof entry.data.argsSummary === "string" ? entry.data.argsSummary : "";
		return (
			<div className="flex items-start gap-[8px] py-[6px] px-[8px] rounded-[var(--r1)] hover:bg-[var(--surface-ghost)]">
				<span className="flex-shrink-0 mt-[2px] inline-flex items-center justify-center w-[20px] h-[20px] rounded-[var(--r1)] bg-[var(--surface-4)] text-[var(--text-lo)]">
					<svg
						viewBox="0 0 16 16"
						fill="currentColor"
						className="w-[10px] h-[10px]"
						aria-hidden="true"
					>
						<path d="M7 1v2H5a2 2 0 00-2 2v6a2 2 0 002 2h6a2 2 0 002-2V5a2 2 0 00-2-2H9V1H7zm0 4h2v2h2v2H9v2H7v-2H5V7h2V5z" />
					</svg>
				</span>
				<div className="flex-1 min-w-0">
					<span className="text-[12px] font-medium text-[var(--text-hi)] font-mono">
						{toolName}
					</span>
					{argsSummary && (
						<p className="text-[11px] text-[var(--text-lo)] truncate">{argsSummary}</p>
					)}
				</div>
				<span className="flex-shrink-0 text-[10px] text-[var(--text-lo)] font-mono">{time}</span>
			</div>
		);
	}

	if (entry.type === "reasoning") {
		const excerpt = typeof entry.data.excerpt === "string" ? entry.data.excerpt : "";
		return (
			<div className="flex items-start gap-[8px] py-[6px] px-[8px] rounded-[var(--r1)] hover:bg-[var(--surface-ghost)]">
				<span className="flex-shrink-0 mt-[2px] text-[var(--text-lo)] text-[12px]">💭</span>
				<p className="flex-1 text-[12px] text-[var(--text-mid)] italic">{excerpt}</p>
				<span className="flex-shrink-0 text-[10px] text-[var(--text-lo)] font-mono">{time}</span>
			</div>
		);
	}

	if (entry.type === "cost_tick") {
		const deltaMinor = typeof entry.data.deltaMinor === "number" ? entry.data.deltaMinor : 0;
		const totalMinor = typeof entry.data.totalMinor === "number" ? entry.data.totalMinor : 0;
		return (
			<div className="flex items-center gap-[8px] py-[4px] px-[8px] rounded-[var(--r1)] hover:bg-[var(--surface-ghost)]">
				<span className="text-[11px] text-[var(--text-lo)] tabular-nums">
					+{(deltaMinor / 100).toFixed(4)} / total {(totalMinor / 100).toFixed(2)}
				</span>
				<span className="ml-auto text-[10px] text-[var(--text-lo)] font-mono">{time}</span>
			</div>
		);
	}

	return null;
}

/**
 * Companion pane showing live session activity alongside the thread.
 *
 * Rendered as an `<aside>` with `role="region"` and an accessible label
 * so screen readers can identify the landmark.
 */
export function SessionActivityPanel({
	sessionId,
	agentName,
	taskTitle,
	onClose,
}: SessionActivityPanelProps): JSX.Element {
	const { status, entries, error } = useSessionActivity(sessionId);
	const scrollRef = useRef<HTMLDivElement>(null);

	// biome-ignore lint/correctness/useExhaustiveDependencies: entries.length triggers scroll on new entries
	useEffect(() => {
		if (scrollRef.current) {
			scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
		}
	}, [entries.length]);

	const isLive = status === "streaming" || status === "connecting";

	return (
		<aside
			aria-label={`Session activity for ${agentName}`}
			data-testid="session-activity-panel"
			className="flex flex-col h-full bg-[var(--surface-2)] border-l border-[var(--border-subtle)]"
		>
			{/* Header */}
			<div className="flex items-center gap-[8px] px-[12px] py-[10px] border-b border-[var(--border-subtle)] flex-shrink-0">
				<div className="flex-1 min-w-0">
					<div className="flex items-center gap-[6px]">
						<span className="text-[13px] font-medium text-[var(--text-hi)] truncate">
							{agentName}
						</span>
						{isLive && (
							<span
								role="status"
								className="inline-flex items-center gap-[4px] px-[6px] py-[1px] rounded-full bg-[color-mix(in_oklab,var(--ok)_14%,transparent)] text-[var(--ok)] text-[10px] font-medium uppercase tracking-[0.05em]"
								aria-label="Live session"
							>
								<span className="w-[5px] h-[5px] rounded-full bg-[var(--ok)] animate-pulse" />
								Live
							</span>
						)}
						{status === "ended" && (
							<span className="text-[10px] text-[var(--text-lo)] uppercase tracking-[0.05em]">
								Ended
							</span>
						)}
					</div>
					<p className="text-[11px] text-[var(--text-lo)] truncate">{taskTitle}</p>
				</div>
				<button
					type="button"
					aria-label="Close activity panel"
					className="flex-shrink-0 inline-flex items-center justify-center w-[24px] h-[24px] rounded-[var(--r1)] bg-transparent text-[var(--text-lo)] border-none cursor-pointer transition-[background,color] duration-[var(--motion-fast)] hover:bg-[var(--surface-ghost)] hover:text-[var(--text-mid)]"
					onClick={onClose}
				>
					<svg
						viewBox="0 0 16 16"
						fill="currentColor"
						className="w-[12px] h-[12px]"
						aria-hidden="true"
					>
						<path
							fillRule="evenodd"
							d="M4.28 3.22a.75.75 0 00-1.06 1.06L6.94 8l-3.72 3.72a.75.75 0 101.06 1.06L8 9.06l3.72 3.72a.75.75 0 101.06-1.06L9.06 8l3.72-3.72a.75.75 0 00-1.06-1.06L8 6.94 4.28 3.22z"
							clipRule="evenodd"
						/>
					</svg>
				</button>
			</div>

			{/* Activity stream */}
			<div ref={scrollRef} className="flex-1 overflow-y-auto px-[4px] py-[4px]">
				{status === "connecting" && (
					<div className="py-[16px] text-center text-[var(--text-lo)] text-[12px]">
						Connecting...
					</div>
				)}

				{status === "error" && (
					<div className="py-[16px] text-center text-[var(--danger)] text-[12px]">
						{error ?? "Failed to load activity"}
					</div>
				)}

				{(status === "streaming" || status === "ended") && entries.length === 0 && (
					<div className="py-[16px] text-center text-[var(--text-lo)] text-[12px]">
						No activity yet
					</div>
				)}

				{entries.map((entry, i) => (
					// biome-ignore lint/suspicious/noArrayIndexKey: entries have no stable id
					<ActivityEntryRow key={i} entry={entry} />
				))}
			</div>

			{/* Summary / footer */}
			{status === "ended" && (
				<div className="flex-shrink-0 px-[12px] py-[8px] border-t border-[var(--border-subtle)] text-[12px] text-[var(--text-lo)]">
					Session complete — {entries.length} events recorded
				</div>
			)}
		</aside>
	);
}
