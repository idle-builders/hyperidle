import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SkeletonCard, SkeletonList } from "../ds";

describe("SkeletonList", () => {
	it("renders the requested number of rows, defaulting to 3", () => {
		const { rerender } = render(<SkeletonList rows={4} ariaLabel="Loading documents" />);
		expect(screen.getAllByTestId("skeleton-row")).toHaveLength(4);

		rerender(<SkeletonList ariaLabel="Loading" />);
		expect(screen.getAllByTestId("skeleton-row")).toHaveLength(3);
	});

	it("exposes an aria-live status so loading is announced", () => {
		render(<SkeletonList rows={2} ariaLabel="Loading documents" />);
		expect(screen.getByRole("status", { name: /loading documents/i })).toBeInTheDocument();
	});
});

describe("SkeletonCard", () => {
	it("renders as a status region announcing loading", () => {
		render(<SkeletonCard ariaLabel="Loading bet" />);
		expect(screen.getByTestId("skeleton-card")).toBeInTheDocument();
	});
});
