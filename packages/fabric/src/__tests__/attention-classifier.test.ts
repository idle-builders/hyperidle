import type { KnowledgeItem } from "@hyperidle/db";
import { describe, expect, it } from "vitest";
import { isTasteSensitive } from "../attention-classifier.js";

function makeItem(overrides: Partial<KnowledgeItem> = {}): KnowledgeItem {
	return {
		id: overrides.id ?? "ki-test",
		layer: overrides.layer ?? "L3",
		scopeId: overrides.scopeId ?? null,
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
