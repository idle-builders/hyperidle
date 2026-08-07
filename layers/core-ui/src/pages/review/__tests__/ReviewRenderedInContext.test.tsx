import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MOCK_REVIEW_SUBJECT } from "../__fixtures__/review-subject.fixture";
import { getReviewCanvas } from "../canvas-registry";
import type { RenderedInContextPayload, ReviewArtifact } from "../review-artifact";

const artifact = MOCK_REVIEW_SUBJECT.artifacts.find(
	(a) => a.kind === "rendered_in_context",
)! as ReviewArtifact<RenderedInContextPayload>;

function renderCanvas() {
	const Canvas = getReviewCanvas(artifact.kind);
	return render(<Canvas artifact={artifact} />);
}

describe("ReviewRenderedInContext canvas", () => {
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

	it("renders the inbox row and email body (L2)", () => {
		renderCanvas();

		expect(screen.getByLabelText(/Inbox preview/i)).toBeInTheDocument();
		expect(screen.getByText(artifact.payload.inboxRow.subject)).toBeInTheDocument();
		expect(screen.getAllByText(artifact.payload.body).length).toBeGreaterThan(0);
	});

	it("exposes the flags and send-plan detail affordance (L3)", () => {
		renderCanvas();

		expect(screen.getByLabelText(/Flags and send plan/i)).toBeInTheDocument();
		expect(screen.getByText(/Set up in under 5 minutes/i)).toBeInTheDocument();
	});
});
