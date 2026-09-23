import { describe, expect, it } from "vitest";
import { buildParentOptions, type ParentCandidate } from "../parent-options.js";

function item(
	id: string,
	title: string,
	scopeKind: string,
	parentId: string | null = null,
	parentKind: string | null = null,
): ParentCandidate {
	return { id, title, scopeKind, parentId, parentKind };
}

describe("buildParentOptions", () => {
	it("offers every document-parented row plus roots when there is nothing to exclude", () => {
		const items = [item("a", "Alpha", "factory"), item("b", "Bravo", "factory", "a", "document")];
		const options = buildParentOptions(items, { childScopeKind: "factory" });
		expect(options.map((o) => o.value).sort()).toEqual(["a", "b"]);
	});

	it("excludes a task/thread/subscription/agent-parented row — off-tree by design", () => {
		const items = [
			item("a", "Alpha", "factory"),
			item("skill-1", "A Skill", "user", "agent-1", "agent"),
			item("prompt-1", "A Prompt", "factory", "routine-1", "routine"),
		];
		const options = buildParentOptions(items, { childScopeKind: "factory" });
		expect(options.map((o) => o.value)).toEqual(["a"]);
	});

	it("excludes the item itself and every descendant — the cycle rule", () => {
		const items = [
			item("root", "Root", "factory"),
			item("child", "Child", "factory", "root", "document"),
			item("grandchild", "Grandchild", "factory", "child", "document"),
			item("sibling", "Sibling", "factory", "root", "document"),
		];
		const options = buildParentOptions(items, { excludeId: "child", childScopeKind: "factory" });
		expect(options.map((o) => o.value).sort()).toEqual(["root", "sibling"]);
	});

	it("excludes a parent whose scope is narrower than the item's own — the narrowing rule", () => {
		const items = [
			item("factory-root", "Factory root", "factory"),
			item("team-root", "Team root", "team"),
			item("user-root", "User root", "user"),
		];
		// A team-scoped item may sit under factory or team, never under user.
		const options = buildParentOptions(items, { childScopeKind: "team" });
		expect(options.map((o) => o.value).sort()).toEqual(["factory-root", "team-root"]);
	});

	it("excludes a candidate whose own ancestor chain already reaches the depth cap", () => {
		// Build a chain of 32 document ancestors under "root" — the 32nd
		// item's own chain length is 32, which the server rejects as a parent.
		const items: ParentCandidate[] = [item("n0", "n0", "factory")];
		for (let i = 1; i < 32; i++) {
			items.push(item(`n${i}`, `n${i}`, "factory", `n${i - 1}`, "document"));
		}
		const options = buildParentOptions(items, { childScopeKind: "factory" });
		const values = new Set(options.map((o) => o.value));
		// n0..n30 have chain lengths 1..31 — all legal parents (< 32).
		for (let i = 0; i <= 30; i++) expect(values.has(`n${i}`)).toBe(true);
		// n31 has chain length 32 — the server refuses depth-exceeded.
		expect(values.has("n31")).toBe(false);
	});

	it("sorts options by title", () => {
		const items = [item("b", "Bravo", "factory"), item("a", "Alpha", "factory")];
		const options = buildParentOptions(items, { childScopeKind: "factory" });
		expect(options.map((o) => o.label)).toEqual(["Alpha", "Bravo"]);
	});
});
