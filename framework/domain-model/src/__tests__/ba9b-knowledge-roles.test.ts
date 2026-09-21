/**
 * BA9b: Unit tests for knowledge slot mapping in toBakedContextKnowledgeItems.
 * Proves agentBindingId derivation for agent_file items.
 *
 * @lore knowledge-attachment-slot: agentBindingId now derives from
 * `parentKind`/`parentId`, not `scopeId` — the binding moved from a reverse
 * scope lookup to the parent slot. `slot`, `parentKind` and `parentId` are
 * required on SessionKnowledgeItemLike (no compat shim); agentBindingId is
 * always derived, never set explicitly.
 *
 * @lore BC4: field renamed `role` -> `slot`, matching migration 0086 step 1's
 * DB column rename (architecture.md §2, §6.4). Values unchanged.
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
	slot: string;
	parentKind: string | null;
	parentId: string | null;
}) {
	return {
		id: overrides.id ?? "k-1",
		title: overrides.title ?? "Test Item",
		body: overrides.body ?? "Body",
		format: overrides.format ?? "markdown",
		version: overrides.version ?? 1,
		layer: overrides.layer ?? null,
		// architecture.md §5/D4: required, not defaulted inside
		// toBakedContextKnowledgeItems — every caller supplies its own.
		parentChain: [],
		scopeKind: "factory",
		slot: overrides.slot,
		parentKind: overrides.parentKind,
		parentId: overrides.parentId,
	};
}

describe("BA9b: toBakedContextKnowledgeItems — slot and agentBindingId", () => {
	it("ordinary items have slot='ordinary' and agentBindingId=null", () => {
		const [result] = toBakedContextKnowledgeItems([
			makeItem({ slot: "ordinary", parentKind: null, parentId: null }),
		]);
		expect(result?.slot).toBe("ordinary");
		expect(result?.agentBindingId).toBeNull();
	});

	it("skill items have slot='skill' and agentBindingId=null", () => {
		const [result] = toBakedContextKnowledgeItems([
			makeItem({ slot: "skill", parentKind: null, parentId: null }),
		]);
		expect(result?.slot).toBe("skill");
		expect(result?.agentBindingId).toBeNull();
	});

	it("rule items have slot='rule' and agentBindingId=null", () => {
		const [result] = toBakedContextKnowledgeItems([
			makeItem({ slot: "rule", parentKind: null, parentId: null }),
		]);
		expect(result?.slot).toBe("rule");
		expect(result?.agentBindingId).toBeNull();
	});

	it("agent_file items derive agentBindingId from parentKind='agent' + parentId", () => {
		const [result] = toBakedContextKnowledgeItems([
			makeItem({ slot: "agent_file", parentKind: "agent", parentId: "agent-xyz" }),
		]);
		expect(result?.slot).toBe("agent_file");
		expect(result?.agentBindingId).toBe("agent-xyz");
	});

	it("agent_file with no parent has null agentBindingId (unbound)", () => {
		const [result] = toBakedContextKnowledgeItems([
			makeItem({ slot: "agent_file", parentKind: null, parentId: null }),
		]);
		expect(result?.agentBindingId).toBeNull();
	});

	// @lore knowledge-attachment-slot §4: the deliberate behaviour flip — a
	// team-scoped agent_file used to derive agentBindingId=<teamId> (matches no
	// agent, so silently inert everywhere). It has no parent under the new
	// derivation, and null means UNBOUND — delivered to every session in reach.
	it("an agent_file whose parent is not 'agent' has null agentBindingId, even with a parentId present", () => {
		const [result] = toBakedContextKnowledgeItems([
			makeItem({ slot: "agent_file", parentKind: "routine", parentId: "routine-1" }),
		]);
		expect(result?.agentBindingId).toBeNull();
	});

	it("a prompt item has slot='prompt' and agentBindingId=null", () => {
		const [result] = toBakedContextKnowledgeItems([
			makeItem({ slot: "prompt", parentKind: "routine", parentId: "routine-1" }),
		]);
		expect(result?.slot).toBe("prompt");
		expect(result?.agentBindingId).toBeNull();
	});
});
