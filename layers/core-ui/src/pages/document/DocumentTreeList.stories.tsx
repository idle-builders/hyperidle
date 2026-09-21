/**
 * DocumentTreeList stories — nested browse tree for the Curated tab.
 */
import type { JSX } from "react";
import { buildKnowledgeTree } from "./build-document-tree.js";
import { DocumentTreeList } from "./DocumentTreeList.js";

const demoItems = [
	{
		id: "product",
		title: "Product",
		body: "Root product knowledge.",
		format: "markdown",
		status: "active",
		version: 1,
		updatedBy: "u-1",
		scopeKind: "factory",
		createdAt: "2026-01-01T00:00:00.000Z",
		updatedAt: "2026-01-03T00:00:00.000Z",
		parentId: null,
		parentKind: null,
	},
	{
		id: "pricing",
		title: "Pricing",
		body: "How we price.",
		format: "markdown",
		status: "active",
		version: 1,
		updatedBy: "u-1",
		scopeKind: "factory",
		createdAt: "2026-01-02T00:00:00.000Z",
		updatedAt: "2026-01-02T00:00:00.000Z",
		parentId: "product",
		parentKind: "document",
	},
	{
		id: "objections",
		title: "Objection handling",
		body: "Answers for common pushback.",
		format: "markdown",
		status: "active",
		version: 1,
		updatedBy: "u-1",
		scopeKind: "factory",
		createdAt: "2026-01-03T00:00:00.000Z",
		updatedAt: "2026-01-03T00:00:00.000Z",
		parentId: "pricing",
		parentKind: "document",
	},
	{
		id: "practices",
		title: "Practices",
		body: "How the team works.",
		format: "markdown",
		status: "active",
		version: 1,
		updatedBy: "u-1",
		scopeKind: "factory",
		createdAt: "2026-01-01T00:00:00.000Z",
		updatedAt: "2026-01-01T00:00:00.000Z",
		parentId: null,
		parentKind: null,
	},
];

export default { title: "DocumentTreeList", group: "Document" };

export function NestedTree(): JSX.Element {
	return (
		<div className="max-w-[480px] bg-[var(--surface-elevated)] rounded-[var(--r-default)] overflow-hidden">
			<DocumentTreeList
				rows={buildKnowledgeTree(demoItems)}
				onNavigate={() => undefined}
				onNewChild={() => undefined}
			/>
		</div>
	);
}
