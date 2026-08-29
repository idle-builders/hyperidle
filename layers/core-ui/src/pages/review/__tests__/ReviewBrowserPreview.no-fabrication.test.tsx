// ReviewBrowserPreview must render only what its payload supplies.
//
// `BrowserPreviewPayload` is `{url, title, previewBody}` — nothing else. An
// earlier mapper invented a fixed nav bar, a "Solo / $19/mo" pricing tier, and
// reused `previewBody` twice (subhead AND footer). The view itself hardcoded
// a second tier badge, "Founder", that the mapper's own tier ("Solo") never
// named.
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { getReviewCanvas } from "../canvas-registry";
import type { BrowserPreviewPayload, ReviewArtifact } from "../review-artifact";
import { assertNoFabrication, domText } from "./no-fabrication";

const Canvas = getReviewCanvas("browser_preview");

const ENVELOPE = {
	id: "artifact:zx-browser-1",
	tool: "zx-tool-browser",
	app: "Zx App Browser",
	sourceHref: "https://example.com/zx-browser-record",
	title: "Zx Browser Record Title",
} as const;

function artifactWith(payload: Partial<BrowserPreviewPayload>): ReviewArtifact<unknown> {
	return { ...ENVELOPE, kind: "browser_preview", payload };
}

const SENTINEL_PAYLOAD: BrowserPreviewPayload = {
	url: "https://zx-preview.example.com/zx-path",
	title: "Zx Deployed Page Headline",
	previewBody: "Zx preview body sentence about the deployed page",
};

// Fixed interface chrome: review-frame verdict controls, reused across every
// preview regardless of what page is under review. "Open"/"in" is
// CanvasSourceHeader's own "Open in {app}" jump-off link — untouched shared
// chrome, present verbatim in every sibling no-fabrication CHROME list
// (ReviewMetricsMoved, ReviewBatch, ReviewCodeDiff, ReviewFieldChangeSet,
// ReviewRenderedInContext, ReviewActionOperation all include both tokens).
const CHROME = ["Approve", "Request", "changes", "Reload", "preview", "Open", "in"];

describe("ReviewBrowserPreview — no fabrication", () => {
	it("does not invent a nav bar the payload never supplied", () => {
		render(<Canvas artifact={artifactWith(SENTINEL_PAYLOAD)} />);

		for (const link of ["Product", "Pricing", "Docs", "Changelog"]) {
			expect(screen.queryByText(link)).not.toBeInTheDocument();
		}
	});

	it("does not invent a pricing tier the payload never supplied", () => {
		render(<Canvas artifact={artifactWith(SENTINEL_PAYLOAD)} />);

		expect(screen.queryByText("Solo")).not.toBeInTheDocument();
		expect(screen.queryByText("Founder")).not.toBeInTheDocument();
		expect(screen.queryByText("$19")).not.toBeInTheDocument();
		expect(screen.queryByText(/\/mo/)).not.toBeInTheDocument();
	});

	it("renders previewBody once, not duplicated as both subhead and footer", () => {
		render(<Canvas artifact={artifactWith(SENTINEL_PAYLOAD)} />);

		expect(screen.getAllByText(SENTINEL_PAYLOAD.previewBody)).toHaveLength(1);
	});

	it("renders only what the payload supplies, chrome aside", () => {
		const { container } = render(<Canvas artifact={artifactWith(SENTINEL_PAYLOAD)} />);

		// `title` legitimately backs both the page's brand label and its headline
		// (mapBrowserPayload:483,485) — appearing twice here is not a fabrication.
		expect(screen.getAllByText(SENTINEL_PAYLOAD.title).length).toBeGreaterThan(0);
		// previewBody's own duplication is asserted separately above; here it's
		// enough that it appears at all.
		expect(screen.getAllByText(SENTINEL_PAYLOAD.previewBody).length).toBeGreaterThan(0);
		expect(screen.getByText(SENTINEL_PAYLOAD.url)).toBeInTheDocument();

		assertNoFabrication(domText(container), {
			supplied: [
				ENVELOPE.app,
				ENVELOPE.title,
				SENTINEL_PAYLOAD.url,
				SENTINEL_PAYLOAD.title,
				SENTINEL_PAYLOAD.previewBody,
			],
			chrome: CHROME,
			derived: ["Z"], // ToolLogo's neutral monogram for the unrecognized "zx-tool-browser" id
		});
	});

	it("falls back to the safe unknown-canvas, not the pricing-page fixture, on a malformed payload", () => {
		render(<Canvas artifact={artifactWith({})} />);

		expect(screen.getByTestId("review-unknown-canvas")).toBeInTheDocument();
		expect(screen.queryByText("Solo")).not.toBeInTheDocument();
	});
});
