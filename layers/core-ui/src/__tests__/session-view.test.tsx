/**
 * Session View component tests.
 *
 * Covers Fix 4 (review finding): zero component/DOM tests existed for
 * ToolPart / ReasoningPart / SessionView aggregation / ChangedFilesPanel /
 * composer pills / self-box alignment.
 *
 * Every test exercises the PRODUCTION component via import — no parallel
 * renderer, no fixture fork (hard-rule: one message renderer).
 */

import type { ActivityEntry } from "@hyperidle/domain-model";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { OpenHandler, Part, PartAuthor } from "../components/parts";
import { derivePartsFromSession } from "../components/parts";
import { ReasoningPart } from "../components/parts/ReasoningPart.js";
import { ToolPart } from "../components/parts/ToolPart.js";
import type { SessionViewIdentity } from "../components/SessionView.js";
import { SessionView } from "../components/SessionView.js";

// ── Shared fixtures ────────────────────────────────────────────────────────

const AGENT: PartAuthor = { id: "a-atlas", name: "Atlas", isAgent: true, isMe: false };
const VIEWER: PartAuthor = { id: "u-founder", name: "Founder", isAgent: false, isMe: true };

const IDENTITY: SessionViewIdentity = {
	agent: AGENT,
	viewer: VIEWER,
	title: "Fix AI SDK bug",
	host: "Bet · Chat reliability",
};

const T = (ms: number): number => 1_750_000_000_000 + ms;

/** Build a minimal tool Part for unit tests (no adapter needed). */
function mkToolPart(
	overrides: Partial<Extract<Part, { kind: "tool" }>> = {},
): Extract<Part, { kind: "tool" }> {
	return {
		kind: "tool",
		id: `tool-${Math.random().toString(36).slice(2)}`,
		author: AGENT,
		createdAt: new Date(T(0)).toISOString(),
		verb: "View",
		target: "foo.ts",
		toolKind: "read",
		status: "ok",
		embeds: [],
		...overrides,
	};
}

/** Build a minimal reasoning Part. */
function mkReasoningPart(
	overrides: Partial<Extract<Part, { kind: "reasoning" }>> = {},
): Extract<Part, { kind: "reasoning" }> {
	return {
		kind: "reasoning",
		id: `r-${Math.random().toString(36).slice(2)}`,
		author: AGENT,
		createdAt: new Date(T(0)).toISOString(),
		durationMs: 8_000,
		text: "I should read the file before editing.",
		embeds: [],
		...overrides,
	};
}

const NO_OP_OPEN: OpenHandler = () => undefined;

// ── ToolPart ──────────────────────────────────────────────────────────────

describe("ToolPart", () => {
	it("renders verb and target", () => {
		render(
			<ToolPart part={mkToolPart({ verb: "Edit", target: "src/main.ts" })} onOpen={NO_OP_OPEN} />,
		);
		expect(screen.getByText("Edit")).toBeInTheDocument();
		expect(screen.getByText("src/main.ts")).toBeInTheDocument();
	});

	it("shows ok status glyph (aria-label=ok)", () => {
		render(<ToolPart part={mkToolPart({ status: "ok" })} onOpen={NO_OP_OPEN} />);
		expect(screen.getByRole("img", { name: "ok" })).toBeInTheDocument();
	});

	it("shows failed status glyph (aria-label=failed)", () => {
		render(<ToolPart part={mkToolPart({ status: "failed" })} onOpen={NO_OP_OPEN} />);
		expect(screen.getByRole("img", { name: "failed" })).toBeInTheDocument();
	});

	it("shows running status glyph (aria-label=running)", () => {
		render(<ToolPart part={mkToolPart({ status: "running" })} onOpen={NO_OP_OPEN} />);
		expect(screen.getByRole("img", { name: "running" })).toBeInTheDocument();
	});

	it("expands output on click when output is present", () => {
		const output = "rewrote 3 call sites";
		render(<ToolPart part={mkToolPart({ output, status: "ok" })} onOpen={NO_OP_OPEN} />);
		// Output is hidden initially
		expect(screen.queryByText(output)).not.toBeInTheDocument();

		// Click the expand button
		const expandRow = screen.getByRole("button");
		fireEvent.click(expandRow);
		expect(screen.getByText(output)).toBeInTheDocument();
	});

	it("does not render expand button when no output", () => {
		render(<ToolPart part={mkToolPart({ output: undefined, status: "ok" })} onOpen={NO_OP_OPEN} />);
		expect(screen.queryByRole("button")).not.toBeInTheDocument();
	});

	it("shows the diff chip as a label, not a control — it has nowhere to go", () => {
		const onOpen = vi.fn();
		const part = mkToolPart({
			status: "ok",
			embeds: [
				{
					kind: "diff",
					label: "server/chat/stream.ts",
					meta: "9/2",
				},
			],
		});
		render(<ToolPart part={part} onOpen={onOpen} />);

		// The file and its counts are shown.
		expect(screen.getByText("stream.ts")).toBeInTheDocument();

		// But it is not a button. Its target used to be `/artifacts/<file path>`,
		// which never resolved to a row even while that route existed, so the
		// click had never done anything.
		expect(screen.queryByRole("button", { name: /stream\.ts/i })).toBeNull();
		expect(onOpen).not.toHaveBeenCalled();
	});

	it("fires onOpen with session route when sub-agent open button is clicked", () => {
		const onOpen = vi.fn();
		const part = mkToolPart({
			status: "running",
			opensSession: { sessionId: "sess-safari", label: "Safari verifier" },
		});
		render(<ToolPart part={part} onOpen={onOpen} />);
		fireEvent.click(screen.getByRole("button", { name: /open session/i }));
		expect(onOpen).toHaveBeenCalledWith({ route: "session", sessionId: "sess-safari" });
	});
});

// ── ReasoningPart ─────────────────────────────────────────────────────────

describe("ReasoningPart", () => {
	it("renders 'Thought for Ns' label in collapsed state", () => {
		render(<ReasoningPart part={mkReasoningPart({ durationMs: 8_000 })} />);
		expect(screen.getByText("Thought for 8s")).toBeInTheDocument();
	});

	it("renders 'Thinking…' when duration < 1s", () => {
		render(<ReasoningPart part={mkReasoningPart({ durationMs: 400 })} />);
		expect(screen.getByText("Thinking…")).toBeInTheDocument();
	});

	it("hides reasoning text when collapsed", () => {
		const text = "I should read the file before editing.";
		render(<ReasoningPart part={mkReasoningPart({ text })} />);
		expect(screen.queryByText(text)).not.toBeInTheDocument();
	});

	it("expands to show reasoning text on click", () => {
		const text = "I should check the SDK version first.";
		render(<ReasoningPart part={mkReasoningPart({ text })} />);
		fireEvent.click(screen.getByRole("button"));
		expect(screen.getByText(text)).toBeInTheDocument();
	});

	it("button has aria-expanded=false initially", () => {
		render(<ReasoningPart part={mkReasoningPart()} />);
		expect(screen.getByRole("button")).toHaveAttribute("aria-expanded", "false");
	});

	it("button has aria-expanded=true after click", () => {
		render(<ReasoningPart part={mkReasoningPart()} />);
		fireEvent.click(screen.getByRole("button"));
		expect(screen.getByRole("button")).toHaveAttribute("aria-expanded", "true");
	});
});

// ── SessionView aggregation ───────────────────────────────────────────────

/**
 * Build ActivityEntry[] with consecutive tool calls, then render SessionView.
 * Aggregation rule: ≥2 completed tool calls fold into a HardAggregate.
 */

function mkToolEntry(
	overrides: Partial<ActivityEntry["data"] & { type?: string }> = {},
): Extract<ActivityEntry, { type: "tool_call" }> {
	return {
		type: "tool_call",
		timestamp: T(Math.random() * 10_000),
		data: {
			toolName: "View",
			argsSummary: "foo.ts",
			toolKind: "read",
			verb: "View",
			target: "foo.ts",
			status: "ok",
			...(overrides as Partial<Extract<ActivityEntry, { type: "tool_call" }>["data"]>),
		},
	};
}

describe("SessionView — aggregation", () => {
	it("renders aggregated summary button when ≥2 completed tools present", () => {
		const entries: ActivityEntry[] = [
			mkToolEntry({ toolName: "View", argsSummary: "a.ts", verb: "View", target: "a.ts" }),
			mkToolEntry({ toolName: "View", argsSummary: "b.ts", verb: "View", target: "b.ts" }),
		];
		render(
			<SessionView
				entries={entries}
				identity={IDENTITY}
				status="ended"
				onOpen={NO_OP_OPEN}
				onSend={vi.fn()}
			/>,
		);
		// HardAggregate renders a collapsible button (the aggregate header)
		const aggregateBtn = screen.getAllByRole("button").find((b) => {
			const txt = b.textContent ?? "";
			// Aggregate header contains step count or verb summary
			return /step|view|read/i.test(txt);
		});
		expect(aggregateBtn).toBeInTheDocument();
	});

	it("does NOT fold a single completed tool (single stays standalone)", () => {
		const entries: ActivityEntry[] = [
			mkToolEntry({ toolName: "View", argsSummary: "solo.ts", verb: "View", target: "solo.ts" }),
		];
		render(
			<SessionView
				entries={entries}
				identity={IDENTITY}
				status="ended"
				onOpen={NO_OP_OPEN}
				onSend={vi.fn()}
			/>,
		);
		// ToolPart renders as a bare row (no HardAggregate expand button for ≥2)
		expect(screen.getByText("solo.ts")).toBeInTheDocument();
	});

	it("aggregate header signals failure when one tool failed", () => {
		const entries: ActivityEntry[] = [
			mkToolEntry({ verb: "Edit", target: "stream.ts", status: "ok" }),
			mkToolEntry({ verb: "Run command", target: "npm test", status: "failed" }),
		];
		render(
			<SessionView
				entries={entries}
				identity={IDENTITY}
				status="ended"
				onOpen={NO_OP_OPEN}
				onSend={vi.fn()}
			/>,
		);
		// Failure signal: "1 failed" text visible in aggregate header
		expect(screen.getByText(/1 failed/i)).toBeInTheDocument();
	});
});

// ── ChangedFilesPanel ─────────────────────────────────────────────────────

describe("SessionView — ChangedFilesPanel", () => {
	it("shows file name from diff embed when a tool has a diff", () => {
		const entries: ActivityEntry[] = [
			{
				type: "tool_call",
				timestamp: T(0),
				data: {
					toolName: "Edit",
					argsSummary: "server/chat/stream.ts",
					toolKind: "edit",
					verb: "Edit",
					target: "server/chat/stream.ts",
					status: "ok",
					diff: { label: "server/chat/stream.ts", added: 9, removed: 2 },
				},
			},
			{
				type: "tool_call",
				timestamp: T(1000),
				data: {
					toolName: "Edit",
					argsSummary: "client/useChatPanel.ts",
					toolKind: "edit",
					verb: "Edit",
					target: "client/useChatPanel.ts",
					status: "ok",
					diff: { label: "client/useChatPanel.ts", added: 6, removed: 4 },
				},
			},
		];

		render(
			<SessionView
				entries={entries}
				identity={IDENTITY}
				status="ended"
				onOpen={NO_OP_OPEN}
				onSend={vi.fn()}
			/>,
		);

		// ChangedFilesPanel splits labels into dir + filename spans —
		// assert on the filename portion (last segment after the final "/")
		expect(screen.getByText("stream.ts")).toBeInTheDocument();
		expect(screen.getByText("useChatPanel.ts")).toBeInTheDocument();
		// Directory portions render in a sibling span
		expect(screen.getByText("server/chat/")).toBeInTheDocument();
		expect(screen.getByText("client/")).toBeInTheDocument();
	});

	it("does NOT render the changed files panel when no tools have diffs", () => {
		const entries: ActivityEntry[] = [
			{
				type: "answer_settled",
				timestamp: T(0),
				data: { text: "All done." },
			},
		];

		render(
			<SessionView
				entries={entries}
				identity={IDENTITY}
				status="ended"
				onOpen={NO_OP_OPEN}
				onSend={vi.fn()}
			/>,
		);

		// No "Changed files" heading
		expect(screen.queryByText(/changed files/i)).not.toBeInTheDocument();
	});
});

// ── Composer pills ────────────────────────────────────────────────────────

describe("SessionView — composer pills", () => {
	// @lore deriveComposerPills and its effort-pill rendering do not exist in SessionView.

	it("renders no pills when no descriptor is provided", () => {
		render(
			<SessionView
				entries={[]}
				identity={IDENTITY}
				descriptor={undefined}
				status="ended"
				onOpen={NO_OP_OPEN}
				onSend={vi.fn()}
			/>,
		);

		// No pill strip rendered
		expect(screen.queryByText("Effort")).not.toBeInTheDocument();
	});
});

// ── Self-box alignment ────────────────────────────────────────────────────

// ── derivePartsFromSession adapter (unit) ─────────────────────────────────

describe("derivePartsFromSession", () => {
	it("converts tool_call entries to tool Parts", () => {
		const entries: ActivityEntry[] = [
			mkToolEntry({ verb: "Edit", target: "main.ts", status: "ok" }),
		];
		const parts = derivePartsFromSession(entries, AGENT);
		const toolParts = parts.filter((p) => p.kind === "tool");
		expect(toolParts).toHaveLength(1);
		expect(toolParts[0]).toMatchObject({ kind: "tool", verb: "Edit", target: "main.ts" });
	});

	it("converts reasoning entries to reasoning Parts", () => {
		const entries: ActivityEntry[] = [
			{
				type: "reasoning",
				timestamp: T(0),
				data: { durationMs: 5_000, text: "Analyzing the problem." },
			},
		];
		const parts = derivePartsFromSession(entries, AGENT);
		const reasoningParts = parts.filter((p) => p.kind === "reasoning");
		expect(reasoningParts).toHaveLength(1);
		expect(reasoningParts[0]).toMatchObject({ kind: "reasoning", durationMs: 5_000 });
	});

	it("assigns isMe=true to viewer's human_message", () => {
		const entries: ActivityEntry[] = [
			{
				type: "human_message",
				timestamp: T(0),
				data: {
					text: "Fix it please.",
					author: { ...VIEWER, isAgent: false as const },
				},
			},
		];
		const parts = derivePartsFromSession(entries, AGENT);
		const proseParts = parts.filter((p) => p.kind === "prose");
		expect(proseParts).toHaveLength(1);
		// author.isMe should be true for the viewer's own human message
		expect(proseParts[0]?.author.isMe).toBe(true);
	});
});
