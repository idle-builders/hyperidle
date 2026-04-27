import type { ArtifactMetadataExtended } from "@hyperidle/shared";
import { ActionSummaryView } from "./ActionSummaryView";

export default { title: "ActionSummaryView", tier: "3" as const };

const meta: ArtifactMetadataExtended = {
	kind: "action_summary",
	riskTier: "critical",
	reversibility: false,
	costEstimate: 120,
	blastRadius: { agents: [], teams: [], products: ["hyperidle-web"] },
	sandboxResult: "passed",
	status: "pending",
	sla: "2h left",
	routing: "Deploy Agent",
};

export const CriticalDeploy = (): React.JSX.Element => (
	<ActionSummaryView
		metadata={meta}
		payload={{
			actionType: "deploy",
			summary: "Deploy hyperidle-web v2.4.1 to prod",
			impactList: [
				{ label: "Affected products", value: "hyperidle-web, hyperidle-api" },
				{ label: "User-facing", value: "yes" },
				{ label: "Rollback ETA", value: "4m" },
			],
			confirmToken: "deploy",
		}}
	/>
);

export const PricingChange = (): React.JSX.Element => (
	<ActionSummaryView
		metadata={{ ...meta, riskTier: "high", routing: "Growth Agent" }}
		payload={{
			actionType: "pricing",
			summary: "Lower starter plan to $9/mo",
			impactList: [
				{ label: "Existing customers", value: "1,243" },
				{ label: "Estimated MRR delta", value: "-$2,100" },
			],
			confirmToken: "lower-pricing",
		}}
	/>
);
