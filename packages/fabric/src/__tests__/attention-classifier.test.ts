import { describe, expect, it } from "vitest";
import { isTasteSensitive } from "../attention-classifier.js";
import type { KnowledgeItemWithFabric } from "../knowledge-repository.js";

// @lore AF3 C1: uses KnowledgeItemWithFabric — fabric fields moved off KnowledgeItem.
function makeItem(overrides: Partial<KnowledgeItemWithFabric> = {}): KnowledgeItemWithFabric {
	return {
		id: overrides.id ?? "ki-test",
		scopeKind: overrides.scopeKind ?? "factory",
		scopeId: overrides.scopeId ?? null,
		layer: overrides.layer ?? "L3",
		kind: overrides.kind ?? "pattern",
		topic: overrides.topic ?? null,
		title: overrides.title ?? "Test",
		body: overrides.body ?? "Body",
		format: overrides.format ?? "markdown",
		status: overrides.status ?? "active",
		attentionScore: overrides.attentionScore ?? null,
		confidence: overrides.confidence ?? null,
		version: overrides.version ?? 1,
		updatedBy: overrides.updatedBy ?? "agent-1",
		createdAt: overrides.createdAt ?? "2026-04-18T00:00:00.000Z",
		updatedAt: overrides.updatedAt ?? "2026-04-18T00:00:00.000Z",
		meta: overrides.meta ?? null,
	};
}

describe("isTasteSensitive", () => {
	it("classifies kind=brief as taste-sensitive", () => {
		expect(isTasteSensitive(makeItem({ kind: "brief" }))).toBe(true);
	});

	it("classifies kind=principle as taste-sensitive regardless of topic", () => {
		expect(isTasteSensitive(makeItem({ kind: "principle", topic: "auth" }))).toBe(true);
	});

	it("classifies kind=pattern with topic=brand as taste-sensitive", () => {
		expect(isTasteSensitive(makeItem({ kind: "pattern", topic: "brand" }))).toBe(true);
	});

	it("classifies kind=pattern with topic=auth as NOT taste-sensitive", () => {
		expect(isTasteSensitive(makeItem({ kind: "pattern", topic: "auth" }))).toBe(false);
	});

	it("classifies kind=pattern with scopeId=brand as taste-sensitive", () => {
		expect(isTasteSensitive(makeItem({ kind: "pattern", scopeId: "brand" }))).toBe(true);
	});

	it("treats topic comparisons case-insensitively", () => {
		expect(isTasteSensitive(makeItem({ kind: "pattern", topic: "Brand" }))).toBe(true);
		expect(isTasteSensitive(makeItem({ kind: "pattern", topic: "VOICE" }))).toBe(true);
	});
});
