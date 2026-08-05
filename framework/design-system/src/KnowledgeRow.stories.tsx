import { KnowledgeRow } from "./KnowledgeRow";

export default {
	title: "KnowledgeRow",
	tier: "2" as const,
	uses: ["StatusChip", "Tag"],
	order: ["Validated", "Stale", "FactoryMode", "AllLayers", "WithSignals", "NullSignals"],
};

export const Validated = (): React.JSX.Element => (
	<KnowledgeRow
		title="API Rate Limiting Pattern"
		layer="L2"
		kind="pattern"
		status="validated"
		timestamp="3 hours ago"
	/>
);

export const Stale = (): React.JSX.Element => (
	<KnowledgeRow
		title="Old Deployment Strategy"
		layer="L1"
		kind="decision"
		status="stale"
		timestamp="2 days ago"
	/>
);

export const FactoryMode = (): React.JSX.Element => (
	<KnowledgeRow
		title="Agent Autonomy Policy"
		layer="L0"
		kind="decision"
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
			layer="L2"
			kind="pattern"
			status="validated"
			timestamp="2d ago"
			signals={{ recency: "2d", frequency: 7, citation: null }}
		/>
		<KnowledgeRow
			title="Agent Autonomy Policy"
			layer="L0"
			kind="decision"
			status="active"
			timestamp="1w ago"
			signals={{ recency: "1w", frequency: 2, citation: 3 }}
		/>
	</div>
);

export const NullSignals = (): React.JSX.Element => (
	<KnowledgeRow
		title="Old Deployment Strategy"
		layer="L1"
		kind="decision"
		status="stale"
		timestamp="30d ago"
		signals={{ recency: null, frequency: null, citation: null }}
	/>
);

export const AllLayers = (): React.JSX.Element => (
	<div className="flex flex-col gap-1">
		<KnowledgeRow title="L0 item" layer="L0" kind="brief" status="captured" timestamp="now" />
		<KnowledgeRow title="L1 item" layer="L1" kind="principle" status="active" timestamp="1h ago" />
		<KnowledgeRow title="L2 item" layer="L2" kind="pattern" status="validated" timestamp="2h ago" />
		<KnowledgeRow
			title="L3 item"
			layer="L3"
			kind="anti_pattern"
			status="provisional"
			timestamp="3h ago"
		/>
		<KnowledgeRow
			title="L4 item"
			layer="L4"
			kind="reflection"
			status="archived"
			timestamp="1d ago"
		/>
	</div>
);
