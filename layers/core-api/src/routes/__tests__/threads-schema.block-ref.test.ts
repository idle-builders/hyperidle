/**
 * T4 — Zod schema tests for block ref (AC-1, AC-2).
 *
 * RED phase: validates the updated inlineRefSchema that accepts both
 * entity refs (kind, id) and block refs (kind, blockId, hostKind, hostId).
 */

import { describe, expect, it } from "vitest";

// @lore T4: These imports will fail until the implementation exports the
// schemas from threads-schema.ts. That is expected — RED phase.
// biome-ignore lint/style/useImportType: runtime values needed for parse calls
import { blockRefSchema, entityRefSchema, inlineRefSchema } from "../threads-schema.js";

describe("T4 — entityRefSchema", () => {
	it("accepts a valid entity ref with kind knowledge_item", () => {
		const result = entityRefSchema.safeParse({ kind: "knowledge_item", id: "k-1" });
		expect(result.success).toBe(true);
	});

	it("accepts a valid entity ref with kind task", () => {
		const result = entityRefSchema.safeParse({ kind: "task", id: "t-42" });
		expect(result.success).toBe(true);
	});

	it("accepts all valid entity ref kinds", () => {
		for (const kind of ["knowledge_item", "task", "artifact", "message"]) {
			const result = entityRefSchema.safeParse({ kind, id: "some-id" });
			expect(result.success, `kind=${kind}`).toBe(true);
		}
	});

	it("rejects entity ref with kind 'block'", () => {
		const result = entityRefSchema.safeParse({ kind: "block", id: "b-1" });
		expect(result.success).toBe(false);
	});

	it("rejects entity ref missing id", () => {
		const result = entityRefSchema.safeParse({ kind: "task" });
		expect(result.success).toBe(false);
	});
});

describe("T4 — blockRefSchema", () => {
	it("accepts a valid block ref", () => {
		const result = blockRefSchema.safeParse({
			kind: "block",
			blockId: "blk:v1:abc123",
			hostKind: "task",
			hostId: "bet-456",
		});
		expect(result.success).toBe(true);
	});

	it("accepts block ref with knowledge_item hostKind", () => {
		const result = blockRefSchema.safeParse({
			kind: "block",
			blockId: "blk:v1:xyz",
			hostKind: "knowledge_item",
			hostId: "k-789",
		});
		expect(result.success).toBe(true);
	});

	it("rejects block ref with wrong kind", () => {
		const result = blockRefSchema.safeParse({
			kind: "task",
			blockId: "blk:v1:abc",
			hostKind: "task",
			hostId: "bet-1",
		});
		expect(result.success).toBe(false);
	});

	it("rejects block ref missing blockId", () => {
		const result = blockRefSchema.safeParse({
			kind: "block",
			hostKind: "task",
			hostId: "bet-1",
		});
		expect(result.success).toBe(false);
	});

	it("rejects block ref missing hostKind", () => {
		const result = blockRefSchema.safeParse({
			kind: "block",
			blockId: "blk:v1:abc",
			hostId: "bet-1",
		});
		expect(result.success).toBe(false);
	});

	it("rejects block ref missing hostId", () => {
		const result = blockRefSchema.safeParse({
			kind: "block",
			blockId: "blk:v1:abc",
			hostKind: "task",
		});
		expect(result.success).toBe(false);
	});

	it("rejects block ref with empty blockId", () => {
		const result = blockRefSchema.safeParse({
			kind: "block",
			blockId: "",
			hostKind: "task",
			hostId: "bet-1",
		});
		expect(result.success).toBe(false);
	});

	it("rejects block ref with empty hostId", () => {
		const result = blockRefSchema.safeParse({
			kind: "block",
			blockId: "blk:v1:abc",
			hostKind: "task",
			hostId: "",
		});
		expect(result.success).toBe(false);
	});

	it("rejects block ref with invalid hostKind", () => {
		const result = blockRefSchema.safeParse({
			kind: "block",
			blockId: "blk:v1:abc",
			hostKind: "invalid-kind",
			hostId: "some-id",
		});
		expect(result.success).toBe(false);
	});
});

describe("T4 — inlineRefSchema (discriminated union)", () => {
	it("accepts a valid entity ref", () => {
		const result = inlineRefSchema.safeParse({ kind: "task", id: "bet-999" });
		expect(result.success).toBe(true);
	});

	it("accepts a valid block ref", () => {
		const result = inlineRefSchema.safeParse({
			kind: "block",
			blockId: "blk:v1:abc",
			hostKind: "knowledge_item",
			hostId: "k-1",
		});
		expect(result.success).toBe(true);
	});

	it("rejects a block-shaped ref with wrong kind", () => {
		const result = inlineRefSchema.safeParse({
			kind: "task",
			blockId: "blk:v1:abc",
			hostKind: "task",
			hostId: "bet-1",
		});
		// "bet" kind requires id field (entity ref shape)
		expect(result.success).toBe(false);
	});

	it("rejects an unknown kind", () => {
		const result = inlineRefSchema.safeParse({ kind: "unknown-kind", id: "x" });
		expect(result.success).toBe(false);
	});

	it("entity ref still works after introducing block variant", () => {
		for (const kind of ["knowledge_item", "task", "artifact", "message"]) {
			const result = inlineRefSchema.safeParse({ kind, id: "some-id" });
			expect(result.success, `entity kind=${kind}`).toBe(true);
		}
	});
});
