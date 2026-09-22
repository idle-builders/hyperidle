/**
 * O1 type-split validation tests (RED phase).
 *
 * These tests verify:
 * - App-owned knowledge vocabulary is exported from @hyperidle/domain-model after AU3
 * - Kernel types (KERNEL_DOCUMENT_STATUSES, agent role split) DO exist in @hyperidle/domain-model
 *
 * These tests FAIL until the O1 implementation is applied.
 */
import { describe, expect, it } from "vitest";

// These imports will be undefined before O1 implementation and
// will be real values after. We use direct imports from the
// source files so the test doesn't rely on re-exports being complete.
import * as sharedIndex from "../index.js";

describe("O1 kernel type additions to @hyperidle/domain-model", () => {
	describe("KERNEL_DOCUMENT_STATUSES", () => {
		it("is exported from @hyperidle/domain-model (index.ts)", () => {
			expect("KERNEL_DOCUMENT_STATUSES" in sharedIndex).toBe(true);
		});

		it("has exactly 4 values", () => {
			// Y4: needs_human added for triage escalation (was 3)
			const val = (sharedIndex as Record<string, unknown>)["KERNEL_DOCUMENT_STATUSES"];
			expect(Array.isArray(val)).toBe(true);
			expect((val as unknown[]).length).toBe(4);
		});

		it("contains proposed, active, archived (status collapse, architecture.md §2)", () => {
			const val = (sharedIndex as Record<string, unknown>)["KERNEL_DOCUMENT_STATUSES"] as string[];
			expect(val).toContain("proposed");
			expect(val).toContain("active");
			expect(val).toContain("archived");
		});
	});

	describe("AB0: Agent categories replace kernel/fabric role split", () => {
		it("AGENT_CATEGORIES is exported from shared", () => {
			expect("AGENT_CATEGORIES" in sharedIndex).toBe(true);
		});

		it("AGENT_CATEGORIES has 2 values (strategy removed in BA9d)", () => {
			const val = (sharedIndex as Record<string, unknown>)["AGENT_CATEGORIES"] as string[];
			expect(Array.isArray(val)).toBe(true);
			expect(val.length).toBe(2);
		});

		it("KERNEL_USER_ROLES is NOT exported from shared after AB0", () => {
			expect("KERNEL_USER_ROLES" in sharedIndex).toBe(false);
		});

		it("FABRIC_USER_ROLES is NOT exported from shared after AB0", () => {
			expect("FABRIC_USER_ROLES" in sharedIndex).toBe(false);
		});

		it("USER_ROLES is NOT exported from shared after AB0", () => {
			expect("USER_ROLES" in sharedIndex).toBe(false);
		});
	});

	describe("App-owned knowledge vocabulary is exported from shared after AU3", () => {
		// @lore nested-knowledge-items: KNOWLEDGE_LAYERS and KNOWLEDGE_SCOPES are
		// DELETED, not deprecated — a document's place in the tree says
		// what it is about now, not a flat layer/scope-costume vocabulary.
		it("KNOWLEDGE_LAYERS is gone", () => {
			expect("KNOWLEDGE_LAYERS" in sharedIndex).toBe(false);
		});

		// @lore B22 (architecture.md §0 A1): `KNOWLEDGE_STATUSES` (`knowledge.ts`)
		// is deleted — `DOCUMENT_STATUSES` (`actions/document.ts`) is the same
		// four-value ladder its one real importer (`useGlobalSearch.ts`) now uses.
		it("KNOWLEDGE_STATUSES is gone; DOCUMENT_STATUSES is exported from shared", () => {
			expect("KNOWLEDGE_STATUSES" in sharedIndex).toBe(false);
			expect("DOCUMENT_STATUSES" in sharedIndex).toBe(true);
		});

		it("KNOWLEDGE_SCOPES is gone", () => {
			expect("KNOWLEDGE_SCOPES" in sharedIndex).toBe(false);
		});

		// @lore B22: `KNOWLEDGE_SORT_OPTIONS` had zero real importers outside
		// `knowledge.ts` itself — deleted with the file, no replacement.
		it("KNOWLEDGE_SORT_OPTIONS is gone", () => {
			expect("KNOWLEDGE_SORT_OPTIONS" in sharedIndex).toBe(false);
		});

		// @lore nested-knowledge-items AC6: KNOWLEDGE_TOPIC_HEALTHS is DELETED
		// with `topic` — its only caller was the topic-cohort math in
		// fixtures/knowledge-data.ts, itself dead once `topic` is gone.
		it("KNOWLEDGE_TOPIC_HEALTHS is gone", () => {
			expect("KNOWLEDGE_TOPIC_HEALTHS" in sharedIndex).toBe(false);
		});
	});
});
