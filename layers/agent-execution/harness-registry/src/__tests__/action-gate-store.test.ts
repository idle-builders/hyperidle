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

/**
 * The return half: the store has to remember which action it denied, and to
 * honour a clearance for exactly that action once.
 *
 * @lore BA2: Both behaviours here are defects from an abandoned attempt, written
 * down as tests so they cannot come back. The clearance was keyed to "the next
 * tool call", so the resumed session's first call — a harmless read — spent the
 * pass and the cleared action was denied again.
 */
describe("ActionGateStore — remembering a denial and honouring a clearance", () => {
	const RULES = [{ id: "r1", pattern: "bash", description: "shell needs a person" }];

	it("has no pending denial until something is actually denied", () => {
		const store = createActionGateStore();
		store.set("s1", RULES);
		expect(store.pendingDenial("s1")).toBeUndefined();
		store.check("s1", "Read");
		expect(store.pendingDenial("s1")).toBeUndefined();
	});

	it("remembers the rule and the tool that was denied", () => {
		const store = createActionGateStore();
		store.set("s1", RULES);
		store.check("s1", "Bash");
		expect(store.pendingDenial("s1")).toEqual({ ruleId: "r1", toolName: "Bash" });
	});

	it("clears the cleared action, and only that action", () => {
		const store = createActionGateStore();
		store.set("s1", [
			{ id: "r1", pattern: "bash", description: "shell" },
			{ id: "r2", pattern: "write", description: "files" },
		]);
		store.clear("s1", { ruleId: "r1", toolName: "Bash" });

		expect(store.check("s1", "Bash").allowed).toBe(true);
		expect(store.check("s1", "Write").allowed).toBe(false);
	});

	it("is not spent by another call the SAME rule covers", () => {
		// The defect this pins: one broad rule covers every tool, a human clears
		// Bash, and the resumed session reads a file first. Keyed to the rule alone,
		// that read spends the pass and the approved Bash is denied again.
		const store = createActionGateStore();
		store.set("s1", [{ id: "r1", pattern: "*", description: "everything" }]);
		store.clear("s1", { ruleId: "r1", toolName: "Bash" });

		expect(store.check("s1", "Read").allowed, "the read must not spend the pass").toBe(false);
		expect(store.check("s1", "Bash").allowed, "the approved action must run").toBe(true);
	});

	it("is not spent by an unrelated call the resumed session makes first", () => {
		const store = createActionGateStore();
		store.set("s1", [
			{ id: "r1", pattern: "bash", description: "shell" },
			{ id: "r2", pattern: "write", description: "files" },
		]);
		store.clear("s1", { ruleId: "r1", toolName: "Bash" });

		// The agent comes back and reads a file, then writes one — neither is the
		// action a human cleared, and neither may consume the pass.
		expect(store.check("s1", "Read").allowed).toBe(true);
		expect(store.check("s1", "Write").allowed).toBe(false);

		expect(store.check("s1", "Bash").allowed).toBe(true);
	});

	it("is single-use: the cleared action is denied again on a second attempt", () => {
		const store = createActionGateStore();
		store.set("s1", RULES);
		store.clear("s1", { ruleId: "r1", toolName: "Bash" });

		expect(store.check("s1", "Bash").allowed).toBe(true);
		const second = store.check("s1", "Bash");
		expect(second.allowed).toBe(false);
		expect(second.allowed === false && second.ruleId).toBe("r1");
	});

	it("does not clear an action in some other session", () => {
		const store = createActionGateStore();
		store.set("s1", RULES);
		store.set("s2", RULES);
		store.clear("s1", { ruleId: "r1", toolName: "Bash" });
		expect(store.check("s2", "Bash").allowed).toBe(false);
	});

	it("drops the pending denial and the clearance when the session is released", () => {
		const store = createActionGateStore();
		store.set("s1", RULES);
		store.check("s1", "Bash");
		store.delete("s1");
		expect(store.pendingDenial("s1")).toBeUndefined();
	});
});
