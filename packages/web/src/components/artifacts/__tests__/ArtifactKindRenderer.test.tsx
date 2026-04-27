/**
 * L9 — ArtifactKindRenderer dispatcher. The four L9 renderers funnel
 * through a single dispatcher that switches on `artifact.kind`.
 */
import type { ArtifactMetadataExtended } from "@hyperidle/shared";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ArtifactKindRenderer } from "../ArtifactKindRenderer";

function metaFor(kind: ArtifactMetadataExtended["kind"]): ArtifactMetadataExtended {
	return {
		kind,
		riskTier: "medium",
		reversibility: true,
		costEstimate: null,
		blastRadius: { agents: [], teams: [], products: [] },
		sandboxResult: null,
		status: "pending",
		sla: "",
		routing: "",
	};
}

describe("L9: ArtifactKindRenderer dispatch", () => {
	it("dispatches kind=action_summary to ActionSummaryView", () => {
		render(
			<ArtifactKindRenderer
				kind="action_summary"
				metadata={metaFor("action_summary")}
				payload={{
					actionType: "deploy",
					summary: "summary line",
					impactList: [{ label: "x", value: "y" }],
					confirmToken: "deploy",
				}}
			/>,
		);
		expect(screen.getByTestId("action-summary-impact-list")).toBeInTheDocument();
	});

	it("dispatches kind=skill_change to SkillChangeView", () => {
		render(
			<ArtifactKindRenderer
				kind="skill_change"
				metadata={metaFor("skill_change")}
				payload={{
					skillId: "skill:test",
					diff: { before: "a", after: "b" },
					agentImpacts: [{ agentName: "Architect", behaviorChange: "x" }],
					rolloutPolicy: null,
				}}
			/>,
		);
		expect(screen.getByTestId("skill-change-impact-list")).toBeInTheDocument();
	});

	it("dispatches kind=file_lease to FileLeaseView", () => {
		render(
			<ArtifactKindRenderer
				kind="file_lease"
				metadata={metaFor("file_lease")}
				payload={{
					filePath: "x.ts",
					agentA: { name: "A", artifactSnippet: "a" },
					agentB: { name: "B", artifactSnippet: "b" },
				}}
			/>,
		);
		expect(screen.getByTestId("file-lease-a")).toBeInTheDocument();
		expect(screen.getByTestId("file-lease-b")).toBeInTheDocument();
	});

	it("dispatches kind=permission_request to PermissionRequestView", () => {
		render(
			<ArtifactKindRenderer
				kind="permission_request"
				metadata={metaFor("permission_request")}
				payload={{
					requesterAgentId: "agent:b",
					requesterAgentName: "Builder",
					skillId: "deploy",
					currentLevel: 2,
					requestedLevel: 3,
					justification: "earned",
				}}
			/>,
		);
		expect(screen.getByTestId("perm-req-current-level")).toBeInTheDocument();
		expect(screen.getByTestId("perm-req-requested-level")).toBeInTheDocument();
	});
});
