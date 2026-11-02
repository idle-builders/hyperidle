/** Pure huddle payload mutation rules and relay guard. */
import type { HuddlePayload } from "@hyperidle/domain-model";
import { describe, expect, it } from "vitest";
import { applyHuddleJoin, applyHuddleLeave, isRelayAllowed } from "../huddle-operations.js";

const live = (people: HuddlePayload["people"]): HuddlePayload => ({
	startedAt: "2026-11-02T10:00:00Z",
	endedAt: null,
	people,
});

describe("applyHuddleJoin", () => {
	it("adds new person", () => {
		const result = applyHuddleJoin(live([]), "alice", "T");
		expect(result.people).toHaveLength(1);
		expect(result.people[0]).toMatchObject({ id: "alice", leftAt: null });
	});

	it("no-op when already joined", () => {
		const p = live([{ id: "alice", joinedAt: "T", leftAt: null }]);
		const result = applyHuddleJoin(p, "alice", "T2");
		expect(result.people).toHaveLength(1);
	});

	it("adds a new entry when rejoining after leaving", () => {
		const p = live([{ id: "alice", joinedAt: "T1", leftAt: "T2" }]);
		const result = applyHuddleJoin(p, "alice", "T3");
		expect(result.people).toHaveLength(2);
		expect(result.people[1]).toMatchObject({ id: "alice", leftAt: null });
	});
});

describe("applyHuddleLeave", () => {
	it("sets leftAt for the person", () => {
		const p = live([{ id: "alice", joinedAt: "T", leftAt: null }]);
		const result = applyHuddleLeave(p, "alice", "T2");
		expect(result.people[0]?.leftAt).toBe("T2");
	});

	it("ends the huddle when last person leaves", () => {
		const p = live([{ id: "alice", joinedAt: "T", leftAt: null }]);
		const result = applyHuddleLeave(p, "alice", "T2");
		expect(result.endedAt).toBe("T2");
	});

	it("does not end huddle when others are still in", () => {
		const p = live([
			{ id: "alice", joinedAt: "T", leftAt: null },
			{ id: "bob", joinedAt: "T", leftAt: null },
		]);
		const result = applyHuddleLeave(p, "alice", "T2");
		expect(result.endedAt).toBeNull();
	});
});

describe("isRelayAllowed", () => {
	it("allows when both are joined and huddle is live", () => {
		const p = live([
			{ id: "alice", joinedAt: "T", leftAt: null },
			{ id: "bob", joinedAt: "T", leftAt: null },
		]);
		expect(isRelayAllowed(p, "alice", "bob")).toBe(true);
	});

	it("denies when huddle has ended", () => {
		const p: HuddlePayload = { ...live([]), endedAt: "T2" };
		expect(isRelayAllowed(p, "alice", "bob")).toBe(false);
	});

	it("denies when 'from' has left", () => {
		const p = live([
			{ id: "alice", joinedAt: "T", leftAt: "T2" },
			{ id: "bob", joinedAt: "T", leftAt: null },
		]);
		expect(isRelayAllowed(p, "alice", "bob")).toBe(false);
	});

	it("denies when 'to' has not joined", () => {
		const p = live([{ id: "alice", joinedAt: "T", leftAt: null }]);
		expect(isRelayAllowed(p, "alice", "bob")).toBe(false);
	});
});
