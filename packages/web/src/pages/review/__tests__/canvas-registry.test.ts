import { describe, expect, it } from "vitest";
import { getReviewCanvas } from "../canvas-registry";
import { ReviewActionOperation } from "../ReviewActionOperation";
import { ReviewBatch } from "../ReviewBatch";
import { ReviewBrowserPreview } from "../ReviewBrowserPreview";
import { ReviewCodeDiff } from "../ReviewCodeDiff";
import { ReviewFieldChangeSet } from "../ReviewFieldChangeSet";
import { ReviewMetricsMoved } from "../ReviewMetricsMoved";
import { ReviewOutcomeSummary } from "../ReviewOutcomeSummary";
import { ReviewRenderedInContext } from "../ReviewRenderedInContext";
import { ReviewUnknownCanvas } from "../ReviewUnknownCanvas";
import { ReviewVisualDiff } from "../ReviewVisualDiff";
import type { ReviewCanvasComponent } from "../review-artifact";

describe("getReviewCanvas", () => {
	it("maps outcome_summary to ReviewOutcomeSummary", () => {
		expect(getReviewCanvas("outcome_summary")).toBe(ReviewOutcomeSummary);
	});

	it("maps field_change_set to ReviewFieldChangeSet", () => {
		expect(getReviewCanvas("field_change_set")).toBe(ReviewFieldChangeSet);
	});

	it("maps action_operation to ReviewActionOperation", () => {
		expect(getReviewCanvas("action_operation")).toBe(ReviewActionOperation);
	});

	it("maps rendered_in_context to ReviewRenderedInContext", () => {
		expect(getReviewCanvas("rendered_in_context")).toBe(ReviewRenderedInContext);
	});

	it("maps metrics_moved to ReviewMetricsMoved", () => {
		expect(getReviewCanvas("metrics_moved")).toBe(ReviewMetricsMoved);
	});

	it("maps visual_diff to ReviewVisualDiff", () => {
		expect(getReviewCanvas("visual_diff")).toBe(ReviewVisualDiff);
	});

	it("maps code_diff to ReviewCodeDiff", () => {
		expect(getReviewCanvas("code_diff")).toBe(ReviewCodeDiff);
	});

	it("maps batch to ReviewBatch", () => {
		expect(getReviewCanvas("batch")).toBe(ReviewBatch);
	});

	it("maps browser_preview to ReviewBrowserPreview", () => {
		expect(getReviewCanvas("browser_preview")).toBe(ReviewBrowserPreview);
	});

	it("falls back to ReviewUnknownCanvas for an unknown kind", () => {
		expect(getReviewCanvas("totally_unknown_kind")).toBe(ReviewUnknownCanvas);
	});

	it("returns the same component instance for repeated lookups", () => {
		const first = getReviewCanvas("code_diff");
		const second = getReviewCanvas("code_diff");
		expect(second).toBe(first);
	});

	it("type-checks as a ReviewCanvasComponent", () => {
		const Canvas: ReviewCanvasComponent = getReviewCanvas("outcome_summary");
		expect(Canvas).toBeDefined();
	});
});
