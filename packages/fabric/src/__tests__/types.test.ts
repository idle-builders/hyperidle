/**
 * O1 fabric types tests.
 *
 * Verifies that all strategy types moved from @hyperidle/shared to
 * @hyperidle/fabric are present and correct.
 *
 * Also contains the KNOWLEDGE_STATUSES tests moved from
 * packages/shared/src/__tests__/types.test.ts (those tests belong
 * in fabric after O1 since KNOWLEDGE_STATUSES moves to fabric).
 */
import { describe, expect, it } from "vitest";
import type {
	AutonomyLevel,
	KnowledgeAccessorKind,
	KnowledgeKind,
	KnowledgeLayer,
	KnowledgeRelevanceSignals,
	KnowledgeScope,
	KnowledgeSortOption,
	KnowledgeStatus,
	KnowledgeTopicHealth,
	PropagationLevel,
	PropagationResult,
	PropagationStatus,
	RiskTier,
} from "../types.js";
import {
	KNOWLEDGE_LAYERS,
	KNOWLEDGE_SCOPES,
	KNOWLEDGE_SORT_OPTIONS,
	KNOWLEDGE_STATUSES,
	KNOWLEDGE_TOPIC_HEALTHS,
} from "../types.js";

describe("KNOWLEDGE_LAYERS (moved from shared)", () => {
	it("has 5 layers", () => {
		expect(KNOWLEDGE_LAYERS).toHaveLength(5);
	});

	it("contains all valid layer values", () => {
		const expected: readonly KnowledgeLayer[] = ["L0", "L1", "L2", "L3", "L4"];
		for (const layer of expected) {
			expect(KNOWLEDGE_LAYERS).toContain(layer);
		}
	});

	it("is a readonly array", () => {
		expect(Array.isArray(KNOWLEDGE_LAYERS)).toBe(true);
	});
});

describe("KNOWLEDGE_STATUSES (7-state, moved from shared)", () => {
	it("is exported as a runtime array", () => {
		expect(Array.isArray(KNOWLEDGE_STATUSES)).toBe(true);
	});

	it("has 7 knowledge statuses including needs_human", () => {
		expect(KNOWLEDGE_STATUSES).toHaveLength(7);
		expect(KNOWLEDGE_STATUSES).toContain("needs_human");
	});

	it("includes every KnowledgeStatus value", () => {
		const expected: readonly KnowledgeStatus[] = [
			"captured",
			"provisional",
			"validated",
			"active",
			"stale",
			"archived",
			"needs_human",
		];
		for (const ks of expected) {
			expect(KNOWLEDGE_STATUSES).toContain(ks);
		}
	});
});

describe("KNOWLEDGE_SCOPES (moved from shared)", () => {
	it("has 3 scopes", () => {
		expect(KNOWLEDGE_SCOPES).toHaveLength(3);
	});

	it("contains practice, product, factory", () => {
		const expected: readonly KnowledgeScope[] = ["practice", "product", "factory"];
		for (const scope of expected) {
			expect(KNOWLEDGE_SCOPES).toContain(scope);
		}
	});
});

describe("KNOWLEDGE_TOPIC_HEALTHS (moved from shared)", () => {
	it("has 3 health values", () => {
		expect(KNOWLEDGE_TOPIC_HEALTHS).toHaveLength(3);
	});

	it("contains fresh, some_stale, mostly_stale", () => {
		const expected: readonly KnowledgeTopicHealth[] = ["fresh", "some_stale", "mostly_stale"];
		for (const health of expected) {
			expect(KNOWLEDGE_TOPIC_HEALTHS).toContain(health);
		}
	});
});

describe("KNOWLEDGE_SORT_OPTIONS (moved from shared)", () => {
	it("has 3 sort options", () => {
		expect(KNOWLEDGE_SORT_OPTIONS).toHaveLength(3);
	});

	it("contains relevance, recency, frequency", () => {
		const expected: readonly KnowledgeSortOption[] = ["relevance", "recency", "frequency"];
		for (const option of expected) {
			expect(KNOWLEDGE_SORT_OPTIONS).toContain(option);
		}
	});
});

describe("Strategy-specific types", () => {
	it("RiskTier accepts low, medium, high", () => {
		const values: RiskTier[] = ["low", "medium", "high"];
		expect(values).toHaveLength(3);
	});

	it("AutonomyLevel accepts 1, 2, 3, 4", () => {
		const values: AutonomyLevel[] = [1, 2, 3, 4];
		expect(values).toHaveLength(4);
	});

	it("KnowledgeAccessorKind accepts human and agent", () => {
		const values: KnowledgeAccessorKind[] = ["human", "agent"];
		expect(values).toHaveLength(2);
	});

	it("KnowledgeRelevanceSignals has expected shape", () => {
		const signals: KnowledgeRelevanceSignals = {
			recency: "2d ago",
			accessCount30d: 5,
			citationCount: null,
		};
		expect(signals.recency).toBe("2d ago");
		expect(signals.accessCount30d).toBe(5);
		expect(signals.citationCount).toBeNull();
	});

	it("KnowledgeKind accepts all expected values", () => {
		const values: KnowledgeKind[] = [
			"pattern",
			"anti_pattern",
			"brief",
			"principle",
			"decision",
			"failure",
			"reflection",
			"focus",
		];
		expect(values).toHaveLength(8);
	});
});

describe("Propagation types (moved from shared/propagation.ts)", () => {
	it("PropagationLevel accepts all 5 levels", () => {
		const levels: PropagationLevel[] = ["session", "task", "bet", "team", "portfolio"];
		expect(levels).toHaveLength(5);
	});

	it("PropagationStatus accepts all 4 statuses", () => {
		const statuses: PropagationStatus[] = ["applied", "skipped", "failed", "pending_retry"];
		expect(statuses).toHaveLength(4);
	});

	it("PropagationResult has expected shape", () => {
		const result: PropagationResult = {
			sourceLevel: "session",
			sourceId: "sess-1",
			targetLevel: "task",
			targetId: "task-1",
			targetTransition: "open -> in_progress",
			status: "applied",
		};
		expect(result.sourceLevel).toBe("session");
		expect(result.targetLevel).toBe("task");
		expect(result.status).toBe("applied");
	});

	it("PropagationResult failureReason is optional", () => {
		const result: PropagationResult = {
			sourceLevel: "bet",
			sourceId: "bet-1",
			targetLevel: "task",
			targetId: "task-1",
			targetTransition: null,
			status: "failed",
			failureReason: "task already done",
		};
		expect(result.failureReason).toBe("task already done");
	});
});
