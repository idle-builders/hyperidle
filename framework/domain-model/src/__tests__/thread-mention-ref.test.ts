import { describe, expect, it } from "vitest";
import { mentionRefSchema } from "../actions/thread.js";

describe("mentionRefSchema", () => {
	it("rejects a mention ref missing sourceText", () => {
		const result = mentionRefSchema.safeParse({
			kind: "mention",
			identityId: "u-1",
			displayName: "Bob",
		});
		expect(result.success).toBe(false);
	});

	it("accepts a mention ref with sourceText", () => {
		const result = mentionRefSchema.safeParse({
			kind: "mention",
			identityId: "u-1",
			displayName: "Bob",
			sourceText: "@Bob",
		});
		expect(result.success).toBe(true);
	});
});
