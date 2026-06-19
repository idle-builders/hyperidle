import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MOCK_REVIEW_SUBJECT } from "../__fixtures__/review-subject.fixture";
import { getReviewCanvas } from "../canvas-registry";
import type { ActionOperationPayload, ReviewArtifact } from "../review-artifact";

const artifact = MOCK_REVIEW_SUBJECT.artifacts.find(
	(a) => a.kind === "action_operation",
)! as ReviewArtifact<ActionOperationPayload>;

function renderCanvas() {
	const Canvas = getReviewCanvas(artifact.kind);
	return render(<Canvas artifact={artifact} />);
}

describe("ReviewActionOperation canvas", () => {
	it("renders the artifact title (L1)", () => {
		renderCanvas();

		expect(screen.getByText(artifact.title)).toBeInTheDocument();
	});

	it("shows the tool logo and a safe source link back to the record", () => {
		renderCanvas();

		expect(screen.getByTitle(artifact.app)).toBeInTheDocument();
		const link = screen.getByRole("link", { name: `Open in ${artifact.app}` });
		expect(link).toHaveAttribute("href", artifact.sourceHref);
		expect(link.textContent).toContain("↗");
	});

	it("renders the amount and irreversible marker (L1)", () => {
		renderCanvas();

		expect(screen.getByText(artifact.payload.amountWire.formatted)).toBeInTheDocument();
		expect(screen.getAllByText(/Irreversible/i).length).toBeGreaterThan(0);
	});

	it("renders the receipt fields (L2)", () => {
		renderCanvas();

		for (const field of artifact.payload.receiptFields) {
			expect(screen.getByText(field.label)).toBeInTheDocument();
			expect(screen.getByText(field.value)).toBeInTheDocument();
		}
	});

	it("exposes blast radius and reversibility detail (L3)", () => {
		renderCanvas();

		expect(screen.getByRole("button", { name: /Blast radius/i })).toBeInTheDocument();
		expect(screen.getByText(/What this touches/i)).toBeInTheDocument();
	});
});
