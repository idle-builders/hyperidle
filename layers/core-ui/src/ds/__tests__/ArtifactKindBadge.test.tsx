/**
 * UI-108 — ArtifactKindBadge: "unknown" kind renders "OTHER", not "UNKNOWN".
 *
 * The badge always uses the `uppercase` CSS class, so the rendered text is
 * what kindLabel() returns (CSS uppercases it). For "unknown" the friendly
 * label is "Other" → CSS renders as "OTHER".
 */
// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ArtifactKindBadge } from "../ArtifactKindBadge.js";

describe("ArtifactKindBadge", () => {
	it('renders "code_diff" kind with underscore→space and uppercase text content', () => {
		render(<ArtifactKindBadge kind="code_diff" />);
		// kindLabel("code_diff") → "CODE DIFF" (uppercase in text content AND CSS uppercase class)
		expect(screen.getByText("CODE DIFF")).toBeDefined();
	});

	it('renders "unknown" kind as "Other" (friendly label, not the raw machine string)', () => {
		render(<ArtifactKindBadge kind="unknown" />);
		// Should NOT render "UNKNOWN" (the old machine string)
		expect(screen.queryByText("UNKNOWN")).toBeNull();
		// Should render "Other" — CSS uppercase renders it visually as "OTHER"
		expect(screen.getByText("Other")).toBeDefined();
	});

	it('renders "text" kind as uppercase "TEXT"', () => {
		render(<ArtifactKindBadge kind="text" />);
		// kindLabel("text") → "TEXT"
		expect(screen.getByText("TEXT")).toBeDefined();
	});
});
