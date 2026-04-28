import type { InlineNode } from "@hyperidle/shared";
import type { JSX, ReactNode } from "react";

/** Render an inline tree to React nodes. Pure, no sanitisation needed (text only). */
export function renderInline(nodes: InlineNode[]): ReactNode {
	return nodes.map((n, i) => renderNode(n, i));
}

function renderNode(node: InlineNode, key: number): JSX.Element | string {
	switch (node.type) {
		case "text":
			return node.value;
		case "strong":
			return (
				<strong key={key} className="text-[var(--text-strong)] font-semibold">
					{renderInline(node.children)}
				</strong>
			);
		case "emphasis":
			return (
				<em key={key} className="italic">
					{renderInline(node.children)}
				</em>
			);
		case "inlineCode":
			return (
				<code
					key={key}
					className="font-mono text-[0.92em] px-[4px] py-[1px] rounded-[var(--r1)] bg-[var(--surface-2)] text-[var(--text)]"
				>
					{node.value}
				</code>
			);
		case "link":
			return (
				<a
					key={key}
					href={node.href}
					className="text-[var(--primary)] underline underline-offset-2"
					rel="noopener noreferrer"
				>
					{renderInline(node.children)}
				</a>
			);
		case "break":
			return <br key={key} />;
	}
}
