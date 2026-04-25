import { CurationSuggestionCard } from "./CurationSuggestionCard";

export default { title: "CurationSuggestionCard", tier: "utility" as const };

export const Merge = (): React.JSX.Element => (
	<CurationSuggestionCard
		action="Merge these 3 items?"
		detail="Auth Strategy, Rate Limiting, Legacy Mesh overlap on access-control concerns"
	/>
);

export const Coverage = (): React.JSX.Element => (
	<CurationSuggestionCard
		action="No coverage for topic Activation in 2 cycles"
		detail="Consider creating a brief for activation flow patterns"
	/>
);

export const Consolidate = (): React.JSX.Element => (
	<CurationSuggestionCard
		action="Consolidate duplicate cost-cap policies?"
		detail="2 items describe overlapping escalation rules"
	/>
);
