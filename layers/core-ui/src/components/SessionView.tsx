/**
 * SessionView: the production session view.
 *
 * A streaming human+agent conversation rendered through the SHARED `PartList` /
 * `ConversationSurface` component vocabulary — a session is a slightly different
 * FORM of conversation. No parallel renderer (a hard rule). No duplicated diff
 * renderer (reuses `ReviewCodeDiff` via the `diff` Embed's `OpenTarget`).
 *
 * Aggregation rule:
 *   - ALL COMPLETED tool calls fold into one aggregate expander — INCLUDING failed.
 *   - The ONLY standalone tool row is the currently-RUNNING one.
 *   - Aggregate header signals failures ("· N failed" + ✗ in --status-error).
 *   - Changed files panel always surfaces diffs regardless of fold.
 *   - `aggregateAt = 2` (calm bias).
 */

import type { ActivityEntry } from "@hyperidle/domain-model";
import type { HarnessCapabilityDescriptor } from "@hyperidle/harness-capability";
import { type JSX, useRef, useState } from "react";
import { Button, Avatar as DSAvatar, LiveDot, Tag } from "../ds";
import { call } from "../services/call.js";
import { clockTime } from "../utils/time.js";
import { initialsOf } from "./PartList.js";
import type { OpenHandler, Part, PartAuthor, ToolRunBlock } from "./parts";
import { aggregateToolRun, derivePartsFromSession, groupParts } from "./parts";
import { ProsePart } from "./parts/ProsePart.js";
import { QuestionnairePart } from "./parts/QuestionnairePart.js";
import { ReasoningPart } from "./parts/ReasoningPart.js";
import { ReviewRequestPart } from "./parts/ReviewRequestPart.js";
import { ReviewResolvedPart } from "./parts/ReviewResolvedPart.js";
import { ToolPart } from "./parts/ToolPart.js";
import { UnknownPart } from "./parts/UnknownPart.js";

// ── Types ─────────────────────────────────────────────────────────────

export interface SessionViewIdentity {
	/** The session-level agent (feeds PartAuthor on tool/reasoning Parts). */
	readonly agent: PartAuthor;
	/** The viewer / human participant. */
	readonly viewer: PartAuthor;
	/** Session title (the task description). */
	readonly title: string;
	/** Host label (e.g. "Bet · Agent chat reliability"). */
	readonly host: string;
}

export interface QueuedMessage {
	readonly id: string;
	readonly text: string;
	readonly author: PartAuthor;
}

export interface SessionViewProps {
	/**
	 * The session's own id — lets the header Stop control call
	 * `call("stop_session", { id: sessionId })` directly, with no callback
	 * threaded down from the page. Omitted only by stories/tests that render
	 * no live session; every production caller has a real id and the header
	 * control does not render without one.
	 */
	readonly sessionId?: string;
	/** The normalized activity entries from `useSessionActivity`. */
	readonly entries: ReadonlyArray<ActivityEntry>;
	/** Session identity (agent, viewer, title, host). */
	readonly identity: SessionViewIdentity;
	/** The harness capability descriptor (drives the composer pills). */
	readonly descriptor?: HarnessCapabilityDescriptor;
	/** "connecting" | "streaming" | "ended" | "error" */
	readonly status: "connecting" | "streaming" | "ended" | "error";
	/** The open handler seam (host/artifact/review/session routes). */
	readonly onOpen: OpenHandler;
	/** Called when the user sends a message (idle state). */
	readonly onSend: (text: string) => void;
	/** Called when the user clicks Stop (streaming state). */
	readonly onStop?: () => void;
}

// ── Helpers ──────────────────────────────────────────────────────────

function SessionAvatar({ who }: { who: PartAuthor }): JSX.Element {
	return (
		<span aria-hidden="true">
			<DSAvatar initials={initialsOf(who.name)} size="sm" agent={who.isAgent} />
		</span>
	);
}

function ParticipantGroup({ people }: { people: readonly PartAuthor[] }): JSX.Element {
	return (
		<div data-testid="session-identity-chip" className="flex items-center pl-[3px]">
			{people.map((p, i) => (
				<div
					key={p.id}
					className="rounded-[var(--r-pill)] ring-2 ring-[var(--surface-page)]"
					style={{ marginLeft: i === 0 ? 0 : -9, zIndex: people.length - i }}
				>
					<SessionAvatar who={p} />
				</div>
			))}
		</div>
	);
}

/**
 * Queued bubble — RIGHT-ALIGNED, muted, clock, "sends when the agent finishes" + ✕.
 * Follows the unified self/other pattern (isMe = right-bound grey box).
 */
function QueuedBubble({
	msg,
	onCancel,
}: {
	msg: QueuedMessage;
	onCancel: () => void;
}): JSX.Element {
	return (
		<div data-ds-component="QueuedRow" className="flex flex-col items-end opacity-70">
			<div className="flex max-w-[80%] flex-col gap-[9px]">
				<div className="flex items-center gap-[9px]">
					<SessionAvatar who={msg.author} />
					<span className="type-small   text-[var(--text-secondary)]">{msg.author.name}</span>
					<span className="type-metadata inline-flex items-center gap-[6px]  text-[var(--text-tertiary)]">
						<svg
							viewBox="0 0 16 16"
							className="h-[11px] w-[11px] shrink-0"
							fill="none"
							stroke="currentColor"
							strokeWidth="1.3"
							aria-hidden="true"
						>
							<circle cx="8" cy="8" r="6" />
							<path d="M8 5v3l2 1.5" strokeLinecap="round" strokeLinejoin="round" />
						</svg>
						Queued · sends when the agent finishes
					</span>
					<Button
						variant="ghost"
						tone="neutral"
						size="icon"
						onClick={onCancel}
						aria-label="Remove queued message"
						className="shrink-0"
					>
						<svg
							viewBox="0 0 12 12"
							className="h-[10px] w-[10px]"
							fill="none"
							stroke="currentColor"
							strokeWidth="1.5"
							aria-hidden="true"
						>
							<path d="M3 3 L9 9 M9 3 L3 9" strokeLinecap="round" />
						</svg>
					</Button>
				</div>
				<div className="rounded-[var(--r-default)] bg-[var(--surface-container)] px-[12px] py-[9px]">
					<p className="type-copy m-0   text-[var(--text-secondary)]">{msg.text}</p>
				</div>
			</div>
		</div>
	);
}

// ── Aggregation components ────────────────────────────────────────────

function AggregateCaret({ open }: { open: boolean }): JSX.Element {
	return (
		<svg
			viewBox="0 0 12 12"
			className="motion-move h-[11px] w-[11px] shrink-0 text-[var(--text-tertiary)]  "
			style={{ transform: open ? "rotate(90deg)" : "none" }}
			aria-hidden="true"
		>
			<path
				d="M4 2.5 L8 6 L4 9.5"
				fill="none"
				stroke="currentColor"
				strokeWidth="1.5"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

function aggregateVerb(tools: ReadonlyArray<Extract<Part, { kind: "tool" }>>): string {
	const edits = tools.filter(
		(t) => t.toolKind === "edit" || t.toolKind === "file-change" || t.toolKind === "create",
	).length;
	const cmds = tools.filter((t) => t.toolKind === "command").length;
	const reads = tools.filter((t) => t.toolKind === "read" || t.toolKind === "file-read").length;
	const searches = tools.filter(
		(t) => t.toolKind === "web-search" || t.toolKind === "search",
	).length;
	const mcp = tools.filter((t) => t.toolKind === "mcp").length;
	const out: string[] = [];
	if (edits) out.push(edits === 1 ? "edited a file" : `edited ${edits} files`);
	if (cmds) out.push(cmds === 1 ? "ran a command" : `ran ${cmds} commands`);
	if (reads) out.push(reads === 1 ? "read a file" : `read ${reads} files`);
	if (searches) out.push(searches === 1 ? "searched" : `ran ${searches} searches`);
	if (mcp) out.push(mcp === 1 ? "queried external tool" : `made ${mcp} MCP calls`);
	const joined = out.join(", ");
	return joined.charAt(0).toUpperCase() + joined.slice(1) || `${tools.length} steps`;
}

/**
 * HARD AGGREGATE — ALL completed tool calls fold here INCLUDING failed ones.
 * The aggregate header signals failures ("· N failed" + ✗ in --status-error).
 * On expand, the bare rows appear beneath a left rule.
 */
function HardAggregate({
	tools,
	onOpen,
}: {
	tools: ReadonlyArray<Extract<Part, { kind: "tool" }>>;
	onOpen: OpenHandler;
}): JSX.Element {
	const [open, setOpen] = useState(false);
	const failedCount = tools.filter((t) => t.status === "failed").length;

	return (
		<div data-ds-component="ToolAggregate" data-ds-aggregate-count={tools.length}>
			<button
				type="button"
				onClick={() => setOpen((v) => !v)}
				aria-expanded={open}
				className="type-control flex w-full items-center gap-[9px] py-[3px] text-left  text-[var(--text-secondary)]   hover:text-[var(--text-primary)]"
			>
				<AggregateCaret open={open} />
				<span className="type-small ">{aggregateVerb(tools)}</span>
				<span className="type-metadata text-[var(--text-tertiary)] ">· {tools.length} steps</span>
				{failedCount > 0 ? (
					<span
						data-ds-aggregate-failed={failedCount}
						className="type-metadata inline-flex items-center gap-[3px]   text-[var(--status-error)]"
					>
						<svg
							viewBox="0 0 12 12"
							role="img"
							aria-label="failed"
							className="h-[11px] w-[11px] shrink-0 text-[var(--status-error)]"
						>
							<path
								d="M3 3 L9 9 M9 3 L3 9"
								fill="none"
								stroke="currentColor"
								strokeWidth="1.6"
								strokeLinecap="round"
							/>
						</svg>
						{failedCount} failed
					</span>
				) : null}
			</button>
			{open ? (
				<div
					data-ds-aggregate-expanded="true"
					className="border-s-[var(--bw-thin)] ms-[3px] mt-[3px] flex flex-col  border-[var(--border-subtle)] ps-[12px]"
				>
					{tools.map((t) => (
						<ToolPart key={t.id} part={t} onOpen={onOpen} />
					))}
				</div>
			) : null}
		</div>
	);
}

/**
 * Changed files panel — per-session file changes.
 * Surfaces ALL file diffs from the session's tool Parts regardless of aggregation.
 * READ-ONLY: rows name the files but do not offer navigation (no resolved artifactId target).
 */
function ChangedFilesPanel({
	toolParts,
}: {
	toolParts: ReadonlyArray<Extract<Part, { kind: "tool" }>>;
}): JSX.Element | null {
	const diffs = toolParts.flatMap((t) =>
		t.embeds.filter((e) => e.kind === "diff").map((e) => ({ embed: e, toolId: t.id })),
	);
	if (diffs.length === 0) return null;

	// Aggregate +N / −M stats across all diffs
	const totalAdded = diffs.reduce((sum, { embed }) => {
		if (embed.kind !== "diff") return sum;
		const [a] = embed.meta.split("/");
		return sum + (Number.parseInt(a?.replace("+", "") ?? "0", 10) || 0);
	}, 0);
	const totalRemoved = diffs.reduce((sum, { embed }) => {
		if (embed.kind !== "diff") return sum;
		const [, r] = embed.meta.split("/");
		return sum + (Number.parseInt(r?.replace("−", "").replace("-", "") ?? "0", 10) || 0);
	}, 0);

	return (
		<div
			data-ds-component="ChangedFilesPanel"
			className="border-width-thin rounded-[var(--r-subtle)]  border-[var(--border-subtle)] bg-[var(--surface-elevated)]"
		>
			<div className="flex items-center gap-[9px] px-[12px] py-[9px]">
				<span className="type-label   uppercase  text-[var(--text-tertiary)]">Changed files</span>
				<span className="type-data  tabular-nums  text-[var(--text-secondary)]">
					{diffs.length}
				</span>
				<span className="type-data inline-flex items-center gap-[6px]  tabular-nums  ">
					<span className="type-small  text-[var(--status-success)]">+{totalAdded}</span>
					<span className="type-small  text-[var(--status-error)]">−{totalRemoved}</span>
				</span>
				<span className="flex-1" />
				{/*
				 * There is no "View diff" button. It fired `onOpen` with a target of
				 * `/artifacts/<file path>` has no navigable destination. The
				 * changed-file list below names the files and their counts, which is
				 * what this panel actually knows.
				 */}
			</div>
			<div className="border-width-thin-t  border-[var(--border-subtle)] px-[12px] py-[9px]">
				{diffs.map(({ embed, toolId }) => {
					if (embed.kind !== "diff") return null;
					const label = embed.label;
					const name = label.slice(label.lastIndexOf("/") + 1);
					const dir = label.slice(0, label.lastIndexOf("/") + 1);
					return (
						<div
							key={`${toolId}-${label}`}
							className="type-control flex w-full items-center gap-[9px] py-[3px]   text-left"
						>
							<span className="min-w-0 flex-1 truncate">
								<span className="text-[var(--text-tertiary)]">{dir}</span>
								<span className="text-[var(--text-primary)]">{name}</span>
							</span>
							<span className="type-data inline-flex items-center gap-[6px]  tabular-nums  ">
								<span className="type-small  text-[var(--status-success)]">
									{embed.meta.split("/")[0]}
								</span>
								<span className="type-small  text-[var(--status-error)]">
									{embed.meta.split("/")[1]}
								</span>
							</span>
						</div>
					);
				})}
			</div>
		</div>
	);
}

/**
 * SessionStream — renders author groups with tool-run aggregation.
 * Uses the SAME `parts/*` renderers as `PartList` with an extra `aggregateToolRun` step.
 * One renderer, one set of components, one extra grouping layer (NOT a parallel renderer).
 */

/** Render a single ToolRunBlock (aggregate or single Part). */
function renderBlock(block: ToolRunBlock, onOpen: OpenHandler): JSX.Element {
	if (block.kind === "tool-run") {
		return <HardAggregate tools={block.tools} onOpen={onOpen} />;
	}
	const part = block.part;
	switch (part.kind) {
		case "prose":
			return <ProsePart part={part} onOpen={onOpen} />;
		case "review":
			return <ReviewRequestPart part={part} onOpen={onOpen} />;
		case "resolved":
			return <ReviewResolvedPart part={part} onOpen={onOpen} />;
		case "questionnaire":
			return <QuestionnairePart part={part} />;
		case "tool":
			return <ToolPart part={part} onOpen={onOpen} />;
		case "reasoning":
			return <ReasoningPart part={part} />;
		case "unknown":
			return <UnknownPart part={part} />;
		default: {
			// Forward-compat guard — unreachable with the closed union.
			const Exhaustive: never = part;
			return <UnknownPart key={(Exhaustive as Part).id} />;
		}
	}
}

/**
 * Build the interleaved render sequence for one author group.
 *
 * Splits `parts` into contiguous "segments" — each segment is either a run of
 * consecutive tool Parts or a single non-tool Part. Each tool segment is passed
 * through `aggregateToolRun` (the shared canonical function, `aggregateAt = 2`).
 *
 * Using `aggregateToolRun` keeps the aggregation rule (ALL completed fold, running stays standalone) in one place.
 */
function buildGroupBlocks(parts: ReadonlyArray<Part>): ToolRunBlock[] {
	const result: ToolRunBlock[] = [];
	let toolRun: Array<Extract<Part, { kind: "tool" }>> = [];

	const flushToolRun = (): void => {
		if (toolRun.length === 0) return;
		// Delegate to the shared canonical aggregation rule (aggregateAt = 2).
		for (const block of aggregateToolRun(toolRun)) result.push(block);
		toolRun = [];
	};

	for (const part of parts) {
		if (part.kind === "tool") {
			toolRun.push(part);
		} else {
			flushToolRun();
			result.push({ kind: "single", part });
		}
	}
	flushToolRun();
	return result;
}

function SessionStream({
	parts,
	onOpen,
}: {
	parts: ReadonlyArray<Part>;
	onOpen: OpenHandler;
}): JSX.Element {
	const groups = groupParts(parts);

	return (
		<div data-ds-component="SessionStream" className="flex flex-col gap-[18px]">
			{groups.map((group) => {
				const head = group.parts[0];
				const isAgent = group.author.isAgent;
				const isSelf = group.author.isMe;
				const blocks = buildGroupBlocks(group.parts);

				return (
					<div
						key={head?.id ?? group.author.id}
						data-ds-component="PartGroup"
						data-ds-sender={isAgent ? "agent" : "human"}
						{...(isAgent ? { "data-ds-agent": "true" } : {})}
						{...(isSelf ? { "data-ds-self": "true" } : {})}
						className={`flex flex-col ${isSelf ? "items-end" : ""}`}
					>
						<div className={`flex flex-col gap-[9px] ${isSelf ? "max-w-[80%]" : ""}`}>
							<div className="flex items-center gap-[9px]">
								<SessionAvatar who={group.author} />
								<span className="type-small   text-[var(--text-primary)]">{group.author.name}</span>
								{isSelf && <span className="type-metadata   text-[var(--text-tertiary)]">You</span>}
								{head && (
									<span className="type-metadata  tabular-nums text-[var(--text-tertiary)]">
										{clockTime(head.createdAt)}
									</span>
								)}
							</div>
							<div
								className={
									isSelf
										? "flex flex-col gap-[12px] rounded-[var(--r-default)] bg-[var(--surface-container)] px-[12px] py-[9px] text-left"
										: "flex flex-col gap-[12px]"
								}
							>
								{blocks.map((block, idx) => {
									const key =
										block.kind === "tool-run"
											? `agg-${block.tools[0]?.id ?? idx}`
											: `part-${block.part.id}`;
									return <div key={key}>{renderBlock(block, onOpen)}</div>;
								})}
							</div>
						</div>
					</div>
				);
			})}
		</div>
	);
}

// ── Composer ─────────────────────────────────────────────────────────

const ICON_SEND = "M2 8l12-6-5.2 12-1.8-4.8L2 8z";

function ComposerGlyph({ d, size = 14 }: { d: string; size?: number }): JSX.Element {
	return (
		<svg
			viewBox="0 0 16 16"
			fill="currentColor"
			className="shrink-0"
			style={{ width: size, height: size }}
			aria-hidden="true"
		>
			<path d={d} />
		</svg>
	);
}

function SessionComposer({
	descriptor,
	selectedModelId: initialModelId,
	running,
	elapsedSecs,
	onSend,
	onStop,
}: {
	descriptor?: HarnessCapabilityDescriptor;
	selectedModelId: string;
	running: boolean;
	elapsedSecs: number;
	onSend: (text: string) => void;
	onStop?: () => void;
}): JSX.Element {
	const [text, setText] = useState("");
	const [selectedModelId, setSelectedModelId] = useState(initialModelId);
	/** Cycle to the next model in the descriptor list. */
	const handleModelCycle = (): void => {
		if (!descriptor) return;
		const ids = descriptor.models.map((m) => m.id);
		const idx = ids.indexOf(selectedModelId);
		setSelectedModelId(ids[(idx + 1) % ids.length] ?? selectedModelId);
	};

	const handleSend = (): void => {
		const trimmed = text.trim();
		if (trimmed) {
			onSend(trimmed);
			setText("");
		}
	};

	const elapsedLabel = elapsedSecs > 0 ? `Working for ${elapsedSecs}s` : "Working…";

	return (
		<div
			data-ds-component="SessionComposer"
			className="border-width-thin rounded-[var(--r-default)]  border-[var(--border-default)] bg-[var(--surface-elevated)] shadow-[var(--shadow-subtle)]   focus-within:shadow-[var(--shadow-default)]"
		>
			<div className="flex items-end gap-[9px] px-[12px] py-[9px]">
				<textarea
					value={text}
					onChange={(e) => setText(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === "Enter" && !e.shiftKey) {
							e.preventDefault();
							handleSend();
						}
					}}
					rows={2}
					placeholder={
						running
							? "Type to queue a message — it sends when the agent finishes"
							: "Send a message…"
					}
					className="type-input min-h-[48px] flex-1 resize-none border-none bg-transparent py-[3px]   text-[var(--text-primary)] outline-none placeholder:text-[var(--text-placeholder)]"
				/>
				{running ? (
					<Button variant="destructive" size="icon" onClick={onStop} aria-label="Stop the agent">
						<span className="h-[10px] w-[10px] rounded-none bg-current" />
					</Button>
				) : (
					<Button variant="primary" size="icon" onClick={handleSend} aria-label="Send message">
						<ComposerGlyph d={ICON_SEND} size={15} />
					</Button>
				)}
			</div>

			{/* descriptor pill row — model · working state */}
			<div className="border-width-thin-t flex items-center gap-[3px]  border-[var(--border-subtle)] px-[9px] py-[6px]">
				{descriptor && (
					<Button variant="ghost" tone="neutral" size="sm" onClick={handleModelCycle}>
						{descriptor.models.find((m) => m.id === selectedModelId)?.label ?? selectedModelId}
					</Button>
				)}
				<span className="flex-1" />
				{running && (
					<>
						<span className="type-metadata mr-[3px] inline-flex items-center gap-[6px]  text-[var(--text-tertiary)]">
							<span role="img" aria-label="running">
								<LiveDot tone="secondary" />
							</span>
							{elapsedLabel}
						</span>
						<Tag label="Queues while working" />
					</>
				)}
			</div>
		</div>
	);
}

// ── SessionView (production) ─────────────────────────────────────────

/**
 * The production session view — renders through the SAME `parts/*` renderers
 * as `PartList`, with `aggregateToolRun` grouping consecutive completed tool
 * Parts within each author turn. One renderer, one extra grouping layer.
 * No parallel renderer.
 */
export function SessionView({
	sessionId,
	entries,
	identity,
	descriptor,
	status,
	onOpen,
	onSend,
	onStop,
}: SessionViewProps): JSX.Element {
	const parts = derivePartsFromSession(entries, identity.agent);
	const scrollRef = useRef<HTMLDivElement>(null);
	const [queuedMessages, setQueuedMessages] = useState<QueuedMessage[]>([]);
	const [elapsedSecs] = useState(0);

	const running = status === "streaming";

	// Stop fires stop_session directly; the view learns the session ended only when useSessionActivity re-runs watch_session, never from this call's response.
	const handleStop = (): void => {
		if (!sessionId) return;
		void call("stop_session", { id: sessionId });
	};

	// Use the first model id from the descriptor as default
	const defaultModelId = descriptor?.models[0]?.id ?? "";

	const handleSend = (text: string): void => {
		if (running) {
			// Queue the message — non-interrupting; delivers after the agent finishes its current turn
			const queuedMsg: QueuedMessage = {
				id: `q-${Date.now()}`,
				text,
				author: identity.viewer,
			};
			setQueuedMessages((prev) => [...prev, queuedMsg]);
		} else {
			onSend(text);
		}
	};

	const handleCancelQueued = (id: string): void => {
		setQueuedMessages((prev) => prev.filter((m) => m.id !== id));
	};

	// Collect all tool parts for the Changed files panel (always surfaces diffs)
	const toolParts = parts.filter(
		(p): p is Extract<typeof p, { kind: "tool" }> => p.kind === "tool",
	);

	return (
		<div
			data-ds-component="SessionView"
			className="type-small flex h-full w-full flex-col bg-[var(--surface-page)]"
			style={{}}
		>
			{/* header — minimal session identity */}
			<header className="border-width-thin-b flex shrink-0 items-center gap-[12px]  border-[var(--border-subtle)] bg-[var(--surface-page)] px-[18px] py-[12px]">
				<div className="mx-auto flex w-full max-w-[760px] items-center gap-[12px]">
					<div className="min-w-0 flex-1">
						<div className="type-metadata flex items-center gap-[6px]  text-[var(--text-secondary)]">
							<span className="inline-flex items-center gap-[6px]">
								{running && (
									<span role="img" aria-label="running">
										<LiveDot tone="secondary" />
									</span>
								)}
								<Tag label="Session" tone="accent" />
							</span>
							<span className="text-[var(--text-tertiary)]">·</span>
							<span className="type-small truncate  text-[var(--text-primary)]">
								{identity.host}
							</span>
						</div>
						<h2 className="type-lead mt-[3px] mb-0    text-[var(--text-primary)]">
							{identity.title}
						</h2>
					</div>
					{sessionId && (
						<Button
							variant="destructive"
							size="sm"
							onClick={handleStop}
							disabled={!running}
							data-testid="session-header-stop"
						>
							Stop
						</Button>
					)}
					<span className="h-[20px] w-px bg-[var(--border-subtle)]" />
					<ParticipantGroup people={[identity.agent, identity.viewer]} />
				</div>
			</header>

			{/* reading column */}
			<div className="relative flex-1 overflow-hidden" ref={scrollRef}>
				<div className="h-full overflow-y-auto">
					<div className="mx-auto flex max-w-[760px] flex-col gap-[12px] px-[24px] py-[18px]">
						{/* SessionStream: groupParts + aggregateToolRun — same parts/* renderers,
						    one extra grouping layer for the session-specific aggregation rule */}
						<SessionStream parts={parts} onOpen={onOpen} />

						{/* Changed files panel — surfaces all file diffs regardless of fold */}
						<ChangedFilesPanel toolParts={toolParts} />

						{/* queued messages — right-aligned, muted, cancellable */}
						{queuedMessages.map((q) => (
							<QueuedBubble key={q.id} msg={q} onCancel={() => handleCancelQueued(q.id)} />
						))}
					</div>
				</div>
			</div>

			{/* composer — conversation's EXACT container treatment + descriptor pills */}
			<div className="shrink-0 bg-[var(--surface-page)] px-[18px] pb-[18px] pt-[9px]">
				<div className="mx-auto w-full max-w-[760px]">
					<SessionComposer
						descriptor={descriptor}
						selectedModelId={defaultModelId}
						running={running}
						elapsedSecs={elapsedSecs}
						onSend={handleSend}
						onStop={onStop}
					/>
				</div>
			</div>
		</div>
	);
}
