/**
 * AM3 (redo) — Session view design fixtures + the new-Part-kind renderers.
 *
 * A session IS a streaming human+agent conversation (concept §Session view).
 * This file embodies the design so the three placement variants render in
 * isolation in the `:8098` viewer. It is NOT production wiring — the production
 * rules it proves (architecture turns these into the real adapter + dispatch):
 *
 *  1. The stream renders through the AM1 Part vocabulary, EXTENDED with two new
 *     render kinds — `tool` and `reasoning` (concept Phase 4). Below, `SessionPart`
 *     is the local design-time union (real `Part` ∪ the two new shapes) so the
 *     story can render the real look BEFORE the closed union is widened in build.
 *  2. A run of consecutive `tool` Parts AGGREGATES to one "N tool calls" row
 *     (the key anti-noise device) — a renderer grouping, never a Part kind.
 *  3. File diffs reuse the review diff look (ReviewCodeDiff) via a `diff` Embed
 *     on a file-change `tool` Part — NO new diff renderer.
 *  4. Composer controls render DECLARATIVELY from a HarnessCapabilityDescriptor
 *     (select→pill, boolean→toggle, …) — never per-backend-branched.
 *
 * @lore AM3: the design renders the SAME fixture across all three placement
 * variants so the founder compares entry-surface, not content. Only populated +
 * one in-progress (streaming) turn is shown — no skeleton/empty/error variants.
 */

import type {
	HarnessCapabilityDescriptor,
	HarnessModelOptionDescriptor,
	Part,
	PartAuthor,
} from "@hyperidle/shared";
import { clockTime } from "@hyperidle/shared";
import { type JSX, useState } from "react";

// ── Identities ──────────────────────────────────────────────────────
export const FOUNDER: PartAuthor = {
	id: "u-founder",
	name: "A. Founder",
	isAgent: false,
	isMe: true,
};
export const ATLAS: PartAuthor = { id: "a-atlas", name: "Atlas", isAgent: true, isMe: false };

// ── The two NEW Part render kinds (design-time shapes, concept Phase 4) ──
// In build these widen the closed `PartKind` union. Here they live alongside
// the real `Part` so the story renders the real look without touching shared.
export type ToolKind = "command" | "read" | "edit" | "web-search" | "search" | "mcp";
export type ToolStatus = "running" | "ok" | "failed" | "neutral";

export interface ToolPart {
	readonly id: string;
	readonly kind: "tool";
	readonly author: PartAuthor;
	readonly createdAt: string;
	readonly toolKind: ToolKind;
	readonly verb: string;
	readonly target?: string;
	readonly status: ToolStatus;
	/** collapsed mono body; absent until expanded. */
	readonly output?: string;
	/** a file-change tool carries a diff stat → opens ReviewCodeDiff. */
	readonly diff?: { readonly label: string; readonly added: number; readonly removed: number };
}

export interface ReasoningPart {
	readonly id: string;
	readonly kind: "reasoning";
	readonly author: PartAuthor;
	readonly createdAt: string;
	readonly durationMs: number;
	readonly text: string;
}

/** A streaming prose Part — the design-time extension of a `prose` Part with a
 *  live-append flag (in build this is a derived turn-scoped streaming state). */
export interface StreamingProsePart {
	readonly id: string;
	readonly kind: "prose";
	readonly author: PartAuthor;
	readonly createdAt: string;
	readonly text: string;
	readonly embeds: readonly [];
	readonly streaming: true;
}

export type SessionPart =
	| Extract<Part, { kind: "prose" }>
	| ToolPart
	| ReasoningPart
	| StreamingProsePart;

// ── A queued human message — pre-Part composer/session state (concept §Queue) ──
export interface QueuedMessage {
	readonly id: string;
	readonly text: string;
	readonly author: PartAuthor;
}

// ── The realistic session fixture — the AI-SDK-version-bump session from the refs ──
// Agent dominates the column; one human bubble; tool runs that AGGREGATE; a
// reasoning span; a file-change tool with a diff; ends mid-stream (in-progress).
const T = (s: string): string => `2026-06-22T14:0${s}`;

export const SESSION_PARTS: readonly SessionPart[] = [
	{
		id: "h1",
		kind: "prose",
		author: FOUNDER,
		createdAt: T("0:02.000Z"),
		embeds: [],
		text: "The agent chat broke after the AI SDK 5→6 bump — messages just disappear after I hit enter. Find the root cause and fix it.",
	},
	{
		id: "r1",
		kind: "reasoning",
		author: ATLAS,
		createdAt: T("0:11.000Z"),
		durationMs: 14_000,
		text: "The symptom — messages vanish on submit — points at the streaming response shape, not the composer. AI SDK 6 renamed parameters → input in tool() and replaced pipeDataStreamToResponse. Likely the backend still sends content: string where the v3 client now expects a parts array. I'll confirm by reading the chat panel + the prototype chat hook before changing anything.",
	},
	{
		id: "a1",
		kind: "prose",
		author: ATLAS,
		createdAt: T("0:13.000Z"),
		embeds: [],
		text: "Three breaking changes landed in the SDK bump. Let me trace where the message stream is assembled before I touch anything.",
	},
	// ── a run of tool calls — these AGGREGATE to one row ──
	{
		id: "t1",
		kind: "tool",
		author: ATLAS,
		createdAt: T("0:18.000Z"),
		toolKind: "read",
		verb: "View",
		target: "useChatPanel.ts · 41 lines",
		status: "ok",
	},
	{
		id: "t2",
		kind: "tool",
		author: ATLAS,
		createdAt: T("0:19.000Z"),
		toolKind: "read",
		verb: "View",
		target: "chatPanel.tsx · 202 lines",
		status: "ok",
	},
	{
		id: "t3",
		kind: "tool",
		author: ATLAS,
		createdAt: T("0:21.000Z"),
		toolKind: "command",
		verb: "Run command",
		target: "grep -rn '@ai-sdk/react' # check the installed major",
		status: "ok",
		output:
			"node_modules/@ai-sdk/react/package.json\n  \"version\": \"6.0.3\"\nsrc/chat/useChatPanel.ts\n  import { useChat } from '@ai-sdk/react'  // v6 — expects parts[]",
	},
	{
		id: "t4",
		kind: "tool",
		author: ATLAS,
		createdAt: T("0:23.000Z"),
		toolKind: "web-search",
		verb: "Web search",
		target: "ai-sdk v6 useChat parts vs content breaking change",
		status: "ok",
	},
	{
		id: "a2",
		kind: "prose",
		author: ATLAS,
		createdAt: T("0:31.000Z"),
		embeds: [],
		text: "Found it. AI SDK 6 sends messages with a `parts` array instead of a `content` string. Our backend still writes `content`, so the v6 client renders nothing — the message is dropped silently. Switching the server to emit `parts` and updating the append helper to match.",
	},
	// ── the fix — a file-change tool carrying a diff (opens ReviewCodeDiff) ──
	{
		id: "t5",
		kind: "tool",
		author: ATLAS,
		createdAt: T("0:38.000Z"),
		toolKind: "edit",
		verb: "Edit",
		target: "server/chat/stream.ts",
		status: "ok",
		diff: { label: "server/chat/stream.ts", added: 9, removed: 2 },
	},
	{
		id: "t6",
		kind: "tool",
		author: ATLAS,
		createdAt: T("0:40.000Z"),
		toolKind: "command",
		verb: "Run command",
		target: "npm test -- chat/stream",
		status: "failed",
		output:
			"FAIL  src/chat/__tests__/stream.test.ts\n  ● assembles a parts[] payload\n    Expected: [{ type: 'text', text: 'hi' }]\n    Received: undefined\n  appendMessage() still spreads the old { content } shape (line 88).",
	},
	{
		id: "t7",
		kind: "tool",
		author: ATLAS,
		createdAt: T("0:44.000Z"),
		toolKind: "edit",
		verb: "Edit",
		target: "client/useChatPanel.ts",
		status: "ok",
		diff: { label: "client/useChatPanel.ts", added: 6, removed: 4 },
	},
	// ── the latest agent turn is STILL STREAMING ──
	{
		id: "a3",
		kind: "prose",
		author: ATLAS,
		createdAt: T("0:51.000Z"),
		embeds: [],
		streaming: true,
		text: "Both files now agree on the `parts[]` shape and the stream test passes. Re-running the full chat suite to confirm multi-turn append still works before I",
	},
];

// ── the changed-files roll-up for the session (feeds ReviewCodeDiff) ──
export const CHANGED_FILES = [
	{ path: "server/chat/stream.ts", added: 9, removed: 2 },
	{ path: "client/useChatPanel.ts", added: 6, removed: 4 },
] as const;

export const QUEUED: readonly QueuedMessage[] = [
	{
		id: "q1",
		text: "When it's green, also check the streaming response on Safari — that's where it first showed up.",
		author: FOUNDER,
	},
];

export const SESSION_META = {
	agent: "Atlas",
	task: "Fix agent chat broken by AI SDK 5→6",
	elapsedLabel: "Working for 1m 47s",
	changesAdded: 15,
	changesRemoved: 6,
	prNumber: 8885,
	backgroundCount: 1,
	artifactCount: 2,
} as const;

// ── Capability descriptor (AM2 shape) — drives the composer pills declaratively ──
export const DESCRIPTOR: HarnessCapabilityDescriptor = {
	type: "claude-code",
	name: "Claude Code",
	kind: "local",
	accessMode: "provider-subscription-cli",
	authAction: { kind: "native_cli_login", label: "Logged in" },
	discovery: { state: "ready", version: "1.4.2" },
	modelProviders: ["anthropic"],
	runtime: {
		preCompactionTrigger: true,
		subAgents: true,
		mcpSupport: true,
		modelProviders: ["anthropic"],
		fileEditing: true,
		toolUse: true,
	},
	models: [
		{
			id: "claude-opus-4-8",
			label: "Opus 4.8",
			provider: "anthropic",
			contextWindow: 1_000_000,
			selectable: true,
			inheritedFromGateway: false,
			options: [
				{
					key: "effort",
					label: "Effort",
					control: {
						kind: "select",
						choices: [
							{ value: "low", label: "Low" },
							{ value: "medium", label: "Medium" },
							{ value: "high", label: "High" },
						],
					},
					required: false,
					scope: "launch",
					defaultValue: "medium",
				},
				{
					key: "mode",
					label: "Mode",
					control: {
						kind: "select",
						choices: [
							{ value: "interactive", label: "Interactive" },
							{ value: "build", label: "Build" },
							{ value: "plan", label: "Plan" },
						],
					},
					required: false,
					scope: "launch",
					defaultValue: "build",
				},
				{
					key: "permission",
					label: "Permission",
					control: {
						kind: "select",
						choices: [
							{ value: "supervised", label: "Supervised" },
							{ value: "accept-edits", label: "Accept edits" },
							{ value: "full-access", label: "Full access" },
						],
					},
					required: false,
					scope: "launch",
					defaultValue: "full-access",
				},
			],
		},
		{
			id: "claude-sonnet-4-6",
			label: "Sonnet 4.6",
			provider: "anthropic",
			contextWindow: 1_000_000,
			selectable: true,
			inheritedFromGateway: false,
			options: [],
		},
	],
};

// ════════════════════════════════════════════════════════════════════
//  RENDERERS for the new Part kinds — the real look, mirroring PartList.
//  These are the design embodiment of `case "tool"` / `case "reasoning"`.
// ════════════════════════════════════════════════════════════════════

// per-kind tool icon (16-grid paths, monochrome — tone via icon not color).
const TOOL_ICON: Record<ToolKind, string> = {
	command: "M3 4l3 3-3 3M8 10h5", // terminal ›_
	read: "M8 3.5C4.5 3.5 2 8 2 8s2.5 4.5 6 4.5S14 8 14 8 11.5 3.5 8 3.5zm0 6.5a2 2 0 110-4 2 2 0 010 4z", // eye
	edit: "M11.5 2.5l2 2L6 12l-3 1 1-3 7.5-7.5z", // pen
	"web-search": "M8 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM2 8h12M8 2a9 9 0 010 12M8 2a9 9 0 000 12", // globe
	search: "M7 1.5a5.5 5.5 0 014.2 9l3 3-1 1-3-3A5.5 5.5 0 117 1.5z", // magnifier
	mcp: "M8 1.5l1.7 1V5l2 .9v2.2l-2 .9v2.5l-1.7 1-1.7-1V9l-2-.9V5.9l2-.9V2.5z", // wrench/hex
};

function ToolGlyph({ kind }: { kind: ToolKind }): JSX.Element {
	return (
		<svg
			viewBox="0 0 16 16"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.3"
			strokeLinecap="round"
			strokeLinejoin="round"
			className="h-[13px] w-[13px] shrink-0"
			aria-hidden="true"
		>
			<path d={TOOL_ICON[kind]} />
		</svg>
	);
}

function StatusGlyph({ status }: { status: ToolStatus }): JSX.Element | null {
	if (status === "running") {
		return (
			<span
				className="inline-block h-[7px] w-[7px] shrink-0 rounded-full bg-[var(--accent-secondary)] motion-safe:animate-[skeleton-pulse_1.4s_ease-in-out_infinite]"
				aria-label="running"
			/>
		);
	}
	if (status === "ok") {
		return (
			<svg
				viewBox="0 0 12 12"
				className="h-[11px] w-[11px] shrink-0 text-[var(--status-success)]"
				aria-label="ok"
			>
				<path
					d="M2.5 6.2 L5 8.5 L9.5 3.5"
					fill="none"
					stroke="currentColor"
					strokeWidth="1.6"
					strokeLinecap="round"
					strokeLinejoin="round"
				/>
			</svg>
		);
	}
	if (status === "failed") {
		return (
			<svg
				viewBox="0 0 12 12"
				className="h-[11px] w-[11px] shrink-0 text-[var(--status-error)]"
				aria-label="failed"
			>
				<path
					d="M3 3 L9 9 M9 3 L3 9"
					fill="none"
					stroke="currentColor"
					strokeWidth="1.6"
					strokeLinecap="round"
				/>
			</svg>
		);
	}
	return (
		<span className="text-[var(--text-tertiary)] text-[12px] leading-none" aria-label="neutral">
			–
		</span>
	);
}

/** the +N/−M diff stat chip — tabular so digits hold column (mirrors ReviewCodeDiff). */
export function DiffStat({ added, removed }: { added: number; removed: number }): JSX.Element {
	return (
		<span className="inline-flex items-center gap-[6px] font-mono tabular-nums text-[12px] leading-none">
			<span className="font-[600] text-[var(--status-success)]">+{added}</span>
			<span className="font-[600] text-[var(--status-error)]">−{removed}</span>
		</span>
	);
}

/** One compact tool row: [icon] verb — target (muted, truncated) [diff] [▾] [status]. */
export function ToolRow({ part, onDiff }: { part: ToolPart; onDiff?: () => void }): JSX.Element {
	const [open, setOpen] = useState(false);
	const canExpand = part.output !== undefined;
	return (
		<div data-ds-component="ToolRow" className="group/tool">
			{/* biome-ignore lint/a11y/useSemanticElements: a diff chip button nests inside; role/button avoids invalid nested-button DOM. */}
			<div
				role={canExpand ? "button" : undefined}
				tabIndex={canExpand ? 0 : undefined}
				onClick={canExpand ? () => setOpen((v) => !v) : undefined}
				onKeyDown={
					canExpand
						? (e) => {
								if (e.key === "Enter" || e.key === " ") {
									e.preventDefault();
									setOpen((v) => !v);
								}
							}
						: undefined
				}
				className={`flex items-center gap-[9px] py-[3px] text-[13px] ${canExpand ? "cursor-pointer" : ""}`}
			>
				<span className="text-[var(--text-tertiary)]">
					<ToolGlyph kind={part.toolKind} />
				</span>
				<span className="shrink-0 font-[500] text-[var(--text-secondary)]">{part.verb}</span>
				{part.target ? (
					<span className="min-w-0 flex-1 truncate font-mono text-[12px] text-[var(--text-tertiary)]">
						{part.target}
					</span>
				) : (
					<span className="flex-1" />
				)}
				{part.diff ? (
					<button
						type="button"
						onClick={(e) => {
							e.stopPropagation();
							onDiff?.();
						}}
						className="inline-flex shrink-0 items-center gap-[6px] rounded-[var(--r-pill)] border border-[var(--border-subtle)] px-[9px] py-[3px] transition-colors duration-[var(--motion-fast)] hover:border-[var(--border-default)]"
					>
						<span className="font-mono text-[11px] text-[var(--text-tertiary)]">
							{part.diff.label.split("/").pop()}
						</span>
						<DiffStat added={part.diff.added} removed={part.diff.removed} />
					</button>
				) : null}
				{canExpand ? (
					<svg
						viewBox="0 0 12 12"
						className="h-[11px] w-[11px] shrink-0 text-[var(--text-tertiary)] transition-transform duration-[var(--motion-fast)]"
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
				) : null}
				<StatusGlyph status={part.status} />
			</div>
			{open && part.output ? (
				<pre className="ms-[24px] mt-[3px] max-h-64 overflow-auto whitespace-pre-wrap border-s border-[var(--border-subtle)] ps-[12px] py-[6px] font-mono text-[12px] leading-[1.5] text-[var(--text-secondary)]">
					{part.output}
				</pre>
			) : null}
		</div>
	);
}

/** The aggregate row over a run of tool Parts: "Ran N commands, read a file ▾". */
export function ToolAggregate({ tools }: { tools: readonly ToolPart[] }): JSX.Element {
	const [open, setOpen] = useState(false);
	const verb = aggregateVerb(tools);
	const failed = tools.some((t) => t.status === "failed");
	return (
		<div data-ds-component="ToolAggregate">
			<button
				type="button"
				onClick={() => setOpen((v) => !v)}
				aria-expanded={open}
				className="flex w-full items-center gap-[9px] py-[3px] text-left text-[13px] text-[var(--text-secondary)] transition-colors duration-[var(--motion-fast)] hover:text-[var(--text-primary)]"
			>
				<svg
					viewBox="0 0 12 12"
					className="h-[11px] w-[11px] shrink-0 text-[var(--text-tertiary)] transition-transform duration-[var(--motion-fast)]"
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
				<span className="font-[500]">{verb}</span>
				{failed ? (
					<span className="text-[var(--status-error)]">
						<StatusGlyph status="failed" />
					</span>
				) : (
					<span className="text-[var(--text-tertiary)] text-[12px]">{tools.length} steps</span>
				)}
			</button>
			{open ? (
				<div className="ms-[3px] mt-[3px] flex flex-col border-s border-[var(--border-subtle)] ps-[12px]">
					{tools.map((t) => (
						<ToolRow key={t.id} part={t} />
					))}
				</div>
			) : null}
		</div>
	);
}

function aggregateVerb(tools: readonly ToolPart[]): string {
	const cmds = tools.filter((t) => t.toolKind === "command").length;
	const reads = tools.filter((t) => t.toolKind === "read").length;
	const searches = tools.filter((t) => t.toolKind === "web-search" || t.toolKind === "search").length;
	const parts: string[] = [];
	if (cmds) parts.push(cmds === 1 ? "ran a command" : `ran ${cmds} commands`);
	if (reads) parts.push(reads === 1 ? "read a file" : `read ${reads} files`);
	if (searches) parts.push(searches === 1 ? "searched the web" : `ran ${searches} searches`);
	const joined = parts.join(", ");
	return joined.charAt(0).toUpperCase() + joined.slice(1);
}

/** The quiet reasoning block: "Thought for Ns ▸", re-expands to muted prose. */
export function ReasoningRow({ part }: { part: ReasoningPart }): JSX.Element {
	const [open, setOpen] = useState(false);
	const secs = Math.round(part.durationMs / 1000);
	return (
		<div data-ds-component="ReasoningRow">
			<button
				type="button"
				onClick={() => setOpen((v) => !v)}
				aria-expanded={open}
				className="inline-flex items-center gap-[6px] py-[3px] text-[12px] font-[500] text-[var(--text-tertiary)] transition-colors duration-[var(--motion-fast)] hover:text-[var(--text-secondary)]"
			>
				<svg viewBox="0 0 16 16" className="h-[12px] w-[12px] shrink-0" aria-hidden="true">
					<path
						d="M5 13a3 3 0 01-1-5.8A3.5 3.5 0 0111 5a2.5 2.5 0 011 4.8"
						fill="none"
						stroke="currentColor"
						strokeWidth="1.2"
						strokeLinecap="round"
						strokeLinejoin="round"
					/>
				</svg>
				<span className="italic">Thought for {secs}s</span>
				<svg
					viewBox="0 0 12 12"
					className="h-[10px] w-[10px] shrink-0 transition-transform duration-[var(--motion-fast)]"
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
			</button>
			{open ? (
				<p className="ms-[18px] mt-[3px] border-s border-[var(--border-subtle)] ps-[12px] text-[13px] italic leading-[1.6] text-[var(--text-tertiary)]">
					{part.text}
				</p>
			) : null}
		</div>
	);
}

/** A streaming-cursor caret appended to the in-progress agent prose. */
export function StreamCursor(): JSX.Element {
	return (
		<span
			aria-hidden="true"
			className="ml-[3px] inline-block h-[15px] w-[2px] translate-y-[2px] bg-[var(--accent-primary)] motion-safe:animate-[skeleton-pulse_1s_ease-in-out_infinite]"
		/>
	);
}

// ── lightweight markdown-ish renderer for agent prose (headings/lists/inline code) ──
// design-time only; build reuses the real ChatMarkdown. Renders the shapes the
// references show: bold lead, `inline code`, paragraph flow.
function renderInline(text: string): JSX.Element {
	const parts = text.split(/(`[^`]+`)/g);
	return (
		<>
			{parts.map((seg, i) =>
				seg.startsWith("`") && seg.endsWith("`") ? (
					// biome-ignore lint/suspicious/noArrayIndexKey: stable positional segments
					<code
						key={i}
						className="rounded-[var(--r-subtle)] bg-[var(--surface-container)] px-[3px] py-[3px] font-mono text-[13px] text-[var(--text-primary)]"
					>
						{seg.slice(1, -1)}
					</code>
				) : (
					// biome-ignore lint/suspicious/noArrayIndexKey: stable positional segments
					<span key={i}>{seg}</span>
				),
			)}
		</>
	);
}

/** Agent full-width prose (no bubble) — markdown body, optional streaming caret. */
export function AgentProse({
	text,
	streaming = false,
}: {
	text: string;
	streaming?: boolean;
}): JSX.Element {
	return (
		<p className="m-0 text-[15px] leading-[1.6] text-[var(--text-primary)]">
			{renderInline(text)}
			{streaming ? <StreamCursor /> : null}
		</p>
	);
}

/** Human message — right-aligned bubble (concept: bubble vs full-width = authorship). */
export function HumanBubble({ text }: { text: string }): JSX.Element {
	return (
		<div className="flex justify-end">
			<div className="max-w-[80%] rounded-[var(--r-default)] border border-[var(--border-subtle)] bg-[var(--surface-container)] px-[12px] py-[9px] text-[14px] leading-[1.5] text-[var(--text-primary)]">
				{text}
			</div>
		</div>
	);
}

/** A queued (not-yet-delivered) human message — muted bubble + clock + dequeue ✕. */
export function QueuedBubble({ text, onCancel }: { text: string; onCancel?: () => void }): JSX.Element {
	return (
		<div className="flex justify-end">
			<div className="group/q flex max-w-[80%] items-start gap-[9px] rounded-[var(--r-default)] border border-dashed border-[var(--border-default)] bg-[var(--surface-container)] px-[12px] py-[9px] opacity-70">
				<svg
					viewBox="0 0 16 16"
					className="mt-[3px] h-[12px] w-[12px] shrink-0 text-[var(--text-tertiary)]"
					fill="none"
					stroke="currentColor"
					strokeWidth="1.3"
					aria-hidden="true"
				>
					<circle cx="8" cy="8" r="6" />
					<path d="M8 5v3l2 1.5" strokeLinecap="round" strokeLinejoin="round" />
				</svg>
				<div className="min-w-0">
					<div className="text-[14px] leading-[1.5] text-[var(--text-secondary)]">{text}</div>
					<div className="mt-[3px] text-[11px] text-[var(--text-tertiary)]">
						Queued · sends when the agent finishes
					</div>
				</div>
				<button
					type="button"
					onClick={onCancel}
					aria-label="Remove queued message"
					className="shrink-0 rounded-[var(--r-subtle)] p-[3px] text-[var(--text-tertiary)] transition-colors duration-[var(--motion-fast)] hover:bg-[var(--surface-page)] hover:text-[var(--text-secondary)]"
				>
					<svg viewBox="0 0 12 12" className="h-[10px] w-[10px]" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
						<path d="M3 3 L9 9 M9 3 L3 9" strokeLinecap="round" />
					</svg>
				</button>
			</div>
		</div>
	);
}

// ── Streaming render of the heterogeneous Part stream ──
// Groups by author; aggregates a CONSECUTIVE run of tool Parts into one row when
// the run is ≥ `aggregateAt`. Mirrors PartList's grouping + dispatch shape.
type StreamBlock =
	| { kind: "single"; part: SessionPart }
	| { kind: "tool-run"; tools: ToolPart[] };

function blockStream(parts: readonly SessionPart[], aggregateAt: number): StreamBlock[] {
	const blocks: StreamBlock[] = [];
	let run: ToolPart[] = [];
	const flush = (): void => {
		if (run.length === 0) return;
		if (run.length >= aggregateAt) blocks.push({ kind: "tool-run", tools: run });
		else for (const t of run) blocks.push({ kind: "single", part: t });
		run = [];
	};
	for (const p of parts) {
		// A file-change tool that carries a diff is load-bearing — it never folds
		// into a noise aggregate; it gets its own row so its diff chip is visible.
		if (p.kind === "tool" && p.diff === undefined) {
			run.push(p);
		} else {
			flush();
			blocks.push({ kind: "single", part: p });
		}
	}
	flush();
	return blocks;
}

export function SessionStream({
	parts = SESSION_PARTS,
	aggregateAt = 3,
	onDiff,
}: {
	parts?: readonly SessionPart[];
	aggregateAt?: number;
	onDiff?: (label: string) => void;
}): JSX.Element {
	const blocks = blockStream(parts, aggregateAt);
	let lastAuthorId = "";
	return (
		<div data-ds-component="SessionStream" className="flex flex-col gap-[12px]">
			{blocks.map((b, i) => {
				const part = b.kind === "single" ? b.part : b.tools[0];
				const author = part?.author ?? ATLAS;
				const showAuthor = author.id !== lastAuthorId;
				lastAuthorId = author.id;
				const human = !author.isAgent;
				return (
					// biome-ignore lint/suspicious/noArrayIndexKey: stream order is stable for the fixture
					<div key={i} className="flex flex-col gap-[6px]">
						{showAuthor && author.isAgent ? (
							<div className="flex items-baseline gap-[9px] pt-[6px]">
								<span className="text-[13px] font-[600] text-[var(--text-primary)]">
									{author.name}
								</span>
								{part ? (
									<span className="text-[11px] tabular-nums text-[var(--text-tertiary)]">
										{clockTime(part.createdAt)}
									</span>
								) : null}
							</div>
						) : null}
						{b.kind === "tool-run" ? (
							<ToolAggregate tools={b.tools} />
						) : human ? (
							<HumanBubble text={(b.part as { text: string }).text} />
						) : b.part.kind === "tool" ? (
							<ToolRow
								part={b.part}
								onDiff={b.part.diff ? () => onDiff?.(b.part.kind === "tool" ? (b.part.diff?.label ?? "") : "") : undefined}
							/>
						) : b.part.kind === "reasoning" ? (
							<ReasoningRow part={b.part} />
						) : (
							<AgentProse
								text={(b.part as { text: string }).text}
								streaming={"streaming" in b.part && b.part.streaming === true}
							/>
						)}
					</div>
				);
			})}
		</div>
	);
}

// ════════════════════════════════════════════════════════════════════
//  Composer — descriptor-driven pill strip + Send/Stop (working state).
// ════════════════════════════════════════════════════════════════════

function PillSelect({
	option,
	value,
	onPick,
}: {
	option: HarnessModelOptionDescriptor;
	value: string;
	onPick: (v: string) => void;
}): JSX.Element | null {
	if (option.control.kind !== "select") return null;
	const choices = option.control.choices;
	const current = choices.find((c) => c.value === value) ?? choices[0];
	// resting affordance: one pill showing the current choice + a caret (a real
	// menu opens on click in build; here clicking cycles to demo it's live).
	const idx = choices.findIndex((c) => c.value === value);
	return (
		<button
			type="button"
			onClick={() => onPick(choices[(idx + 1) % choices.length]?.value ?? value)}
			className="inline-flex items-center gap-[6px] rounded-[var(--r-pill)] px-[9px] py-[3px] text-[12px] font-[500] text-[var(--text-secondary)] transition-colors duration-[var(--motion-fast)] hover:bg-[var(--surface-container)] hover:text-[var(--text-primary)]"
			data-ds-control="select"
		>
			{current?.label}
			<svg viewBox="0 0 12 12" className="h-[9px] w-[9px] text-[var(--text-tertiary)]" aria-hidden="true">
				<path d="M2.5 4.5 L6 8 L9.5 4.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
			</svg>
		</button>
	);
}

const ICON_MODEL = "M8 1.5l1.1 3.4L12.5 6 9.1 7.1 8 10.5 6.9 7.1 3.5 6l3.4-1.1L8 1.5z";

/** The composer: model pill + one pill per declared option + Send/Stop.
 *  `running` → primary action is Stop (red square) and Send queues. */
export function SessionComposer({
	running = false,
	elapsedLabel,
}: {
	running?: boolean;
	elapsedLabel?: string;
}): JSX.Element {
	const model = DESCRIPTOR.models[0];
	const [modelId, setModelId] = useState(model?.id ?? "");
	const selected = DESCRIPTOR.models.find((m) => m.id === modelId) ?? model;
	const [values, setValues] = useState<Record<string, string>>(() => {
		const v: Record<string, string> = {};
		for (const o of selected?.options ?? []) if (typeof o.defaultValue === "string") v[o.key] = o.defaultValue;
		return v;
	});
	const [text, setText] = useState("");

	return (
		<div
			data-ds-component="SessionComposer"
			className="rounded-[var(--r-default)] border border-[var(--border-default)] bg-[var(--surface-elevated)] shadow-[var(--shadow-subtle)]"
		>
			<textarea
				value={text}
				onChange={(e) => setText(e.target.value)}
				rows={2}
				placeholder={running ? "Type to queue a message — it sends when the agent finishes" : "Ask anything · drop files/folders · @ to reference"}
				className="block w-full resize-none bg-transparent px-[12px] pt-[12px] pb-[6px] text-[15px] leading-[1.5] text-[var(--text-primary)] placeholder:text-[var(--text-placeholder)] focus:outline-none"
			/>
			<div className="flex items-center gap-[3px] px-[9px] pb-[9px] pt-[3px]">
				{/* model pill */}
				<button
					type="button"
					onClick={() => {
						const ids = DESCRIPTOR.models.filter((m) => m.selectable).map((m) => m.id);
						setModelId(ids[(ids.indexOf(modelId) + 1) % ids.length] ?? modelId);
					}}
					className="inline-flex items-center gap-[6px] rounded-[var(--r-pill)] px-[9px] py-[3px] text-[12px] font-[500] text-[var(--text-secondary)] transition-colors duration-[var(--motion-fast)] hover:bg-[var(--surface-container)] hover:text-[var(--text-primary)]"
				>
					<svg viewBox="0 0 16 16" fill="currentColor" className="h-[12px] w-[12px] text-[var(--accent-primary)]" aria-hidden="true">
						<path d={ICON_MODEL} />
					</svg>
					{selected?.label}
				</button>
				<span className="h-[16px] w-px bg-[var(--border-subtle)]" />
				{/* one pill per declared option — Sonnet declares none → these vanish */}
				{(selected?.options ?? []).map((o) =>
					o.control.kind === "select" ? (
						<PillSelect
							key={o.key}
							option={o}
							value={values[o.key] ?? ""}
							onPick={(v) => setValues((p) => ({ ...p, [o.key]: v }))}
						/>
					) : null,
				)}
				<span className="flex-1" />
				{running && elapsedLabel ? (
					<span className="mr-[6px] inline-flex items-center gap-[6px] text-[12px] text-[var(--text-tertiary)]">
						<span className="inline-block h-[6px] w-[6px] rounded-full bg-[var(--accent-secondary)] motion-safe:animate-[skeleton-pulse_1.4s_ease-in-out_infinite]" />
						{elapsedLabel}
					</span>
				) : null}
				{/* primary action: Send (idle) or Stop (running). When running, Send queues. */}
				{running ? (
					<>
						<button
							type="button"
							aria-label="Queue message"
							title="Send — queues while the agent works"
							className="inline-flex h-[30px] items-center gap-[6px] rounded-[var(--r-pill)] border border-[var(--border-default)] px-[12px] text-[12px] font-[500] text-[var(--text-secondary)] transition-colors duration-[var(--motion-fast)] hover:text-[var(--text-primary)]"
						>
							Queue
						</button>
						<button
							type="button"
							aria-label="Stop the agent"
							className="inline-flex h-[30px] w-[30px] items-center justify-center rounded-[var(--r-pill)] bg-[var(--status-error)] text-[var(--text-on-accent)] transition-colors duration-[var(--motion-fast)] hover:bg-[var(--status-error-hover)]"
						>
							<span className="h-[10px] w-[10px] rounded-[2px] bg-current" />
						</button>
					</>
				) : (
					<button
						type="button"
						aria-label="Send"
						className="inline-flex h-[30px] w-[30px] items-center justify-center rounded-[var(--r-pill)] bg-[var(--accent-primary)] text-[var(--text-on-accent)] transition-colors duration-[var(--motion-fast)] hover:bg-[var(--accent-primary-hover)]"
					>
						<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-[14px] w-[14px]" aria-hidden="true">
							<path d="M8 13V3M4 7l4-4 4 4" strokeLinecap="round" strokeLinejoin="round" />
						</svg>
					</button>
				)}
			</div>
		</div>
	);
}

// ── Scroll-to-bottom pill (the streaming auto-pin escape affordance) ──
export function ScrollToBottomPill(): JSX.Element {
	return (
		<button
			type="button"
			className="inline-flex items-center gap-[6px] rounded-[var(--r-pill)] border border-[var(--border-default)] bg-[var(--surface-elevated)] px-[12px] py-[6px] text-[12px] font-[500] text-[var(--text-secondary)] shadow-[var(--shadow-default)] transition-colors duration-[var(--motion-fast)] hover:text-[var(--text-primary)]"
		>
			<svg viewBox="0 0 12 12" className="h-[11px] w-[11px]" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
				<path d="M6 2v8M2.5 6.5L6 10l3.5-3.5" strokeLinecap="round" strokeLinejoin="round" />
			</svg>
			Scroll to bottom
		</button>
	);
}

// ── Session status bar (Changes / PR / Background / Artifacts roll-ups) ──
export function SessionStatusBar(): JSX.Element {
	return (
		<div className="flex flex-wrap items-center gap-x-[18px] gap-y-[6px] text-[12px] text-[var(--text-secondary)]">
			<span className="inline-flex items-center gap-[6px]">
				<svg viewBox="0 0 16 16" className="h-[12px] w-[12px] text-[var(--text-tertiary)]" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true">
					<path d="M11.5 2.5l2 2L6 12l-3 1 1-3 7.5-7.5z" strokeLinejoin="round" />
				</svg>
				Changes
				<DiffStat added={SESSION_META.changesAdded} removed={SESSION_META.changesRemoved} />
			</span>
			<span className="inline-flex items-center gap-[6px]">
				<svg viewBox="0 0 16 16" className="h-[12px] w-[12px] text-[var(--text-tertiary)]" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true">
					<circle cx="4" cy="4" r="2" /><circle cx="4" cy="12" r="2" /><circle cx="12" cy="8" r="2" /><path d="M4 6v4M6 12h4a2 2 0 002-2" />
				</svg>
				PR <span className="font-mono tabular-nums text-[var(--text-primary)]">#{SESSION_META.prNumber}</span>
			</span>
			<span className="inline-flex items-center gap-[6px]">
				Background <span className="font-mono tabular-nums text-[var(--text-primary)]">{SESSION_META.backgroundCount}</span>
			</span>
			<span className="inline-flex items-center gap-[6px]">
				Artifacts <span className="font-mono tabular-nums text-[var(--text-primary)]">{SESSION_META.artifactCount}</span>
			</span>
		</div>
	);
}
