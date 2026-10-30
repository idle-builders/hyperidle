/**
 * Pure-schema unit tests for the session module's declarations —
 * `SearchSessionsInputSchema`, `WatchSessionInputSchema`,
 * `StopSessionInputSchema`, `SessionRowSchema`, `ActivityEntrySchema`,
 * `SESSION_STATES`, `SESSION_ACTIONS`.
 *
 * Unlike `document.ts`/`platform.ts`, this module has NO pure invariant
 * function — its two candidates are both explicitly dropped:
 * `search_sessions`'s `filter_required` (no filter lists newest first) and
 * `stop_session`'s authorization check (anyone signed in may stop any
 * session). The tests below prove those two absences as directly as the
 * schema can, and otherwise exercise the shapes themselves — exact
 * equality, never `toContain`.
 */

import { describe, expect, it } from "vitest";
import {
	ActivityEntrySchema,
	SESSION_ACTIONS,
	SESSION_STATES,
	SearchSessionsInputSchema,
	SessionRowSchema,
	StopSessionInputSchema,
	WatchSessionInputSchema,
} from "../actions/session.js";

describe("SESSION_STATES", () => {
	it("is exactly the set the real writers use: active, done, stopped, crashed — no 'failed', that value belongs to agent_session_requests, a different table", () => {
		expect(SESSION_STATES).toEqual(["active", "done", "stopped", "crashed"]);
	});
});

describe("SearchSessionsInputSchema", () => {
	it("an empty filter parses — filter_required was dropped", () => {
		const result = SearchSessionsInputSchema.safeParse({});
		expect(result.success).toBe(true);
	});

	it("taskId and agentIds together parse fine", () => {
		const result = SearchSessionsInputSchema.safeParse({
			taskId: "t1",
			agentIds: ["a1", "a2"],
		});
		expect(result.success).toBe(true);
	});

	it("rejects a field the shape does not name (.strict())", () => {
		const result = SearchSessionsInputSchema.safeParse({ filter_required: true });
		expect(result.success).toBe(false);
	});

	it("rejects a limit above 500", () => {
		const result = SearchSessionsInputSchema.safeParse({ limit: 501 });
		expect(result.success).toBe(false);
	});

	it("rejects a limit below 1", () => {
		const result = SearchSessionsInputSchema.safeParse({ limit: 0 });
		expect(result.success).toBe(false);
	});

	it("accepts a state filter drawn from SESSION_STATES", () => {
		const result = SearchSessionsInputSchema.safeParse({ state: "stopped" });
		expect(result.success).toBe(true);
	});

	it("rejects a state outside SESSION_STATES", () => {
		const result = SearchSessionsInputSchema.safeParse({ state: "failed" });
		expect(result.success).toBe(false);
	});
});

describe("WatchSessionInputSchema", () => {
	it("requires a non-empty id", () => {
		expect(WatchSessionInputSchema.safeParse({ id: "" }).success).toBe(false);
		expect(WatchSessionInputSchema.safeParse({}).success).toBe(false);
	});

	it("accepts an id", () => {
		expect(WatchSessionInputSchema.safeParse({ id: "s1" }).success).toBe(true);
	});
});

describe("StopSessionInputSchema", () => {
	it("requires a non-empty id and carries no authorization field — anyone signed in may stop any session", () => {
		expect(StopSessionInputSchema.safeParse({ id: "" }).success).toBe(false);
		const result = StopSessionInputSchema.safeParse({ id: "s1" });
		expect(result.success).toBe(true);
		expect(result.success && Object.keys(result.data)).toEqual(["id"]);
	});
});

const activityFixtures = [
	{ type: "tool_call" as const, timestamp: 1, data: { toolName: "read", argsSummary: "a.ts" } },
	{ type: "reasoning" as const, timestamp: 2, data: { excerpt: "thinking…" } },
	{ type: "answer_delta" as const, timestamp: 3, data: { text: "par" } },
	{ type: "answer_settled" as const, timestamp: 4, data: { text: "part" } },
	{
		type: "human_message" as const,
		timestamp: 5,
		data: { text: "hi", author: { id: "u1", name: "Ada", isAgent: false as const, isMe: true } },
	},
];

describe("ActivityEntrySchema", () => {
	it.each(activityFixtures)("round-trips a $type entry", (entry) => {
		const result = ActivityEntrySchema.safeParse(entry);
		expect(result.success).toBe(true);
	});

	it("rejects an entry with an unrecognized type", () => {
		const result = ActivityEntrySchema.safeParse({ type: "cost_tick", timestamp: 1, data: {} });
		expect(result.success).toBe(false);
	});
});

describe("SessionRowSchema", () => {
	const row = {
		id: "s1",
		agentId: "a1",
		taskId: "t1",
		threadId: null,
		startedAt: "2026-09-22T00:00:00.000Z",
		endedAt: null,
		state: "active",
		outcome: null,
		routineId: null,
		notes: null,
		modelTier: "workhorse",
		sourceKind: "task",
	};

	it("parses a full row", () => {
		expect(SessionRowSchema.safeParse(row).success).toBe(true);
	});

	it("accepts a null sourceKind — the column is nullable", () => {
		expect(SessionRowSchema.safeParse({ ...row, sourceKind: null }).success).toBe(true);
	});

	it("rejects a modelTier outside MODEL_TIERS", () => {
		expect(SessionRowSchema.safeParse({ ...row, modelTier: "genius" }).success).toBe(false);
	});
});

describe("SESSION_ACTIONS", () => {
	it("names exactly list_waiting_requests, search_sessions, watch_session, stop_session", () => {
		expect(Object.keys(SESSION_ACTIONS).sort()).toEqual([
			"list_waiting_requests",
			"search_sessions",
			"stop_session",
			"watch_session",
		]);
	});

	it("each declaration's own name matches its map key", () => {
		for (const [key, declaration] of Object.entries(SESSION_ACTIONS)) {
			expect(declaration.name).toBe(key);
		}
	});
});
