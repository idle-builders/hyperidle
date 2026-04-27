/**
 * L9 — ArtifactShell metadata strip. Single wrapper that renders the L9
 * metadata strip (kind, risk, reversibility, cost, SLA, routing, sandbox)
 * with no duplication across the four renderers.
 */
import type { ArtifactMetadataExtended } from "@hyperidle/shared";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ArtifactShell } from "../ArtifactShell";

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

describe("L9: ArtifactShell metadata strip", () => {
	it("renders the metadata strip wrapper with the L9-specific testid", () => {
		render(
			<ArtifactShell metadata={baseMeta}>
				<div>body</div>
			</ArtifactShell>,
		);
		expect(screen.getByTestId("artifact-metadata-strip-v2")).toBeInTheDocument();
	});

	it("renders the kind badge", () => {
		render(
			<ArtifactShell metadata={baseMeta}>
				<div>body</div>
			</ArtifactShell>,
		);
		expect(screen.getByTestId("artifact-kind-badge")).toHaveTextContent(/action_summary/i);
	});

	it("renders a colored risk badge with the correct data attribute for 'critical'", () => {
		render(
			<ArtifactShell metadata={{ ...baseMeta, riskTier: "critical" }}>
				<div>body</div>
			</ArtifactShell>,
		);
		const badge = screen.getByTestId("artifact-risk-badge");
		expect(badge).toHaveAttribute("data-risk", "critical");
		expect(badge).toHaveTextContent(/critical/i);
	});

	it("emits a distinct data-risk attribute for low/medium/high/critical", () => {
		const tiers = ["low", "medium", "high", "critical"] as const;
		for (const t of tiers) {
			const { unmount } = render(
				<ArtifactShell metadata={{ ...baseMeta, riskTier: t }}>
					<div>body</div>
				</ArtifactShell>,
			);
			expect(screen.getByTestId("artifact-risk-badge")).toHaveAttribute("data-risk", t);
			unmount();
		}
	});

	it("renders an irreversible chip when reversibility is false", () => {
		render(
			<ArtifactShell metadata={{ ...baseMeta, reversibility: false }}>
				<div>body</div>
			</ArtifactShell>,
		);
		const chip = screen.getByTestId("artifact-reversibility");
		expect(chip).toHaveAttribute("data-reversible", "false");
		expect(chip).toHaveTextContent(/irreversible/i);
	});

	it("renders a reversible chip when reversibility is true", () => {
		render(
			<ArtifactShell metadata={{ ...baseMeta, reversibility: true }}>
				<div>body</div>
			</ArtifactShell>,
		);
		const chip = screen.getByTestId("artifact-reversibility");
		expect(chip).toHaveAttribute("data-reversible", "true");
		expect(chip).toHaveTextContent(/reversible/i);
	});

	it("renders the cost-estimate chip when costEstimate is non-null", () => {
		render(
			<ArtifactShell metadata={{ ...baseMeta, costEstimate: 120 }}>
				<div>body</div>
			</ArtifactShell>,
		);
		expect(screen.getByTestId("artifact-cost")).toHaveTextContent(/120/);
	});

	it("omits the cost-estimate chip when costEstimate is null", () => {
		render(
			<ArtifactShell metadata={{ ...baseMeta, costEstimate: null }}>
				<div>body</div>
			</ArtifactShell>,
		);
		expect(screen.queryByTestId("artifact-cost")).toBeNull();
	});

	it("renders the SLA and routing fields from J4 metadata", () => {
		render(
			<ArtifactShell metadata={baseMeta}>
				<div>body</div>
			</ArtifactShell>,
		);
		expect(screen.getByTestId("artifact-sla")).toHaveTextContent("2h left");
		expect(screen.getByTestId("artifact-routing")).toHaveTextContent("Backend Agent");
	});

	it("renders the sandbox-result chip when present", () => {
		render(
			<ArtifactShell metadata={{ ...baseMeta, sandboxResult: "failed" }}>
				<div>body</div>
			</ArtifactShell>,
		);
		const sb = screen.getByTestId("artifact-sandbox");
		expect(sb).toHaveAttribute("data-sandbox", "failed");
		expect(sb).toHaveTextContent(/failed/i);
	});

	it("omits the sandbox-result chip when sandboxResult is null", () => {
		render(
			<ArtifactShell metadata={{ ...baseMeta, sandboxResult: null }}>
				<div>body</div>
			</ArtifactShell>,
		);
		expect(screen.queryByTestId("artifact-sandbox")).toBeNull();
	});

	it("renders the children below the metadata strip", () => {
		render(
			<ArtifactShell metadata={baseMeta}>
				<div data-testid="artifact-body">body content</div>
			</ArtifactShell>,
		);
		const strip = screen.getByTestId("artifact-metadata-strip-v2");
		const body = screen.getByTestId("artifact-body");
		// DOM_POSITION_FOLLOWING (4) means body comes after strip.
		const rel = strip.compareDocumentPosition(body);
		expect(rel & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
	});
});
