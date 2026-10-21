/** How a person or agent is drawn in an avatar, and how a task reads in the Work list. */
import type { Task } from "@hyperidle/domain-model";
import { expect, test } from "vitest";
import { initials, workItems } from "./sidebar-lists";

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
