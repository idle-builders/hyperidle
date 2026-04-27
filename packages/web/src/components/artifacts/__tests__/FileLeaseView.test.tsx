/**
 * L9 — FileLeaseView. Renders side-by-side competing artifacts and
 * exposes Grant lease to A / Ask both to coordinate / Grant lease to B
 * verdict-variant labels.
 */
import type { ArtifactMetadataExtended, FileLeasePayload } from "@hyperidle/shared";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FileLeaseView, getFileLeaseVariants } from "../FileLeaseView";

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

const payload: FileLeasePayload = {
	filePath: "packages/web/src/pages/Auth.tsx",
	agentA: { name: "Developer", artifactSnippet: "+import { Auth } from '...'" },
	agentB: { name: "Builder", artifactSnippet: "+export function Auth() {}" },
};

describe("L9: FileLeaseView", () => {
	it("wraps content in the shared ArtifactShell metadata strip", () => {
		render(<FileLeaseView metadata={meta} payload={payload} />);
		expect(screen.getByTestId("artifact-metadata-strip-v2")).toBeInTheDocument();
	});

	it("renders the file path", () => {
		render(<FileLeaseView metadata={meta} payload={payload} />);
		expect(screen.getByText("packages/web/src/pages/Auth.tsx")).toBeInTheDocument();
	});

	it("renders side-by-side columns for agent A and agent B", () => {
		render(<FileLeaseView metadata={meta} payload={payload} />);
		const colA = screen.getByTestId("file-lease-a");
		const colB = screen.getByTestId("file-lease-b");
		expect(colA).toHaveTextContent("Developer");
		expect(colA).toHaveTextContent("import { Auth }");
		expect(colB).toHaveTextContent("Builder");
		expect(colB).toHaveTextContent("export function Auth");
	});

	it("exposes verdictVariants {approve, requestChanges, reject} via getFileLeaseVariants", () => {
		const variants = getFileLeaseVariants(payload);
		expect(variants.approve).toMatch(/grant lease to (a|developer)/i);
		expect(variants.reject).toMatch(/grant lease to (b|builder)/i);
		expect(variants.requestChanges).toMatch(/coordinate/i);
	});

	it("does not render its own metadata-strip duplicate", () => {
		const { container } = render(<FileLeaseView metadata={meta} payload={payload} />);
		expect(container.querySelectorAll("[data-testid='artifact-metadata-strip-v2']")).toHaveLength(
			1,
		);
	});
});
