import type { ArtifactMetadataExtended } from "@hyperidle/shared";
import { ArtifactKindRenderer } from "./ArtifactKindRenderer";

export default { title: "ArtifactKindRenderer", tier: "3" as const };

const baseMeta = (
	kind: ArtifactMetadataExtended["kind"],
	riskTier: ArtifactMetadataExtended["riskTier"],
): ArtifactMetadataExtended => ({
	kind,
	riskTier,
	reversibility: kind !== "action_summary",
	costEstimate: kind === "permission_request" ? null : 25,
	blastRadius: { agents: [], teams: [], products: [] },
	sandboxResult: kind === "permission_request" ? null : "passed",
	status: "pending",
	sla: "2h left",
	routing: "Routing Agent",
});

export const ActionSummaryDispatch = (): React.JSX.Element => (
	<ArtifactKindRenderer
		kind="action_summary"
		metadata={baseMeta("action_summary", "critical")}
		payload={{
			actionType: "deploy",
			summary: "Deploy hyperidle-web v2.4.1 to prod",
			impactList: [{ label: "Affected products", value: "hyperidle-web" }],
			confirmToken: "deploy",
		}}
	/>
);

export const SkillChangeDispatch = (): React.JSX.Element => (
	<ArtifactKindRenderer
		kind="skill_change"
		metadata={baseMeta("skill_change", "high")}
		payload={{
			skillId: "skill:tests-on-typo",
			diff: { before: "Always rerun tests", after: "Skip on doc-only PRs" },
			agentImpacts: [{ agentName: "Developer", behaviorChange: "30% faster on doc-only PRs" }],
			rolloutPolicy: null,
		}}
	/>
);

export const FileLeaseDispatch = (): React.JSX.Element => (
	<ArtifactKindRenderer
		kind="file_lease"
		metadata={baseMeta("file_lease", "medium")}
		payload={{
			filePath: "packages/web/src/pages/Auth.tsx",
			agentA: { name: "Developer", artifactSnippet: "+import { Auth } from '...'" },
			agentB: { name: "Builder", artifactSnippet: "+export function Auth() {}" },
		}}
	/>
);

export const PermissionRequestDispatch = (): React.JSX.Element => (
	<ArtifactKindRenderer
		kind="permission_request"
		metadata={baseMeta("permission_request", "high")}
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
