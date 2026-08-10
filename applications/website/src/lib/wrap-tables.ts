/**
 * Rehype plugin: wrap every <table> in `<div class="table-wrap">` so wide
 * guide tables scroll horizontally inside the prose column on narrow screens
 * instead of overflowing the page. Markdown emits bare tables, so the wrap
 * happens here at build time (no runtime JS).
 */

interface HastNode {
	type: string;
	tagName?: string;
	properties?: Record<string, unknown>;
	children?: HastNode[];
}

export function rehypeWrapTables(): (tree: HastNode) => void {
	const wrap = (parent: HastNode): void => {
		const children = parent.children ?? [];
		for (let i = 0; i < children.length; i++) {
			const node = children[i];
			if (!node) continue;
			if (node.type === "element" && node.tagName === "table") {
				children[i] = {
					type: "element",
					tagName: "div",
					properties: { className: ["table-wrap"] },
					children: [node],
				};
				continue; // the table's own children never contain tables to wrap here
			}
			wrap(node);
		}
	};
	return (tree: HastNode): void => {
		wrap(tree);
	};
}
