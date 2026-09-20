/**
 * Mention resolution tests: `resolveMentionsInText` matches against a pool
 * of known names, not a fixed "one token after @" shape — so a name with a
 * space or apostrophe resolves by typing it plainly.
 */

import { describe, expect, it } from "vitest";
import { MAX_MENTIONS_PER_MESSAGE, resolveMentionsInText } from "../mention.js";

function pool(
	entries: ReadonlyArray<{ name: string; identityId: string }>,
): ReadonlyMap<string, { identityId: string; displayName: string }> {
	const map = new Map<string, { identityId: string; displayName: string }>();
	for (const { name, identityId } of entries) {
		map.set(name.toLowerCase(), { identityId, displayName: name });
	}
	return map;
}

describe("resolveMentionsInText", () => {
	it("resolves a multi-word name", () => {
		const result = resolveMentionsInText(
			"cc @Founder's Assistant please look",
			pool([{ name: "Founder's Assistant", identityId: "agent-1" }]),
		);
		expect(result).toHaveLength(1);
		expect(result[0]?.identityId).toBe("agent-1");
		expect(result[0]?.sourceText).toBe("@Founder's Assistant");
	});

	it("resolves a name with an apostrophe as a possessive (Nova's plan)", () => {
		const result = resolveMentionsInText(
			"@Nova's plan looks good",
			pool([{ name: "Nova", identityId: "agent-nova" }]),
		);
		expect(result).toHaveLength(1);
		expect(result[0]?.identityId).toBe("agent-nova");
		expect(result[0]?.sourceText).toBe("@Nova");
	});

	it("resolves a name followed by trailing punctuation", () => {
		const result = resolveMentionsInText(
			"cc @My Team Agent, thanks",
			pool([{ name: "My Team Agent", identityId: "agent-team" }]),
		);
		expect(result).toHaveLength(1);
		expect(result[0]?.sourceText).toBe("@My Team Agent");
	});

	it("does not match a prefix of a longer name (@Novak does not match Nova)", () => {
		const result = resolveMentionsInText(
			"hi @Novak",
			pool([{ name: "Nova", identityId: "agent-nova" }]),
		);
		expect(result).toHaveLength(0);
	});

	it("picks the longest matching pool name when one name is a prefix of another", () => {
		const result = resolveMentionsInText(
			"@My Team Agent hi",
			pool([
				{ name: "My Team", identityId: "agent-my-team" },
				{ name: "My Team Agent", identityId: "agent-my-team-agent" },
			]),
		);
		expect(result).toHaveLength(1);
		expect(result[0]?.identityId).toBe("agent-my-team-agent");
		expect(result[0]?.sourceText).toBe("@My Team Agent");
	});

	it("resolves case-insensitively", () => {
		const result = resolveMentionsInText(
			"@MY TEAM AGENT please look",
			pool([{ name: "My Team Agent", identityId: "agent-team" }]),
		);
		expect(result).toHaveLength(1);
		expect(result[0]?.identityId).toBe("agent-team");
		expect(result[0]?.sourceText).toBe("@MY TEAM AGENT");
	});

	it("does not treat the @ inside an email address as a mention", () => {
		const result = resolveMentionsInText(
			"contact a@nova.io for info",
			pool([{ name: "Nova", identityId: "agent-nova" }]),
		);
		expect(result).toHaveLength(0);
	});

	it("resolves two distinct mentions in one text", () => {
		const result = resolveMentionsInText(
			"@Alice and @Bob please review",
			pool([
				{ name: "Alice", identityId: "user-alice" },
				{ name: "Bob", identityId: "user-bob" },
			]),
		);
		expect(result).toHaveLength(2);
		const ids = result.map((r) => r.identityId);
		expect(ids).toContain("user-alice");
		expect(ids).toContain("user-bob");
	});

	it("leaves an unknown @name as plain text (drops it)", () => {
		const result = resolveMentionsInText(
			"@UnknownPerson please help",
			pool([{ name: "Alice", identityId: "user-alice" }]),
		);
		expect(result).toHaveLength(0);
	});

	it("deduplicates by identityId (same identity mentioned twice, different case)", () => {
		const result = resolveMentionsInText(
			"@Aria and @aria again",
			pool([{ name: "Aria", identityId: "agent-aria" }]),
		);
		expect(result).toHaveLength(1);
		expect(result[0]?.identityId).toBe("agent-aria");
	});

	it("respects MAX_MENTIONS_PER_MESSAGE cap", () => {
		const entries = Array.from({ length: 25 }, (_, i) => ({
			name: `User${i}`,
			identityId: `user-${i}`,
		}));
		const text = entries.map((e) => `@${e.name}`).join(" ");
		const result = resolveMentionsInText(text, pool(entries));
		expect(result.length).toBeLessThanOrEqual(MAX_MENTIONS_PER_MESSAGE);
	});

	it("returns empty array for empty string", () => {
		expect(resolveMentionsInText("", pool([{ name: "Alice", identityId: "user-alice" }]))).toEqual(
			[],
		);
	});

	it("returns empty array when nameMap is empty", () => {
		expect(resolveMentionsInText("@Alice", new Map())).toEqual([]);
	});
});
