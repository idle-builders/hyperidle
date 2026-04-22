import { EmptyState } from "./EmptyState.js";

export default { title: "EmptyState" };

export const KnowledgeEmpty = (): React.JSX.Element => (
	<EmptyState
		title="No knowledge items yet"
		description="Agents will populate this as they learn."
	/>
);

export const TriageClear = (): React.JSX.Element => (
	<EmptyState
		title="Nothing needs attention"
		description="Triage is clear. Come back when agents surface something new."
	/>
);

export const ConversationsEmpty = (): React.JSX.Element => (
	<EmptyState
		title="No threads yet"
		description="Start a conversation with an agent to see it here."
	/>
);

export const PortfolioEmpty = (): React.JSX.Element => (
	<EmptyState
		title="No products in the portfolio"
		description="Add a product from Settings to start shaping bets."
	/>
);
