export interface DocumentTreeItem {
	id: string;
	title: string;
	body: string;
	format: string;
	status: string;
	version: number;
	updatedBy: string;
	scopeKind?: string;
	scopeId?: string | null;
	createdAt: string;
	updatedAt: string;
	parentKind?: string | null;
	parentId?: string | null;
}

export interface DocumentTreeRow {
	item: DocumentTreeItem;
	depth: number;
	/** True when this item has at least one child visible in the current filter set. */
	hasChildren: boolean;
}

export function buildDocumentTree(items: DocumentTreeItem[]): DocumentTreeRow[] {
	const ids = new Set(items.map((i) => i.id));
	const childrenByParent = new Map<string, DocumentTreeItem[]>();
	const roots: DocumentTreeItem[] = [];
	for (const item of items) {
		if (item.parentId && ids.has(item.parentId)) {
			const siblings = childrenByParent.get(item.parentId) ?? [];
			siblings.push(item);
			childrenByParent.set(item.parentId, siblings);
		} else {
			roots.push(item);
		}
	}

	const rows: DocumentTreeRow[] = [];
	const visited = new Set<string>();
	function visit(item: DocumentTreeItem, depth: number): void {
		// Depth-32 cycle backstop — a malformed tree must not hang the tab.
		if (visited.has(item.id) || depth > 32) return;
		visited.add(item.id);
		const children = childrenByParent.get(item.id) ?? [];
		rows.push({ item, depth, hasChildren: children.length > 0 });
		for (const child of children) visit(child, depth + 1);
	}
	for (const root of roots) visit(root, 0);
	return rows;
}

export function visibleDocumentTreeRows(
	rows: DocumentTreeRow[],
	collapsedIds: ReadonlySet<string>,
): DocumentTreeRow[] {
	const result: DocumentTreeRow[] = [];
	let skipDepthFrom: number | null = null;
	for (const row of rows) {
		if (skipDepthFrom !== null && row.depth > skipDepthFrom) continue;
		skipDepthFrom = null;
		result.push(row);
		if (collapsedIds.has(row.item.id) && row.hasChildren) {
			skipDepthFrom = row.depth;
		}
	}
	return result;
}
