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
 *     tool + an MCP call + a sub-agent spawn (which OPENS its own nested session),
 *     an aggregation run, a file edit with a diff, a cost tick, a plan/todo, a
 *     completed-turn fold, an artifact, and a QUEUED human message.
 *  2. The shared rendering atoms — REUSING the conversation's components (avatars,
 *     left-aligned human-message row, composer chrome incl. the "+" attach
 *     affordance) + the session-specific atoms (status glyph, diff stat, descriptor
 *     pills, queued row) — that the chosen variant composes.
 *
 * APPROVED DIRECTION (founder review, 2026-06-22): Variant 1 — "Calm Transcript".
 * Annotations applied here: NO inline permission/approval prompt (the REVIEW is the
 * allow point, not a per-tool gate); human messages render LEFT-ALIGNED like the
 * HyperIdle chat (not a right-aligned bubble); avatars + composer + human-row REUSE
 * the conversation's components; the header carries only minimal session identity
 * (no PR / change-count / Background / Artifacts metrics bar); a sub-agent tool row
 * OPENS its own nested session view. See `plans/AM3/design/approved.md`.
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
export const FOUNDER: PartAuthor = {
	id: "u-founder",
	name: "A. Founder",
	isAgent: false,
	isMe: true,
};
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
	/**
	 * A sub-agent spawn is ITSELF a Session — it carries a `session` OpenTarget and
	 * OPENS its own nested session view (concept aspect j, founder review 2026-06-22:
	 * "this could yet again open a session view just of the sub agent"). Design-time
	 * shape; in build this is the real `OpenTarget` { route: "session", sessionId }.
	 */
	readonly opensSession?: { readonly sessionId: string; readonly label: string };
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
	{
		id: "t1",
		kind: "tool",
		author: ATLAS,
		createdAt: T("0:18.000Z"),
		toolKind: "read",
		verb: "View",
		target: "useChatPanel.ts · 41 lines",
		status: "ok",
		preview: "useChat({ api, ... }) → renders message.parts",
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
		preview: "maps msg.content (string) — stale shape",
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
		preview: "@ai-sdk/react  6.0.3  · 4 matches",
		output:
			'node_modules/@ai-sdk/react/package.json\n  "version": "6.0.3"\nsrc/chat/useChatPanel.ts\n  import { useChat } from \'@ai-sdk/react\'  // v6 — expects parts[]\nsrc/chat/chatPanel.tsx\n  msg.content  // ← v5 shape, no longer rendered',
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
		preview: "5 results · vercel.com/changelog, gh#4821",
	},
	{
		id: "t5",
		kind: "tool",
		author: ATLAS,
		createdAt: T("0:24.000Z"),
		toolKind: "search",
		verb: "Search",
		target: "msg.content",
		status: "ok",
		preview: "3 matches in 2 files",
	},
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
		output:
			'linear.search_issues({ query: "AI SDK chat regression" })\n→ ENG-411  chat blank after send  (in progress, assigned: atlas)',
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
	// (c,e,f) THE FIX — a CONSECUTIVE run of tool calls: edit · run-command · edit ·
	// failed-test. Under the round-5 aggregation rule ALL completed tool calls fold
	// into ONE aggregate — edits AND the failed `npm test` (t10) included; the
	// aggregate header signals "· 1 failed". The edits' DIFFS are never lost: they
	// surface in the per-turn Changed-files panel below regardless of the fold.
	// NO permission prompt precedes them — the agent acts freely; the REVIEW is the
	// allow point (concept rejection 9).
	{
		id: "t7",
		kind: "tool",
		author: ATLAS,
		createdAt: T("0:38.000Z"),
		toolKind: "edit",
		verb: "Edit",
		target: "server/chat/stream.ts",
		status: "ok",
		preview: "emit parts[] instead of content",
		diff: { label: "server/chat/stream.ts", added: 9, removed: 2 },
	},
	{
		id: "t8",
		kind: "tool",
		author: ATLAS,
		createdAt: T("0:40.000Z"),
		toolKind: "command",
		verb: "Run command",
		target: "npx codemod content-to-parts ./client",
		status: "ok",
		preview: "rewrote 3 call sites",
	},
	{
		id: "t9",
		kind: "tool",
		author: ATLAS,
		createdAt: T("0:44.000Z"),
		toolKind: "edit",
		verb: "Edit",
		target: "client/useChatPanel.ts",
		status: "ok",
		preview: "spread parts[], drop content",
		diff: { label: "client/useChatPanel.ts", added: 6, removed: 4 },
	},
	// (d) a FAILED tool — round-5: FOLDS into the adjacent aggregate with t7/t8/t9.
	// The aggregate header signals the failure ("· 1 failed" + ✗); on expand this
	// step shows its ✗ + stderr. No completed tool call sits standalone.
	{
		id: "t10",
		kind: "tool",
		author: ATLAS,
		createdAt: T("0:46.000Z"),
		toolKind: "command",
		verb: "Run command",
		target: "npm test -- chat/stream",
		status: "failed",
		preview: "1 failing · appendMessage() still spreads { content }",
		output:
			"FAIL  src/chat/__tests__/stream.test.ts\n  ● assembles a parts[] payload\n    Expected: [{ type: 'text', text: 'hi' }]\n    Received: undefined\n  appendMessage() still spreads the old { content } shape (line 88).\n\n  exit code 1",
	},
	// (c,j) a sub-agent spawn — opens its OWN nested session view (recursion).
	// STAYS STANDALONE — round-5: the running sub-agent is the ONLY standalone tool
	// row (a still-running/live tool is never folded; once it completes it folds too).
	{
		id: "t11",
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
		opensSession: { sessionId: "sess-safari-verify", label: "Safari verifier" },
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

// Minimal session identity only — NO PR # / change-count / Background / Artifacts
// metrics roll-up (founder review 2026-06-22; concept rejection 10). `changesAdded/
// Removed` remain ONLY for the per-turn changed-files panel (real work product,
// aspect f), never a header metrics bar. `tokens/cost` feed the COMBINED
// SESSION-TOTAL cost in the HEADER (annotation 4) — not an inline per-turn tick.
export const SESSION_META = {
	agent: "Atlas",
	task: "Fix agent chat broken by AI SDK 5→6",
	host: "Bet · Agent chat reliability",
	elapsedLabel: "Working for 1m 47s",
	changesAdded: 15,
	changesRemoved: 6,
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
				// NOTE: no `permission` pill — HyperIdle has no per-tool allow/deny gate
				// (concept rejection 9). Model · Effort · Mode are the launch settings.
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
	"web-search":
		"M8 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM2 8h12M8 2a9 9 0 010 12M8 2a9 9 0 000 12",
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

// ── Avatar — REUSED from the conversation (ConversationSurface): human vs agent
//    tint + a stronger agent ring. Same initials, same sizes, same tokens. ──
function initialsOf(name: string): string {
	const parts = name.trim().split(/\s+/).filter(Boolean);
	if (parts.length === 0) return "?";
	if (parts.length === 1) return (parts[0]?.slice(0, 2) ?? "?").toUpperCase();
	return `${parts[0]?.[0] ?? ""}${parts[parts.length - 1]?.[0] ?? ""}`.toUpperCase();
}

/** Conversation avatar — REUSED look (founder review: "the avatar should look like in the chat"). */
export function Avatar({ who, size = 26 }: { who: PartAuthor; size?: number }): JSX.Element {
	const color = who.isAgent
		? "bg-[var(--accent-primary-dim)] border-[var(--accent-primary)] text-[var(--accent-primary)]"
		: "bg-[var(--surface-container)] border-[var(--border-default)] text-[var(--text-secondary)]";
	return (
		<div
			className={`inline-flex items-center justify-center rounded-full border-[1.5px] font-[600] shrink-0 ${color}`}
			style={{ width: size, height: size, fontSize: size <= 22 ? 10 : 12 }}
			aria-hidden="true"
		>
			{initialsOf(who.name)}
		</div>
	);
}

/** Header avatar group — REUSED from the conversation surface. */
export function ParticipantGroup({ people }: { people: readonly PartAuthor[] }): JSX.Element {
	return (
		<div data-ds-component="AvatarGroup" className="flex items-center pl-[3px]">
			{people.map((p, i) => (
				<div
					key={p.id}
					className="rounded-full ring-2 ring-[var(--surface-page)]"
					style={{ marginLeft: i === 0 ? 0 : -9, zIndex: people.length - i }}
				>
					<Avatar who={p} size={26} />
				</div>
			))}
		</div>
	);
}

// ── Human message — LEFT-ALIGNED, like the HyperIdle conversation (founder review
//    2026-06-22: "in the chat these messages appear on the left"). Carries the
//    conversation's ROUND, human/agent-TINTED Avatar + name · "You" · time header
//    (annotation 1). The BODY is a calm BACKGROUND BOX (founder review ROUND 5:
//    "the message box of the human is missing the background like it has in the
//    conversation") — a subtle `--surface-container` surface, modest padding,
//    still LEFT-aligned. NOT a heavy colored chat bubble; the asymmetry is
//    intentional: HUMAN = boxed, AGENT = plain full-width (the references). The
//    calm `bg-[var(--surface-container)]` surface mirrors the conversation's own
//    calm token (`Conversations.tsx` review-verdict hint). The AM1 conversation
//    currently renders human messages PLAIN; for true parity it should adopt this
//    same box — flagged as a cross-cutting follow-up in approved.md (AM3 scope
//    only; not changed here). ──
export function HumanRow({
	author,
	createdAt,
	text,
}: {
	author: PartAuthor;
	createdAt: string;
	text: string;
}): JSX.Element {
	// RIGHT-aligned + capped width (round-9) — identical to the conversation's
	// PartList self-message: my own turns are right-bound, capped ≤80%, with the
	// avatar+name header above the box's top-left corner and a calm grey box below.
	return (
		<div data-ds-component="HumanRow" data-ds-sender="human" className="flex flex-col items-end">
			<div className="flex max-w-[80%] flex-col gap-[9px]">
				<div className="flex items-center gap-[9px]">
					<Avatar who={author} size={26} />
					<span className="text-[13px] font-[600] text-[var(--text-primary)]">{author.name}</span>
					{author.isMe ? (
						<span className="text-[11px] font-[500] text-[var(--text-tertiary)]">You</span>
					) : null}
					<span className="text-[11px] tabular-nums text-[var(--text-tertiary)]">
						{clockTime(createdAt)}
					</span>
				</div>
				<div className="rounded-[var(--r-default)] bg-[var(--surface-container)] px-[12px] py-[9px]">
					<p className="m-0 text-[15px] leading-[1.55] text-[var(--text-primary)]">{text}</p>
				</div>
			</div>
		</div>
	);
}

// ── A queued (not-yet-delivered) human message — LEFT-ALIGNED to match the human
//    row, muted + clock + "sends when the agent finishes" + dequeue ✕. ──
export function QueuedBubble({
	author,
	text,
	onCancel,
}: {
	author: PartAuthor;
	text: string;
	onCancel?: () => void;
}): JSX.Element {
	return (
		<div data-ds-component="QueuedRow" data-ds-sender="human" className="flex gap-[9px] opacity-70">
			<Avatar who={author} size={26} />
			<div className="flex min-w-0 flex-1 flex-col gap-[6px] pt-[1px]">
				<div className="flex items-baseline gap-[9px]">
					<span className="text-[13px] font-[600] text-[var(--text-secondary)]">{author.name}</span>
					<span className="inline-flex items-center gap-[4px] text-[11px] text-[var(--text-tertiary)]">
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
					<button
						type="button"
						onClick={onCancel}
						aria-label="Remove queued message"
						className="shrink-0 rounded-[var(--r-subtle)] p-[3px] text-[var(--text-tertiary)] transition-colors duration-[var(--motion-fast)] hover:bg-[var(--surface-container)] hover:text-[var(--text-secondary)]"
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
					</button>
				</div>
				{/* calm background BOX — same human-message box as the delivered row (round-5), muted. */}
				<div className="rounded-[var(--r-default)] bg-[var(--surface-container)] px-[12px] py-[9px]">
					<p className="m-0 text-[15px] leading-[1.55] text-[var(--text-secondary)]">{text}</p>
				</div>
			</div>
		</div>
	);
}

/** A plan/todo the agent follows (aspect k) — compact step list, foldable. */
export function PlanList({ part }: { part: PlanPart }): JSX.Element {
	const [open, setOpen] = useState(true);
	const done = part.steps.filter((s) => s.state === "done").length;
	return (
		<div
			data-ds-component="PlanList"
			className="rounded-[var(--r-subtle)] border border-[var(--border-subtle)] bg-[var(--surface-elevated)]"
		>
			<button
				type="button"
				onClick={() => setOpen((v) => !v)}
				aria-expanded={open}
				className="flex w-full items-center gap-[9px] px-[12px] py-[9px] text-left"
			>
				<Caret open={open} />
				<span className="text-[10px] font-[600] uppercase tracking-[var(--tracking-caps-sm)] text-[var(--text-tertiary)]">
					Plan
				</span>
				<span className="flex-1 truncate text-[13px] text-[var(--text-secondary)]">
					{part.steps.find((s) => s.state === "active")?.label ?? "Complete"}
				</span>
				<span className="font-mono tabular-nums text-[12px] text-[var(--text-tertiary)]">
					{done}/{part.steps.length}
				</span>
			</button>
			{open ? (
				<ul className="m-0 list-none border-t border-[var(--border-subtle)] px-[12px] py-[6px]">
					{part.steps.map((s) => (
						<li key={s.label} className="flex items-center gap-[9px] py-[3px] text-[13px]">
							{s.state === "done" ? (
								<svg
									viewBox="0 0 12 12"
									className="h-[12px] w-[12px] shrink-0 text-[var(--status-success)]"
									aria-hidden="true"
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
							) : s.state === "active" ? (
								<span className="h-[10px] w-[10px] shrink-0 rounded-full border-[1.5px] border-[var(--accent-primary)] bg-[var(--accent-primary-dim)]" />
							) : (
								<span className="h-[10px] w-[10px] shrink-0 rounded-full border-[1.5px] border-[var(--border-default)]" />
							)}
							<span
								className={
									s.state === "done"
										? "text-[var(--text-tertiary)] line-through"
										: s.state === "active"
											? "font-[500] text-[var(--text-primary)]"
											: "text-[var(--text-secondary)]"
								}
							>
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
			<svg
				viewBox="0 0 16 16"
				className="h-[13px] w-[13px] shrink-0 text-[var(--accent-primary)]"
				fill="none"
				stroke="currentColor"
				strokeWidth="1.3"
				aria-hidden="true"
			>
				<path d="M4 1.5h5l3 3v10H4z" strokeLinejoin="round" />
				<path d="M9 1.5V4.5h3" />
			</svg>
			<span className="font-mono text-[12px] text-[var(--text-primary)]">{part.label}</span>
			<span className="text-[11px] text-[var(--text-tertiary)]">{part.meta}</span>
		</button>
	);
}

/**
 * Combined SESSION-TOTAL cost — lives in the HEADER beside the session identity,
 * NOT inline per-turn (founder review 2026-06-22 annotation 4: "this might be cool
 * at the top for the whole session combined, like in the header"). A quiet muted
 * read (cost · tokens) in tabular numerals; reads cost, introduces no budget axis.
 *
 * Round-4 annotation 2: the custom dollar SVG glyph was REMOVED — it read as a
 * "weird" icon. The product's canonical cost renderer (`ArtifactCostChip` +
 * `formatMoney`) carries NO icon and prints a plain Intl "$" prefix; the design
 * system ships no currency icon. So the cost reads as plain text — the "$" is the
 * glyph (`costLabel` = "$0.71") — and a middot separates it from the token count.
 */
export function SessionCostTotal(): JSX.Element {
	return (
		<div
			data-ds-component="SessionCostTotal"
			className="flex shrink-0 items-center gap-[6px] font-mono tabular-nums text-[11px] text-[var(--text-tertiary)]"
		>
			<span className="text-[var(--text-secondary)]">{SESSION_META.costLabel}</span>
			<span className="text-[var(--text-tertiary)]">·</span>
			<span>{SESSION_META.tokensLabel}</span>
		</div>
	);
}

// ── Author turn header — the PartList group-header shape, carrying the
//    conversation's ROUND, agent-TINTED Avatar + the agent glyph + name · time
//    (founder review annotation 1). The agent body that follows is plain
//    (AgentProse / tool rows) — NO background bubble. ──
const AGENT_GLYPH =
	"M8 1.5l1.1 3.4L12.5 6 9.1 7.1 8 10.5 6.9 7.1 3.5 6l3.4-1.1L8 1.5zM12.5 10.5l.5 1.5 1.5.5-1.5.5-.5 1.5-.5-1.5-1.5-.5 1.5-.5.5-1.5z";

export function TurnHeader({
	author,
	createdAt,
}: {
	author: PartAuthor;
	createdAt: string;
}): JSX.Element {
	return (
		<div className="flex items-center gap-[9px] pt-[6px]">
			<Avatar who={author} size={26} />
			<div className="flex items-baseline gap-[9px]">
				<span className="text-[13px] font-[600] text-[var(--text-primary)]">{author.name}</span>
				{author.isAgent ? (
					<span
						aria-label="Agent"
						title="Agent"
						className="flex items-center text-[var(--text-tertiary)]"
					>
						<svg
							viewBox="0 0 16 16"
							fill="currentColor"
							style={{ width: 11, height: 11 }}
							aria-hidden="true"
						>
							<path d={AGENT_GLYPH} />
						</svg>
					</span>
				) : null}
				<span className="text-[11px] tabular-nums text-[var(--text-tertiary)]">
					{clockTime(createdAt)}
				</span>
			</div>
		</div>
	);
}

// ════════════════════════════════════════════════════════════════════
//  Composer + status roll-ups — descriptor-driven, shared across variants.
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
	const idx = choices.findIndex((c) => c.value === value);
	return (
		<button
			type="button"
			onClick={() => onPick(choices[(idx + 1) % choices.length]?.value ?? value)}
			className="inline-flex items-center gap-[6px] rounded-[var(--r-pill)] px-[9px] py-[3px] text-[12px] font-[500] text-[var(--text-secondary)] transition-colors duration-[var(--motion-fast)] hover:bg-[var(--surface-container)] hover:text-[var(--text-primary)]"
			data-ds-control="select"
		>
			{current?.label}
			<svg
				viewBox="0 0 12 12"
				className="h-[9px] w-[9px] text-[var(--text-tertiary)]"
				aria-hidden="true"
			>
				<path
					d="M2.5 4.5 L6 8 L9.5 4.5"
					fill="none"
					stroke="currentColor"
					strokeWidth="1.5"
					strokeLinecap="round"
					strokeLinejoin="round"
				/>
			</svg>
		</button>
	);
}

const ICON_MODEL = "M8 1.5l1.1 3.4L12.5 6 9.1 7.1 8 10.5 6.9 7.1 3.5 6l3.4-1.1L8 1.5z";
// REUSED from the conversation composer (ConversationSurface): the "+" attach
// affordance + the send paper-plane. Founder review 2026-06-22: "the attach button
// could/should use the same look as in the conversation."
const ICON_PLUS = "M7.25 2h1.5v5.25H14v1.5H8.75V14h-1.5V8.75H2v-1.5h5.25V2z";
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

/**
 * The session composer — REUSES the conversation composer chrome (rounded bordered
 * surface · the SAME "+" attach affordance · paper-plane send) and ADDS the
 * session-specific bits: the descriptor-driven model · effort · mode pills and the
 * working/queue/Stop state. NOT a parallel composer (founder review 2026-06-22:
 * "try to reuse components with the chat — this is very similar").
 */
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
		for (const o of selected?.options ?? [])
			if (typeof o.defaultValue === "string") v[o.key] = o.defaultValue;
		return v;
	});
	const [text, setText] = useState("");

	return (
		<div
			data-ds-component="SessionComposer"
			className="rounded-[var(--r-default)] border border-[var(--border-default)] bg-[var(--surface-elevated)] shadow-[var(--shadow-subtle)] transition-shadow duration-[var(--motion-fast)] focus-within:shadow-[var(--shadow-default)]"
		>
			{/* input row — the conversation composer shape: "+" attach · textarea · send */}
			<div className="flex items-end gap-[9px] px-[12px] py-[9px]">
				<button
					type="button"
					aria-label="Insert"
					aria-haspopup="menu"
					title="Insert block, attach, mention, reference, format"
					className="flex h-[28px] w-[28px] shrink-0 items-center justify-center rounded-[var(--r-subtle)] border border-[var(--border-default)] text-[var(--text-secondary)] transition-colors duration-[var(--motion-fast)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-container)] hover:text-[var(--text-primary)]"
				>
					<ComposerGlyph d={ICON_PLUS} size={14} />
				</button>
				<textarea
					value={text}
					onChange={(e) => setText(e.target.value)}
					rows={2}
					placeholder={
						running
							? "Type to queue a message — it sends when the agent finishes"
							: "Message Atlas · drop files/folders · @ to reference"
					}
					className="min-h-[48px] flex-1 resize-none border-none bg-transparent py-[3px] text-[15px] leading-[1.5] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-placeholder)]"
				/>
				{running ? (
					<button
						type="button"
						aria-label="Stop the agent"
						className="flex h-[32px] w-[32px] shrink-0 items-center justify-center rounded-[var(--r-subtle)] bg-[var(--status-error)] text-[var(--text-on-accent)] transition-colors duration-[var(--motion-fast)] hover:bg-[var(--status-error-hover)]"
					>
						<span className="h-[10px] w-[10px] rounded-[2px] bg-current" />
					</button>
				) : (
					<button
						type="button"
						aria-label="Send message"
						className="flex h-[32px] w-[32px] shrink-0 items-center justify-center rounded-[var(--r-subtle)] bg-[var(--accent-primary)] text-[var(--text-on-accent)] transition-colors duration-[var(--motion-fast)] hover:bg-[var(--accent-primary-hover)]"
					>
						<ComposerGlyph d={ICON_SEND} size={15} />
					</button>
				)}
			</div>
			{/* session-specific pill row — descriptor-driven model · effort · mode + working state */}
			<div className="flex items-center gap-[3px] border-t border-[var(--border-subtle)] px-[9px] py-[6px]">
				<button
					type="button"
					onClick={() => {
						const ids = DESCRIPTOR.models.filter((m) => m.selectable).map((m) => m.id);
						setModelId(ids[(ids.indexOf(modelId) + 1) % ids.length] ?? modelId);
					}}
					className="inline-flex items-center gap-[6px] rounded-[var(--r-pill)] px-[9px] py-[3px] text-[12px] font-[500] text-[var(--text-secondary)] transition-colors duration-[var(--motion-fast)] hover:bg-[var(--surface-container)] hover:text-[var(--text-primary)]"
				>
					<svg
						viewBox="0 0 16 16"
						fill="currentColor"
						className="h-[12px] w-[12px] text-[var(--accent-primary)]"
						aria-hidden="true"
					>
						<path d={ICON_MODEL} />
					</svg>
					{selected?.label}
				</button>
				<span className="h-[16px] w-px bg-[var(--border-subtle)]" />
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
				{running ? (
					<>
						{elapsedLabel ? (
							<span className="mr-[3px] inline-flex items-center gap-[6px] text-[12px] text-[var(--text-tertiary)]">
								<span className="inline-block h-[6px] w-[6px] rounded-full bg-[var(--accent-secondary)] motion-safe:animate-[skeleton-pulse_1.4s_ease-in-out_infinite]" />
								{elapsedLabel}
							</span>
						) : null}
						<span className="inline-flex items-center gap-[6px] rounded-[var(--r-pill)] bg-[var(--surface-container)] px-[9px] py-[3px] text-[12px] font-[500] text-[var(--text-secondary)]">
							Queues while working
						</span>
					</>
				) : null}
			</div>
		</div>
	);
}

export function ScrollToBottomPill(): JSX.Element {
	return (
		<button
			type="button"
			className="inline-flex items-center gap-[6px] rounded-[var(--r-pill)] border border-[var(--border-default)] bg-[var(--surface-elevated)] px-[12px] py-[6px] text-[12px] font-[500] text-[var(--text-secondary)] shadow-[var(--shadow-default)] transition-colors duration-[var(--motion-fast)] hover:text-[var(--text-primary)]"
		>
			<svg
				viewBox="0 0 12 12"
				className="h-[11px] w-[11px]"
				fill="none"
				stroke="currentColor"
				strokeWidth="1.5"
				aria-hidden="true"
			>
				<path d="M6 2v8M2.5 6.5L6 10l3.5-3.5" strokeLinecap="round" strokeLinejoin="round" />
			</svg>
			Scroll to bottom
		</button>
	);
}

// NOTE: the t3code-style SessionStatusBar (Changes / PR / Background / Artifacts +
// Ready CTA) was REMOVED (founder review 2026-06-22; concept rejection 10).
// HyperIdle attaches no PRs to sessions and surfaces no change-count metrics bar.
// The header carries only minimal session identity; real changed-files work product
// still surfaces via the per-turn changed-files panel (aspect f).

// ── Shared turn-blocking: group by author, aggregate a CONSECUTIVE tool run ──
//
// THE AGGREGATION RULE (concept Phase 4, founder review 2026-06-22 round 5 — SIMPLIFIED):
//   ALL COMPLETED tool calls fold into the turn's aggregate expander — INCLUDING
//   FAILED ones. The aggregate header SIGNALS failures when present (e.g. "Edited 2
//   files, ran 2 commands · 1 failed" with a small ✗/--status-error marker), so
//   breakage stays glanceable without a standalone row. On expand the failed step
//   shows its ✗ + stderr.
//   The ONLY tool that renders STANDALONE is the currently-RUNNING one (live /
//   streaming — e.g. the running sub-agent), because it is still in progress. Once
//   it completes it folds into the aggregate too.
//   DIFFS ARE NEVER LOST TO FOLDING — a per-turn Changed-files summary (always
//   visible, opens ReviewCodeDiff) surfaces the turn's file changes regardless of
//   whether the edits folded.
//   (Round-5 reversal of the earlier "failures stay standalone" exception — the
//   founder rejected a completed/failed tool sitting standalone next to an aggregate.)
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
		// EVERY completed tool call folds — edits AND failed calls included. The ONLY
		// standalone tool row is a still-RUNNING tool (incl. a running sub-agent).
		const foldable = p.kind === "tool" && p.status !== "running";
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
	const edits = tools.filter((t) => t.toolKind === "edit" || t.toolKind === "create").length;
	const cmds = tools.filter((t) => t.toolKind === "command").length;
	const reads = tools.filter((t) => t.toolKind === "read").length;
	const searches = tools.filter(
		(t) => t.toolKind === "web-search" || t.toolKind === "search",
	).length;
	const mcp = tools.filter((t) => t.toolKind === "mcp").length;
	const out: string[] = [];
	if (edits) out.push(edits === 1 ? "edited a file" : `edited ${edits} files`);
	if (cmds) out.push(cmds === 1 ? "ran a command" : `ran ${cmds} commands`);
	if (reads) out.push(reads === 1 ? "read a file" : `read ${reads} files`);
	if (searches) out.push(searches === 1 ? "searched" : `ran ${searches} searches`);
	if (mcp) out.push(mcp === 1 ? "queried Linear" : `made ${mcp} MCP calls`);
	const joined = out.join(", ");
	return joined.charAt(0).toUpperCase() + joined.slice(1);
}
