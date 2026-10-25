/** How the document page reads its comments out of the thread and finds their text again. */
import type { Message, Task } from "@hyperidle/domain-model";
import { describe, expect, it } from "vitest";
import {
	changeAt,
	commentsOf,
	type DocComment,
	disciplinesOf,
	locate,
	segmentsOf,
	tasksIn,
	toMd,
	toPm,
} from "./doc-page";

const at = (n: number) => `2026-09-01T10:${String(n).padStart(2, "0")}:00.000Z`;
const BODY = "Trials run 14 days.\n\n- Most cancellations happen on day 13.";
const LINE = "Most cancellations happen on day 13.";
const range = (text: string, body = BODY) => ({
	kind: "range" as const,
	start: body.indexOf(text),
	end: body.indexOf(text) + text.length,
});

function message(id: string, payload: Record<string, unknown>, n: number, by = "finn"): Message {
	return {
		id,
		threadId: "t",
		senderId: by,
		type: "plain",
		payload,
		clientKey: id,
		resolvedAt: null,
		deletedAt: null,
		redactedAt: null,
		createdAt: at(n),
	};
}
const on = (pin: string, text: string, extra: Record<string, unknown> = {}) => ({
	text: pin,
	anchor: { id: pin, part: "doc", label: text, spot: range(text) },
	...extra,
});

describe("the comments on a document", () => {
	it("are the messages pinned to its text, one comment per pin, newest pin deciding what it covers", () => {
		const messages = [
			message("m1", on("c1", LINE), 1),
			message(
				"m2",
				{ text: "about a review", anchor: { id: "r", part: "p", label: "x", review: "r1" } },
				2,
			),
			message("m3", on("c2", "Trials run 14 days."), 3),
			message("m4", { ...on("c1", "day 13"), text: "narrower" }, 4, "growth"),
			message("m5", { text: "said in the conversation, on nothing" }, 5),
			{ ...message("m6", on("c3", LINE), 6), deletedAt: at(7) },
			message("m7", { ...on("c4", LINE), anchor: { id: "c4", part: "other-doc", label: LINE } }, 8),
		];

		const comments = commentsOf(messages, "doc");

		expect(comments.map((c) => [c.id, c.messages.map((m) => m.id), c.anchor.label])).toEqual([
			["c1", ["m1", "m4"], "day 13"],
			["c2", ["m3"], "Trials run 14 days."],
		]);
	});

	it("is resolved when its first message is", () => {
		const [comment] = commentsOf(
			[{ ...message("m1", on("c1", LINE), 1), resolvedAt: at(2) }],
			"doc",
		);
		expect(comment?.resolved).toBe(true);
	});
});

describe("finding a comment's text again", () => {
	const comment = (text: string, extra: Partial<DocComment> = {}): DocComment => {
		const m = message("m1", on("c1", text), 1);
		return {
			id: "c1",
			messages: [m],
			first: m,
			anchor: on("c1", text).anchor,
			resolved: false,
			...extra,
		};
	};

	it.each([
		["where it was", BODY, LINE],
		["after text was written above it", `A new first line.\n\n${BODY}`, LINE],
	])("finds it %s", (_, body, text) => {
		expect(locate(body, comment(LINE))).toEqual({
			start: body.indexOf(text),
			end: body.indexOf(text) + text.length,
		});
	});

	it("covers the new text once a change to it was applied", () => {
		const to = "Most cancellations happen on day 13, and 1 in 5 decide on days 11–14.";
		const applied = message(
			"m2",
			on("c1", LINE, {
				change: { from: LINE, to, settled: { state: "applied", by: "x", at: at(3) } },
			}),
			2,
		);
		const body = BODY.replace(LINE, to);
		expect(locate(body, comment(LINE, { messages: [applied] }))).toEqual({
			start: body.indexOf(to),
			end: body.indexOf(to) + to.length,
		});
	});

	it("finds nothing when its text is gone", () => {
		expect(locate("Something else entirely.", comment(LINE))).toBeNull();
	});
});

describe("applying a proposed change", () => {
	const where = { start: BODY.indexOf(LINE), end: BODY.indexOf(LINE) + LINE.length };
	it("puts the new text where the old was", () => {
		expect(changeAt(BODY, where, { from: LINE, to: "Day 13." })).toBe(
			"Trials run 14 days.\n\n- Day 13.",
		);
	});
	it("refuses when the text there changed since it was proposed", () => {
		expect(changeAt(BODY, where, { from: "Most people stay.", to: "Day 13." })).toBeNull();
	});
});

describe("between the stored text and the editor's positions", () => {
	// "Intro **bold** end\n\n- item": the editor holds the words without the marks.
	const md = "Intro **bold** end\n\n- item";
	const segs = segmentsOf(
		[
			{ pos: 1, text: "Intro " },
			{ pos: 7, text: "bold" },
			{ pos: 11, text: " end" },
			{ pos: 19, text: "item" },
		],
		md,
	);

	it.each([
		["a character inside a word", md.indexOf("old"), "start", 8],
		["the start of a mark's syntax snaps forward", md.indexOf("**bold"), "start", 7],
		["the end of a mark's syntax snaps back", md.indexOf("** end") + 1, "end", 11],
		["a list's marker snaps to its text", md.indexOf("- item"), "start", 19],
	] as const)("%s", (_, offset, side, pos) => {
		expect(toPm(segs, offset, side)).toBe(pos);
	});

	it("reads an editor position back as the same place in the text", () => {
		expect(toMd(segs, 9, "start")).toBe(md.indexOf("ld"));
		expect(toMd(segs, 23, "end")).toBe(md.length);
	});
});

describe("the task a comment handed off", () => {
	const task = (id: string, owner: string, n: number) =>
		({ id, ownerAgentId: owner, createdAt: at(n), parentTaskId: null }) as Task;
	const mention = (id: string) => ({
		refs: [{ kind: "mention", identityId: id, displayName: id, sourceText: `@${id}` }],
	});
	const c = (id: string, ...messages: Message[]): DocComment => ({
		id,
		messages,
		first: messages[0] as Message,
		anchor: on(id, LINE).anchor,
		resolved: false,
	});

	it("sits in the comment that last named its owner before it was made, else the last one spoken in", () => {
		const comments = [
			c("c1", message("m1", on("c1", LINE, mention("builder")), 1)),
			c("c2", message("m2", on("c2", LINE), 2)),
			c("c3", message("m3", on("c3", LINE, mention("builder")), 5)),
		];

		const placed = tasksIn(comments, [
			task("t1", "builder", 3),
			task("t2", "growth", 4),
			task("t3", "builder", 6),
		]);

		expect([...placed].map(([id, ts]) => [id, ts.map((t) => t.id)])).toEqual([
			["c1", ["t1"]],
			["c2", ["t2"]],
			["c3", ["t3"]],
		]);
	});
});

describe("the disciplines in use", () => {
	it("are everyone's and every document's, once each, in order", () => {
		expect(
			disciplinesOf(
				[{ discipline: "Growth" }, { discipline: null }, { discipline: "engineering" }],
				[{ discipline: "growth" }, { discipline: "Support" }],
			),
		).toEqual(["engineering", "Growth", "Support"]);
	});
});
