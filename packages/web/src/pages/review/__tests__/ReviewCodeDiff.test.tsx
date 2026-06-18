import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MOCK_REVIEW_SUBJECT } from "../__fixtures__/review-subject.fixture";
import { getReviewCanvas } from "../canvas-registry";

const artifact = MOCK_REVIEW_SUBJECT.artifacts.find((a) => a.kind === "code_diff")!;

function renderCanvas() {
	const Canvas = getReviewCanvas(artifact.kind);
	return render(<Canvas artifact={artifact} />);
}

describe("ReviewCodeDiff canvas", () => {
	it("renders the artifact title and the PR summary (L1)", () => {
		renderCanvas();

		expect(screen.getByText(artifact.title)).toBeInTheDocument();
		expect(screen.getByText(artifact.payload.description)).toBeInTheDocument();
	});

	it("shows the tool logo and a safe source link back to the record", () => {
		renderCanvas();

		expect(screen.getByTitle(artifact.app)).toBeInTheDocument();
		const link = screen.getByRole("link", { name: `Open in ${artifact.app}` });
		expect(link).toHaveAttribute("href", artifact.sourceHref);
		expect(link.textContent).toContain("↗");
	});

	it("orders logic files before test files", () => {
		renderCanvas();

		const logicFile = screen.getByText(/promo-webhook\.ts/);
		const testFile = screen.getByText(/promo\.expired\.test\.ts/);
		expect(logicFile.compareDocumentPosition(testFile) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
			Node.DOCUMENT_POSITION_FOLLOWING,
		);
	});

	it("renders the CI checks row inline", () => {
		renderCanvas();

		expect(screen.getByText("All checks passed")).toBeInTheDocument();
		for (const check of artifact.payload.checks) {
			expect(screen.getByText(check)).toBeInTheDocument();
		}
	});

	it("renders the total change badge from payload counts", () => {
		renderCanvas();

		// files: 28+19+44 added + trivia 49 = 140; removed: 6+2+0 + 23 = 31
		expect(screen.getByText("+140")).toBeInTheDocument();
		expect(screen.getByText("−31")).toBeInTheDocument();
	});

	it("collapses the minor/generated trivia band by default", () => {
		renderCanvas();

		const trivia = screen.getByRole("button", {
			name: /files · OpenAPI regen \+ lockfile \+ formatting/i,
		});
		expect(trivia).toHaveAttribute("aria-expanded", "false");
	});

	it("expands the top logic file and renders its hunks (L3)", () => {
		renderCanvas();

		expect(
			screen.getByText(/@@ -116,9 \+116,18 @@ export async function onPromoApplied/),
		).toBeInTheDocument();
		expect(
			screen.getByText(/const promo = await promos\.find\(evt\.code\);/),
		).toBeInTheDocument();
	});
});
