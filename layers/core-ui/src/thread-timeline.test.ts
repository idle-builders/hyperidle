/** How a thread reads top to bottom, and how its work item says where it is. */
import type { Message, SessionRow, Task } from "@hyperidle/domain-model";
import { describe, expect, test } from "vitest";
import { clock, duration, timeline, titleFrom, workState } from "./thread-timeline";

const at = (hhmm: string) => `2026-10-20T${hhmm}:00.000Z`;
const msg = (id: string, senderId: string, hhmm: string, type: Message["type"], payload: unknown) =>
	({
		id,
		threadId: "t",
		senderId,
		type,
		payload,
		clientKey: `ck-${id}`,
		resolvedAt: null,
		deletedAt: null,
		redactedAt: null,
		createdAt: at(hhmm),
	}) satisfies Message;
const task = (t: Partial<Task>): Task => ({
	id: "task",
	parentTaskId: null,
	teamId: "team",
	ownerAgentId: "builder",
	title: "Explain the trial end",
	description: null,
	doneWhen: [],
	state: "in_progress",
	dependencies: null,
	threadId: "t",
	notes: null,
	createdAt: at("08:13"),
	updatedAt: at("08:13"),
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
});
const session = (start: string, end: string): SessionRow => ({
	id: `s-${start}`,
	agentId: "builder",
	taskId: "task",
	startedAt: at(start),
	endedAt: at(end),
	state: "done",
	outcome: "completed",
	notes: null,
	modelTier: "workhorse",
	sourceKind: null,
});
const who = (id: string) => (id === "me" ? "You" : id === "maya" ? "Maya" : "Builder");

describe("timeline", () => {
	test("runs, events, the work item where it was minted, and one event per stretch of work", () => {
		const entries = timeline(
			[
				msg("1", "maya", "08:12", "plain", { text: "Three tickets" }),
				msg("2", "me", "08:13", "plain", { text: "@Builder take it" }),
				msg("3", "builder", "08:13", "plain", { text: "Taking it" }),
				msg("4", "builder", "12:31", "questionnaire", {
					title: "Name?",
					question: "",
					options: ["Your first bill", "Plan starts"],
				}),
				msg("5", "me", "12:40", "answer", { resolvesMessageId: "4", option: "Your first bill" }),
				msg("6", "builder", "12:48", "plain", { text: "Went with it" }),
				msg("7", "builder", "12:49", "review", { title: "Trial-end explainer", reasoning: [] }),
				msg("8", "me", "15:20", "verdict", {
					decision: "reject",
					resolvesMessageId: "7",
					note: "Wrong",
				}),
				msg("9", "maya", "15:30", "verdict", { decision: "approve", resolvesMessageId: "7" }),
			],
			[task({})],
			[session("08:14", "12:30"), session("13:00", "13:20")],
			who,
		);
		expect(
			entries.map((e) =>
				e.kind === "said"
					? `${e.senderId}: ${e.messages.map((m) => m.id).join(",")}`
					: e.kind === "task"
						? `strip ${e.task.id}`
						: e.text,
			),
		).toEqual([
			"maya: 1",
			"me: 2",
			"builder: 3",
			"strip task",
			"Worked 4h 16m · 1 session",
			"builder: 4",
			"You went with Your first bill",
			"builder: 6,7",
			"Worked 20m · 1 session",
			"You rejected Trial-end explainer",
			"Maya approved Trial-end explainer",
		]);
	});

	test("back-to-back sessions read as one stretch of work", () => {
		const entries = timeline([], [], [session("08:00", "08:30"), session("08:40", "09:00")], who);
		expect(entries).toEqual([
			{ kind: "event", key: `worked-${at("08:30")}`, text: "Worked 50m · 2 sessions" },
		]);
	});
});

describe("workState", () => {
	test.each([
		{
			t: { need: "review" as const, state: "review" as const },
			reviews: 2,
			words: "Needs review · 2 reviews",
			dot: "wait",
		},
		{
			t: { need: "stuck" as const, state: "blocked" as const },
			reviews: 0,
			words: "Stuck",
			dot: "wait",
		},
		{ t: { state: "in_progress" as const }, reviews: 0, words: "Running", dot: "live" },
		{ t: { state: "done" as const }, reviews: 0, words: "Done", dot: "done" },
		{ t: { state: "accepted" as const }, reviews: 0, words: "Queued", dot: "" },
	])("$words", ({ t, reviews, words, dot }) => {
		expect(workState(task(t), reviews)).toEqual({ words, dot });
	});
});

describe("duration and clock", () => {
	test.each([
		[12 * 60_000, "12m"],
		[60 * 60_000, "1h"],
		[260 * 60_000, "4h 20m"],
	])("%i ms is %s", (ms, words) => {
		expect(duration(ms)).toBe(words);
	});

	test("a message today shows its time; an older one names its day", () => {
		const now = new Date(2026, 9, 21, 15, 0).getTime();
		expect(clock(new Date(2026, 9, 21, 8, 12).toISOString(), now)).toBe("08:12");
		expect(clock(new Date(2026, 9, 20, 8, 12).toISOString(), now)).toBe("yesterday 08:12");
		expect(clock(new Date(2026, 9, 1, 8, 12).toISOString(), now)).toBe("1 Oct 08:12");
	});
});

describe("titleFrom", () => {
	test.each([
		[
			"Can we answer refund questions from the help centre? @Maya Chen",
			["Maya Chen"],
			"Can we answer refund questions from the help centre?",
		],
		["@Builder can you take a look\nmore below", ["Builder"], "can you take a look"],
		["@Maya Chen @Builder", ["Maya Chen", "Builder"], "With Maya Chen, Builder"],
	])("%s", (text, names, title) => {
		expect(titleFrom(text, names)).toBe(title);
	});
});
