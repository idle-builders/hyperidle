/**
 * AF17 — AC6: Nimmly guard script.
 *
 * The guard function must:
 *   1. Return exit code 1 (error) when given content containing "nimmly" (case-insensitive).
 *   2. Return exit code 0 when the content is clean.
 *
 * This is a unit test of the guard's checkContent logic, not a filesystem grep.
 * The guard function is imported from scripts/nimmly-guard.ts.
 *
 * RED PHASE: Fails until scripts/nimmly-guard.ts exports `checkContent`.
 */

import { describe, expect, test } from "vitest";

// @lore AF17: This dynamic import will fail until nimmly-guard.ts is created.
// biome-ignore lint/suspicious/noExplicitAny: Red phase — module doesn't exist yet
let checkContent: (content: string) => { clean: boolean; hits: string[] };

try {
	const mod = await import("../../../../scripts/nimmly-guard.js").catch(() => null);
	checkContent = (mod as Record<string, unknown>)?.checkContent as typeof checkContent ??
		(() => { throw new Error("checkContent not implemented yet (AF17 red phase)"); });
} catch {
	checkContent = () => { throw new Error("checkContent not implemented yet"); };
}

describe("AF17 AC6: nimmly-guard checkContent", () => {
	test("returns clean=false when content contains 'nimmly' (lowercase)", () => {
		const result = checkContent("const TEAM_NAME = 'nimmly product'");
		expect(result.clean).toBe(false);
		expect(result.hits.length).toBeGreaterThan(0);
	});

	test("returns clean=false when content contains 'Nimmly' (capitalized)", () => {
		const result = checkContent("name: Nimmly");
		expect(result.clean).toBe(false);
		expect(result.hits.length).toBeGreaterThan(0);
	});

	test("returns clean=false when content contains 'NIMMLY' (uppercase)", () => {
		const result = checkContent("// NIMMLY: DO NOT USE");
		expect(result.clean).toBe(false);
		expect(result.hits.length).toBeGreaterThan(0);
	});

	test("returns clean=true when content has no nimmly reference", () => {
		const result = checkContent("const TEAM_NAME = 'Acme'\nconst agentId = 'demo-agent-pm'");
		expect(result.clean).toBe(true);
		expect(result.hits).toHaveLength(0);
	});

	test("returns clean=true for empty string", () => {
		const result = checkContent("");
		expect(result.clean).toBe(true);
		expect(result.hits).toHaveLength(0);
	});

	test("returns clean=true for unrelated content", () => {
		const result = checkContent(`
			export const TEAM_ID = 'team-acme-123';
			export const AGENT_NAME = 'Acme Product Manager';
			// Using Acme as fictional company name
		`);
		expect(result.clean).toBe(true);
	});

	test("captures the line content in hits", () => {
		const content = "line1\nnimmly reference here\nline3";
		const result = checkContent(content);
		expect(result.clean).toBe(false);
		// The hit should reference the offending line
		expect(result.hits.some((h) => h.toLowerCase().includes("nimmly"))).toBe(true);
	});
});
