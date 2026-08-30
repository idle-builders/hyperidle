/**
 * Q2 — AC-2: ScopeKind type + SCOPE_KINDS const in @hyperidle/domain-model.
 *
 * AV3 amendment: "filesystem" added as the 8th scope kind.
 * AU26 F2 amendment (founder ruling, 2026-08-04): "filesystem" REMOVED again.
 * A filesystem is an agent's execution environment, not a place knowledge
 * lives — the scope was the single reason the `filesystems` record had to stay
 * core-owned, and the founder ruled the record moves to agent-orchestration
 * whole. Seven kinds, none of them a filesystem.
 */

import { describe, expect, it } from "vitest";
import { SCOPE_KINDS, SCOPES_REQUIRING_ID } from "../types.js";

describe("Q2 AC-2: SCOPE_KINDS and ScopeKind", () => {
	it("exports exactly 6 scope kinds (AU26 F2: filesystem removed; BB1: bet removed)", () => {
		expect(SCOPE_KINDS).toHaveLength(6);
	});

	it("includes all required scope values", () => {
		const kinds = SCOPE_KINDS as readonly string[];
		expect(kinds).toContain("factory");
		expect(kinds).toContain("product");
		expect(kinds).toContain("practice");
		expect(kinds).toContain("team");
		expect(kinds).toContain("task");
		expect(kinds).toContain("user");
	});

	it("BB1: no longer offers a bet scope — a bet is a task with no parent", () => {
		expect(SCOPE_KINDS as readonly string[]).not.toContain("bet");
		expect(SCOPES_REQUIRING_ID as ReadonlySet<string>).not.toContain("bet");
	});

	it("no longer offers a filesystem scope", () => {
		expect(SCOPE_KINDS as readonly string[]).not.toContain("filesystem");
	});

	it("is a readonly tuple (as const)", () => {
		// Verifying it is an array-like const (not a mutable array)
		expect(Array.isArray(SCOPE_KINDS)).toBe(true);
	});

	it("SCOPES_REQUIRING_ID no longer includes filesystem", () => {
		expect(SCOPES_REQUIRING_ID.has("filesystem" as never)).toBe(false);
	});
});
