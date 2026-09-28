import type { JSX, ReactNode } from "react";
import type { InlineNode } from "../../block/types.js";

/** Render an inline tree to React nodes. Pure, no sanitisation needed (text only). */
export function renderInline(nodes: InlineNode[]): ReactNode {
	return nodes.map((n, i) => renderNode(n, i));
}

function renderNode(node: InlineNode, key: number): JSX.Element | string {
	switch (node.type) {
		case "text":
			return node.value;
		case "strong":
			return <strong key={key}>{renderInline(node.children)}</strong>;
		case "emphasis":
			return <em key={key}>{renderInline(node.children)}</em>;
		case "inlineCode":
			return (
				<code
					key={key}
					data-az16-profile="inline-code"
					className="type-inline-code   px-[3px] py-[3px] rounded-[var(--r-subtle)] bg-[var(--surface-container)] text-[var(--text-primary)]"
				>
					{node.value}
				</code>
			);
		case "link":
			return (
				<a
					key={key}
					href={node.href}
					className="text-[var(--accent-deep)] underline underline-offset-2"
					rel="noopener noreferrer"
				>
					{renderInline(node.children)}
				</a>
			);
		case "break":
			return <br key={key} />;
	}
	throw new Error(`Unhandled inline node type: ${(node as { type: string }).type}`);
}
