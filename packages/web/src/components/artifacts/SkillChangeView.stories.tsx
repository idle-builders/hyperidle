import type { ArtifactMetadataExtended } from "@hyperidle/shared";
import { SkillChangeView } from "./SkillChangeView";

export default { title: "SkillChangeView", tier: "3" as const };

const meta: ArtifactMetadataExtended = {
	kind: "skill_change",
	riskTier: "high",
	reversibility: true,
	costEstimate: 3,
	blastRadius: { agents: ["Architect", "Developer", "Builder"], teams: [], products: [] },
	sandboxResult: "passed",
	status: "pending",
	sla: "1d left",
	routing: "Practice Facilitator",
};

export const TestsOnTypoSkill = (): React.JSX.Element => (
	<SkillChangeView
		metadata={meta}
		payload={{
			skillId: "skill:tests-on-typo",
			diff: {
				before: "Always rerun tests after typo fixes",
				after: "Skip tests when only comments change",
			},
			agentImpacts: [
				{ agentName: "Architect", behaviorChange: "no behavioral change" },
				{ agentName: "Developer", behaviorChange: "30% faster on doc-only PRs" },
				{ agentName: "Builder", behaviorChange: "30% faster on doc-only PRs" },
			],
			rolloutPolicy: null,
		}}
	/>
);

export const PolicyAlreadySelected = (): React.JSX.Element => (
	<SkillChangeView
		metadata={meta}
		payload={{
			skillId: "skill:tests-on-typo",
			diff: { before: "old behavior", after: "new behavior" },
			agentImpacts: [{ agentName: "Architect", behaviorChange: "no change" }],
			rolloutPolicy: { mode: "pin_version", value: "v3.2" },
		}}
	/>
);
