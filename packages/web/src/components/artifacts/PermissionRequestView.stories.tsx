import type { ArtifactMetadataExtended } from "@hyperidle/shared";
import { PermissionRequestView } from "./PermissionRequestView";

export default { title: "PermissionRequestView", tier: "3" as const };

const meta: ArtifactMetadataExtended = {
	kind: "permission_request",
	riskTier: "high",
	reversibility: true,
	costEstimate: null,
	blastRadius: { agents: ["Builder"], teams: [], products: [] },
	sandboxResult: null,
	status: "pending",
	sla: "1d left",
	routing: "CPO",
};

export const RaiseDeployFromL2ToL3 = (): React.JSX.Element => (
	<PermissionRequestView
		metadata={meta}
		payload={{
			requesterAgentId: "agent:builder",
			requesterAgentName: "Builder",
			skillId: "deploy",
			currentLevel: 2,
			requestedLevel: 3,
			justification: "Last 12 deploys all green, 0 rollbacks. Trust earned.",
		}}
	/>
);
