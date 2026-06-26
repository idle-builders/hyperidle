import { CodeDeltaRenderer } from "@hyperidle/design-system";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MOCK_REVIEW_SUBJECT } from "../__fixtures__/review-subject.fixture";
import { getReviewCanvas } from "../canvas-registry";
import type { CodeDiffPayload, ReviewArtifact } from "../review-artifact";

const artifact = MOCK_REVIEW_SUBJECT.artifacts.find(
	(a) => a.kind === "code_diff",
)! as ReviewArtifact<CodeDiffPayload>;

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
		expect(screen.getByText(/const promo = await promos\.find\(evt\.code\);/)).toBeInTheDocument();
	});

	// ── K2b inverse-proof: ReviewCodeDiff composes the DS CodeDeltaRenderer slot seam ──
	// This test verifies the C1 wiring is real. It will go RED if FileDiff reverts to its
	// own hand-rolled hunk/line DOM and stops using CodeDeltaRenderer.
	//
	// Proof strategy: CodeDeltaRenderer (the DS core) is what emits `data-diff-type`
	// attributes and the `aria-label="Code diff: <file>"` on the <pre> element.
	// If FileDiff stops composing the DS core these attributes vanish from the DOM.
	it("K2b — FileDiff delegates structure to DS CodeDeltaRenderer (diff-type attrs + aria-label present)", () => {
		// Confirm CodeDeltaRenderer is exported from the DS (import succeeds).
		expect(CodeDeltaRenderer).toBeDefined();

		const { container } = renderCanvas();

		// The DS CodeDeltaRenderer emits data-diff-type on each diff line div.
		// The review chrome's slot wiring is the only path that produces this in FileDiff.
		const addLines = container.querySelectorAll('[data-diff-type="add"]');
		const delLines = container.querySelectorAll('[data-diff-type="del"]');
		expect(addLines.length).toBeGreaterThan(0);
		expect(delLines.length).toBeGreaterThan(0);

		// CodeDeltaRenderer renders <pre aria-label="Code diff: <file>"> — the review
		// chrome's hand-rolled version used a plain <div>, not a labelled <pre>.
		// This label is structural proof that CodeDeltaRenderer owns the diff structure.
		const preDiff = container.querySelector('pre[aria-label^="Code diff:"]');
		expect(preDiff).not.toBeNull();
	});
});
