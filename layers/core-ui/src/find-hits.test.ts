/** Find lists hits in one run with where each lives; ask reads its thread for the answer and sources. */
import type { Message } from "@hyperidle/domain-model";
import { describe, expect, test } from "vitest";
import { answering, findRows, marked } from "./find-hits";

const NOW = Date.parse("2026-10-20T12:00:00.000Z");
const hit = (id: string, team: string | null) => ({
	id,
	title: id,
	snippet: "…",
	team,
	at: "2026-10-20T11:48:00.000Z",
});
const msg = (id: string, senderId: string, payload: unknown): Message => ({
	id,
	threadId: "t",
	senderId,
	type: "plain",
	payload,
	clientKey: `ck-${id}`,
	resolvedAt: null,
	deletedAt: null,
	redactedAt: null,
	createdAt: "2026-10-20T11:00:00.000Z",
});

describe("findRows", () => {
	test("Knowledge, then Conversations, then Work, each saying where it lives and where it opens", () => {
		const rows = findRows(
			{
				conversations: [hit("t1", null)],
				work: [hit("w1", "Growth")],
				documents: [hit("d1", "Product")],
				apps: [],
			},
			NOW,
		);
		expect(rows.map((r) => [r.where, r.to])).toEqual([
			["Knowledge · Product", "/knowledge/d1"],
			["Conversations · 12m", "/conversations/t1"],
			["Work · Growth", "/work/w1"],
		]);
	});

	test("an app opens beside the conversation or task it was made in, else as its own page", () => {
		const rows = findRows(
			{
				conversations: [],
				work: [],
				documents: [],
				apps: [
					{ ...hit("m1", null), kind: "message", on: { kind: "thread", id: "t1" } },
					{ ...hit("d2", "Support"), kind: "document", on: { kind: "thread", id: "t1" } },
					{ ...hit("d3", "Product"), kind: "document", on: { kind: "task", id: "w1" } },
					{ ...hit("d4", "Product"), kind: "document", on: null },
				],
			},
			NOW,
		);
		expect(rows.map((r) => [r.kind, r.where, r.to])).toEqual([
			["App", "Apps · 12m", "/conversations/t1?app=message%3At1%3Am1"],
			["App", "Apps · Support", "/conversations/t1?app=d2"],
			["App", "Apps · Product", "/work/w1?app=d3"],
			["App", "Apps · Product", "/knowledge/d4"],
		]);
	});
});

describe("marked", () => {
	test.each([
		["the match, in its own case", "Every Trial ends", "trial", ["Every ", "Trial", " ends"]],
		["no match marks nothing", "Every plan", "trial", ["Every plan", "", ""]],
	])("%s", (_, text, query, expected) => {
		expect(marked(text, query)).toEqual(expected);
	});
});

describe("answering", () => {
	test.each([
		[
			"your question is newest: still answering",
			[msg("q", "you", { text: "Trials?" })],
			true,
			[],
			"Trials?",
		],
		[
			"an answer came: its sources, each once",
			[
				msg("q", "you", { text: "Trials?" }),
				msg("a", "builder", {
					text: "14 days.",
					refs: [
						{ kind: "document", id: "d1" },
						{ kind: "task", id: "w1" },
						{ kind: "document", id: "d1" },
						{ kind: "mention", identityId: "u", displayName: "U", sourceText: "@U" },
					],
				}),
			],
			false,
			[
				{ kind: "document", id: "d1" },
				{ kind: "task", id: "w1" },
			],
			"14 days.",
		],
	])("%s", (_, messages, waiting, sources, last) => {
		const a = answering(messages, "you");
		expect(a.waiting).toBe(waiting);
		expect(a.sources).toEqual(sources);
		expect(a.said.at(-1)?.text).toBe(last);
	});
});
