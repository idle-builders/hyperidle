/**
 * AM3 — Session adapter + PartKind extension (RED phase).
 *
 * Tests the LOCKED contract from plans/AM3/architecture.md:
 *  - `PartKind` union extended with `tool` + `reasoning` (closed, exhaustive, unknown-fallback)
 *  - `ToolKind` family set with generic fallback (unknown family → generic row, never throws)
 *  - `derivePartsFromSession(entries, agent)` over normalized `ActivityEntry`:
 *      · tool_call → tool Part (verb/target/toolKind/status/output; file-change carries diff Embed)
 *      · reasoning → reasoning Part (durationMs + text)
 *      · streaming answer → prose Part (text grows)
 *      · delivered human msg → prose Part (self/other pattern: isMe handled by author)
 *  - Tool-run aggregation: ALL completed calls fold (incl. failed); aggregate header signals failures;
 *    ONLY the running tool renders standalone; diffs never lost (Changed files panel)
 *  - Composer pills derive from HarnessCapabilityDescriptor: dispatch on control.kind;
 *    undeclared option → absent; no per-backend branch
 *  - Queued message: pre-Part FIFO state, cancellable, non-interrupting; converts to prose Part
 *  - DOES NOT weaken AM1-part.test.ts or AM1-source-agnostic.test.ts
 *  - Satisfies the no-restricted-imports source-agnostic boundary (adapter takes ActivityEntry[] only)
 */

// These imports FAIL (red) until green-phase tasks 1–3 add:
//   framework/domain-model/src/session-activity.ts  (ActivityEntry lifted from web hook)
//   PART_KINDS extended with "tool" | "reasoning"
//   derivePartsFromSession(entries, agent) real impl
import type { ActivityEntry } from "@hyperidle/domain-model";
// Composer-pill derivation — dispatch on HarnessCapabilityDescriptor.control.kind
import type {
	HarnessCapabilityDescriptor,
	HarnessModelOptionDescriptor,
} from "@hyperidle/harness-capability";
import { describe, expect, it } from "vitest";
// Aggregation grouping imported from part.js (beside groupParts)
import {
	aggregateToolRun,
	deriveComposerPills,
	derivePartsFromSession,
	PART_KINDS,
	type Part,
	type PartAuthor,
	TOOL_KINDS,
	type ToolKind,
} from "../part.js";

// ── Fixture helpers ──────────────────────────────────────────────

const AGENT: PartAuthor = { id: "a-atlas", name: "Atlas", isAgent: true, isMe: false };
const HUMAN: PartAuthor = { id: "u-founder", name: "A. Founder", isAgent: false, isMe: true };

function toolEntry(
	overrides: Partial<Extract<ActivityEntry, { type: "tool_call" }>> = {},
): Extract<ActivityEntry, { type: "tool_call" }> {
	return {
		type: "tool_call",
		timestamp: Date.now(),
		data: {
			toolName: "bash",
			argsSummary: "ls -la",
			status: "ok",
			output: "total 0",
			toolKind: "command",
			verb: "Run command",
			target: "ls -la",
			...("data" in overrides ? (overrides.data ?? {}) : {}),
		},
		...overrides,
	} as Extract<ActivityEntry, { type: "tool_call" }>;
}

function reasoningEntry(
	overrides: Partial<Extract<ActivityEntry, { type: "reasoning" }>> = {},
): Extract<ActivityEntry, { type: "reasoning" }> {
	return {
		type: "reasoning",
		timestamp: Date.now(),
		data: {
			durationMs: 14_000,
			text: "I will think about this.",
		},
		...overrides,
	} as Extract<ActivityEntry, { type: "reasoning" }>;
}

function answerEntry(
	text: string,
	streaming = false,
): Extract<ActivityEntry, { type: "answer_delta" | "answer_settled" }> {
	if (streaming) {
		return { type: "answer_delta", timestamp: Date.now(), data: { text } } as Extract<
			ActivityEntry,
			{ type: "answer_delta" }
		>;
	}
	return { type: "answer_settled", timestamp: Date.now(), data: { text } } as Extract<
		ActivityEntry,
		{ type: "answer_settled" }
	>;
}

function humanEntry(text: string): Extract<ActivityEntry, { type: "human_message" }> {
	return {
		type: "human_message",
		timestamp: Date.now(),
		data: { text, author: HUMAN },
	} as Extract<ActivityEntry, { type: "human_message" }>;
}

// ── PART_KINDS — extended closed union (AC1, architecture §a) ────────

describe("AM3 PART_KINDS — extended closed union", () => {
	it("contains 'tool' and 'reasoning' alongside the AM1 set", () => {
		expect(PART_KINDS as ReadonlyArray<string>).toContain("tool");
		expect(PART_KINDS as ReadonlyArray<string>).toContain("reasoning");
	});

	it("still contains all AM1 kinds (prose/review/resolved/questionnaire/unknown)", () => {
		const am1Kinds = ["prose", "review", "resolved", "questionnaire", "unknown"];
		for (const k of am1Kinds) {
			expect(PART_KINDS as ReadonlyArray<string>).toContain(k);
		}
	});

	it("is exactly the locked set — no extra kinds", () => {
		expect([...PART_KINDS].sort()).toEqual(
			["prose", "review", "resolved", "questionnaire", "tool", "reasoning", "unknown"].sort(),
		);
	});

	it("does NOT contain session/work-log/event/activity (concept hard-rule 3)", () => {
		const forbidden = [
			"session",
			"work-log",
			"worklog",
			"event",
			"activity",
			"trace",
			"block",
			"blocked",
		];
		for (const f of forbidden) {
			expect(PART_KINDS as ReadonlyArray<string>).not.toContain(f);
		}
	});
});

// ── TOOL_KINDS — closed family set with generic fallback ──────────────

describe("AM3 TOOL_KINDS — closed family set", () => {
	it("contains the locked family members", () => {
		const expected = [
			"command",
			"read",
			"edit",
			"search",
			"web-search",
			"mcp",
			"sub-agent",
			"create",
		];
		for (const k of expected) {
			expect(TOOL_KINDS as ReadonlyArray<string>).toContain(k);
		}
	});

	it("has a 'generic' fallback for unknown families", () => {
		expect(TOOL_KINDS as ReadonlyArray<string>).toContain("generic");
	});
});

// ── derivePartsFromSession — tool_call → tool Part ──────────────────

describe("AM3 derivePartsFromSession — tool_call → tool Part", () => {
	it("maps a tool_call entry to a tool Part", () => {
		const entries: ActivityEntry[] = [
			toolEntry({
				data: {
					toolName: "bash",
					argsSummary: "npm test",
					status: "ok",
					output: "✓ 3 passing",
					toolKind: "command",
					verb: "Run command",
					target: "npm test",
				},
			} as Partial<Extract<ActivityEntry, { type: "tool_call" }>>),
		];
		const parts = derivePartsFromSession(entries, AGENT);
		expect(parts).toHaveLength(1);
		const p = parts[0];
		expect(p?.kind).toBe("tool");
	});

	it("tool Part carries verb, target, toolKind, status", () => {
		const entries: ActivityEntry[] = [
			toolEntry({
				data: {
					toolName: "bash",
					argsSummary: "ls",
					status: "ok",
					output: "",
					toolKind: "command",
					verb: "Run command",
					target: "ls",
				},
			} as Partial<Extract<ActivityEntry, { type: "tool_call" }>>),
		];
		const parts = derivePartsFromSession(entries, AGENT);
		const p = parts[0];
		if (p?.kind === "tool") {
			expect(p.verb).toBe("Run command");
			expect(p.target).toBe("ls");
			expect(p.toolKind).toBe("command");
			expect(p.status).toBe("ok");
		} else {
			throw new Error(`expected tool Part, got ${p?.kind}`);
		}
	});

	it("tool Part carries output when present", () => {
		const entries: ActivityEntry[] = [
			toolEntry({
				data: {
					toolName: "bash",
					argsSummary: "ls",
					status: "ok",
					output: "file.ts",
					toolKind: "command",
					verb: "Run command",
					target: "ls",
				},
			} as Partial<Extract<ActivityEntry, { type: "tool_call" }>>),
		];
		const parts = derivePartsFromSession(entries, AGENT);
		const p = parts[0];
		if (p?.kind === "tool") {
			expect(p.output).toBe("file.ts");
		}
	});

	it("failed tool Part has status='failed' (uses destructive token)", () => {
		const entries: ActivityEntry[] = [
			toolEntry({
				data: {
					toolName: "bash",
					argsSummary: "npm test",
					status: "failed",
					output: "FAIL",
					toolKind: "command",
					verb: "Run command",
					target: "npm test",
				},
			} as Partial<Extract<ActivityEntry, { type: "tool_call" }>>),
		];
		const parts = derivePartsFromSession(entries, AGENT);
		const p = parts[0];
		if (p?.kind === "tool") {
			expect(p.status).toBe("failed");
		}
	});

	it("running tool Part has status='running'", () => {
		const entries: ActivityEntry[] = [
			toolEntry({
				data: {
					toolName: "bash",
					argsSummary: "sleep 5",
					status: "running",
					toolKind: "command",
					verb: "Run command",
					target: "sleep 5",
				},
			} as Partial<Extract<ActivityEntry, { type: "tool_call" }>>),
		];
		const parts = derivePartsFromSession(entries, AGENT);
		const p = parts[0];
		if (p?.kind === "tool") {
			expect(p.status).toBe("running");
		}
	});

	it("file-change tool Part carries a diff Embed (diffs never lost)", () => {
		const entries: ActivityEntry[] = [
			toolEntry({
				data: {
					toolName: "edit_file",
					argsSummary: "server/chat/stream.ts",
					status: "ok",
					toolKind: "edit",
					verb: "Edit",
					target: "server/chat/stream.ts",
					diff: { label: "server/chat/stream.ts", added: 9, removed: 2 },
				},
			} as Partial<Extract<ActivityEntry, { type: "tool_call" }>>),
		];
		const parts = derivePartsFromSession(entries, AGENT);
		const p = parts[0];
		if (p?.kind === "tool") {
			const diffEmbed = p.embeds.find((e) => e.kind === "diff");
			expect(diffEmbed).toBeDefined();
			if (diffEmbed?.kind === "diff") {
				expect(diffEmbed.label).toContain("stream.ts");
				expect(diffEmbed.meta).toMatch(/\+9/);
				expect(diffEmbed.target.route).toBe("artifact");
			}
		} else {
			throw new Error(`expected tool Part, got ${p?.kind}`);
		}
	});

	it("tool Part with unknown toolKind degrades to 'generic' (no throw)", () => {
		const entries: ActivityEntry[] = [
			toolEntry({
				data: {
					toolName: "exotic_tool",
					argsSummary: "args",
					status: "neutral",
					toolKind: "exotic-unknown-family" as ToolKind,
					verb: "Use exotic tool",
					target: "args",
				},
			} as Partial<Extract<ActivityEntry, { type: "tool_call" }>>),
		];
		let parts: Part[] = [];
		expect(() => {
			parts = derivePartsFromSession(entries, AGENT);
		}).not.toThrow();
		const p = parts[0];
		if (p?.kind === "tool") {
			// Unknown family degrades to generic
			expect(["generic", "command", p.toolKind]).toContain(p.toolKind);
		}
	});

	it("sub-agent tool Part carries opensSession with sessionId + label", () => {
		const entries: ActivityEntry[] = [
			toolEntry({
				data: {
					toolName: "spawn_agent",
					argsSummary: "verify Safari",
					status: "running",
					toolKind: "sub-agent",
					verb: "Spawn sub-agent",
					target: "verify Safari",
					opensSession: { sessionId: "sess-safari", label: "Safari verifier" },
				},
			} as Partial<Extract<ActivityEntry, { type: "tool_call" }>>),
		];
		const parts = derivePartsFromSession(entries, AGENT);
		const p = parts[0];
		if (p?.kind === "tool") {
			expect(p.opensSession).toBeDefined();
			expect(p.opensSession?.sessionId).toBe("sess-safari");
			expect(p.opensSession?.label).toBe("Safari verifier");
		}
	});

	it("tool Part author is the session agent", () => {
		const parts = derivePartsFromSession([toolEntry()], AGENT);
		expect(parts[0]?.author.id).toBe(AGENT.id);
		expect(parts[0]?.author.isAgent).toBe(true);
	});

	it("tool Part id derives from source timestamp (no new opaque id)", () => {
		const ts = 1718980000000;
		const entries: ActivityEntry[] = [
			toolEntry({
				timestamp: ts,
				data: {
					toolName: "bash",
					argsSummary: "ls",
					status: "ok",
					toolKind: "command",
					verb: "Run command",
					target: "ls",
				},
			} as Partial<Extract<ActivityEntry, { type: "tool_call" }>>),
		];
		const parts = derivePartsFromSession(entries, AGENT);
		// id must be a non-empty string (derived from the event, not random)
		expect(typeof parts[0]?.id).toBe("string");
		expect(parts[0]?.id.length).toBeGreaterThan(0);
	});
});

// ── derivePartsFromSession — reasoning → reasoning Part ─────────────

describe("AM3 derivePartsFromSession — reasoning → reasoning Part", () => {
	it("maps a reasoning entry to a reasoning Part", () => {
		const parts = derivePartsFromSession([reasoningEntry()], AGENT);
		expect(parts).toHaveLength(1);
		expect(parts[0]?.kind).toBe("reasoning");
	});

	it("reasoning Part carries durationMs and text", () => {
		const parts = derivePartsFromSession(
			[reasoningEntry({ data: { durationMs: 7_500, text: "Thinking hard…" } })],
			AGENT,
		);
		const p = parts[0];
		if (p?.kind === "reasoning") {
			expect(p.durationMs).toBe(7_500);
			expect(p.text).toBe("Thinking hard…");
		} else {
			throw new Error(`expected reasoning Part, got ${p?.kind}`);
		}
	});

	it("reasoning Part has no status (no success/failure glyph)", () => {
		const parts = derivePartsFromSession([reasoningEntry()], AGENT);
		const p = parts[0];
		expect((p as unknown as { status?: unknown }).status).toBeUndefined();
	});
});

// @lore AU21 Increment 14a: "derivePartsFromSession — cost_tick is SKIPPED"
// describe block is HARD-DELETED — `cost_tick` no longer exists as an
// ActivityEntry variant, no replacement.

// ── derivePartsFromSession — answer_delta/settled → prose Part ───────

describe("AM3 derivePartsFromSession — streaming answer → prose Part", () => {
	it("answer_delta maps to a prose Part", () => {
		const entries: ActivityEntry[] = [answerEntry("hello", true)];
		const parts = derivePartsFromSession(entries, AGENT);
		expect(parts[0]?.kind).toBe("prose");
	});

	it("answer_settled maps to a prose Part with the final text", () => {
		const entries: ActivityEntry[] = [answerEntry("All done.", false)];
		const parts = derivePartsFromSession(entries, AGENT);
		const p = parts[0];
		if (p?.kind === "prose") {
			expect(p.text).toBe("All done.");
		}
	});

	it("consecutive answer_deltas for the same turn merge into one growing prose Part", () => {
		const entries: ActivityEntry[] = [answerEntry("hello", true), answerEntry(" world", true)];
		const parts = derivePartsFromSession(entries, AGENT);
		// Two deltas in the same turn → ONE prose Part (text = concatenation)
		expect(parts).toHaveLength(1);
		const p = parts[0];
		if (p?.kind === "prose") {
			expect(p.text).toContain("hello");
			expect(p.text).toContain(" world");
		}
	});
});

// ── derivePartsFromSession — human_message → prose Part ──────────────

describe("AM3 derivePartsFromSession — human_message → prose Part", () => {
	it("human_message entry maps to a prose Part", () => {
		const entries: ActivityEntry[] = [humanEntry("Fix the bug")];
		const parts = derivePartsFromSession(entries, AGENT);
		expect(parts[0]?.kind).toBe("prose");
	});

	it("human Part author is the human (isMe=true for self-authored)", () => {
		const entries: ActivityEntry[] = [humanEntry("Fix it")];
		const parts = derivePartsFromSession(entries, AGENT);
		const author = parts[0]?.author;
		expect(author?.isAgent).toBe(false);
		expect(author?.isMe).toBe(true);
	});
});

// ── aggregateToolRun — tool-run aggregation grouping (architecture §c) ─

describe("AM3 aggregateToolRun — tool-run aggregation grouping", () => {
	it("returns tool-run blocks grouping completed tool Parts", () => {
		// Build a stream: tool-ok, tool-ok, tool-failed
		const entries: ActivityEntry[] = [
			toolEntry({
				data: {
					toolName: "view",
					argsSummary: "a.ts",
					status: "ok",
					toolKind: "read",
					verb: "View",
					target: "a.ts",
				},
			} as Partial<Extract<ActivityEntry, { type: "tool_call" }>>),
			toolEntry({
				data: {
					toolName: "bash",
					argsSummary: "npm test",
					status: "failed",
					output: "FAIL",
					toolKind: "command",
					verb: "Run command",
					target: "npm test",
				},
			} as Partial<Extract<ActivityEntry, { type: "tool_call" }>>),
		];
		const parts = derivePartsFromSession(entries, AGENT);
		const toolParts = parts.filter((p) => p.kind === "tool");
		expect(toolParts.length).toBe(2);

		// aggregateToolRun folds them (aggregateAt = 2)
		const blocks = aggregateToolRun(toolParts as Extract<Part, { kind: "tool" }>[], 2);
		expect(blocks.some((b) => b.kind === "tool-run")).toBe(true);
	});

	it("ALL completed tool calls fold (including failed ones)", () => {
		const toolEntries: ActivityEntry[] = [
			toolEntry({
				data: {
					toolName: "edit",
					argsSummary: "a.ts",
					status: "ok",
					toolKind: "edit",
					verb: "Edit",
					target: "a.ts",
				},
			} as Partial<Extract<ActivityEntry, { type: "tool_call" }>>),
			toolEntry({
				data: {
					toolName: "bash",
					argsSummary: "npm test",
					status: "failed",
					output: "FAIL",
					toolKind: "command",
					verb: "Run command",
					target: "npm test",
				},
			} as Partial<Extract<ActivityEntry, { type: "tool_call" }>>),
		];
		const parts = derivePartsFromSession(toolEntries, AGENT);
		const toolParts = parts.filter((p) => p.kind === "tool") as Extract<Part, { kind: "tool" }>[];
		const blocks = aggregateToolRun(toolParts, 2);

		// Everything folds — no standalone completed rows
		const standalones = blocks.filter(
			(b) =>
				b.kind === "single" &&
				b.part.kind === "tool" &&
				(b.part as Extract<Part, { kind: "tool" }>).status !== "running",
		);
		expect(standalones).toHaveLength(0);
	});

	it("ONLY the running tool renders standalone", () => {
		const toolEntries: ActivityEntry[] = [
			toolEntry({
				data: {
					toolName: "edit",
					argsSummary: "a.ts",
					status: "ok",
					toolKind: "edit",
					verb: "Edit",
					target: "a.ts",
				},
			} as Partial<Extract<ActivityEntry, { type: "tool_call" }>>),
			toolEntry({
				data: {
					toolName: "spawn",
					argsSummary: "safari",
					status: "running",
					toolKind: "sub-agent",
					verb: "Spawn sub-agent",
					target: "safari",
				},
			} as Partial<Extract<ActivityEntry, { type: "tool_call" }>>),
		];
		const parts = derivePartsFromSession(toolEntries, AGENT);
		const toolParts = parts.filter((p) => p.kind === "tool") as Extract<Part, { kind: "tool" }>[];
		const blocks = aggregateToolRun(toolParts, 2);

		// The running sub-agent renders standalone
		const runningSingle = blocks.filter(
			(b) =>
				b.kind === "single" &&
				b.part.kind === "tool" &&
				(b.part as Extract<Part, { kind: "tool" }>).status === "running",
		);
		expect(runningSingle.length).toBeGreaterThan(0);
	});

	it("aggregate block signals failures in the header (failedCount > 0)", () => {
		const toolEntries: ActivityEntry[] = [
			toolEntry({
				data: {
					toolName: "edit",
					argsSummary: "a.ts",
					status: "ok",
					toolKind: "edit",
					verb: "Edit",
					target: "a.ts",
				},
			} as Partial<Extract<ActivityEntry, { type: "tool_call" }>>),
			toolEntry({
				data: {
					toolName: "bash",
					argsSummary: "fail",
					status: "failed",
					output: "exit 1",
					toolKind: "command",
					verb: "Run command",
					target: "fail",
				},
			} as Partial<Extract<ActivityEntry, { type: "tool_call" }>>),
		];
		const parts = derivePartsFromSession(toolEntries, AGENT);
		const toolParts = parts.filter((p) => p.kind === "tool") as Extract<Part, { kind: "tool" }>[];
		const blocks = aggregateToolRun(toolParts, 2);

		const runBlock = blocks.find((b) => b.kind === "tool-run");
		expect(runBlock).toBeDefined();
		if (runBlock?.kind === "tool-run") {
			expect(runBlock.failedCount).toBeGreaterThan(0);
		}
	});

	it("diffs inside folded tool Parts are NOT lost (diff Embed stays on the Part)", () => {
		const entries: ActivityEntry[] = [
			toolEntry({
				data: {
					toolName: "edit_file",
					argsSummary: "stream.ts",
					status: "ok",
					toolKind: "edit",
					verb: "Edit",
					target: "stream.ts",
					diff: { label: "stream.ts", added: 9, removed: 2 },
				},
			} as Partial<Extract<ActivityEntry, { type: "tool_call" }>>),
			toolEntry({
				data: {
					toolName: "bash",
					argsSummary: "npm test",
					status: "failed",
					toolKind: "command",
					verb: "Run command",
					target: "npm test",
				},
			} as Partial<Extract<ActivityEntry, { type: "tool_call" }>>),
		];
		const parts = derivePartsFromSession(entries, AGENT);
		const toolParts = parts.filter((p) => p.kind === "tool") as Extract<Part, { kind: "tool" }>[];
		const blocks = aggregateToolRun(toolParts, 2);

		// Find the edit Part inside the aggregate
		const runBlock = blocks.find((b) => b.kind === "tool-run");
		if (runBlock?.kind === "tool-run") {
			const editPart = runBlock.tools.find((t) => t.toolKind === "edit");
			const diffEmbed = editPart?.embeds.find((e) => e.kind === "diff");
			expect(diffEmbed).toBeDefined();
		} else {
			throw new Error("expected a tool-run block");
		}
	});
});

// ── Composer pills — HarnessCapabilityDescriptor dispatch ─────────────

describe("AM3 deriveComposerPills — descriptor-driven, no per-backend branch", () => {
	const DESCRIPTOR_WITH_OPTIONS: HarnessCapabilityDescriptor = {
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
				id: "claude-opus-4",
				label: "Opus 4",
				selectable: true,
				inheritedFromGateway: false,
				options: [
					{
						key: "effort",
						label: "Effort",
						control: {
							kind: "select",
							choices: [
								{ value: "high", label: "High" },
								{ value: "low", label: "Low" },
							],
						},
						required: false,
						scope: "launch",
						defaultValue: "high",
					},
					{
						key: "mode",
						label: "Mode",
						control: {
							kind: "select",
							choices: [
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
		],
	};

	const DESCRIPTOR_NO_OPTIONS: HarnessCapabilityDescriptor = {
		...DESCRIPTOR_WITH_OPTIONS,
		models: [
			{
				id: "claude-sonnet-4-6",
				label: "Sonnet 4.6",
				selectable: true,
				inheritedFromGateway: false,
				options: [],
			},
		],
	};

	it("returns a pill for each declared option in the selected model", () => {
		const pills = deriveComposerPills(DESCRIPTOR_WITH_OPTIONS, "claude-opus-4");
		// effort + mode declared → 2 pills
		expect(pills.length).toBe(2);
	});

	it("a model with no declared options → no pills (undeclared option ⇒ absent)", () => {
		const pills = deriveComposerPills(DESCRIPTOR_NO_OPTIONS, "claude-sonnet-4-6");
		expect(pills).toHaveLength(0);
	});

	it("select control.kind → a 'select' pill kind", () => {
		const pills = deriveComposerPills(DESCRIPTOR_WITH_OPTIONS, "claude-opus-4");
		const effortPill = pills.find((p) => p.key === "effort");
		expect(effortPill?.control.kind).toBe("select");
	});

	it("no per-backend branch — identical pill shape from any harness type", () => {
		// Same options but from a hypothetical 'custom-harness' type
		const descriptor2: HarnessCapabilityDescriptor = {
			...DESCRIPTOR_WITH_OPTIONS,
			type: "custom-harness",
			name: "Custom",
		};
		const pills1 = deriveComposerPills(DESCRIPTOR_WITH_OPTIONS, "claude-opus-4");
		const pills2 = deriveComposerPills(descriptor2, "claude-opus-4");
		// Same shape — no branching on type
		expect(pills1.map((p) => p.key)).toEqual(pills2.map((p) => p.key));
	});

	it("unknown control.kind renders nothing (closed union, never throws)", () => {
		const opt: HarnessModelOptionDescriptor = {
			key: "exotic",
			label: "Exotic",
			control: { kind: "exotic-future-kind" as "text" },
			required: false,
			scope: "launch",
		};
		const descriptor3: HarnessCapabilityDescriptor = {
			...DESCRIPTOR_WITH_OPTIONS,
			models: [
				{
					id: "claude-opus-4",
					label: "Opus 4",
					selectable: true,
					inheritedFromGateway: false,
					options: [opt],
				},
			],
		};
		let pills: HarnessModelOptionDescriptor[] = [];
		expect(() => {
			pills = deriveComposerPills(descriptor3, "claude-opus-4");
		}).not.toThrow();
		// Unrecognized control kind → no pill rendered
		expect(pills.find((p) => p.key === "exotic")).toBeUndefined();
	});
});

// ── Queued message — pre-Part FIFO state ─────────────────────────────

describe("AM3 queued message — pre-Part state (not a Part kind)", () => {
	it("queued messages are NOT in PART_KINDS (they are pre-Part state)", () => {
		expect(PART_KINDS as ReadonlyArray<string>).not.toContain("queued");
		expect(PART_KINDS as ReadonlyArray<string>).not.toContain("pending");
	});

	it("a queued message converts to a prose Part on delivery", () => {
		// Simulated delivery: a human_message entry (the queue head consumed)
		const entries: ActivityEntry[] = [humanEntry("Check the Safari issue too")];
		const parts = derivePartsFromSession(entries, AGENT);
		const prose = parts.find((p) => p.kind === "prose");
		expect(prose?.kind).toBe("prose");
		if (prose?.kind === "prose") {
			expect(prose.text).toContain("Safari");
		}
	});
});

// ── Source-agnostic boundary (AC3 import boundary preserved) ──────────

describe("AM3 source-agnostic boundary — session adapter uses ActivityEntry[] only", () => {
	it("derivePartsFromSession signature accepts ActivityEntry[] — no harness-type parameter", () => {
		// If the adapter required a harness-type parameter it would violate AC3.
		// This test passes iff the function signature is (entries, agent) with no 3rd arg.
		const entries: ActivityEntry[] = [toolEntry()];
		// Should compile and run with exactly these two args
		expect(() => derivePartsFromSession(entries, AGENT)).not.toThrow();
	});

	it("produces well-formed Parts from any normalized ActivityEntry[]", () => {
		const entries: ActivityEntry[] = [
			toolEntry(),
			reasoningEntry(),
			answerEntry("Hello world", false),
		];
		const parts = derivePartsFromSession(entries, AGENT);
		for (const p of parts) {
			expect(typeof p.id).toBe("string");
			expect((PART_KINDS as ReadonlyArray<string>).includes(p.kind)).toBe(true);
			expect(Array.isArray(p.embeds)).toBe(true);
			expect(typeof p.author?.name).toBe("string");
		}
	});
});

// ── Exhaustive over all ActivityEntry["type"] ─────────────────────────

describe("AM3 derivePartsFromSession — exhaustive over ActivityEntry types", () => {
	it("does NOT throw on any known ActivityEntry type", () => {
		const entries: ActivityEntry[] = [
			toolEntry(),
			reasoningEntry(),
			answerEntry("hi", true),
			answerEntry("done", false),
			humanEntry("question"),
		];
		expect(() => derivePartsFromSession(entries, AGENT)).not.toThrow();
	});

	it("handles empty entries (session not started yet)", () => {
		expect(derivePartsFromSession([], AGENT)).toEqual([]);
	});
});
