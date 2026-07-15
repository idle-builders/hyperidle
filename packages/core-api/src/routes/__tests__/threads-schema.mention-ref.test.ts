/**
 * AE5 — Zod schema tests for MentionRef (Task 3 acceptance).
 *
 * AC: inlineRefSchema accepts { kind: "mention", identityId: "...", displayName: "..." }.
 * Rejects malformed mention refs. Existing entity and block ref validation unchanged.
 */

import { describe, expect, it } from "vitest";
import { inlineRefSchema, mentionRefSchema } from "../threads-schema.js";

describe("AE5 — mentionRefSchema", () => {
	it("accepts a valid mention ref", () => {
		const result = mentionRefSchema.safeParse({
			kind: "mention",
			identityId: "agent-aria-01",
			displayName: "Aria",
		});
		expect(result.success).toBe(true);
	});

	it("rejects mention ref with wrong kind", () => {
		const result = mentionRefSchema.safeParse({
			kind: "task",
			identityId: "u-1",
			displayName: "Alice",
		});
		expect(result.success).toBe(false);
	});

	it("rejects mention ref with empty identityId", () => {
		const result = mentionRefSchema.safeParse({
			kind: "mention",
			identityId: "",
			displayName: "Alice",
		});
		expect(result.success).toBe(false);
	});

	it("rejects mention ref with empty displayName", () => {
		const result = mentionRefSchema.safeParse({
			kind: "mention",
			identityId: "u-1",
			displayName: "",
		});
		expect(result.success).toBe(false);
	});

	it("rejects mention ref missing identityId", () => {
		const result = mentionRefSchema.safeParse({
			kind: "mention",
			displayName: "Alice",
		});
		expect(result.success).toBe(false);
	});

	it("rejects mention ref missing displayName", () => {
		const result = mentionRefSchema.safeParse({
			kind: "mention",
			identityId: "u-1",
		});
		expect(result.success).toBe(false);
	});
});

describe("AE5 — inlineRefSchema discriminated union (with mention)", () => {
	it("accepts a valid mention ref via the union", () => {
		const result = inlineRefSchema.safeParse({
			kind: "mention",
			identityId: "agent-aria-01",
			displayName: "Aria",
		});
		expect(result.success).toBe(true);
	});

	it("existing entity refs still accepted after widening", () => {
		for (const kind of ["knowledge_item", "task", "artifact", "bet", "message"]) {
			const result = inlineRefSchema.safeParse({ kind, id: "some-id" });
			expect(result.success, `entity kind=${kind}`).toBe(true);
		}
	});

	it("existing block refs still accepted after widening", () => {
		const result = inlineRefSchema.safeParse({
			kind: "block",
			blockId: "blk:v1:abc",
			hostKind: "bet",
			hostId: "bet-1",
		});
		expect(result.success).toBe(true);
	});

	it("rejects unknown kind in the union", () => {
		const result = inlineRefSchema.safeParse({
			kind: "unknown-kind",
			id: "x",
		});
		expect(result.success).toBe(false);
	});

	it("rejects mention ref with empty identityId via union", () => {
		const result = inlineRefSchema.safeParse({
			kind: "mention",
			identityId: "",
			displayName: "Alice",
		});
		expect(result.success).toBe(false);
	});
});
