/**
 * Builds the legal destination-parent choices for a knowledge item — a
 * client-side mirror of `assertParentInvariants`
 * (`layers/core-api/knowledge/src/knowledge-repository.ts`) so the nest/move
 * picker never offers a choice the server will refuse.
 *
 * Mirrors, does not replace: a concurrent edit between render and submit can
 * still make a shown choice illegal (the parent's scope narrowed, the parent
 * itself moved under the item). The server is still the final word — see
 * `MoveDialog`'s error handling, which surfaces the 400's named rule rather
 * than a generic failure.
 */

const SCOPE_RANK: Readonly<Record<string, number>> = { factory: 0, team: 1, user: 2 };

function scopeRank(scopeKind: string): number {
	return SCOPE_RANK[scopeKind] ?? 0;
}

/** The max ancestor-chain length a candidate parent may already carry (architecture.md §3). */
const MAX_TREE_DEPTH = 32;

export interface ParentCandidate {
	readonly id: string;
	readonly title: string;
	readonly scopeKind: string;
	readonly parentId: string | null;
	readonly parentKind: string | null;
}

export interface ParentOption {
	readonly value: string;
	readonly label: string;
}

export interface BuildParentOptionsInput {
	/** Omit when creating a brand-new item — nothing can be its own descendant yet. */
	readonly excludeId?: string;
	/** The scope the item has (or will have) — governs the narrowing rule. */
	readonly childScopeKind: string;
}

/**
 * Only `knowledge_item`-parented rows (or roots) are browsable tree nodes —
 * task/thread/routine/agent-parented rows are off-tree by design
 * (architecture.md §3, "walks stop at the first non-knowledge_item parent").
 */
function isTreeNode(item: ParentCandidate): boolean {
	return item.parentKind === null || item.parentKind === "knowledge_item";
}

/** Every id that is `excludeId` itself or a descendant of it, within `treeItems`. */
function descendantsOf(
	treeItems: readonly ParentCandidate[],
	excludeId: string,
): ReadonlySet<string> {
	const childrenByParent = new Map<string, ParentCandidate[]>();
	for (const item of treeItems) {
		if (!item.parentId) continue;
		const siblings = childrenByParent.get(item.parentId) ?? [];
		siblings.push(item);
		childrenByParent.set(item.parentId, siblings);
	}
	const excluded = new Set<string>([excludeId]);
	const stack = [excludeId];
	while (stack.length > 0) {
		const current = stack.pop();
		if (current === undefined) continue;
		for (const child of childrenByParent.get(current) ?? []) {
			if (!excluded.has(child.id)) {
				excluded.add(child.id);
				stack.push(child.id);
			}
		}
	}
	return excluded;
}

/**
 * The number of `knowledge_item` ancestors `id` has, counting itself — the
 * same quantity `walkKnowledgeItemAncestorChain` computes server-side. A
 * child parented under `id` would resend at this length; the server rejects
 * a parent whose own chain already reaches `MAX_TREE_DEPTH`.
 */
function chainLength(byId: ReadonlyMap<string, ParentCandidate>, id: string): number {
	let length = 0;
	let current = byId.get(id);
	const seen = new Set<string>();
	while (current && !seen.has(current.id)) {
		seen.add(current.id);
		length += 1;
		current = current.parentId ? byId.get(current.parentId) : undefined;
	}
	return length;
}

export function buildParentOptions(
	items: readonly ParentCandidate[],
	input: BuildParentOptionsInput,
): ParentOption[] {
	const treeItems = items.filter(isTreeNode);
	const excluded = input.excludeId ? descendantsOf(treeItems, input.excludeId) : undefined;
	const byId = new Map(treeItems.map((item) => [item.id, item]));
	const childRank = scopeRank(input.childScopeKind);

	return treeItems
		.filter((item) => !excluded?.has(item.id))
		.filter((item) => scopeRank(item.scopeKind) <= childRank)
		.filter((item) => chainLength(byId, item.id) < MAX_TREE_DEPTH)
		.map((item) => ({ value: item.id, label: item.title }))
		.sort((a, b) => a.label.localeCompare(b.label));
}
