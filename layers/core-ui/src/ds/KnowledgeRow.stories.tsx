import { KnowledgeRow } from "./KnowledgeRow";

export default {
	title: "KnowledgeRow",
	tier: "2" as const,
	uses: ["StatusChip"],
	order: ["Active", "Stale", "FactoryMode", "AllStatuses", "WithSignals", "NullSignals"],
};

export const Active = (): React.JSX.Element => (
	<KnowledgeRow title="API Rate Limiting Pattern" status="active" timestamp="3 hours ago" />
);

export const Stale = (): React.JSX.Element => (
	<KnowledgeRow title="Old Deployment Strategy" status="stale" timestamp="2 days ago" />
);

export const FactoryMode = (): React.JSX.Element => (
	<KnowledgeRow
		title="Agent Autonomy Policy"
		status="active"
		timestamp="1w ago"
		factoryMode
		version="v2.1"
	/>
);

export const WithSignals = (): React.JSX.Element => (
	<div className="flex flex-col gap-1">
		<KnowledgeRow
			title="Auth Rate Limiting Pattern"
			status="active"
			timestamp="2d ago"
			signals={{ recency: "2d", frequency: 7, citation: null }}
		/>
		<KnowledgeRow
			title="Agent Autonomy Policy"
			status="active"
			timestamp="1w ago"
			signals={{ recency: "1w", frequency: 2, citation: 3 }}
		/>
	</div>
);

export const NullSignals = (): React.JSX.Element => (
	<KnowledgeRow
		title="Old Deployment Strategy"
		status="stale"
		timestamp="30d ago"
		signals={{ recency: null, frequency: null, citation: null }}
	/>
);

/** @lore nested-knowledge-items: exhaustive over the 4-value status ladder. */
export const AllStatuses = (): React.JSX.Element => (
	<div className="flex flex-col gap-1">
		<KnowledgeRow title="Proposed item" status="proposed" timestamp="now" />
		<KnowledgeRow title="Active item" status="active" timestamp="1h ago" />
		<KnowledgeRow title="Stale item" status="stale" timestamp="90d ago" />
		<KnowledgeRow title="Archived item" status="archived" timestamp="1y ago" />
	</div>
);
