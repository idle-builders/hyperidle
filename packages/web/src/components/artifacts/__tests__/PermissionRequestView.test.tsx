/**
 * L9 — PermissionRequestView.
 *
 * AC from TRACK-L.md L9: render current/requested autonomy level,
 * justification, and emit Approve once / Raise level / Deny + reason
 * verdict-variant labels.
 */
import type { ArtifactMetadataExtended } from "@hyperidle/shared";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { getVerdictVariants, PermissionRequestView } from "../PermissionRequestView";

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

const payload = {
	requesterAgentId: "agent:builder",
	requesterAgentName: "Builder",
	skillId: "deploy",
	currentLevel: 2 as const,
	requestedLevel: 3 as const,
	justification: "Last 12 deploys all green, 0 rollbacks. Trust earned.",
};

describe("L9: PermissionRequestView", () => {
	it("wraps content in the shared ArtifactShell metadata strip", () => {
		render(<PermissionRequestView metadata={meta} payload={payload} />);
		expect(screen.getByTestId("artifact-metadata-strip-v2")).toBeInTheDocument();
	});

	it("renders the requester agent name and skill id", () => {
		render(<PermissionRequestView metadata={meta} payload={payload} />);
		expect(screen.getByText(/Builder/)).toBeInTheDocument();
		// Match the skill id specifically — `getByRole("code")` is the
		// `<code>deploy</code>` rendering, distinct from the justification
		// `<p>` which contains the substring "deploys".
		expect(screen.getByRole("code")).toHaveTextContent(/^deploy$/);
	});

	it("renders the current level using AUTONOMY_LEVEL_META label (L2 = Asks before commit)", () => {
		render(<PermissionRequestView metadata={meta} payload={payload} />);
		const current = screen.getByTestId("perm-req-current-level");
		expect(current).toHaveTextContent(/L2/);
		expect(current).toHaveTextContent(/asks before commit/i);
	});

	it("renders the requested level using AUTONOMY_LEVEL_META label (L3 = Commits low-risk)", () => {
		render(<PermissionRequestView metadata={meta} payload={payload} />);
		const requested = screen.getByTestId("perm-req-requested-level");
		expect(requested).toHaveTextContent(/L3/);
		expect(requested).toHaveTextContent(/commits low-risk/i);
	});

	it("renders the justification text", () => {
		render(<PermissionRequestView metadata={meta} payload={payload} />);
		expect(
			screen.getByText(/Last 12 deploys all green, 0 rollbacks. Trust earned./),
		).toBeInTheDocument();
	});

	it("exposes verdictVariants {approve: 'Approve once', requestChanges: 'Raise level', reject: 'Deny + reason'} via getVerdictVariants", () => {
		const variants = getVerdictVariants();
		expect(variants.approve).toMatch(/approve once/i);
		expect(variants.requestChanges).toMatch(/raise level/i);
		expect(variants.reject).toMatch(/deny.*reason/i);
	});

	it("does not render its own metadata-strip duplicate", () => {
		const { container } = render(<PermissionRequestView metadata={meta} payload={payload} />);
		expect(container.querySelectorAll("[data-testid='artifact-metadata-strip-v2']")).toHaveLength(
			1,
		);
	});
});
