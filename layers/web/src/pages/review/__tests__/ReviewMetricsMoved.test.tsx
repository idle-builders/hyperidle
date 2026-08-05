import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MOCK_REVIEW_SUBJECT } from "../__fixtures__/review-subject.fixture";
import { getReviewCanvas } from "../canvas-registry";
import type { MetricsMovedPayload, ReviewArtifact } from "../review-artifact";

const artifact = MOCK_REVIEW_SUBJECT.artifacts.find(
	(a) => a.kind === "metrics_moved",
)! as ReviewArtifact<MetricsMovedPayload>;

function renderCanvas() {
	const Canvas = getReviewCanvas(artifact.kind);
	return render(<Canvas artifact={artifact} />);
}

describe("ReviewMetricsMoved canvas", () => {
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

	it("renders the moved headline and roll-forward table (L2)", () => {
		renderCanvas();

		expect(screen.getAllByText(/Recognized revenue/i).length).toBeGreaterThan(0);
		expect(screen.getByText(/Roll-forward/i)).toBeInTheDocument();
		expect(screen.getAllByText(/ties to bank/i).length).toBeGreaterThan(0);
	});

	it("surfaces exceptions, floating needs-you items", () => {
		renderCanvas();

		expect(screen.getByText(/Exceptions/i)).toBeInTheDocument();
		expect(screen.getByText(/Unidentified wire/i)).toBeInTheDocument();
	});

	it("exposes a detail affordance (L3)", () => {
		renderCanvas();

		expect(screen.getAllByRole("button", { name: /Where from\?/i }).length).toBeGreaterThan(0);
	});
});
