/**
 * Action-rules service — integration tests.
 *
 * AC coverage:
 *  - Fresh install: resolveActionRules returns empty when no rules exist
 *  - createActionRule creates global, team, and agent-scoped rules
 *  - listActionRules returns all rules ordered by createdAt
 *  - deleteActionRule removes the row; returns false on unknown id
 *  - resolveActionRules: global-only rules apply to any session
 *  - resolveActionRules: team rules apply only when teamId matches
 *  - resolveActionRules: agent rules apply only when agentId matches
 *  - resolveActionRules: all three scopes resolved at once with overlap excluded
 *  - Empty result when session has no matching rules
 */

import { test } from "@hyperidle/db/test-fixtures";
import { describe, expect } from "vitest";
import {
	createActionRule,
	deleteActionRule,
	listActionRules,
	resolveActionRules,
} from "../action-rules.js";

describe("action rules — fresh install", () => {
	test("resolveActionRules returns empty array when no rules exist", async ({ db }) => {
		const rules = await resolveActionRules(db, { agentId: "agent-1", teamId: "team-1" });
		expect(rules).toEqual([]);
	});

	test("listActionRules returns empty array when no rules exist", async ({ db }) => {
		const rules = await listActionRules(db);
		expect(rules).toEqual([]);
	});
});

describe("action rules — create", () => {
	test("creates a global rule and returns it", async ({ db }) => {
		const rule = await createActionRule(db, {
			pattern: "git push",
			description: "Push to remote",
			scope: "global",
			now: "2026-08-30T00:00:00.000Z",
		});

		expect(rule.id).toMatch(/^rule-/);
		expect(rule.pattern).toBe("git push");
		expect(rule.description).toBe("Push to remote");
		expect(rule.scope).toBe("global");
		expect(rule.scopeId).toBeNull();
		expect(rule.createdAt).toBe("2026-08-30T00:00:00.000Z");
	});

	test("creates a team-scoped rule with scopeId", async ({ db }) => {
		const rule = await createActionRule(db, {
			pattern: "rm -rf",
			description: "Delete files",
			scope: "team",
			scopeId: "team-abc",
		});

		expect(rule.scope).toBe("team");
		expect(rule.scopeId).toBe("team-abc");
	});

	test("creates an agent-scoped rule with scopeId", async ({ db }) => {
		const rule = await createActionRule(db, {
			pattern: "deploy",
			description: "Deploy to production",
			scope: "agent",
			scopeId: "agent-xyz",
		});

		expect(rule.scope).toBe("agent");
		expect(rule.scopeId).toBe("agent-xyz");
	});

	test("ignores scopeId for global rules (sets null)", async ({ db }) => {
		const rule = await createActionRule(db, {
			pattern: "git push",
			description: "Push",
			scope: "global",
			scopeId: "should-be-ignored",
		});

		expect(rule.scopeId).toBeNull();
	});
});

describe("action rules — list", () => {
	test("listActionRules returns all rules ordered by createdAt", async ({ db }) => {
		await createActionRule(db, {
			pattern: "first",
			description: "First",
			scope: "global",
			now: "2026-08-30T00:00:00.000Z",
		});
		await createActionRule(db, {
			pattern: "second",
			description: "Second",
			scope: "global",
			now: "2026-08-30T01:00:00.000Z",
		});

		const rules = await listActionRules(db);
		expect(rules).toHaveLength(2);
		expect(rules[0]?.pattern).toBe("first");
		expect(rules[1]?.pattern).toBe("second");
	});
});

describe("action rules — delete", () => {
	test("deleteActionRule removes the row and returns true", async ({ db }) => {
		const rule = await createActionRule(db, {
			pattern: "git push",
			description: "Push",
			scope: "global",
		});

		const removed = await deleteActionRule(db, rule.id);
		expect(removed).toBe(true);

		const remaining = await listActionRules(db);
		expect(remaining).toHaveLength(0);
	});

	test("deleteActionRule returns false for unknown id", async ({ db }) => {
		const removed = await deleteActionRule(db, "rule-does-not-exist");
		expect(removed).toBe(false);
	});
});

describe("action rules — resolution by union", () => {
	test("global rules apply to any session", async ({ db }) => {
		await createActionRule(db, {
			pattern: "git push",
			description: "Global push rule",
			scope: "global",
		});

		const rulesForA = await resolveActionRules(db, { agentId: "agent-1", teamId: "team-1" });
		const rulesForB = await resolveActionRules(db, { agentId: "agent-2", teamId: "team-2" });

		expect(rulesForA).toHaveLength(1);
		expect(rulesForA[0]?.pattern).toBe("git push");
		expect(rulesForB).toHaveLength(1);
		expect(rulesForB[0]?.pattern).toBe("git push");
	});

	test("team rules apply only when teamId matches", async ({ db }) => {
		await createActionRule(db, {
			pattern: "deploy",
			description: "Team deploy rule",
			scope: "team",
			scopeId: "team-a",
		});

		const rulesForTeamA = await resolveActionRules(db, { agentId: "agent-1", teamId: "team-a" });
		const rulesForTeamB = await resolveActionRules(db, { agentId: "agent-1", teamId: "team-b" });
		const rulesWithNoTeam = await resolveActionRules(db, { agentId: "agent-1" });

		expect(rulesForTeamA).toHaveLength(1);
		expect(rulesForTeamA[0]?.pattern).toBe("deploy");
		expect(rulesForTeamB).toHaveLength(0);
		expect(rulesWithNoTeam).toHaveLength(0);
	});

	test("agent rules apply only when agentId matches", async ({ db }) => {
		await createActionRule(db, {
			pattern: "rm -rf",
			description: "Agent delete rule",
			scope: "agent",
			scopeId: "agent-special",
		});

		const rulesForSpecial = await resolveActionRules(db, {
			agentId: "agent-special",
			teamId: "team-1",
		});
		const rulesForOther = await resolveActionRules(db, {
			agentId: "agent-other",
			teamId: "team-1",
		});

		expect(rulesForSpecial).toHaveLength(1);
		expect(rulesForSpecial[0]?.pattern).toBe("rm -rf");
		expect(rulesForOther).toHaveLength(0);
	});

	test("resolves union of all three scopes — global + team + agent", async ({ db }) => {
		// Global rule
		await createActionRule(db, {
			pattern: "git push",
			description: "Global",
			scope: "global",
		});
		// Team rule for team-x
		await createActionRule(db, {
			pattern: "deploy",
			description: "Team",
			scope: "team",
			scopeId: "team-x",
		});
		// Agent rule for agent-y
		await createActionRule(db, {
			pattern: "rm -rf",
			description: "Agent",
			scope: "agent",
			scopeId: "agent-y",
		});
		// Noise: team rule for a different team
		await createActionRule(db, {
			pattern: "other-team-op",
			description: "Other team",
			scope: "team",
			scopeId: "team-z",
		});
		// Noise: agent rule for a different agent
		await createActionRule(db, {
			pattern: "other-agent-op",
			description: "Other agent",
			scope: "agent",
			scopeId: "agent-z",
		});

		const rules = await resolveActionRules(db, { agentId: "agent-y", teamId: "team-x" });

		expect(rules).toHaveLength(3);
		const patterns = rules.map((r) => r.pattern).sort();
		expect(patterns).toEqual(["deploy", "git push", "rm -rf"]);
	});

	test("teamless agent gets global + own agent rules only", async ({ db }) => {
		await createActionRule(db, {
			pattern: "git push",
			description: "Global",
			scope: "global",
		});
		await createActionRule(db, {
			pattern: "deploy",
			description: "Team rule — should be excluded",
			scope: "team",
			scopeId: "team-x",
		});
		await createActionRule(db, {
			pattern: "rm -rf",
			description: "Agent",
			scope: "agent",
			scopeId: "agent-solo",
		});

		const rules = await resolveActionRules(db, { agentId: "agent-solo" });

		expect(rules).toHaveLength(2);
		const patterns = rules.map((r) => r.pattern).sort();
		expect(patterns).toEqual(["git push", "rm -rf"]);
	});
});
