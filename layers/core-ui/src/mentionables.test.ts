/** Who the mention picker offers, what it says about each, and when it opens. */
import type { SessionRow, UserRow } from "@hyperidle/domain-model";
import { describe, expect, test } from "vitest";
import { matching, mentionables, typedMention } from "./mentionables";

const user = (u: Partial<UserRow> & Pick<UserRow, "id" | "name">): UserRow => ({
	kind: "ai",
	role: "member",
	status: "active",
	avatarUrl: null,
	createdAt: "2026-10-01T00:00:00.000Z",
	agentCategory: null,
	ownerUserId: null,
	health: null,
	discipline: null,
	what: null,
	teams: [],
	edges: [],
	...u,
});

const running = (agentId: string): SessionRow => ({
	id: `s-${agentId}-${Math.random()}`,
	agentId,
	taskId: null,
	startedAt: "2026-10-21T08:00:00.000Z",
	endedAt: null,
	state: "active",
	outcome: null,
	notes: null,
	modelTier: "workhorse",
	sourceKind: null,
});

describe("mentionables", () => {
	test("agents and people in one list, each saying whose they are, their craft and their load", () => {
		const users = [
			user({ id: "me", name: "Finn Olsen", kind: "human" }),
			user({ id: "b", name: "Builder", ownerUserId: "me", discipline: "Engineering" }),
			user({ id: "d", name: "Designer", ownerUserId: "maya", discipline: "Design" }),
			user({ id: "f", name: "Facilitation" }),
			user({ id: "maya", name: "Maya Chen", kind: "human", discipline: "Support" }),
			user({ id: "gone", name: "Old Hand", kind: "human", status: "inactive" }),
			user({ id: "sys", name: "System", role: "system" }),
			user({ id: "r", name: "Retired", status: "retired" }),
		];
		const list = mentionables(users, [running("d"), running("d")], "me");
		expect(list.map((m) => [m.name, m.what, m.load])).toEqual([
			["Builder", "Your agent · Engineering", "idle"],
			["Designer", "Maya's agent · Design", "2 running"],
			["Facilitation", "Agent", "idle"],
			["Maya Chen", "Person · Support", ""],
			["Old Hand", "Person", "away"],
		]);
	});

	test("names starting with what was typed come before names containing it", () => {
		const list = mentionables(
			[user({ id: "a", name: "Builder" }), user({ id: "b", name: "Rebuild bot" })],
			[],
			"me",
		);
		expect(matching(list, "bu").map((m) => m.name)).toEqual(["Builder", "Rebuild bot"]);
		expect(matching(list, "zz")).toEqual([]);
	});
});

describe("typedMention", () => {
	test.each([
		{ text: "@bu", caret: 3, out: { at: 0, query: "bu" } },
		{ text: "hi @Maya Ch", caret: 11, out: { at: 3, query: "Maya Ch" } },
		{ text: "hi @", caret: 4, out: { at: 3, query: "" } },
		{ text: "me@maya", caret: 7, out: null },
		{ text: "@ bu", caret: 4, out: null },
	])("$text", ({ text, caret, out }) => {
		expect(typedMention(text, caret)).toEqual(out);
	});
});
