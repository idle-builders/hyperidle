import type { ArtifactMetadataExtended } from "@hyperidle/shared";
import { ArtifactShell } from "./ArtifactShell";

export default { title: "ArtifactShell", tier: "3" as const };

const baseMeta: ArtifactMetadataExtended = {
	kind: "action_summary",
	riskTier: "high",
	reversibility: false,
	costEstimate: 120,
	blastRadius: { agents: [], teams: [], products: ["hyperidle-web"] },
	sandboxResult: "passed",
	status: "pending",
	sla: "2h left",
	routing: "Backend Agent",
};

export const HighRiskIrreversible = (): React.JSX.Element => (
	<ArtifactShell metadata={baseMeta}>
		<p className="text-sm">Body content goes here.</p>
	</ArtifactShell>
);

export const CriticalRisk = (): React.JSX.Element => (
	<ArtifactShell metadata={{ ...baseMeta, riskTier: "critical" }}>
		<p className="text-sm">Critical-tier render.</p>
	</ArtifactShell>
);

export const ReversibleNoCost = (): React.JSX.Element => (
	<ArtifactShell
		metadata={{ ...baseMeta, reversibility: true, costEstimate: null, sandboxResult: null }}
	>
		<p className="text-sm">Reversible, no cost, no sandbox.</p>
	</ArtifactShell>
);

export const SandboxFailed = (): React.JSX.Element => (
	<ArtifactShell metadata={{ ...baseMeta, sandboxResult: "failed" }}>
		<p className="text-sm">Sandbox failed.</p>
	</ArtifactShell>
);
