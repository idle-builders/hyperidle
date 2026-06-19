import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MOCK_REVIEW_SUBJECT } from "../__fixtures__/review-subject.fixture";
import { getReviewCanvas } from "../canvas-registry";
import type { OutcomeSummaryPayload, ReviewArtifact } from "../review-artifact";

const artifact = MOCK_REVIEW_SUBJECT.artifacts.find(
	(a) => a.kind === "outcome_summary",
)! as ReviewArtifact<OutcomeSummaryPayload>;

function renderCanvas() {
	const Canvas = getReviewCanvas(artifact.kind);
	return render(<Canvas artifact={artifact} />);
}

describe("ReviewOutcomeSummary canvas", () => {
	it("renders the artifact title and achieved summary (L1)", () => {
		renderCanvas();

		expect(screen.getByText(artifact.title)).toBeInTheDocument();
		expect(screen.getByText(artifact.payload.achieved)).toBeInTheDocument();
	});

	it("shows the tool logo and a safe source link back to the record", () => {
		renderCanvas();

		expect(screen.getByTitle(artifact.app)).toBeInTheDocument();
		const link = screen.getByRole("link", { name: `Open in ${artifact.app}` });
		expect(link).toHaveAttribute("href", artifact.sourceHref);
		expect(link.textContent).toContain("↗");
	});

	it("renders the done-conditions proof (L2)", () => {
		renderCanvas();

		expect(screen.getByText(/Done conditions/i)).toBeInTheDocument();
		expect(screen.getByText(/Exceptions routed to human/i)).toBeInTheDocument();
	});

	it("floats unmet conditions and needs-you items to the top", () => {
		renderCanvas();

		const unmet = screen.getByText(/Exceptions routed to human/i);
		const needsYou = screen.getByText(/9,840 wire lacks source documentation/i);
		expect(unmet).toBeInTheDocument();
		expect(needsYou).toBeInTheDocument();
	});

	it("exposes a detail affordance (L3 jump) on needs-you rows", () => {
		renderCanvas();

		expect(screen.getAllByText(/Jump ↓/i).length).toBeGreaterThan(0);
	});
});
