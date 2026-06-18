import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MOCK_REVIEW_SUBJECT } from "../__fixtures__/review-subject.fixture";
import { getReviewCanvas } from "../canvas-registry";

const artifact = MOCK_REVIEW_SUBJECT.artifacts.find((a) => a.kind === "browser_preview")!;

describe("ReviewBrowserPreview canvas", () => {
	it("renders the artifact L1 summary (title)", () => {
		const Canvas = getReviewCanvas(artifact.kind);
		render(<Canvas artifact={artifact} />);

		expect(screen.getByText(artifact.title)).toBeInTheDocument();
	});

	it("shows the tool logo and a safe source link back to the record", () => {
		const Canvas = getReviewCanvas(artifact.kind);
		render(<Canvas artifact={artifact} />);

		expect(screen.getByTitle(artifact.app)).toBeInTheDocument();
		const link = screen.getByRole("link", { name: `Open in ${artifact.app}` });
		expect(link).toHaveAttribute("href", artifact.sourceHref);
		expect(link.textContent).toContain("↗");
	});

	it("exposes a detail affordance from the payload", () => {
		const Canvas = getReviewCanvas(artifact.kind);
		render(<Canvas artifact={artifact} />);

		expect(screen.getByRole("button", { name: /Reload preview/i })).toBeInTheDocument();
	});
});
