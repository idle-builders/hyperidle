/**
 * Unit tests for ActionGateStore.
 *
 * Covers:
 *   - Unknown session returns allowed (fail-open when no rules)
 *   - Empty rule set returns allowed
 *   - Wildcard "*" pattern denies every tool name
 *   - Exact match is case-insensitive ("bash" matches "Bash")
 *   - Prefix match: "bash" matches "bash:git push" and "bash_run"
 *   - Non-matching pattern returns allowed
 *   - First matching rule wins (and supplies its own ruleId/description)
 *   - delete() removes the session's rule set
 *   - set() overwrites previous rules for same session
 */

import { describe, expect, it } from "vitest";
import { createActionGateStore } from "../action-gate-store.js";

describe("ActionGateStore", () => {
	it("returns allowed for an unknown session (no rules registered)", () => {
		const store = createActionGateStore();
		const result = store.check("no-such-session", "Bash");
		expect(result.allowed).toBe(true);
	});

	it("returns allowed when session has an empty rule set", () => {
		const store = createActionGateStore();
		store.set("s1", []);
		expect(store.check("s1", "Write").allowed).toBe(true);
	});

	it("wildcard '*' pattern denies every tool name", () => {
		const store = createActionGateStore();
		store.set("s1", [{ id: "r1", pattern: "*", description: "all blocked" }]);
		for (const tool of ["Bash", "Write", "Read", "mcp__anything__do"]) {
			const result = store.check("s1", tool);
			expect(result.allowed, `expected deny for '${tool}'`).toBe(false);
		}
	});

	it("exact match is case-insensitive", () => {
		const store = createActionGateStore();
		store.set("s1", [{ id: "r1", pattern: "bash", description: "no bash" }]);
		expect(store.check("s1", "bash").allowed).toBe(false);
		expect(store.check("s1", "Bash").allowed).toBe(false);
		expect(store.check("s1", "BASH").allowed).toBe(false);
	});

	it("prefix match: 'bash' matches 'bash:git push'", () => {
		const store = createActionGateStore();
		store.set("s1", [{ id: "r1", pattern: "bash", description: "no bash" }]);
		expect(store.check("s1", "bash:git push").allowed).toBe(false);
		expect(store.check("s1", "Bash:anything").allowed).toBe(false);
	});

	it("prefix match: 'bash' matches 'bash_run' (underscore delimiter)", () => {
		const store = createActionGateStore();
		store.set("s1", [{ id: "r1", pattern: "bash", description: "no bash" }]);
		expect(store.check("s1", "bash_run").allowed).toBe(false);
	});

	it("non-matching pattern leaves other tools allowed", () => {
		const store = createActionGateStore();
		store.set("s1", [{ id: "r1", pattern: "bash", description: "no bash" }]);
		expect(store.check("s1", "Write").allowed).toBe(true);
		expect(store.check("s1", "Read").allowed).toBe(true);
		expect(store.check("s1", "mcp__hyperidle__reply").allowed).toBe(true);
	});

	it("deny result contains the matched rule's id and description", () => {
		const store = createActionGateStore();
		store.set("s1", [{ id: "rule-42", pattern: "*", description: "All tools gated" }]);
		const result = store.check("s1", "Write");
		expect(result.allowed).toBe(false);
		if (!result.allowed) {
			expect(result.ruleId).toBe("rule-42");
			expect(result.description).toBe("All tools gated");
		}
	});

	it("first matching rule wins when multiple rules are present", () => {
		const store = createActionGateStore();
		store.set("s1", [
			{ id: "first", pattern: "bash", description: "first match" },
			{ id: "second", pattern: "*", description: "second match" },
		]);
		const result = store.check("s1", "Bash");
		expect(result.allowed).toBe(false);
		if (!result.allowed) {
			expect(result.ruleId).toBe("first");
		}
	});

	it("delete() removes the session so subsequent checks return allowed", () => {
		const store = createActionGateStore();
		store.set("s1", [{ id: "r1", pattern: "*", description: "blocked" }]);
		expect(store.check("s1", "Write").allowed).toBe(false);

		store.delete("s1");
		expect(store.check("s1", "Write").allowed).toBe(true);
	});

	it("set() overwrites previous rules for the same session", () => {
		const store = createActionGateStore();
		store.set("s1", [{ id: "r1", pattern: "*", description: "old" }]);
		expect(store.check("s1", "Write").allowed).toBe(false);

		store.set("s1", []); // replace with empty — ungated
		expect(store.check("s1", "Write").allowed).toBe(true);
	});

	it("two sessions are isolated from each other", () => {
		const store = createActionGateStore();
		store.set("s1", [{ id: "r1", pattern: "*", description: "s1 blocked" }]);
		store.set("s2", []);
		expect(store.check("s1", "Write").allowed).toBe(false);
		expect(store.check("s2", "Write").allowed).toBe(true);
	});
});
