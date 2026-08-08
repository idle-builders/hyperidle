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
				<strong key={key} className="text-[var(--text-primary)] font-semibold">
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
					className="font-mono text-[0.92em] px-[3px] py-[3px] rounded-[var(--r-subtle)] bg-[var(--surface-container)] text-[var(--text-primary)]"
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
	// @lore Z8-166: TypeScript does not treat switch-on-discriminant as exhaustive
	// even when all union members are covered; the unreachable throw satisfies
	// the "function lacks ending return" TS2366 without a `default` that forces
	// `never` narrowing issues.
	throw new Error(`Unhandled inline node type: ${(node as { type: string }).type}`);
}
