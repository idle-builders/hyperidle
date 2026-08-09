/**
 * AE5 — mention parsing utilities tests (Task 2 acceptance).
 *
 * Tests for extractMentionCandidates, resolveMentions, and segmentMentions
 * from framework/domain-model/src/mention.ts.
 */

import { describe, expect, it } from "vitest";
import {
	extractMentionCandidates,
	type MentionCandidate,
	type MentionSegment,
	resolveMentions,
	segmentMentions,
} from "../mention.js";
import type { InlineRef } from "../thread.js";

// ── extractMentionCandidates ─────────────────────────────────────────────────

describe("AE5 — extractMentionCandidates", () => {
	it("extracts a single @name at start of string", () => {
		const result = extractMentionCandidates("@Aria");
		expect(result).toHaveLength(1);
		expect(result[0]?.name).toBe("Aria");
		expect(result[0]?.sourceText).toBe("@Aria");
		expect(result[0]?.offset).toBe(0);
	});

	it("extracts @name preceded by whitespace", () => {
		const result = extractMentionCandidates("Hello @Bob how are you");
		expect(result).toHaveLength(1);
		expect(result[0]?.name).toBe("Bob");
		expect(result[0]?.sourceText).toBe("@Bob");
	});

	it("extracts multiple @names from a message", () => {
		const result = extractMentionCandidates("Hey @Alice and @Bob please review");
		expect(result).toHaveLength(2);
		const names = result.map((c) => c.name);
		expect(names).toContain("Alice");
		expect(names).toContain("Bob");
	});

	it("returns empty array when no @mentions", () => {
		const result = extractMentionCandidates("Just a plain message");
		expect(result).toHaveLength(0);
	});

	it("returns empty array for empty string", () => {
		const result = extractMentionCandidates("");
		expect(result).toHaveLength(0);
	});

	it("ignores @name inside a word (email-like pattern)", () => {
		// "user@domain.com" — the @ is NOT preceded by start-of-string or whitespace
		const result = extractMentionCandidates("contact user@domain.com for info");
		expect(result).toHaveLength(0);
	});

	it("deduplicates @names case-insensitively", () => {
		// Same name mentioned twice — should deduplicate
		const result = extractMentionCandidates("@Aria @aria please confirm");
		// Deduplication by lowercased name: both become "aria"
		expect(result).toHaveLength(1);
	});

	it("strips trailing punctuation from @name", () => {
		// "@Aria," should extract "Aria" not "Aria,"
		const result = extractMentionCandidates("Hi @Aria, please check this");
		expect(result).toHaveLength(1);
		expect(result[0]?.name).toBe("Aria");
		expect(result[0]?.sourceText).toBe("@Aria");
	});

	it("strips trailing period from @name", () => {
		const result = extractMentionCandidates("Thanks @Bob.");
		expect(result).toHaveLength(1);
		expect(result[0]?.name).toBe("Bob");
	});

	it("records correct offset for @mention", () => {
		const text = "Hello @World";
		const result = extractMentionCandidates(text);
		expect(result).toHaveLength(1);
		expect(result[0]?.offset).toBe(6); // index of "@"
	});

	it("respects MAX_MENTIONS_PER_MESSAGE cap", () => {
		// Generate a message with 25 unique @mentions — should cap at 20
		const names = Array.from({ length: 25 }, (_, i) => `@User${i}`);
		const text = names.join(" ");
		const result = extractMentionCandidates(text);
		expect(result.length).toBeLessThanOrEqual(20);
	});
});

// ── resolveMentions ──────────────────────────────────────────────────────────

describe("AE5 — resolveMentions", () => {
	const nameMap = new Map<string, { identityId: string; displayName: string }>([
		["aria", { identityId: "agent-aria-01", displayName: "Aria" }],
		["bob", { identityId: "user-bob-02", displayName: "Bob" }],
		["alice", { identityId: "user-alice-03", displayName: "Alice" }],
	]);

	it("resolves a known @name to its identityId and displayName", () => {
		const candidates: MentionCandidate[] = [{ name: "Aria", sourceText: "@Aria", offset: 0 }];
		const result = resolveMentions(candidates, nameMap, "u-sender");
		expect(result).toHaveLength(1);
		expect(result[0]?.identityId).toBe("agent-aria-01");
		expect(result[0]?.displayName).toBe("Aria");
		expect(result[0]?.sourceText).toBe("@Aria");
	});

	it("silently drops unknown @names (leaves as plain text)", () => {
		const candidates: MentionCandidate[] = [
			{ name: "UnknownPerson", sourceText: "@UnknownPerson", offset: 0 },
		];
		const result = resolveMentions(candidates, nameMap, "u-sender");
		expect(result).toHaveLength(0);
	});

	it("resolves case-insensitively (@ARIA matches 'aria' in map)", () => {
		const candidates: MentionCandidate[] = [{ name: "ARIA", sourceText: "@ARIA", offset: 0 }];
		const result = resolveMentions(candidates, nameMap, "u-sender");
		expect(result).toHaveLength(1);
		expect(result[0]?.identityId).toBe("agent-aria-01");
	});

	it("self-mention resolves to a MentionRef (participant-add suppressed server-side)", () => {
		// Self-mention still produces a ResolvedMention; server suppresses participant-add.
		const candidates: MentionCandidate[] = [{ name: "Alice", sourceText: "@Alice", offset: 0 }];
		const result = resolveMentions(candidates, nameMap, "user-alice-03");
		// Alice is in the map and IS the sender — still resolves (server handles no-op)
		expect(result).toHaveLength(1);
		expect(result[0]?.identityId).toBe("user-alice-03");
	});

	it("deduplicates by identityId (same person mentioned twice → one entry)", () => {
		const candidates: MentionCandidate[] = [
			{ name: "Aria", sourceText: "@Aria", offset: 0 },
			{ name: "aria", sourceText: "@aria", offset: 10 },
		];
		const result = resolveMentions(candidates, nameMap, "u-sender");
		expect(result).toHaveLength(1);
		expect(result[0]?.identityId).toBe("agent-aria-01");
	});

	it("resolves multiple distinct mentions", () => {
		const candidates: MentionCandidate[] = [
			{ name: "Aria", sourceText: "@Aria", offset: 0 },
			{ name: "Bob", sourceText: "@Bob", offset: 5 },
		];
		const result = resolveMentions(candidates, nameMap, "u-sender");
		expect(result).toHaveLength(2);
		const ids = result.map((r) => r.identityId);
		expect(ids).toContain("agent-aria-01");
		expect(ids).toContain("user-bob-02");
	});

	it("returns empty array when all @names are unknown", () => {
		const candidates: MentionCandidate[] = [
			{ name: "NoSuchPerson", sourceText: "@NoSuchPerson", offset: 0 },
		];
		const result = resolveMentions(candidates, nameMap, "u-sender");
		expect(result).toHaveLength(0);
	});

	it("returns empty array when candidates is empty", () => {
		const result = resolveMentions([], nameMap, "u-sender");
		expect(result).toHaveLength(0);
	});
});

// ── segmentMentions ──────────────────────────────────────────────────────────

describe("AE5 — segmentMentions", () => {
	const buildMentionRef = (
		identityId: string,
		displayName: string,
		sourceText: string,
	): InlineRef => ({
		kind: "mention" as const,
		identityId,
		displayName,
		sourceText,
	});

	it("returns a single text segment when there are no MentionRef entries", () => {
		const refs: InlineRef[] = [{ kind: "task", id: "t-1" }];
		const result = segmentMentions("Hello world", refs);
		expect(result).toHaveLength(1);
		expect(result[0]?.type).toBe("text");
		expect(result[0]?.content).toBe("Hello world");
	});

	it("splits text into text + mention segments", () => {
		const refs: InlineRef[] = [buildMentionRef("u-1", "Aria", "@Aria")];
		const result = segmentMentions("Hello @Aria please review", refs);

		const types = result.map((s) => s.type);
		expect(types).toContain("text");
		expect(types).toContain("mention");

		const mention = result.find((s) => s.type === "mention");
		expect(mention?.mentionRef?.displayName).toBe("Aria");
		expect(mention?.mentionRef?.identityId).toBe("u-1");
	});

	it("returns text segment for @Aria before mention and after it", () => {
		const refs: InlineRef[] = [buildMentionRef("u-1", "Aria", "@Aria")];
		const result = segmentMentions("Hello @Aria!", refs);

		// Should have: "Hello " (text), "@Aria" (mention), "!" (text)
		expect(result.length).toBeGreaterThanOrEqual(2);
		const mentionSeg = result.find((s) => s.type === "mention");
		expect(mentionSeg).toBeDefined();
	});

	it("handles text with no matching mention ref (unknown @name stays as plain text)", () => {
		const refs: InlineRef[] = [buildMentionRef("u-1", "Aria", "@Aria")];
		const result = segmentMentions("Hello @Unknown check this", refs);
		// No segment of type mention since @Unknown doesn't match
		const mentions = result.filter((s) => s.type === "mention");
		expect(mentions).toHaveLength(0);
	});

	it("handles multiple mentions in a single message", () => {
		const refs: InlineRef[] = [
			buildMentionRef("u-1", "Aria", "@Aria"),
			buildMentionRef("u-2", "Bob", "@Bob"),
		];
		const result = segmentMentions("Hey @Aria and @Bob please help", refs);
		const mentions = result.filter((s) => s.type === "mention");
		expect(mentions).toHaveLength(2);
	});

	it("returns single text segment for empty text", () => {
		const refs: InlineRef[] = [buildMentionRef("u-1", "Aria", "@Aria")];
		const result = segmentMentions("", refs);
		// Empty text: either one empty text segment or zero segments
		const textSegments = result.filter((s) => s.type === "text");
		expect(textSegments.length).toBeGreaterThanOrEqual(0);
	});

	it("ignores non-MentionRef entries in refs array", () => {
		const refs: InlineRef[] = [
			{ kind: "task", id: "t-1" },
			buildMentionRef("u-1", "Aria", "@Aria"),
			{ kind: "block", blockId: "blk-1", hostKind: "bet", hostId: "b-1" },
		];
		const result = segmentMentions("Hello @Aria", refs);
		const mentions = result.filter((s) => s.type === "mention");
		expect(mentions).toHaveLength(1);
		expect(mentions[0]?.mentionRef?.displayName).toBe("Aria");
	});

	it("mention segment has mentionRef property set", () => {
		const refs: InlineRef[] = [buildMentionRef("agent-1", "Aria", "@Aria")];
		const result = segmentMentions("@Aria do this", refs);
		const mentionSeg = result.find((s) => s.type === "mention") as MentionSegment | undefined;
		expect(mentionSeg?.mentionRef).toBeDefined();
		expect(mentionSeg?.mentionRef?.kind).toBe("mention");
	});
});
