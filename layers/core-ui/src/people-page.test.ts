import type { SessionRow, Task, ThreadListRow, UserRow } from "@hyperidle/domain-model";
import { describe, expect, it } from "vitest";
import {
	agentJobs,
	crewOf,
	cronOf,
	cronWords,
	personStand,
	startedJobs,
	waitingJobs,
} from "./people-page";

const NOW = Date.parse("2026-10-21T12:00:00.000Z");
const at = (hoursAgo: number) => new Date(NOW - hoursAgo * 3_600_000).toISOString();

const user = (id: string, u: Partial<UserRow> = {}): UserRow => ({
	id,
	kind: "human",
	name: id,
	role: "",
	status: "active",
	avatarUrl: null,
	createdAt: at(1000),
	agentCategory: null,
	ownerUserId: null,
	health: null,
	discipline: null,
	what: null,
	teams: [],
	edges: [],
	...u,
});
const product = { id: "t-product", name: "Product" };
const support = { id: "t-support", name: "Support" };

const task = (id: string, t: Partial<Task> = {}): Task => ({
	id,
	parentTaskId: null,
	teamId: product.id,
	ownerAgentId: "builder",
	title: id,
	description: null,
	doneWhen: [],
	state: "in_progress",
	dependencies: null,
	threadId: `thr-${id}`,
	notes: null,
	createdAt: at(10),
	updatedAt: at(6),
	outcomeVerdict: null,
	outcomeSummary: null,
	outcomeRecordedAt: null,
	outcomeRecordedBy: null,
	tokensActualJson: null,
	sourceDocumentId: null,
	completedAt: null,
	position: 0,
	reasons: [],
	paused: null,
	startedBy: null,
	need: null,
	...t,
});
const session = (taskId: string, hoursAgo: number): SessionRow => ({
	id: `s-${taskId}`,
	agentId: "builder",
	taskId,
	startedAt: at(hoursAgo),
	endedAt: null,
	state: "active",
	outcome: null,
	notes: null,
	modelTier: "workhorse",
	sourceKind: "task",
});

describe("a team's page", () => {
	it("lists each person with the agents that work for them there, you last, and the agents of every team", () => {
		const users = [
			user("finn", { name: "Finn", teams: [product, support] }),
			user("maya", { name: "Maya", teams: [support] }),
			user("builder", { kind: "ai", ownerUserId: "finn", teams: [product] }),
			user("designer", { kind: "ai", ownerUserId: "maya", teams: [support] }),
			user("old", { kind: "ai", ownerUserId: "finn", teams: [product], status: "retired" }),
			user("facilitation", { kind: "ai", teams: [] }),
		];
		const inSupport = crewOf(users, support.id, "finn");
		expect(inSupport.crews.map((c) => [c.person.id, c.agents.map((a) => a.id)])).toEqual([
			["maya", ["designer"]],
			["finn", []],
		]);
		const inProduct = crewOf(users, product.id, "finn");
		expect(inProduct.crews.map((c) => [c.person.id, c.agents.map((a) => a.id)])).toEqual([
			["finn", ["builder"]],
		]);
		expect(inProduct.everyTeam.map((a) => a.id)).toEqual(["facilitation"]);
	});
});

describe("a reason at a time", () => {
	it.each([
		["0 7 * * 1", "Every Monday at 07:00"],
		["30 16 * * 5", "Every Friday at 16:30"],
		["0 8 * * *", "Every day at 08:00"],
		["0 8 1 * *", "Every month on day 1 at 08:00"],
		["*/5 * * * *", "*/5 * * * *"],
	])("%s reads as %s", (cron, words) => {
		expect(cronWords(cron)).toBe(words);
	});

	it.each([
		["week", "Thursday", "08:00", "0 8 * * 4"],
		["day", "Thursday", "07:30", "30 7 * * *"],
		["month", "Thursday", "08:00", "0 8 1 * *"],
	] as const)("every %s on %s at %s is %s", (often, day, time, cron) => {
		expect(cronOf(often, day, time)).toBe(cron);
		expect(cronWords(cronOf(often, day, time))).not.toBe(cron);
	});
});

describe("an agent's list", () => {
	it("shows its unfinished parts, running first, and counts what it finished today", () => {
		const tasks = [
			task("trials", { ownerAgentId: "growth" }),
			task("build", { parentTaskId: "trials" }),
			task("email", { parentTaskId: "build" }),
			task("card", { parentTaskId: "build", need: "input" }),
			task("wire", { parentTaskId: "build", state: "accepted" }),
			task("utc", { state: "done", completedAt: at(2) }),
			task("old", { state: "done", completedAt: at(50) }),
		];
		const { on, doneToday } = agentJobs(tasks, "builder", [session("email", 0.2)], "BU", NOW);
		expect(on.map((j) => [j.title, j.words, j.mark, j.needs ?? null, j.href])).toEqual([
			["email", "Running · 12 min", "run", null, "/work/trials?part=email"],
			["card", "Needs input · 6h", "open", "input", "/work/trials?part=card"],
			["wire", "Waits", "open", null, "/work/trials?part=wire"],
		]);
		expect(doneToday).toBe(1);
	});
});

describe("a person's lists", () => {
	const thread = (id: string, need: ThreadListRow["need"]): ThreadListRow => ({
		id,
		hostKind: "team",
		hostId: product.id,
		initiatorId: "builder",
		members: [],
		title: null,
		computedTitle: `About ${id}`,
		pinned: false,
		resolvedAt: null,
		deletedAt: null,
		lastActiveAt: at(8),
		createdAt: at(9),
		need,
		lastMessagePreview: null,
		lastSenderId: null,
		mentionsYou: false,
	});

	it("waiting: the conversations with a review or a question, and the stand that counts them", () => {
		const waiting = waitingJobs(
			[thread("a", "review"), thread("b", null), thread("c", "stuck"), thread("d", "input")],
			NOW,
		);
		expect(waiting.map((j) => [j.title, j.words, j.needs])).toEqual([
			["About a", "Review · 8h", "review"],
			["About c", "Question · an agent waits · 8h", "input"],
			["About d", "Question · 8h", "input"],
		]);
		expect(personStand(waiting, true)).toBe("One review and 2 questions wait for you.");
		expect(personStand([], false)).toBe("Nothing waits for them.");
	});

	it("started: the unfinished tasks they started, each with whose it is and how far", () => {
		const tasks = [
			task("trials", { ownerAgentId: "growth", startedBy: "finn" }),
			task("part-done", { parentTaskId: "trials", state: "done" }),
			task("part-open", { parentTaskId: "trials", startedBy: "finn" }),
			task("explain", { need: "review", startedBy: "finn" }),
			task("utc", { state: "done", startedBy: "finn" }),
			task("refunds", { startedBy: "maya" }),
		];
		const jobs = startedJobs(
			tasks,
			"finn",
			new Map([
				["growth", "Growth"],
				["builder", "Builder"],
			]),
			() => "XX",
			[],
			NOW,
		);
		expect(jobs.map((j) => [j.title, j.words])).toEqual([
			["trials", "Growth · 1 of 2 done"],
			["explain", "Builder · needs review · 6h"],
		]);
	});
});
