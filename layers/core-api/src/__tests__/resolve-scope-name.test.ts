/**
 * AV3 — AC-2: resolveScopeName unit tests.
 *
 * Tests every scopeKind including missing-entity and null-scopeId cases.
 * Each missing/no-table fallback is asserted equal to scopeKindToLabel(kind)
 * so drift between server fallback and web fallback is impossible.
 *
 * These tests import resolveScopeName and a stub DB — no real DB needed.
 */

import { scopeKindToLabel } from "@hyperidle/domain-model";
import { describe, expect, it, vi } from "vitest";
import { resolveScopeName } from "../routes/knowledge.js";

type Row = Record<string, unknown>;

/**
 * Build a minimal stub DB that returns specified rows for select queries.
 * Each call to .from() can return a different set of rows.
 */
function makeDb(rowsByTable: Map<unknown, Row[]>) {
	const stub = {
		select: vi.fn().mockReturnThis(),
		from: vi.fn((table: unknown) => {
			const rows = rowsByTable.get(table) ?? [];
			return {
				where: vi.fn().mockReturnThis(),
				limit: vi.fn().mockResolvedValue(rows),
			};
		}),
	};
	return stub as unknown as Parameters<typeof resolveScopeName>[0];
}

/** DB stub that always returns empty (missing entity). */
function emptyDb() {
	return makeDb(new Map());
}

describe("resolveScopeName — resolves scopeId to human-readable scope name", () => {
	// ── factory ──────────────────────────────────────────────────────────────
	it("factory → 'Factory' (literal, no query)", async () => {
		const result = await resolveScopeName(emptyDb(), "factory", null);
		expect(result).toBe("Factory");
	});

	it("factory with non-null scopeId still returns 'Factory'", async () => {
		const result = await resolveScopeName(emptyDb(), "factory", "some-id");
		expect(result).toBe("Factory");
	});

	// ── user ─────────────────────────────────────────────────────────────────
	it("user → users.name when entity found", async () => {
		const { users } = await import("@hyperidle/db");
		const db = makeDb(new Map([[users, [{ name: "Alice" }]]]));
		const result = await resolveScopeName(db, "user", "user-1");
		expect(result).toBe("Alice");
	});

	it("user missing → scopeKindToLabel('user') = 'Private'", async () => {
		const result = await resolveScopeName(emptyDb(), "user", "nonexistent");
		expect(result).toBe(scopeKindToLabel("user"));
		expect(result).toBe("Private");
	});

	it("user null scopeId → 'Private'", async () => {
		const result = await resolveScopeName(emptyDb(), "user", null);
		expect(result).toBe("Private");
	});

	// ── team ─────────────────────────────────────────────────────────────────
	it("team → teams.name when entity found by direct id", async () => {
		const { teams } = await import("@hyperidle/db");
		const db = makeDb(new Map([[teams, [{ name: "Team Nimmly" }]]]));
		const result = await resolveScopeName(db, "team", "team-1");
		expect(result).toBe("Team Nimmly");
	});

	it("team missing → scopeKindToLabel('team') = 'Team'", async () => {
		const result = await resolveScopeName(emptyDb(), "team", "nonexistent");
		expect(result).toBe(scopeKindToLabel("team"));
		expect(result).toBe("Team");
	});

	it("team null scopeId → 'Team'", async () => {
		const result = await resolveScopeName(emptyDb(), "team", null);
		expect(result).toBe("Team");
	});

	// ── bet ──────────────────────────────────────────────────────────────────
	it("bet → bets.description (short, no truncation)", async () => {
		const { bets } = await import("@hyperidle/db");
		const db = makeDb(new Map([[bets, [{ description: "Ship the new login flow" }]]]));
		const result = await resolveScopeName(db, "bet", "bet-1");
		expect(result).toBe("Ship the new login flow");
	});

	it("bet → description truncated at 60 chars with ellipsis", async () => {
		const { bets } = await import("@hyperidle/db");
		const longDesc = "A".repeat(65);
		const db = makeDb(new Map([[bets, [{ description: longDesc }]]]));
		const result = await resolveScopeName(db, "bet", "bet-1");
		expect(result).toBe(`${"A".repeat(60)}…`);
	});

	it("bet exactly 60 chars → no truncation", async () => {
		const { bets } = await import("@hyperidle/db");
		const exactDesc = "B".repeat(60);
		const db = makeDb(new Map([[bets, [{ description: exactDesc }]]]));
		const result = await resolveScopeName(db, "bet", "bet-1");
		expect(result).toBe(exactDesc);
	});

	it("bet empty description → scopeKindToLabel('bet') = 'Shared'", async () => {
		const { bets } = await import("@hyperidle/db");
		const db = makeDb(new Map([[bets, [{ description: "" }]]]));
		const result = await resolveScopeName(db, "bet", "bet-1");
		expect(result).toBe(scopeKindToLabel("bet"));
		expect(result).toBe("Shared");
	});

	it("bet whitespace-only description → 'Shared'", async () => {
		const { bets } = await import("@hyperidle/db");
		const db = makeDb(new Map([[bets, [{ description: "   " }]]]));
		const result = await resolveScopeName(db, "bet", "bet-1");
		expect(result).toBe("Shared");
	});

	it("bet missing → scopeKindToLabel('bet') = 'Shared'", async () => {
		const result = await resolveScopeName(emptyDb(), "bet", "nonexistent");
		expect(result).toBe(scopeKindToLabel("bet"));
		expect(result).toBe("Shared");
	});

	it("bet null scopeId → 'Shared'", async () => {
		const result = await resolveScopeName(emptyDb(), "bet", null);
		expect(result).toBe("Shared");
	});

	// ── task ─────────────────────────────────────────────────────────────────
	it("task → tasks.title when entity found", async () => {
		const { tasks } = await import("@hyperidle/db");
		const db = makeDb(new Map([[tasks, [{ title: "Implement login" }]]]));
		const result = await resolveScopeName(db, "task", "task-1");
		expect(result).toBe("Implement login");
	});

	it("task missing → scopeKindToLabel('task') = 'Shared'", async () => {
		const result = await resolveScopeName(emptyDb(), "task", "nonexistent");
		expect(result).toBe(scopeKindToLabel("task"));
		expect(result).toBe("Shared");
	});

	it("task null scopeId → 'Shared'", async () => {
		const result = await resolveScopeName(emptyDb(), "task", null);
		expect(result).toBe("Shared");
	});

	// ── product (no table) ───────────────────────────────────────────────────
	it("product → scopeKindToLabel('product') = 'Team' (no entity table)", async () => {
		const result = await resolveScopeName(emptyDb(), "product", "some-id");
		expect(result).toBe(scopeKindToLabel("product"));
		expect(result).toBe("Team");
	});

	it("product null scopeId → 'Team'", async () => {
		const result = await resolveScopeName(emptyDb(), "product", null);
		expect(result).toBe("Team");
	});

	// ── practice → role label (AV3 amendment A1) ─────────────────────────────
	it("practice with known role scopeId → catalog label ('product_manager' → 'Product Manager')", async () => {
		const result = await resolveScopeName(emptyDb(), "practice", "product_manager");
		expect(result).toBe("Product Manager");
	});

	it("practice with unknown role scopeId → title-cased ('growth_hacker' → 'Growth Hacker')", async () => {
		const result = await resolveScopeName(emptyDb(), "practice", "growth_hacker");
		expect(result).toBe("Growth Hacker");
	});

	it("practice with empty scopeId → scopeKindToLabel('practice') = 'Shared'", async () => {
		const result = await resolveScopeName(emptyDb(), "practice", "");
		expect(result).toBe(scopeKindToLabel("practice"));
		expect(result).toBe("Shared");
	});

	it("practice null scopeId → 'Shared'", async () => {
		const result = await resolveScopeName(emptyDb(), "practice", null);
		expect(result).toBe("Shared");
	});

	// ── filesystem is no longer a scope kind (AU26 F2, founder ruling) ───────
	// AV3 amendment A2 gave knowledge items a `filesystem` scope, which read
	// `filesystems` to compose a display name. That scope is DELETED: a
	// filesystem is an agent's execution environment, not a place knowledge
	// lives, and the scope was the one reason the record had to stay
	// core-owned. `resolveScopeName` no longer touches `filesystems` at all —
	// the string falls through to the unknown-kind fallback like any other.
	it("filesystem is an unknown scope kind now — falls through to the shared fallback", async () => {
		const { filesystems } = await import("@hyperidle/db");
		const resourceRef = JSON.stringify({ kind: "code", repo: "owner/nimmly", branch: "main" });
		const db = makeDb(new Map([[filesystems, [{ source: "github", kind: "code", resourceRef }]]]));
		const result = await resolveScopeName(db, "filesystem", "fs-1");
		expect(result).toBe(scopeKindToLabel("filesystem"));
		expect(result).toBe("Shared");
	});

	it("filesystem null scopeId → the same unknown-kind fallback", async () => {
		const result = await resolveScopeName(emptyDb(), "filesystem", null);
		expect(result).toBe("Shared");
	});

	// ── missing entity never returns UUID ────────────────────────────────────
	it("user missing — never returns raw UUID", async () => {
		const uuid = "550e8400-e29b-41d4-a716-446655440000";
		const result = await resolveScopeName(emptyDb(), "user", uuid);
		expect(result).not.toBe(uuid);
		expect(result).toBe("Private");
	});

	it("team missing — never returns raw UUID", async () => {
		const uuid = "550e8400-e29b-41d4-a716-446655440001";
		const result = await resolveScopeName(emptyDb(), "team", uuid);
		expect(result).not.toBe(uuid);
		expect(result).toBe("Team");
	});
});
