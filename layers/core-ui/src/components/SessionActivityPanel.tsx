/**
 * Q1 §4.5: SessionActivityPanel component.
 *
 * Companion pane for the dial-in view. Shows session activity stream
 * (tool calls, reasoning excerpts) alongside the thread.
 *
 * States:
 * - streaming: session is active, activity entries arrive in real-time
 * - ended: session ended, shows summary
 * - error: fetch failed, shows retry
 *
 * @lore Q1: Accessible region landmark (aside) so screen readers and a11y
 * tools can identify the panel as a complementary section.
 *
 * @lore Q1 review issues #10–12:
 * #10: Auto-scroll pauses when the user scrolls up (threshold 40px from bottom),
 *      resumes automatically when they scroll back to the bottom.
 * #11: Filter tabs added (All | Tools | Reasoning) via DaisyUI tabs.
 * #12: Emoji 💭 replaced with an SVG reasoning icon.
 *
 * @lore AU21 Increment 14a: the "Cost" filter tab + `cost_tick` entry
 * rendering are HARD-DELETED along with the rest of the cost-cap feature —
 * no replacement.
 */

import { Button, EmptyState, TabBar } from "@hyperidle/design-system";
import { clockTime } from "@hyperidle/presentation-format";
import { type JSX, useCallback, useEffect, useRef, useState } from "react";
import type { ActivityEntry } from "../hooks/useSessionActivity.js";
import { useSessionActivity } from "../hooks/useSessionActivity.js";

export interface SessionActivityPanelProps {
	sessionId: string;
	agentName: string;
	taskTitle: string;
	onClose: () => void;
}

type ActivityFilter = "all" | "tools" | "reasoning";

function ReasoningIcon(): JSX.Element {
	return (
		<svg viewBox="0 0 16 16" fill="currentColor" className="w-[10px] h-[10px]" aria-hidden="true">
			<path d="M8 1a6 6 0 100 12A6 6 0 008 1zM2 7a6 6 0 1112 0A6 6 0 012 7zm6-3a.75.75 0 01.75.75v2.5h1.5a.75.75 0 010 1.5h-2a.75.75 0 01-.75-.75V4.75A.75.75 0 018 4z" />
		</svg>
	);
}

function ActivityEntryRow({ entry }: { entry: ActivityEntry }): JSX.Element | null {
	const time = clockTime(entry.timestamp, { seconds: true });

	if (entry.type === "tool_call") {
		const { toolName, argsSummary } = entry.data;
		return (
			<div className="flex items-start gap-[9px] py-[6px] px-[8px] rounded-[var(--r-subtle)] hover:bg-[var(--surface-container)]">
				<span className="flex-shrink-0 mt-[2px] inline-flex items-center justify-center w-[20px] h-[20px] rounded-[var(--r-subtle)] bg-[var(--surface-container)] text-[var(--text-tertiary)]">
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
					<span className="type-data   text-[var(--text-primary)] ">{toolName}</span>
					{argsSummary && (
						<p className="type-metadata  text-[var(--text-tertiary)] truncate">{argsSummary}</p>
					)}
				</div>
				<span
					data-testid="activity-time"
					className="type-data flex-shrink-0  text-[var(--text-tertiary)] "
				>
					{time}
				</span>
			</div>
		);
	}

	if (entry.type === "reasoning") {
		const { excerpt } = entry.data;
		return (
			<div className="flex items-start gap-[9px] py-[6px] px-[8px] rounded-[var(--r-subtle)] hover:bg-[var(--surface-container)]">
				{/* Q1 review issue #12: SVG icon instead of emoji 💭 */}
				<span className="flex-shrink-0 mt-[2px] inline-flex items-center justify-center w-[20px] h-[20px] rounded-[var(--r-subtle)] bg-[var(--surface-container)] text-[var(--text-tertiary)]">
					<ReasoningIcon />
				</span>
				<p className="type-metadata flex-1  text-[var(--text-secondary)] italic">{excerpt}</p>
				<span
					data-testid="activity-time"
					className="type-data flex-shrink-0  text-[var(--text-tertiary)] "
				>
					{time}
				</span>
			</div>
		);
	}

	return null;
}

function filterEntry(entry: ActivityEntry, filter: ActivityFilter): boolean {
	if (filter === "all") return true;
	if (filter === "tools") return entry.type === "tool_call";
	if (filter === "reasoning") return entry.type === "reasoning";
	return false;
}

// Threshold (px from bottom) below which we consider the user "scrolled up"
const SCROLL_PAUSE_THRESHOLD = 40;

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
	// Q1 review issue #10: pause auto-scroll when user scrolls up
	const [autoScrollPaused, setAutoScrollPaused] = useState(false);
	// Q1 review issue #11: filter tabs
	const [activeFilter, setActiveFilter] = useState<ActivityFilter>("all");

	// Q1 review issue #10: detect scroll position to pause/resume auto-scroll
	const handleScroll = useCallback((): void => {
		const el = scrollRef.current;
		if (!el) return;
		const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
		setAutoScrollPaused(distanceFromBottom > SCROLL_PAUSE_THRESHOLD);
	}, []);

	// biome-ignore lint/correctness/useExhaustiveDependencies: entries.length triggers scroll on new entries
	useEffect(() => {
		// Q1 review issue #10: only auto-scroll when not paused by user
		if (!autoScrollPaused && scrollRef.current) {
			scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
		}
	}, [entries.length, autoScrollPaused]);

	const isLive = status === "streaming" || status === "connecting";

	const filteredEntries = entries.filter((e) => filterEntry(e, activeFilter));

	const FILTER_TABS: Array<{ id: ActivityFilter; label: string }> = [
		{ id: "all", label: "All" },
		{ id: "tools", label: "Tools" },
		{ id: "reasoning", label: "Reasoning" },
	];

	return (
		<aside
			aria-label={`Session activity for ${agentName}`}
			data-testid="session-activity-panel"
			className="border-l-[var(--bw-thin)] flex flex-col h-full bg-[var(--surface-container)]  border-[var(--border-subtle)]"
		>
			{/* Header */}
			<div className="border-b-[var(--bw-thin)] flex items-center gap-[9px] px-[12px] py-[10px]  border-[var(--border-subtle)] flex-shrink-0">
				<div className="flex-1 min-w-0">
					<div className="flex items-center gap-[6px]">
						<span className="type-small   text-[var(--text-primary)] truncate">{agentName}</span>
						{isLive && (
							<span
								role="status"
								data-spacing-role="compact-pill"
								className="type-label inline-flex items-center gap-[4px] px-[6px] py-[1px] rounded-[var(--r-pill)] bg-[color-mix(in_oklab,var(--accent-primary)_14%,transparent)] text-[var(--accent-deep)]   uppercase "
								aria-label="Live session"
							>
								<span className="motion-activity w-[5px] h-[5px] rounded-[var(--r-pill)] bg-[var(--accent-primary)] " />
								Live
							</span>
						)}
						{status === "ended" && (
							<span className="type-label  text-[var(--text-tertiary)] uppercase ">Ended</span>
						)}
					</div>
					<p className="type-metadata  text-[var(--text-tertiary)] truncate">{taskTitle}</p>
				</div>
				<button
					type="button"
					aria-label="Close activity panel"
					/* AI5 AQ-015: 44px touch floor ≤1024px, dense 24px ≥1280px. */
					className="flex-shrink-0 inline-flex items-center justify-center w-[24px] h-[24px] min-h-[44px] min-w-[44px] xl:min-h-[24px] xl:min-w-[24px] rounded-[var(--r-subtle)] bg-transparent text-[var(--text-tertiary)] border-none cursor-pointer   hover:bg-[var(--surface-container)] hover:text-[var(--text-secondary)]"
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

			{/* Q1 review issue #11: filter tabs — AI5: shared TabBar (underline). */}
			<div className="border-b-[var(--bw-thin)] flex-shrink-0 px-[8px] pt-[6px] pb-[2px]  border-[var(--border-subtle)]">
				<TabBar
					variant="underline"
					tabs={FILTER_TABS}
					activeId={activeFilter}
					onChange={(id) => setActiveFilter(id as ActivityFilter)}
				/>
			</div>

			{/* Activity stream */}
			<div
				ref={scrollRef}
				className="flex-1 overflow-y-auto px-[4px] py-[4px]"
				onScroll={handleScroll}
			>
				{status === "connecting" && (
					<div className="type-metadata py-[16px] text-center text-[var(--text-tertiary)] ">
						Connecting...
					</div>
				)}

				{status === "error" && (
					<div className="type-metadata py-[16px] text-center text-[var(--status-error)] ">
						{error ?? "Failed to load activity"}
					</div>
				)}

				{(status === "streaming" || status === "ended") && filteredEntries.length === 0 && (
					/* AI5: shared compact EmptyState. */
					<EmptyState
						compact
						title="No activity yet"
						description="Tool calls and reasoning will appear here as the session runs."
					/>
				)}

				{filteredEntries.map((entry, i) => (
					// biome-ignore lint/suspicious/noArrayIndexKey: entries have no stable id
					<ActivityEntryRow key={i} entry={entry} />
				))}

				{/* Q1 review issue #10: scroll-to-bottom nudge when paused */}
				{autoScrollPaused && entries.length > 0 && (
					<div className="sticky bottom-0 flex justify-center pb-[4px]">
						<Button
							variant="ghost"
							size="sm"
							onClick={() => {
								if (scrollRef.current) {
									scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
								}
								setAutoScrollPaused(false);
							}}
						>
							↓ Scroll to latest
						</Button>
					</div>
				)}
			</div>

			{/* Summary / footer */}
			{status === "ended" && (
				<div className="border-t-[var(--bw-thin)] type-metadata flex-shrink-0 px-[12px] py-[8px]  border-[var(--border-subtle)]  text-[var(--text-tertiary)]">
					Session complete — {entries.length} events recorded
				</div>
			)}
		</aside>
	);
}
