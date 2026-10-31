/** How the task page says where a task and its parts stand, from what `open_task` returns. */
import type { Task, TaskNode } from "@hyperidle/domain-model";
import { describe, expect, test } from "vitest";
import { cameFrom, chipWords, closing, indexTree, onePerAsk, standLine, tally } from "./task-page";

const at = (day: number, hhmm = "09:00") =>
	`2026-10-${String(day).padStart(2, "0")}T${hhmm}:00.000Z`;
const NOW = Date.parse(at(21, "16:00"));

function node(id: string, t: Partial<Task> = {}, children: TaskNode[] = []): TaskNode {
	const input = children.reduce((n, c) => n + c.openBelow.input + (c.need === "input" ? 1 : 0), 0);
	const review = children.reduce(
		(n, c) => n + c.openBelow.review + (c.need === "review" ? 1 : 0),
		0,
	);
	return {
		id,
		parentTaskId: null,
		teamId: "team",
		ownerAgentId: "builder",
		title: id,
		description: null,
		descriptionFormat: "markdown",
		doneWhen: [],
		state: "in_progress",
		dependencies: null,
		threadId: `thr-${id}`,
		notes: null,
		createdAt: at(7),
		updatedAt: at(20),
		outcomeVerdict: null,
		outcomeSummary: null,
		outcomeRecordedAt: null,
		outcomeRecordedBy: null,
		tokensActualJson: null,
		sourceDocumentId: null,
		completedAt: null,
		position: 0,
		reasons: [],
		need: null,
		paused: null,
		startedBy: null,
		...t,
		children,
		openBelow: { input, review },
	};
}

const done = (id: string) => node(id, { state: "done", completedAt: at(12) });
const tree = indexTree(
	node("trials", {}, [
		node("understand", { state: "done", completedAt: at(12) }, [done("numbers"), done("dropoff")]),
		node("build", { need: "input" }, [
			node("card", { need: "input" }),
			node("layout", { state: "review", need: "review" }),
			node("reminder"),
		]),
		node("test", { state: "hold", dependencies: JSON.stringify(["build"]) }),
	]),
);
const owner = () => "Builder";
const running = new Set(["reminder"]);

describe("the tally of a task's parts", () => {
	test.each([
		["under way", null, "2 of 6 done · 1 needs input · 1 needs review · 1 running"],
		["stopped", "stopped", "2 of 6 done · stopped"],
		["on hold", "hold", "2 of 6 done · on hold · 1 needs input · 1 needs review · 1 running"],
	] as const)("%s", (_, paused, words) => {
		const root = tree.byId.get("trials");
		expect(root && tally(tree, { ...root, paused }, running)).toBe(words);
	});
});

describe("a part's chip says how it stands", () => {
	test.each([
		["numbers", "Done"],
		["understand", "Done"],
		["build", "0 of 3 done"],
		["card", "Needs input"],
		["layout", "Needs review"],
		["reminder", "Builder is on it"],
		["test", "Waits"],
	])("%s: %s", (id, words) => {
		const n = tree.byId.get(id);
		expect(n && chipWords(tree, n, running, owner)).toBe(words);
	});

	test("a part not done under a stopped task says Stopped, a done one stays done", () => {
		const stopped = indexTree(
			node("root", { paused: "stopped" }, [
				node("a", { paused: "stopped", need: "input" }),
				done("b"),
			]),
		);
		const words = ["a", "b"].map((id) => {
			const n = stopped.byId.get(id);
			return n && chipWords(stopped, n, new Set(), owner);
		});
		expect(words).toEqual(["Stopped", "Done"]);
	});
});

describe("the stand line", () => {
	test.each([
		["trials", "Two of six parts are done. One needs input, one needs a review, one is running."],
		["understand", "Done 9 days ago. Both parts are finished."],
		["test", "Waits for “build”. It starts by itself when that is done."],
		["layout", "The work is finished. It closes once it is reviewed."],
		["card", "Builder stopped to ask a question, and waits for the answer."],
		["reminder", "Builder is working on this."],
		["numbers", "Done 9 days ago. It closed by itself."],
	])("%s", (id, line) => {
		const n = tree.byId.get(id);
		expect(n && standLine(tree, n, running, owner, NOW)).toBe(line);
	});

	test("a stopped task says nothing is undone and how to go on", () => {
		const n = node("x", { paused: "stopped" });
		expect(standLine(indexTree(n), n, new Set(), owner, NOW)).toBe(
			"Stopped. The agents stopped where they were; nothing they did is undone. Start again, and they pick up from there.",
		);
	});
});

test.each([
	[[], "Closed by itself"],
	[
		[{ id: "r", what: "Looked at", by: "review", state: "met", how: null }],
		"Was reviewed before it closed",
	],
] as const)("a finished task says how it closed", (lines, words) => {
	expect(closing(node("x", { state: "done", doneWhen: [...lines] }))).toBe(words);
});

test.each([
	["handed off in a conversation that was there first", at(19), true],
	["its own conversation, made with it", at(20), false],
])("came from: %s", (_, threadCreated, came) => {
	expect(cameFrom(node("x", { createdAt: at(20) }), { createdAt: threadCreated })).toBe(came);
});

describe("onePerAsk", () => {
	test("an ask found from several parts that share a conversation shows once, where it says it belongs", () => {
		const review = (id: string, taskId?: string) => ({
			id,
			payload: taskId ? { taskId } : {},
		});
		const asks = [
			{ task: "root", message: review("r1") },
			{ task: "part-1", message: review("r1") },
			{ task: "root", message: review("r2", "part-2") },
			{ task: "part-2", message: review("r2", "part-2") },
		];
		expect(onePerAsk(asks).map((a) => [a.task, a.message.id])).toEqual([
			["root", "r1"],
			["part-2", "r2"],
		]);
	});
});
