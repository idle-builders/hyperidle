/**
 * AM3 — APPROVED "Session View" (founder review, 2026-06-22, 12 review rounds).
 *
 * Rendering axis: DISCLOSURE-MINIMAL + AGGREGATION-FORWARD. The calmest possible
 * reading of a session. At rest every tool call is a single bare line (icon · verb
 * · muted target · status) with NO inline I/O; a consecutive run folds hard into
 * ONE summary verb ("Read 2 files, ran a command, searched, queried Linear"). The
 * agent's prose owns the column; tool activity recedes to a quiet ledger you open
 * only when you want it.
 *
 * This story renders the PRODUCTION `SessionView` component (NOT a parallel
 * renderer). `SessionView` feeds `ActivityEntry[]` through the real
 * `derivePartsFromSession` adapter → `PartList` dispatch. The DOM-snapshot net
 * exercises the real production components.
 *
 * @lore AM3: hard-rule — one message renderer (`PartList` over
 * `derivePartsFromSession`). The fixture fork (the old parallel AgentProse /
 * HumanRow / QueuedBubble / SessionComposer / blockStream / ToolGlyph atoms) has
 * been deleted; the story now exercises the production path.
 *
 * @lore AM3: fixture data was previously in sessionContentFixtures.tsx; inlined
 * here after the design-system viewer was removed (the file was story-data-only,
 * no other consumers).
 */

import type { PartAuthor } from "@hyperidle/conversation-parts";
import type { ActivityEntry } from "@hyperidle/domain-model";
import type { HarnessCapabilityDescriptor } from "@hyperidle/harness-capability";
import { type JSX, useState } from "react";
import type { SessionViewIdentity } from "./SessionView.js";
import { SessionView } from "./SessionView.js";

// ── Identities ──────────────────────────────────────────────────────
const FOUNDER: PartAuthor = {
	id: "u-founder",
	name: "A. Founder",
	isAgent: false,
	isMe: true,
};
const ATLAS: PartAuthor = { id: "a-atlas", name: "Atlas", isAgent: true, isMe: false };

// ── Session identity ─────────────────────────────────────────────────
const SESSION_IDENTITY: SessionViewIdentity = {
	agent: ATLAS,
	viewer: FOUNDER,
	title: "Fix agent chat broken by AI SDK 5→6",
	host: "Bet · Agent chat reliability",
};

// ── The realistic session fixture — the AI-SDK 5→6 chat-bug fix session ──
// Converted from SessionPart[] to ActivityEntry[] (the normalized shape the
// production `derivePartsFromSession` adapter consumes).
const T = (offsetMs: number): number => new Date("2026-06-22T14:00:00.000Z").getTime() + offsetMs;

const SESSION_ENTRIES: ReadonlyArray<ActivityEntry> = [
	// (l) human message — the task
	{
		type: "human_message",
		timestamp: T(2_000),
		data: {
			text: "The agent chat broke after the AI SDK 5→6 bump — messages just disappear after I hit enter. Find the root cause and fix it.",
			// HumanMessageData.author requires `isAgent: false` literal — spread to narrow.
			author: { ...FOUNDER, isAgent: false as const },
		},
	},
	// (b) reasoning
	{
		type: "reasoning",
		timestamp: T(11_000),
		data: {
			durationMs: 14_000,
			text: "The symptom — messages vanish on submit — points at the streaming response shape, not the composer. AI SDK 6 renamed parameters → input in tool() and replaced pipeDataStreamToResponse. Likely the backend still sends content: string where the v6 client now expects a parts array. I'll confirm by reading the chat panel + the prototype chat hook before changing anything.",
		},
	},
	// (a) settled answer prose — the plan
	{
		type: "answer_settled",
		timestamp: T(13_000),
		data: {
			text: "Three breaking changes landed in the SDK bump. Let me trace where the message stream is assembled before I touch anything.",
		},
	},
	// (c,e) a run of tool calls — these AGGREGATE
	{
		type: "tool_call",
		timestamp: T(18_000),
		data: {
			toolName: "View",
			argsSummary: "useChatPanel.ts · 41 lines",
			toolKind: "read",
			verb: "View",
			target: "useChatPanel.ts · 41 lines",
			status: "ok",
			output: "useChat({ api, ... }) → renders message.parts",
		},
	},
	{
		type: "tool_call",
		timestamp: T(19_000),
		data: {
			toolName: "View",
			argsSummary: "chatPanel.tsx · 202 lines",
			toolKind: "read",
			verb: "View",
			target: "chatPanel.tsx · 202 lines",
			status: "ok",
			output: "maps msg.content (string) — stale shape",
		},
	},
	{
		type: "tool_call",
		timestamp: T(21_000),
		data: {
			toolName: "Run command",
			argsSummary: "grep -rn '@ai-sdk/react' # check the installed major",
			toolKind: "command",
			verb: "Run command",
			target: "grep -rn '@ai-sdk/react' # check the installed major",
			status: "ok",
			output:
				'node_modules/@ai-sdk/react/package.json\n  "version": "6.0.3"\nsrc/chat/useChatPanel.ts\n  import { useChat } from \'@ai-sdk/react\'  // v6 — expects parts[]\nsrc/chat/chatPanel.tsx\n  msg.content  // ← v5 shape, no longer rendered',
		},
	},
	{
		type: "tool_call",
		timestamp: T(23_000),
		data: {
			toolName: "Web search",
			argsSummary: "ai-sdk v6 useChat parts vs content breaking change",
			toolKind: "web-search",
			verb: "Web search",
			target: "ai-sdk v6 useChat parts vs content breaking change",
			status: "ok",
			output: "5 results · vercel.com/changelog, gh#4821",
		},
	},
	{
		type: "tool_call",
		timestamp: T(24_000),
		data: {
			toolName: "Search",
			argsSummary: "msg.content",
			toolKind: "search",
			verb: "Search",
			target: "msg.content",
			status: "ok",
			output: "3 matches in 2 files",
		},
	},
	// (c) an MCP tool call
	{
		type: "tool_call",
		timestamp: T(26_000),
		data: {
			toolName: "linear · search_issues",
			argsSummary: 'query: "AI SDK chat regression"',
			toolKind: "mcp",
			verb: "linear · search_issues",
			target: 'query: "AI SDK chat regression"',
			status: "ok",
			output:
				'linear.search_issues({ query: "AI SDK chat regression" })\n→ ENG-411  chat blank after send  (in progress, assigned: atlas)',
		},
	},
	// (a) answer prose — the diagnosis
	{
		type: "answer_settled",
		timestamp: T(31_000),
		data: {
			text: "Found it. AI SDK 6 sends messages with a `parts` array instead of a `content` string. Our backend still writes `content`, so the v6 client renders nothing — the message is dropped silently. Switching the server to emit `parts` and updating the append helper to match.",
		},
	},
	// (c,e,f) THE FIX — a CONSECUTIVE run of tool calls: edit · run-command · edit ·
	// failed-test. Under the round-5 aggregation rule ALL completed tool calls fold
	// into ONE aggregate — edits AND the failed `npm test` (t10) included; the
	// aggregate header signals "· 1 failed". The edits' DIFFS surface in the Changed
	// files panel regardless of the fold.
	{
		type: "tool_call",
		timestamp: T(38_000),
		data: {
			toolName: "Edit",
			argsSummary: "server/chat/stream.ts",
			toolKind: "edit",
			verb: "Edit",
			target: "server/chat/stream.ts",
			status: "ok",
			output: "emit parts[] instead of content",
			diff: { label: "server/chat/stream.ts", added: 9, removed: 2 },
		},
	},
	{
		type: "tool_call",
		timestamp: T(40_000),
		data: {
			toolName: "Run command",
			argsSummary: "npx codemod content-to-parts ./client",
			toolKind: "command",
			verb: "Run command",
			target: "npx codemod content-to-parts ./client",
			status: "ok",
			output: "rewrote 3 call sites",
		},
	},
	{
		type: "tool_call",
		timestamp: T(44_000),
		data: {
			toolName: "Edit",
			argsSummary: "client/useChatPanel.ts",
			toolKind: "edit",
			verb: "Edit",
			target: "client/useChatPanel.ts",
			status: "ok",
			output: "spread parts[], drop content",
			diff: { label: "client/useChatPanel.ts", added: 6, removed: 4 },
		},
	},
	// (d) a FAILED tool — folds into the adjacent aggregate; aggregate header signals failure
	{
		type: "tool_call",
		timestamp: T(46_000),
		data: {
			toolName: "Run command",
			argsSummary: "npm test -- chat/stream",
			toolKind: "command",
			verb: "Run command",
			target: "npm test -- chat/stream",
			status: "failed",
			output:
				"FAIL  src/chat/__tests__/stream.test.ts\n  ● assembles a parts[] payload\n    Expected: [{ type: 'text', text: 'hi' }]\n    Received: undefined\n  appendMessage() still spreads the old { content } shape (line 88).\n\n  exit code 1",
		},
	},
	// (c,j) a sub-agent spawn — STAYS STANDALONE (it is RUNNING — the only standalone tool)
	{
		type: "tool_call",
		timestamp: T(47_000),
		data: {
			toolName: "Spawn sub-agent",
			argsSummary: "verify the streaming response on Safari",
			toolKind: "sub-agent",
			verb: "Spawn sub-agent",
			target: "verify the streaming response on Safari",
			status: "running",
			opensSession: { sessionId: "sess-safari-verify", label: "Safari verifier" },
		},
	},
	// (a) the latest agent turn is STILL STREAMING (delta → not yet settled)
	{
		type: "answer_delta",
		timestamp: T(51_000),
		data: {
			text: "Both files now agree on the `parts[]` shape and the stream test passes. Re-running the full chat suite to confirm multi-turn append still works before I",
		},
	},
];

// ── Capability descriptor (AM2 shape) — drives the composer pills declaratively ──
const DESCRIPTOR: HarnessCapabilityDescriptor = {
	type: "claude-code",
	name: "Claude Code",
	kind: "local",
	authAction: { kind: "native_cli_login", label: "Logged in" },
	discovery: { state: "ready", version: "1.4.2" },
	modelProviders: ["anthropic"],
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

export default { title: "Session View", group: "Conversations" as const };

/**
 * The full approved Session View — streaming state (agent is working).
 * Exercises all aspect-taxonomy items: streaming text · reasoning fold ·
 * tool families incl. mcp + sub-agent · FAILED tool (aggregate header signals
 * failure) · hard aggregation · diff chip + changed-files panel ·
 * queued message · descriptor pills · working/Stop state.
 */
// biome-ignore lint/style/useNamingConvention: story exports use Snake_Case to show variant hierarchy in the viewer (established pattern across all stories)
export function SessionView_Streaming(): JSX.Element {
	const [entries, setEntries] = useState<import("@hyperidle/domain-model").ActivityEntry[]>([
		...SESSION_ENTRIES,
	]);

	return (
		<div className="h-[900px] w-full">
			<SessionView
				entries={entries}
				identity={SESSION_IDENTITY}
				descriptor={DESCRIPTOR}
				status="streaming"
				onOpen={(_target) => {
					// Story: open targets are no-ops (no router context)
				}}
				onSend={(text) => {
					// Story: echo the send as a human_message entry
					setEntries((prev) => [
						...prev,
						{
							type: "human_message",
							timestamp: Date.now(),
							data: {
								text,
								// Narrow isAgent to the literal false required by HumanMessageData.
								author: { ...FOUNDER, isAgent: false as const, isMe: true },
							},
						},
					]);
				}}
				onStop={() => {
					// Story: no-op
				}}
			/>
		</div>
	);
}

/**
 * Idle state — no active stream; the composer shows Send (not Stop).
 */
// biome-ignore lint/style/useNamingConvention: story exports use Snake_Case to show variant hierarchy in the viewer (established pattern across all stories)
export function SessionView_Idle(): JSX.Element {
	return (
		<div className="h-[900px] w-full">
			<SessionView
				entries={SESSION_ENTRIES}
				identity={SESSION_IDENTITY}
				descriptor={DESCRIPTOR}
				status="ended"
				onOpen={(_target) => {
					// Story: no-op
				}}
				onSend={(_text) => {
					// Story: no-op
				}}
			/>
		</div>
	);
}

/**
 * No descriptor — composer shows no pills.
 */
// biome-ignore lint/style/useNamingConvention: story exports use Snake_Case to show variant hierarchy in the viewer (established pattern across all stories)
export function SessionView_NoPills(): JSX.Element {
	return (
		<div className="h-[900px] w-full">
			<SessionView
				entries={SESSION_ENTRIES}
				identity={SESSION_IDENTITY}
				descriptor={undefined}
				status="ended"
				onOpen={(_target) => {
					// Story: no-op
				}}
				onSend={(_text) => {
					// Story: no-op
				}}
			/>
		</div>
	);
}
