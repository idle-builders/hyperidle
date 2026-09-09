/**
 * Q2 — AC-2: ScopeKind type + SCOPE_KINDS const in @hyperidle/domain-model.
 *
 * AV3 amendment: "filesystem" added as the 8th scope kind.
 * AU26 F2 amendment (founder ruling, 2026-08-04): "filesystem" REMOVED again.
 * A filesystem is an agent's execution environment, not a place knowledge
 * lives — the scope was the single reason the `filesystems` record had to stay
 * core-owned, and the founder ruled the record moves to agent-orchestration
 * whole.
 *
 * @lore nested-knowledge-items: `product`/`practice`/`task` are REMOVED.
 * `product` and `practice` were the layer vocabulary wearing a scope costume
 * — "Product" and "Practices" are now knowledge items near the root, not
 * scope values. `task` left because a task's knowledge parents onto the task
 * directly (`parentKind='task'`) and never carries a scope. Scope is now
 * closed to three concentric rings: factory > team > user.
 */

import { describe, expect, it } from "vitest";
import { SCOPE_KINDS, SCOPES_REQUIRING_ID } from "../types.js";

describe("SCOPE_KINDS and ScopeKind (architecture.md §2)", () => {
	it("exports exactly 3 scope kinds", () => {
		expect(SCOPE_KINDS).toHaveLength(3);
	});

	it("includes all required scope values", () => {
		const kinds = SCOPE_KINDS as readonly string[];
		expect(kinds).toContain("factory");
		expect(kinds).toContain("team");
		expect(kinds).toContain("user");
	});

	it("no longer offers product, practice, task, bet, or filesystem scopes", () => {
		const kinds = SCOPE_KINDS as readonly string[];
		for (const gone of ["product", "practice", "task", "bet", "filesystem"]) {
			expect(kinds).not.toContain(gone);
		}
	});

	it("is a readonly tuple (as const)", () => {
		// Verifying it is an array-like const (not a mutable array)
		expect(Array.isArray(SCOPE_KINDS)).toBe(true);
	});

	it("SCOPES_REQUIRING_ID is exactly {team}", () => {
		expect(SCOPES_REQUIRING_ID.has("team")).toBe(true);
		expect(SCOPES_REQUIRING_ID.size).toBe(1);
	});
});
