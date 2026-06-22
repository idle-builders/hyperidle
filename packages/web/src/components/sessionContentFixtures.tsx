/**
 * AM3 — Session CONTENT-RENDERING fixtures + the shared rendering atoms.
 *
 * Entry/placement is SETTLED (concept Phase 4): the session view IS a
 * `ConversationSurface`-shaped reading of a process-layer Session, reached via
 * the existing `session` OpenTarget. The design axis is NOT where the surface
 * sits — it is the RENDERING VOCABULARY of the session content: how the tool
 * calls and every other aspect (concept Part 7) are displayed, calmly, inside
 * that one surface.
 *
 * This file holds:
 *  1. ONE rich session fixture (`SESSION_PARTS`) that exercises the FULL aspect
 *     taxonomy — streaming text, reasoning, several tool FAMILIES incl. a FAILED
 *     tool + an MCP call + a sub-agent spawn, an aggregation run, a file edit with
 *     a diff, a cost tick, a permission prompt, a plan/todo, a completed-turn fold,
 *     an artifact, and a QUEUED human message.
 *  2. The shared rendering atoms (status glyph, diff stat, descriptor pills,
 *     queued bubble, composer, status roll-ups) that EVERY variant composes — so
 *     the founder compares the RENDERING LANGUAGE, not the data.
 *
 * The three variant stories (`SessionContent{Transcript,Glance,Timeline}`) differ
 * ONLY in how they render the SAME `SESSION_PARTS` — the disclosure/density of a
 * tool call, the tool-row grammar, how I/O & diffs reveal. NOT placement.
 *
 * Production rules this proves (architecture turns into the real adapter +
 * dispatch): the stream renders through the AM1 Part vocabulary EXTENDED with
 * `tool` + `reasoning` kinds (concept Phase 4); a tool run AGGREGATES (renderer
 * grouping, not a Part kind); file diffs reuse `ReviewCodeDiff` via a `diff`
 * Embed; composer controls render declaratively from a HarnessCapabilityDescriptor.
 *
 * @lore AM3: populated real state only — incl. a REAL failed tool + a REAL
 * permission prompt as populated content. No skeleton/empty/error variants.
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
export const FOUNDER: PartAuthor = { id: "u-founder", name: "A. Founder", isAgent: false, isMe: true };
export const ATLAS: PartAuthor = { id: "a-atlas", name: "Atlas", isAgent: true, isMe: false };

// ════════════════════════════════════════════════════════════════════
//  The session content model — the AM1 Part vocab EXTENDED with the two
//  new render kinds (concept Phase 4). Design-time shapes; in build these
//  widen the closed `PartKind` union.
// ════════════════════════════════════════════════════════════════════

/** The closed tool family set (concept aspect c) — unknown-tolerant in build. */
export type ToolKind =
	| "command"
	| "read"
	| "edit"
	| "search"
	| "web-search"
	| "mcp"
	| "sub-agent"
	| "create";
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
	/** A short single-line I/O preview shown AT REST by the glanceable grammar. */
	readonly preview?: string;
	/** Full collapsed body — stdout / matches / result; absent until expanded. */
	readonly output?: string;
	/** A file-change tool carries a diff stat → opens ReviewCodeDiff. */
	readonly diff?: { readonly label: string; readonly added: number; readonly removed: number };
	/** A sub-agent spawn carries a nested mini-stream (concept aspect j). */
	readonly subStream?: readonly { readonly verb: string; readonly target: string }[];
}

export interface ReasoningPart {
	readonly id: string;
	readonly kind: "reasoning";
	readonly author: PartAuthor;
	readonly createdAt: string;
	readonly durationMs: number;
	readonly text: string;
}

/** A streaming prose Part — the in-progress agent answer (text grows in build). */
export interface StreamingProsePart {
	readonly id: string;
	readonly kind: "prose";
	readonly author: PartAuthor;
	readonly createdAt: string;
	readonly text: string;
	readonly embeds: readonly [];
	readonly streaming: true;
}

/** A permission/approval prompt (concept aspect h) — populated inline content. */
export interface PermissionPart {
	readonly id: string;
	readonly kind: "permission";
	readonly author: PartAuthor;
	readonly createdAt: string;
	readonly action: string;
	readonly detail: string;
	readonly toolKind: ToolKind;
}

/** A plan/todo the agent follows (concept aspect k). */
export interface PlanPart {
	readonly id: string;
	readonly kind: "plan";
	readonly author: PartAuthor;
	readonly createdAt: string;
	readonly steps: readonly { readonly label: string; readonly state: "done" | "active" | "todo" }[];
}

/** An artifact the agent produced (concept aspect i). */
export interface ArtifactPart {
	readonly id: string;
	readonly kind: "artifact";
	readonly author: PartAuthor;
	readonly createdAt: string;
	readonly label: string;
	readonly meta: string;
}

export type SessionPart =
	| Extract<Part, { kind: "prose" }>
	| StreamingProsePart
	| ReasoningPart
	| ToolPart
	| PermissionPart
	| PlanPart
	| ArtifactPart;

export interface QueuedMessage {
	readonly id: string;
	readonly text: string;
	readonly author: PartAuthor;
}

// ── The realistic session fixture — the AI-SDK 5→6 chat-bug fix session ──
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
	// (k) the plan the agent commits to up front
	{
		id: "p1",
		kind: "plan",
		author: ATLAS,
		createdAt: T("0:09.000Z"),
		steps: [
			{ label: "Trace where the message stream is assembled", state: "done" },
			{ label: "Confirm the breaking change (parts[] vs content)", state: "done" },
			{ label: "Patch the server + client to agree on the shape", state: "active" },
			{ label: "Re-run the chat suite to confirm multi-turn append", state: "todo" },
		],
	},
	// (b) reasoning
	{
		id: "r1",
		kind: "reasoning",
		author: ATLAS,
		createdAt: T("0:11.000Z"),
		durationMs: 14_000,
		text: "The symptom — messages vanish on submit — points at the streaming response shape, not the composer. AI SDK 6 renamed parameters → input in tool() and replaced pipeDataStreamToResponse. Likely the backend still sends content: string where the v6 client now expects a parts array. I'll confirm by reading the chat panel + the prototype chat hook before changing anything.",
	},
	// (a) settled answer prose
	{
		id: "a1",
		kind: "prose",
		author: ATLAS,
		createdAt: T("0:13.000Z"),
		embeds: [],
		text: "Three breaking changes landed in the SDK bump. Let me trace where the message stream is assembled before I touch anything.",
	},
	// (c,e) a run of tool calls — these AGGREGATE. Includes read/command/search/web-search/mcp.
	{ id: "t1", kind: "tool", author: ATLAS, createdAt: T("0:18.000Z"), toolKind: "read", verb: "View", target: "useChatPanel.ts · 41 lines", status: "ok", preview: "useChat({ api, ... }) → renders message.parts" },
	{ id: "t2", kind: "tool", author: ATLAS, createdAt: T("0:19.000Z"), toolKind: "read", verb: "View", target: "chatPanel.tsx · 202 lines", status: "ok", preview: "maps msg.content (string) — stale shape" },
	{
		id: "t3",
		kind: "tool",
		author: ATLAS,
		createdAt: T("0:21.000Z"),
		toolKind: "command",
		verb: "Run command",
		target: "grep -rn '@ai-sdk/react' # check the installed major",
		status: "ok",
		preview: "@ai-sdk/react  6.0.3  · 4 matches",
		output:
			"node_modules/@ai-sdk/react/package.json\n  \"version\": \"6.0.3\"\nsrc/chat/useChatPanel.ts\n  import { useChat } from '@ai-sdk/react'  // v6 — expects parts[]\nsrc/chat/chatPanel.tsx\n  msg.content  // ← v5 shape, no longer rendered",
	},
	{ id: "t4", kind: "tool", author: ATLAS, createdAt: T("0:23.000Z"), toolKind: "web-search", verb: "Web search", target: "ai-sdk v6 useChat parts vs content breaking change", status: "ok", preview: "5 results · vercel.com/changelog, gh#4821" },
	{ id: "t5", kind: "tool", author: ATLAS, createdAt: T("0:24.000Z"), toolKind: "search", verb: "Search", target: "msg.content", status: "ok", preview: "3 matches in 2 files" },
	// (c) an MCP tool call — server/tool + args + result
	{
		id: "t6",
		kind: "tool",
		author: ATLAS,
		createdAt: T("0:26.000Z"),
		toolKind: "mcp",
		verb: "linear · search_issues",
		target: 'query: "AI SDK chat regression"',
		status: "ok",
		preview: "1 issue · ENG-411 “chat blank after send”",
		output: 'linear.search_issues({ query: "AI SDK chat regression" })\n→ ENG-411  chat blank after send  (in progress, assigned: atlas)',
	},
	// (a) answer prose — the diagnosis
	{
		id: "a2",
		kind: "prose",
		author: ATLAS,
		createdAt: T("0:31.000Z"),
		embeds: [],
		text: "Found it. AI SDK 6 sends messages with a `parts` array instead of a `content` string. Our backend still writes `content`, so the v6 client renders nothing — the message is dropped silently. Switching the server to emit `parts` and updating the append helper to match.",
	},
	// (h) a permission prompt before the edit (full-access not granted for this path)
	{
		id: "perm1",
		kind: "permission",
		author: ATLAS,
		createdAt: T("0:34.000Z"),
		toolKind: "edit",
		action: "Edit a file outside the working tree",
		detail: "server/chat/stream.ts",
	},
	// (c,f) the fix — a file-change tool carrying a diff (opens ReviewCodeDiff)
	{ id: "t7", kind: "tool", author: ATLAS, createdAt: T("0:38.000Z"), toolKind: "edit", verb: "Edit", target: "server/chat/stream.ts", status: "ok", preview: "emit parts[] instead of content", diff: { label: "server/chat/stream.ts", added: 9, removed: 2 } },
	// (d) a FAILED tool — reads distinctly: ✗ + stderr in the expanded body
	{
		id: "t8",
		kind: "tool",
		author: ATLAS,
		createdAt: T("0:40.000Z"),
		toolKind: "command",
		verb: "Run command",
		target: "npm test -- chat/stream",
		status: "failed",
		preview: "1 failing · appendMessage() still spreads { content }",
		output:
			"FAIL  src/chat/__tests__/stream.test.ts\n  ● assembles a parts[] payload\n    Expected: [{ type: 'text', text: 'hi' }]\n    Received: undefined\n  appendMessage() still spreads the old { content } shape (line 88).\n\n  exit code 1",
	},
	// (c,f) the follow-up edit fixing the append helper
	{ id: "t9", kind: "tool", author: ATLAS, createdAt: T("0:44.000Z"), toolKind: "edit", verb: "Edit", target: "client/useChatPanel.ts", status: "ok", preview: "spread parts[], drop content", diff: { label: "client/useChatPanel.ts", added: 6, removed: 4 } },
	// (c,j) a sub-agent spawn — nested mini-stream
	{
		id: "t10",
		kind: "tool",
		author: ATLAS,
		createdAt: T("0:47.000Z"),
		toolKind: "sub-agent",
		verb: "Spawn sub-agent",
		target: "verify the streaming response on Safari",
		status: "running",
		subStream: [
			{ verb: "Run command", target: "playwright test chat.safari.spec" },
			{ verb: "View", target: "chat.safari.spec.ts · 60 lines" },
		],
	},
	// (i) an artifact produced
	{
		id: "art1",
		kind: "artifact",
		author: ATLAS,
		createdAt: T("0:49.000Z"),
		label: "ai-sdk-6-migration-note.md",
		meta: "MD · 18 lines",
	},
	// (a) the latest agent turn is STILL STREAMING
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
	host: "Bet · Agent chat reliability",
	elapsedLabel: "Working for 1m 47s",
	changesAdded: 15,
	changesRemoved: 6,
	prNumber: 8885,
	backgroundCount: 1,
	artifactCount: 1,
	tokensLabel: "48.2k tokens",
	costLabel: "$0.71",
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
					control: { kind: "select", choices: [
						{ value: "low", label: "Low" },
						{ value: "medium", label: "Medium" },
						{ value: "high", label: "High" },
					] },
					required: false,
					scope: "launch",
					defaultValue: "medium",
				},
				{
					key: "mode",
					label: "Mode",
					control: { kind: "select", choices: [
						{ value: "interactive", label: "Interactive" },
						{ value: "build", label: "Build" },
						{ value: "plan", label: "Plan" },
					] },
					required: false,
					scope: "launch",
					defaultValue: "build",
				},
				{
					key: "permission",
					label: "Permission",
					control: { kind: "select", choices: [
						{ value: "supervised", label: "Supervised" },
						{ value: "accept-edits", label: "Accept edits" },
						{ value: "full-access", label: "Full access" },
					] },
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
//  SHARED RENDERING ATOMS — composed identically across all variants.
// ════════════════════════════════════════════════════════════════════

// per-kind tool icon (16-grid, monochrome — tone via icon not color).
const TOOL_ICON: Record<ToolKind, string> = {
	command: "M3 4l3 3-3 3M8 10h5",
	read: "M8 3.5C4.5 3.5 2 8 2 8s2.5 4.5 6 4.5S14 8 14 8 11.5 3.5 8 3.5zm0 6.5a2 2 0 110-4 2 2 0 010 4z",
	edit: "M11.5 2.5l2 2L6 12l-3 1 1-3 7.5-7.5z",
	search: "M7 1.5a5.5 5.5 0 014.2 9l3 3-1 1-3-3A5.5 5.5 0 117 1.5z",
	"web-search": "M8 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM2 8h12M8 2a9 9 0 010 12M8 2a9 9 0 000 12",
	mcp: "M8 1.5l1.7 1V5l2 .9v2.2l-2 .9v2.5l-1.7 1-1.7-1V9l-2-.9V5.9l2-.9V2.5z",
	"sub-agent": "M4 2h8v4H4zM6 6v2M10 6v2M2 8h12v4a1 1 0 01-1 1H3a1 1 0 01-1-1z",
	create: "M8 3v10M3 8h10",
};

export function ToolGlyph({ kind, size = 13 }: { kind: ToolKind; size?: number }): JSX.Element {
	return (
		<svg
			viewBox="0 0 16 16"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.3"
			strokeLinecap="round"
			strokeLinejoin="round"
			className="shrink-0"
			style={{ width: size, height: size }}
			aria-hidden="true"
		>
			<path d={TOOL_ICON[kind]} />
		</svg>
	);
}

export function StatusGlyph({ status }: { status: ToolStatus }): JSX.Element {
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
			<svg viewBox="0 0 12 12" className="h-[11px] w-[11px] shrink-0 text-[var(--status-success)]" aria-label="ok">
				<path d="M2.5 6.2 L5 8.5 L9.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
			</svg>
		);
	}
	if (status === "failed") {
		return (
			<svg viewBox="0 0 12 12" className="h-[11px] w-[11px] shrink-0 text-[var(--status-error)]" aria-label="failed">
				<path d="M3 3 L9 9 M9 3 L3 9" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
			</svg>
		);
	}
	return (
		<span className="text-[var(--text-tertiary)] text-[12px] leading-none" aria-label="neutral">
			–
		</span>
	);
}

/** The +N/−M diff stat chip — tabular (mirrors ReviewCodeDiff's ChangeBadge). */
export function DiffStat({ added, removed }: { added: number; removed: number }): JSX.Element {
	return (
		<span className="inline-flex items-center gap-[6px] font-mono tabular-nums text-[12px] leading-none">
			<span className="font-[600] text-[var(--status-success)]">+{added}</span>
			<span className="font-[600] text-[var(--status-error)]">−{removed}</span>
		</span>
	);
}

/** A small chevron that rotates on open — the shared disclosure glyph. */
export function Caret({ open, size = 11 }: { open: boolean; size?: number }): JSX.Element {
	return (
		<svg
			viewBox="0 0 12 12"
			className="shrink-0 text-[var(--text-tertiary)] transition-transform duration-[var(--motion-fast)]"
			style={{ width: size, height: size, transform: open ? "rotate(90deg)" : "none" }}
			aria-hidden="true"
		>
			<path d="M4 2.5 L8 6 L4 9.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
		</svg>
	);
}

/** A streaming-cursor caret appended to in-progress agent prose. */
export function StreamCursor(): JSX.Element {
	return (
		<span
			aria-hidden="true"
			className="ml-[3px] inline-block h-[15px] w-[2px] translate-y-[2px] bg-[var(--accent-primary)] motion-safe:animate-[skeleton-pulse_1s_ease-in-out_infinite]"
		/>
	);
}

// ── lightweight markdown-ish renderer (design-time; build reuses ChatMarkdown) ──
function renderInline(text: string): JSX.Element {
	const parts = text.split(/(`[^`]+`)/g);
	return (
		<>
			{parts.map((seg, i) =>
				seg.startsWith("`") && seg.endsWith("`") ? (
					// biome-ignore lint/suspicious/noArrayIndexKey: stable positional segments
					<code key={i} className="rounded-[var(--r-subtle)] bg-[var(--surface-container)] px-[3px] py-[3px] font-mono text-[13px] text-[var(--text-primary)]">
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
export function AgentProse({ text, streaming = false }: { text: string; streaming?: boolean }): JSX.Element {
	return (
		<p className="m-0 text-[15px] leading-[1.6] text-[var(--text-primary)]">
			{renderInline(text)}
			{streaming ? <StreamCursor /> : null}
		</p>
	);
}

/** Human message — right-aligned bubble (bubble vs full-width = authorship). */
export function HumanBubble({ text }: { text: string }): JSX.Element {
	return (
		<div className="flex justify-end">
			<div className="max-w-[80%] rounded-[var(--r-default)] border border-[var(--border-subtle)] bg-[var(--surface-container)] px-[12px] py-[9px] text-[14px] leading-[1.5] text-[var(--text-primary)]">
				{text}
			</div>
		</div>
	);
}

/** A queued (not-yet-delivered) human message — muted dashed bubble + clock + ✕. */
export function QueuedBubble({ text, onCancel }: { text: string; onCancel?: () => void }): JSX.Element {
	return (
		<div className="flex justify-end">
			<div className="flex max-w-[80%] items-start gap-[9px] rounded-[var(--r-default)] border border-dashed border-[var(--border-default)] bg-[var(--surface-container)] px-[12px] py-[9px] opacity-70">
				<svg viewBox="0 0 16 16" className="mt-[3px] h-[12px] w-[12px] shrink-0 text-[var(--text-tertiary)]" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true">
					<circle cx="8" cy="8" r="6" />
					<path d="M8 5v3l2 1.5" strokeLinecap="round" strokeLinejoin="round" />
				</svg>
				<div className="min-w-0">
					<div className="text-[14px] leading-[1.5] text-[var(--text-secondary)]">{text}</div>
					<div className="mt-[3px] text-[11px] text-[var(--text-tertiary)]">Queued · sends when the agent finishes</div>
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

/** Permission/approval prompt — Allow / Deny over the requested action (aspect h). */
export function PermissionPrompt({ part }: { part: PermissionPart }): JSX.Element {
	return (
		<div
			data-ds-component="PermissionPrompt"
			className="rounded-[var(--r-subtle)] border border-[var(--status-warning)] bg-[color-mix(in_oklab,var(--status-warning)_8%,transparent)] px-[12px] py-[9px]"
		>
			<div className="flex items-center gap-[9px]">
				<svg viewBox="0 0 16 16" className="h-[14px] w-[14px] shrink-0 text-[var(--status-warning)]" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true">
					<path d="M8 1.5l6 11H2z" strokeLinejoin="round" />
					<path d="M8 6v3M8 11h.01" strokeLinecap="round" />
				</svg>
				<span className="text-[13px] font-[600] text-[var(--text-primary)]">{part.action}?</span>
			</div>
			<div className="ms-[23px] mt-[3px] flex items-center gap-[6px] font-mono text-[12px] text-[var(--text-tertiary)]">
				<ToolGlyph kind={part.toolKind} size={12} />
				{part.detail}
			</div>
			<div className="ms-[23px] mt-[9px] flex items-center gap-[6px]">
				<button type="button" className="inline-flex h-[26px] items-center rounded-[var(--r-pill)] bg-[var(--accent-primary)] px-[12px] text-[12px] font-[600] text-[var(--text-on-accent)] transition-colors duration-[var(--motion-fast)] hover:bg-[var(--accent-primary-hover)]">
					Allow
				</button>
				<button type="button" className="inline-flex h-[26px] items-center rounded-[var(--r-pill)] border border-[var(--border-default)] px-[12px] text-[12px] font-[500] text-[var(--text-secondary)] transition-colors duration-[var(--motion-fast)] hover:text-[var(--text-primary)]">
					Deny
				</button>
				<span className="ms-[3px] text-[11px] text-[var(--text-tertiary)]">Supervised · this path is outside the working tree</span>
			</div>
		</div>
	);
}

/** A plan/todo the agent follows (aspect k) — compact step list, foldable. */
export function PlanList({ part }: { part: PlanPart }): JSX.Element {
	const [open, setOpen] = useState(true);
	const done = part.steps.filter((s) => s.state === "done").length;
	return (
		<div data-ds-component="PlanList" className="rounded-[var(--r-subtle)] border border-[var(--border-subtle)] bg-[var(--surface-elevated)]">
			<button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-center gap-[9px] px-[12px] py-[9px] text-left">
				<Caret open={open} />
				<span className="text-[10px] font-[600] uppercase tracking-[var(--tracking-caps-sm)] text-[var(--text-tertiary)]">Plan</span>
				<span className="flex-1 truncate text-[13px] text-[var(--text-secondary)]">{part.steps.find((s) => s.state === "active")?.label ?? "Complete"}</span>
				<span className="font-mono tabular-nums text-[12px] text-[var(--text-tertiary)]">{done}/{part.steps.length}</span>
			</button>
			{open ? (
				<ul className="m-0 list-none border-t border-[var(--border-subtle)] px-[12px] py-[6px]">
					{part.steps.map((s) => (
						<li key={s.label} className="flex items-center gap-[9px] py-[3px] text-[13px]">
							{s.state === "done" ? (
								<svg viewBox="0 0 12 12" className="h-[12px] w-[12px] shrink-0 text-[var(--status-success)]" aria-hidden="true">
									<path d="M2.5 6.2 L5 8.5 L9.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
								</svg>
							) : s.state === "active" ? (
								<span className="h-[10px] w-[10px] shrink-0 rounded-full border-[1.5px] border-[var(--accent-primary)] bg-[var(--accent-primary-dim)]" />
							) : (
								<span className="h-[10px] w-[10px] shrink-0 rounded-full border-[1.5px] border-[var(--border-default)]" />
							)}
							<span className={s.state === "done" ? "text-[var(--text-tertiary)] line-through" : s.state === "active" ? "font-[500] text-[var(--text-primary)]" : "text-[var(--text-secondary)]"}>
								{s.label}
							</span>
						</li>
					))}
				</ul>
			) : null}
		</div>
	);
}

/** An artifact chip (aspect i) — opens its owned surface (no inline viewing). */
export function ArtifactChip({ part }: { part: ArtifactPart }): JSX.Element {
	return (
		<button
			type="button"
			data-ds-component="ArtifactChip"
			className="inline-flex items-center gap-[6px] rounded-[var(--r-subtle)] border border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-[9px] py-[6px] text-left transition-colors duration-[var(--motion-fast)] hover:border-[var(--border-default)]"
		>
			<svg viewBox="0 0 16 16" className="h-[13px] w-[13px] shrink-0 text-[var(--accent-primary)]" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true">
				<path d="M4 1.5h5l3 3v10H4z" strokeLinejoin="round" />
				<path d="M9 1.5V4.5h3" />
			</svg>
			<span className="font-mono text-[12px] text-[var(--text-primary)]">{part.label}</span>
			<span className="text-[11px] text-[var(--text-tertiary)]">{part.meta}</span>
		</button>
	);
}

/** A per-turn cost/token tick (aspect g) — muted micro-row, never competing. */
export function CostTick(): JSX.Element {
	return (
		<div className="flex items-center gap-[9px] text-[11px] text-[var(--text-tertiary)]">
			<span className="inline-flex items-center gap-[4px]">
				<svg viewBox="0 0 16 16" className="h-[11px] w-[11px]" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true">
					<circle cx="8" cy="8" r="6" />
					<path d="M8 5v6M6.5 6.5h2.2a1.3 1.3 0 010 2.6H7.3a1.3 1.3 0 000 2.6H10" strokeLinecap="round" />
				</svg>
				<span className="font-mono tabular-nums">{SESSION_META.costLabel}</span>
			</span>
			<span className="font-mono tabular-nums">{SESSION_META.tokensLabel}</span>
		</div>
	);
}

// ── Author turn header (name · time) — the PartList group-header shape. ──
export function TurnHeader({ author, createdAt }: { author: PartAuthor; createdAt: string }): JSX.Element {
	return (
		<div className="flex items-baseline gap-[9px] pt-[6px]">
			<span className="text-[13px] font-[600] text-[var(--text-primary)]">{author.name}</span>
			<span className="text-[11px] tabular-nums text-[var(--text-tertiary)]">{clockTime(createdAt)}</span>
		</div>
	);
}

// ════════════════════════════════════════════════════════════════════
//  Composer + status roll-ups — descriptor-driven, shared across variants.
// ════════════════════════════════════════════════════════════════════

function PillSelect({ option, value, onPick }: { option: HarnessModelOptionDescriptor; value: string; onPick: (v: string) => void }): JSX.Element | null {
	if (option.control.kind !== "select") return null;
	const choices = option.control.choices;
	const current = choices.find((c) => c.value === value) ?? choices[0];
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

/** The composer: model pill + one pill per declared option + Send/Stop+Queue. */
export function SessionComposer({ running = false, elapsedLabel }: { running?: boolean; elapsedLabel?: string }): JSX.Element {
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
		<div data-ds-component="SessionComposer" className="rounded-[var(--r-default)] border border-[var(--border-default)] bg-[var(--surface-elevated)] shadow-[var(--shadow-subtle)]">
			<textarea
				value={text}
				onChange={(e) => setText(e.target.value)}
				rows={2}
				placeholder={running ? "Type to queue a message — it sends when the agent finishes" : "Ask anything · drop files/folders · @ to reference"}
				className="block w-full resize-none bg-transparent px-[12px] pt-[12px] pb-[6px] text-[15px] leading-[1.5] text-[var(--text-primary)] placeholder:text-[var(--text-placeholder)] focus:outline-none"
			/>
			<div className="flex items-center gap-[3px] px-[9px] pb-[9px] pt-[3px]">
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
				{(selected?.options ?? []).map((o) =>
					o.control.kind === "select" ? (
						<PillSelect key={o.key} option={o} value={values[o.key] ?? ""} onPick={(v) => setValues((p) => ({ ...p, [o.key]: v }))} />
					) : null,
				)}
				<span className="flex-1" />
				{running && elapsedLabel ? (
					<span className="mr-[6px] inline-flex items-center gap-[6px] text-[12px] text-[var(--text-tertiary)]">
						<span className="inline-block h-[6px] w-[6px] rounded-full bg-[var(--accent-secondary)] motion-safe:animate-[skeleton-pulse_1.4s_ease-in-out_infinite]" />
						{elapsedLabel}
					</span>
				) : null}
				{running ? (
					<>
						<button type="button" aria-label="Queue message" title="Send — queues while the agent works" className="inline-flex h-[30px] items-center gap-[6px] rounded-[var(--r-pill)] border border-[var(--border-default)] px-[12px] text-[12px] font-[500] text-[var(--text-secondary)] transition-colors duration-[var(--motion-fast)] hover:text-[var(--text-primary)]">
							Queue
						</button>
						<button type="button" aria-label="Stop the agent" className="inline-flex h-[30px] w-[30px] items-center justify-center rounded-[var(--r-pill)] bg-[var(--status-error)] text-[var(--text-on-accent)] transition-colors duration-[var(--motion-fast)] hover:bg-[var(--status-error-hover)]">
							<span className="h-[10px] w-[10px] rounded-[2px] bg-current" />
						</button>
					</>
				) : (
					<button type="button" aria-label="Send" className="inline-flex h-[30px] w-[30px] items-center justify-center rounded-[var(--r-pill)] bg-[var(--accent-primary)] text-[var(--text-on-accent)] transition-colors duration-[var(--motion-fast)] hover:bg-[var(--accent-primary-hover)]">
						<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-[14px] w-[14px]" aria-hidden="true">
							<path d="M8 13V3M4 7l4-4 4 4" strokeLinecap="round" strokeLinejoin="round" />
						</svg>
					</button>
				)}
			</div>
		</div>
	);
}

export function ScrollToBottomPill(): JSX.Element {
	return (
		<button type="button" className="inline-flex items-center gap-[6px] rounded-[var(--r-pill)] border border-[var(--border-default)] bg-[var(--surface-elevated)] px-[12px] py-[6px] text-[12px] font-[500] text-[var(--text-secondary)] shadow-[var(--shadow-default)] transition-colors duration-[var(--motion-fast)] hover:text-[var(--text-primary)]">
			<svg viewBox="0 0 12 12" className="h-[11px] w-[11px]" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
				<path d="M6 2v8M2.5 6.5L6 10l3.5-3.5" strokeLinecap="round" strokeLinejoin="round" />
			</svg>
			Scroll to bottom
		</button>
	);
}

/** Session status roll-ups (aspect p) — Changes / PR / Background / Artifacts + Ready CTA. */
export function SessionStatusBar({ withCta = false }: { withCta?: boolean }): JSX.Element {
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
			<span className="inline-flex items-center gap-[6px]">Background <span className="font-mono tabular-nums text-[var(--text-primary)]">{SESSION_META.backgroundCount}</span></span>
			<span className="inline-flex items-center gap-[6px]">Artifacts <span className="font-mono tabular-nums text-[var(--text-primary)]">{SESSION_META.artifactCount}</span></span>
			{withCta ? (
				<button type="button" className="ms-[6px] inline-flex h-[26px] items-center rounded-[var(--r-pill)] bg-[var(--accent-primary)] px-[12px] text-[12px] font-[600] text-[var(--text-on-accent)] transition-colors duration-[var(--motion-fast)] hover:bg-[var(--accent-primary-hover)]">
					Ready for review
				</button>
			) : null}
		</div>
	);
}

// ── Shared turn-blocking: group by author, aggregate a CONSECUTIVE tool run ──
// A file-change tool (carries a diff) or a failed/running tool never folds into a
// noise aggregate — those are load-bearing and stay as their own rows.
export type StreamBlock =
	| { readonly kind: "single"; readonly part: SessionPart }
	| { readonly kind: "tool-run"; readonly tools: readonly ToolPart[] };

export function blockStream(parts: readonly SessionPart[], aggregateAt: number): StreamBlock[] {
	const blocks: StreamBlock[] = [];
	let run: ToolPart[] = [];
	const flush = (): void => {
		if (run.length === 0) return;
		if (run.length >= aggregateAt) blocks.push({ kind: "tool-run", tools: run });
		else for (const t of run) blocks.push({ kind: "single", part: t });
		run = [];
	};
	for (const p of parts) {
		const foldable = p.kind === "tool" && p.diff === undefined && p.status !== "failed" && p.status !== "running" && p.toolKind !== "sub-agent";
		if (foldable) run.push(p as ToolPart);
		else {
			flush();
			blocks.push({ kind: "single", part: p });
		}
	}
	flush();
	return blocks;
}

export function aggregateVerb(tools: readonly ToolPart[]): string {
	const cmds = tools.filter((t) => t.toolKind === "command").length;
	const reads = tools.filter((t) => t.toolKind === "read").length;
	const searches = tools.filter((t) => t.toolKind === "web-search" || t.toolKind === "search").length;
	const mcp = tools.filter((t) => t.toolKind === "mcp").length;
	const out: string[] = [];
	if (cmds) out.push(cmds === 1 ? "ran a command" : `ran ${cmds} commands`);
	if (reads) out.push(reads === 1 ? "read a file" : `read ${reads} files`);
	if (searches) out.push(searches === 1 ? "searched" : `ran ${searches} searches`);
	if (mcp) out.push(mcp === 1 ? "queried Linear" : `made ${mcp} MCP calls`);
	const joined = out.join(", ");
	return joined.charAt(0).toUpperCase() + joined.slice(1);
}
