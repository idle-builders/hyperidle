/** How a person or agent is drawn in an avatar, how a task reads in Work, and what waits while you focus. */
import type { DocumentRow, Task, ThreadListRow } from "@hyperidle/domain-model";
import { describe, expect, test } from "vitest";
import {
	conversationItems,
	countTasks,
	firstDoc,
	type Inbox,
	initials,
	knowledgeTree,
	newSince,
	workItems,
} from "./sidebar-lists";

test.each([
	["Maya Chen", "MC"],
	["Builder", "BU"],
	["Finn van Olsen", "FV"],
])("%s is %s", (name, letters) => {
	expect(initials(name)).toBe(letters);
});

const rootTask = (fields: Partial<Task>) =>
	({
		id: "t",
		parentTaskId: null,
		teamId: "team",
		ownerAgentId: "builder",
		title: "Trials",
		state: "in_progress",
		need: null,
		paused: null,
		updatedAt: "2026-10-21T09:00:00.000Z",
		...fields,
	}) as Task;

test.each([
	["stopped", "Stopped", "stopped"],
	["hold", "On hold", "run"],
	[null, "Needs input", "input"],
] as const)("a task paused %s reads %s in the Work list, marked %s", (paused, words, mark) => {
	const [item] = workItems([rootTask({ need: "input", paused })], new Map(), []);
	expect([item?.state, item?.mark]).toEqual([words, mark]);
});

test.each([
	["proposed", null, "queued"],
	["in_progress", null, "run"],
	["blocked", "stuck", "input"],
	["review", null, "run"],
	["done", null, "done"],
	["in_progress", "stuck", "input"],
	["in_progress", "review", "review"],
] as const)("a %s task that needs %s is marked %s in the Work list", (state, need, mark) => {
	expect(workItems([rootTask({ state, need })], new Map(), [])[0]?.mark).toBe(mark);
});

test.each([
	["input", "input"],
	["stuck", "input"],
	["review", "review"],
	[null, undefined],
] as const)("a conversation that needs %s is marked %s", (need, mark) => {
	const thread = {
		id: "th",
		computedTitle: "Trial pricing",
		lastActiveAt: "2026-10-21T09:00:00.000Z",
		lastSenderId: "maya",
		lastMessagePreview: "Which price?",
		mentionsYou: false,
		need,
	} as ThreadListRow;
	expect(conversationItems([thread], "finn", new Map(), [])[0]?.mark).toBe(mark);
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

test.each([
	["markdown", "active", undefined],
	["markdown", "proposed", "draft"],
	["html", "active", "app"],
	["html", "proposed", "app · draft"],
] as const)("a %s document that is %s says %s in the tree", (format, status, note) => {
	const doc = {
		id: "d",
		title: "Pricing",
		format,
		status,
		scopeId: "growth",
		parentKind: null,
		parentId: null,
		position: 0,
		icon: null,
	} as DocumentRow;
	const [space] = knowledgeTree(
		[doc],
		[{ id: "growth", name: "Growth" } as Parameters<typeof knowledgeTree>[1][number]],
	);
	expect(space?.children?.[0]?.note).toBe(note);
});

test("knowledge opens on the first document in the tree, skipping empty team spaces", () => {
	const tree = [
		{ id: "growth", title: "Growth", team: "growth", space: true, children: [] },
		{
			id: "support",
			title: "Support",
			team: "support",
			space: true,
			children: [{ id: "refunds", title: "Refunds", team: "support" }],
		},
	];
	expect(firstDoc(tree)).toBe("refunds");
	expect(
		firstDoc([{ id: "growth", title: "Growth", team: "growth", space: true }]),
	).toBeUndefined();
});

test.each([
	{ seen: "not read", readAt: null, words: "Mentioned you", mark: "mention" },
	{ seen: "read", readAt: "2026-10-21T10:00:00.000Z", words: "Maya:", mark: undefined },
])("a mention you have $seen reads $words in Conversations", ({ readAt, words, mark }) => {
	const thread = {
		id: "th",
		computedTitle: "Refund wording",
		lastActiveAt: "2026-10-21T09:00:00.000Z",
		lastSenderId: "maya",
		lastMessagePreview: "@Finn can you read it?",
		mentionsYou: true,
		need: null,
	} as ThreadListRow;
	const inbox: Inbox = [
		{
			change: {
				id: "c1",
				object: "thread",
				objectId: "th",
				kind: "message",
				actor: "maya",
				before: null,
				after: {},
				at: "2026-10-21T09:00:00.000Z",
			},
			seenAt: null,
			readAt,
		},
	];
	const names = new Map([["maya", "Maya"]]);
	const [item] = conversationItems([thread], "finn", names, inbox);
	expect([item?.state, item?.mark]).toEqual([words, mark]);
});
