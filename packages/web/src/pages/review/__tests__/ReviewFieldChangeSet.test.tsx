import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MOCK_REVIEW_SUBJECT } from "../__fixtures__/review-subject.fixture";
import { getReviewCanvas } from "../canvas-registry";
import type { FieldChangeSetPayload, ReviewArtifact } from "../review-artifact";

const artifact = MOCK_REVIEW_SUBJECT.artifacts.find(
	(a) => a.kind === "field_change_set",
)! as ReviewArtifact<FieldChangeSetPayload>;

function renderCanvas() {
	const Canvas = getReviewCanvas(artifact.kind);
	return render(<Canvas artifact={artifact} />);
}

describe("ReviewFieldChangeSet canvas", () => {
	it("renders the artifact record label (L1)", () => {
		renderCanvas();

		expect(screen.getByText(artifact.payload.recordLabel)).toBeInTheDocument();
	});

	it("shows the tool logo and a safe source link back to the record", () => {
		renderCanvas();

		expect(screen.getByTitle(artifact.app)).toBeInTheDocument();
		const link = screen.getByRole("link", { name: `Open in ${artifact.app}` });
		expect(link).toHaveAttribute("href", artifact.sourceHref);
		expect(link.textContent).toContain("↗");
	});

	it("renders the changed field rows (L2)", () => {
		renderCanvas();

		for (const field of artifact.payload.fields) {
			expect(screen.getByText(field.label)).toBeInTheDocument();
		}
	});

	it("floats the needs-you field to the top of the grid", () => {
		renderCanvas();

		const labels = screen.getAllByText(/Amount|Stage|Close date|Next step|Contact/);
		expect(labels[0]?.textContent).toBe("Amount");
		expect(screen.getByText(/needs you/i)).toBeInTheDocument();
	});

	it("exposes per-field source provenance (L3)", () => {
		renderCanvas();

		expect(screen.getAllByRole("button", { name: /Source/i }).length).toBeGreaterThan(0);
	});
});
