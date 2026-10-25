/** A search hit's preview: the stretch of text around the first match, as plain words. */
import { describe, expect, test } from "vitest";
import { excerpt } from "../excerpt.js";

describe("excerpt", () => {
	test.each([
		["no match", "Nothing here to see", "trial", null],
		["short text whole, case kept", "Every Trial ends", "trial", "Every Trial ends"],
		[
			"Markdown marks and line breaks are dropped",
			"## Trials\n\n**Every** plan starts with a `trial`.",
			"plan",
			"Trials Every plan starts with a trial.",
		],
		[
			"a long text is cut at words around the match",
			`${"word ".repeat(30)}the trial ends here ${"more ".repeat(30)}`,
			"trial",
			"…word word word word word word word word word word word the trial ends here more more more more more more more more more more…",
		],
	])("%s", (_, text, query, expected) => {
		expect(excerpt(text, query)).toBe(expected);
	});
});
