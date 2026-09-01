/**
 * T4 — InlineRef discriminated union tests (AC-1, AC-2).
 *
 * RED phase: tests verify that the InlineRef type correctly represents
 * both entity refs and block refs as a discriminated union.
 *
 * Note: TypeScript compile-time narrowing is tested via type assertions
 * and runtime guards. The key runtime behavior is that block refs are
 * distinguishable from entity refs via the `kind` discriminant.
 */

import { describe, expect, it } from "vitest";
// These imports will FAIL until the green phase creates the union types.
// That is expected — RED phase.
import type { BlockRef, EntityRef, InlineRef, InlineRefKind } from "../thread.js";

describe("T4 — InlineRef discriminated union (AC-1)", () => {
	it("EntityRef has kind in the entity set and an id field", () => {
		// Type check: create an entity ref
		const entityRef: EntityRef = { kind: "task", id: "task-1" };
		expect(entityRef.kind).toBe("task");
		expect(entityRef.id).toBe("task-1");
	});

	it("BlockRef has kind='block' and blockId/hostKind/hostId fields", () => {
		const blockRef: BlockRef = {
			kind: "block",
			blockId: "blk:v1:abc123",
			hostKind: "task",
			hostId: "task-1",
		};
		expect(blockRef.kind).toBe("block");
		expect(blockRef.blockId).toBe("blk:v1:abc123");
		expect(blockRef.hostKind).toBe("task");
		expect(blockRef.hostId).toBe("task-1");
	});

	it("InlineRef union accepts entity ref shape", () => {
		const ref: InlineRef = { kind: "knowledge_item", id: "k-42" };
		expect(ref.kind).toBe("knowledge_item");
	});

	it("InlineRef union accepts block ref shape", () => {
		const ref: InlineRef = {
			kind: "block",
			blockId: "blk:v1:xyz",
			hostKind: "knowledge_item",
			hostId: "k-99",
		};
		expect(ref.kind).toBe("block");
	});

	it("can narrow InlineRef to BlockRef via kind discriminant", () => {
		const refs: InlineRef[] = [
			{ kind: "task", id: "task-1" },
			{
				kind: "block",
				blockId: "blk:v1:abc",
				hostKind: "task",
				hostId: "task-1",
			},
			{ kind: "task", id: "task-2" },
		];

		const blockRefs = refs.filter((r): r is BlockRef => r.kind === "block");
		expect(blockRefs).toHaveLength(1);
		const blockRef = blockRefs[0];
		expect(blockRef?.blockId).toBe("blk:v1:abc");
	});

	it("can narrow InlineRef to EntityRef via kind discriminant", () => {
		const refs: InlineRef[] = [
			{ kind: "task", id: "task-1" },
			{
				kind: "block",
				blockId: "blk:v1:abc",
				hostKind: "task",
				hostId: "task-1",
			},
		];

		const entityRefs = refs.filter((r): r is EntityRef => r.kind !== "block");
		expect(entityRefs).toHaveLength(1);
		const entityRef = entityRefs[0];
		expect(entityRef?.id).toBe("task-1");
	});

	it("all entity ref kinds are accepted by EntityRef", () => {
		const entityKinds: EntityRef["kind"][] = [
			"knowledge_item",
			"task",
			"artifact",
			"task",
			"message",
		];
		for (const kind of entityKinds) {
			const ref: EntityRef = { kind, id: "test-id" };
			expect(ref.kind).toBe(kind);
		}
	});
});

describe("T4 — InlineRefKind includes 'block' (AC-1)", () => {
	it("InlineRefKind type includes 'block' as a valid value", () => {
		// Runtime check: 'block' is assignable as InlineRefKind
		const kind: InlineRefKind = "block";
		expect(kind).toBe("block");
	});

	it("InlineRefKind includes all original entity kinds", () => {
		const entityKinds: InlineRefKind[] = [
			"knowledge_item",
			"task",
			"artifact",
			"task",
			"message",
			"block",
		];
		// 6 total kinds
		expect(entityKinds).toHaveLength(6);
	});
});
