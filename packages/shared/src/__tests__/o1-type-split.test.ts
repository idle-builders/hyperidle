/**
 * O1 type-split validation tests (RED phase).
 *
 * These tests verify:
 * - Strategy types (KNOWLEDGE_LAYERS, KNOWLEDGE_STATUSES, etc.) are NOT
 *   exported from @hyperidle/shared after O1
 * - Kernel types (KERNEL_KNOWLEDGE_STATUSES, agent role split) DO exist in shared
 *
 * Tests for strategy types in @hyperidle/fabric are in
 * packages/fabric/src/__tests__/types.test.ts.
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

		it("has exactly 3 values", () => {
			const val = (sharedIndex as Record<string, unknown>)["KERNEL_KNOWLEDGE_STATUSES"];
			expect(Array.isArray(val)).toBe(true);
			expect((val as unknown[]).length).toBe(3);
		});

		it("contains draft, active, archived", () => {
			const val = (sharedIndex as Record<string, unknown>)["KERNEL_KNOWLEDGE_STATUSES"] as string[];
			expect(val).toContain("draft");
			expect(val).toContain("active");
			expect(val).toContain("archived");
		});
	});

	describe("User role split (KERNEL_USER_ROLES, FABRIC_USER_ROLES, USER_ROLES)", () => {
		it("KERNEL_USER_ROLES is exported from shared", () => {
			expect("KERNEL_USER_ROLES" in sharedIndex).toBe(true);
		});

		it("KERNEL_USER_ROLES has 3 roles", () => {
			const val = (sharedIndex as Record<string, unknown>)["KERNEL_USER_ROLES"] as string[];
			expect(Array.isArray(val)).toBe(true);
			expect(val.length).toBe(3);
			expect(val).toContain("builder");
			expect(val).toContain("growth");
			expect(val).toContain("product_manager");
		});

		it("FABRIC_USER_ROLES is exported from shared", () => {
			expect("FABRIC_USER_ROLES" in sharedIndex).toBe(true);
		});

		it("FABRIC_USER_ROLES has 3 roles", () => {
			const val = (sharedIndex as Record<string, unknown>)["FABRIC_USER_ROLES"] as string[];
			expect(Array.isArray(val)).toBe(true);
			expect(val.length).toBe(3);
			expect(val).toContain("practice_facilitator");
			expect(val).toContain("chief_of_staff");
			expect(val).toContain("brand_voice");
		});

		it("USER_ROLES composes KERNEL_USER_ROLES and FABRIC_USER_ROLES", () => {
			expect("USER_ROLES" in sharedIndex).toBe(true);
			const userRoles = (sharedIndex as Record<string, unknown>)["USER_ROLES"] as string[];
			const kernelRoles = (sharedIndex as Record<string, unknown>)["KERNEL_USER_ROLES"] as string[];
			const fabricRoles = (sharedIndex as Record<string, unknown>)["FABRIC_USER_ROLES"] as string[];
			expect(userRoles.length).toBe(6);
			for (const role of kernelRoles) {
				expect(userRoles).toContain(role);
			}
			for (const role of fabricRoles) {
				expect(userRoles).toContain(role);
			}
		});
	});

	describe("Strategy constants are NOT exported from shared after O1", () => {
		it("KNOWLEDGE_LAYERS is not exported from shared", () => {
			// After O1, KNOWLEDGE_LAYERS moves to @hyperidle/fabric
			expect("KNOWLEDGE_LAYERS" in sharedIndex).toBe(false);
		});

		it("KNOWLEDGE_STATUSES is not exported from shared", () => {
			// After O1, KNOWLEDGE_STATUSES (7-state) moves to @hyperidle/fabric
			expect("KNOWLEDGE_STATUSES" in sharedIndex).toBe(false);
		});

		it("KNOWLEDGE_SCOPES is not exported from shared", () => {
			expect("KNOWLEDGE_SCOPES" in sharedIndex).toBe(false);
		});

		it("KNOWLEDGE_SORT_OPTIONS is not exported from shared", () => {
			expect("KNOWLEDGE_SORT_OPTIONS" in sharedIndex).toBe(false);
		});

		it("KNOWLEDGE_TOPIC_HEALTHS is not exported from shared", () => {
			expect("KNOWLEDGE_TOPIC_HEALTHS" in sharedIndex).toBe(false);
		});
	});
});
