/** How a person or agent is drawn in an avatar, how a task reads in Work, and what waits while you focus. */
import type { Task } from "@hyperidle/domain-model";
import { describe, expect, test } from "vitest";
import { countTasks, initials, newSince, workItems } from "./sidebar-lists";

test.each([
	["Maya Chen", "MC"],
	["Builder", "BU"],
	["Finn van Olsen", "FV"],
])("%s is %s", (name, letters) => {
	expect(initials(name)).toBe(letters);
});

test.each([
	["stopped", "Stopped"],
	["hold", "On hold"],
	[null, "Needs input"],
] as const)("a task paused %s reads %s in the Work list", (paused, words) => {
	const task = {
		id: "t",
		parentTaskId: null,
		teamId: "team",
		ownerAgentId: "builder",
		title: "Trials",
		state: "in_progress",
		need: "input",
		paused,
		updatedAt: "2026-10-21T09:00:00.000Z",
	} as Task;
	expect(workItems([task], new Map(), [])[0]?.state).toBe(words);
});

test("while you focus, a new conversation and one with new activity wait; one that did not move does not", () => {
	const held = new Map([
		["quiet", "2026-10-21T09:00:00.000Z"],
		["moved", "2026-10-21T09:00:00.000Z"],
	]);
	const now = [
		{ id: "quiet", lastActiveAt: "2026-10-21T09:00:00.000Z" },
		{ id: "moved", lastActiveAt: "2026-10-21T09:05:00.000Z" },
		{ id: "new", lastActiveAt: "2026-10-21T09:06:00.000Z" },
	];
	expect(newSince(held, now)).toBe(2);
});

describe("countTasks", () => {
	test.each([
		[1, "1 task"],
		[6, "6 tasks"],
		[0, "0 tasks"],
	])("%i", (n, words) => {
		expect(countTasks(n)).toBe(words);
	});
});
