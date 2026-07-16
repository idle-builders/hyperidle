/**
 * O1 type-split validation tests (RED phase).
 *
 * These tests verify:
 * - App-owned knowledge vocabulary is exported from @hyperidle/shared after AU3
 * - Kernel types (KERNEL_KNOWLEDGE_STATUSES, agent role split) DO exist in shared
 *
 * These tests FAIL until the O1 implementation is applied.
 */
import { describe, expect, it } from "vitest";

// These imports will be undefined before O1 implementation and
// will be real values after. We use direct imports from the
// source files so the test doesn't rely on re-exports being complete.
import * as sharedIndex from "../index.js";

describe("O1 kernel type additions to @hyperidle/shared", () => {
	describe("KERNEL_KNOWLEDGE_STATUSES", () => {
		it("is exported from shared (index.ts)", () => {
			expect("KERNEL_KNOWLEDGE_STATUSES" in sharedIndex).toBe(true);
		});

		it("has exactly 4 values", () => {
			// Y4: needs_human added for triage escalation (was 3)
			const val = (sharedIndex as Record<string, unknown>).KERNEL_KNOWLEDGE_STATUSES;
			expect(Array.isArray(val)).toBe(true);
			expect((val as unknown[]).length).toBe(4);
		});

		it("contains draft, active, archived", () => {
			const val = (sharedIndex as Record<string, unknown>).KERNEL_KNOWLEDGE_STATUSES as string[];
			expect(val).toContain("draft");
			expect(val).toContain("active");
			expect(val).toContain("archived");
		});
	});

	describe("AB0: Agent categories replace kernel/fabric role split", () => {
		it("AGENT_CATEGORIES is exported from shared", () => {
			expect("AGENT_CATEGORIES" in sharedIndex).toBe(true);
		});

		it("AGENT_CATEGORIES has 3 values", () => {
			const val = (sharedIndex as Record<string, unknown>).AGENT_CATEGORIES as string[];
			expect(Array.isArray(val)).toBe(true);
			expect(val.length).toBe(3);
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
		it("KNOWLEDGE_LAYERS is exported from shared", () => {
			expect("KNOWLEDGE_LAYERS" in sharedIndex).toBe(true);
		});

		it("KNOWLEDGE_STATUSES is exported from shared", () => {
			expect("KNOWLEDGE_STATUSES" in sharedIndex).toBe(true);
		});

		it("KNOWLEDGE_SCOPES is exported from shared", () => {
			expect("KNOWLEDGE_SCOPES" in sharedIndex).toBe(true);
		});

		it("KNOWLEDGE_SORT_OPTIONS is exported from shared", () => {
			expect("KNOWLEDGE_SORT_OPTIONS" in sharedIndex).toBe(true);
		});

		it("KNOWLEDGE_TOPIC_HEALTHS is exported from shared", () => {
			expect("KNOWLEDGE_TOPIC_HEALTHS" in sharedIndex).toBe(true);
		});
	});
});
