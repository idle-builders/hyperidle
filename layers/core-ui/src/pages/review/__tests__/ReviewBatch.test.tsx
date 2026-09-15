import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MOCK_REVIEW_SUBJECT } from "../__fixtures__/review-subject.fixture";
import { getReviewCanvas } from "../canvas-registry";
import type { BatchPayload, ReviewArtifact } from "../review-artifact";

const artifact = MOCK_REVIEW_SUBJECT.artifacts.find(
	(a) => a.kind === "batch",
)! as ReviewArtifact<BatchPayload>;

function renderCanvas() {
	const Canvas = getReviewCanvas(artifact.kind);
	return render(<Canvas artifact={artifact} />);
}

describe("ReviewBatch canvas", () => {
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

	it("pins flagged items before collapsed routine groups", () => {
		renderCanvas();

		const flagged = screen.getAllByText(/Churn threat on/i)[0]!;
		const routine = screen.getByText(/18 auto-resolved/i);
		expect(flagged.compareDocumentPosition(routine) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
			Node.DOCUMENT_POSITION_FOLLOWING,
		);
	});

	it("renders the rollup counts (L1)", () => {
		renderCanvas();

		expect(screen.getByText(String(artifact.payload.rollup.total))).toBeInTheDocument();
		expect(screen.getByText(String(artifact.payload.rollup.needYou))).toBeInTheDocument();
	});
});
