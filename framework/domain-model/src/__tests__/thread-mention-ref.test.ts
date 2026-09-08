/**
 * AE5 — MentionRef type narrowing tests (Task 1 acceptance).
 *
 * AC: InlineRefKind includes "mention". InlineRef narrows to MentionRef
 * when kind === "mention". TypeScript compiles. Existing tests pass.
 */

import { describe, expect, it } from "vitest";
import type { InlineRef, InlineRefKind, MentionRef } from "../thread.js";

describe("AE5 — MentionRef in InlineRef union", () => {
	it("InlineRefKind includes 'mention' as a valid literal", () => {
		// Type-level proof: assigning "mention" to InlineRefKind must compile.
		const kind: InlineRefKind = "mention";
		expect(kind).toBe("mention");
	});

	it("MentionRef has the required shape", () => {
		const ref: MentionRef = {
			kind: "mention",
			identityId: "agent-aria-01",
			displayName: "Aria",
			sourceText: "@Aria",
		};
		expect(ref.kind).toBe("mention");
		expect(ref.identityId).toBe("agent-aria-01");
		expect(ref.displayName).toBe("Aria");
		expect(ref.sourceText).toBe("@Aria");
	});

	it("MentionRef is assignable to InlineRef", () => {
		const mentionRef: MentionRef = {
			kind: "mention",
			identityId: "u-123",
			displayName: "Bob",
			sourceText: "@Bob",
		};
		const ref: InlineRef = mentionRef;
		expect(ref.kind).toBe("mention");
	});

	it("narrowing on kind === 'mention' gives MentionRef shape", () => {
		const refs: InlineRef[] = [
			{ kind: "knowledge_item", id: "k-1" },
			{ kind: "mention", identityId: "u-abc", displayName: "Alice", sourceText: "@Alice" },
			{ kind: "task", id: "t-1" },
		];

		const mentionRefs = refs.filter((r): r is MentionRef => r.kind === "mention");
		expect(mentionRefs).toHaveLength(1);
		expect(mentionRefs[0]?.identityId).toBe("u-abc");
		expect(mentionRefs[0]?.displayName).toBe("Alice");
		expect(mentionRefs[0]?.sourceText).toBe("@Alice");
	});

	it("non-mention refs remain unaffected after union widening", () => {
		const refs: InlineRef[] = [
			{ kind: "task", id: "t-1" },
			{ kind: "task", id: "b-1" },
			{ kind: "artifact", id: "a-1" },
			{ kind: "message", id: "m-1" },
			{ kind: "knowledge_item", id: "k-1" },
		];

		for (const ref of refs) {
			expect(ref.kind).not.toBe("mention");
		}
	});

	it("MentionRef sourceText is the original @name token as written", () => {
		// Concept hard rule: sourceText preserves the original token for round-trip fidelity.
		const ref: MentionRef = {
			kind: "mention",
			identityId: "agent-x",
			displayName: "Xenon",
			sourceText: "@xenon", // lowercase as typed, even though displayName may differ in casing
		};
		expect(ref.sourceText).toBe("@xenon");
		expect(ref.displayName).toBe("Xenon");
	});
});
