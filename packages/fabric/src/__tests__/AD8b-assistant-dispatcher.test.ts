/**
 * AD8b — Assistant dispatcher unit tests (RED phase).
 *
 * AC-3: When a human posts a message to the assistant thread, the assistant
 *       responds (session is provisioned).
 *
 * Task 9: The assistant dispatcher:
 *   - Subscribes to thread_message_appended events
 *   - Filters: senderId is human AND thread is assistant thread (hostKind="user")
 *   - Does NOT dispatch for non-assistant threads
 *   - Does NOT dispatch when senderId is not a human user
 *
 * Pure unit tests using the dispatcher's filter logic.
 * The integration test (session row created) is in the server integration tests.
 */

import { describe, expect, it } from "vitest";
import { isAssistantThread, shouldDispatchForAssistant } from "../services/assistant-dispatcher.js";

// ---------------------------------------------------------------------------
// isAssistantThread: thread is an assistant thread iff hostKind="user"
// (Reviewer C1: query by hostKind="user" + hostId=userId, NOT by pinned)
// ---------------------------------------------------------------------------

describe("AD8b — isAssistantThread()", () => {
	it("returns true for hostKind='user' thread", () => {
		expect(isAssistantThread({ hostKind: "user", hostId: "u-1", pinned: false })).toBe(true);
	});

	it("returns true for hostKind='user' pinned thread", () => {
		expect(isAssistantThread({ hostKind: "user", hostId: "u-1", pinned: true })).toBe(true);
	});

	it("returns false for hostKind='bet' thread", () => {
		expect(isAssistantThread({ hostKind: "bet", hostId: "bet-1", pinned: false })).toBe(false);
	});

	it("returns false for hostKind='task' thread", () => {
		expect(isAssistantThread({ hostKind: "task", hostId: "task-1", pinned: false })).toBe(false);
	});

	it("returns false for hostKind='team' thread", () => {
		expect(isAssistantThread({ hostKind: "team", hostId: "team-1", pinned: false })).toBe(false);
	});

	it("returns false for hostKind='factory' thread", () => {
		expect(isAssistantThread({ hostKind: "factory", hostId: "factory-1", pinned: false })).toBe(
			false,
		);
	});

	it("returns false for hostKind='agent' thread", () => {
		expect(isAssistantThread({ hostKind: "agent", hostId: "agent-1", pinned: false })).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// shouldDispatchForAssistant: combined filter (human sender + assistant thread)
// ---------------------------------------------------------------------------

describe("AD8b — shouldDispatchForAssistant()", () => {
	it("returns true when sender is human and thread is user-hosted", () => {
		expect(
			shouldDispatchForAssistant({
				senderKind: "human",
				thread: { hostKind: "user", hostId: "u-1", pinned: false },
			}),
		).toBe(true);
	});

	it("returns false when sender is ai agent (not human)", () => {
		expect(
			shouldDispatchForAssistant({
				senderKind: "ai",
				thread: { hostKind: "user", hostId: "u-1", pinned: false },
			}),
		).toBe(false);
	});

	it("returns false when thread is not user-hosted", () => {
		expect(
			shouldDispatchForAssistant({
				senderKind: "human",
				thread: { hostKind: "bet", hostId: "bet-1", pinned: false },
			}),
		).toBe(false);
	});

	it("returns false when sender is ai AND thread is not user-hosted", () => {
		expect(
			shouldDispatchForAssistant({
				senderKind: "ai",
				thread: { hostKind: "task", hostId: "task-1", pinned: false },
			}),
		).toBe(false);
	});
});
