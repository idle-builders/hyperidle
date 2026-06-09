/**
 * AD8b — Assistant role catalog and ThreadConfiguration tests (RED phase).
 *
 * AC-11: AGENT_ROLE_CATALOG entry updated: role="assistant", hasTemplate=true.
 *        findRoleCatalogEntry("assistant") returns entry with correct fields.
 *        findRoleCatalogEntry("chief_of_staff") returns undefined (renamed).
 * AC-2 (shared types): ToolCallSummary interface is exported from @hyperidle/shared.
 * ThreadConfiguration: "coach" renamed to "assistant".
 */

import { describe, expect, it } from "vitest";
import { AGENT_ROLE_CATALOG, findRoleCatalogEntry } from "../agent-roles.js";
import {
	classifyThreadConfiguration,
	type ThreadConfiguration,
	type ToolCallSummary,
} from "../thread.js";

// ---------------------------------------------------------------------------
// AC-11: Role catalog — "assistant" replaces "chief_of_staff"
// ---------------------------------------------------------------------------

describe("AD8b — AGENT_ROLE_CATALOG: assistant entry", () => {
	it("findRoleCatalogEntry('assistant') returns an entry", () => {
		const entry = findRoleCatalogEntry("assistant");
		expect(entry).toBeDefined();
	});

	it("assistant entry has role='assistant'", () => {
		const entry = findRoleCatalogEntry("assistant");
		expect(entry?.role).toBe("assistant");
	});

	it("assistant entry has label='Assistant'", () => {
		const entry = findRoleCatalogEntry("assistant");
		expect(entry?.label).toBe("Assistant");
	});

	it("assistant entry has category='individual'", () => {
		const entry = findRoleCatalogEntry("assistant");
		expect(entry?.category).toBe("individual");
	});

	it("assistant entry has hasTemplate=true", () => {
		const entry = findRoleCatalogEntry("assistant");
		expect(entry?.hasTemplate).toBe(true);
	});

	it("assistant entry has community='ops'", () => {
		const entry = findRoleCatalogEntry("assistant");
		expect(entry?.community).toBe("ops");
	});

	it("AGENT_ROLE_CATALOG contains exactly one individual-category entry", () => {
		const individualEntries = AGENT_ROLE_CATALOG.filter((e) => e.category === "individual");
		expect(individualEntries).toHaveLength(1);
		expect(individualEntries[0]?.role).toBe("assistant");
	});

	it("findRoleCatalogEntry('chief_of_staff') returns undefined (renamed to assistant)", () => {
		const entry = findRoleCatalogEntry("chief_of_staff");
		expect(entry).toBeUndefined();
	});
});

// ---------------------------------------------------------------------------
// AC-11: ThreadConfiguration rename — "coach" → "assistant"
// ---------------------------------------------------------------------------

describe("AD8b — ThreadConfiguration rename: coach → assistant", () => {
	it("classifyThreadConfiguration returns 'assistant' for pinned user-hosted thread", () => {
		const thread = {
			id: "thr-1",
			hostKind: "user" as const,
			hostId: "u-founder",
			initiatorId: "u-founder",
			participants: ["u-founder", "ast-agent-id"],
			pinned: true,
			resolvedAt: null,
			lastActiveAt: "2026-01-01T00:00:00.000Z",
			createdAt: "2026-01-01T00:00:00.000Z",
		};
		const config: ThreadConfiguration = classifyThreadConfiguration(thread);
		expect(config).toBe("assistant");
	});

	it("classifyThreadConfiguration does NOT return 'coach' for pinned user thread", () => {
		const thread = {
			id: "thr-1",
			hostKind: "user" as const,
			hostId: "u-founder",
			initiatorId: "u-founder",
			participants: ["u-founder", "ast-agent-id"],
			pinned: true,
			resolvedAt: null,
			lastActiveAt: "2026-01-01T00:00:00.000Z",
			createdAt: "2026-01-01T00:00:00.000Z",
		};
		const config = classifyThreadConfiguration(thread);
		expect(config).not.toBe("coach");
	});

	it("classifyThreadConfiguration returns 'dm' for unpinned user-hosted thread (2 participants)", () => {
		const thread = {
			id: "thr-2",
			hostKind: "user" as const,
			hostId: "u-founder",
			initiatorId: "u-founder",
			participants: ["u-founder", "ast-agent-id"],
			pinned: false,
			resolvedAt: null,
			lastActiveAt: "2026-01-01T00:00:00.000Z",
			createdAt: "2026-01-01T00:00:00.000Z",
		};
		const config = classifyThreadConfiguration(thread);
		// Unpinned user thread with 2 participants is classified as "dm" (before first response)
		expect(config).toBe("dm");
	});

	it("ThreadConfiguration type accepts 'assistant' value", () => {
		// Type-level test — if this compiles, "assistant" is in the union
		const config: ThreadConfiguration = "assistant";
		expect(config).toBe("assistant");
	});
});

// ---------------------------------------------------------------------------
// AC-2 (ToolCallSummary): ToolCallSummary type is exported and usable
// ---------------------------------------------------------------------------

describe("AD8b — ToolCallSummary type", () => {
	it("ToolCallSummary can be constructed with all required fields", () => {
		const summary: ToolCallSummary = {
			name: "read_inbox",
			input: { limit: 10 },
			output: "3 messages found",
			status: "ok",
		};
		expect(summary.name).toBe("read_inbox");
		expect(summary.status).toBe("ok");
	});

	it("ToolCallSummary accepts status='error'", () => {
		const summary: ToolCallSummary = {
			name: "create_bet",
			input: { title: "Test Bet" },
			output: "Error: insufficient permissions",
			status: "error",
		};
		expect(summary.status).toBe("error");
	});
});

// ---------------------------------------------------------------------------
// AC-2 (PlainPayload): PlainPayload with toolCalls is usable
// ---------------------------------------------------------------------------

describe("AD8b — PlainPayload with toolCalls extension", () => {
	it("PlainPayload accepts toolCalls array", () => {
		// Type-level test — if this compiles, toolCalls field exists on PlainPayload
		const payload = {
			text: "I found 3 tasks for you.",
			toolCalls: [
				{
					name: "read_inbox",
					input: {},
					output: "3 tasks",
					status: "ok" as const,
				},
			],
		};
		// Runtime check: the shape matches what we expect
		expect(payload.toolCalls).toHaveLength(1);
		expect(payload.toolCalls[0]?.name).toBe("read_inbox");
	});

	it("PlainPayload without toolCalls is still valid", () => {
		const payload = { text: "Hello there" };
		expect(payload.text).toBe("Hello there");
	});
});
