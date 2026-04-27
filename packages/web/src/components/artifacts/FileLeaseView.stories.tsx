import type { ArtifactMetadataExtended } from "@hyperidle/shared";
import { FileLeaseView } from "./FileLeaseView";

export default { title: "FileLeaseView", tier: "3" as const };

const meta: ArtifactMetadataExtended = {
	kind: "file_lease",
	riskTier: "medium",
	reversibility: true,
	costEstimate: 1,
	blastRadius: { agents: ["Developer", "Builder"], teams: [], products: ["hyperidle-web"] },
	sandboxResult: "n/a",
	status: "pending",
	sla: "30m left",
	routing: "Architect",
};

export const TwoAgentsCompete = (): React.JSX.Element => (
	<FileLeaseView
		metadata={meta}
		payload={{
			filePath: "packages/web/src/pages/Auth.tsx",
			agentA: {
				name: "Developer",
				artifactSnippet: "+import { Auth } from '...'\n+function Auth() { return null }",
			},
			agentB: {
				name: "Builder",
				artifactSnippet: "+export function Auth() { return null }",
			},
		}}
	/>
);
