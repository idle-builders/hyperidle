/**
 * What a review may hold: parts of six kinds, the agent's flags, and pins that point into a part
 * the way that kind of part is pointed at.
 */

import { describe, expect, it } from "vitest";
import {
	documentAnchorProblems,
	type Pin,
	pinProblems,
	type ReviewPart,
	reviewInvariants,
} from "../review.js";

const PARTS: readonly ReviewPart[] = [
	{
		id: "page",
		kind: "preview",
		label: "Live preview",
		title: "Trial-end page",
		url: "https://example.test/trial",
	},
	{
		id: "fix",
		kind: "code",
		label: "Code",
		title: "billing/proration.ts",
		files: [
			{
				path: "billing/proration.ts",
				hunks: [
					{
						lines: [
							{ op: "same", n: 214, text: "const a = 1;" },
							{ op: "del", n: 215, text: "const b = 2;" },
							{ op: "add", n: 215, text: "const b = 3;" },
						],
					},
				],
			},
		],
	},
	{
		id: "shot",
		kind: "image",
		label: "Design",
		title: "Header",
		url: "https://example.test/a.png",
	},
	{
		id: "tickets",
		kind: "numbers",
		label: "Numbers",
		title: "Tickets",
		figures: [{ label: "Refund requests", value: "4", change: "+1", good: false }],
	},
	{
		id: "mail",
		kind: "text",
		label: "Email",
		title: "Warning",
		subject: "Your trial ends in 3 days",
		body: "Hi Sam, your trial ends.",
	},
	{
		id: "replies",
		kind: "items",
		label: "Replies",
		title: "Three replies",
		items: [{ id: "zd-1", title: "To Priya", body: "You were charged on 2 September." }],
	},
];

const pin = (rest: Partial<Pin> & Pick<Pin, "part">): Pin => ({ id: "p", label: "here", ...rest });

describe("a pin points into its part the way that part is pointed at", () => {
	it.each<[string, Pin]>([
		["the whole part", pin({ part: "page" })],
		["an element on a preview", pin({ part: "page", spot: { kind: "element", selector: "h1" } })],
		[
			"a line of code",
			pin({ part: "fix", spot: { kind: "line", file: "billing/proration.ts", line: 215 } }),
		],
		[
			"a removed line, by its old number",
			pin({
				part: "fix",
				spot: { kind: "line", file: "billing/proration.ts", line: 215, removed: true },
			}),
		],
		[
			"a region of an image",
			pin({ part: "shot", spot: { kind: "region", x: 0.1, y: 0.2, w: 0.5, h: 0.5 } }),
		],
		["a figure", pin({ part: "tickets", spot: { kind: "figure", label: "Refund requests" } })],
		["a piece of text", pin({ part: "mail", spot: { kind: "range", start: 0, end: 7 } })],
		["one of the items", pin({ part: "replies", spot: { kind: "item", item: "zd-1" } })],
	])("%s is fine", (_, p) => {
		expect(pinProblems(p, PARTS)).toEqual([]);
	});

	it.each<[string, Pin, string]>([
		["a part the review does not have", pin({ part: "nope" }), "pin_part_unknown"],
		[
			"a line pin on a preview",
			pin({ part: "page", spot: { kind: "line", file: "a.ts", line: 1 } }),
			"pin_wrong_kind",
		],
		[
			"a line the file does not show",
			pin({ part: "fix", spot: { kind: "line", file: "billing/proration.ts", line: 999 } }),
			"pin_line_missing",
		],
		[
			"a context line pinned as removed",
			pin({
				part: "fix",
				spot: { kind: "line", file: "billing/proration.ts", line: 214, removed: true },
			}),
			"pin_line_missing",
		],
		[
			"a file the part does not have",
			pin({ part: "fix", spot: { kind: "line", file: "other.ts", line: 214 } }),
			"pin_line_missing",
		],
		[
			"a region past the image's edge",
			pin({ part: "shot", spot: { kind: "region", x: 0.8, y: 0, w: 0.5, h: 0.1 } }),
			"pin_region_outside",
		],
		[
			"an empty region",
			pin({ part: "shot", spot: { kind: "region", x: 0.1, y: 0.1, w: 0, h: 0.1 } }),
			"pin_region_outside",
		],
		[
			"a figure the part does not show",
			pin({ part: "tickets", spot: { kind: "figure", label: "Churn" } }),
			"pin_figure_missing",
		],
		[
			"a range past the end of the text",
			pin({ part: "mail", spot: { kind: "range", start: 5, end: 500 } }),
			"pin_range_outside",
		],
		[
			"a range that ends before it starts",
			pin({ part: "mail", spot: { kind: "range", start: 5, end: 5 } }),
			"pin_range_outside",
		],
		[
			"an item the part does not have",
			pin({ part: "replies", spot: { kind: "item", item: "zd-9" } }),
			"pin_item_missing",
		],
	])("%s is refused", (_, p, code) => {
		expect(pinProblems(p, PARTS).map((x) => x.code)).toEqual([code]);
	});
});

describe("a review's parts and flags", () => {
	const flag = { id: "a", part: "fix", label: "proration.ts:215", says: "Rounding changed." };

	it("a review of parts with flags that point into them is fine", () => {
		expect(reviewInvariants({ parts: [...PARTS], flags: [flag] })).toEqual([]);
	});

	it.each<[string, Parameters<typeof reviewInvariants>[0], string]>([
		[
			"two parts with one id",
			{ parts: [PARTS[0], { ...PARTS[2], id: "page" }] as ReviewPart[] },
			"part_id_duplicate",
		],
		[
			"a preview that is not a web page",
			{ parts: [{ ...PARTS[0], url: "javascript:alert(1)" }] as ReviewPart[] },
			"part_url_unsupported",
		],
		[
			"an image that is not a picture",
			{ parts: [{ ...PARTS[2], url: "ftp://example.test/a.png" }] as ReviewPart[] },
			"part_url_unsupported",
		],
		[
			"two figures with one label",
			{
				parts: [
					{
						...PARTS[3],
						figures: [
							{ label: "Tickets", value: "1" },
							{ label: "Tickets", value: "2" },
						],
					},
				] as ReviewPart[],
			},
			"figure_label_duplicate",
		],
		[
			"two items with one id",
			{
				parts: [
					{
						...PARTS[5],
						items: [
							{ id: "x", title: "One", body: "a" },
							{ id: "x", title: "Two", body: "b" },
						],
					},
				] as ReviewPart[],
			},
			"item_id_duplicate",
		],
		[
			"one file shown twice",
			{
				parts: [
					{
						id: "c",
						kind: "code",
						label: "Code",
						title: "Two",
						files: [
							{ path: "a.ts", hunks: [{ lines: [{ op: "add", n: 1, text: "x" }] }] },
							{ path: "a.ts", hunks: [{ lines: [{ op: "add", n: 2, text: "y" }] }] },
						],
					},
				],
			},
			"code_file_duplicate",
		],
		["two flags with one id", { parts: [...PARTS], flags: [flag, flag] }, "flag_id_duplicate"],
		[
			"a flag on a part the review does not have",
			{ parts: [...PARTS], flags: [{ ...flag, part: "nope" }] },
			"pin_part_unknown",
		],
		[
			"what changed, with no earlier round",
			{ parts: [...PARTS], changed: ["New: the email"] },
			"changed_without_previous",
		],
	])("%s is refused", (_, review, code) => {
		expect(reviewInvariants(review).map((x) => x.code)).toEqual([code]);
	});

	it("what changed is fine when the review follows an earlier round", () => {
		expect(
			reviewInvariants({ parts: [...PARTS], changed: ["New: the email"], previousReviewId: "r1" }),
		).toEqual([]);
	});
});

describe("a comment on a document points at a stretch of its text", () => {
	const doc = { id: "doc-1", body: "Most cancellations happen on day 13." };
	const pin = { id: "c1", part: "doc-1", label: "day 13" };
	it.each([
		["inside the text", { ...pin, spot: { kind: "range", start: 29, end: 35 } }, []],
		[
			"on another document",
			{ ...pin, part: "doc-2", spot: { kind: "range", start: 0, end: 4 } },
			["anchor_part_not_document"],
		],
		["with no stretch of text", pin, ["anchor_needs_range"]],
		[
			"at something that is not text",
			{ ...pin, spot: { kind: "figure", label: "x" } },
			["anchor_needs_range"],
		],
		[
			"past the end",
			{ ...pin, spot: { kind: "range", start: 29, end: 99 } },
			["pin_range_outside"],
		],
	] as const)("%s", (_, anchor, codes) => {
		expect(documentAnchorProblems(anchor, doc).map((p) => p.code)).toEqual(codes);
	});
});
