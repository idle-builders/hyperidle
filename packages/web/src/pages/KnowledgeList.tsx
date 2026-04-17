/**
 * Knowledge/List page — shows a list of knowledge items using KnowledgeRow (Tier 2).
 * Links to KnowledgeDetail for each item.
 */
import type { KnowledgeKind, KnowledgeLayer, KnowledgeStatus } from "@hyperidle/shared";
import type { JSX } from "react";
import { useNavigate } from "react-router-dom";
import { KnowledgeRow } from "../components/KnowledgeRow";

interface MockKnowledgeItem {
	id: string;
	title: string;
	layer: KnowledgeLayer;
	kind: KnowledgeKind;
	status: KnowledgeStatus;
	timestamp: string;
}

const MOCK_ITEMS: MockKnowledgeItem[] = [
	{
		id: "k1",
		title: "Architecture Decision: Auth Strategy",
		layer: "L0",
		kind: "decision",
		status: "active",
		timestamp: "1d ago",
	},
	{
		id: "k2",
		title: "API Rate Limiting Best Practices",
		layer: "L1",
		kind: "pattern",
		status: "active",
		timestamp: "2d ago",
	},
	{
		id: "k3",
		title: "User Interview Notes Q1",
		layer: "L0",
		kind: "brief",
		status: "stale",
		timestamp: "2w ago",
	},
	{
		id: "k4",
		title: "Component Library Guidelines",
		layer: "L1",
		kind: "principle",
		status: "active",
		timestamp: "3d ago",
	},
	{
		id: "k5",
		title: "Sprint Retro Outcomes",
		layer: "L2",
		kind: "reflection",
		status: "provisional",
		timestamp: "5h ago",
	},
];

export function KnowledgeList(): JSX.Element {
	const navigate = useNavigate();
	const loading = false;
	const error: string | null = null;

	if (loading) {
		return (
			<div className="flex flex-col gap-3 h-full" data-testid="knowledge-list-page">
				<div className="skeleton h-6 w-48" />
				<div className="skeleton h-12 w-full" />
				<div className="skeleton h-12 w-full" />
				<div className="skeleton h-12 w-full" />
			</div>
		);
	}

	if (error) {
		return (
			<div className="flex flex-col gap-3 h-full" data-testid="knowledge-list-page">
				<div role="alert" className="alert alert-error text-sm">
					{error}
				</div>
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-3 h-full" data-testid="knowledge-list-page">
			<h1 className="text-sm font-heading font-semibold uppercase tracking-wider text-[var(--text-lo)]">
				Knowledge Base
			</h1>
			<div className="flex flex-col">
				{MOCK_ITEMS.map((item) => (
					<KnowledgeRow
						key={item.id}
						title={item.title}
						layer={item.layer}
						kind={item.kind}
						status={item.status}
						timestamp={item.timestamp}
						onClick={() => navigate(`/knowledge/${item.id}`)}
					/>
				))}
			</div>
		</div>
	);
}
