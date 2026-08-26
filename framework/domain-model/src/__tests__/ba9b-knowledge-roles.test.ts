/**
 * BA9b: Unit tests for knowledge role mapping in toBakedContextKnowledgeItems.
 * Proves agentBindingId derivation from scopeId for agent_file items.
 *
 * Note: role and scopeId are now required on SessionKnowledgeItemLike (no compat
 * shim). agentBindingId is always derived from role+scopeId — not set explicitly.
 */
import { describe, expect, it } from "vitest";
import { toBakedContextKnowledgeItems } from "../work-intent.js";

function makeItem(overrides: {
	id?: string;
	title?: string;
	body?: string;
	format?: string;
	version?: number;
	layer?: string | null;
	role: string;
	scopeId: string | null;
}) {
	return {
		id: overrides.id ?? "k-1",
		title: overrides.title ?? "Test Item",
		body: overrides.body ?? "Body",
		format: overrides.format ?? "markdown",
		version: overrides.version ?? 1,
		layer: overrides.layer ?? null,
		role: overrides.role,
		scopeId: overrides.scopeId,
	};
}

describe("BA9b: toBakedContextKnowledgeItems — role and agentBindingId", () => {
	it("ordinary items have role='ordinary' and agentBindingId=null", () => {
		const [result] = toBakedContextKnowledgeItems([makeItem({ role: "ordinary", scopeId: null })]);
		expect(result?.role).toBe("ordinary");
		expect(result?.agentBindingId).toBeNull();
	});

	it("skill items have role='skill' and agentBindingId=null", () => {
		const [result] = toBakedContextKnowledgeItems([makeItem({ role: "skill", scopeId: null })]);
		expect(result?.role).toBe("skill");
		expect(result?.agentBindingId).toBeNull();
	});

	it("rule items have role='rule' and agentBindingId=null", () => {
		const [result] = toBakedContextKnowledgeItems([makeItem({ role: "rule", scopeId: null })]);
		expect(result?.role).toBe("rule");
		expect(result?.agentBindingId).toBeNull();
	});

	it("agent_file items derive agentBindingId from scopeId", () => {
		const [result] = toBakedContextKnowledgeItems([
			makeItem({ role: "agent_file", scopeId: "agent-xyz" }),
		]);
		expect(result?.role).toBe("agent_file");
		expect(result?.agentBindingId).toBe("agent-xyz");
	});

	it("agent_file with null scopeId has null agentBindingId (unbound)", () => {
		const [result] = toBakedContextKnowledgeItems([
			makeItem({ role: "agent_file", scopeId: null }),
		]);
		expect(result?.agentBindingId).toBeNull();
	});
});
