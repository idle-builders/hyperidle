/**
 * The text a resumed session opens with: what the person decided or answered,
 * in their own words, reaches the agent.
 */

import type { SessionResumeReply } from "@hyperidle/domain-model";
import { describe, expect, it } from "vitest";
import { buildVerdictMessage } from "../verdict-message.js";

describe("buildVerdictMessage — the person's reply reaches the resumed agent", () => {
	const cases: ReadonlyArray<{
		readonly name: string;
		readonly reply: SessionResumeReply;
		readonly says: readonly string[];
	}> = [
		{ name: "an approve says it was approved", reply: { decision: "approve" }, says: ["approved"] },
		{
			name: "an approve with a note carries the note",
			reply: { decision: "approve", note: "Ship it to staging first." },
			says: ["approved", "Ship it to staging first."],
		},
		{
			name: "a decline carries the reason",
			reply: { decision: "decline", note: "The weights belong in config." },
			says: ["declined", "The weights belong in config."],
		},
		{
			name: "an answer names the option picked",
			reply: { decision: "answer", answer: { option: "Yearly" } },
			says: ["answered", '"Yearly"'],
		},
		{
			name: "an answer in the person's own words carries those words",
			reply: { decision: "answer", answer: { text: "Monthly until March." } },
			says: ["answered", "Monthly until March."],
		},
	];

	it.each(cases)("$name", ({ reply, says }) => {
		const text = buildVerdictMessage(reply);
		for (const part of says) expect(text).toContain(part);
	});
});
