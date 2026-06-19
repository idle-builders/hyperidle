import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MOCK_REVIEW_SUBJECT } from "../__fixtures__/review-subject.fixture";
import { getReviewCanvas } from "../canvas-registry";
import type { BrowserPreviewPayload, ReviewArtifact } from "../review-artifact";

const artifact = MOCK_REVIEW_SUBJECT.artifacts.find(
	(a) => a.kind === "browser_preview",
)! as ReviewArtifact<BrowserPreviewPayload>;

function renderCanvas(a: ReviewArtifact = artifact) {
	const Canvas = getReviewCanvas(a.kind);
	return render(<Canvas artifact={a} />);
}

describe("ReviewBrowserPreview canvas", () => {
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

	it("exposes a detail affordance from the payload", () => {
		renderCanvas();

		expect(screen.getByRole("button", { name: /Reload preview/i })).toBeInTheDocument();
	});

	it("renders a clickable Open link for a safe payload URL", () => {
		renderCanvas();

		const openLink = screen.getByRole("link", { name: /Open preview/i });
		expect(openLink).toHaveAttribute("href", artifact.payload.url);
	});

	it("renders a disabled Open span for an unsafe payload URL", () => {
		renderCanvas({
			...artifact,
			payload: { ...artifact.payload, url: "javascript:alert(1)" },
		});

		expect(screen.queryByRole("link", { name: /Open preview/i })).not.toBeInTheDocument();
		expect(screen.getByText("Open")).toBeInTheDocument();
	});
});
