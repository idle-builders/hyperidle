import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MOCK_REVIEW_SUBJECT } from "../__fixtures__/review-subject.fixture";
import { getReviewCanvas } from "../canvas-registry";
import type { ReviewArtifact, VisualDiffPayload } from "../review-artifact";

const artifact = MOCK_REVIEW_SUBJECT.artifacts.find(
	(a) => a.kind === "visual_diff",
)! as ReviewArtifact<VisualDiffPayload>;

function renderCanvas() {
	const Canvas = getReviewCanvas(artifact.kind);
	return render(<Canvas artifact={artifact} />);
}

describe("ReviewVisualDiff canvas", () => {
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

	it("renders the side-by-side renders and region count (L2)", () => {
		renderCanvas();

		expect(screen.getByText("Design")).toBeInTheDocument();
		expect(screen.getByText("Build")).toBeInTheDocument();
		expect(
			screen.getByText(new RegExp(`${artifact.payload.diffRegions.length} regions differ`, "i")),
		).toBeInTheDocument();
	});

	it("lists the differing regions (L3)", () => {
		renderCanvas();

		for (const region of artifact.payload.diffRegions) {
			expect(screen.getByText(region.label)).toBeInTheDocument();
		}
	});

	it("exposes a compare-mode toggle affordance", () => {
		renderCanvas();

		expect(screen.getByRole("tab", { name: /Side-by-side/i })).toBeInTheDocument();
		expect(screen.getByRole("tab", { name: /Overlay/i })).toBeInTheDocument();
	});
});
