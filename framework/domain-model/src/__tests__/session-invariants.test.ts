/**
 * Pure-schema unit tests for the session module's declarations —
 * `StopSessionInputSchema`, `SessionRowSchema`, `SESSION_STATES`.
 */

import { describe, expect, it } from "vitest";
import { SESSION_STATES, SessionRowSchema, StopSessionInputSchema } from "../actions/session.js";

describe("SESSION_STATES", () => {
	it("is exactly the set the real writers use: active, done, stopped, crashed — no 'failed', that value belongs to agent_session_requests, a different table", () => {
		expect(SESSION_STATES).toEqual(["active", "done", "stopped", "crashed"]);
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
