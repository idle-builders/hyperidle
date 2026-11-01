/** Where spoken words land in the message box, and the spaces around them. */
import { describe, expect, test } from "vitest";
import { putSpoken } from "./spoken";

describe("putSpoken", () => {
	test.each([
		{
			label: "into an empty box",
			before: "",
			said: "Ship it",
			after: "",
			text: "Ship it",
			caret: 7,
		},
		{
			label: "after a word, with a space between",
			before: "Hi",
			said: "ship it",
			after: "",
			text: "Hi ship it",
			caret: 10,
		},
		{
			label: "after a space, no second space",
			before: "Hi ",
			said: "ship it",
			after: "",
			text: "Hi ship it",
			caret: 10,
		},
		{
			label: "before a word, with a space between",
			before: "",
			said: "Ship it",
			after: "today",
			text: "Ship it today",
			caret: 7,
		},
		{
			label: "before punctuation, no space",
			before: "",
			said: "Ship it",
			after: ".",
			text: "Ship it.",
			caret: 7,
		},
		{
			label: "nothing said yet leaves the box as it was",
			before: "Hi",
			said: "",
			after: " there",
			text: "Hi there",
			caret: 2,
		},
	])("$label", ({ before, said, after, text, caret }) => {
		expect(putSpoken(before, said, after)).toEqual({ text, caret });
	});
});
